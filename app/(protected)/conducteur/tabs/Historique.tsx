"use client";
import { C, fmtHHMM } from "@/lib/constants";
import type { ServiceLog, Incident, PriseEnCharge } from "@/lib/types";
import { calcDuration, SIGN_TYPES } from "./shared";
import HistoriqueCalendrier from "@/components/HistoriqueCalendrier";

type LogItem = ServiceLog & { date: string };
type HebdoRow = { circuit_id: string; jour: number; sens: "matin" | "aprem"; eleve_id: number | null; eleve_nom: string };

export interface HistoriqueProps {
  histLogs: ServiceLog[];
  incidents: Incident[];
  prisesHist?: PriseEnCharge[];
  week?: HebdoRow[];
}

export function TabHistorique({ histLogs, incidents, prisesHist = [], week = [] }: HistoriqueProps) {
  const items: LogItem[] = histLogs.map(l => ({ ...l, date: l.date_service }));

  // Résumé matin / après-midi pour une journée de service donnée.
  const dayStats = (l: ServiceLog) => {
    const jour = new Date(`${l.date_service}T00:00:00`).getDay();   // 1..5
    const prevu = (sens: "matin" | "aprem") =>
      new Set(week.filter(h => h.circuit_id === l.circuit_id && h.jour === jour && h.sens === sens)
        .map(h => (h.eleve_id ?? h.eleve_nom) as string | number)).size;
    const pr = prisesHist.filter(p => p.date === l.date_service);
    const cnt = (sens: "aller" | "retour", st: "present" | "absent") =>
      pr.filter(p => p.sens === sens && p.statut === st).length;
    return {
      matinPrevu: prevu("matin"), matinPris: cnt("aller", "present"), matinAbs: cnt("aller", "absent"),
      apremPrevu: prevu("aprem"), apremDep: cnt("retour", "present"),
    };
  };
  const statBox = (titre: string, couleur: string, lignes: [string, string | number][]) => (
    <div style={{ flex: 1, background: "#F8FAFC", border: `1px solid ${C.gray200}`, borderRadius: 10, padding: "8px 10px" }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: couleur, letterSpacing: ".3px", marginBottom: 4 }}>{titre}</div>
      {lignes.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#1E293B" }}>
          <span style={{ color: C.gray600 }}>{k}</span><b>{v}</b>
        </div>
      ))}
    </div>
  );

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
            {l.status !== "absent" && (() => {
              const s = dayStats(l);
              const matin: [string, string | number][] = [["Prévus", s.matinPrevu], ["Pris en charge", s.matinPris]];
              if (s.matinAbs) matin.push(["Absents", s.matinAbs]);
              return (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  {statBox("☀️ Matin", "#F59E0B", matin)}
                  {statBox("🌙 Après-midi", "#6366F1", [["Prévus", s.apremPrevu], ["Déposés", s.apremDep]])}
                </div>
              );
            })()}
            {l.notes && (
              <div style={{ marginTop: 8, fontSize: 12.5, color: "#475569", background: C.amberL, borderRadius: 8, padding: "7px 10px" }}>
                📝 {l.notes}
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
