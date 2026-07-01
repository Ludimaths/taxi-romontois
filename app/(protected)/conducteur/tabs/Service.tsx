"use client";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import { C, fmtHHMM } from "@/lib/constants";
import type { Conducteur, ServiceLog, Eleve, PriseEnCharge } from "@/lib/types";
import { StatusBadge, BigBtn, DL, calcDuration } from "./shared";

type CircType = { nom?: string; emoji?: string };
type VehType  = { plaque?: string };

export interface ServiceProps {
  driver: Conducteur;
  todayLog: ServiceLog | null;
  circ?: CircType;
  veh?: VehType;
  eleves: Eleve[];
  prises: PriseEnCharge[];
  onShowConfirm: () => void;
  onShowReplace: () => void;
  onShowAbsence: () => void;
  onShowFin: () => void;
  onShowReprise: () => void;
  onMarquerEleve: (eleveId: number, statut: "present" | "absent") => Promise<void>;
}

export function TabService({
  driver, todayLog, circ, veh,
  eleves, prises,
  onShowConfirm, onShowReplace, onShowAbsence, onShowFin, onShowReprise,
  onMarquerEleve,
}: ServiceProps) {

  const prisByEleve = new Map(prises.map(p => [p.eleve_id, p]));
  const presents = prises.filter(p => p.statut === "present").length;
  const absents  = prises.filter(p => p.statut === "absent").length;

  return (
    <div>
      {/* Statut actuel */}
      <div style={{ background: "#fff", borderRadius: 18, padding: 20, marginBottom: 20,
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontWeight: 800, color: C.navy, fontSize: 16 }}>Statut actuel</span>
          <StatusBadge status={driver.status} />
        </div>
        {todayLog && (<>
          <DL label="Prise de service" value={fmtHHMM(todayLog.heure_debut)} />
          {todayLog.heure_fin && <DL label="Fin de service" value={fmtHHMM(todayLog.heure_fin)} />}
          {todayLog.heure_debut && todayLog.heure_fin && (
            <DL label="Durée totale" value={calcDuration(todayLog.heure_debut, todayLog.heure_fin)} />
          )}
          {todayLog.is_replacement && todayLog.replacement_name && (
            <DL label="Remplacement de" value={todayLog.replacement_name} />
          )}
          {todayLog.circuit_id && todayLog.circuit_id !== driver.circuit_id && (
            <DL label="Circuit effectué" value={todayLog.circuit_id} />
          )}
        </>)}
        {!todayLog && driver.status !== "absent" && (
          <p style={{ color: C.gray600, fontSize: 14 }}>Aucun pointage enregistré aujourd'hui.</p>
        )}
      </div>

      {/* Disponible → 3 situations */}
      {driver.status === "disponible" && !todayLog && (<>
        <div style={{ background: C.greenL, borderRadius: 16, padding: 16, marginBottom: 12 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#15803D", marginBottom: 12 }}>
            Situation A — Prise de service normale
          </p>
          {circ && <p style={{ fontSize: 14, color: "#1E293B", marginBottom: 8 }}>
            Vous allez prendre le circuit <strong>{circ.emoji} {circ.nom}</strong>
            {veh && <> avec le véhicule <strong>{veh.plaque}</strong></>}.
          </p>}
          <BigBtn label="Je prends mon service" onClick={onShowConfirm} />
        </div>
        <div style={{ background: C.skyL, borderRadius: 16, padding: 16, marginBottom: 12 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: C.navyL, marginBottom: 12 }}>
            Situation B — Je suis remplaçant
          </p>
          <BigBtn label="Je remplace un collègue" onClick={onShowReplace} color={C.navyL} />
        </div>
        <div style={{ background: C.redL, borderRadius: 16, padding: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: C.red, marginBottom: 12 }}>
            Situation D — Signaler une absence
          </p>
          <BigBtn label="Je suis absent aujourd'hui" onClick={onShowAbsence} color={C.red} />
        </div>
      </>)}

      {/* En service → terminer + validation élèves */}
      {driver.status === "en_service" && (<>
        <div style={{ background: "#EFF6FF", borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: C.navy, marginBottom: 12 }}>
            Situation C — Fin de service
          </p>
          <BigBtn label="Je termine mon service" onClick={onShowFin} color={C.navy} />
        </div>

        {/* Validation prises en charge élèves */}
        {eleves.length > 0 && (
          <div style={{ background: C.white, borderRadius: 18, padding: 20,
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontWeight: 800, fontSize: 16, color: C.navy }}>Élèves du circuit</span>
              <span style={{ fontSize: 12, color: C.gray400 }}>
                {presents}/{eleves.length}
              </span>
            </div>
            <div style={{ fontSize: 12, color: C.gray600, marginBottom: 14 }}>
              Validez la présence de chaque élève
            </div>

            {/* Barre de progression */}
            <div style={{ background: C.gray200, borderRadius: 99, height: 6, marginBottom: 16 }}>
              <div style={{ background: C.green, borderRadius: 99, height: 6,
                width: `${eleves.length > 0 ? ((presents + absents) / eleves.length * 100) : 0}%`,
                transition: "width .3s" }} />
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              <span style={{ background: C.greenL, color: C.green, borderRadius: 20,
                padding: "3px 10px", fontWeight: 700, fontSize: 12 }}>
                {presents} présent{presents > 1 ? "s" : ""}
              </span>
              {absents > 0 && (
                <span style={{ background: C.redL, color: C.red, borderRadius: 20,
                  padding: "3px 10px", fontWeight: 700, fontSize: 12 }}>
                  {absents} absent{absents > 1 ? "s" : ""}
                </span>
              )}
              {eleves.length - presents - absents > 0 && (
                <span style={{ background: C.amberL, color: C.amber, borderRadius: 20,
                  padding: "3px 10px", fontWeight: 700, fontSize: 12 }}>
                  {eleves.length - presents - absents} en attente
                </span>
              )}
            </div>

            {eleves.map(el => {
              const prise = prisByEleve.get(el.id);
              return (
                <div key={el.id} style={{ padding: "12px 0", borderBottom: `1px solid ${C.gray100}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: C.gray800 }}>
                        {el.nom_famille} {el.prenom_initiale}.
                      </div>
                      {prise?.heure_prise && (
                        <div style={{ fontSize: 11, color: C.gray400, display: "flex", alignItems: "center", gap: 3 }}>
                          <Clock size={11} /> {prise.heure_prise.slice(0, 5)}
                        </div>
                      )}
                    </div>
                    {prise ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6,
                        color: prise.statut === "present" ? C.green : C.red, fontWeight: 700 }}>
                        {prise.statut === "present"
                          ? <><CheckCircle2 size={18} /> Présent</>
                          : <><XCircle size={18} /> Absent</>
                        }
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => onMarquerEleve(el.id, "present")}
                          style={{ padding: "7px 14px", borderRadius: 10, border: "none",
                            background: C.green, color: C.white, fontWeight: 700,
                            fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                          <CheckCircle2 size={14} /> Présent
                        </button>
                        <button onClick={() => onMarquerEleve(el.id, "absent")}
                          style={{ padding: "7px 14px", borderRadius: 10, border: `1px solid ${C.red}`,
                            background: C.white, color: C.red, fontWeight: 700,
                            fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                          <XCircle size={14} /> Absent
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>)}

      {/* Absent → reprendre */}
      {driver.status === "absent" && (<>
        <div style={{ background: C.redL, borderRadius: 16, padding: 16, marginBottom: 12,
          border: `1px solid #FCA5A5` }}>
          <p style={{ fontWeight: 700, color: C.red, marginBottom: 4 }}>Absence en cours</p>
          {driver.absence_motif && <p style={{ fontSize: 14, color: "#1E293B" }}>Motif : {driver.absence_motif}</p>}
        </div>
        <div style={{ background: C.greenL, borderRadius: 16, padding: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#15803D", marginBottom: 12 }}>
            Situation E — Retour de maladie
          </p>
          <BigBtn label="Je reprends le service" onClick={onShowReprise} />
        </div>
      </>)}
    </div>
  );
}
