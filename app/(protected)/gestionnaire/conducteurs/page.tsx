"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { C, statusColor, statusLabel } from "@/lib/constants";
import { Badge, Avatar, Card, InfoBox, Btn, Modal, TabBar } from "@/components/ui";
import type { Conducteur, Circuit, Vehicule } from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────
const isoToday   = () => new Date().toISOString().slice(0, 10);
const fd         = (d?: string | null) => d ? new Date(d).toLocaleDateString("fr-CH") : "—";
const fmtDTLong  = (d: string) => {
  const dt = new Date(d);
  const date = dt.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const h = String(dt.getHours()).padStart(2, "0");
  const m = String(dt.getMinutes()).padStart(2, "0");
  return `${date} à ${h}h${m}`;
};

function genPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "@#$%!";
  const all = upper + lower + digits + special;
  let pwd = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];
  for (let i = 0; i < 6; i++) pwd.push(all[Math.floor(Math.random() * all.length)]);
  return pwd.sort(() => Math.random() - 0.5).join("");
}

const STATUTS = ["disponible","en_service","en_attente","absent","termine"] as const;

interface ServiceLog {
  id: number;
  date_service: string;
  circuit_id?: string;
  circuit?: { nom: string; emoji: string; num: string };
  vehicule_id?: string;
  vehicule?: { plaque: string };
  status: string;
  is_replacement: boolean;
  replacement_name?: string;
  notes?: string;
  created_at: string;
}
interface AbsenceCond {
  id: number;
  date_absence: string;
  motif?: string;
  status: string;
  remplacant?: { prenom: string; nom: string };
  circuit?: { nom: string; emoji: string };
}

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: `1px solid ${C.gray200}`, fontSize: 13,
  color: C.gray800, boxSizing: "border-box",
};

// ── DriverForm ────────────────────────────────────────────────────────────────
function DriverForm({ init, circuits, vehicules, onSave, onCancel, saving }: {
  init: Partial<Conducteur>; circuits: Circuit[]; vehicules: Vehicule[];
  onSave: (d: Partial<Conducteur>) => void; onCancel: () => void; saving: boolean;
}) {
  const [f, setF] = useState<Partial<Conducteur>>({ status: "disponible", ...init });
  const set = (k: string, v: unknown) => setF(p => ({ ...p, [k]: v }));
  const field = (label: string, key: string, type = "text", ph = "") => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600,
        textTransform: "uppercase", marginBottom: 4 }}>{label}</label>
      <input type={type} value={(f as Record<string,string>)[key] ?? ""} placeholder={ph}
        onChange={e => set(key, e.target.value)} style={inp} />
    </div>
  );
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
        <div>{field("Nom", "nom")}</div>
        <div>{field("Prénom", "prenom")}</div>
        <div>{field("Téléphone", "tel", "tel", "079 000 00 00")}</div>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600,
            textTransform: "uppercase", marginBottom: 4 }}>Statut</label>
          <select value={f.status ?? "disponible"} onChange={e => set("status", e.target.value)} style={inp}>
            {STATUTS.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </div>
        <div>{field("Permis (ex: B,D)", "permis")}</div>
        <div>{field("Validité permis", "permis_exp", "date")}</div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600,
          textTransform: "uppercase", marginBottom: 4 }}>Circuit assigné</label>
        <select value={f.circuit_id ?? ""} onChange={e => set("circuit_id", e.target.value || null)} style={inp}>
          <option value="">— Aucun —</option>
          {circuits.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.num}-{c.nom} ({c.cercle?.nom})</option>)}
        </select>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600,
          textTransform: "uppercase", marginBottom: 4 }}>Véhicule assigné</label>
        <select value={f.vehicule_id ?? ""} onChange={e => set("vehicule_id", e.target.value || null)} style={inp}>
          <option value="">— Aucun —</option>
          {vehicules.map(v => <option key={v.id} value={v.id}>{v.plaque} · {v.marque} {v.modele}</option>)}
        </select>
      </div>
      {f.status === "absent" && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600,
            textTransform: "uppercase", marginBottom: 4 }}>Motif absence</label>
          <input value={f.absence_motif ?? ""} onChange={e => set("absence_motif", e.target.value)} style={inp} />
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600,
          textTransform: "uppercase", marginBottom: 4 }}>Initiales (ex: JD)</label>
        <input value={f.photo_initials ?? ""} maxLength={4}
          onChange={e => set("photo_initials", e.target.value.toUpperCase().slice(0,4))}
          style={{ ...inp, width: 80 }} />
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <Btn full onClick={() => onSave(f)} disabled={saving || !f.nom || !f.prenom} color={C.green}>
          {saving ? "Enregistrement…" : "✅ Enregistrer"}
        </Btn>
        <Btn outline onClick={onCancel} color={C.gray600}>Annuler</Btn>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ConducteursPage() {
  const sb = createClient();
  const [drivers,   setDrivers]   = useState<Conducteur[]>([]);
  const [circuits,  setCircuits]  = useState<Circuit[]>([]);
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);
  const [sel,       setSel]       = useState<number | null>(null);
  const [tab,       setTab]       = useState("infos");
  const [search,    setSearch]    = useState("");
  const [filterSt,  setFilterSt]  = useState("all");
  const [editModal, setEditModal] = useState(false);
  const [addModal,  setAddModal]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [loading,   setLoading]   = useState(true);

  // Historique
  const [logs,    setLogs]    = useState<ServiceLog[]>([]);
  const [absences,setAbsences]= useState<AbsenceCond[]>([]);
  const [histYear,setHistYear]= useState("");

  // Profile + mot de passe
  const [profile,   setProfile]   = useState<{ id: string; role: string } | null>(null);
  const [genPwd,    setGenPwd]    = useState("");
  const [pwdCopied, setPwdCopied] = useState(false);
  const [pwdSet,    setPwdSet]    = useState(false);
  const [pwdBusy,   setPwdBusy]   = useState(false);

  const fetchAll = useCallback(async () => {
    const [drv, cir, veh] = await Promise.all([
      sb.from("conducteurs")
        .select("*,circuit:circuits(*,cercle:cercles_scolaires(*)),vehicule:vehicules(*),cercle:cercles_scolaires(*)")
        .order("nom"),
      sb.from("circuits").select("*,cercle:cercles_scolaires(*)").order("num"),
      sb.from("vehicules").select("*").order("plaque"),
    ]);
    setDrivers(drv.data ?? []);
    setCircuits(cir.data ?? []);
    setVehicules(veh.data ?? []);
    setLoading(false);
  }, [sb]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fetchHistory = useCallback(async (driverId: number) => {
    const year = histYear || new Date().getFullYear().toString();
    const since = `${year}-01-01`;
    const until = `${year}-12-31`;
    const [sl, ac, prof] = await Promise.all([
      sb.from("service_logs")
        .select("*,circuit:circuits(nom,emoji,num),vehicule:vehicules(plaque)")
        .eq("conducteur_id", driverId)
        .gte("date_service", since).lte("date_service", until)
        .order("date_service", { ascending: false }),
      sb.from("absences_conducteurs")
        .select("*,remplacant:conducteurs!remplacant_id(prenom,nom),circuit:circuits(nom,emoji)")
        .eq("conducteur_id", driverId)
        .order("date_absence", { ascending: false }),
      sb.from("profiles").select("id,role").eq("conducteur_id", driverId).single(),
    ]);
    setLogs(sl.data ?? []);
    setAbsences(ac.data ?? []);
    setProfile(prof.data ?? null);
  }, [sb, histYear]);

  useEffect(() => {
    if (sel !== null) fetchHistory(sel);
  }, [sel, fetchHistory]);

  const handleSave = async (form: Partial<Conducteur>) => {
    setSaving(true);
    if (sel) {
      await sb.from("conducteurs").update({
        nom: form.nom, prenom: form.prenom, tel: form.tel || null,
        permis: form.permis || null, permis_exp: form.permis_exp || null,
        circuit_id: form.circuit_id || null, vehicule_id: form.vehicule_id || null,
        status: form.status,
        absence_motif: form.status === "absent" ? (form.absence_motif || null) : null,
        photo_initials: form.photo_initials || ((form.nom?.[0] ?? "").toUpperCase() + (form.prenom?.[0] ?? "").toUpperCase()),
      }).eq("id", sel);
    }
    await fetchAll();
    setSaving(false);
    setEditModal(false);
  };

  const handleAdd = async (form: Partial<Conducteur>) => {
    setSaving(true);
    await sb.from("conducteurs").insert({
      nom: form.nom!, prenom: form.prenom!, tel: form.tel || null,
      affectation: "Scolaire",
      permis: form.permis || null, permis_exp: form.permis_exp || null,
      circuit_id: form.circuit_id || null, vehicule_id: form.vehicule_id || null,
      status: form.status ?? "disponible",
      absence_motif: form.status === "absent" ? (form.absence_motif || null) : null,
      photo_initials: form.photo_initials || ((form.nom?.slice(0,1).toUpperCase() ?? "") + (form.prenom?.slice(0,1).toUpperCase() ?? "")),
      tachygraphe: false,
    });
    await fetchAll();
    setSaving(false);
    setAddModal(false);
  };

  const handleDelete = async () => {
    if (!sel || !confirm("Supprimer ce conducteur ?")) return;
    await sb.from("conducteurs").delete().eq("id", sel);
    setSel(null);
    fetchAll();
  };

  const handleGenPassword = async () => {
    if (!profile) return;
    const pwd = genPassword();
    setGenPwd(pwd);
    setPwdBusy(true);
    const res = await fetch("/api/admin/set-password", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: profile.id, password: pwd }),
    });
    setPwdBusy(false);
    if (res.ok) setPwdSet(true);
  };

  const handleResetPassword = async () => {
    if (!profile || !confirm("Générer un nouveau mot de passe ?")) return;
    setPwdSet(false);
    setGenPwd("");
    await handleGenPassword();
  };

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = drivers.filter(d => {
    const match = `${d.prenom} ${d.nom} ${d.tel ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const stMatch = filterSt === "all" || d.status === filterSt;
    return match && stMatch;
  });

  const d = sel ? drivers.find(x => x.id === sel) : null;

  if (loading) return (
    <div style={{ textAlign: "center", padding: 40, color: C.gray400 }}>Chargement…</div>
  );

  // ── Fiche detail ──────────────────────────────────────────────────────────
  if (sel && d) {
    const circ = circuits.find(c => c.id === d.circuit_id);
    const permisExpireSoon = d.permis_exp && new Date(d.permis_exp) < new Date(Date.now() + 90 * 864e5);
    const years = [...new Set(logs.map(l => l.date_service.slice(0,4)))].sort().reverse();
    const curYear = histYear || new Date().getFullYear().toString();

    // Group logs by month
    const logsByMonth: Record<string, ServiceLog[]> = {};
    logs.forEach(l => {
      const mo = l.date_service.slice(0,7);
      if (!logsByMonth[mo]) logsByMonth[mo] = [];
      logsByMonth[mo].push(l);
    });
    const replacementsDone = logs.filter(l => l.is_replacement);

    return (
      <div>
        {editModal && (
          <Modal title={`Modifier — ${d.prenom} ${d.nom}`} onClose={() => setEditModal(false)}>
            <DriverForm init={d} circuits={circuits} vehicules={vehicules}
              onSave={handleSave} onCancel={() => setEditModal(false)} saving={saving} />
          </Modal>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <button onClick={() => { setSel(null); setTab("infos"); setGenPwd(""); setPwdSet(false); }}
            style={{ background: "none", border: "none", color: C.navyL, cursor: "pointer",
              fontWeight: 700, fontSize: 14, padding: 0 }}>
            ← Tous les conducteurs
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn small onClick={() => setEditModal(true)} color={C.navyL}>✏️ Modifier</Btn>
            <Btn small onClick={handleDelete} color={C.red} outline>🗑 Supprimer</Btn>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 22 }}>

          {/* Left: profil card */}
          <div>
            <Card style={{ padding: 22, marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center", padding: 16,
                background: C.skyL, borderRadius: 12, marginBottom: 18 }}>
                <Avatar initials={d.photo_initials} size={52} />
                <div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: C.navy }}>{d.prenom} {d.nom}</div>
                  <div style={{ fontSize: 12, color: C.gray600, marginTop: 2 }}>{d.tel || "—"} · {d.affectation}</div>
                  <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Badge color={statusColor(d.status) as "green"|"red"|"amber"|"blue"|"gray"}>{statusLabel(d.status)}</Badge>
                    {permisExpireSoon && <Badge color="red">⚠ Permis bientôt</Badge>}
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <InfoBox label="Véhicule"      value={d.vehicule?.plaque} />
                <InfoBox label="Circuit"       value={circ ? `${circ.emoji} ${circ.nom}` : "—"} />
                <InfoBox label="Permis"        value={d.permis || "—"} highlight={permisExpireSoon ? C.red : undefined} />
                <InfoBox label="Validité"      value={d.permis_exp ? fd(d.permis_exp) : "—"} highlight={permisExpireSoon ? C.red : undefined} />
                <InfoBox label="École"         value={circ?.cercle?.nom} />
                <InfoBox label="Tachygraphe"   value={d.tachygraphe ? "Requis" : "Non requis"} />
                {d.absence_motif && <InfoBox label="Motif absence" value={d.absence_motif} full highlight={C.red} />}
              </div>
            </Card>

            {/* Compte conducteur */}
            <Card style={{ padding: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: C.navy, marginBottom: 12 }}>
                Compte conducteur
              </div>
              {profile ? (
                <div>
                  <div style={{ padding: "6px 10px", background: C.greenL, borderRadius: 8,
                    fontSize: 12, color: C.green, fontWeight: 700, marginBottom: 12 }}>
                    ✅ Compte actif (ID: {profile.id.slice(0,8)}…)
                  </div>
                  {pwdSet && genPwd && (
                    <div style={{ background: C.amberL, borderRadius: 10, padding: 12, marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.amber, marginBottom: 6 }}>
                        ⚠ Mot de passe généré — affiché une seule fois
                      </div>
                      <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 900,
                        color: C.navy, letterSpacing: 2, marginBottom: 8 }}>{genPwd}</div>
                      <button onClick={() => { navigator.clipboard.writeText(genPwd); setPwdCopied(true); setTimeout(() => setPwdCopied(false), 2000); }}
                        style={{ fontSize: 12, color: C.navyL, background: "none", border: `1px solid ${C.navyL}`,
                          borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontWeight: 700 }}>
                        {pwdCopied ? "✓ Copié !" : "📋 Copier"}
                      </button>
                    </div>
                  )}
                  {!pwdSet && (
                    <Btn full onClick={handleGenPassword} disabled={pwdBusy} color={C.navyL}>
                      {pwdBusy ? "Génération…" : "🔑 Générer mot de passe"}
                    </Btn>
                  )}
                  {pwdSet && (
                    <Btn full outline onClick={handleResetPassword} disabled={pwdBusy} color={C.amber}>
                      🔄 Nouveau mot de passe
                    </Btn>
                  )}
                </div>
              ) : (
                <div>
                  <div style={{ padding: "6px 10px", background: C.amberL, borderRadius: 8,
                    fontSize: 12, color: C.amber, fontWeight: 700, marginBottom: 10 }}>
                    ⚠ Aucun compte associé
                  </div>
                  <p style={{ fontSize: 12, color: C.gray600, lineHeight: 1.5, margin: 0 }}>
                    Un compte doit être créé via Supabase Auth pour ce conducteur, puis associé à ce profil.
                  </p>
                </div>
              )}
            </Card>
          </div>

          {/* Right: tabs */}
          <Card style={{ padding: 22 }}>
            <TabBar tabs={["infos","absences","remplacements","historique"]} active={tab} onChange={setTab} />

            {tab === "infos" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <InfoBox label="Nom"            value={d.nom} />
                <InfoBox label="Prénom"         value={d.prenom} />
                <InfoBox label="Téléphone"      value={d.tel} />
                <InfoBox label="Affectation"    value={d.affectation} />
                <InfoBox label="Cercle scolaire"value={d.cercle?.nom} full />
                <InfoBox label="Notes"          value={d.notes} full />
              </div>
            )}

            {tab === "absences" && (
              <div>
                <p style={{ fontSize: 13, color: C.gray600, marginBottom: 12 }}>
                  {absences.length} absence(s) enregistrée(s)
                </p>
                {absences.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: C.gray400 }}>
                    <div style={{ fontSize: 36 }}>✅</div>
                    <p style={{ fontWeight: 700, marginTop: 10 }}>Aucune absence</p>
                  </div>
                ) : absences.map(a => {
                  const circ = a.circuit as { nom?: string; emoji?: string } | undefined;
                  const remp = a.remplacant as { prenom?: string; nom?: string } | undefined;
                  return (
                    <div key={a.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.gray100}`,
                      display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: C.gray800 }}>
                          {new Date(a.date_absence).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                        </div>
                        <div style={{ fontSize: 12, color: C.gray600, marginTop: 2 }}>
                          {a.motif ? `Motif : ${a.motif}` : "Motif non renseigné"}
                          {circ?.nom && ` · ${circ.emoji} ${circ.nom}`}
                        </div>
                        {remp?.nom && (
                          <div style={{ fontSize: 12, color: C.green, marginTop: 2, fontWeight: 600 }}>
                            Remplacé par : {remp.prenom} {remp.nom}
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 700,
                        background: a.status === "couvert" ? C.greenL : C.amberL,
                        color: a.status === "couvert" ? C.green : C.amber }}>
                        {a.status === "couvert" ? "✅ Couvert" : "⚠ Non couvert"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === "remplacements" && (
              <div>
                <p style={{ fontSize: 13, color: C.gray600, marginBottom: 12 }}>
                  {replacementsDone.length} remplacement(s) effectué(s)
                </p>
                {replacementsDone.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: C.gray400 }}>
                    <div style={{ fontSize: 36 }}>🔄</div>
                    <p style={{ fontWeight: 700, marginTop: 10 }}>Aucun remplacement effectué</p>
                  </div>
                ) : replacementsDone.map(l => {
                  const circ = l.circuit as { nom?: string; emoji?: string } | undefined;
                  return (
                    <div key={l.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.gray100}` }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: C.gray800 }}>
                        {new Date(l.date_service).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                      </div>
                      <div style={{ fontSize: 12, color: C.gray600, marginTop: 2 }}>
                        A remplacé : {l.replacement_name}
                        {circ?.nom && ` · ${circ.emoji} ${circ.nom}`}
                      </div>
                      {l.notes && <div style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>{l.notes}</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {tab === "historique" && (
              <div>
                {/* Year selector */}
                <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                  {[new Date().getFullYear(), new Date().getFullYear()-1, new Date().getFullYear()-2].map(y => (
                    <button key={y} onClick={() => setHistYear(String(y))}
                      style={{ padding: "5px 14px", borderRadius: 20, border: `1.5px solid ${curYear === String(y) ? C.navyL : C.gray200}`,
                        background: curYear === String(y) ? C.navyL : C.white,
                        color: curYear === String(y) ? C.white : C.gray600,
                        fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                      {y}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: C.gray600, marginBottom: 14 }}>
                  {logs.length} service(s) enregistré(s) en {curYear}
                </p>
                {Object.entries(logsByMonth).sort(([a],[b]) => b.localeCompare(a)).map(([month, mLogs]) => {
                  const [y, m] = month.split("-");
                  const monthLabel = new Date(+y, +m-1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
                  return (
                    <div key={month} style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: C.navy,
                        textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                        {monthLabel}
                      </div>
                      {mLogs.map(l => {
                        const circ = l.circuit as { nom?: string; emoji?: string; num?: string } | undefined;
                        const veh  = l.vehicule as { plaque?: string } | undefined;
                        return (
                          <div key={l.id} style={{ padding: "8px 0", borderBottom: `1px solid ${C.gray100}`,
                            display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: C.gray800 }}>
                                {new Date(l.date_service).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                              </div>
                              <div style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>
                                {l.is_replacement ? `Remplacement — ${l.replacement_name}` : circ?.nom ? `${circ.emoji} ${circ.nom}` : "Service"}
                                {veh?.plaque && ` · ${veh.plaque}`}
                              </div>
                            </div>
                            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 700, flexShrink: 0,
                              background: l.status === "absent" ? C.redL : l.is_replacement ? C.amberL : C.greenL,
                              color: l.status === "absent" ? C.red : l.is_replacement ? C.amber : C.green }}>
                              {l.status === "absent" ? "Absent" : l.is_replacement ? "Remplaçant" : "Service"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                {logs.length === 0 && (
                  <div style={{ textAlign: "center", padding: "40px 0", color: C.gray400 }}>
                    <div style={{ fontSize: 36 }}>📋</div>
                    <p style={{ fontWeight: 700, marginTop: 10 }}>Aucun service enregistré en {curYear}</p>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    );
  }

  // ── Liste ──────────────────────────────────────────────────────────────────
  const absents   = drivers.filter(d => d.status === "absent").length;
  const enService = drivers.filter(d => d.status === "en_service").length;

  return (
    <div>
      {addModal && (
        <Modal title="Ajouter un conducteur" onClose={() => setAddModal(false)}>
          <DriverForm init={{}} circuits={circuits} vehicules={vehicules}
            onSave={handleAdd} onCancel={() => setAddModal(false)} saving={saving} />
        </Modal>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: C.navy, margin: "0 0 4px" }}>
            Conducteurs ({drivers.length})
          </h1>
          <p style={{ fontSize: 13, color: C.gray600, margin: 0 }}>
            {enService} en service · {drivers.filter(d => d.status === "disponible").length} disponibles
            {absents > 0 && <span style={{ color: C.red, marginLeft: 6 }}>· {absents} absent(s)</span>}
          </p>
        </div>
        <Btn onClick={() => setAddModal(true)} color={C.green}>+ Ajouter conducteur</Btn>
      </div>

      {/* Absents en haut */}
      {absents > 0 && (
        <div style={{ background: C.amberL, borderRadius: 12, padding: "12px 16px", marginBottom: 14,
          border: `1px solid #FDE68A` }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.amber, marginBottom: 8 }}>
            ⚠️ {absents} conducteur(s) absent(s) aujourd'hui
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {drivers.filter(d => d.status === "absent").map(d => (
              <button key={d.id} onClick={() => setSel(d.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
                  borderRadius: 10, background: C.white, border: `1px solid #FDE68A`,
                  cursor: "pointer" }}>
                <Avatar initials={d.photo_initials} size={24} color={C.amber} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.gray800 }}>{d.prenom} {d.nom}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search + filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher conducteur…"
          style={{ padding: "9px 14px", borderRadius: 8, border: `1px solid ${C.gray200}`,
            fontSize: 13, outline: "none", width: 260 }} />
        <div style={{ display: "flex", gap: 6 }}>
          {([["all","Tous"],["en_service","En service"],["disponible","Disponible"],["absent","Absent"]] as const).map(([v,l]) => (
            <button key={v} onClick={() => setFilterSt(v)}
              style={{ padding: "5px 12px", borderRadius: 20, border: `1.5px solid ${filterSt === v ? C.navyL : C.gray200}`,
                background: filterSt === v ? C.navyL : C.white, color: filterSt === v ? C.white : C.gray600,
                fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        {filtered.map(d => {
          const circ = circuits.find(c => c.id === d.circuit_id);
          const permisExpireSoon = d.permis_exp && new Date(d.permis_exp) < new Date(Date.now() + 90 * 864e5);
          return (
            <Card key={d.id} onClick={() => setSel(d.id)} style={{ padding: 18 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
                <Avatar initials={d.photo_initials} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: C.gray800,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.prenom} {d.nom}
                  </div>
                  <div style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>{d.tel || "—"}</div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <Badge color={statusColor(d.status) as "green"|"red"|"amber"|"blue"|"gray"}>{statusLabel(d.status)}</Badge>
                {permisExpireSoon && <Badge color="red">⚠ Permis</Badge>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, fontSize: 12 }}>
                {[
                  ["Véhicule", d.vehicule?.plaque || "—"],
                  ["Circuit",  circ ? `${circ.emoji} ${circ.nom}` : "—"],
                  ["Cercle",   d.cercle?.nom || "—"],
                  ["Permis",   d.permis || "—"],
                ].map(([l,v]) => (
                  <div key={l} style={{ background: C.gray50, borderRadius: 6, padding: "6px 9px" }}>
                    <div style={{ fontSize: 9, color: C.gray400, textTransform: "uppercase" }}>{l}</div>
                    <div style={{ fontWeight: 600, color: C.gray800, marginTop: 1 }}>{v}</div>
                  </div>
                ))}
              </div>
              {d.absence_motif && (
                <div style={{ marginTop: 8, fontSize: 11, color: C.red, fontWeight: 600 }}>
                  Absent · {d.absence_motif}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
