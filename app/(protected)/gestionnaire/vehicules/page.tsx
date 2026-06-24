"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { C, fmtDate } from "@/lib/constants";
import { Badge, Card, InfoBox, Btn, Modal, TabBar } from "@/components/ui";
import type { Vehicule, Circuit, Conducteur } from "@/lib/types";
import { QRCodeSVG } from "qrcode.react";

// ── Status mapping ─────────────────────────────────────────────────────────────
const ETATS = ["bon","attention","atelier"] as const;
const stateColor = (s: string): "green"|"amber"|"red"|"blue"|"gray" =>
  ({ bon: "green", atelier: "red", attention: "amber" }[s] as "green"|"red"|"amber") ?? "gray";
const stateLabel = (s: string) =>
  ({ bon: "En service", atelier: "En réparation", attention: "Attention requise" }[s] ?? s);

// CT/assurance warnings
const daysBetween = (d?: string | null) => {
  if (!d) return 9999;
  const parts = d.split(".");
  if (parts.length !== 2) return 9999;
  const [mm, yy] = parts;
  const dt = new Date(+yy, +mm - 1, 1);
  return Math.floor((dt.getTime() - Date.now()) / 864e5);
};
const alertCT = (v: Vehicule) => daysBetween(v.ct_date) < 60;
const alertAss = (v: Vehicule) => daysBetween(v.assurance_date) < 60;


interface Reparation {
  id: number;
  description: string;
  statut: string;
  montant?: number;
  created_at: string;
  notes?: string;
}

const REP_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  receptionne:            { label: "Réceptionné",             color: C.amber,   bg: C.amberL },
  en_attente_validation:  { label: "Attente validation",      color: C.amber,   bg: C.amberL },
  en_attente_piece:       { label: "Attente pièce",           color: C.navyL,   bg: C.skyL   },
  en_reparation:          { label: "En réparation",           color: C.red,     bg: C.redL   },
  repare:                 { label: "Réparé",                  color: C.green,   bg: C.greenL },
  remis_en_circulation:   { label: "Remis en circulation",    color: C.green,   bg: C.greenL },
};
const ACTIVE_REP = ["receptionne","en_attente_validation","en_attente_piece","en_reparation","repare"];

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: `1px solid ${C.gray200}`, fontSize: 13, color: C.gray800, boxSizing: "border-box",
};

// ── VehiculeForm ───────────────────────────────────────────────────────────────
function VehiculeForm({ init, circuits, conducteurs, onSave, onCancel, saving, isNew }: {
  init: Partial<Vehicule>; circuits: Circuit[]; conducteurs: Conducteur[];
  onSave: (d: Partial<Vehicule> & { conducteur_new_id?: number }) => void;
  onCancel: () => void; saving: boolean; isNew?: boolean;
}) {
  const [f, setF] = useState<Record<string,unknown>>({ etat: "bon", km: 0, places: 0, places_handi: 0, ...init });
  const set = (k: string, v: unknown) => setF(p => ({ ...p, [k]: v }));
  const field = (label: string, key: string, type = "text", ph = "") => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600,
        textTransform: "uppercase", marginBottom: 4 }}>{label}</label>
      <input type={type} value={(f[key] as string) ?? ""} placeholder={ph}
        onChange={e => set(key, type === "number" ? Number(e.target.value) : e.target.value)}
        style={inp} />
    </div>
  );
  return (
    <div>
      {isNew && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
          <div>{field("ID plaque (ex: FR-12345)", "id")}</div>
          <div>{field("Plaque affichée (ex: FR 12345)", "plaque")}</div>
          <div>{field("Marque", "marque")}</div>
          <div>{field("Modèle", "modele")}</div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
        <div>{field("Kilométrage", "km", "number")}</div>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600,
            textTransform: "uppercase", marginBottom: 4 }}>État</label>
          <select value={(f.etat as string) ?? "bon"} onChange={e => set("etat", e.target.value)} style={inp}>
            {ETATS.map(e => <option key={e} value={e}>{stateLabel(e)}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          {field("CT (ex: 04.2027)", "ct_date")}
        </div>
        <div style={{ marginBottom: 12 }}>
          {field("Assurance (ex: 04.2027)", "assurance_date")}
        </div>
        <div>{field("Places", "places", "number")}</div>
        <div>{field("Places handi", "places_handi", "number")}</div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600,
          textTransform: "uppercase", marginBottom: 4 }}>Circuit assigné</label>
        <select value={(f.circuit_id as string) ?? ""} onChange={e => set("circuit_id", e.target.value || null)} style={inp}>
          <option value="">— Aucun —</option>
          {circuits.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.num}-{c.nom}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600,
          textTransform: "uppercase", marginBottom: 4 }}>Conducteur assigné</label>
        <select value={(f.conducteur_new_id as string) ?? ""} onChange={e => set("conducteur_new_id", e.target.value ? Number(e.target.value) : null)} style={inp}>
          <option value="">— Aucun —</option>
          {conducteurs.map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn full onClick={() => onSave(f as Partial<Vehicule> & { conducteur_new_id?: number })}
          disabled={saving || (!!isNew && (!(f.id as string) || !(f.plaque as string) || !(f.marque as string) || !(f.modele as string)))}
          color={C.green}>
          {saving ? "Enregistrement…" : "✅ Enregistrer"}
        </Btn>
        <Btn outline onClick={onCancel} color={C.gray600}>Annuler</Btn>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function VehiculesPage() {
  const sb = createClient();
  const [vehicles, setVehicles] = useState<Vehicule[]>([]);
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [conducteurs, setConducteurs] = useState<Conducteur[]>([]);
  const [reparations, setReparations] = useState<Reparation[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState("infos");
  const [editModal, setEditModal] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterEtat, setFilterEtat] = useState("all");
  const [qrUrl, setQrUrl] = useState("");

  const fetchAll = useCallback(async () => {
    const [veh, cir, drv] = await Promise.all([
      sb.from("vehicules").select("*,circuit:circuits(*,cercle:cercles_scolaires(*)),conducteur:conducteurs(*)").order("plaque"),
      sb.from("circuits").select("*,cercle:cercles_scolaires(*)").order("num"),
      sb.from("conducteurs").select("*").order("nom"),
    ]);
    setVehicles(veh.data ?? []);
    setCircuits(cir.data ?? []);
    setConducteurs(drv.data ?? []);
    setLoading(false);
  }, [sb]);

  const fetchReps = useCallback(async (vehicleId: string) => {
    const { data } = await sb.from("reparations").select("*").eq("vehicule_id", vehicleId)
      .order("created_at", { ascending: false });
    setReparations(data ?? []);
  }, [sb]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const ch = sb.channel("gest-vehicules-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicules" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "reparations" }, () => { if (sel) fetchReps(sel); })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [sb, fetchAll, fetchReps, sel]);

  useEffect(() => {
    if (sel) {
      fetchReps(sel);
      setQrUrl(`${window.location.origin}/scan/${sel}`);
    }
  }, [sel, fetchReps]);

  const v = sel ? vehicles.find(x => x.id === sel) : null;

  const handleSave = async (form: Partial<Vehicule> & { conducteur_new_id?: number }) => {
    setSaving(true);
    await sb.from("vehicules").update({
      etat: form.etat, km: form.km,
      ct_date: (form.ct_date as string) || null,
      assurance_date: (form.assurance_date as string) || null,
      circuit_id: form.circuit_id || null,
      places: form.places, places_handi: form.places_handi,
    }).eq("id", sel!);
    if (form.conducteur_new_id) {
      await sb.from("conducteurs").update({ vehicule_id: sel }).eq("id", form.conducteur_new_id);
      if (v?.conducteur && (v.conducteur as Conducteur).id !== form.conducteur_new_id) {
        await sb.from("conducteurs").update({ vehicule_id: null }).eq("id", (v.conducteur as Conducteur).id);
      }
    }
    await fetchAll();
    setSaving(false);
    setEditModal(false);
  };

  const handleAdd = async (form: Partial<Vehicule> & { conducteur_new_id?: number }) => {
    setSaving(true);
    await sb.from("vehicules").insert({
      id: form.id, plaque: form.plaque, marque: form.marque, modele: form.modele,
      etat: form.etat ?? "bon", km: form.km ?? 0,
      ct_date: (form.ct_date as string) || null,
      assurance_date: (form.assurance_date as string) || null,
      circuit_id: form.circuit_id || null,
      places: form.places ?? 0, places_handi: form.places_handi ?? 0,
    });
    if (form.conducteur_new_id) {
      await sb.from("conducteurs").update({ vehicule_id: form.id }).eq("id", form.conducteur_new_id);
    }
    await fetchAll();
    setSaving(false);
    setAddModal(false);
  };

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: C.gray400 }}>Chargement…</div>;

  // ── Detail view ─────────────────────────────────────────────────────────────
  if (sel && v) {
    const cond = v.conducteur as Conducteur | undefined;
    const circ = v.circuit as Circuit | undefined;
    const activeRep = reparations.find(r => ACTIVE_REP.includes(r.statut));
    const ctWarn = alertCT(v);
    const assWarn = alertAss(v);

    return (
      <div>
        {editModal && (
          <Modal title={`Modifier — ${v.plaque}`} onClose={() => setEditModal(false)}>
            <VehiculeForm init={{ ...v, conducteur_new_id: cond?.id } as Record<string,unknown> & Vehicule}
              circuits={circuits} conducteurs={conducteurs}
              onSave={handleSave} onCancel={() => setEditModal(false)} saving={saving} />
          </Modal>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <button onClick={() => { setSel(null); setTab("infos"); setReparations([]); }}
            style={{ background: "none", border: "none", color: C.navyL, cursor: "pointer",
              fontWeight: 700, fontSize: 14, padding: 0 }}>
            ← Tous les véhicules
          </button>
          <Btn small onClick={() => setEditModal(true)} color={C.navyL}>✏️ Modifier</Btn>
        </div>

        {activeRep && (
          <div style={{ background: C.redL, borderRadius: 10, padding: "10px 16px", marginBottom: 14,
            border: `1px solid #FCA5A5`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: 13, color: C.red }}>🔧 Réparation en cours — </span>
              <span style={{ fontSize: 13, color: C.red }}>{activeRep.description}</span>
            </div>
            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 700,
              background: REP_STATUS[activeRep.statut]?.bg ?? C.amberL,
              color: REP_STATUS[activeRep.statut]?.color ?? C.amber }}>
              {REP_STATUS[activeRep.statut]?.label ?? activeRep.statut}
            </span>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 22 }}>
          {/* Left: vehicle card */}
          <div>
            <Card style={{ padding: 22, marginBottom: 14 }}>
              <div style={{ textAlign: "center", padding: "16px 0", borderBottom: `1px solid ${C.gray100}`, marginBottom: 16 }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: C.navy }}>{v.plaque}</div>
                <div style={{ fontSize: 13, color: C.gray600, marginTop: 2 }}>{v.marque} {v.modele}</div>
                <div style={{ marginTop: 10 }}>
                  <Badge color={stateColor(v.etat as string)}>{stateLabel(v.etat as string)}</Badge>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <InfoBox label="Places"       value={`${v.places}${v.places_handi > 0 ? ` + ${v.places_handi} ha` : ""}`} />
                <InfoBox label="Kilométrage"  value={`${(v.km ?? 0).toLocaleString("fr-FR")} km`} highlight={(v.km ?? 0) > 130000 ? C.red : undefined} />
                <InfoBox label="CT"           value={fmtDate(v.ct_date)}  highlight={ctWarn ? C.red : undefined} />
                <InfoBox label="Assurance"    value={fmtDate(v.assurance_date)} highlight={assWarn ? C.red : undefined} />
                <InfoBox label="Conducteur"   value={cond ? `${cond.prenom} ${cond.nom}` : "Non affecté"}
                  highlight={!cond ? C.amber : undefined} />
                <InfoBox label="Circuit"      value={circ ? `${circ.emoji} ${circ.nom}` : "—"} />
              </div>
              {(ctWarn || assWarn) && (
                <div style={{ marginTop: 12, padding: "8px 12px", background: C.redL, borderRadius: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.red }}>
                    ⚠ {ctWarn && "CT "}
                    {ctWarn && assWarn && "· "}
                    {assWarn && "Assurance "}
                    expire bientôt (&lt; 60 jours)
                  </div>
                </div>
              )}
            </Card>

            {/* QR code */}
            <Card style={{ padding: 18, textAlign: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: C.navy, marginBottom: 12 }}>
                Code QR véhicule
              </div>
              {qrUrl ? (
                <div>
                  <QRCodeSVG value={qrUrl} size={160} level="M" style={{ margin: "0 auto", display: "block" }} />
                  <p style={{ fontSize: 11, color: C.gray400, marginTop: 10, wordBreak: "break-all" }}>
                    {qrUrl}
                  </p>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: C.gray400 }}>Génération…</div>
              )}
            </Card>
          </div>

          {/* Right: tabs */}
          <Card style={{ padding: 22 }}>
            <TabBar tabs={["infos","réparations"]} active={tab} onChange={setTab} />

            {tab === "infos" && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <InfoBox label="ID"           value={v.id} />
                  <InfoBox label="Plaque"        value={v.plaque} />
                  <InfoBox label="Marque"        value={v.marque} />
                  <InfoBox label="Modèle"        value={v.modele} />
                  <InfoBox label="Places totales"value={String(v.places)} />
                  <InfoBox label="Places handi"  value={String(v.places_handi)} />
                  <InfoBox label="Kilométrage"   value={`${(v.km ?? 0).toLocaleString("fr-FR")} km`} />
                  <InfoBox label="État"          value={stateLabel(v.etat as string)} />
                  <InfoBox label="Contrôle technique" value={fmtDate(v.ct_date)} highlight={ctWarn ? C.red : undefined} />
                  <InfoBox label="Assurance"     value={fmtDate(v.assurance_date)} highlight={assWarn ? C.red : undefined} />
                  {v.date_vidange && <InfoBox label="Dernière vidange" value={v.date_vidange} />}
                </div>
                {cond && (
                  <div style={{ marginTop: 16, padding: "12px 14px", background: C.skyL, borderRadius: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.navyL, textTransform: "uppercase", marginBottom: 6 }}>
                      Conducteur assigné
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.navy }}>
                      {cond.prenom} {cond.nom}
                    </div>
                    <div style={{ fontSize: 12, color: C.gray600, marginTop: 2 }}>{cond.tel || "—"}</div>
                    {circ && (
                      <div style={{ fontSize: 12, color: C.navyL, marginTop: 4, fontWeight: 600 }}>
                        {circ.emoji} {circ.nom}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === "réparations" && (
              <div>
                {reparations.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: C.gray400 }}>
                    <div style={{ fontSize: 36 }}>✅</div>
                    <p style={{ fontWeight: 700, marginTop: 10 }}>Aucune réparation enregistrée</p>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: 13, color: C.gray600, marginBottom: 14 }}>
                      {reparations.filter(r => ACTIVE_REP.includes(r.statut)).length} réparation(s) active(s) ·{" "}
                      {reparations.length} au total
                    </p>
                    {reparations.map(r => {
                      const cfg = REP_STATUS[r.statut] ?? { label: r.statut, color: C.gray600, bg: C.gray100 };
                      const isActive = ACTIVE_REP.includes(r.statut);
                      return (
                        <div key={r.id} style={{ padding: "12px 0", borderBottom: `1px solid ${C.gray100}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 13, color: isActive ? C.red : C.gray800 }}>
                                {isActive ? "🔧 " : ""}{r.description}
                              </div>
                              <div style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>
                                {new Date(r.created_at).toLocaleDateString("fr-FR", {
                                  weekday: "long", day: "numeric", month: "long", year: "numeric"
                                })}
                                {r.montant != null && r.montant > 0 && ` · ${r.montant.toLocaleString("fr-CH")} CHF`}
                              </div>
                              {r.notes && (
                                <div style={{ fontSize: 12, color: C.gray600, marginTop: 4 }}>{r.notes}</div>
                              )}
                            </div>
                            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 700,
                              flexShrink: 0, background: cfg.bg, color: cfg.color }}>
                              {cfg.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    );
  }

  // ── List ──────────────────────────────────────────────────────────────────
  const enAtelier = vehicles.filter(v => (v.etat as string) === "atelier").length;
  const sansConducteur = vehicles.filter(v => !v.conducteur).length;
  const alerts = vehicles.filter(v => alertCT(v) || alertAss(v)).length;

  const filtered = filterEtat === "all"
    ? vehicles
    : vehicles.filter(v => (v.etat as string) === filterEtat);

  return (
    <div>
      {addModal && (
        <Modal title="Ajouter un véhicule" onClose={() => setAddModal(false)}>
          <VehiculeForm init={{}} circuits={circuits} conducteurs={conducteurs}
            onSave={handleAdd} onCancel={() => setAddModal(false)} saving={saving} isNew />
        </Modal>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: C.navy, margin: "0 0 4px" }}>
            Véhicules ({vehicles.length})
          </h1>
          <p style={{ fontSize: 13, color: C.gray600, margin: 0 }}>
            {vehicles.length - enAtelier} en service
            {enAtelier > 0 && <span style={{ color: C.red, marginLeft: 6 }}>· {enAtelier} en atelier</span>}
            {sansConducteur > 0 && <span style={{ color: C.amber, marginLeft: 6 }}>· {sansConducteur} sans conducteur</span>}
            {alerts > 0 && <span style={{ color: C.red, marginLeft: 6 }}>· {alerts} alerte(s) CT/assurance</span>}
          </p>
        </div>
        <Btn onClick={() => setAddModal(true)} color={C.green}>+ Ajouter véhicule</Btn>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {([["all","Tous"],["bon","En service"],["attention","Attention"],["atelier","En atelier"]] as const).map(([v,l]) => (
          <button key={v} onClick={() => setFilterEtat(v)}
            style={{ padding: "5px 14px", borderRadius: 20, border: `1.5px solid ${filterEtat === v ? C.navyL : C.gray200}`,
              background: filterEtat === v ? C.navyL : C.white, color: filterEtat === v ? C.white : C.gray600,
              fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            {l}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        {filtered.map(veh => {
          const cond = veh.conducteur as Conducteur | undefined;
          const circ = veh.circuit as Circuit | undefined;
          const ctW  = alertCT(veh);
          const assW = alertAss(veh);
          const etat = veh.etat as string;
          return (
            <Card key={veh.id} onClick={() => setSel(veh.id)}
              style={{ padding: 18, borderLeft: etat === "atelier" ? `4px solid ${C.red}` : etat === "attention" ? `4px solid ${C.amber}` : undefined }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: C.navy }}>{veh.plaque}</div>
                  <div style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>{veh.marque} {veh.modele}</div>
                </div>
                <Badge color={stateColor(etat)}>{stateLabel(etat)}</Badge>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, fontSize: 12, marginBottom: 10 }}>
                <div style={{ background: C.gray50, borderRadius: 6, padding: "6px 9px" }}>
                  <div style={{ fontSize: 9, color: C.gray400, textTransform: "uppercase" }}>Places</div>
                  <div style={{ fontWeight: 600, color: C.gray800, marginTop: 1 }}>
                    {veh.places}{veh.places_handi > 0 ? ` + ${veh.places_handi}ha` : ""}
                  </div>
                </div>
                <div style={{ background: (veh.km ?? 0) > 130000 ? C.redL : C.gray50, borderRadius: 6, padding: "6px 9px" }}>
                  <div style={{ fontSize: 9, color: C.gray400, textTransform: "uppercase" }}>Kilométrage</div>
                  <div style={{ fontWeight: 600, color: (veh.km ?? 0) > 130000 ? C.red : C.gray800, marginTop: 1 }}>
                    {(veh.km ?? 0).toLocaleString("fr-FR")} km
                  </div>
                </div>
                <div style={{ background: C.gray50, borderRadius: 6, padding: "6px 9px", gridColumn: "1/-1" }}>
                  <div style={{ fontSize: 9, color: C.gray400, textTransform: "uppercase" }}>Conducteur</div>
                  <div style={{ fontWeight: 600, color: cond ? C.gray800 : C.amber, marginTop: 1 }}>
                    {cond ? `${cond.prenom} ${cond.nom}` : "⚠ Non affecté"}
                  </div>
                </div>
                {circ && (
                  <div style={{ background: C.skyL, borderRadius: 6, padding: "6px 9px", gridColumn: "1/-1" }}>
                    <div style={{ fontSize: 9, color: C.gray400, textTransform: "uppercase" }}>Circuit</div>
                    <div style={{ fontWeight: 600, color: C.navy, marginTop: 1 }}>{circ.emoji} {circ.nom}</div>
                  </div>
                )}
              </div>
              <div style={{ borderTop: `1px solid ${C.gray100}`, paddingTop: 8, fontSize: 11, color: C.gray400,
                display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span style={{ color: ctW ? C.red : undefined, fontWeight: ctW ? 700 : undefined }}>CT: {fmtDate(veh.ct_date)}</span>
                <span style={{ color: assW ? C.red : undefined, fontWeight: assW ? 700 : undefined }}>Ass: {fmtDate(veh.assurance_date)}</span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
