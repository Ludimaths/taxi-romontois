"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { C, statusColor, statusLabel, nowStr, todayStr } from "@/lib/constants";
import { Badge, Avatar, Card, InfoBox, Btn, Modal, Stat } from "@/components/ui";
import type { Conducteur, Circuit, Vehicule, AbsenceEnfant, Enfant, Incident, Alerte } from "@/lib/types";

// ── Modal Absent ──────────────────────────────────────────────────────────────
function AbsentModal({ driver, drivers, circuits, onClose, onAssign }: {
  driver: Conducteur; drivers: Conducteur[]; circuits: Circuit[];
  onClose: () => void; onAssign: (absentId: number, replacerId: number) => void;
}) {
  const [step, setStep] = useState<"info" | "assign" | "done">("info");
  const [selDriver, setSelDriver] = useState<number | null>(null);
  const [vehicleChange, setVehicleChange] = useState(false);
  const circ = circuits.find(c => c.id === driver.circuit_id);
  const disponibles = drivers.filter(d =>
    d.id !== driver.id && (d.status === "disponible" || d.status === "en_attente")
  );

  return (
    <Modal title={`Absence : ${driver.prenom} ${driver.nom}`} onClose={onClose}>
      {step === "info" && <>
        <div style={{ background: C.redL, borderRadius: 12, padding: 20, marginBottom: 20, border: `1px solid #FCA5A5` }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <Avatar initials={driver.photo_initials} size={48} color={C.red} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.red }}>{driver.prenom} {driver.nom}</div>
              <div style={{ fontSize: 13, color: C.gray600, marginTop: 2 }}>Absent · Motif : {driver.absence_motif || "Non renseigné"}</div>
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          <InfoBox label="Circuit à couvrir" value={circ ? `${circ.emoji} ${circ.nom} (${circ.num})` : "—"} highlight={C.red} />
          <InfoBox label="Véhicule habituel" value={driver.vehicule?.plaque} />
          <InfoBox label="École" value={circ?.cercle?.nom} />
          <InfoBox label="Enfants" value={circ ? `${circ.enfants_count} enfants` : "—"} />
        </div>
        <div style={{ background: C.amberL, borderRadius: 8, padding: 14, marginBottom: 20, fontSize: 13, border: `1px solid #FDE68A` }}>
          ⚠ Le circuit <strong>{circ?.nom}</strong> est non couvert. Assignez un conducteur disponible.
        </div>
        <Btn full onClick={() => setStep("assign")} color={C.navyL}>Trouver un remplaçant →</Btn>
      </>}

      {step === "assign" && <>
        <button onClick={() => setStep("info")} style={{ background: "none", border: "none", color: C.navyL, cursor: "pointer", fontWeight: 700, fontSize: 13, padding: 0, marginBottom: 16 }}>← Retour</button>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Conducteurs disponibles</div>
        <div style={{ fontSize: 12, color: C.gray400, marginBottom: 14 }}>Sélectionnez le conducteur qui prend le circuit {circ?.emoji} {circ?.nom}</div>
        {disponibles.length === 0
          ? <div style={{ textAlign: "center", padding: "24px", color: C.gray400, fontSize: 13 }}>Aucun conducteur disponible.</div>
          : disponibles.map(d => (
            <div key={d.id} onClick={() => setSelDriver(d.id)}
              style={{ display: "flex", gap: 14, alignItems: "center", padding: 14, borderRadius: 10, marginBottom: 10,
                border: `2px solid ${selDriver === d.id ? C.navyL : C.gray200}`,
                background: selDriver === d.id ? C.skyL : C.white, cursor: "pointer" }}>
              <Avatar initials={d.photo_initials} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: C.gray800 }}>{d.prenom} {d.nom}</div>
                <div style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>Permis {d.permis || "—"} · {d.tel || "—"}</div>
              </div>
              <Badge color={statusColor(d.status) as any}>{statusLabel(d.status)}</Badge>
            </div>
          ))}
        <div style={{ marginTop: 16, padding: 14, background: C.gray50, borderRadius: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Changement de véhicule ?</div>
          <div style={{ display: "flex", gap: 10 }}>
            {[false, true].map(v => (
              <button key={String(v)} onClick={() => setVehicleChange(v)}
                style={{ flex: 1, padding: 10, borderRadius: 8, border: `2px solid ${vehicleChange === v ? C.navyL : C.gray200}`,
                  background: vehicleChange === v ? C.skyL : C.white, fontWeight: 700, cursor: "pointer", fontSize: 13,
                  color: vehicleChange === v ? C.navy : C.gray600 }}>
                {v ? "Oui — autre véhicule" : `Non — ${driver.vehicule?.plaque || "habituel"}`}
              </button>
            ))}
          </div>
        </div>
        <Btn full onClick={() => { if (selDriver) { onAssign(driver.id, selDriver); setStep("done"); } }} disabled={!selDriver} color={C.green}>
          ✅ Attribuer le circuit
        </Btn>
      </>}

      {step === "done" && (
        <div style={{ textAlign: "center", padding: "32px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.green }}>Circuit attribué !</div>
          <div style={{ fontSize: 13, color: C.gray600, marginTop: 8 }}>Le conducteur a été notifié. Le tableau de bord est mis à jour.</div>
          <div style={{ marginTop: 20 }}><Btn onClick={onClose} outline color={C.navyL}>Fermer</Btn></div>
        </div>
      )}
    </Modal>
  );
}

// ── Modal Absence Enfant ──────────────────────────────────────────────────────
function ChildAbsenceModal({ absence, enfants, drivers, circuits, onClose, onTransmit }: {
  absence: AbsenceEnfant; enfants: Enfant[]; drivers: Conducteur[];
  circuits: Circuit[]; onClose: () => void; onTransmit: (id: number) => void;
}) {
  const child = enfants.find(c => c.id === absence.enfant_id);
  const circ = circuits.find(c => c.id === absence.circuit_id);
  const drv = drivers.find(d => d.circuit_id === absence.circuit_id);
  const [done, setDone] = useState(absence.transmitted_to_driver);

  return (
    <Modal title="Absence enfant" onClose={onClose}>
      <div style={{ background: C.amberL, borderRadius: 12, padding: 20, marginBottom: 20, border: `1px solid #FDE68A` }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.amber, marginBottom: 4 }}>⚠ {child?.prenom} {child?.nom}</div>
        <div style={{ fontSize: 13, color: C.gray800 }}>Motif : <strong>{absence.reason}</strong> · Signalé par {absence.reported_by} à {new Date(absence.reported_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        <InfoBox label="Circuit" value={circ ? `${circ.emoji} ${circ.nom}` : "—"} />
        <InfoBox label="École" value={circ?.cercle?.nom} />
        <InfoBox label="Conducteur" value={drv ? `${drv.prenom} ${drv.nom}` : "—"} />
        <InfoBox label="Parent" value={child?.parent_nom} />
        <InfoBox label="Adresse mère" value={child?.adresse_mere} full />
        {child?.adresse_pere && <InfoBox label="Adresse père" value={child?.adresse_pere} full />}
      </div>
      {!done
        ? <Btn full onClick={() => { setDone(true); onTransmit(absence.id); }} color={C.navyL}>
            📨 Transmettre au conducteur ({drv?.prenom} {drv?.nom})
          </Btn>
        : <div style={{ textAlign: "center", padding: 12, background: C.greenL, borderRadius: 8, color: C.green, fontWeight: 700, fontSize: 13 }}>
            ✅ Transmis au conducteur
          </div>
      }
    </Modal>
  );
}

// ── Dashboard Gestionnaire ────────────────────────────────────────────────────
export default function GestionnaireDashboard() {
  const supabase = createClient();
  const [drivers, setDrivers] = useState<Conducteur[]>([]);
  const [vehicles, setVehicles] = useState<Vehicule[]>([]);
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [enfants, setEnfants] = useState<Enfant[]>([]);
  const [absences, setAbsences] = useState<AbsenceEnfant[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [alerts, setAlerts] = useState<Alerte[]>([]);
  const [absentModal, setAbsentModal] = useState<Conducteur | null>(null);
  const [selAbsence, setSelAbsence] = useState<AbsenceEnfant | null>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const [drv, veh, cir, enf, abs, inc, alt] = await Promise.all([
      supabase.from("conducteurs").select("*, circuit:circuits(*,cercle:cercles_scolaires(*)), vehicule:vehicules(*)").order("nom"),
      supabase.from("vehicules").select("*, circuit:circuits(*), conducteur:conducteurs(*)").order("plaque"),
      supabase.from("circuits").select("*, cercle:cercles_scolaires(*)").order("num"),
      supabase.from("enfants").select("*, circuit:circuits(*)").order("nom"),
      supabase.from("absences_enfants").select("*, enfant:enfants(*), circuit:circuits(*)").order("reported_at", { ascending: false }),
      supabase.from("incidents").select("*, vehicule:vehicules(*), conducteur:conducteurs(*), circuit:circuits(*)").order("reported_at", { ascending: false }),
      supabase.from("alertes").select("*").order("created_at", { ascending: false }),
    ]);
    setDrivers(drv.data ?? []);
    setVehicles(veh.data ?? []);
    setCircuits(cir.data ?? []);
    setEnfants(enf.data ?? []);
    setAbsences(abs.data ?? []);
    setIncidents(inc.data ?? []);
    setAlerts(alt.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();

    // Realtime subscriptions
    const channels = [
      supabase.channel("realtime-dashboard")
        .on("postgres_changes", { event: "*", schema: "public", table: "conducteurs" }, fetchAll)
        .on("postgres_changes", { event: "*", schema: "public", table: "service_logs" }, fetchAll)
        .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, fetchAll)
        .on("postgres_changes", { event: "*", schema: "public", table: "absences_enfants" }, fetchAll)
        .on("postgres_changes", { event: "*", schema: "public", table: "alertes" }, fetchAll)
        .subscribe()
    ];
    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  }, [fetchAll]);

  const handleAssign = async (absentId: number, replacerId: number) => {
    const absentDriver = drivers.find(d => d.id === absentId);
    await supabase.from("conducteurs").update({ status: "en_service", circuit_id: absentDriver?.circuit_id }).eq("id", replacerId);
    setAbsentModal(null);
    fetchAll();
  };

  const handleTransmit = async (absenceId: number) => {
    await supabase.from("absences_enfants").update({ transmitted_to_driver: true, read_by_gestionnaire: true }).eq("id", absenceId);
    fetchAll();
  };

  const handleMarkAlertRead = async (alertId: number) => {
    await supabase.from("alertes").update({ read: true, read_at: new Date().toISOString() }).eq("id", alertId);
    fetchAll();
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: C.gray400 }}>
      Chargement du tableau de bord…
    </div>
  );

  const enService = drivers.filter(d => d.status === "en_service");
  const absents = drivers.filter(d => d.status === "absent");
  const dispo = drivers.filter(d => d.status === "disponible");
  const openInc = incidents.filter(i => i.status !== "resolu");
  const unreadAlerts = alerts.filter(a => !a.read);
  const unreadAbs = absences.filter(a => !a.read_by_gestionnaire);

  return (
    <>
      {absentModal && (
        <AbsentModal driver={absentModal} drivers={drivers} circuits={circuits}
          onClose={() => setAbsentModal(null)} onAssign={handleAssign} />
      )}
      {selAbsence && (
        <ChildAbsenceModal absence={selAbsence} enfants={enfants} drivers={drivers} circuits={circuits}
          onClose={() => setSelAbsence(null)} onTransmit={handleTransmit} />
      )}

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg,${C.navy},${C.navyL})`, padding: "26px 30px",
        borderRadius: 16, marginBottom: 22, color: C.white, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <img src="/logo.png" alt="Taxi Romontois"
            style={{ width: 160, height: "auto", marginBottom: 10, display: "block",
              filter: "brightness(0) invert(1)" }} />
          <div style={{ fontSize: 12, opacity: 0.6, textTransform: "capitalize" }}>{todayStr()}</div>
          <div style={{ fontSize: 24, fontWeight: 900, marginTop: 3 }}>Tableau de bord</div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 3 }}>Vue exploitation temps réel · Supabase Realtime</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 38, fontWeight: 900, color: C.sky }}>{nowStr()}</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
            {openInc.length > 0 && <div style={{ background: C.red, color: C.white, padding: "3px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>⚡ {openInc.length} incident(s)</div>}
            {absents.length > 0 && <div style={{ background: C.amber, color: C.white, padding: "3px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>⚠ {absents.length} absent(s)</div>}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 22 }}>
        <Stat label="En service" value={enService.length} sub={`${dispo.length} disponible(s)`} icon="🚌" color={C.navyL}
          onClick={() => setModal("enService")} />
        <Stat label="Absent(s)" value={absents.length} sub="Cliquer pour gérer" icon="⚠️" color={C.red}
          onClick={absents.length > 0 ? () => setModal("absents") : undefined} />
        <Stat label="Incidents ouverts" value={openInc.length} sub="Cliquer pour traiter" icon="⚡"
          color={openInc.length > 0 ? C.red : C.green}
          onClick={openInc.length > 0 ? () => setModal("incidents") : undefined} />
        <Stat label="Alertes non lues" value={unreadAlerts.length} sub="Documents & véhicules" icon="🔔" color={C.amber}
          onClick={unreadAlerts.length > 0 ? () => setModal("alertes") : undefined} />
      </div>

      {/* Modals inline */}
      {modal === "enService" && (
        <Modal title={`Conducteurs en service (${enService.length})`} onClose={() => setModal(null)}>
          {enService.map(d => (
            <div key={d.id} style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 0", borderBottom: `1px solid ${C.gray100}` }}>
              <Avatar initials={d.photo_initials} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: C.gray800 }}>{d.prenom} {d.nom}</div>
                <div style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>{d.vehicule?.plaque || "—"} · {d.circuit ? `${d.circuit.emoji} ${d.circuit.nom}` : "—"}</div>
              </div>
              <Badge color="green">En service</Badge>
            </div>
          ))}
        </Modal>
      )}
      {modal === "absents" && (
        <Modal title={`Conducteurs absents (${absents.length})`} onClose={() => setModal(null)}>
          {absents.map(d => (
            <div key={d.id} onClick={() => { setModal(null); setAbsentModal(d); }}
              style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 0", borderBottom: `1px solid ${C.gray100}`, cursor: "pointer" }}>
              <Avatar initials={d.photo_initials} color={C.red} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: C.gray800 }}>{d.prenom} {d.nom}</div>
                <div style={{ fontSize: 12, color: C.red, marginTop: 2 }}>{d.absence_motif || "—"}</div>
              </div>
              <Badge color="red">Gérer →</Badge>
            </div>
          ))}
        </Modal>
      )}
      {modal === "incidents" && (
        <Modal title={`Incidents ouverts (${openInc.length})`} onClose={() => setModal(null)}>
          {openInc.map(i => (
            <div key={i.id} style={{ padding: "14px 0", borderBottom: `1px solid ${C.gray100}` }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: C.gray800, marginBottom: 4 }}>{i.description}</div>
              <div style={{ fontSize: 12, color: C.gray400 }}>{i.conducteur?.prenom} {i.conducteur?.nom} · {i.vehicule?.plaque} · {i.circuit?.nom} · {new Date(i.reported_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
              <div style={{ marginTop: 6 }}><Badge color={i.status === "en_cours" ? "blue" : "amber"}>{i.status === "en_cours" ? "En cours" : "À traiter"}</Badge></div>
            </div>
          ))}
        </Modal>
      )}
      {modal === "alertes" && (
        <Modal title={`Alertes non lues (${unreadAlerts.length})`} onClose={() => setModal(null)}>
          {unreadAlerts.map(a => (
            <div key={a.id} style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 0", borderBottom: `1px solid ${C.gray100}` }}>
              <div style={{ fontSize: 22 }}>{a.type === "document" ? "📄" : "🚌"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{a.message}</div>
                <div style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>{new Date(a.created_at).toLocaleDateString("fr-FR")}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Badge color={a.severity === "critique" ? "red" : a.severity === "haute" ? "amber" : "gray"}>{a.severity}</Badge>
                <Btn small onClick={() => handleMarkAlertRead(a.id)} color={C.green}>Lu ✓</Btn>
              </div>
            </div>
          ))}
        </Modal>
      )}

      {/* Main content */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 18 }}>
        {/* Circuits du jour */}
        <Card>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.gray100}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, color: C.gray800 }}>Circuits du jour</span>
            <a href="/gestionnaire/circuits" style={{ fontSize: 12, color: C.navyL, textDecoration: "none", fontWeight: 600 }}>Voir tout →</a>
          </div>
          {circuits.slice(0, 12).map(circ => {
            const drv = drivers.find(d => d.circuit_id === circ.id && d.status !== "absent");
            const isAbsent = !drv;
            return (
              <div key={circ.id} style={{ padding: "11px 18px", borderBottom: `1px solid ${C.gray100}`,
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: isAbsent ? "#FFF5F5" : C.white }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{circ.emoji}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: C.gray800 }}>
                      {circ.num}-{circ.nom}
                    </div>
                    <div style={{ fontSize: 11, color: isAbsent ? C.red : C.gray400, marginTop: 1 }}>
                      {drv
                        ? `${drv.prenom} ${drv.nom}`
                        : <button onClick={() => { const absent = drivers.find(d => d.circuit_id === circ.id && d.status === "absent"); if (absent) setAbsentModal(absent); }}
                            style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontWeight: 700, fontSize: 11, padding: 0 }}>
                            ⚠ Non couvert — cliquer pour gérer
                          </button>
                      } · {circ.enfants_count} enfants
                    </div>
                  </div>
                </div>
                <Badge color={drv ? (drv.status === "en_service" ? "green" : "amber") : "red"}>
                  {drv ? statusLabel(drv.status) : "Non couvert"}
                </Badge>
              </div>
            );
          })}
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Absences enfants */}
          <Card>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.gray100}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, color: C.gray800 }}>
                Absences enfants {unreadAbs.length > 0 && <span style={{ color: C.red, marginLeft: 4 }}>({unreadAbs.length} nouvelles)</span>}
              </span>
            </div>
            {absences.length === 0
              ? <div style={{ padding: 20, textAlign: "center", color: C.gray400, fontSize: 13 }}>✅ Aucune absence</div>
              : absences.slice(0, 5).map(a => {
                const child = enfants.find(c => c.id === a.enfant_id);
                const circ = circuits.find(c => c.id === a.circuit_id);
                return (
                  <div key={a.id} onClick={() => setSelAbsence(a)}
                    style={{ padding: "10px 18px", borderBottom: `1px solid ${C.gray100}`,
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      cursor: "pointer", background: a.read_by_gestionnaire ? C.white : C.amberL }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: C.gray800 }}>{child?.prenom} {child?.nom}</div>
                      <div style={{ fontSize: 11, color: C.gray400 }}>{a.reason} · {circ?.emoji} {circ?.nom} · {new Date(a.reported_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <Badge color={a.transmitted_to_driver ? "green" : "amber"}>{a.transmitted_to_driver ? "Transmis" : "À transmettre"}</Badge>
                      <span style={{ color: C.navyL, fontSize: 14 }}>→</span>
                    </div>
                  </div>
                );
              })
            }
          </Card>

          {/* Conducteurs absents */}
          {absents.length > 0 && (
            <Card>
              <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.gray100}` }}>
                <span style={{ fontWeight: 700, color: C.red }}>⚠ Conducteurs absents</span>
              </div>
              {absents.map(d => {
                const circ = circuits.find(c => c.id === d.circuit_id);
                return (
                  <div key={d.id} onClick={() => setAbsentModal(d)}
                    style={{ padding: "12px 18px", borderBottom: `1px solid ${C.gray100}`,
                      display: "flex", gap: 12, alignItems: "center", cursor: "pointer" }}>
                    <Avatar initials={d.photo_initials} color={C.red} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: C.gray800 }}>{d.prenom} {d.nom}</div>
                      <div style={{ fontSize: 11, color: C.gray400 }}>Circuit {circ?.emoji} {circ?.nom} · {d.absence_motif || "—"}</div>
                    </div>
                    <Badge color="red">Gérer →</Badge>
                  </div>
                );
              })}
            </Card>
          )}

          {/* Incidents récents */}
          {openInc.length > 0 && (
            <Card>
              <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.gray100}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700, color: C.red }}>⚡ Incidents ouverts</span>
                <a href="/gestionnaire/incidents" style={{ fontSize: 12, color: C.navyL, textDecoration: "none", fontWeight: 600 }}>Gérer →</a>
              </div>
              {openInc.slice(0, 3).map(i => (
                <div key={i.id} style={{ padding: "10px 18px", borderBottom: `1px solid ${C.gray100}` }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: C.gray800 }}>{i.description}</div>
                  <div style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>{i.vehicule?.plaque} · {i.circuit?.nom} · {new Date(i.reported_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
