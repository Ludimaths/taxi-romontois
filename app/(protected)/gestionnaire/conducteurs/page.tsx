"use client";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { C, statusColor, statusLabel, fmtDate, fmtDateTime, conducteurEmail, isoToday } from "@/lib/constants";
import { Badge, Avatar, Card, InfoBox, Btn, Modal, TabBar } from "@/components/ui";
import { CheckCircle2, AlertTriangle, Pen, Trash2, KeyRound, RefreshCw, Link2, UserPlus, ClipboardCopy, Check, Bus, FileText, Users, CalendarDays, XCircle, Send } from "lucide-react";
import type { Conducteur, Circuit, Vehicule, CongesDemande } from "@/lib/types";



const STATUTS = ["disponible","en_service","en_attente","absent","termine"] as const;

interface ServiceLog {
  id: number;
  date_service: string;
  heure_debut?: string;
  heure_fin?: string;
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

function genPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let p = "";
  for (let i = 0; i < 12; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

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
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Btn>
        <Btn outline onClick={onCancel} color={C.gray600}>Annuler</Btn>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ConducteursPage() {
  const sb = createClient();
  const searchParams = useSearchParams();
  const [drivers,   setDrivers]   = useState<Conducteur[]>([]);
  const [circuits,  setCircuits]  = useState<Circuit[]>([]);
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);
  const [sel,       setSel]       = useState<number | null>(null);
  const [tab,       setTab]       = useState("infos");
  const [search,    setSearch]    = useState("");
  const [filterSt,  setFilterSt]  = useState(() => searchParams.get("status") ?? "all");
  const [editModal, setEditModal] = useState(false);
  const [addModal,  setAddModal]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [loading,   setLoading]   = useState(true);

  // Historique
  const [logs,    setLogs]    = useState<ServiceLog[]>([]);
  const [absences,setAbsences]= useState<AbsenceCond[]>([]);
  const [histYear,setHistYear]= useState("");

  // Profile + mot de passe
  const [profile,      setProfile]      = useState<{ id: string; role: string; photo_url?: string | null } | null>(null);
  const [photoBusy,    setPhotoBusy]    = useState(false);
  const [photoErr,     setPhotoErr]     = useState("");
  const [pwdBusy,      setPwdBusy]      = useState(false);
  const [generatedPwd, setGeneratedPwd] = useState<string | null>(null);
  const [pwdError,     setPwdError]     = useState("");
  const [pwdCopied,    setPwdCopied]    = useState(false);

  // Congés
  const [congesCondu,    setCongesCondu]    = useState<CongesDemande[]>([]);
  const [currentUserId,  setCurrentUserId]  = useState<string | null>(null);
  const [congeRefusId,   setCongeRefusId]   = useState<number | null>(null);
  const [congeRefusMotif,setCongeRefusMotif]= useState("");
  const [congeTransId,   setCongeTransId]   = useState<number | null>(null);
  const [congeTransNote, setCongeTransNote] = useState("");
  const [congesBusy,     setCongesBusy]     = useState(false);

  // Création de compte
  const [createBusy,   setCreateBusy]   = useState(false);
  const [createResult, setCreateResult] = useState<{ email: string } | null>(null);
  const [createError,  setCreateError]  = useState("");
  const [linkBusy,     setLinkBusy]     = useState(false);
  const [linkDone,     setLinkDone]     = useState(false);
  const [linkError,    setLinkError]    = useState("");

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

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, [sb]);

  const fetchHistory = useCallback(async (driverId: number) => {
    const year = histYear || new Date().getFullYear().toString();
    const since = `${year}-01-01`;
    const until = `${year}-12-31`;
    const [sl, ac, prof, cng] = await Promise.all([
      sb.from("service_logs")
        .select("*,circuit:circuits(nom,emoji,num),vehicule:vehicules(plaque)")
        .eq("conducteur_id", driverId)
        .gte("date_service", since).lte("date_service", until)
        .order("date_service", { ascending: false }),
      sb.from("absences_conducteurs")
        .select("*,remplacant:conducteurs!remplacant_id(prenom,nom),circuit:circuits(nom,emoji)")
        .eq("conducteur_id", driverId)
        .order("date_absence", { ascending: false }),
      sb.from("profiles").select("id,role,photo_url").eq("conducteur_id", driverId).single(),
      sb.from("conges_demandes").select("*")
        .eq("conducteur_id", driverId)
        .order("created_at", { ascending: false }),
    ]);
    setLogs(sl.data ?? []);
    setAbsences(ac.data ?? []);
    setProfile(prof.data ?? null);
    setCongesCondu(cng.data ?? []);
  }, [sb, histYear]);

  useEffect(() => {
    if (sel !== null) fetchHistory(sel);
  }, [sel, fetchHistory]);

  useEffect(() => {
    setCreateBusy(false);
    setCreateResult(null);
    setCreateError("");
    setLinkBusy(false);
    setLinkDone(false);
    setLinkError("");
    setGeneratedPwd(null);
    setPwdError("");
    setPwdCopied(false);
    setPhotoErr("");
    setCongesCondu([]);
    setCongeRefusId(null); setCongeRefusMotif("");
    setCongeTransId(null); setCongeTransNote("");
  }, [sel]);

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

  const handleGeneratePassword = async () => {
    if (!profile) return;
    setPwdBusy(true);
    setPwdError("");
    setPwdCopied(false);
    const pwd = genPassword();
    const res = await fetch("/api/admin/set-password", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: profile.id, password: pwd }),
    });
    const json = await res.json().catch(() => ({}));
    setPwdBusy(false);
    if (res.ok) {
      setGeneratedPwd(pwd);
    } else {
      setPwdError(json.error ?? "Impossible de générer le mot de passe");
    }
  };

  const handlePhotoUpload = async (file: File) => {
    if (!sel || !profile) return;
    setPhotoBusy(true);
    setPhotoErr("");
    const path = `conducteur-${sel}.jpg`;
    const { error: upErr } = await sb.storage.from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setPhotoErr(upErr.message);
      setPhotoBusy(false);
      return;
    }
    const { data: pub } = sb.storage.from("avatars").getPublicUrl(path);
    const url = `${pub.publicUrl}?t=${Date.now()}`;
    const { error: updErr } = await sb.from("profiles")
      .update({ photo_url: url }).eq("conducteur_id", sel);
    if (updErr) {
      setPhotoErr(updErr.message);
      setPhotoBusy(false);
      return;
    }
    setProfile(p => p ? { ...p, photo_url: url } : p);
    setPhotoBusy(false);
  };

  const handleCreateAccount = async () => {
    if (!sel) return;
    const drv = drivers.find(x => x.id === sel);
    if (!drv) return;
    setCreateBusy(true);
    setCreateError("");
    setPwdCopied(false);
    const pwd = genPassword();
    const res = await fetch("/api/gestionnaire/create-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conducteurId: drv.id, prenom: drv.prenom, nom: drv.nom, password: pwd }),
    });
    const json = await res.json();
    setCreateBusy(false);
    if (res.ok) {
      setCreateResult({ email: json.email });
      setGeneratedPwd(pwd);
      fetchHistory(drv.id);
    } else {
      const raw = json.error || "Erreur inconnue";
      setCreateError(raw.toLowerCase().includes("already") || raw.toLowerCase().includes("registered")
        ? "Un compte existe déjà avec cet email — cliquez sur 'Lier le compte existant'"
        : raw);
    }
  };

  const handleLinkAccount = async () => {
    if (!sel) return;
    const drv = drivers.find(x => x.id === sel);
    if (!drv) return;
    setLinkBusy(true);
    setLinkError("");
    const res = await fetch("/api/gestionnaire/link-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conducteurId: drv.id, prenom: drv.prenom, nom: drv.nom }),
    });
    const json = await res.json();
    setLinkBusy(false);
    if (res.ok) {
      setCreateError("");
      setLinkDone(true);
      await fetchHistory(drv.id);
    } else {
      setLinkError(json.error || "Erreur liaison inconnue");
    }
  };

  // ── Congés handlers ───────────────────────────────────────────────────────
  async function handleAccepterConge(conge: CongesDemande) {
    if (!sel) return;
    setCongesBusy(true);
    await sb.from("conges_demandes").update({
      statut: "accepte", transmis_par: currentUserId, updated_at: new Date().toISOString(),
    }).eq("id", conge.id);
    await sb.from("alertes").insert({
      type: "conducteur", severity: "normale", driver_id: conge.conducteur_id, read: false,
      message: `Votre congé du ${fmtDate(conge.date_debut)} au ${fmtDate(conge.date_fin)} (${conge.motif}) a été accepté.`,
    });
    await fetchHistory(sel);
    setCongesBusy(false);
  }

  async function handleRefuserConge(conge: CongesDemande) {
    if (!sel || !congeRefusMotif.trim()) return;
    setCongesBusy(true);
    await sb.from("conges_demandes").update({
      statut: "refuse", motif_refus: congeRefusMotif.trim(),
      transmis_par: currentUserId, updated_at: new Date().toISOString(),
    }).eq("id", conge.id);
    await sb.from("alertes").insert({
      type: "conducteur", severity: "haute", driver_id: conge.conducteur_id, read: false,
      message: `Votre demande de congé du ${fmtDate(conge.date_debut)} au ${fmtDate(conge.date_fin)} a été refusée. Motif : ${congeRefusMotif.trim()}`,
    });
    setCongeRefusId(null); setCongeRefusMotif("");
    await fetchHistory(sel);
    setCongesBusy(false);
  }

  async function handleTransmettreConge(conge: CongesDemande) {
    if (!sel) return;
    setCongesBusy(true);
    const drv = drivers.find(x => x.id === sel);
    await sb.from("conges_demandes").update({
      statut: "transmis_admin", transmis_par: currentUserId,
      note_gestionnaire: congeTransNote.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", conge.id);
    await sb.from("alertes").insert({
      type: "rapport_admin", severity: "normale", read: false,
      message: `Congé à valider — ${drv?.prenom} ${drv?.nom} — du ${fmtDate(conge.date_debut)} au ${fmtDate(conge.date_fin)} (${conge.motif})${congeTransNote.trim() ? ` — Note : ${congeTransNote.trim()}` : ""}`,
    });
    await sb.from("alertes").insert({
      type: "conducteur", severity: "normale", driver_id: conge.conducteur_id, read: false,
      message: `Votre demande de congé du ${fmtDate(conge.date_debut)} au ${fmtDate(conge.date_fin)} est transmise à la direction pour validation.`,
    });
    setCongeTransId(null); setCongeTransNote("");
    await fetchHistory(sel);
    setCongesBusy(false);
  }

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
    const isIncomplete = !d.circuit_id || !d.vehicule_id || !d.permis;
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
          <button onClick={() => { setSel(null); setTab("infos"); setGeneratedPwd(null); setCreateResult(null); setCreateError(""); }}
            style={{ background: "none", border: "none", color: C.navyL, cursor: "pointer",
              fontWeight: 700, fontSize: 14, padding: 0 }}>
            ← Tous les conducteurs
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn small onClick={() => setEditModal(true)} color={C.navyL}>Modifier</Btn>
            <Btn small onClick={handleDelete} color={C.red} outline>Supprimer</Btn>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 22 }}>

          {/* Left: profil card */}
          <div>
            <Card style={{ padding: 22, marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center", padding: 16,
                background: C.skyL, borderRadius: 12, marginBottom: 14 }}>
                <Avatar initials={d.photo_initials} size={80} photoUrl={profile?.photo_url} />
                <div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: C.navy }}>{d.prenom} {d.nom}</div>
                  <div style={{ fontSize: 12, color: C.gray600, marginTop: 2 }}>{d.tel || "—"} · {d.affectation}</div>
                  <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Badge color={statusColor(d.status) as "green"|"red"|"amber"|"blue"|"gray"}>{statusLabel(d.status)}</Badge>
                    {isIncomplete && <Badge color="amber">Incomplet</Badge>}
                    {permisExpireSoon && <Badge color="red">Permis bientôt</Badge>}
                  </div>
                </div>
              </div>

              {/* Upload photo (compte requis pour stocker l'URL) */}
              {profile && (
                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.gray200}`,
                    background: C.white, cursor: photoBusy ? "wait" : "pointer",
                    fontSize: 12, fontWeight: 700, color: C.navyL }}>
                    {photoBusy ? "Téléversement…" : (profile.photo_url ? "Changer la photo" : "Ajouter une photo")}
                    <input type="file" accept="image/jpeg,image/png,image/webp"
                      disabled={photoBusy}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); e.target.value = ""; }}
                      style={{ display: "none" }} />
                  </label>
                  {photoErr && (
                    <div style={{ fontSize: 11, color: C.red, marginTop: 6, fontWeight: 600 }}>{photoErr}</div>
                  )}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <InfoBox label="Véhicule"      value={d.vehicule?.plaque} />
                <InfoBox label="Circuit"       value={circ ? `${circ.emoji} ${circ.nom}` : "—"} />
                <InfoBox label="Permis"        value={d.permis || "—"} highlight={permisExpireSoon ? C.red : undefined} />
                <InfoBox label="Validité"      value={d.permis_exp ? fmtDate(d.permis_exp) : "—"} highlight={permisExpireSoon ? C.red : undefined} />
                <InfoBox label="École"         value={circ?.cercle?.nom} />
                <InfoBox label="Tachygraphe"   value={d.tachygraphe ? "Requis" : "Non requis"} />
                {d.absence_motif && <InfoBox label="Motif absence" value={d.absence_motif} full highlight={C.red} />}
              </div>
            </Card>

            {/* Accès conducteur */}
            <Card style={{ padding: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: C.navy, marginBottom: 12,
                textTransform: "uppercase", letterSpacing: 0.5 }}>
                Accès conducteur
              </div>

              {/* Bloc d'affichage du mot de passe généré (une seule fois) */}
              {generatedPwd ? (
                <div>
                  <div style={{ padding: "8px 12px", background: C.greenL, borderRadius: 8,
                    fontSize: 12, color: C.green, fontWeight: 700, marginBottom: 10,
                    display: "flex", alignItems: "center", gap: 6 }}>
                    <CheckCircle2 size={13} /> Mot de passe généré
                  </div>
                  {createResult && (
                    <div style={{ fontSize: 11, color: C.gray600, marginBottom: 8, padding: "4px 10px",
                      background: C.gray50, borderRadius: 6, fontFamily: "monospace" }}>
                      {createResult.email}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                    <code style={{ flex: 1, padding: "10px 12px", background: C.navy, color: C.white,
                      borderRadius: 8, fontSize: 16, fontWeight: 800, letterSpacing: 1,
                      textAlign: "center", fontFamily: "monospace" }}>
                      {generatedPwd}
                    </code>
                    <button onClick={() => {
                        navigator.clipboard?.writeText(generatedPwd);
                        setPwdCopied(true);
                      }}
                      style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.gray200}`,
                        background: C.white, cursor: "pointer", display: "flex", alignItems: "center",
                        gap: 5, fontSize: 12, fontWeight: 700, color: pwdCopied ? C.green : C.navyL }}>
                      {pwdCopied ? <Check size={14} /> : <ClipboardCopy size={14} />}
                      {pwdCopied ? "Copié" : "Copier"}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: C.amber, fontWeight: 600, lineHeight: 1.5,
                    background: C.amberL, borderRadius: 8, padding: "8px 10px" }}>
                    Notez ce mot de passe maintenant, il ne sera plus affiché.
                    Le conducteur devra le changer à la première connexion.
                  </div>
                </div>
              ) : profile ? (
                <div>
                  <div style={{ padding: "6px 10px", background: C.greenL, borderRadius: 8,
                    fontSize: 12, color: C.green, fontWeight: 700, marginBottom: 6,
                    display: "flex", alignItems: "center", gap: 6 }}>
                    <CheckCircle2 size={13} /> Compte actif
                  </div>
                  <div style={{ fontSize: 12, color: C.gray600, marginBottom: 12, padding: "4px 10px",
                    background: C.gray50, borderRadius: 6, fontFamily: "monospace" }}>
                    {conducteurEmail(d.prenom, d.nom)}
                  </div>
                  {pwdError && (
                    <div style={{ padding: "8px 10px", background: C.redL, borderRadius: 8,
                      fontSize: 12, color: C.red, fontWeight: 600, marginBottom: 10,
                      border: `1px solid #FCA5A5` }}>
                      {pwdError}
                    </div>
                  )}
                  <Btn full onClick={handleGeneratePassword} disabled={pwdBusy} color={C.navy}>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      <KeyRound size={14} /> {pwdBusy ? "Génération…" : "Générer un mot de passe"}
                    </span>
                  </Btn>
                </div>
              ) : (
                <div>
                  <div style={{ padding: "6px 10px", background: C.amberL, borderRadius: 8,
                    fontSize: 12, color: C.amber, fontWeight: 700, marginBottom: 10,
                    display: "flex", alignItems: "center", gap: 6 }}>
                    <AlertTriangle size={12} /> Aucun compte lié
                  </div>
                  {createError && (
                    <div style={{ padding: "8px 10px", background: C.redL, borderRadius: 8,
                      fontSize: 12, color: C.red, fontWeight: 600, marginBottom: 10,
                      border: `1px solid #FCA5A5` }}>
                      {createError}
                    </div>
                  )}
                  {createError.includes("existe déjà") || createError.toLowerCase().includes("already") ? (
                    <div>
                      <Btn full onClick={handleLinkAccount} disabled={linkBusy} color={C.amber}>
                        {linkBusy ? "Liaison en cours…" : "Lier le compte existant"}
                      </Btn>
                      {linkDone && (
                        <div style={{ padding: "8px 10px", background: C.greenL, borderRadius: 8,
                          fontSize: 12, color: C.green, fontWeight: 700, marginTop: 8,
                          display: "flex", alignItems: "center", gap: 6 }}>
                          <CheckCircle2 size={13} /> Compte lié
                        </div>
                      )}
                      {linkError && (
                        <div style={{ padding: "8px 10px", background: C.redL, borderRadius: 8,
                          fontSize: 12, color: C.red, fontWeight: 600, marginTop: 8,
                          border: `1px solid #FCA5A5` }}>
                          {linkError}
                        </div>
                      )}
                    </div>
                  ) : (
                    <Btn full onClick={handleCreateAccount} disabled={createBusy} color={C.green}>
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <KeyRound size={14} /> {createBusy ? "Création…" : "Créer le compte + mot de passe"}
                      </span>
                    </Btn>
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* Right: tabs */}
          <Card style={{ padding: 22 }}>
            {congesCondu.filter(c => c.statut === "en_attente").length > 0 && tab !== "congés" && (
              <div style={{ background: C.amberL, borderRadius: 10, padding: "9px 14px", marginBottom: 14,
                fontSize: 13, color: C.amber, fontWeight: 700,
                display: "flex", alignItems: "center", gap: 8, border: `1px solid #FDE68A` }}>
                <AlertTriangle size={14} />
                {congesCondu.filter(c => c.statut === "en_attente").length} demande(s) de congé en attente
                <button onClick={() => setTab("congés")}
                  style={{ marginLeft: "auto", padding: "4px 10px", borderRadius: 6, border: "none",
                    background: C.amber, color: C.white, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                  Voir
                </button>
              </div>
            )}
            <TabBar tabs={["infos","absences","remplacements","services","historique","congés"]} active={tab} onChange={setTab} />

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
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}><CheckCircle2 size={36} color={C.green} /></div>
                    <p style={{ fontWeight: 700, marginTop: 0 }}>Aucune absence</p>
                  </div>
                ) : absences.map(a => {
                  const circ = a.circuit as { nom?: string; emoji?: string } | undefined;
                  const remp = a.remplacant as { prenom?: string; nom?: string } | undefined;
                  return (
                    <div key={a.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.gray100}`,
                      display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: C.gray800 }}>
                          {fmtDate(a.date_absence)}
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
                        {a.status === "couvert" ? "Couvert" : "Non couvert"}
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
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}><RefreshCw size={36} color={C.gray400} /></div>
                    <p style={{ fontWeight: 700, marginTop: 0 }}>Aucun remplacement effectué</p>
                  </div>
                ) : replacementsDone.map(l => {
                  const circ = l.circuit as { nom?: string; emoji?: string } | undefined;
                  return (
                    <div key={l.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.gray100}` }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: C.gray800 }}>
                        {fmtDate(l.date_service)}
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

            {tab === "services" && (() => {
              const services = logs.filter(l => !l.is_replacement && l.status !== "absent");
              return (
                <div>
                  <p style={{ fontSize: 13, color: C.gray600, marginBottom: 14 }}>
                    {services.length} service(s) enregistré(s)
                  </p>
                  {services.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px 0", color: C.gray400 }}>
                      <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}><Bus size={36} color={C.gray400} /></div>
                      <p style={{ fontWeight: 700, marginTop: 0 }}>Aucun service enregistré</p>
                    </div>
                  ) : services.map(l => {
                    const circ = l.circuit as { nom?: string; emoji?: string } | undefined;
                    const veh  = l.vehicule as { plaque?: string } | undefined;
                    const hDeb = l.heure_debut ? String(l.heure_debut).slice(0, 5) : null;
                    const hFin = l.heure_fin   ? String(l.heure_fin).slice(0, 5)   : null;
                    return (
                      <div key={l.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.gray100}`,
                        display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: C.gray800 }}>
                            {fmtDate(l.date_service)}
                          </div>
                          <div style={{ fontSize: 12, color: C.gray600, marginTop: 2 }}>
                            {hDeb && hFin ? `${hDeb} → ${hFin}` : hDeb ? `Début : ${hDeb}` : "Horaire non enregistré"}
                            {circ?.nom && ` · ${circ.emoji} ${circ.nom}`}
                            {veh?.plaque && ` · ${veh.plaque}`}
                          </div>
                        </div>
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 700,
                          flexShrink: 0, background: C.greenL, color: C.green }}>
                          Effectué
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

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
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}><FileText size={36} color={C.gray400} /></div>
                    <p style={{ fontWeight: 700, marginTop: 0 }}>Aucun service enregistré en {curYear}</p>
                  </div>
                )}
              </div>
            )}

            {tab === "congés" && (
              <div>
                {congesCondu.filter(c => c.statut === "en_attente").length > 0 && (
                  <div style={{ background: C.amberL, borderRadius: 10, padding: "9px 14px", marginBottom: 16,
                    fontSize: 13, color: C.amber, fontWeight: 700,
                    display: "flex", alignItems: "center", gap: 8, border: `1px solid #FDE68A` }}>
                    <AlertTriangle size={14} />
                    {congesCondu.filter(c => c.statut === "en_attente").length} demande(s) en attente de traitement
                  </div>
                )}
                {congesCondu.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: C.gray400 }}>
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                      <CalendarDays size={36} color={C.gray400} />
                    </div>
                    <p style={{ fontWeight: 700, marginTop: 0 }}>Aucune demande de congé</p>
                  </div>
                ) : congesCondu.map(conge => {
                  const isRefusing     = congeRefusId  === conge.id;
                  const isTransmitting = congeTransId  === conge.id;
                  const statut   = conge.statut;
                  const statCol  = statut==="accepte"?C.green:statut==="refuse"?C.red:statut==="transmis_admin"?"#2563EB":C.amber;
                  const statBg   = statut==="accepte"?C.greenL:statut==="refuse"?C.redL:statut==="transmis_admin"?"#EFF6FF":C.amberL;
                  const statLbl  = statut==="accepte"?"Accepté":statut==="refuse"?"Refusé":statut==="transmis_admin"?"Transmis direction":"En attente";
                  return (
                    <div key={conge.id} style={{ background: C.white, borderRadius: 14, padding: 16,
                      marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                      borderLeft: `4px solid ${statCol}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between",
                        alignItems: "flex-start", marginBottom: 8, gap: 8 }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14, color: C.navy, marginBottom: 2 }}>
                            {fmtDate(conge.date_debut)} → {fmtDate(conge.date_fin)}
                          </div>
                          <div style={{ fontSize: 12, color: C.gray600 }}>{conge.motif}</div>
                        </div>
                        <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                          background: statBg, color: statCol, flexShrink: 0 }}>
                          {statLbl}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: "#1E293B", lineHeight: 1.5, marginBottom: 8,
                        borderLeft: `2px solid ${C.gray200}`, paddingLeft: 10 }}>
                        {conge.justification}
                      </div>
                      {conge.motif_refus && (
                        <div style={{ background: C.redL, borderRadius: 8, padding: "6px 10px", marginBottom: 8,
                          fontSize: 12, color: C.red, fontWeight: 600 }}>
                          Motif refus : {conge.motif_refus}
                        </div>
                      )}
                      {conge.note_gestionnaire && (
                        <div style={{ background: C.skyL, borderRadius: 8, padding: "6px 10px", marginBottom: 8,
                          fontSize: 12, color: C.navyL, fontStyle: "italic" }}>
                          Votre note : {conge.note_gestionnaire}
                        </div>
                      )}
                      {statut === "en_attente" && !isRefusing && !isTransmitting && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                          <button onClick={() => handleAccepterConge(conge)} disabled={congesBusy}
                            style={{ flex: 1, minWidth: 90, padding: "9px 0", borderRadius: 9, border: "none",
                              background: C.green, color: C.white, fontWeight: 700, fontSize: 13, cursor: "pointer",
                              display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                            <CheckCircle2 size={15} /> Accepter
                          </button>
                          <button onClick={() => { setCongeRefusId(conge.id); setCongeRefusMotif(""); }}
                            style={{ flex: 1, minWidth: 90, padding: "9px 0", borderRadius: 9,
                              border: `1.5px solid ${C.red}`, background: C.white, color: C.red,
                              fontWeight: 700, fontSize: 13, cursor: "pointer",
                              display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                            <XCircle size={15} /> Refuser
                          </button>
                          <button onClick={() => { setCongeTransId(conge.id); setCongeTransNote(""); }}
                            style={{ flex: 1, minWidth: 90, padding: "9px 0", borderRadius: 9,
                              border: "1.5px solid #2563EB", background: C.white, color: "#2563EB",
                              fontWeight: 700, fontSize: 13, cursor: "pointer",
                              display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                            <Send size={15} /> Direction
                          </button>
                        </div>
                      )}
                      {isRefusing && (
                        <div style={{ marginTop: 10 }}>
                          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.red, marginBottom: 6 }}>
                            Motif du refus *
                          </label>
                          <textarea value={congeRefusMotif} onChange={e => setCongeRefusMotif(e.target.value)}
                            rows={2} placeholder="Ex: Période de pointe, effectifs insuffisants…"
                            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, resize: "vertical",
                              border: `1.5px solid ${C.red}`, fontSize: 13, color: C.gray800,
                              background: C.white, boxSizing: "border-box" }} />
                          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            <button onClick={() => handleRefuserConge(conge)}
                              disabled={congesBusy || !congeRefusMotif.trim()}
                              style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: "none",
                                background: congeRefusMotif.trim() ? C.red : C.gray200,
                                color: congeRefusMotif.trim() ? C.white : C.gray400,
                                fontWeight: 700, fontSize: 13,
                                cursor: congeRefusMotif.trim() ? "pointer" : "not-allowed" }}>
                              Confirmer le refus
                            </button>
                            <button onClick={() => setCongeRefusId(null)}
                              style={{ padding: "9px 16px", borderRadius: 9, border: `1px solid ${C.gray200}`,
                                background: C.white, color: C.gray600, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                              Annuler
                            </button>
                          </div>
                        </div>
                      )}
                      {isTransmitting && (
                        <div style={{ marginTop: 10 }}>
                          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#2563EB", marginBottom: 6 }}>
                            Note pour la direction (optionnelle)
                          </label>
                          <textarea value={congeTransNote} onChange={e => setCongeTransNote(e.target.value)}
                            rows={2} placeholder="Contexte, recommandation…"
                            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, resize: "vertical",
                              border: "1.5px solid #2563EB", fontSize: 13, color: C.gray800,
                              background: C.white, boxSizing: "border-box" }} />
                          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            <button onClick={() => handleTransmettreConge(conge)} disabled={congesBusy}
                              style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: "none",
                                background: "#2563EB", color: C.white, fontWeight: 700, fontSize: 13, cursor: "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                              <Send size={15} /> Transmettre à la direction
                            </button>
                            <button onClick={() => setCongeTransId(null)}
                              style={{ padding: "9px 16px", borderRadius: 9, border: `1px solid ${C.gray200}`,
                                background: C.white, color: C.gray600, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                              Annuler
                            </button>
                          </div>
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: C.gray400, marginTop: 8, textAlign: "right" }}>
                        {new Date(conge.created_at).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      </div>
                    </div>
                  );
                })}
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
          <div style={{ fontWeight: 700, fontSize: 13, color: C.amber, marginBottom: 8,
            display: "flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={14} /> {absents} conducteur(s) absent(s) aujourd'hui
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
          const isIncomplete = !d.circuit_id || !d.vehicule_id || !d.permis;
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
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Badge color={statusColor(d.status) as "green"|"red"|"amber"|"blue"|"gray"}>{statusLabel(d.status)}</Badge>
                  {isIncomplete && <Badge color="amber">Incomplet</Badge>}
                </div>
                {permisExpireSoon && <Badge color="red">Permis exp.</Badge>}
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
