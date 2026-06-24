"use client";
import { useState } from "react";
import { C } from "@/lib/constants";
import { Card, Btn, SectionTitle } from "@/components/ui";
import { User, Bus, Baby, MapPin, AlertCircle, Download, CheckCircle2 } from "lucide-react";

type ExportType = "conducteurs" | "vehicules" | "enfants" | "circuits" | "incidents";
type ExportPeriod = "jour" | "semaine" | "mois" | "annee";

const TYPE_ICONS = {
  conducteurs: <User size={15} />,
  vehicules:   <Bus size={15} />,
  enfants:     <Baby size={15} />,
  circuits:    <MapPin size={15} />,
  incidents:   <AlertCircle size={15} />,
};

const TYPES: [ExportType, string][] = [
  ["conducteurs", "Conducteurs"],
  ["vehicules",   "Véhicules"],
  ["enfants",     "Enfants / présences"],
  ["circuits",    "Circuits"],
  ["incidents",   "Incidents"],
];

const PERIODS: [ExportPeriod, string][] = [
  ["jour",    "Aujourd'hui"],
  ["semaine", "Semaine"],
  ["mois",    "Mois"],
  ["annee",   "Année"],
];

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

  return (
    <div>
      <SectionTitle title="Exports" />
      <Card style={{ padding: 26 }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Données à exporter</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {TYPES.map(([k, l]) => (
              <button key={k} onClick={() => setType(k)}
                style={{ padding: "10px 18px", borderRadius: 8, border: `2px solid ${type === k ? C.navyL : C.gray200}`,
                  background: type === k ? C.navyL : C.white, color: type === k ? C.white : C.gray600,
                  fontWeight: 700, cursor: "pointer", fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ display: "flex", alignItems: "center" }}>{TYPE_ICONS[k]}</span>{l}
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
          <div style={{ fontSize: 13, fontWeight: 700, color: C.gray800, marginBottom: 6 }}>Format d'export</div>
          <div style={{ fontSize: 12, color: C.gray600 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <CheckCircle2 size={13} color={C.green} />
              CSV UTF-8 avec BOM · Séparateur ";" · Compatible Excel français
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <CheckCircle2 size={13} color={C.green} />
              En-têtes en français · Encodage des caractères spéciaux (é, è, ü, ç…)
            </div>
          </div>
        </div>

        <Btn onClick={handleExport} color={C.navy} disabled={loading}>
          <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
            {done ? <CheckCircle2 size={16} /> : <Download size={16} />}
            {loading ? "Génération…" : done ? "Téléchargé !" : "Exporter CSV (Excel compatible)"}
          </span>
        </Btn>
      </Card>
    </div>
  );
}
