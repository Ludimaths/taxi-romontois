"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { C, fmtDateTime, isoToday } from "@/lib/constants";
import { Badge, InfoBox, Btn, Modal } from "@/components/ui";
import {
  AlertCircle, Baby, Wrench, Lightbulb, Clock, Phone, ShieldAlert,
  HelpCircle, CheckCircle2, RefreshCw, Loader2,
} from "lucide-react";
import type { Incident } from "@/lib/types";

type DrvMin = { id: number; prenom: string; nom: string; tel?: string };
type VehMin = { id: string; plaque: string };
type CirMin = { id: string; nom: string; emoji: string; num: string };

// ── Severity map ──────────────────────────────────────────────────────────────
const SEV: Record<string, { level: number; label: string; color: string; bg: string; icon: React.ReactNode }> = {
  accident:    { level: 0, label: "Critique", color: C.red,     bg: C.redL,    icon: <AlertCircle size={18} color={C.red} /> },
  enfant:      { level: 1, label: "Urgent",   color: C.amber,   bg: C.amberL,  icon: <Baby size={18} color={C.amber} /> },
  panne:       { level: 1, label: "Urgent",   color: C.amber,   bg: C.amberL,  icon: <Wrench size={18} color={C.amber} /> },
  voyant:      { level: 1, label: "Urgent",   color: C.amber,   bg: C.amberL,  icon: <Lightbulb size={18} color={C.amber} /> },
  retard:      { level: 2, label: "Normal",   color: C.navyL,   bg: C.skyL,    icon: <Clock size={18} color={C.navyL} /> },
  parent:      { level: 2, label: "Normal",   color: C.navyL,   bg: C.skyL,    icon: <Phone size={18} color={C.navyL} /> },
  degradation: { level: 3, label: "Info",     color: C.gray600, bg: C.gray100, icon: <ShieldAlert size={18} color={C.gray600} /> },
  autre:       { level: 3, label: "Info",     color: C.gray600, bg: C.gray100, icon: <HelpCircle size={18} color={C.gray600} /> },
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
  onSave: (id: number, response: string, status: "en_cours"|"resolu") => Promise<void>;
}) {
  const sb = createClient();
  const [response,   setResponse]   = useState(inc.response || "");
  const [status,     setStatus]     = useState<"en_cours"|"resolu">(inc.status === "resolu" ? "resolu" : "en_cours");
  const [busy,       setBusy]       = useState(false);
  const [checked,    setChecked]    = useState<Set<string>>(new Set());
  const [replacerId, setReplacerId] = useState("");

  const drv  = inc.conducteur || drivers.find(d => d.id === inc.conducteur_id);
  const veh  = inc.vehicule   || vehicles.find(v => v.id === inc.vehicule_id);
  const circ = inc.circuit    || circuits.find(c => c.id === inc.circuit_id);
  const sev  = sevOf(inc.type);
  const isPanne = ["panne","voyant","accident","degradation"].includes(inc.type);

  const toggle = (id: string) =>
    setChecked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const ACTIONS: { id: string; label: string }[] = [
    ...(isPanne ? [
      { id: "meca",        label: "Envoyer au mécanicien"   },
      { id: "immobiliser", label: "Immobiliser le véhicule" },
    ] : []),
    { id: "parents",    label: "Informer les parents du circuit"    },
    { id: "ecole",      label: "Informer l'établissement scolaire"  },
    { id: "remplacant", label: "Appeler un remplaçant"              },
    ...(inc.type === "accident" ? [{ id: "assurance", label: "Signaler à l'assurance" }] : []),
    { id: "sans_suite", label: "Classer sans suite"                 },
  ];

  const availableDrivers = drivers.filter(d => d.id !== inc.conducteur_id);

  const envoyer = async () => {
    setBusy(true);
    const parts: string[] = [];

    if (checked.has("meca")) {
      parts.push(`Transmis au mécanicien — ${veh?.plaque || ""}`);
      await sb.from("alertes").insert({
        type: "transmis_meca", severity: "haute",
        message: `Incident transmis au mécanicien : ${veh?.plaque || ""} — ${inc.description?.slice(0, 100) || ""}`,
        read: false, vehicle_id: inc.vehicule_id,
      });
    }
    if (checked.has("immobiliser") && inc.vehicule_id) {
      parts.push(`Véhicule ${veh?.plaque || ""} immobilisé`);
      await sb.from("vehicules").update({ etat: "atelier" }).eq("id", inc.vehicule_id);
    }
    if (checked.has("parents") && inc.circuit_id) {
      parts.push("Parents du circuit informés");
      const { data: children } = await sb.from("enfants")
        .select("parent_user_id").eq("circuit_id", inc.circuit_id)
        .not("parent_user_id", "is", null);
      if (children?.length) {
        const msgs = children.filter(e => e.parent_user_id).map(e => ({
          expediteur_nom: "Taxi Romontois", expediteur_role: "gestionnaire",
          destinataire_id: e.parent_user_id, destinataire_role: "parent",
          message: `Incident circuit ${circ ? `${circ.emoji} ${circ.nom}` : inc.circuit_id} : ${inc.description?.slice(0, 200) || ""}`,
          lu: false,
        }));
        if (msgs.length) await sb.from("messages_internes").insert(msgs);
      }
    }
    if (checked.has("ecole")) {
      parts.push("Établissement scolaire informé");
    }
    if (checked.has("remplacant") && replacerId) {
      const rep = drivers.find(d => String(d.id) === replacerId);
      if (rep) {
        parts.push(`Remplaçant : ${rep.prenom} ${rep.nom}`);
        const today = new Date().toISOString().slice(0, 10);
        const now   = new Date().toTimeString().slice(0, 5);
        await Promise.all([
          sb.from("absences_conducteurs").insert({
            conducteur_id: inc.conducteur_id, remplacant_id: Number(replacerId),
            circuit_id: inc.circuit_id, date_absence: today,
            motif: `Incident : ${inc.description?.slice(0, 80) || ""}`, status: "couvert",
          }),
          sb.from("service_logs").insert({
            conducteur_id: inc.conducteur_id, vehicule_id: inc.vehicule_id,
            circuit_id: inc.circuit_id, date_service: today, heure_debut: now,
            status: "absent", notes: `Absent — Remplacé par ${rep.prenom} ${rep.nom}`,
          }),
          sb.from("service_logs").insert({
            conducteur_id: Number(replacerId), vehicule_id: inc.vehicule_id,
            circuit_id: inc.circuit_id, date_service: today, heure_debut: now,
            status: "en_service", is_replacement: true,
            replacement_name: `${drv?.prenom || ""} ${drv?.nom || ""} absent`,
          }),
          sb.from("alertes").insert({
            type: "remplacement", severity: "haute",
            message: `Vous remplacez ${drv?.prenom || ""} ${drv?.nom || ""} — Circuit ${circ ? `${circ.emoji} ${circ.nom}` : inc.circuit_id}`,
            read: false, driver_id: Number(replacerId),
          }),
        ]);
      }
    }
    if (checked.has("assurance")) parts.push("Signalé à l'assurance");
    if (response.trim()) parts.push(response.trim());

    const finalResponse = parts.join(" · ") || response;
    const finalStatus   = checked.has("sans_suite") ? "resolu" : status;

    await onSave(inc.id, finalResponse, finalStatus);
    setBusy(false);
    onClose();
  };

  return (
    <Modal title="Traiter l'incident" onClose={onClose} wide>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* ── Info ──────────────────────────────────────────────────────── */}
        <div>
          <div style={{ background: sev.bg, borderRadius: 12, padding: "12px 16px", marginBottom: 12,
            borderLeft: `4px solid ${sev.color}` }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: sev.color, textTransform: "uppercase",
              marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
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

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.gray600,
            textTransform: "uppercase", marginBottom: 10 }}>Actions à mener</div>

          <div style={{ marginBottom: 14 }}>
            {ACTIONS.map(action => (
              <div key={action.id} style={{ marginBottom: 6 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                  padding: "9px 12px", borderRadius: 10,
                  border: `1.5px solid ${checked.has(action.id) ? C.navyL : C.gray200}`,
                  background: checked.has(action.id) ? C.skyL : C.white }}>
                  <input type="checkbox" checked={checked.has(action.id)}
                    onChange={() => toggle(action.id)}
                    style={{ width: 15, height: 15, accentColor: C.navy, cursor: "pointer", flexShrink: 0 }} />
                  <span style={{ fontSize: 13,
                    fontWeight: checked.has(action.id) ? 700 : 500,
                    color: checked.has(action.id) ? C.navy : C.gray800 }}>
                    {action.label}
                  </span>
                </label>
                {action.id === "remplacant" && checked.has("remplacant") && (
                  <select value={replacerId} onChange={e => setReplacerId(e.target.value)}
                    style={{ ...inp, width: "100%", marginTop: 4 }}>
                    <option value="">— Choisir un conducteur —</option>
                    {availableDrivers.map(d => (
                      <option key={d.id} value={String(d.id)}>{d.prenom} {d.nom}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.gray600,
              textTransform: "uppercase", marginBottom: 4 }}>Note interne (optionnel)</div>
            <textarea value={response} onChange={e => setResponse(e.target.value)} rows={2}
              placeholder="Informations complémentaires…"
              style={{ ...inp, width: "100%", resize: "vertical" }} />
          </div>

          {!checked.has("sans_suite") && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {(["en_cours","resolu"] as const).map(s => (
                <button key={s} onClick={() => setStatus(s)} style={{ flex: 1, padding: "9px 0",
                  borderRadius: 8, border: `2px solid ${status === s ? C.green : C.gray200}`,
                  background: status === s ? C.greenL : C.white, cursor: "pointer",
                  fontWeight: 700, fontSize: 12, color: status === s ? C.green : C.gray600 }}>
                  {s === "resolu" ? "Résolu" : "En cours"}
                </button>
              ))}
            </div>
          )}

          <Btn full onClick={envoyer} disabled={busy}
            color={checked.has("sans_suite") || status === "resolu" ? C.green : C.navyL}>
            {busy ? "Envoi…" : "Envoyer"}
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

  const handleAction = async (id: number, response: string, status: "en_cours"|"resolu") => {
    await sb.from("incidents")
      .update({ response, status, resolved_at: status === "resolu" ? new Date().toISOString() : null })
      .eq("id", id);
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
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><CheckCircle2 size={48} color={C.green} /></div>
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
            const sevLabels = ["Critique","Urgent","Normal","Info"];
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
          <span style={{ display: "flex", alignItems: "center" }}>{sev.icon}</span>
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
            {i.status === "resolu" ? "Résolu" : i.status === "en_cours" ? "En cours" : "À traiter"}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: C.gray400 }}>{fmtDateTime(i.reported_at)}</span>
        {i.response && (
          <span style={{ fontSize: 11, color: C.navyL, fontWeight: 600 }}>{i.response.slice(0,50)}</span>
        )}
      </div>
    </div>
  );
}
