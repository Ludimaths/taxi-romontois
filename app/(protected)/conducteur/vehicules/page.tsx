"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";
import { Card } from "@/components/ui";
import type { Vehicule } from "@/lib/types";

export default function ConducteurVehiculesPage() {
  const supabase = createClient();
  const [vehicles, setVehicles] = useState<Vehicule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("vehicules").select("*, circuit:circuits(*,cercle:cercles_scolaires(*)), conducteur:conducteurs(*)")
      .order("plaque")
      .then(({ data }) => { setVehicles(data ?? []); setLoading(false); });
  }, []);

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: C.gray400 }}>Chargement…</div>;

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: C.gray800, marginBottom: 18 }}>📱 Scanner un véhicule</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        {vehicles.map(v => (
          <a key={v.id} href={`/scan/${v.plaque.replace(/ /g, "-")}`} style={{ textDecoration: "none" }}>
            <Card style={{ padding: 18, cursor: "pointer" }}>
              <div style={{ fontWeight: 900, color: C.navy, fontSize: 16, marginBottom: 4 }}>{v.plaque}</div>
              <div style={{ fontSize: 12, color: C.gray400, marginBottom: 10 }}>{v.marque} {v.modele}</div>
              {v.circuit && (
                <div style={{ fontSize: 12, color: C.navyL, fontWeight: 600 }}>{v.circuit.emoji} {v.circuit.nom}</div>
              )}
              <div style={{ marginTop: 10, fontSize: 12, color: C.navyL, fontWeight: 700 }}>Simuler scan →</div>
            </Card>
          </a>
        ))}
      </div>
    </div>
  );
}
