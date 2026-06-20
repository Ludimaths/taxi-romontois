"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";
import { Badge, Card, InfoBox, SectionTitle } from "@/components/ui";
import type { Circuit, Conducteur } from "@/lib/types";

export default function CircuitsPage() {
  const supabase = createClient();
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [drivers, setDrivers] = useState<Conducteur[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("circuits").select("*, cercle:cercles_scolaires(*)").order("num"),
      supabase.from("conducteurs").select("*, vehicule:vehicules(*)").order("nom"),
    ]).then(([cir, drv]) => {
      setCircuits(cir.data ?? []);
      setDrivers(drv.data ?? []);
      setLoading(false);
    });
  }, []);

  const filtered = circuits.filter(c =>
    `${c.nom} ${c.num} ${c.cercle?.nom ?? ""}`.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: C.gray400 }}>Chargement…</div>;

  return (
    <div>
      <SectionTitle title={`Circuits (${circuits.length})`} />
      <div style={{ marginBottom: 14 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher circuit…"
          style={{ padding: "9px 14px", borderRadius: 8, border: `1px solid ${C.gray200}`, fontSize: 13, outline: "none", width: 280 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
        {filtered.map(c => {
          const drv = drivers.find(d => d.circuit_id === c.id && d.status !== "absent");
          return (
            <Card key={c.id} style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ fontSize: 32 }}>{c.emoji}</div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: C.navy }}>{c.num}-{c.nom}</div>
                    <div style={{ fontSize: 12, color: C.gray400 }}>{c.cercle?.nom} · {c.enfants_count} enfants</div>
                  </div>
                </div>
                <Badge color={drv ? "green" : "red"}>{drv ? "Couvert" : "Non couvert"}</Badge>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                <InfoBox label="Conducteur" value={drv ? `${drv.prenom} ${drv.nom}` : "⚠ Non affecté"} highlight={!drv ? C.red : undefined} />
                <InfoBox label="Véhicule" value={drv?.vehicule?.plaque || "—"} />
                <InfoBox label="Kilomètres" value={c.km_aller ? `${c.km_aller} km` : "—"} />
                <InfoBox label="N° tournée" value={c.num} />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
