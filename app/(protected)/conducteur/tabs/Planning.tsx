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
type Exc = { eleve_id: number; type: string; date_debut: string; date_fin: string };

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const JOUR_LONG: Record<number, string> = { 0: "Dimanche", 1: "Lundi", 2: "Mardi", 3: "Mercredi", 4: "Jeudi", 5: "Vendredi", 6: "Samedi" };
const DOW = ["L", "M", "M", "J", "V", "S", "D"];

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// Code couleur des exceptions (identique à l'établissement)
const excColor = (t: string) => t === "absent" ? "#E02424" : t === "parent" ? "#D97706" : t === "changement_circuit" ? "#7C3AED" : C.gray400;

export function TabPlanning({ circuits, week, exceptions }:
  { circuits: Circ[]; week: HebdoRow[]; exceptions: Exc[] }) {
  const today = new Date();
  const [view, setView] = useState<{ y: number; m: number }>({ y: today.getFullYear(), m: today.getMonth() });
  const [sel, setSel] = useState<string>(ymd(today));
  const todayStr = ymd(today);
  // Élèves absents/ramenés pour la DATE sélectionnée (les périodes couvrent plusieurs jours)
  const excSet = new Set(exceptions.filter(e => e.date_debut <= sel && e.date_fin >= sel).map(e => e.eleve_id));

  // Grille du mois (semaine commençant le lundi)
  const first = new Date(view.y, view.m, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.y, view.m, d));

  const selDate = new Date(`${sel}T00:00:00`);
  const selJour = selDate.getDay();                 // 0=dim … 6=sam
  const isWeekend = selJour === 0 || selJour === 6;

  const shift = (delta: number) => {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <div>
      {/* En-tête calendrier */}
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 8px rgba(0,0,0,.06)", padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <button onClick={() => shift(-1)} style={navBtnStyle}>‹</button>
          <div style={{ fontWeight: 900, fontSize: 16, color: C.navy, textTransform: "capitalize" }}>{MOIS[view.m]} {view.y}</div>
          <button onClick={() => shift(1)} style={navBtnStyle}>›</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 4 }}>
          {DOW.map((d, i) => (
            <div key={i} style={{ textAlign: "center", fontSize: 11, fontWeight: 800, color: i >= 5 ? C.gray400 : C.gray600 }}>{d}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const str = ymd(d);
            const dow = d.getDay();
            const weekend = dow === 0 || dow === 6;
            const isToday = str === todayStr;
            const isSel = str === sel;
            const dTypes = [...new Set(exceptions.filter(e => e.date_debut <= str && e.date_fin >= str).map(e => e.type))];
            return (
              <button key={i} onClick={() => setSel(str)} disabled={weekend}
                style={{
                  aspectRatio: "1", borderRadius: 10, border: isToday ? `2px solid ${C.green}` : "1px solid transparent",
                  cursor: weekend ? "default" : "pointer", fontSize: 13.5, fontWeight: isSel || isToday ? 900 : 600,
                  background: isSel ? C.navy : isToday ? C.greenL : weekend ? "transparent" : "#F8FAFC",
                  color: isSel ? "#fff" : weekend ? C.gray400 : isToday ? C.greenD : C.navy,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                }}>
                <span>{d.getDate()}</span>
                {dTypes.length > 0 && (
                  <span style={{ display: "flex", gap: 2 }}>
                    {dTypes.slice(0, 3).map(t => (
                      <span key={t} style={{ width: 5, height: 5, borderRadius: "50%", background: isSel ? "#fff" : excColor(t) }} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 10, fontSize: 11, color: C.gray600, justifyContent: "center", flexWrap: "wrap" }}>
          <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, border: `2px solid ${C.green}`, verticalAlign: "middle", marginRight: 4 }} />Aujourd&apos;hui</span>
          <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: C.navy, verticalAlign: "middle", marginRight: 4 }} />Sélectionné</span>
          <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#E02424", verticalAlign: "middle", marginRight: 4 }} />Absent</span>
          <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#D97706", verticalAlign: "middle", marginRight: 4 }} />Parents</span>
          <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#7C3AED", verticalAlign: "middle", marginRight: 4 }} />Changement</span>
        </div>
      </div>

      {/* Emploi du temps du jour sélectionné */}
      <div style={{ fontSize: 15, fontWeight: 900, color: C.navy, margin: "0 2px 12px", textTransform: "capitalize" }}>
        {JOUR_LONG[selJour]} {selDate.getDate()} {MOIS[selDate.getMonth()]}
      </div>

      {isWeekend ? (
        <div style={{ padding: 24, textAlign: "center", color: C.gray, background: "#fff", borderRadius: 16 }}>
          Pas de tournée le week-end.
        </div>
      ) : circuits.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: C.gray, background: "#fff", borderRadius: 16 }}>
          Aucun circuit attribué pour le moment.
        </div>
      ) : circuits.map(c => {
        const stops = week.filter(h => h.circuit_id === c.id && h.jour === selJour);
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

const navBtnStyle: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 10, border: `1px solid ${C.gray200}`, background: "#fff",
  color: C.navy, fontSize: 20, fontWeight: 900, cursor: "pointer", lineHeight: 1,
};

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
