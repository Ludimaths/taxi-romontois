"use client";
import { useState } from "react";
import { C } from "@/lib/constants";
import { circuitImage } from "@/lib/circuit-images";

type HebdoRow = {
  id: number; circuit_id: string; jour: number; sens: "matin" | "aprem";
  ordre: number; heure: string; eleve_nom: string; adresse: string | null;
  eleve_id: number | null; besoin_special: boolean;
};
type Circ = { id: string; nom: string; emoji?: string };
type Exc = { eleve_id: number; type: string };

const JOURS: [string, number][] = [["Lun", 1], ["Mar", 2], ["Mer", 3], ["Jeu", 4], ["Ven", 5]];
const JOUR_LONG: Record<number, string> = { 1: "Lundi", 2: "Mardi", 3: "Mercredi", 4: "Jeudi", 5: "Vendredi" };

export function TabPlanning({ circuits, week, exceptions, today }:
  { circuits: Circ[]; week: HebdoRow[]; exceptions: Exc[]; today: number }) {
  const [jour, setJour] = useState<number>(today >= 1 && today <= 5 ? today : 1);
  const excSet = new Set(exceptions.map(e => e.eleve_id));

  return (
    <div>
      <p style={{ fontSize: 13, color: C.gray, margin: "0 0 12px" }}>
        La tournée s&apos;affiche selon le jour, d&apos;après le fichier de courses. Aujourd&apos;hui : <b style={{ color: C.navy }}>{JOUR_LONG[today] || "—"}</b>.
      </p>

      {/* Sélecteur de jour */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {JOURS.map(([lbl, d]) => (
          <button key={d} onClick={() => setJour(d)}
            style={{ flex: 1, padding: "11px 4px", borderRadius: 11, border: "none", cursor: "pointer",
              background: jour === d ? C.navy : "#fff", color: jour === d ? "#fff" : C.navy,
              fontWeight: 800, fontSize: 13.5, position: "relative",
              boxShadow: jour === d ? "0 3px 10px rgba(13,59,122,.25)" : "0 1px 4px rgba(0,0,0,.06)" }}>
            {lbl}
            {d === today && <span style={{ position: "absolute", top: 5, right: 7, width: 6, height: 6, borderRadius: "50%", background: jour === d ? "#fff" : C.green }} />}
          </button>
        ))}
      </div>

      {circuits.length === 0 && (
        <div style={{ padding: 24, textAlign: "center", color: C.gray, background: "#fff", borderRadius: 16 }}>
          Aucun circuit attribué pour le moment.
        </div>
      )}

      {circuits.map(c => {
        const stops = week.filter(h => h.circuit_id === c.id && h.jour === jour);
        const matin = stops.filter(h => h.sens === "matin");
        const aprem = stops.filter(h => h.sens === "aprem");
        const img = circuitImage(c.id);
        return (
          <div key={c.id} style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 8px rgba(0,0,0,.06)", marginBottom: 14, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 14px", borderBottom: `1px solid ${C.gray100}` }}>
              {img
                ? <div style={{ width: 40, height: 40, borderRadius: 11, background: "#fff", border: `1px solid ${C.gray100}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><img src={img} alt={c.nom} style={{ width: 32, height: 32, objectFit: "contain" }} /></div>
                : <span style={{ fontSize: 26 }}>{c.emoji || "🚌"}</span>}
              <div style={{ fontWeight: 900, fontSize: 16, color: C.navy }}>{c.nom}</div>
            </div>
            {stops.length === 0
              ? <div style={{ padding: 16, color: C.gray, fontSize: 13 }}>Pas de tournée ce jour-là.</div>
              : (<>
                  <Section title="☀️ Matin — ramassage" rows={matin} excSet={excSet} />
                  <Section title="🌙 Après-midi — dépose" rows={aprem} excSet={excSet} />
                </>)}
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, rows, excSet }: { title: string; rows: HebdoRow[]; excSet: Set<number> }) {
  if (!rows.length) return null;
  return (
    <div>
      <div style={{ padding: "8px 14px", fontSize: 11, fontWeight: 800, color: C.gray600, background: "#F8FAFC", textTransform: "uppercase", letterSpacing: ".4px" }}>{title}</div>
      {rows.map((h, i) => {
        const exc = h.eleve_id != null && excSet.has(h.eleve_id);
        return (
          <div key={h.id} style={{ display: "flex", gap: 10, padding: "9px 14px", borderTop: i > 0 ? `1px solid ${C.gray100}` : "none", opacity: exc ? .5 : 1 }}>
            <div style={{ minWidth: 48, fontSize: 12.5, fontWeight: 800, color: C.navy }}>{h.heure}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: "#1E293B" }}>
                {h.eleve_nom}
                {h.besoin_special && <span title="Besoin particulier" style={{ marginLeft: 5 }}>♿</span>}
                {exc && <span style={{ marginLeft: 6, fontSize: 11, color: "#b45309", fontWeight: 800 }}>· ne pas récupérer</span>}
              </div>
              {h.adresse && <div style={{ fontSize: 11.5, color: C.gray, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.adresse}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
