"use client";
import { C, fmtHHMM } from "@/lib/constants";
import type { Conducteur, ServiceLog } from "@/lib/types";
import { StatusBadge, BigBtn, DL, calcDuration } from "./shared";

type CircType = { nom?: string; emoji?: string };
type VehType  = { plaque?: string };

export interface ServiceProps {
  driver: Conducteur;
  todayLog: ServiceLog | null;
  circ?: CircType;
  veh?: VehType;
  onShowConfirm: () => void;
  onShowReplace: () => void;
  onShowAbsence: () => void;
  onShowFin: () => void;
  onShowReprise: () => void;
}

export function TabService({driver,todayLog,circ,veh,onShowConfirm,onShowReplace,onShowAbsence,onShowFin,onShowReprise}:ServiceProps){
  return(
    <div>
      {/* Statut actuel */}
      <div style={{background:"#fff",borderRadius:18,padding:20,marginBottom:20,
        boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{fontWeight:800,color:C.navy,fontSize:16}}>Statut actuel</span>
          <StatusBadge status={driver.status}/>
        </div>
        {todayLog&&(<>
          <DL label="Prise de service" value={fmtHHMM(todayLog.heure_debut)}/>
          {todayLog.heure_fin&&<DL label="Fin de service" value={fmtHHMM(todayLog.heure_fin)}/>}
          {todayLog.heure_debut&&todayLog.heure_fin&&(
            <DL label="Durée totale" value={calcDuration(todayLog.heure_debut,todayLog.heure_fin)}/>
          )}
          {todayLog.is_replacement&&todayLog.replacement_name&&(
            <DL label="Remplacement de" value={todayLog.replacement_name}/>
          )}
          {todayLog.circuit_id&&todayLog.circuit_id!==driver.circuit_id&&(
            <DL label="Circuit effectué" value={todayLog.circuit_id}/>
          )}
        </>)}
        {!todayLog&&driver.status!=="absent"&&(
          <p style={{color:C.gray,fontSize:14}}>Aucun pointage enregistré aujourd'hui.</p>
        )}
      </div>

      {/* Disponible → 3 situations */}
      {driver.status==="disponible"&&!todayLog&&(<>
        <div style={{background:C.greenL,borderRadius:16,padding:16,marginBottom:12}}>
          <p style={{fontSize:14,fontWeight:700,color:C.greenD,marginBottom:12}}>
            Situation A — Prise de service normale
          </p>
          {circ&&<p style={{fontSize:14,color:"#1E293B",marginBottom:8}}>
            Vous allez prendre le circuit <strong>{circ.emoji} {circ.nom}</strong>
            {veh&&<> avec le véhicule <strong>{veh.plaque}</strong></>}.
          </p>}
          <BigBtn label="Je prends mon service" onClick={onShowConfirm}/>
        </div>
        <div style={{background:C.blueL,borderRadius:16,padding:16,marginBottom:12}}>
          <p style={{fontSize:14,fontWeight:700,color:C.blue,marginBottom:12}}>
            Situation B — Je suis remplaçant
          </p>
          <BigBtn label="Je remplace un collègue" onClick={onShowReplace} color={C.blue}/>
        </div>
        <div style={{background:C.redL,borderRadius:16,padding:16}}>
          <p style={{fontSize:14,fontWeight:700,color:C.red,marginBottom:12}}>
            Situation D — Signaler une absence
          </p>
          <BigBtn label="Je suis absent aujourd'hui" onClick={onShowAbsence} color={C.red}/>
        </div>
      </>)}

      {/* En service → terminer */}
      {driver.status==="en_service"&&(
        <div style={{background:"#EFF6FF",borderRadius:16,padding:16}}>
          <p style={{fontSize:14,fontWeight:700,color:C.navy,marginBottom:12}}>
            Situation C — Fin de service
          </p>
          <BigBtn label="Je termine mon service" onClick={onShowFin} color={C.navy}/>
        </div>
      )}

      {/* Absent → reprendre */}
      {driver.status==="absent"&&(<>
        <div style={{background:C.redL,borderRadius:16,padding:16,marginBottom:12,border:`1px solid #FCA5A5`}}>
          <p style={{fontWeight:700,color:C.red,marginBottom:4}}>Absence en cours</p>
          {driver.absence_motif&&<p style={{fontSize:14,color:"#1E293B"}}>Motif : {driver.absence_motif}</p>}
        </div>
        <div style={{background:C.greenL,borderRadius:16,padding:16}}>
          <p style={{fontSize:14,fontWeight:700,color:C.greenD,marginBottom:12}}>
            Situation E — Retour de maladie
          </p>
          <BigBtn label="Je reprends le service" onClick={onShowReprise}/>
        </div>
      </>)}
    </div>
  );
}
