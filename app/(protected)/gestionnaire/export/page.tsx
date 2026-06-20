"use client";
import { useState } from "react";
import { C } from "@/lib/constants";
import { Card, Btn, SectionTitle } from "@/components/ui";

type ExportType = "conducteurs" | "vehicules" | "enfants" | "circuits" | "incidents";
type ExportPeriod = "jour" | "semaine" | "mois" | "annee";

export default function ExportPage() {
  const [type, setType] = useState<ExportType>("conducteurs");
  const [period, setPeriod] = useState<ExportPeriod>("semaine");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    const res = await fetch(`/api/export?type=${type}&period=${period}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `TaxiRomontois_${type}_${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setLoading(false);
    setDone(true);
    setTimeout(() => setDone(false), 3000);
  };

  const TYPES: [ExportType, string, string][] = [
    ["conducteurs", "👤", "Conducteurs"],
    ["vehicules",   "🚌", "Véhicules"],
    ["enfants",     "👶", "Enfants / présences"],
    ["circuits",    "🗺", "Circuits"],
    ["incidents",   "⚡", "Incidents"],
  ];

  const PERIODS: [ExportPeriod, string][] = [
    ["jour",   "Aujourd'hui"],
    ["semaine","Semaine"],
    ["mois",   "Mois"],
    ["annee",  "Année"],
  ];

  return (
    <div>
      <SectionTitle title="Exports" />
      <Card style={{ padding: 26 }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Données à exporter</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {TYPES.map(([k, ic, l]) => (
              <button key={k} onClick={() => setType(k)}
                style={{ padding: "10px 18px", borderRadius: 8, border: `2px solid ${type === k ? C.navyL : C.gray200}`,
                  background: type === k ? C.navyL : C.white, color: type === k ? C.white : C.gray600,
                  fontWeight: 700, cursor: "pointer", fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
                <span>{ic}</span>{l}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 22 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Période</div>
          <div style={{ display: "flex", gap: 8 }}>
            {PERIODS.map(([k, l]) => (
              <button key={k} onClick={() => setPeriod(k)}
                style={{ padding: "7px 18px", borderRadius: 8, border: `2px solid ${period === k ? C.navyL : C.gray200}`,
                  background: period === k ? C.navyL : C.white, color: period === k ? C.white : C.gray600,
                  fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div style={{ background: C.gray50, borderRadius: 10, padding: 16, marginBottom: 20, border: `1px solid ${C.gray200}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.gray800, marginBottom: 4 }}>Format d'export</div>
          <div style={{ fontSize: 12, color: C.gray600 }}>
            ✅ CSV UTF-8 avec BOM · Séparateur ";" · Compatible Excel français<br />
            ✅ En-têtes en français · Encodage des caractères spéciaux (é, è, ü, ç…)
          </div>
        </div>

        <Btn onClick={handleExport} color={C.navy} disabled={loading}>
          {loading ? "Génération…" : done ? "✓ Téléchargé !" : "⬇ Exporter CSV (Excel compatible)"}
        </Btn>
      </Card>
    </div>
  );
}
