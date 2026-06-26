"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { C, nowStr } from "@/lib/constants";
import { Bus, CheckCircle2, Zap } from "lucide-react";
import type { Vehicule } from "@/lib/types";

const INCTYPES = ["Panne", "Voyant moteur", "Accident", "Retard", "Dégradation", "Problème enfant", "Problème parent", "Autre"];

const etatLabel = (e: string) =>
  ({ bon: "En service", atelier: "En réparation", attention: "Attention requise" }[e] ?? e);
const etatColor = (e: string) =>
  ({ bon: C.green, atelier: C.red, attention: C.amber }[e] ?? C.gray400);
const etatBg = (e: string) =>
  ({ bon: C.greenL, atelier: C.redL, attention: C.amberL }[e] ?? C.gray100);

export default function ScanPage() {
  const params = useParams();
  const token = decodeURIComponent(String(params.token));
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
    async function findVehicle() {
      try {
        const res = await fetch(`/api/vehicule/${encodeURIComponent(token)}`);
        if (!res.ok) { setNotFound(true); setLoading(false); return; }
        const { vehicle: data } = await res.json();
        if (!data) setNotFound(true);
        else setVehicle(data);
      } catch {
        setNotFound(true);
      }
      setLoading(false);
    }
    findVehicle();
  }, [token]);

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
      message: `Incident ${incType} signalé — ${vehicle.plaque} (${(vehicle.circuit as { nom?: string } | null)?.nom || "—"}) : ${incDesc || incType}`,
      read: false,
    });
    setSaving(false);
    setDone(true);
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: C.gray50, fontFamily: "'Inter',sans-serif" }}>
      <div style={{ color: C.gray400, fontSize: 14 }}>Chargement…</div>
    </div>
  );

  if (notFound) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: C.gray50, fontFamily: "'Inter',sans-serif", padding: 24 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.gray800, marginBottom: 8 }}>Véhicule non trouvé</div>
        <div style={{ fontSize: 13, color: C.gray400 }}>Token : {token}</div>
      </div>
    </div>
  );

  if (done) return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(135deg,${C.navy},${C.navyL})`,
      display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',sans-serif", padding: 24 }}>
      <div style={{ textAlign: "center", color: C.white }}>
        <div style={{ display:"flex",justifyContent:"center",marginBottom:16 }}><CheckCircle2 size={64} color={C.white} /></div>
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>Enregistré !</div>
        <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 24, maxWidth: 300, margin: "0 auto 24px" }}>
          {action === "prise" && (isReplacer ? "Vous prenez le service. Le gestionnaire a été notifié." : "Prise de service enregistrée.")}
          {action === "incident" && `Incident "${incType}" transmis au gestionnaire.`}
        </div>
        <button onClick={() => { setDone(false); setAction(null); setIsReplacer(false); setMyName(""); setIncType(""); setIncDesc(""); }}
          style={{ padding: "12px 24px", borderRadius: 10, border: "2px solid rgba(255,255,255,0.4)",
            background: "transparent", color: C.white, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
          Nouvelle action
        </button>
      </div>
    </div>
  );

  const v = vehicle!;
  const cond = v.conducteur as { prenom?: string; nom?: string; tel?: string } | null;
  const circ = v.circuit as { emoji?: string; nom?: string; cercle?: { nom?: string } } | null;
  const etat = (v.etat as string) || "bon";

  return (
    <div style={{ minHeight: "100vh", background: C.gray50, fontFamily: "'Inter',sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ background: `linear-gradient(135deg,${C.navy},${C.navyL})`, padding: "20px 20px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ display:"flex",alignItems:"center" }}><Bus size={18} color="rgba(255,255,255,0.6)" /></span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: 600, letterSpacing: 1 }}>TAXI ROMONTOIS</span>
        </div>
        <div style={{ fontSize: 26, fontWeight: 900, color: C.white, letterSpacing: 1 }}>{v.plaque}</div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>
          {v.marque} {v.modele}
        </div>
        {circ && (
          <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(255,255,255,0.12)", padding: "6px 12px", borderRadius: 20, fontSize: 13, color: C.white }}>
            {circ.emoji} Circuit {circ.nom}{circ.cercle?.nom ? ` · ${circ.cercle.nom}` : ""}
          </div>
        )}
      </div>

      <div style={{ padding: "16px 16px 32px", maxWidth: 460, margin: "0 auto" }}>

        {/* ── Statut ── */}
        <div style={{ background: etatBg(etat), border: `1px solid ${etatColor(etat)}40`,
          borderRadius: 12, padding: "10px 16px", marginBottom: 12,
          display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: etatColor(etat), flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: etatColor(etat) }}>{etatLabel(etat)}</span>
        </div>

        {/* ── Fiche véhicule ── */}
        <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.gray200}`,
          marginBottom: 14, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.gray100}`,
            fontSize: 11, fontWeight: 700, color: C.gray400, textTransform: "uppercase", letterSpacing: 1 }}>
            Fiche véhicule
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            {[
              { label: "Places", value: `${v.places}${v.places_handi > 0 ? ` + ${v.places_handi} handi` : ""}` },
              { label: "Kilométrage", value: `${(v.km ?? 0).toLocaleString("fr-FR")} km` },
              { label: "Contrôle technique", value: v.ct_date || "—" },
              { label: "Assurance", value: v.assurance_date || "—" },
            ].map((row, i) => (
              <div key={row.label} style={{
                padding: "12px 16px",
                borderRight: i % 2 === 0 ? `1px solid ${C.gray100}` : undefined,
                borderBottom: i < 2 ? `1px solid ${C.gray100}` : undefined,
              }}>
                <div style={{ fontSize: 10, color: C.gray400, textTransform: "uppercase", fontWeight: 700, marginBottom: 3 }}>{row.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.gray800 }}>{row.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Conducteur habituel ── */}
        <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.gray200}`,
          padding: "14px 16px", marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: C.gray400, textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>
            Conducteur habituel
          </div>
          {cond ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: C.skyL,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 900, fontSize: 14, color: C.navyL, flexShrink: 0 }}>
                {(cond.prenom?.[0] ?? "")}{(cond.nom?.[0] ?? "")}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: C.gray800 }}>
                  {cond.prenom} {cond.nom}
                </div>
                {cond.tel && <div style={{ fontSize: 12, color: C.gray400, marginTop: 1 }}>{cond.tel}</div>}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: C.gray400 }}>Aucun conducteur assigné</div>
          )}
        </div>

        {/* ── Actions ── */}
        {!action ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button onClick={() => setAction("prise")}
              style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 20px",
                borderRadius: 14, border: `2px solid ${C.green}`, background: C.white,
                cursor: "pointer", textAlign: "left", width: "100%" }}>
              <span style={{ display:"flex",alignItems:"center" }}><CheckCircle2 size={32} color={C.green} /></span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: C.green }}>Je prends ce véhicule</div>
                <div style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>Pointage début de service</div>
              </div>
            </button>
            <button onClick={() => setAction("incident")}
              style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 20px",
                borderRadius: 14, border: `2px solid ${C.red}`, background: C.white,
                cursor: "pointer", textAlign: "left", width: "100%" }}>
              <span style={{ display:"flex",alignItems:"center" }}><Zap size={32} color={C.red} /></span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: C.red }}>Signaler un incident</div>
                <div style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>Alerte immédiate au gestionnaire</div>
              </div>
            </button>
          </div>

        ) : action === "prise" ? (
          <div style={{ background: C.white, borderRadius: 14, padding: 20, border: `1px solid ${C.gray200}` }}>
            <button onClick={() => setAction(null)}
              style={{ background: "none", border: "none", color: C.gray400, cursor: "pointer",
                fontSize: 13, padding: 0, marginBottom: 18, display: "flex", alignItems: "center", gap: 4 }}>
              ← Retour
            </button>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 16, color: C.gray800 }}>Qui prend ce véhicule ?</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
              <button onClick={() => setIsReplacer(false)}
                style={{ padding: "14px 10px", borderRadius: 12,
                  border: `2px solid ${!isReplacer ? C.navyL : C.gray200}`,
                  background: !isReplacer ? C.skyL : C.white,
                  fontWeight: 700, cursor: "pointer", fontSize: 13,
                  color: !isReplacer ? C.navy : C.gray600, textAlign: "center" }}>
                Conducteur habituel
                <div style={{ fontSize: 11, fontWeight: 400, color: C.gray400, marginTop: 4 }}>
                  {cond ? `${cond.prenom} ${cond.nom}` : "—"}
                </div>
              </button>
              <button onClick={() => setIsReplacer(true)}
                style={{ padding: "14px 10px", borderRadius: 12,
                  border: `2px solid ${isReplacer ? C.amber : C.gray200}`,
                  background: isReplacer ? C.amberL : C.white,
                  fontWeight: 700, cursor: "pointer", fontSize: 13,
                  color: isReplacer ? C.amber : C.gray600, textAlign: "center" }}>
                Remplaçant
                <div style={{ fontSize: 11, fontWeight: 400, color: C.gray400, marginTop: 4 }}>Autre conducteur</div>
              </button>
            </div>
            {isReplacer && (
              <input value={myName} onChange={e => setMyName(e.target.value)}
                placeholder="Votre prénom et nom…"
                style={{ width: "100%", padding: "13px 14px", borderRadius: 10,
                  border: `1px solid ${C.gray200}`, fontSize: 15, marginBottom: 14,
                  boxSizing: "border-box" }} />
            )}
            <button onClick={handlePrise} disabled={saving || (isReplacer && !myName)}
              style={{ width: "100%", padding: 16, borderRadius: 12, border: "none",
                background: saving || (isReplacer && !myName) ? C.gray200 : C.green,
                color: C.white, fontWeight: 800, fontSize: 16, cursor: "pointer" }}>
              {saving ? "Enregistrement…" : "Valider la prise de service"}
            </button>
          </div>

        ) : (
          <div style={{ background: C.white, borderRadius: 14, padding: 20, border: `1px solid ${C.gray200}` }}>
            <button onClick={() => setAction(null)}
              style={{ background: "none", border: "none", color: C.gray400, cursor: "pointer",
                fontSize: 13, padding: 0, marginBottom: 18 }}>
              ← Retour
            </button>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14, color: C.gray800 }}>Type d'incident</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              {INCTYPES.map(t => (
                <button key={t} onClick={() => setIncType(t)}
                  style={{ padding: "11px 8px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                    border: `2px solid ${incType === t ? C.red : C.gray200}`,
                    background: incType === t ? C.redL : C.white,
                    color: incType === t ? C.red : C.gray600, cursor: "pointer" }}>
                  {t}
                </button>
              ))}
            </div>
            <textarea value={incDesc} onChange={e => setIncDesc(e.target.value)}
              placeholder="Description (optionnel)…"
              style={{ width: "100%", padding: "13px 14px", borderRadius: 10,
                border: `1px solid ${C.gray200}`, fontSize: 14, minHeight: 80,
                resize: "none", boxSizing: "border-box", marginBottom: 14 }} />
            <button onClick={handleIncident} disabled={!incType || saving}
              style={{ width: "100%", padding: 16, borderRadius: 12, border: "none",
                background: !incType || saving ? C.gray200 : C.red,
                color: C.white, fontWeight: 800, fontSize: 16, cursor: "pointer" }}>
              {saving ? "Envoi…" : "Envoyer l'incident"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}