"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { C, fmtDateTime } from "@/lib/constants";
import { Badge, InfoBox, Btn, Modal } from "@/components/ui";
import type { Incident } from "@/lib/types";

type DrvMin = { id: number; prenom: string; nom: string; tel?: string };
type VehMin = { id: string; plaque: string };
type CirMin = { id: string; nom: string; emoji: string; num: string };

// ── Helpers ───────────────────────────────────────────────────────────────────
const isoToday  = () => new Date().toISOString().slice(0, 10);

// ── Severity map ──────────────────────────────────────────────────────────────
const SEV: Record<string, { level: number; label: string; color: string; bg: string; icon: string }> = {
  accident:    { level: 0, label: "Critique", color: C.red,     bg: C.redL,    icon: "🚨" },
  enfant:      { level: 1, label: "Urgent",   color: C.amber,   bg: C.amberL,  icon: "👶" },
  panne:       { level: 1, label: "Urgent",   color: C.amber,   bg: C.amberL,  icon: "🔧" },
  voyant:      { level: 1, label: "Urgent",   color: C.amber,   bg: C.amberL,  icon: "💡" },
  retard:      { level: 2, label: "Normal",   color: C.navyL,   bg: C.skyL,    icon: "⏰" },
  parent:      { level: 2, label: "Normal",   color: C.navyL,   bg: C.skyL,    icon: "👨‍👩‍👧" },
  degradation: { level: 3, label: "Info",     color: C.gray600, bg: C.gray100, icon: "🪟" },
  autre:       { level: 3, label: "Info",     color: C.gray600, bg: C.gray100, icon: "❓" },
};
const sevOf = (type: string) => SEV[type] ?? SEV.autre;

const TYPE_LABELS: Record<string, string> = {
  panne: "Panne véhicule", voyant: "Voyant moteur", accident: "Accident",
  retard: "Retard", degradation: "Dégradation", enfant: "Problème enfant",
  parent: "Problème parent", autre: "Autre",
};
const CAT_GROUPS = [
  { id: "all",       label: "Tous" },
  { id: "vehicule",  label: "Véhicule",   types: ["panne","voyant","accident","degradation"] },
  { id: "service",   label: "Service",    types: ["retard"] },
  { id: "personnel", label: "Personnes",  types: ["enfant","parent"] },
  { id: "autre",     label: "Autre",      types: ["autre"] },
];

const inp: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.gray200}`,
  fontSize: 13, color: C.gray800, background: C.white, boxSizing: "border-box",
};

// ── Action Modal ──────────────────────────────────────────────────────────────
function ActionModal({ inc, drivers, vehicles, circuits, onClose, onSave }: {
  inc: Incident; drivers: DrvMin[]; vehicles: VehMin[]; circuits: CirMin[];
  onClose: () => void;
  onSave: (id: number, response: string, status: "en_cours"|"resolu", extra?: string) => Promise<void>;
}) {
  const [response, setResponse] = useState(inc.response || "");
  const [status,   setStatus]   = useState<"en_cours"|"resolu">(inc.status === "resolu" ? "resolu" : "en_cours");
  const [busy,     setBusy]     = useState(false);

  const drv  = inc.conducteur || drivers.find(d => d.id === inc.conducteur_id);
  const veh  = inc.vehicule   || vehicles.find(v => v.id === inc.vehicule_id);
  const circ = inc.circuit    || circuits.find(c => c.id === inc.circuit_id);
  const sev  = sevOf(inc.type);

  const quick = async (msg: string, extra?: string) => {
    setBusy(true);
    await onSave(inc.id, msg, "en_cours", extra);
    setBusy(false);
    onClose();
  };
  const save = async () => {
    setBusy(true);
    await onSave(inc.id, response, status);
    setBusy(false);
    onClose();
  };

  const qBtn: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 10, padding: "9px 14px",
    borderRadius: 10, border: `1px solid ${C.gray200}`, background: C.white,
    cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.gray800,
    width: "100%", textAlign: "left", marginBottom: 8,
  };

  const isPanne = ["panne","voyant","accident","degradation"].includes(inc.type);
  const isRetard = inc.type === "retard";
  const isPers  = ["enfant","parent"].includes(inc.type);

  return (
    <Modal title="Traiter l'incident" onClose={onClose} wide>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* Info */}
        <div>
          <div style={{ background: sev.bg, borderRadius: 12, padding: "12px 16px", marginBottom: 12,
            borderLeft: `4px solid ${sev.color}` }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: sev.color, textTransform: "uppercase", marginBottom: 4 }}>
              {sev.icon} {sev.label} — {TYPE_LABELS[inc.type] || inc.type}
            </div>
            <p style={{ fontSize: 13, color: C.gray800, margin: 0, lineHeight: 1.5 }}>{inc.description}</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <InfoBox label="Signalé le"  value={fmtDateTime(inc.reported_at)} />
            <InfoBox label="Conducteur"  value={drv ? `${drv.prenom} ${drv.nom}` : "—"} />
            <InfoBox label="Véhicule"    value={veh?.plaque || "—"} />
            <InfoBox label="Circuit"     value={circ ? `${circ.emoji} ${circ.nom}` : "—"} />
            {drv?.tel && <InfoBox label="Téléphone" value={drv.tel} full />}
            {inc.resolved_at && <InfoBox label="Résolu le" value={fmtDateTime(inc.resolved_at)} full />}
          </div>
          {inc.response && (
            <div style={{ marginTop: 10, background: C.skyL, borderRadius: 8, padding: "8px 12px",
              fontSize: 12, color: C.navyL, fontWeight: 600 }}>
              Réponse existante : {inc.response}
            </div>
          )}
        </div>

        {/* Actions */}
        <div>
          {isPanne && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.gray600, textTransform: "uppercase",
                marginBottom: 8 }}>Actions rapides</div>
              <button style={qBtn} onClick={() => quick(`Transmis au mécanicien — ${veh?.plaque || ""}`, "transmis_meca")}>
                🔧 Envoyer au mécanicien
              </button>
              <button style={qBtn} onClick={() => quick(`Véhicule ${veh?.plaque || ""} immobilisé.`, "immobiliser")}>
                🚫 Immobiliser le véhicule
              </button>
            </div>
          )}
          {isRetard && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.gray600, textTransform: "uppercase", marginBottom: 8 }}>
                Actions rapides
              </div>
              <button style={qBtn} onClick={() => quick("École informée du retard.")}>🏫 Informer l'école</button>
              <button style={qBtn} onClick={() => quick("Parents informés du retard.")}>👨‍👩‍👧 Informer les parents</button>
            </div>
          )}
          {isPers && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.gray600, textTransform: "uppercase", marginBottom: 8 }}>
                Actions rapides
              </div>
              <button style={qBtn} onClick={() => quick("Parent contacté.")}>📞 Contacter le parent</button>
              <button style={qBtn} onClick={() => quick("École contactée.")}>🏫 Contacter l'école</button>
            </div>
          )}

          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600,
              textTransform: "uppercase", marginBottom: 4 }}>Note / Réponse</label>
            <textarea value={response} onChange={e => setResponse(e.target.value)} rows={3}
              placeholder="Action prise, note interne…"
              style={{ ...inp, width: "100%", resize: "vertical" }} />
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {(["en_cours","resolu"] as const).map(s => (
              <button key={s} onClick={() => setStatus(s)} style={{ flex: 1, padding: "9px 0", borderRadius: 8,
                border: `2px solid ${status === s ? C.green : C.gray200}`,
                background: status === s ? C.greenL : C.white, cursor: "pointer",
                fontWeight: 700, fontSize: 12, color: status === s ? C.green : C.gray600 }}>
                {s === "resolu" ? "✅ Résolu" : "🔄 En cours"}
              </button>
            ))}
          </div>
          <Btn full onClick={save} disabled={busy} color={status === "resolu" ? C.green : C.navyL}>
            {busy ? "Sauvegarde…" : status === "resolu" ? "✅ Résoudre" : "💾 Enregistrer"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function IncidentsPage() {
  const sb = createClient();
  const [incidents,  setIncidents]  = useState<Incident[]>([]);
  const [drivers,    setDrivers]    = useState<DrvMin[]>([]);
  const [vehicles,   setVehicles]   = useState<VehMin[]>([]);
  const [circuits,   setCircuits]   = useState<CirMin[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [sel,        setSel]        = useState<Incident | null>(null);

  // Filters
  const [filterCat,    setFilterCat]    = useState("all");
  const [filterStatus, setFilterStatus] = useState("open"); // open | resolu | all
  const [filterDrv,    setFilterDrv]    = useState("");
  const [filterVeh,    setFilterVeh]    = useState("");

  const fetchAll = useCallback(async () => {
    const [inc, drv, veh, cir] = await Promise.all([
      sb.from("incidents")
        .select("*,vehicule:vehicules(*),conducteur:conducteurs(*),circuit:circuits(*)")
        .order("reported_at", { ascending: false }),
      sb.from("conducteurs").select("id,prenom,nom").order("nom"),
      sb.from("vehicules").select("id,plaque,marque").order("plaque"),
      sb.from("circuits").select("id,nom,emoji,num").order("num"),
    ]);
    setIncidents(inc.data ?? []);
    setDrivers(drv.data ?? []);
    setVehicles(veh.data ?? []);
    setCircuits(cir.data ?? []);
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    fetchAll();
    const ch = sb.channel("gest-incidents-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "alertes" }, fetchAll)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [fetchAll, sb]);

  const handleAction = async (id: number, response: string, status: "en_cours"|"resolu", extra?: string) => {
    await sb.from("incidents")
      .update({ response, status, resolved_at: status === "resolu" ? new Date().toISOString() : null })
      .eq("id", id);
    if (extra === "transmis_meca") {
      const inc = incidents.find(i => i.id === id);
      await sb.from("alertes").insert({
        type: "transmis_meca", severity: "haute",
        message: `Incident transmis au mécanicien : ${inc?.vehicule?.plaque || ""} — ${inc?.description?.slice(0,100) || ""}`,
        read: false, vehicle_id: inc?.vehicule_id,
      });
    }
    if (extra === "immobiliser") {
      const inc = incidents.find(i => i.id === id);
      if (inc?.vehicule_id) await sb.from("vehicules").update({ etat: "atelier" }).eq("id", inc.vehicule_id);
    }
    fetchAll();
  };

  // ── Filter ─────────────────────────────────────────────────────────────────
  const today = isoToday();
  const filtered = incidents.filter(i => {
    if (filterStatus === "open"   && i.status === "resolu") return false;
    if (filterStatus === "resolu" && i.status !== "resolu") return false;
    if (filterDrv && String(i.conducteur_id) !== filterDrv) return false;
    if (filterVeh && i.vehicule_id !== filterVeh) return false;
    if (filterCat !== "all") {
      const cat = CAT_GROUPS.find(g => g.id === filterCat);
      if (cat?.types && !cat.types.includes(i.type)) return false;
    }
    return true;
  });

  // ── Sort: today first, then by severity, then by date ─────────────────────
  const sorted = [...filtered].sort((a, b) => {
    const aToday = a.reported_at.slice(0,10) === today ? 0 : 1;
    const bToday = b.reported_at.slice(0,10) === today ? 0 : 1;
    if (aToday !== bToday) return aToday - bToday;
    const aLev = sevOf(a.type).level;
    const bLev = sevOf(b.type).level;
    if (aLev !== bLev) return aLev - bLev;
    return b.reported_at.localeCompare(a.reported_at);
  });

  const openCount   = incidents.filter(i => i.status !== "resolu").length;
  const resolvedCnt = incidents.filter(i => i.status === "resolu").length;

  if (loading) return (
    <div style={{ textAlign: "center", padding: 60, color: C.gray400, fontSize: 14 }}>Chargement…</div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      {sel && (
        <ActionModal inc={sel} drivers={drivers} vehicles={vehicles} circuits={circuits}
          onClose={() => setSel(null)} onSave={handleAction} />
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: C.navy, margin: "0 0 4px" }}>Incidents</h1>
          <p style={{ fontSize: 13, color: C.gray600, margin: 0 }}>
            {openCount} ouvert(s) · {resolvedCnt} résolu(s) · mise à jour automatique
          </p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: C.white, borderRadius: 14, padding: "14px 16px", marginBottom: 20,
        border: `1px solid ${C.gray200}`, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>

        {/* Category tabs */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {CAT_GROUPS.map(g => (
            <button key={g.id} onClick={() => setFilterCat(g.id)}
              style={{ padding: "5px 12px", borderRadius: 20, border: `1.5px solid ${filterCat === g.id ? C.navyL : C.gray200}`,
                background: filterCat === g.id ? C.navyL : C.white,
                color: filterCat === g.id ? C.white : C.gray600,
                fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              {g.label}
            </button>
          ))}
        </div>

        <div style={{ height: 24, width: 1, background: C.gray200 }} />

        {/* Status */}
        <div style={{ display: "flex", gap: 6 }}>
          {([["open","Ouverts"],["resolu","Résolus"],["all","Tous"]] as const).map(([v,l]) => (
            <button key={v} onClick={() => setFilterStatus(v)}
              style={{ padding: "5px 12px", borderRadius: 20, border: `1.5px solid ${filterStatus === v ? C.navyL : C.gray200}`,
                background: filterStatus === v ? C.navyL : C.white,
                color: filterStatus === v ? C.white : C.gray600,
                fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              {l}
            </button>
          ))}
        </div>

        <div style={{ height: 24, width: 1, background: C.gray200 }} />

        {/* Conducteur */}
        <select value={filterDrv} onChange={e => setFilterDrv(e.target.value)}
          style={{ ...inp, minWidth: 150 }}>
          <option value="">Tous les conducteurs</option>
          {drivers.map(d => <option key={d.id} value={String(d.id)}>{d.prenom} {d.nom}</option>)}
        </select>

        {/* Vehicule */}
        <select value={filterVeh} onChange={e => setFilterVeh(e.target.value)}
          style={{ ...inp, minWidth: 130 }}>
          <option value="">Tous véhicules</option>
          {vehicles.map(v => <option key={v.id} value={v.id}>{v.plaque}</option>)}
        </select>

        {(filterCat !== "all" || filterStatus !== "open" || filterDrv || filterVeh) && (
          <button onClick={() => { setFilterCat("all"); setFilterStatus("open"); setFilterDrv(""); setFilterVeh(""); }}
            style={{ fontSize: 12, color: C.red, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>
            × Réinitialiser
          </button>
        )}
      </div>

      {/* Results */}
      {sorted.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <p style={{ fontWeight: 700, fontSize: 16, color: C.gray600, margin: 0 }}>
            {filterStatus === "open" ? "Aucun incident ouvert" : "Aucun incident"}
          </p>
        </div>
      ) : (
        <div>
          {/* Group by severity */}
          {([0,1,2,3] as const).map(level => {
            const group = sorted.filter(i => sevOf(i.type).level === level);
            if (!group.length) return null;
            const s = Object.values(SEV).find(x => x.level === level)!;
            const sevLabels = ["🔴 Critique","🟠 Urgent","🔵 Normal","⚪ Info"];
            return (
              <div key={level} style={{ marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: s.color, textTransform: "uppercase",
                    letterSpacing: 0.5 }}>{sevLabels[level]}</span>
                  <span style={{ background: s.bg, color: s.color, borderRadius: 20, padding: "2px 8px",
                    fontSize: 11, fontWeight: 700 }}>{group.length}</span>
                </div>
                {group.map(i => <IncCard key={i.id} i={i} onOpen={() => setSel(i)} />)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── IncCard ───────────────────────────────────────────────────────────────────
function IncCard({ i, onOpen }: { i: Incident; onOpen: () => void }) {
  const today = isoToday();
  const sev   = sevOf(i.type);
  const isToday = i.reported_at.slice(0,10) === today;

  return (
    <div onClick={onOpen}
      style={{ background: C.white, borderRadius: 14, padding: "14px 18px", marginBottom: 10,
        cursor: "pointer", boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
        borderLeft: `4px solid ${sev.color}`,
        opacity: i.status === "resolu" ? 0.7 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1 }}>
          <span style={{ fontSize: 20 }}>{sev.icon}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.gray800, lineHeight: 1.4 }}>
              {i.description.slice(0, 90)}{i.description.length > 90 ? "…" : ""}
            </div>
            <div style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>
              {TYPE_LABELS[i.type] || i.type}
              {i.conducteur && ` · ${i.conducteur.prenom} ${i.conducteur.nom}`}
              {i.vehicule && ` · ${i.vehicule.plaque}`}
              {i.circuit && ` · ${i.circuit.emoji} ${i.circuit.nom}`}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {isToday && (
            <span style={{ background: "#FEF9C3", color: "#854D0E", fontSize: 11, fontWeight: 700,
              borderRadius: 20, padding: "2px 8px" }}>Aujourd'hui</span>
          )}
          <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: i.status === "resolu" ? C.greenL : i.status === "en_cours" ? C.skyL : C.amberL,
            color: i.status === "resolu" ? C.green : i.status === "en_cours" ? C.navyL : C.amber }}>
            {i.status === "resolu" ? "✅ Résolu" : i.status === "en_cours" ? "🔄 En cours" : "⏳ À traiter"}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: C.gray400 }}>{fmtDateTime(i.reported_at)}</span>
        {i.response && (
          <span style={{ fontSize: 11, color: C.navyL, fontWeight: 600 }}>✔ {i.response.slice(0,50)}</span>
        )}
      </div>
    </div>
  );
}
