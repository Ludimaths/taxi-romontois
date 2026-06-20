"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { C, statusColor, statusLabel, nowStr } from "@/lib/constants";
import { Badge, Card, InfoBox, Btn } from "@/components/ui";
import type { Conducteur, AbsenceEnfant, Enfant, Circuit } from "@/lib/types";

export default function ConducteurPage() {
  const supabase = createClient();
  const [driver, setDriver] = useState<Conducteur | null>(null);
  const [absences, setAbsences] = useState<AbsenceEnfant[]>([]);
  const [enfants, setEnfants] = useState<Enfant[]>([]);
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [absMotif, setAbsMotif] = useState("");
  const [absSent, setAbsSent] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("conducteur_id").eq("id", user.id).single();
      if (!profile?.conducteur_id) return;

      const [drv, abs, enf, cir] = await Promise.all([
        supabase.from("conducteurs").select("*, circuit:circuits(*,cercle:cercles_scolaires(*)), vehicule:vehicules(*)").eq("id", profile.conducteur_id).single(),
        supabase.from("absences_enfants").select("*, enfant:enfants(*)").eq("date_absence", new Date().toISOString().slice(0, 10)),
        supabase.from("enfants").select("*").order("nom"),
        supabase.from("circuits").select("*, cercle:cercles_scolaires(*)"),
      ]);
      setDriver(drv.data);
      setAbsences(abs.data ?? []);
      setEnfants(enf.data ?? []);
      setCircuits(cir.data ?? []);
      setLoading(false);
    };
    fetch();

    // Realtime: écouter les nouvelles absences pour ce conducteur
    const channel = supabase.channel("conducteur-absences")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "absences_enfants" }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleSignalerAbsence = async () => {
    if (!driver || !absMotif) return;
    await supabase.from("conducteurs").update({ status: "absent", absence_motif: absMotif }).eq("id", driver.id);
    // Créer une alerte pour le gestionnaire
    await supabase.from("alertes").insert({
      type: "conducteur",
      severity: "haute",
      message: `${driver.prenom} ${driver.nom} absent — Motif : ${absMotif} — Circuit ${driver.circuit?.nom} non couvert`,
      read: false,
    });
    setAbsSent(true);
    setDriver(prev => prev ? { ...prev, status: "absent", absence_motif: absMotif } : null);
  };

  const myAbsences = absences.filter(a => a.circuit_id === driver?.circuit_id);

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: C.gray400 }}>Chargement…</div>;
  if (!driver) return <div style={{ textAlign: "center", padding: 40, color: C.gray400 }}>Aucun conducteur associé à votre compte.</div>;

  const circ = driver.circuit;

  return (
    <div>
      {/* Header */}
      <div style={{ background: `linear-gradient(135deg,${C.navy},${C.navyL})`, borderRadius: 16,
        padding: "22px 26px", color: C.white, marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>Bonjour,</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 2 }}>{driver.prenom} {driver.nom}</div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 3 }}>
            {circ ? `${circ.emoji} Circuit ${circ.nom}` : "Aucun circuit"} · {driver.vehicule?.plaque || "—"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: C.sky }}>{nowStr()}</div>
          <Badge color={statusColor(driver.status) as any}>{statusLabel(driver.status)}</Badge>
        </div>
      </div>

      {/* Signaler absence */}
      {driver.status !== "absent" && !absSent && (
        <Card style={{ padding: 18, marginBottom: 16, border: `2px solid ${C.gray200}` }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Signaler mon absence</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {["Maladie", "Congé", "Urgence", "Formation", "Autre"].map(m => (
              <button key={m} onClick={() => setAbsMotif(m)}
                style={{ padding: "7px 14px", borderRadius: 8, border: `2px solid ${absMotif === m ? C.red : C.gray200}`,
                  background: absMotif === m ? C.redL : C.white, color: absMotif === m ? C.red : C.gray600,
                  fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
                {m}
              </button>
            ))}
          </div>
          <Btn onClick={handleSignalerAbsence} disabled={!absMotif} color={C.red}>⚠ Signaler mon absence</Btn>
        </Card>
      )}
      {absSent && (
        <div style={{ background: C.redL, borderRadius: 10, padding: 14, marginBottom: 16,
          border: `1px solid #FCA5A5`, fontWeight: 700, color: C.red, fontSize: 13 }}>
          ✅ Absence signalée — le gestionnaire a été notifié. Motif : {absMotif}
        </div>
      )}

      {/* Modifications du jour */}
      {myAbsences.length > 0 && (
        <Card style={{ padding: 18, marginBottom: 16, border: `2px solid ${C.amber}` }}>
          <div style={{ fontWeight: 800, color: C.amber, marginBottom: 12 }}>
            ⚠ Modifications du jour — {circ?.emoji} Circuit {circ?.nom}
          </div>
          {myAbsences.map(a => {
            const child = enfants.find(e => e.id === a.enfant_id);
            return (
              <div key={a.id} style={{ padding: "10px 12px", background: C.amberL, borderRadius: 8, marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{child?.prenom} {child?.nom} — {a.reason}</div>
                <div style={{ fontSize: 11, color: C.gray600, marginTop: 2 }}>Signalé par {a.reported_by} à {new Date(a.reported_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            );
          })}
          {!confirmed
            ? <Btn onClick={() => setConfirmed(true)} color={C.navyL} full>✅ J'ai pris connaissance</Btn>
            : <div style={{ textAlign: "center", color: C.green, fontWeight: 700, fontSize: 13, marginTop: 8 }}>✅ Confirmé à {nowStr()}</div>
          }
        </Card>
      )}

      {/* Infos service */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <InfoBox label="Véhicule" value={driver.vehicule?.plaque} />
        <InfoBox label="École" value={circ?.cercle?.nom} />
        <InfoBox label="Circuit" value={circ ? `${circ.emoji} ${circ.nom}` : "—"} />
        <InfoBox label="Enfants" value={circ ? `${circ.enfants_count} enfants` : "—"} />
      </div>

      {/* Lien scan QR */}
      {driver.vehicule && (
        <Card style={{ padding: 18, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>📱 Scanner mon véhicule</div>
          <div style={{ fontSize: 13, color: C.gray600, marginBottom: 12 }}>
            Scannez le QR code sur votre véhicule ou cliquez ci-dessous pour pointer votre service.
          </div>
          <a href={`/scan/${driver.vehicule.plaque.replace(/ /g, "-")}`}
            style={{ display: "inline-block", padding: "11px 20px", background: C.navyL, color: C.white,
              borderRadius: 8, fontWeight: 700, textDecoration: "none", fontSize: 14 }}>
            🚌 Accéder au QR de mon véhicule
          </a>
        </Card>
      )}
    </div>
  );
}
