"use client";
import { useState, useMemo } from "react";
import { ChevronLeft } from "lucide-react";
import { C } from "@/lib/constants";

export interface HistCalItem {
  id: number | string;
  date: string; // YYYY-MM-DD
}

const MONTHS_FR = [
  "Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre",
];

// Ordre scolaire : Sept→Août
const SY_MONTHS = [8,9,10,11,0,1,2,3,4,5,6,7];

function syOf(d: string): string {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  const m = dt.getMonth(), y = dt.getFullYear();
  return m >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

interface Props<T extends HistCalItem> {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  renderDayExtra?: (day: string, dayItems: T[]) => React.ReactNode;
  emptyLabel?: string;
}

export default function HistoriqueCalendrier<T extends HistCalItem>({
  items, renderItem, renderDayExtra, emptyLabel = "Aucun élément dans l'historique",
}: Props<T>) {
  const [selYear,  setSelYear]  = useState<string | null>(null);
  const [selMonth, setSelMonth] = useState<string | null>(null);
  const [selDay,   setSelDay]   = useState<string | null>(null);

  const valid = useMemo(() => items.filter(it => !!it.date), [items]);

  const byDate = useMemo(() => {
    const map: Record<string, T[]> = {};
    valid.forEach(it => { (map[it.date] ??= []).push(it); });
    return map;
  }, [valid]);

  const schoolYears = useMemo(() =>
    [...new Set(valid.map(it => syOf(it.date)))].sort().reverse()
  , [valid]);

  const currentSY = useMemo(() => syOf(new Date().toISOString().slice(0, 10)), []);

  const back = () => {
    if (selDay)   { setSelDay(null);   return; }
    if (selMonth) { setSelMonth(null); return; }
    setSelYear(null);
  };

  if (valid.length === 0) return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: C.gray400 }}>
      <p style={{ fontWeight: 700, fontSize: 15 }}>{emptyLabel}</p>
    </div>
  );

  function BackBtn({ label }: { label: string }) {
    return (
      <button onClick={back}
        style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16,
          background: "none", border: "none", cursor: "pointer", padding: 0,
          color: C.navyL, fontWeight: 700, fontSize: 14 }}>
        <ChevronLeft size={17} /> {label}
      </button>
    );
  }

  // ── Niveau 1 : années scolaires ───────────────────────────────────────────
  if (!selYear) {
    return (
      <div>
        {schoolYears.map(sy => {
          const cnt = valid.filter(it => syOf(it.date) === sy).length;
          const isCur = sy === currentSY;
          return (
            <button key={sy} onClick={() => { setSelYear(sy); setSelMonth(null); setSelDay(null); }}
              style={{ width: "100%", display: "flex", justifyContent: "space-between",
                alignItems: "center", padding: "16px 20px", marginBottom: 10,
                background: isCur ? C.skyL : C.white,
                border: `1.5px solid ${isCur ? C.navyL : C.gray200}`,
                borderRadius: 14, cursor: "pointer",
                boxShadow: "0 2px 6px rgba(0,0,0,0.06)" }}>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: C.navy }}>
                  Année scolaire {sy.replace("/", " – ")}
                </div>
                {isCur && (
                  <div style={{ fontSize: 11, color: C.navyL, fontWeight: 700, marginTop: 2 }}>
                    En cours
                  </div>
                )}
              </div>
              <span style={{ background: isCur ? C.navyL : C.gray200,
                color: isCur ? C.white : C.gray600,
                borderRadius: 20, padding: "4px 12px", fontWeight: 800, fontSize: 13 }}>
                {cnt}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // ── Niveau 2 : grille des mois ────────────────────────────────────────────
  const [sy1, sy2] = selYear.split("/").map(Number);
  const monthsInSY = SY_MONTHS.map(m => ({
    ym: `${m >= 8 ? sy1 : sy2}-${String(m + 1).padStart(2, "0")}`,
    mIdx: m,
  }));

  if (!selMonth) {
    return (
      <div>
        <BackBtn label="Années scolaires" />
        <div style={{ marginBottom: 14, fontWeight: 800, fontSize: 16, color: C.navy }}>
          {selYear.replace("/", " – ")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {monthsInSY.map(({ ym, mIdx }) => {
            const cnt = Object.keys(byDate)
              .filter(d => d.startsWith(ym))
              .reduce((s, d) => s + byDate[d].length, 0);
            return (
              <button key={ym} onClick={() => cnt > 0 && setSelMonth(ym)}
                disabled={cnt === 0}
                style={{ padding: "12px 8px", borderRadius: 10, textAlign: "center",
                  border: `1.5px solid ${cnt > 0 ? C.navyL : C.gray200}`,
                  background: cnt > 0 ? C.skyL : C.gray50,
                  cursor: cnt > 0 ? "pointer" : "default",
                  opacity: cnt > 0 ? 1 : 0.4 }}>
                <div style={{ fontWeight: 700, fontSize: 12,
                  color: cnt > 0 ? C.navy : C.gray400 }}>
                  {MONTHS_FR[mIdx]}
                </div>
                {cnt > 0 && (
                  <div style={{ fontSize: 20, fontWeight: 900, color: C.navyL, marginTop: 4 }}>{cnt}</div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const [mY, mMStr] = selMonth.split("-");
  const monthLabel = `${MONTHS_FR[parseInt(mMStr) - 1]} ${mY}`;
  const daysOfMonth = Object.keys(byDate)
    .filter(d => d.startsWith(selMonth))
    .sort()
    .reverse();

  // ── Niveau 3 : liste des jours ────────────────────────────────────────────
  if (!selDay) {
    return (
      <div>
        <BackBtn label={selYear.replace("/", " – ")} />
        <div style={{ marginBottom: 14, fontWeight: 800, fontSize: 16, color: C.navy }}>{monthLabel}</div>
        {daysOfMonth.map(day => {
          const cnt = (byDate[day] || []).length;
          const dt = new Date(day + "T00:00:00");
          const lbl = dt.toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long" });
          return (
            <button key={day} onClick={() => setSelDay(day)}
              style={{ width: "100%", display: "flex", justifyContent: "space-between",
                alignItems: "center", padding: "14px 18px", marginBottom: 8,
                background: C.white, border: `1.5px solid ${C.gray200}`,
                borderRadius: 12, cursor: "pointer",
                boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: C.gray800,
                textAlign: "left", textTransform: "capitalize" }}>
                {lbl}
              </div>
              <span style={{ background: C.navyL, color: C.white, borderRadius: 20,
                padding: "2px 10px", fontWeight: 800, fontSize: 12 }}>
                {cnt}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // ── Niveau 4 : détail du jour ─────────────────────────────────────────────
  const dayItems = byDate[selDay] || [];
  const dd = new Date(selDay + "T00:00:00");
  const dayLabel = dd.toLocaleDateString("fr-CH", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div>
      <BackBtn label={monthLabel} />
      <div style={{ marginBottom: 14, fontWeight: 800, fontSize: 16, color: C.navy,
        textTransform: "capitalize" }}>
        {dayLabel}
      </div>
      {dayItems.map(item => <div key={item.id}>{renderItem(item)}</div>)}
      {renderDayExtra?.(selDay, dayItems)}
    </div>
  );
}
