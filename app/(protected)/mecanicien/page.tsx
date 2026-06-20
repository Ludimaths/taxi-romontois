"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { C, SEUIL_REPARATION_CHF } from "@/lib/constants";
import { Badge, Card, Btn, Stat } from "@/components/ui";
import type { Vehicule, Reparation } from "@/lib/types";

export default function MecanicienPage() {
  const supabase = createClient();
  const [vehicles, setVehicles] = useState<Vehicule[]>([]);
  const [reparations, setReparations] = useState<Reparation[]>([]);
  const [selVeh, setSelVeh] = useState<string | null>(null);
  const [showRepForm, setShowRepForm] = useState(false);
  const [repForm, setRepForm] = useState({ description: "", cout: "", responsable: "" });
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    const [veh, rep] = await Promise.all([
      supabase.from("vehicules").select("*, circuit:circuits(*), conducteur:conducteurs(*)").order("plaque"),
      supabase.from("reparations").select("*, vehicule:vehicules(*)").order("created_at", { ascending: false }),
    ]);
    setVehicles(veh.data ?? []);
    setReparations(rep.data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleAddRepair = async () => {
    if (!selVeh || !repForm.description || !repForm.cout) return;
    const cout = parseFloat(repForm.cout);
    const alerte = cout >= SEUIL_REPARATION_CHF;

    await supabase.from("reparations").insert({
      vehicule_id: selVeh,
      description: repForm.description,
      cout,
      responsable: repForm.responsable,
      statut: "en_cours",
      alerte_envoyee: alerte,
    });

    if (alerte) {
      const veh = vehicles.find(v => v.id === selVeh);
      await supabase.from("alertes").insert({
        type: "reparation",
        severity: "haute",
        message: `⚠ Réparation ${veh?.plaque} : ${cout.toFixed(2)} CHF — Seuil 1000 CHF dépassé. ${repForm.description}`,
        read: false,
      });
    }

    setRepForm({ description: "", cout: "", responsable: "" });
    setShowRepForm(false);
    fetchAll();
  };

  const handleVehicleState = async (id: string, etat: string) => {
    await supabase.from("vehicules").update({ etat }).eq("id", id);
    fetchAll();
  };

  const handleRepairDone = async (repId: number) => {
    await supabase.from("reparations").update({ statut: "termine" }).eq("id", repId);
    fetchAll();
  };

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: C.gray400 }}>Chargement…</div>;

  const atelier = vehicles.filter(v => v.etat === "atelier");
  const attention = vehicles.filter(v => v.etat === "attention");
  const urgentKm = vehicles.filter(v => v.km > 130000);
  const openRep = reparations.filter(r => r.statut === "en_cours");
  const totalCout = openRep.reduce((s, r) => s + (r.cout ?? 0), 0);
  const selVehData = selVeh ? vehicles.find(v => v.id === selVeh) : null;
  const selRepairs = reparations.filter(r => r.vehicule_id === selVeh);

  return (
    <div>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#1B4332,#2D6A4F)", borderRadius: 16, padding: "22px 26px", color: C.white, marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 900 }}>Vue Mécanicien</div>
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 3 }}>Suivi atelier & entretien flotte · Seuil réparation {SEUIL_REPARATION_CHF} CHF</div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
        <Stat label="En atelier" value={atelier.length} icon="🔧" color={C.red} />
        <Stat label="Attention requise" value={attention.length} icon="⚠️" color={C.amber} />
        <Stat label="Révision urgente (km)" value={urgentKm.length} icon="📍" color={C.red} />
        <Stat label={`Réparations ouvertes (${totalCout.toFixed(0)} CHF)`} value={openRep.length} icon="💰" color={totalCout >= SEUIL_REPARATION_CHF ? C.red : C.green} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selVeh ? "1fr 1fr" : "1fr", gap: 18 }}>
        {/* Liste véhicules */}
        <Card>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.gray100}`, fontWeight: 700, color: C.gray800 }}>
            Tous les véhicules ({vehicles.length})
          </div>
          {vehicles.map(v => (
            <div key={v.id} onClick={() => setSelVeh(v.id === selVeh ? null : v.id)}
              style={{ padding: "12px 18px", borderBottom: `1px solid ${C.gray100}`,
                display: "flex", justifyContent: "space-between", alignItems: "center",
                cursor: "pointer", background: selVeh === v.id ? C.skyL : C.white }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{v.plaque} — {v.marque} {v.modele}</div>
                <div style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>
                  {v.km.toLocaleString("fr-FR")} km · CT: {v.ct_date || "—"} · Assurance: {v.assurance_date || "—"}
                  {v.circuit && ` · Circuit ${v.circuit.emoji} ${v.circuit.nom}`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {v.km > 130000 && <Badge color="red">⚠ Km</Badge>}
                <Badge color={v.etat === "bon" ? "green" : v.etat === "atelier" ? "red" : "amber"}>
                  {v.etat === "bon" ? "OK" : v.etat === "atelier" ? "Atelier" : "Attention"}
                </Badge>
              </div>
            </div>
          ))}
        </Card>

        {/* Détail véhicule */}
        {selVeh && selVehData && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Card style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: C.navy }}>{selVehData.plaque}</div>
                  <div style={{ fontSize: 12, color: C.gray400 }}>{selVehData.marque} {selVehData.modele} · {selVehData.km.toLocaleString("fr-FR")} km</div>
                </div>
                <button onClick={() => setSelVeh(null)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: C.gray400 }}>×</button>
              </div>

              {/* Changer état */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>État du véhicule</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {([["bon", "✅ Bon état", C.green], ["attention", "⚠ Attention", C.amber], ["atelier", "🔧 En atelier", C.red]] as const).map(([e, l, col]) => (
                    <button key={e} onClick={() => handleVehicleState(selVehData.id, e)}
                      style={{ flex: 1, padding: 8, borderRadius: 8, border: `2px solid ${selVehData.etat === e ? col : C.gray200}`,
                        background: selVehData.etat === e ? col + "22" : C.white, color: selVehData.etat === e ? col : C.gray600,
                        fontWeight: 700, cursor: "pointer", fontSize: 11 }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ajouter réparation */}
              <Btn full onClick={() => setShowRepForm(!showRepForm)} color={C.navyL}>🔧 Ajouter une réparation</Btn>
              {showRepForm && (
                <div style={{ marginTop: 14, padding: 14, background: C.gray50, borderRadius: 10 }}>
                  <div style={{ fontSize: 12, color: C.amber, fontWeight: 700, marginBottom: 8 }}>
                    ⚠ Alerte automatique si coût ≥ {SEUIL_REPARATION_CHF} CHF
                  </div>
                  {["description", "cout", "responsable"].map(field => (
                    <div key={field} style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 11, color: C.gray600, textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                        {field === "cout" ? "Coût estimé (CHF)" : field === "responsable" ? "Responsable" : "Description"}
                      </label>
                      <input type={field === "cout" ? "number" : "text"}
                        value={(repForm as any)[field]} onChange={e => setRepForm(p => ({ ...p, [field]: e.target.value }))}
                        placeholder={field === "cout" ? "ex: 450.00" : ""}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.gray200}`, fontSize: 13, boxSizing: "border-box" }} />
                    </div>
                  ))}
                  {repForm.cout && parseFloat(repForm.cout) >= SEUIL_REPARATION_CHF && (
                    <div style={{ background: C.redL, borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 12, color: C.red, fontWeight: 700 }}>
                      🔴 Seuil {SEUIL_REPARATION_CHF} CHF dépassé — alerte automatique gestionnaire & admin
                    </div>
                  )}
                  <Btn full onClick={handleAddRepair} disabled={!repForm.description || !repForm.cout} color={C.green}>
                    ✅ Enregistrer la réparation
                  </Btn>
                </div>
              )}
            </Card>

            {/* Historique réparations */}
            <Card>
              <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.gray100}`, fontWeight: 700 }}>
                Réparations ({selRepairs.length})
              </div>
              {selRepairs.length === 0
                ? <div style={{ padding: 16, textAlign: "center", color: C.gray400, fontSize: 13 }}>Aucune réparation enregistrée</div>
                : selRepairs.map(r => (
                  <div key={r.id} style={{ padding: "12px 18px", borderBottom: `1px solid ${C.gray100}`,
                    display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{r.description}</div>
                      <div style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>
                        {new Date(r.date_reparation).toLocaleDateString("fr-FR")} · {r.cout?.toFixed(2)} CHF
                        {r.alerte_envoyee && " · ⚠ Alerte envoyée"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {r.cout >= SEUIL_REPARATION_CHF && <Badge color="red">≥1000 CHF</Badge>}
                      <Badge color={r.statut === "termine" ? "green" : "amber"}>
                        {r.statut === "termine" ? "Terminé" : "En cours"}
                      </Badge>
                      {r.statut === "en_cours" && (
                        <Btn small onClick={() => handleRepairDone(r.id)} color={C.green}>✓ Terminé</Btn>
                      )}
                    </div>
                  </div>
                ))
              }
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
