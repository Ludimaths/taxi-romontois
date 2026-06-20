"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";
import { Badge, Card, InfoBox, SectionTitle } from "@/components/ui";
import type { Vehicule, Circuit, Conducteur } from "@/lib/types";

export default function VehiculesPage() {
  const supabase = createClient();
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("vehicules")
      .select("*, circuit:circuits(*,cercle:cercles_scolaires(*)), conducteur:conducteurs(*)")
      .order("plaque")
      .then(({ data }) => { setVehicles(data ?? []); setLoading(false); });
  }, []);

  const stateColor = (s: string) => ({ bon: "green", atelier: "red", attention: "amber" }[s] ?? "gray") as any;
  const stateLabel = (s: string) => ({ bon: "Bon état", atelier: "En atelier", attention: "Attention" }[s] ?? s);

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: C.gray400 }}>Chargement…</div>;

  return (
    <div>
      <SectionTitle title={`Flotte véhicules (${vehicles.length})`} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        {vehicles.map(v => (
          <Card key={v.id} onClick={() => router.push(`/scan/${v.plaque.replace(/ /g, "-")}`)} style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900, color: C.navy }}>{v.plaque}</div>
                <div style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>{v.marque} {v.modele}</div>
              </div>
              <Badge color={stateColor(v.etat)}>{stateLabel(v.etat)}</Badge>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, fontSize: 12, marginBottom: 12 }}>
              <div style={{ background: C.gray50, borderRadius: 6, padding: "6px 9px" }}>
                <div style={{ fontSize: 9, color: C.gray400, textTransform: "uppercase" }}>Places</div>
                <div style={{ fontWeight: 600, marginTop: 1 }}>{v.places}{v.places_handi > 0 ? ` + ${v.places_handi}ha` : ""}</div>
              </div>
              <div style={{ background: v.km > 130000 ? C.redL : C.gray50, borderRadius: 6, padding: "6px 9px" }}>
                <div style={{ fontSize: 9, color: C.gray400, textTransform: "uppercase" }}>Kilométrage</div>
                <div style={{ fontWeight: 600, color: v.km > 130000 ? C.red : C.gray800, marginTop: 1 }}>
                  {v.km.toLocaleString("fr-FR")} km
                </div>
              </div>
              <div style={{ background: C.gray50, borderRadius: 6, padding: "6px 9px", gridColumn: "1/-1" }}>
                <div style={{ fontSize: 9, color: C.gray400, textTransform: "uppercase" }}>Conducteur</div>
                <div style={{ fontWeight: 600, color: v.conducteur ? C.gray800 : C.red, marginTop: 1 }}>
                  {v.conducteur ? `${v.conducteur.prenom} ${v.conducteur.nom}` : "⚠ Non affecté"}
                </div>
              </div>
              {v.circuit && (
                <div style={{ background: C.skyL, borderRadius: 6, padding: "6px 9px", gridColumn: "1/-1" }}>
                  <div style={{ fontSize: 9, color: C.gray400, textTransform: "uppercase" }}>Circuit</div>
                  <div style={{ fontWeight: 600, color: C.navy, marginTop: 1 }}>{v.circuit.emoji} {v.circuit.nom}</div>
                </div>
              )}
            </div>
            <div style={{ borderTop: `1px solid ${C.gray100}`, paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: C.gray400 }}>CT: {v.ct_date || "—"}</span>
              <span style={{ fontSize: 12, color: C.navyL, fontWeight: 700 }}>📱 QR code →</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
