"use client";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";
import { circuitImage } from "@/lib/circuit-images";

type Circ = { id: string; nom: string; emoji?: string; conducteur?: string };
type HebdoRow = { id: number; circuit_id: string; jour: number; sens: "matin" | "aprem"; ordre: number; heure: string; eleve_nom: string; adresse: string | null; eleve_id: number | null };
type Prise = { eleve_id: number; circuit_id: string | null; date: string; sens: string; statut: string };

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const JOUR_LONG: Record<number, string> = { 0: "Dimanche", 1: "Lundi", 2: "Mardi", 3: "Mercredi", 4: "Jeudi", 5: "Vendredi", 6: "Samedi" };
const DOW = ["L", "M", "M", "J", "V", "S", "D"];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function HistoriqueEtab({ circuits }: { circuits: Circ[] }) {
  const sb = useMemo(() => createClient(), []);
  const today = new Date();
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [sel, setSel] = useState(ymd(today));
  const [selCirc, setSelCirc] = useState("");
  const [mode, setMode] = useState<"jour" | "mois">("jour");
  const [hebdo, setHebdo] = useState<HebdoRow[]>([]);
  const [prises, setPrises] = useState<Prise[]>([]);

  const circIds = useMemo(() => circuits.map(c => c.id), [circuits]);
  const activeCirc = selCirc || circuits[0]?.id || "";

  useEffect(() => {
    if (!circIds.length) { setHebdo([]); return; }
    sb.from("tournee_hebdo").select("id,circuit_id,jour,sens,ordre,heure,eleve_nom,adresse,eleve_id")
      .in("circuit_id", circIds).then(({ data }) => setHebdo((data ?? []) as HebdoRow[]));
  }, [sb, circIds]);

  useEffect(() => {
    if (!circIds.length) { setPrises([]); return; }
    const start = `${view.y}-${String(view.m + 1).padStart(2, "0")}-01`;
    const end = ymd(new Date(view.y, view.m + 1, 0));
    sb.from("prises_en_charge").select("eleve_id,circuit_id,date,sens,statut")
      .in("circuit_id", circIds).gte("date", start).lte("date", end)
      .then(({ data }) => setPrises((data ?? []) as Prise[]));
  }, [sb, circIds, view]);

  const first = new Date(view.y, view.m, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.y, view.m, d));
  const todayStr = ymd(today);

  const selDate = new Date(`${sel}T00:00:00`);
  const selJour = selDate.getDay();
  const isWeekend = selJour === 0 || selJour === 6;
  const shift = (delta: number) => { const d = new Date(view.y, view.m + delta, 1); setView({ y: d.getFullYear(), m: d.getMonth() }); };

  const priseFor = (eleveId: number | null, sens: "aller" | "retour") =>
    eleveId == null ? undefined : prises.find(p => p.date === sel && p.eleve_id === eleveId && p.sens === sens);
  const joursAvecActivite = useMemo(() => new Set(prises.map(p => p.date)), [prises]);

  const stopsDuJour = (cid: string, sens: "matin" | "aprem") =>
    hebdo.filter(h => h.circuit_id === cid && h.jour === selJour && h.sens === sens).sort((a, b) => a.ordre - b.ordre);

  const circ = circuits.find(c => c.id === activeCirc);
  const matin = circ ? stopsDuJour(circ.id, "matin") : [];
  const aprem = circ ? stopsDuJour(circ.id, "aprem") : [];
  const prisMatin = matin.filter(h => priseFor(h.eleve_id, "aller")?.statut === "present").length;
  const absMatin = matin.filter(h => priseFor(h.eleve_id, "aller")?.statut === "absent").length;
  const prisAprem = aprem.filter(h => priseFor(h.eleve_id, "retour")?.statut === "present").length;

  // Export Excel du jour sélectionné (tous les circuits)
  const exportJour = () => {
    const rows: Record<string, string>[] = [];
    for (const c of circuits) {
      for (const sens of ["matin", "aprem"] as const) {
        for (const h of stopsDuJour(c.id, sens)) {
          const pr = priseFor(h.eleve_id, sens === "matin" ? "aller" : "retour");
          rows.push({
            Date: sel, Circuit: c.nom, Moment: sens === "matin" ? "Matin (ramassage)" : "Après-midi (dépose)",
            Heure: h.heure, "Élève": h.eleve_nom, Adresse: h.adresse ?? "",
            Statut: pr?.statut === "present" ? (sens === "matin" ? "Pris" : "Déposé") : pr?.statut === "absent" ? "Absent" : "Non réalisé",
          });
        }
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 11 }, { wch: 16 }, { wch: 20 }, { wch: 8 }, { wch: 26 }, { wch: 34 }, { wch: 13 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Historique");
    XLSX.writeFile(wb, `historique_${sel}.xlsx`);
  };

  // Récapitulatif du mois par circuit (d'après les prises du mois chargées)
  const moisStats = circuits.map(c => {
    const pc = prises.filter(p => p.circuit_id === c.id);
    return {
      c,
      jours: new Set(pc.map(p => p.date)).size,
      ram: pc.filter(p => p.sens === "aller" && p.statut === "present").length,
      dep: pc.filter(p => p.sens === "retour" && p.statut === "present").length,
      abs: pc.filter(p => p.statut === "absent").length,
    };
  });

  // Export Excel du mois : détail jour par jour (planifié + réalisé)
  const exportMois = () => {
    const rows: Record<string, string>[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(view.y, view.m, d);
      const jw = dt.getDay();
      if (jw < 1 || jw > 5) continue;
      const iso = ymd(dt);
      for (const c of circuits) {
        for (const sens of ["matin", "aprem"] as const) {
          const stops = hebdo.filter(h => h.circuit_id === c.id && h.jour === jw && h.sens === sens).sort((a, b) => a.ordre - b.ordre);
          for (const h of stops) {
            const pr = h.eleve_id == null ? undefined : prises.find(p => p.date === iso && p.eleve_id === h.eleve_id && p.sens === (sens === "matin" ? "aller" : "retour"));
            rows.push({
              Date: iso, Circuit: c.nom, Conducteur: c.conducteur ?? "", Moment: sens === "matin" ? "Matin (ramassage)" : "Après-midi (dépose)",
              Heure: h.heure, "Élève": h.eleve_nom, Adresse: h.adresse ?? "",
              Statut: pr?.statut === "present" ? (sens === "matin" ? "Pris" : "Déposé") : pr?.statut === "absent" ? "Absent" : "Non réalisé",
            });
          }
        }
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: "Aucune donnée pour ce mois" }]);
    ws["!cols"] = [{ wch: 11 }, { wch: 16 }, { wch: 18 }, { wch: 20 }, { wch: 8 }, { wch: 26 }, { wch: 34 }, { wch: 13 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mois");
    XLSX.writeFile(wb, `historique_${view.y}-${String(view.m + 1).padStart(2, "0")}.xlsx`);
  };

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ background: "#EFF6FF", border: "1px solid #cfe0fb", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#0f2f66", lineHeight: 1.5, marginBottom: 16 }}>
        Historique conservé jour par jour et par circuit — tournée prévue (matin &amp; après-midi) et ce qui a été <b>réellement réalisé</b>. Exportable en Excel pour la facturation et l&apos;archivage.
      </div>

      <div className="plan-grid">
        {/* Calendrier */}
        <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <button onClick={() => shift(-1)} style={navBtn}>‹</button>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#0f2540", textTransform: "capitalize" }}>{MOIS[view.m]} {view.y}</div>
            <button onClick={() => shift(1)} style={navBtn}>›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, marginBottom: 6 }}>
            {DOW.map((d, i) => <div key={i} style={{ textAlign: "center", fontSize: 11, fontWeight: 800, color: C.gray400 }}>{d}</div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const str = ymd(d);
              const weekend = d.getDay() === 0 || d.getDay() === 6;
              const isToday = str === todayStr;
              const isSel = str === sel;
              const hasAct = joursAvecActivite.has(str);
              return (
                <button key={i} onClick={() => setSel(str)}
                  style={{ position: "relative", aspectRatio: "1", borderRadius: 9, cursor: "pointer",
                    border: isToday ? `2px solid ${C.green}` : "1px solid transparent", fontSize: 13, fontWeight: isSel || isToday ? 900 : 600,
                    background: isSel ? C.navy : weekend ? C.gray50 : "#fff", color: isSel ? "#fff" : weekend ? C.gray400 : "#0f2540" }}>
                  {d.getDate()}
                  {hasAct && <span style={{ position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)", width: 5, height: 5, borderRadius: "50%", background: isSel ? "#fff" : C.green }} />}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 10, fontSize: 11.5, color: C.gray }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: C.green, marginRight: 5, verticalAlign: "middle" }} />
            Jour avec des prises enregistrées
          </div>
        </div>

        {/* Détail : basculement Jour / Mois */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", borderRadius: 9, overflow: "hidden", border: `1px solid ${C.gray200}` }}>
              {(["jour", "mois"] as const).map(md => (
                <button key={md} onClick={() => setMode(md)}
                  style={{ padding: "7px 18px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 800,
                    background: mode === md ? C.navy : "#fff", color: mode === md ? "#fff" : C.gray600 }}>
                  {md === "jour" ? "Jour" : "Mois"}
                </button>
              ))}
            </div>
            <button onClick={mode === "jour" ? exportJour : exportMois}
              style={{ background: C.navy, color: "#fff", border: "none", borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
              ⬇︎ {mode === "jour" ? "Exporter ce jour" : "Exporter le mois"} (Excel)
            </button>
          </div>

          {mode === "mois" ? (
            <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", fontWeight: 900, fontSize: 14, color: "#0f2540", borderBottom: `1px solid ${C.gray100}`, textTransform: "capitalize" }}>
                Récapitulatif — {MOIS[view.m]} {view.y}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr repeat(4, .7fr)", fontSize: 11, fontWeight: 800, color: C.gray600, background: "#F8FAFC", padding: "8px 14px", gap: 6 }}>
                <div>Circuit</div><div>Conducteur</div><div style={{ textAlign: "center" }}>Jours</div><div style={{ textAlign: "center" }}>Ramass.</div><div style={{ textAlign: "center" }}>Dépos.</div><div style={{ textAlign: "center" }}>Abs.</div>
              </div>
              {moisStats.map(({ c, jours, ram, dep, abs }) => (
                <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr repeat(4, .7fr)", fontSize: 13, padding: "10px 14px", gap: 6, borderTop: `1px solid ${C.gray100}`, alignItems: "center" }}>
                  <div style={{ fontWeight: 800, color: "#0f2540", display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}><span>{c.emoji || "🚌"}</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nom}</span></div>
                  <div style={{ color: c.conducteur ? C.gray800 : C.gray400, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.conducteur || "—"}</div>
                  <div style={{ textAlign: "center", fontWeight: 800, color: C.navy }}>{jours}</div>
                  <div style={{ textAlign: "center", fontWeight: 800, color: "#15803D" }}>{ram}</div>
                  <div style={{ textAlign: "center", fontWeight: 800, color: "#6366F1" }}>{dep}</div>
                  <div style={{ textAlign: "center", fontWeight: 800, color: abs ? "#E02424" : C.gray400 }}>{abs}</div>
                </div>
              ))}
              <div style={{ padding: "10px 14px", fontSize: 11.5, color: C.gray, background: "#F8FAFC", borderTop: `1px solid ${C.gray100}` }}>
                « Jours » = jours avec au moins une prise enregistrée · « Ramass./Dépos. » = élèves réellement pris / déposés dans le mois.
              </div>
            </div>
          ) : (<>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#0f2540", marginBottom: 10, textTransform: "capitalize" }}>
            {JOUR_LONG[selJour]} {selDate.getDate()} {MOIS[selDate.getMonth()]}
          </div>

          {/* Onglets par circuit */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {circuits.map(c => (
              <button key={c.id} onClick={() => setSelCirc(c.id)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 20, cursor: "pointer",
                  border: `1.5px solid ${activeCirc === c.id ? C.navy : C.gray200}`, background: activeCirc === c.id ? C.navy : C.white,
                  color: activeCirc === c.id ? "#fff" : C.gray600, fontWeight: 800, fontSize: 12.5 }}>
                <span style={{ fontSize: 15 }}>{c.emoji || "🚌"}</span>{c.nom}
              </button>
            ))}
          </div>

          {isWeekend ? (
            <div style={{ padding: 26, textAlign: "center", color: C.gray400, background: C.gray50, borderRadius: 12, fontSize: 13 }}>Pas de tournée le week-end.</div>
          ) : !circ ? (
            <div style={{ padding: 26, textAlign: "center", color: C.gray400, background: C.gray50, borderRadius: 12, fontSize: 13 }}>Aucun circuit.</div>
          ) : (
            <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 14px", borderBottom: `1px solid ${C.gray100}` }}>
                {circuitImage(circ.id)
                  ? <div style={{ width: 38, height: 38, borderRadius: 10, background: "#fff", border: `1px solid ${C.gray100}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><img src={circuitImage(circ.id)!} alt={circ.nom} style={{ width: 30, height: 30, objectFit: "contain" }} /></div>
                  : <span style={{ fontSize: 24 }}>{circ.emoji || "🚌"}</span>}
                <div style={{ fontWeight: 900, fontSize: 15, color: "#0f2540", flex: 1 }}>{circ.nom}</div>
                <div style={{ fontSize: 11.5, color: C.gray600, textAlign: "right" }}>
                  <div>☀️ {prisMatin}/{matin.length} pris{absMatin ? ` · ${absMatin} abs.` : ""}</div>
                  <div>🌙 {prisAprem}/{aprem.length} déposés</div>
                </div>
              </div>
              {matin.length === 0 && aprem.length === 0
                ? <div style={{ padding: 16, color: C.gray400, fontSize: 13 }}>Pas de tournée ce jour-là.</div>
                : (<>
                    <Section title="☀️ Matin — ramassage" rows={matin} sens="aller" priseFor={priseFor} />
                    <Section title="🌙 Après-midi — dépose" rows={aprem} sens="retour" priseFor={priseFor} />
                  </>)}
            </div>
          )}
          </>)}
        </div>
      </div>
    </div>
  );
}

const navBtn: React.CSSProperties = { background: C.gray50, border: `1px solid ${C.gray200}`, borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontWeight: 900, color: C.gray, fontSize: 18 };

function Section({ title, rows, sens, priseFor }:
  { title: string; rows: HebdoRow[]; sens: "aller" | "retour"; priseFor: (id: number | null, s: "aller" | "retour") => { statut: string } | undefined }) {
  if (!rows.length) return null;
  return (
    <div>
      <div style={{ padding: "7px 14px", fontSize: 11, fontWeight: 800, color: C.gray600, background: "#F8FAFC", textTransform: "uppercase", letterSpacing: ".4px" }}>{title}</div>
      {rows.map((h, i) => {
        const pr = priseFor(h.eleve_id, sens);
        const done = pr?.statut === "present";
        const absent = pr?.statut === "absent";
        const col = done ? C.green : absent ? C.red : "#c3ccd8";
        return (
          <div key={h.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 14px", borderTop: i > 0 ? `1px solid ${C.gray100}` : "none" }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, color: "#fff", fontWeight: 800, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", background: col }}>
              {done ? "✓" : absent ? "✗" : "○"}
            </div>
            <div style={{ minWidth: 46, fontSize: 12, fontWeight: 800, color: C.navy }}>{h.heure}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#1E293B" }}>{h.eleve_nom}</div>
              {h.adresse && <div style={{ fontSize: 11, color: C.gray, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.adresse}</div>}
            </div>
            <div style={{ fontSize: 11, fontWeight: 800, color: col }}>{done ? "Réalisé" : absent ? "Absent" : "—"}</div>
          </div>
        );
      })}
    </div>
  );
}
