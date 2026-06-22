"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { C, statusColor, statusLabel, todayStr } from "@/lib/constants";
import { Badge, Avatar, Card, InfoBox, Btn, Modal } from "@/components/ui";
import type {
  Conducteur, Circuit, Vehicule, AbsenceEnfant, Enfant,
  Incident, Alerte, Reparation,
} from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────
type SB  = ReturnType<typeof createClient>;
type Pill = "circuits" | "vehicules" | "conducteurs" | "absents" | "incidents" | "alertes";

// ── Mobile nav ────────────────────────────────────────────────────────────────
const NAV = [
  { path: "/gestionnaire",             icon: "🏠", label: "Tableau de bord" },
  { path: "/gestionnaire/rapport",     icon: "📋", label: "Rapport journalier" },
  { path: "/gestionnaire/conducteurs", icon: "👤", label: "Conducteurs" },
  { path: "/gestionnaire/vehicules",   icon: "🚌", label: "Véhicules" },
  { path: "/gestionnaire/circuits",    icon: "🛣️", label: "Circuits" },
  { path: "/gestionnaire/incidents",   icon: "🚨", label: "Incidents" },
  { path: "/gestionnaire/alertes",     icon: "🔔", label: "Alertes" },
  { path: "/gestionnaire/export",      icon: "📊", label: "Exports" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const isoToday = () => new Date().toISOString().slice(0, 10);
const fmtTime  = (d: string) => new Date(d).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
const fmtDT    = (d: string) => new Date(d).toLocaleString("fr-CH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const inputSt: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.gray200}`,
  fontSize: 13, color: C.gray800, fontFamily: "inherit", boxSizing: "border-box",
};
const labelSt: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: C.gray600,
  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block",
};

// ── AssignModal ───────────────────────────────────────────────────────────────
function AssignModal({ driver, drivers, circuits, onClose, onAssign }: {
  driver: Conducteur; drivers: Conducteur[]; circuits: Circuit[];
  onClose: () => void;
  onAssign: (absentId: number, replacerId: number, circuitId: string) => Promise<void>;
}) {
  const [step, setStep] = useState<"info" | "pick" | "done">("info");
  const [sel,  setSel]  = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const circ = circuits.find(c => c.id === driver.circuit_id);
  const avail = drivers.filter(d => d.id !== driver.id && ["disponible", "en_attente"].includes(d.status));

  const doAssign = async () => {
    if (!sel || !circ) return;
    setBusy(true);
    await onAssign(driver.id, sel, circ.id);
    setBusy(false);
    setStep("done");
  };

  return (
    <Modal title={`Absence : ${driver.prenom} ${driver.nom}`} onClose={onClose}>
      {step === "info" && <>
        <div style={{ background: C.redL, borderRadius: 12, padding: 16, marginBottom: 16, border: `1px solid #FCA5A5` }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Avatar initials={driver.photo_initials} size={44} color={C.red} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.red }}>{driver.prenom} {driver.nom}</div>
              <div style={{ fontSize: 12, color: C.gray600, marginTop: 2 }}>{driver.absence_motif || "Motif non renseigné"}</div>
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          <InfoBox label="Circuit à couvrir" value={circ ? `${circ.emoji} ${circ.nom} (${circ.num})` : "—"} highlight={C.red} />
          <InfoBox label="Véhicule habituel" value={driver.vehicule?.plaque || "—"} />
          <InfoBox label="École" value={circ?.cercle?.nom || "—"} />
          <InfoBox label="Enfants" value={circ ? `${circ.enfants_count} enfants` : "—"} />
        </div>
        {circ
          ? <div style={{ background: C.amberL, borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, border: `1px solid #FDE68A` }}>
              ⚠️ Circuit <strong>{circ.nom}</strong> non couvert. Assignez un remplaçant.
            </div>
          : <div style={{ background: C.gray100, borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
              Ce conducteur n'a pas de circuit assigné.
            </div>
        }
        <Btn full onClick={() => setStep("pick")} color={C.navyL}>Trouver un remplaçant →</Btn>
      </>}

      {step === "pick" && <>
        <button onClick={() => setStep("info")}
          style={{ background: "none", border: "none", color: C.navyL, cursor: "pointer", fontWeight: 700, fontSize: 13, padding: 0, marginBottom: 14 }}>
          ← Retour
        </button>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Conducteurs disponibles</div>
        <div style={{ fontSize: 12, color: C.gray400, marginBottom: 12 }}>
          Pour couvrir {circ?.emoji} {circ?.nom}
        </div>
        {avail.length === 0
          ? <div style={{ textAlign: "center", padding: 20, color: C.gray400, fontSize: 13 }}>Aucun conducteur disponible.</div>
          : avail.map(d => (
            <div key={d.id} onClick={() => setSel(d.id)}
              style={{ display: "flex", gap: 12, alignItems: "center", padding: 12, borderRadius: 10, marginBottom: 8,
                border: `2px solid ${sel === d.id ? C.navyL : C.gray200}`,
                background: sel === d.id ? C.skyL : C.white, cursor: "pointer" }}>
              <Avatar initials={d.photo_initials} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: C.gray800 }}>{d.prenom} {d.nom}</div>
                <div style={{ fontSize: 12, color: C.gray400, marginTop: 1 }}>Permis {d.permis || "—"} · {d.tel || "—"}</div>
              </div>
              <Badge color={statusColor(d.status) as "green" | "red" | "amber" | "blue" | "gray"}>
                {statusLabel(d.status)}
              </Badge>
            </div>
          ))
        }
        <div style={{ marginTop: 12 }}>
          <Btn full onClick={doAssign} disabled={!sel || !circ || busy} color={C.green}>
            {busy ? "Attribution..." : "✅ Attribuer le circuit"}
          </Btn>
        </div>
      </>}

      {step === "done" && (
        <div style={{ textAlign: "center", padding: "32px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.green }}>Circuit attribué !</div>
          <div style={{ fontSize: 13, color: C.gray600, marginTop: 8 }}>Le conducteur remplaçant a été notifié.</div>
          <div style={{ marginTop: 20 }}><Btn onClick={onClose} outline color={C.navyL}>Fermer</Btn></div>
        </div>
      )}
    </Modal>
  );
}

// ── ChildAbsModal ─────────────────────────────────────────────────────────────
function ChildAbsModal({ absence, enfants, drivers, circuits, onClose, onTransmit }: {
  absence: AbsenceEnfant; enfants: Enfant[]; drivers: Conducteur[]; circuits: Circuit[];
  onClose: () => void;
  onTransmit: (id: number) => Promise<void>;
}) {
  const child = absence.enfant || enfants.find(e => e.id === absence.enfant_id);
  const circ  = circuits.find(c => c.id === absence.circuit_id);
  const drv   = drivers.find(d => d.circuit_id === absence.circuit_id);
  const [done, setDone] = useState(absence.transmitted_to_driver);
  const [busy, setBusy] = useState(false);

  const doTransmit = async () => {
    setBusy(true);
    await onTransmit(absence.id);
    setDone(true);
    setBusy(false);
  };

  return (
    <Modal title="Absence enfant" onClose={onClose}>
      <div style={{ background: C.amberL, borderRadius: 12, padding: 16, marginBottom: 16, border: `1px solid #FDE68A` }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.amber, marginBottom: 4 }}>
          ⚠️ {child?.prenom} {child?.nom}
        </div>
        <div style={{ fontSize: 13, color: C.gray800 }}>Motif : <strong>{absence.reason}</strong></div>
        <div style={{ fontSize: 12, color: C.gray600, marginTop: 4 }}>
          Signalé par {absence.reported_by} à {fmtTime(absence.reported_at)}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        <InfoBox label="Circuit"   value={circ ? `${circ.emoji} ${circ.nom}` : "—"} />
        <InfoBox label="École"     value={circ?.cercle?.nom || "—"} />
        <InfoBox label="Conducteur" value={drv ? `${drv.prenom} ${drv.nom}` : "—"} />
        <InfoBox label="Parent"    value={child?.parent_nom || "—"} />
        <InfoBox label="Tél. parent" value={child?.parent_tel || "—"} />
      </div>
      {!done
        ? <Btn full onClick={doTransmit} color={C.navyL} disabled={busy}>
            {busy ? "Envoi..." : `📨 Transmettre au conducteur${drv ? ` (${drv.prenom} ${drv.nom})` : ""}`}
          </Btn>
        : <div style={{ textAlign: "center", padding: 12, background: C.greenL, borderRadius: 8, color: C.green, fontWeight: 700 }}>
            ✅ Transmis au conducteur
          </div>
      }
    </Modal>
  );
}

// ── IncidentActionModal ───────────────────────────────────────────────────────
function IncidentActionModal({ incident, drivers, vehicles, circuits, onClose, onAction }: {
  incident: Incident; drivers: Conducteur[]; vehicles: Vehicule[]; circuits: Circuit[];
  onClose: () => void;
  onAction: (id: number, response: string, status: "en_cours" | "resolu", extra?: string) => Promise<void>;
}) {
  const [response, setResponse] = useState(incident.response || "");
  const [status,   setStatus]   = useState<"en_cours" | "resolu">(
    incident.status === "resolu" ? "resolu" : "en_cours"
  );
  const [busy, setBusy] = useState(false);

  const drv  = incident.conducteur || drivers.find(d => d.id === incident.conducteur_id);
  const veh  = incident.vehicule   || vehicles.find(v => v.id === incident.vehicule_id);
  const circ = incident.circuit    || circuits.find(c => c.id === incident.circuit_id);

  const TYPE_LABEL: Record<string, string> = {
    panne: "🔧 Panne véhicule", voyant: "💡 Voyant moteur", accident: "🚨 Accident",
    retard: "⏰ Retard", degradation: "🪟 Dégradation", enfant: "👶 Problème enfant",
    parent: "👨‍👩‍👧 Problème parent", autre: "❓ Autre",
  };

  const isPanne  = ["panne", "voyant", "accident", "degradation"].includes(incident.type);
  const isRetard = incident.type === "retard";
  const isPers   = ["enfant", "parent"].includes(incident.type);

  const quick = async (msg: string, extra?: string) => {
    setBusy(true);
    await onAction(incident.id, msg, "en_cours", extra);
    setBusy(false);
    onClose();
  };

  const save = async () => {
    setBusy(true);
    await onAction(incident.id, response, status);
    setBusy(false);
    onClose();
  };

  const btnRow: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
    borderRadius: 10, border: `1px solid ${C.gray200}`, marginBottom: 8,
    background: C.white, cursor: "pointer", fontSize: 13, fontWeight: 600,
    color: C.gray800, width: "100%", textAlign: "left",
  };

  return (
    <Modal title="Traiter l'incident" onClose={onClose} wide>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Left: details */}
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: C.gray800, marginBottom: 6 }}>
            {TYPE_LABEL[incident.type] || incident.type}
          </div>
          <Badge color={incident.status === "resolu" ? "green" : incident.status === "en_cours" ? "blue" : "amber"}>
            {incident.status === "resolu" ? "Résolu" : incident.status === "en_cours" ? "En cours" : "En attente"}
          </Badge>
          <div style={{ background: C.gray50, borderRadius: 10, padding: 14, margin: "12px 0", fontSize: 13, lineHeight: 1.5 }}>
            {incident.description}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <InfoBox label="Signalé le"  value={fmtDT(incident.reported_at)} />
            <InfoBox label="Conducteur"  value={drv  ? `${drv.prenom} ${drv.nom}` : "—"} />
            <InfoBox label="Véhicule"    value={veh?.plaque || "—"} />
            <InfoBox label="Circuit"     value={circ ? `${circ.emoji} ${circ.nom}` : "—"} />
            {drv?.tel && <InfoBox label="Tél." value={drv.tel} full />}
          </div>
        </div>

        {/* Right: actions */}
        <div>
          {/* Quick actions by type */}
          {isPanne && <>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.gray600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
              Actions rapides
            </div>
            <button style={btnRow} onClick={() => quick(`Incident transmis au mécanicien pour véhicule ${veh?.plaque || ""}`, "transmis_meca")}>
              🔧 Envoyer au mécanicien
            </button>
            <button style={btnRow} onClick={() => quick(`Véhicule ${veh?.plaque || ""} immobilisé suite à l'incident.`, "immobiliser")}>
              🚫 Immobiliser le véhicule
            </button>
          </>}
          {isRetard && <>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.gray600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
              Actions rapides
            </div>
            <button style={btnRow} onClick={() => quick("L'école a été informée du retard.")}>
              🏫 Informer l'école
            </button>
            <button style={btnRow} onClick={() => quick("Les parents ont été informés du retard.")}>
              👨‍👩‍👧 Informer les parents
            </button>
          </>}
          {isPers && <>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.gray600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
              Actions rapides
            </div>
            <button style={btnRow} onClick={() => quick("Le parent a été contacté.")}>
              📞 Contacter le parent
            </button>
            <button style={btnRow} onClick={() => quick("L'école a été contactée.")}>
              🏫 Contacter l'école
            </button>
          </>}

          {/* Response textarea */}
          <div style={{ marginTop: 12 }}>
            <label style={labelSt}>Réponse / note</label>
            <textarea value={response} onChange={e => setResponse(e.target.value)} rows={3}
              style={{ ...inputSt, resize: "vertical" }} placeholder="Décrivez l'action prise..." />
          </div>

          {/* Status toggle */}
          <div style={{ display: "flex", gap: 8, margin: "10px 0" }}>
            {(["en_cours", "resolu"] as const).map(s => (
              <button key={s} onClick={() => setStatus(s)}
                style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `2px solid ${status === s ? C.green : C.gray200}`,
                  background: status === s ? C.greenL : C.white,
                  fontWeight: 700, fontSize: 12, cursor: "pointer",
                  color: status === s ? C.green : C.gray600 }}>
                {s === "resolu" ? "✅ Résolu" : "🔄 En cours"}
              </button>
            ))}
          </div>

          <Btn full onClick={save} color={status === "resolu" ? C.green : C.navyL} disabled={busy}>
            {busy ? "Sauvegarde..." : status === "resolu" ? "✅ Résoudre l'incident" : "💾 Enregistrer"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function GestionnaireDashboard() {
  const sb     = createClient();
  const router = useRouter();

  const [gestPrenom,  setGestPrenom]  = useState("");
  const [drivers,     setDrivers]     = useState<Conducteur[]>([]);
  const [vehicles,    setVehicles]    = useState<Vehicule[]>([]);
  const [circuits,    setCircuits]    = useState<Circuit[]>([]);
  const [enfants,     setEnfants]     = useState<Enfant[]>([]);
  const [todayAbs,    setTodayAbs]    = useState<AbsenceEnfant[]>([]);
  const [incidents,   setIncidents]   = useState<Incident[]>([]);
  const [alerts,      setAlerts]      = useState<Alerte[]>([]);
  const [reparations, setReparations] = useState<Reparation[]>([]);
  const [loading,     setLoading]     = useState(true);

  const [pill,        setPill]        = useState<Pill>("circuits");
  const [drawerOpen,  setDrawerOpen]  = useState(false);
  const [incFilter,   setIncFilter]   = useState("");
  const [absentModal, setAbsentModal] = useState<Conducteur | null>(null);
  const [childAbsM,   setChildAbsM]   = useState<AbsenceEnfant | null>(null);
  const [incModal,    setIncModal]    = useState<Incident | null>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      const { data: p } = await sb.from("profiles").select("prenom").eq("id", user.id).single();
      if (p?.prenom) setGestPrenom(p.prenom);
    }

    const today = isoToday();

    const [drv, veh, cir, enf, absT, inc, alt, rep] = await Promise.all([
      sb.from("conducteurs")
        .select("*,circuit:circuits(*,cercle:cercles_scolaires(*)),vehicule:vehicules(*)")
        .order("nom"),
      sb.from("vehicules").select("*").order("plaque"),
      sb.from("circuits").select("*,cercle:cercles_scolaires(*)").order("num"),
      sb.from("enfants").select("*").order("nom"),
      sb.from("absences_enfants")
        .select("*,enfant:enfants(*)")
        .eq("date_absence", today)
        .order("reported_at", { ascending: false }),
      sb.from("incidents")
        .select("*,vehicule:vehicules(*),conducteur:conducteurs(*),circuit:circuits(*)")
        .neq("status", "resolu")
        .order("reported_at", { ascending: false })
        .limit(50),
      sb.from("alertes")
        .select("*")
        .eq("read", false)
        .order("created_at", { ascending: false })
        .limit(50),
      sb.from("reparations")
        .select("*,vehicule:vehicules(*)")
        .not("statut", "in", "(remis_en_circulation,annulee)")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    setDrivers(drv.data ?? []);
    setVehicles(veh.data ?? []);
    setCircuits(cir.data ?? []);
    setEnfants(enf.data ?? []);
    setTodayAbs(absT.data ?? []);
    setIncidents(inc.data ?? []);
    setAlerts(alt.data ?? []);
    setReparations(rep.data ?? []);
    setLoading(false);
  }, [sb]);

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchAll();
    const ch = sb.channel("gest-dashboard-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" },         fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "conducteurs" },       fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicules" },         fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "alertes" },           fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "absences_enfants" }, fetchAll)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [fetchAll, sb]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleAssign = async (absentId: number, replacerId: number, circuitId: string) => {
    const absent   = drivers.find(d => d.id === absentId);
    const replacer = drivers.find(d => d.id === replacerId);
    await sb.from("conducteurs").update({ status: "en_service", circuit_id: circuitId }).eq("id", replacerId);
    await sb.from("absences_conducteurs").insert({
      conducteur_id: absentId, date_absence: isoToday(),
      motif: absent?.absence_motif || "", remplacant_id: replacerId,
      circuit_id: circuitId, status: "couvert",
    });
    await sb.from("alertes").insert({
      type: "conducteur", severity: "normale",
      message: `${replacer?.prenom || ""} ${replacer?.nom || ""} prend en charge le circuit de ${absent?.prenom} ${absent?.nom} (absent).`,
      read: false, driver_id: replacerId,
    });
    fetchAll();
    setAbsentModal(null);
  };

  const handleTransmit = async (absenceId: number) => {
    await sb.from("absences_enfants")
      .update({ transmitted_to_driver: true, read_by_gestionnaire: true })
      .eq("id", absenceId);
    fetchAll();
  };

  const handleIncidentAction = async (id: number, response: string, status: "en_cours" | "resolu", extra?: string) => {
    await sb.from("incidents")
      .update({ response, status, resolved_at: status === "resolu" ? new Date().toISOString() : null })
      .eq("id", id);
    if (extra === "transmis_meca") {
      const inc = incidents.find(i => i.id === id);
      await sb.from("alertes").insert({
        type: "transmis_meca", severity: "haute",
        message: `Incident transmis au mécanicien : ${inc?.vehicule?.plaque || inc?.vehicule_id || ""} — ${inc?.description?.slice(0, 100) || ""}`,
        read: false, vehicle_id: inc?.vehicule_id,
      });
    }
    if (extra === "immobiliser") {
      const inc = incidents.find(i => i.id === id);
      if (inc?.vehicule_id) await sb.from("vehicules").update({ etat: "atelier" }).eq("id", inc.vehicule_id);
    }
    fetchAll();
    setIncModal(null);
  };

  // ── Computed ──────────────────────────────────────────────────────────────
  const enServiceVeh  = vehicles.filter(v => (v.etat as string) === "bon");
  const enServiceDrv  = drivers.filter(d => d.status === "en_service");
  const absents       = drivers.filter(d => d.status === "absent");
  const openInc       = incidents;
  const unreadAlerts  = alerts;
  const newChildAbs   = todayAbs.filter(a => !a.read_by_gestionnaire);
  const coveredCirc   = circuits.filter(c => enServiceDrv.some(d => d.circuit_id === c.id));

  const filteredInc = incFilter ? openInc.filter(i => i.type === incFilter) : openInc;

  // ── Pills ─────────────────────────────────────────────────────────────────
  type PillCfg = { id: Pill; icon: string; label: string; count: number; accent: string; urgent?: boolean };
  const PILLS: PillCfg[] = [
    { id: "circuits",    icon: "🛣️", label: "Circuits",   count: circuits.length,     accent: C.navyL },
    { id: "vehicules",   icon: "🚌", label: "En service",  count: enServiceVeh.length, accent: enServiceVeh.length > 0 ? C.green : C.gray400 },
    { id: "conducteurs", icon: "👤", label: "Présents",    count: enServiceDrv.length, accent: C.navyL },
    { id: "absents",     icon: "⚠️", label: "Absents",     count: absents.length,      accent: absents.length > 0 ? C.amber : C.gray400, urgent: absents.length > 0 },
    { id: "incidents",   icon: "🚨", label: "Incidents",   count: openInc.length,      accent: openInc.length > 0 ? C.red : C.green,   urgent: openInc.length > 0 },
    { id: "alertes",     icon: "🔔", label: "Alertes",     count: unreadAlerts.length, accent: unreadAlerts.length > 0 ? C.amber : C.gray400 },
  ];

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh",
      flexDirection: "column", gap: 12, color: C.gray400 }}>
      <div style={{ fontSize: 36 }}>⏳</div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>Chargement…</div>
    </div>
  );

  // ── Shared row style ──────────────────────────────────────────────────────
  const row: React.CSSProperties = {
    padding: "11px 16px", borderBottom: `1px solid ${C.gray100}`,
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
  };

  const sectionHeader = (title: string, link: string, linkLabel = "Voir tout →") => (
    <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.gray200}`,
      display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontWeight: 700, fontSize: 14, color: C.gray800 }}>{title}</span>
      <button onClick={() => router.push(link)}
        style={{ background: "none", border: "none", color: C.navyL, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
        {linkLabel}
      </button>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>

      {/* Global modals */}
      {absentModal && (
        <AssignModal driver={absentModal} drivers={drivers} circuits={circuits}
          onClose={() => setAbsentModal(null)} onAssign={handleAssign} />
      )}
      {childAbsM && (
        <ChildAbsModal absence={childAbsM} enfants={enfants} drivers={drivers} circuits={circuits}
          onClose={() => setChildAbsM(null)} onTransmit={handleTransmit} />
      )}
      {incModal && (
        <IncidentActionModal incident={incModal} drivers={drivers} vehicles={vehicles} circuits={circuits}
          onClose={() => setIncModal(null)} onAction={handleIncidentAction} />
      )}

      {/* ── Mobile header (hamburger) ────────────────────────────────────── */}
      <div className="tx-mobile-header" style={{
        position: "sticky", top: 0, zIndex: 200, background: C.white,
        borderBottom: `1px solid ${C.gray200}`, padding: "0 16px", height: 48,
        alignItems: "center", justifyContent: "space-between",
        marginBottom: 12, marginLeft: -16, marginRight: -16, width: "calc(100% + 32px)",
      }}>
        <span style={{ fontWeight: 800, fontSize: 14, color: C.navy }}>Tableau de bord</span>
        <button onClick={() => setDrawerOpen(v => !v)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 8, fontSize: 22, color: C.navy }}>
          ☰
        </button>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex" }}>
          <div style={{ flex: 1, background: "rgba(0,0,0,0.4)" }} onClick={() => setDrawerOpen(false)} />
          <div style={{ width: 260, background: C.white, height: "100%", overflowY: "auto",
            boxShadow: "-4px 0 20px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 16px 10px", borderBottom: `1px solid ${C.gray100}`,
              fontWeight: 800, fontSize: 15, color: C.navy }}>
              Navigation
            </div>
            {NAV.map(n => (
              <button key={n.path} onClick={() => { router.push(n.path); setDrawerOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                  border: "none", background: C.white, color: C.gray800, fontSize: 14,
                  cursor: "pointer", textAlign: "left", borderBottom: `1px solid ${C.gray100}` }}>
                <span style={{ fontSize: 18 }}>{n.icon}</span>
                <span>{n.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Welcome banner ────────────────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg,${C.navy},${C.navyL})`,
        borderRadius: 14, padding: "20px 24px", marginBottom: 20,
        color: C.white, display: "flex", justifyContent: "space-between",
        alignItems: "center", flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 2 }}>
            Bonjour {gestPrenom} !
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{todayStr()}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {openInc.length > 0 && (
            <div style={{ background: "rgba(220,38,38,0.35)", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>
              ⚡ {openInc.length} incident(s)
            </div>
          )}
          {absents.length > 0 && (
            <div style={{ background: "rgba(217,119,6,0.35)", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>
              ⚠️ {absents.length} absent(s)
            </div>
          )}
          {newChildAbs.length > 0 && (
            <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>
              👶 {newChildAbs.length} absence(s) enfant
            </div>
          )}
        </div>
      </div>

      {/* ── 6 Pills ───────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {PILLS.map(p => {
          const active = pill === p.id;
          return (
            <button key={p.id} onClick={() => setPill(p.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 100,
                border: `2px solid ${active ? p.accent : C.gray200}`,
                background: active ? p.accent : C.white,
                color: active ? C.white : p.urgent ? p.accent : C.gray600,
                fontWeight: 700, fontSize: 13, cursor: "pointer",
                transition: "all .15s",
                boxShadow: active ? `0 2px 8px ${p.accent}44` : "none",
              }}>
              <span style={{ fontSize: 15 }}>{p.icon}</span>
              <span>{p.label}</span>
              <span style={{
                background: active ? "rgba(255,255,255,0.3)" : (p.urgent ? p.accent : C.gray200),
                color: active ? C.white : (p.urgent ? C.white : C.gray600),
                borderRadius: 100, fontSize: 11, fontWeight: 800,
                padding: "1px 7px", minWidth: 18, textAlign: "center",
              }}>
                {p.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Content area ──────────────────────────────────────────────────── */}
      <Card>

        {/* CIRCUITS ─────────────────────────────────────────────────────── */}
        {pill === "circuits" && <>
          {sectionHeader(`🛣️ Circuits du jour (${coveredCirc.length}/${circuits.length} couverts)`, "/gestionnaire/circuits")}
          <div style={{ maxHeight: 520, overflowY: "auto" }}>
            {circuits.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: C.gray400 }}>Aucun circuit configuré</div>
            )}
            {circuits.map(circ => {
              const drv      = drivers.find(d => d.circuit_id === circ.id && d.status !== "absent");
              const absDrv   = drivers.find(d => d.circuit_id === circ.id && d.status === "absent");
              const uncovered = !drv;
              return (
                <div key={circ.id} style={{
                  ...row, background: uncovered ? "#FFF5F5" : C.white,
                }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{circ.emoji}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: C.gray800 }}>{circ.num} · {circ.nom}</div>
                      <div style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>
                        {circ.cercle?.nom} · {circ.enfants_count} enfants
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {drv && (
                      <span style={{ fontSize: 12, color: C.gray600 }}>{drv.prenom} {drv.nom}</span>
                    )}
                    {!drv && absDrv && (
                      <button onClick={() => setAbsentModal(absDrv)}
                        style={{ background: C.redL, border: `1px solid #FCA5A5`, color: C.red,
                          borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        ⚠️ Gérer l'absence
                      </button>
                    )}
                    <Badge color={drv ? (drv.status === "en_service" ? "green" : "amber") : "red"}>
                      {drv ? statusLabel(drv.status) : "Non couvert"}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Absences enfants du jour */}
          {todayAbs.length > 0 && (
            <>
              <div style={{ padding: "12px 16px", borderTop: `2px solid ${C.gray100}`, borderBottom: `1px solid ${C.gray200}`,
                fontWeight: 700, fontSize: 13, color: C.gray800 }}>
                👶 Absences enfants du jour ({todayAbs.length})
                {newChildAbs.length > 0 && <span style={{ color: C.red, marginLeft: 6 }}>{newChildAbs.length} nouvelles</span>}
              </div>
              {todayAbs.slice(0, 5).map(a => {
                const child = a.enfant || enfants.find(e => e.id === a.enfant_id);
                const circ  = circuits.find(c => c.id === a.circuit_id);
                return (
                  <div key={a.id} onClick={() => setChildAbsM(a)}
                    style={{ ...row, cursor: "pointer", background: a.read_by_gestionnaire ? C.white : C.amberL }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: C.gray800 }}>{child?.prenom} {child?.nom}</div>
                      <div style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>
                        {a.reason} · {circ?.emoji} {circ?.nom} · {fmtTime(a.reported_at)}
                      </div>
                    </div>
                    <Badge color={a.transmitted_to_driver ? "green" : "amber"}>
                      {a.transmitted_to_driver ? "Transmis" : "À transmettre"}
                    </Badge>
                  </div>
                );
              })}
            </>
          )}
        </>}

        {/* VÉHICULES ────────────────────────────────────────────────────── */}
        {pill === "vehicules" && <>
          {sectionHeader("🚌 Véhicules en service", "/gestionnaire/vehicules")}
          <div style={{ maxHeight: 520, overflowY: "auto" }}>
            {vehicles.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: C.gray400 }}>Aucun véhicule</div>
            )}
            {vehicles.map(v => {
              const drv  = drivers.find(d => d.vehicule_id === v.id);
              const etat = (v.etat as string);
              const color = etat === "bon" ? C.green : etat === "atelier" ? C.red : C.amber;
              const bg    = etat === "bon" ? C.greenL : etat === "atelier" ? C.redL : C.amberL;
              return (
                <div key={v.id} style={{ ...row }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: bg,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, flexShrink: 0 }}>
                      🚌
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: C.gray800 }}>{v.plaque}</div>
                      <div style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>
                        {v.marque} {v.modele} · {v.places} pl.
                        {drv && ` · ${drv.prenom} ${drv.nom}`}
                      </div>
                    </div>
                  </div>
                  <Badge color={etat === "bon" ? "green" : etat === "atelier" ? "red" : "amber"}>
                    {etat === "bon" ? "En service" : etat === "atelier" ? "Atelier" : "Attention"}
                  </Badge>
                </div>
              );
            })}
          </div>
          {reparations.length > 0 && (
            <>
              <div style={{ padding: "12px 16px", borderTop: `2px solid ${C.gray100}`, borderBottom: `1px solid ${C.gray200}`,
                fontWeight: 700, fontSize: 13, color: C.gray800 }}>
                🔧 Réparations en cours ({reparations.length})
              </div>
              {reparations.map(r => (
                <div key={r.id} style={row}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{r.vehicule?.plaque || r.vehicule_id}</div>
                    <div style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>{r.description?.slice(0, 60)}</div>
                  </div>
                  {r.cout && <span style={{ fontSize: 12, color: C.amber, fontWeight: 700 }}>{r.cout} CHF</span>}
                </div>
              ))}
            </>
          )}
        </>}

        {/* CONDUCTEURS PRÉSENTS ─────────────────────────────────────────── */}
        {pill === "conducteurs" && <>
          {sectionHeader(`👤 Conducteurs en service aujourd'hui (${enServiceDrv.length})`, "/gestionnaire/conducteurs")}
          <div style={{ maxHeight: 520, overflowY: "auto" }}>
            {enServiceDrv.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: C.gray400 }}>Aucun conducteur en service aujourd'hui</div>
            )}
            {enServiceDrv.map(d => {
              const circ = circuits.find(c => c.id === d.circuit_id);
              const veh  = vehicles.find(v => v.id === d.vehicule_id);
              return (
                <div key={d.id} style={row}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <Avatar initials={d.photo_initials} size={36} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: C.gray800 }}>{d.prenom} {d.nom}</div>
                      <div style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>
                        {circ ? `${circ.emoji} ${circ.nom}` : "Sans circuit"}
                        {veh && ` · ${veh.plaque}`}
                        {d.tel && ` · ${d.tel}`}
                      </div>
                    </div>
                  </div>
                  <Badge color="green">En service</Badge>
                </div>
              );
            })}
          </div>
        </>}

        {/* ABSENTS ─────────────────────────────────────────────────────── */}
        {pill === "absents" && <>
          {sectionHeader(`⚠️ Absents du jour (${absents.length})`, "/gestionnaire/conducteurs")}
          <div style={{ maxHeight: 520, overflowY: "auto" }}>
            {absents.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: C.gray400 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                Aucune absence aujourd'hui
              </div>
            )}
            {absents.map(d => {
              const circ = circuits.find(c => c.id === d.circuit_id);
              return (
                <div key={d.id} style={{ ...row, background: C.redL }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1 }}>
                    <Avatar initials={d.photo_initials} size={36} color={C.red} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: C.red }}>{d.prenom} {d.nom}</div>
                      <div style={{ fontSize: 11, color: C.gray600, marginTop: 1 }}>
                        {d.absence_motif || "Motif non renseigné"}
                        {circ && ` · Circuit : ${circ.emoji} ${circ.nom}`}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setAbsentModal(d)}
                    style={{ background: C.navyL, color: C.white, border: "none", borderRadius: 8,
                      padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                    Gérer →
                  </button>
                </div>
              );
            })}
          </div>
        </>}

        {/* INCIDENTS ───────────────────────────────────────────────────── */}
        {pill === "incidents" && <>
          <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.gray200}`,
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: C.gray800 }}>
              🚨 Incidents ouverts ({openInc.length})
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select value={incFilter} onChange={e => setIncFilter(e.target.value)}
                style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.gray200}`,
                  fontSize: 12, color: C.gray600, background: C.white, cursor: "pointer" }}>
                <option value="">Tous les types</option>
                <option value="panne">Panne</option>
                <option value="voyant">Voyant</option>
                <option value="accident">Accident</option>
                <option value="retard">Retard</option>
                <option value="degradation">Dégradation</option>
                <option value="enfant">Enfant</option>
                <option value="parent">Parent</option>
                <option value="autre">Autre</option>
              </select>
              <button onClick={() => router.push("/gestionnaire/incidents")}
                style={{ background: "none", border: "none", color: C.navyL, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Voir tout →
              </button>
            </div>
          </div>
          <div style={{ maxHeight: 520, overflowY: "auto" }}>
            {filteredInc.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: C.gray400 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                Aucun incident ouvert
              </div>
            )}
            {filteredInc.map(i => {
              const TYPE_ICON: Record<string, string> = {
                panne: "🔧", voyant: "💡", accident: "🚨", retard: "⏰",
                degradation: "🪟", enfant: "👶", parent: "👨‍👩‍👧", autre: "❓",
              };
              return (
                <div key={i.id} onClick={() => setIncModal(i)}
                  style={{ ...row, cursor: "pointer" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{TYPE_ICON[i.type] || "❓"}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: C.gray800, marginBottom: 2 }}>
                        {i.description.slice(0, 80)}{i.description.length > 80 ? "…" : ""}
                      </div>
                      <div style={{ fontSize: 11, color: C.gray400 }}>
                        {i.conducteur ? `${i.conducteur.prenom} ${i.conducteur.nom}` : "—"}
                        {i.vehicule ? ` · ${i.vehicule.plaque}` : ""}
                        {" · "}{fmtDT(i.reported_at)}
                      </div>
                    </div>
                  </div>
                  <Badge color={i.status === "en_cours" ? "blue" : "amber"}>
                    {i.status === "en_cours" ? "En cours" : "À traiter"}
                  </Badge>
                </div>
              );
            })}
          </div>
        </>}

        {/* ALERTES ─────────────────────────────────────────────────────── */}
        {pill === "alertes" && <>
          {sectionHeader(`🔔 Alertes non lues (${unreadAlerts.length})`, "/gestionnaire/alertes")}
          <div style={{ maxHeight: 520, overflowY: "auto" }}>
            {unreadAlerts.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: C.gray400 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                Aucune alerte non lue
              </div>
            )}
            {unreadAlerts.map(a => {
              const SEVER_COLOR: Record<string, string> = {
                haute: C.red, normale: C.amber, basse: C.gray400,
              };
              const SEVER_BG: Record<string, string> = {
                haute: C.redL, normale: C.amberL, basse: C.gray100,
              };
              const TYPE_ICON: Record<string, string> = {
                conducteur: "👤", vehicule: "🚌", incident: "🚨", transmis_meca: "🔧",
                rapport_admin: "📋", alerte: "🔔", absence: "👶", autre: "❓",
              };
              return (
                <div key={a.id} style={{
                  ...row, background: SEVER_BG[a.severity] || C.white,
                  alignItems: "flex-start",
                }}>
                  <span style={{ fontSize: 18, flexShrink: 0, marginTop: 2 }}>
                    {TYPE_ICON[a.type] || "🔔"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: C.gray800, marginBottom: 2 }}>
                      {a.message.slice(0, 100)}{a.message.length > 100 ? "…" : ""}
                    </div>
                    <div style={{ fontSize: 11, color: C.gray400 }}>{fmtDT(a.created_at)}</div>
                  </div>
                  <button onClick={async e => {
                    e.stopPropagation();
                    await sb.from("alertes").update({ read: true, read_at: new Date().toISOString() }).eq("id", a.id);
                    fetchAll();
                  }} style={{ background: "none", border: `1px solid ${C.gray200}`, borderRadius: 6,
                    padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                    color: C.gray600, flexShrink: 0 }}>
                    ✓ Lu
                  </button>
                </div>
              );
            })}
          </div>
        </>}

      </Card>
    </div>
  );
}
