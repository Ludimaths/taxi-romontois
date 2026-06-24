"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { C, statusColor, statusLabel, todayStr, isoToday, fmtTime, fmtDateTime } from "@/lib/constants";
import { Badge, Avatar, Card, InfoBox, Btn, Modal } from "@/components/ui";
import {
  Bus, Users, UserX, AlertCircle, Bell, Route, Loader2, Menu,
  Home, FileText, Zap, User, MapPin, BarChart2, CheckCircle2,
  AlertTriangle, Wrench, Lightbulb, Clock, Baby, Phone, HelpCircle,
  ShieldAlert, Ban, RefreshCw, Repeat2, Settings,
} from "lucide-react";
import type {
  Conducteur, Circuit, Vehicule, AbsenceEnfant, Enfant,
  Incident, Alerte, Reparation,
} from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────
type SB = ReturnType<typeof createClient>;


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
          ? <div style={{ background: C.amberL, borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, border: `1px solid #FDE68A`, display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={14} color={C.amber} style={{ flexShrink: 0 }} />
              Circuit <strong>{circ.nom}</strong> non couvert — assignez un remplaçant.
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
            {busy ? "Attribution..." : "Attribuer le circuit"}
          </Btn>
        </div>
      </>}

      {step === "done" && (
        <div style={{ textAlign: "center", padding: "32px 0" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <CheckCircle2 size={48} color={C.green} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.green }}>Circuit attribué !</div>
          <div style={{ fontSize: 13, color: C.gray600, marginTop: 8 }}>
            Le remplaçant a été notifié et doit confirmer sa prise en charge.
          </div>
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
        <div style={{ fontSize: 15, fontWeight: 800, color: C.amber, marginBottom: 4, display: "flex", alignItems: "center", gap: 7 }}>
          <AlertTriangle size={15} /> {child?.prenom} {child?.nom}
        </div>
        <div style={{ fontSize: 13, color: C.gray800 }}>Motif : <strong>{absence.reason}</strong></div>
        <div style={{ fontSize: 12, color: C.gray600, marginTop: 4 }}>
          Signalé à {fmtTime(absence.reported_at)}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        <InfoBox label="Circuit"     value={circ ? `${circ.emoji} ${circ.nom}` : "—"} />
        <InfoBox label="École"       value={circ?.cercle?.nom || "—"} />
        <InfoBox label="Conducteur"  value={drv ? `${drv.prenom} ${drv.nom}` : "—"} />
        <InfoBox label="Tél. parent" value={child?.parent_tel || "—"} />
      </div>
      {!done
        ? <Btn full onClick={doTransmit} color={C.navyL} disabled={busy}>
            {busy ? "Envoi..." : `Transmettre au conducteur${drv ? ` (${drv.prenom} ${drv.nom})` : ""}`}
          </Btn>
        : <div style={{ textAlign: "center", padding: 12, background: C.greenL, borderRadius: 8, color: C.green, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            <CheckCircle2 size={15} /> Transmis au conducteur
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
  const [response,        setResponse]        = useState(incident.response || "");
  const [status,          setStatus]          = useState<"en_cours" | "resolu">(
    incident.status === "resolu" ? "resolu" : "en_cours"
  );
  const [busy,            setBusy]            = useState(false);
  const [vehicleOverride, setVehicleOverride] = useState(incident.vehicule_id || "");

  const drv  = incident.conducteur || drivers.find(d => d.id === incident.conducteur_id);
  const veh  = incident.vehicule   || vehicles.find(v => v.id === incident.vehicule_id);
  const circ = incident.circuit    || circuits.find(c => c.id === incident.circuit_id);

  const TYPE_LABEL: Record<string, string> = {
    panne: "Panne véhicule", voyant: "Voyant moteur", accident: "Accident",
    retard: "Retard", degradation: "Dégradation", enfant: "Problème enfant",
    parent: "Problème parent", autre: "Autre",
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

  const qBtn: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderRadius: 10,
    border: `1px solid ${C.gray200}`, marginBottom: 8, background: C.white,
    cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.gray800, width: "100%", textAlign: "left",
  };

  return (
    <Modal title="Traiter l'incident" onClose={onClose} wide>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
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
            <InfoBox label="Signalé le" value={fmtDateTime(incident.reported_at)} />
            <InfoBox label="Conducteur" value={drv ? `${drv.prenom} ${drv.nom}` : "—"} />
            <InfoBox label="Véhicule"   value={veh?.plaque || "—"} />
            <InfoBox label="Circuit"    value={circ ? `${circ.emoji} ${circ.nom}` : "—"} />
            {drv?.tel && <InfoBox label="Tél." value={drv.tel} full />}
          </div>
        </div>
        <div>
          {isPanne && <>
            <div style={{ ...labelSt, marginBottom: 8 }}>Actions rapides</div>
            {!veh && (
              <div style={{ marginBottom: 10 }}>
                <label style={{ ...labelSt, marginBottom: 4 }}>Véhicule concerné</label>
                <select value={vehicleOverride} onChange={e => setVehicleOverride(e.target.value)}
                  style={{ ...inputSt, padding: "8px 10px" }}>
                  <option value="">— Sélectionner un véhicule —</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.plaque} · {v.marque} {v.modele}</option>
                  ))}
                </select>
              </div>
            )}
            <button style={qBtn} onClick={() => {
              const vId = vehicleOverride || incident.vehicule_id || "";
              const vPlaque = vehicles.find(v => v.id === vId)?.plaque || veh?.plaque || "";
              quick(`Transmis au mécanicien — véhicule ${vPlaque}`, `transmis_meca|${vId}`);
            }}>
              Envoyer au mécanicien
            </button>
            <button style={qBtn} onClick={() => quick(`Véhicule ${veh?.plaque || ""} immobilisé.`, "immobiliser")}>
              Immobiliser le véhicule
            </button>
          </>}
          {isRetard && <>
            <div style={{ ...labelSt, marginBottom: 8 }}>Actions rapides</div>
            <button style={qBtn} onClick={() => quick("École informée du retard.")}>
              Informer l'école
            </button>
            <button style={qBtn} onClick={() => quick("Parents informés du retard.")}>
              Informer les parents
            </button>
          </>}
          {isPers && <>
            <div style={{ ...labelSt, marginBottom: 8 }}>Actions rapides</div>
            <button style={qBtn} onClick={() => quick("Parent contacté.")}>Contacter le parent</button>
            <button style={qBtn} onClick={() => quick("École contactée.")}>Contacter l'école</button>
          </>}
          <div style={{ marginTop: 12 }}>
            <label style={labelSt}>Réponse / note</label>
            <textarea value={response} onChange={e => setResponse(e.target.value)} rows={3}
              style={{ ...inputSt, resize: "vertical" }} placeholder="Action prise..." />
          </div>
          <div style={{ display: "flex", gap: 8, margin: "10px 0" }}>
            {(["en_cours", "resolu"] as const).map(s => (
              <button key={s} onClick={() => setStatus(s)}
                style={{ flex: 1, padding: "8px 0", borderRadius: 8,
                  border: `2px solid ${status === s ? C.green : C.gray200}`,
                  background: status === s ? C.greenL : C.white,
                  fontWeight: 700, fontSize: 12, cursor: "pointer",
                  color: status === s ? C.green : C.gray600 }}>
                {s === "resolu" ? "Résolu" : "En cours"}
              </button>
            ))}
          </div>
          <Btn full onClick={save} color={status === "resolu" ? C.green : C.navyL} disabled={busy}>
            {busy ? "Sauvegarde..." : status === "resolu" ? "Résoudre" : "Enregistrer"}
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

  const [drawerOpen,  setDrawerOpen]  = useState(false);
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
    const ch = sb.channel("gest-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" },              fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "conducteurs" },            fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicules" },              fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "alertes" },               fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "absences_enfants" },      fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "absences_conducteurs" },  fetchAll)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [fetchAll, sb]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleAssign = async (absentId: number, replacerId: number, circuitId: string) => {
    const absent   = drivers.find(d => d.id === absentId);
    const replacer = drivers.find(d => d.id === replacerId);
    const circ     = circuits.find(c => c.id === circuitId);

    // Mettre le remplaçant en service sur ce circuit
    await sb.from("conducteurs").update({ status: "en_service", circuit_id: circuitId }).eq("id", replacerId);

    // Enregistrer l'absence gérée
    await sb.from("absences_conducteurs").insert({
      conducteur_id: absentId,
      date_absence: isoToday(),
      motif: absent?.absence_motif || "",
      remplacant_id: replacerId,
      circuit_id: circuitId,
      status: "couvert",
    });

    // 1. Log historique pour le CONDUCTEUR ABSENT
    await sb.from("service_logs").insert({
      conducteur_id: absentId,
      date_service: isoToday(),
      status: "absent",
      notes: `Absent — Remplacé par ${replacer?.prenom || ""} ${replacer?.nom || ""}`,
    });

    // 2. Log historique pour le REMPLAÇANT
    await sb.from("service_logs").insert({
      conducteur_id: replacerId,
      circuit_id: circuitId,
      vehicule_id: absent?.vehicule_id || null,
      date_service: isoToday(),
      is_replacement: true,
      replacement_name: `${absent?.prenom || ""} ${absent?.nom || ""}`,
      status: "en_service",
      notes: `Remplacement de ${absent?.prenom || ""} ${absent?.nom || ""}`,
    });

    // Notification au remplaçant (type "remplacement" → conducteur voit un bouton "J'ai pris connaissance")
    await sb.from("alertes").insert({
      type: "remplacement",
      severity: "haute",
      message: `Vous remplacez ${absent?.prenom || ""} ${absent?.nom || ""} aujourd'hui sur le circuit ${circ?.emoji || ""} ${circ?.nom || ""} (${circ?.num || ""}). Merci de confirmer votre prise en charge.`,
      read: false,
      driver_id: replacerId,
    });

    // Notification globale gestionnaire/admin
    await sb.from("alertes").insert({
      type: "conducteur",
      severity: "normale",
      message: `${replacer?.prenom || ""} ${replacer?.nom || ""} remplace ${absent?.prenom || ""} ${absent?.nom || ""} — circuit ${circ?.nom || ""}.`,
      read: false,
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
    const inc = incidents.find(i => i.id === id);
    if (inc?.conducteur_id) {
      const notifMsg = response.trim()
        ? `Votre signalement a été traité : ${response}`
        : status === "resolu"
          ? `Votre signalement a été résolu.`
          : null;
      if (notifMsg) {
        await sb.from("alertes").insert({
          type: "conducteur", severity: "normale",
          message: notifMsg, read: false, driver_id: inc.conducteur_id,
        });
      }
    }
    if (extra?.startsWith("transmis_meca")) {
      const inc = incidents.find(i => i.id === id);
      const vIdFromExtra = extra.includes("|") ? extra.split("|")[1] : "";
      const vehicleIdToUse = vIdFromExtra || inc?.vehicule_id || null;
      const vPlaque = vehicles.find(v => v.id === vehicleIdToUse)?.plaque
        || (inc?.vehicule as { plaque?: string } | undefined)?.plaque
        || vehicleIdToUse || "";
      await sb.from("alertes").insert({
        type: "transmis_meca",
        severity: "haute",
        message: `Incident transmis au mécanicien : ${vPlaque} — ${inc?.description?.slice(0, 100) || ""}`,
        read: false,
        vehicle_id: vehicleIdToUse,
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
  const uncoveredCirc = circuits.filter(c => {
    const drv = drivers.find(d => d.circuit_id === c.id);
    return !drv || drv.status === "absent";
  });

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
      height: "60vh", flexDirection: "column", gap: 12, color: C.gray400 }}>
      <Loader2 size={36} style={{ animation: "spin 1s linear infinite" }} />
      <div style={{ fontWeight: 700, fontSize: 15 }}>Chargement…</div>
    </div>
  );

  // Stat card helper
  const stat = (
    icon: React.ReactNode, label: string, value: number, sub: string,
    borderColor: string, path: string, urgent = false
  ) => (
    <div onClick={() => router.push(path)}
      style={{ background: C.white, borderRadius: 14, padding: "20px", cursor: "pointer",
        border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        transition: "box-shadow .15s" }}>
      <div style={{ marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: urgent ? borderColor : "#0F172A", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: C.gray800, marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>{sub}</div>
    </div>
  );

  const row: React.CSSProperties = {
    padding: "11px 16px", borderBottom: `1px solid ${C.gray100}`,
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
  };

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

      {/* ── Mobile header ─────────────────────────────────────────────────── */}
      <div className="tx-mobile-header" style={{
        position: "sticky", top: 0, zIndex: 200, background: C.white,
        borderBottom: `1px solid ${C.gray200}`, padding: "0 16px", height: 48,
        alignItems: "center", justifyContent: "space-between",
        marginBottom: 12, marginLeft: -16, marginRight: -16, width: "calc(100% + 32px)",
      }}>
        <span style={{ fontWeight: 800, fontSize: 14, color: C.navy }}>Tableau de bord</span>
        <button onClick={() => setDrawerOpen(v => !v)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 8, color: C.navy, display: "flex" }}>
          <Menu size={22} />
        </button>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex" }}>
          <div style={{ flex: 1, background: "rgba(0,0,0,0.4)" }} onClick={() => setDrawerOpen(false)} />
          <div style={{ width: 260, background: C.white, height: "100%", overflowY: "auto",
            boxShadow: "-4px 0 20px rgba(0,0,0,0.15)" }}>
            <div style={{ padding: "16px 16px 10px", borderBottom: `1px solid ${C.gray100}`,
              fontWeight: 800, fontSize: 15, color: C.navy }}>
              Navigation
            </div>
            {([
              { path: "/gestionnaire",               icon: <Home size={17} />,       label: "Tableau de bord" },
              { path: "/gestionnaire/rapport",       icon: <FileText size={17} />,   label: "Rapport journalier" },
              { path: "/gestionnaire/imprevus",      icon: <Zap size={17} />,        label: "Imprévus" },
              { path: "/gestionnaire/conducteurs",   icon: <User size={17} />,       label: "Conducteurs" },
              { path: "/gestionnaire/vehicules",     icon: <Bus size={17} />,        label: "Véhicules" },
              { path: "/gestionnaire/circuits",      icon: <Route size={17} />,      label: "Circuits" },
              { path: "/gestionnaire/incidents",     icon: <AlertCircle size={17} />,label: "Incidents" },
              { path: "/gestionnaire/alertes",       icon: <Bell size={17} />,       label: "Alertes" },
              { path: "/gestionnaire/reparations",   icon: <Wrench size={17} />,     label: "Réparations" },
              { path: "/gestionnaire/parents",       icon: <Users size={17} />,      label: "Parents" },
              { path: "/gestionnaire/export",        icon: <BarChart2 size={17} />,  label: "Exports" },
            ] as { path: string; icon: React.ReactNode; label: string }[]).map(n => (
              <button key={n.path} onClick={() => { router.push(n.path); setDrawerOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                  border: "none", background: C.white, color: C.gray800, fontSize: 14,
                  cursor: "pointer", textAlign: "left", borderBottom: `1px solid ${C.gray100}`,
                  width: "100%" }}>
                <span style={{ color: C.gray600 }}>{n.icon}</span>
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
          <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 2 }}>Bonjour {gestPrenom} !</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{todayStr()}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {openInc.length > 0 && (
            <div style={{ background: "rgba(220,38,38,0.35)", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
              <AlertCircle size={12} /> {openInc.length} incident(s)
            </div>
          )}
          {absents.length > 0 && (
            <div style={{ background: "rgba(217,119,6,0.35)", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
              <AlertTriangle size={12} /> {absents.length} absent(s)
            </div>
          )}
          {newChildAbs.length > 0 && (
            <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
              <Baby size={12} /> {newChildAbs.length} absence(s) enfant
            </div>
          )}
        </div>
      </div>

      {/* ── 6 Métriques (naviguent vers sous-pages) ───────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 20 }}>
        {stat(<Bus size={22} color={enServiceVeh.length > 0 ? C.green : C.gray400} />,
          "Véhicules en service", enServiceVeh.length,
          `${vehicles.length - enServiceVeh.length} en atelier / hors service`,
          enServiceVeh.length > 0 ? C.green : C.gray400, "/gestionnaire/vehicules")}
        {stat(<Users size={22} color={C.navyL} />,
          "Conducteurs présents", enServiceDrv.length,
          `${drivers.filter(d => d.status === "disponible").length} disponibles`,
          C.navyL, "/gestionnaire/conducteurs?status=en_service")}
        {stat(<UserX size={22} color={absents.length > 0 ? C.amber : C.gray400} />,
          "Absents du jour", absents.length,
          `${absents.filter(d => !!d.circuit_id).length} circuits à couvrir`,
          absents.length > 0 ? C.amber : C.gray400, "/gestionnaire/conducteurs", absents.length > 0)}
        {stat(<AlertCircle size={22} color={openInc.length > 0 ? C.red : C.green} />,
          "Incidents ouverts", openInc.length,
          "Temps réel · màj automatique",
          openInc.length > 0 ? C.red : C.green, "/gestionnaire/incidents", openInc.length > 0)}
        {stat(<Bell size={22} color={unreadAlerts.length > 0 ? C.amber : C.gray400} />,
          "Alertes non lues", unreadAlerts.length,
          `${newChildAbs.length} nouvelles absences enfants`,
          unreadAlerts.length > 0 ? C.amber : C.gray400, "/gestionnaire/alertes")}
        {stat(<Route size={22} color={uncoveredCirc.length > 0 ? C.red : C.green} />,
          "Circuits couverts", coveredCirc.length,
          `sur ${circuits.length} circuits · ${uncoveredCirc.length} non couverts`,
          uncoveredCirc.length > 0 ? C.red : C.green, "/gestionnaire/circuits", uncoveredCirc.length > 0)}
      </div>

      {/* ── Panels urgents ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Incidents ouverts */}
        {openInc.length > 0 && (
          <Card>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.gray200}`,
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: C.red, display: "flex", alignItems: "center", gap: 6 }}><AlertCircle size={15} /> Incidents ouverts</span>
              <button onClick={() => router.push("/gestionnaire/incidents")}
                style={{ background: "none", border: "none", color: C.navyL, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Gérer tout →
              </button>
            </div>
            {openInc.slice(0, 5).map(i => {
              const TYPE_ICON: Record<string, React.ReactNode> = {
                panne:       <Wrench size={17} color={C.amber} />,
                voyant:      <Lightbulb size={17} color={C.amber} />,
                accident:    <AlertCircle size={17} color={C.red} />,
                retard:      <Clock size={17} color={C.amber} />,
                degradation: <ShieldAlert size={17} color={C.amber} />,
                enfant:      <Baby size={17} color={C.navyL} />,
                parent:      <Phone size={17} color={C.navyL} />,
                autre:       <HelpCircle size={17} color={C.gray400} />,
              };
              return (
                <div key={i.id} onClick={() => setIncModal(i)}
                  style={{ ...row, cursor: "pointer" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1, minWidth: 0 }}>
                    <span style={{ flexShrink: 0 }}>{TYPE_ICON[i.type] || <HelpCircle size={17} color={C.gray400} />}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: C.gray800 }}>
                        {i.description.slice(0, 70)}{i.description.length > 70 ? "…" : ""}
                      </div>
                      <div style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>
                        {i.conducteur ? `${i.conducteur.prenom} ${i.conducteur.nom}` : "—"}
                        {i.vehicule ? ` · ${i.vehicule.plaque}` : ""}
                        {" · "}{fmtDateTime(i.reported_at)}
                      </div>
                    </div>
                  </div>
                  <Badge color={i.status === "en_cours" ? "blue" : "amber"}>
                    {i.status === "en_cours" ? "En cours" : "À traiter"}
                  </Badge>
                </div>
              );
            })}
          </Card>
        )}

        {/* Absents du jour */}
        {absents.length > 0 && (
          <Card>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.gray200}`,
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: C.amber, display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={15} /> Conducteurs absents du jour</span>
              <button onClick={() => router.push("/gestionnaire/conducteurs")}
                style={{ background: "none", border: "none", color: C.navyL, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Voir tout →
              </button>
            </div>
            {absents.map(d => {
              const circ = circuits.find(c => c.id === d.circuit_id);
              return (
                <div key={d.id} style={{ ...row, background: C.amberL }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1 }}>
                    <Avatar initials={d.photo_initials} size={34} color={C.amber} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: C.gray800 }}>{d.prenom} {d.nom}</div>
                      <div style={{ fontSize: 11, color: C.gray600 }}>
                        {d.absence_motif || "Motif non renseigné"}
                        {circ && ` · ${circ.emoji} ${circ.nom}`}
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
          </Card>
        )}

        {/* Circuits non couverts */}
        {uncoveredCirc.length > 0 && (
          <Card>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.gray200}`,
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: C.red, display: "flex", alignItems: "center", gap: 6 }}><Route size={15} /> Circuits non couverts</span>
            </div>
            {uncoveredCirc.map(circ => {
              const absDrv = drivers.find(d => d.circuit_id === circ.id && d.status === "absent");
              return (
                <div key={circ.id} style={{ ...row }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 20 }}>{circ.emoji}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{circ.num} · {circ.nom}</div>
                      <div style={{ fontSize: 11, color: C.gray400 }}>{circ.enfants_count} enfants · {circ.cercle?.nom}</div>
                    </div>
                  </div>
                  {absDrv && (
                    <button onClick={() => setAbsentModal(absDrv)}
                      style={{ background: C.redL, color: C.red, border: `1px solid #FCA5A5`, borderRadius: 8,
                        padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                      <Repeat2 size={12} /> Remplaçant
                    </button>
                  )}
                </div>
              );
            })}
          </Card>
        )}

        {/* Absences enfants du jour */}
        {todayAbs.length > 0 && (
          <Card>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.gray200}`,
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: C.gray800, display: "flex", alignItems: "center", gap: 6 }}>
                <Baby size={15} /> Absences enfants aujourd'hui
                {newChildAbs.length > 0 && (
                  <span style={{ marginLeft: 6, color: C.red, fontSize: 12 }}>({newChildAbs.length} non transmises)</span>
                )}
              </span>
            </div>
            {todayAbs.slice(0, 6).map(a => {
              const child = a.enfant || enfants.find(e => e.id === a.enfant_id);
              const circ  = circuits.find(c => c.id === a.circuit_id);
              return (
                <div key={a.id} onClick={() => setChildAbsM(a)}
                  style={{ ...row, cursor: "pointer", background: a.read_by_gestionnaire ? C.white : C.amberL }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: C.gray800 }}>{child?.prenom} {child?.nom}</div>
                    <div style={{ fontSize: 11, color: C.gray400 }}>
                      {a.reason} · {circ?.emoji} {circ?.nom} · {fmtTime(a.reported_at)}
                    </div>
                  </div>
                  <Badge color={a.transmitted_to_driver ? "green" : "amber"}>
                    {a.transmitted_to_driver ? "Transmis" : "À transmettre"}
                  </Badge>
                </div>
              );
            })}
          </Card>
        )}

        {/* All good */}
        {openInc.length === 0 && absents.length === 0 && uncoveredCirc.length === 0 && newChildAbs.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 0", color: C.gray400 }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
              <CheckCircle2 size={40} color={C.green} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, color: C.gray800 }}>Tout est en ordre aujourd'hui</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Aucun incident · Aucune absence · Tous les circuits couverts</div>
          </div>
        )}
      </div>
    </div>
  );
}
