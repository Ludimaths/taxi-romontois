"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { C, nowStr } from "@/lib/constants";
import type { Vehicule } from "@/lib/types";

const INCTYPES = ["Panne", "Voyant moteur", "Accident", "Retard", "Dégradation", "Problème enfant", "Problème parent", "Autre"];

export default function ScanPage() {
  const params = useParams();
  const vehicleId = decodeURIComponent(String(params.vehicleId)).replace(/-/g, " ");
  const supabase = createClient();

  const [vehicle, setVehicle] = useState<Vehicule | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [isReplacer, setIsReplacer] = useState(false);
  const [myName, setMyName] = useState("");
  const [incType, setIncType] = useState("");
  const [incDesc, setIncDesc] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("vehicules")
      .select("*, circuit:circuits(*,cercle:cercles_scolaires(*)), conducteur:conducteurs(*)")
      .eq("plaque", vehicleId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) setNotFound(true);
        else setVehicle(data);
        setLoading(false);
      });
  }, [vehicleId]);

  const handlePrise = async () => {
    if (!vehicle) return;
    setSaving(true);
    await supabase.from("service_logs").insert({
      vehicule_id: vehicle.id,
      conducteur_id: isReplacer ? null : vehicle.conducteur_id,
      circuit_id: vehicle.circuit_id,
      date_service: new Date().toISOString().slice(0, 10),
      heure_debut: new Date().toTimeString().slice(0, 5),
      status: "en_service",
      is_replacement: isReplacer,
      replacement_name: isReplacer ? myName : null,
    });
    if (vehicle.conducteur_id && !isReplacer) {
      await supabase.from("conducteurs").update({ status: "en_service" }).eq("id", vehicle.conducteur_id);
    }
    setSaving(false);
    setDone(true);
  };

  const handleFin = async () => {
    if (!vehicle) return;
    setSaving(true);
    await supabase.from("service_logs")
      .update({ heure_fin: new Date().toTimeString().slice(0, 5), status: "termine" })
      .eq("vehicule_id", vehicle.id)
      .eq("date_service", new Date().toISOString().slice(0, 10))
      .eq("status", "en_service");
    if (vehicle.conducteur_id) {
      await supabase.from("conducteurs").update({ status: "disponible" }).eq("id", vehicle.conducteur_id);
    }
    setSaving(false);
    setDone(true);
  };

  const handleIncident = async () => {
    if (!vehicle || !incType) return;
    setSaving(true);
    await supabase.from("incidents").insert({
      type: incType.toLowerCase().replace(/ /g, "_"),
      vehicule_id: vehicle.id,
      conducteur_id: vehicle.conducteur_id,
      circuit_id: vehicle.circuit_id,
      description: `${incType}${incDesc ? ` — ${incDesc}` : ""}`,
      status: "en_attente",
    });
    await supabase.from("alertes").insert({
      type: "incident",
      severity: incType === "Accident" ? "critique" : "haute",
      message: `Incident ${incType} signalé — ${vehicle.plaque} (${vehicle.circuit?.nom || "—"}) : ${incDesc || incType}`,
      read: false,
    });
    setSaving(false);
    setDone(true);
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: C.gray50, fontFamily: "'Inter',sans-serif" }}>
      <div style={{ color: C.gray400 }}>Chargement…</div>
    </div>
  );

  if (notFound) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: C.gray50, fontFamily: "'Inter',sans-serif", padding: 24 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.gray800, marginBottom: 8 }}>Véhicule non trouvé</div>
        <div style={{ fontSize: 13, color: C.gray400 }}>Plaque : {vehicleId}</div>
      </div>
    </div>
  );

  if (done) return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(135deg,${C.navy},${C.navyL})`,
      display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',sans-serif", padding: 24 }}>
      <div style={{ textAlign: "center", color: C.white }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>Enregistré !</div>
        <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 24, maxWidth: 300, margin: "0 auto 24px" }}>
          {action === "prise" && (isReplacer ? `Vous prenez le service. Le gestionnaire a été notifié.` : "Prise de service enregistrée.")}
          {action === "fin" && "Fin de service enregistrée. Merci !"}
          {action === "incident" && `Incident "${incType}" transmis au gestionnaire.`}
        </div>
        <button onClick={() => { setDone(false); setAction(null); setIsReplacer(false); setMyName(""); setIncType(""); setIncDesc(""); }}
          style={{ padding: "12px 24px", borderRadius: 10, border: `2px solid rgba(255,255,255,0.4)`,
            background: "transparent", color: C.white, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
          Nouvelle action
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.gray50, fontFamily: "'Inter',sans-serif" }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(135deg,${C.navy},${C.navyL})`, padding: "20px 24px", color: C.white }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 22 }}>🚌</span>
          <div style={{ fontSize: 11, opacity: 0.6 }}>Taxi Romontois</div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 900 }}>{vehicle!.plaque}</div>
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>{vehicle!.marque} {vehicle!.modele} · {vehicle!.places} places</div>
        {vehicle!.circuit && (
          <div style={{ marginTop: 8, background: "rgba(255,255,255,0.1)", padding: "6px 12px", borderRadius: 8, fontSize: 13 }}>
            {vehicle!.circuit.emoji} Circuit {vehicle!.circuit.nom} · {vehicle!.circuit.cercle?.nom}
          </div>
        )}
      </div>

      <div style={{ padding: 20, maxWidth: 420, margin: "0 auto" }}>
        {/* Conducteur habituel */}
        {vehicle!.conducteur && (
          <div style={{ background: C.white, borderRadius: 12, padding: 16, marginBottom: 16, border: `1px solid ${C.gray200}` }}>
            <div style={{ fontSize: 11, color: C.gray400, textTransform: "uppercase", marginBottom: 4 }}>Conducteur habituel</div>
            <div style={{ fontWeight: 700, color: C.gray800 }}>{vehicle!.conducteur.prenom} {vehicle!.conducteur.nom}</div>
            <div style={{ fontSize: 12, color: C.gray400 }}>{vehicle!.conducteur.tel || "—"}</div>
          </div>
        )}

        {/* Actions */}
        {!action ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { key: "prise",    icon: "🟢", label: "Je prends ce véhicule",    sub: "Pointage début de service" },
              { key: "fin",      icon: "🔵", label: "Je termine mon service",   sub: "Pointage fin de service" },
              { key: "incident", icon: "⚡", label: "Je signale un incident",   sub: "Alerte immédiate gestionnaire" },
            ].map(btn => (
              <button key={btn.key} onClick={() => setAction(btn.key)}
                style={{ display: "flex", gap: 14, alignItems: "center", padding: "16px",
                  borderRadius: 12, border: `2px solid ${C.gray200}`, background: C.white,
                  cursor: "pointer", textAlign: "left", width: "100%" }}>
                <span style={{ fontSize: 28 }}>{btn.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: C.gray800 }}>{btn.label}</div>
                  <div style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>{btn.sub}</div>
                </div>
              </button>
            ))}
          </div>
        ) : action === "prise" ? (
          <div style={{ background: C.white, borderRadius: 12, padding: 20, border: `1px solid ${C.gray200}` }}>
            <button onClick={() => setAction(null)} style={{ background: "none", border: "none", color: C.gray400, cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 16 }}>← Retour</button>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Qui prend ce véhicule ?</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
              <button onClick={() => setIsReplacer(false)}
                style={{ flex: 1, padding: 12, borderRadius: 10, border: `2px solid ${!isReplacer ? C.navyL : C.gray200}`,
                  background: !isReplacer ? C.skyL : C.white, fontWeight: 700, cursor: "pointer", fontSize: 12,
                  color: !isReplacer ? C.navy : C.gray600 }}>
                ✅ Conducteur habituel
                <div style={{ fontSize: 10, fontWeight: 400, color: C.gray400, marginTop: 3 }}>
                  {vehicle!.conducteur ? `${vehicle!.conducteur.prenom} ${vehicle!.conducteur.nom}` : "—"}
                </div>
              </button>
              <button onClick={() => setIsReplacer(true)}
                style={{ flex: 1, padding: 12, borderRadius: 10, border: `2px solid ${isReplacer ? C.amber : C.gray200}`,
                  background: isReplacer ? C.amberL : C.white, fontWeight: 700, cursor: "pointer", fontSize: 12,
                  color: isReplacer ? C.amber : C.gray600 }}>
                🔄 Je suis remplaçant
                <div style={{ fontSize: 10, fontWeight: 400, color: C.gray400, marginTop: 3 }}>Autre conducteur</div>
              </button>
            </div>
            {isReplacer && (
              <input value={myName} onChange={e => setMyName(e.target.value)} placeholder="Votre prénom et nom…"
                style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1px solid ${C.gray200}`,
                  fontSize: 14, marginBottom: 14, boxSizing: "border-box" }} />
            )}
            <button onClick={handlePrise} disabled={saving || (isReplacer && !myName)}
              style={{ width: "100%", padding: 14, borderRadius: 10, border: "none",
                background: saving || (isReplacer && !myName) ? C.gray200 : C.green,
                color: C.white, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
              {saving ? "Enregistrement…" : "🟢 Valider la prise de service"}
            </button>
          </div>
        ) : action === "fin" ? (
          <div style={{ background: C.white, borderRadius: 12, padding: 20, border: `1px solid ${C.gray200}` }}>
            <button onClick={() => setAction(null)} style={{ background: "none", border: "none", color: C.gray400, cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 16 }}>← Retour</button>
            <div style={{ background: C.gray50, borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Confirmation fin de service</div>
              <div style={{ color: C.gray400 }}>{vehicle!.conducteur ? `${vehicle!.conducteur.prenom} ${vehicle!.conducteur.nom}` : "—"} · {vehicle!.plaque}</div>
              <div style={{ fontWeight: 700, color: C.navyL, marginTop: 8 }}>Heure de fin : {nowStr()}</div>
            </div>
            <button onClick={handleFin} disabled={saving}
              style={{ width: "100%", padding: 14, borderRadius: 10, border: "none",
                background: saving ? C.gray200 : C.navyL, color: C.white, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
              {saving ? "Enregistrement…" : "🔵 Confirmer la fin de service"}
            </button>
          </div>
        ) : (
          <div style={{ background: C.white, borderRadius: 12, padding: 20, border: `1px solid ${C.gray200}` }}>
            <button onClick={() => setAction(null)} style={{ background: "none", border: "none", color: C.gray400, cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 16 }}>← Retour</button>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Type d'incident</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              {INCTYPES.map(t => (
                <button key={t} onClick={() => setIncType(t)}
                  style={{ padding: 10, borderRadius: 8, fontSize: 12, fontWeight: 600,
                    border: `2px solid ${incType === t ? C.navyL : C.gray200}`,
                    background: incType === t ? C.skyL : C.white,
                    color: incType === t ? C.navyL : C.gray600, cursor: "pointer" }}>
                  {t}
                </button>
              ))}
            </div>
            <textarea value={incDesc} onChange={e => setIncDesc(e.target.value)}
              placeholder="Description (optionnel)…"
              style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1px solid ${C.gray200}`,
                fontSize: 13, minHeight: 70, resize: "none", boxSizing: "border-box", marginBottom: 14 }} />
            <button onClick={handleIncident} disabled={!incType || saving}
              style={{ width: "100%", padding: 14, borderRadius: 10, border: "none",
                background: !incType || saving ? C.gray200 : C.red,
                color: C.white, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
              {saving ? "Envoi…" : "⚡ Envoyer l'incident"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
