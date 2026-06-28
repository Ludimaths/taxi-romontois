"use client";
import { C, fmtHHMM } from "@/lib/constants";
import type { ServiceLog, Incident } from "@/lib/types";
import { calcDuration, SIGN_TYPES } from "./shared";
import HistoriqueCalendrier from "@/components/HistoriqueCalendrier";

type LogItem = ServiceLog & { date: string };

export interface HistoriqueProps {
  histLogs: ServiceLog[];
  incidents: Incident[];
}

export function TabHistorique({ histLogs, incidents }: HistoriqueProps) {
  const items: LogItem[] = histLogs.map(l => ({ ...l, date: l.date_service }));

  const STATUS_MAP: Record<string, { l: string; c: string; bg: string }> = {
    en_attente: { l: "En attente", c: C.amber,    bg: C.amberL },
    en_cours:   { l: "Traité",     c: "#3B82F6",  bg: "#DBEAFE" },
    resolu:     { l: "Résolu",     c: C.green,    bg: C.greenL  },
  };

  return (
    <div>
      <h2 style={{ fontWeight: 900, color: C.navy, fontSize: 18, marginBottom: 16 }}>Mon historique</h2>
      <HistoriqueCalendrier
        items={items}
        emptyLabel="Aucun historique disponible"
        renderItem={l => (
          <div style={{
            background: "#fff", borderRadius: 14, padding: "12px 14px",
            marginBottom: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
            borderLeft: `3px solid ${l.status === "absent" ? C.red : l.is_replacement ? "#3B82F6" : C.green}`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between",
              alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {l.is_replacement && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#3B82F6",
                    background: "#DBEAFE", borderRadius: 99, padding: "2px 7px" }}>Remplacement</span>
                )}
                {l.status === "absent" && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.red,
                    background: C.redL, borderRadius: 99, padding: "2px 7px" }}>Absent</span>
                )}
                {l.status !== "absent" && !l.is_replacement && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#15803D",
                    background: C.greenL, borderRadius: 99, padding: "2px 7px" }}>Service effectué</span>
                )}
              </div>
              <div style={{ textAlign: "right", fontSize: 13, color: C.gray600 }}>
                {l.heure_debut && (
                  <div>{fmtHHMM(l.heure_debut)} → {fmtHHMM(l.heure_fin)}</div>
                )}
                {l.heure_debut && l.heure_fin && (
                  <div style={{ fontWeight: 700, color: C.navy }}>{calcDuration(l.heure_debut, l.heure_fin)}</div>
                )}
              </div>
            </div>
            {l.replacement_name && (
              <div style={{ fontSize: 12, color: C.gray600, marginTop: 4 }}>
                Remplace : {l.replacement_name}
              </div>
            )}
          </div>
        )}
        renderDayExtra={(day) => {
          const dayIncs = incidents.filter(i => i.reported_at.slice(0, 10) === day);
          if (!dayIncs.length) return null;
          return (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: C.navy,
                textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
                Signalements ({dayIncs.length})
              </div>
              {dayIncs.map(inc => {
                const stype = SIGN_TYPES.find(s => s.v === inc.type);
                const st = STATUS_MAP[inc.status] || STATUS_MAP.en_attente;
                return (
                  <div key={inc.id} style={{ background: "#fff", borderRadius: 12,
                    padding: "12px 14px", marginBottom: 8,
                    borderLeft: `3px solid ${st.c}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: "#1E293B" }}>
                          {stype?.l || inc.type}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: st.c,
                          background: st.bg, borderRadius: 99, padding: "2px 7px" }}>
                          {st.l}
                        </span>
                      </div>
                    </div>
                    <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.4,
                      marginBottom: inc.response ? 8 : 0 }}>
                      {inc.description}
                    </p>
                    {inc.response && (
                      <div style={{ background: C.greenL, borderRadius: 8, padding: "8px 10px",
                        fontSize: 12, color: "#15803D", fontWeight: 600 }}>
                        {inc.response}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        }}
      />
    </div>
  );
}
