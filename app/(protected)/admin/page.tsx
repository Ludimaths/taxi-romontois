"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";
import { Badge, Card, Btn, Stat } from "@/components/ui";
import type { Conducteur, Vehicule, Circuit, Alerte } from "@/lib/types";

export default function AdminPage() {
  const supabase = createClient();
  const [drivers, setDrivers] = useState<Conducteur[]>([]);
  const [vehicles, setVehicles] = useState<Vehicule[]>([]);
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [alertes, setAlertes] = useState<Alerte[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("conducteurs").select("*").order("nom"),
      supabase.from("vehicules").select("*").order("plaque"),
      supabase.from("circuits").select("*"),
      supabase.from("alertes").select("*").order("created_at", { ascending: false }),
    ]).then(([drv, veh, cir, alt]) => {
      setDrivers(drv.data ?? []);
      setVehicles(veh.data ?? []);
      setCircuits(cir.data ?? []);
      setAlertes(alt.data ?? []);
      setLoading(false);
    });
  }, []);

  const handleMarkRead = async (id: number) => {
    await supabase.from("alertes").update({ read: true, read_at: new Date().toISOString() }).eq("id", id);
    setAlertes(prev => prev.map(a => a.id === id ? { ...a, read: true } : a));
  };

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: C.gray400 }}>Chargement…</div>;

  const statusGroups = {
    "En service": drivers.filter(d => d.status === "en_service"),
    "En attente": drivers.filter(d => d.status === "en_attente"),
    "Absents": drivers.filter(d => d.status === "absent"),
    "Disponibles": drivers.filter(d => d.status === "disponible"),
  };
  const vehicleGroups = {
    "En service": vehicles.filter(v => v.etat === "en_service"),
    "En atelier": vehicles.filter(v => ["receptionne","en_attente_piece","en_reparation","repare"].includes(v.etat)),
    "Attention": vehicles.filter(v => v.etat === "attention"),
    "Km élevé (>130k)": vehicles.filter(v => v.km > 130000),
  };
  const groupColors: Record<string, "green" | "amber" | "red"> = {
    "Bon état": "green", "En service": "green",
    "En attente": "amber", "Attention": "amber", "Disponibles": "blue" as any,
    "En atelier": "red", "Absents": "red", "Km élevé (>130k)": "red",
  };

  return (
    <div>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#4A1942,#7C3AED)", borderRadius: 16, padding: "22px 26px", color: C.white, marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 900 }}>Administration</div>
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 3 }}>Vue globale · Gestion des accès & données</div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
        <Stat label="Employés" value={drivers.length} icon="👤" color={C.purple} />
        <Stat label="Véhicules" value={vehicles.length} icon="🚌" color={C.navyL} />
        <Stat label="Circuits" value={circuits.length} icon="🗺" color={C.green} />
        <Stat label="Alertes totales" value={alertes.length} icon="🔔" color={C.amber} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Récap conducteurs */}
        <Card style={{ padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: C.gray800 }}>Récapitulatif conducteurs</div>
          {Object.entries(statusGroups).map(([l, arr]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.gray100}` }}>
              <span style={{ fontSize: 13, color: C.gray800 }}>{l}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: C.gray800 }}>{arr.length}</span>
                <Badge color={groupColors[l] ?? "gray"}>{l}</Badge>
              </div>
            </div>
          ))}
        </Card>

        {/* État flotte */}
        <Card style={{ padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: C.gray800 }}>État de la flotte</div>
          {Object.entries(vehicleGroups).map(([l, arr]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.gray100}` }}>
              <span style={{ fontSize: 13, color: C.gray800 }}>{l}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: C.gray800 }}>{arr.length}</span>
                <Badge color={groupColors[l] ?? "gray"}>{l}</Badge>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* Toutes les alertes */}
      <Card style={{ padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: C.gray800 }}>Toutes les alertes ({alertes.length})</div>
        {alertes.map(a => (
          <div key={a.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "11px 0",
            borderBottom: `1px solid ${C.gray100}`, background: a.read ? C.white : C.skyL }}>
            <div style={{ fontSize: 20 }}>{a.type === "document" ? "📄" : a.type === "reparation" ? "🔧" : "🚌"}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: a.read ? 400 : 700, fontSize: 13 }}>{a.message}</div>
              <div style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>{new Date(a.created_at).toLocaleDateString("fr-FR")}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Badge color={a.severity === "critique" ? "red" : a.severity === "haute" ? "amber" : "gray"}>
                {a.severity === "critique" ? "Critique" : a.severity === "haute" ? "Haute" : "Normale"}
              </Badge>
              {!a.read && <Btn small onClick={() => handleMarkRead(a.id)} color={C.green}>Lu</Btn>}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
