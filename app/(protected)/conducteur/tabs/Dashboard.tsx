"use client";
import { CheckCircle2, XCircle, Circle, MapPin, Bus, Baby, RefreshCw } from "lucide-react";
import { C, fmtHHMM, fmtDateTime, isoToday } from "@/lib/constants";
import type { Conducteur, ServiceLog, AbsenceEnfant, Enfant, Alerte } from "@/lib/types";
import { StatusBadge, BigBtn, calcDuration } from "./shared";

type CircType = { nom?: string; emoji?: string; enfants_count?: number; id?: string; cercle?: { nom?: string } };
type VehType  = { plaque?: string; marque?: string; modele?: string };

export interface DashboardProps {
  driver: Conducteur;
  todayLog: ServiceLog | null;
  todayAbsences: AbsenceEnfant[];
  enfants: Enfant[];
  messages: Alerte[];
  unreadMsg: number;
  absConfirmed: Set<number>;
  circ?: CircType;
  veh?: VehType;
  onSetTab: (t: string) => void;
  onConfirmerAbsence: (id: number) => void;
  onMarquerLu: (a: Alerte) => void;
  onShowConfirm: () => void;
  onShowReplace: () => void;
  onShowAbsence: () => void;
  onShowFin: () => void;
  onShowReprise: () => void;
}

export function TabDashboard({
  driver,todayLog,todayAbsences,enfants,messages,unreadMsg,absConfirmed,
  circ,veh,onSetTab,onConfirmerAbsence,onMarquerLu,
  onShowConfirm,onShowReplace,onShowAbsence,onShowFin,onShowReprise,
}:DashboardProps){
  return(
    <div>
      {/* Stats rapides */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        {[
          {label:"Statut",val:driver.status==="en_service"?"En service":driver.status==="absent"?"Absent":"Disponible",
           icon:driver.status==="en_service"?<CheckCircle2 size={20} color={C.green}/>:driver.status==="absent"?<XCircle size={20} color={C.red}/>:<Circle size={20} color={C.blue}/>,
           c:driver.status==="en_service"?C.green:driver.status==="absent"?C.red:C.blue,
           bg:driver.status==="en_service"?C.greenL:driver.status==="absent"?C.redL:C.blueL},
          {label:"Circuit aujourd'hui",val:circ?`${circ.emoji} ${circ.nom}`:"Non assigné",icon:<MapPin size={20} color={C.navy}/>,c:C.navy,bg:"#EFF6FF"},
          {label:"Véhicule",val:veh?.plaque||"Non assigné",icon:<Bus size={20} color={C.green}/>,c:C.green,bg:C.greenL},
          {label:"Enfants du circuit",val:circ?.enfants_count!=null?`${circ.enfants_count} enfants`:"—",icon:<Baby size={20} color={C.purple}/>,c:C.purple,bg:"#EDE9FE"},
        ].map(c=>(
          <div key={c.label} style={{background:c.bg,borderRadius:16,padding:"14px 16px",border:`1px solid ${c.c}22`}}>
            <div style={{display:"flex",alignItems:"center",marginBottom:4}}>{c.icon}</div>
            <div style={{fontSize:15,fontWeight:900,color:c.c,lineHeight:1.3}}>{c.val}</div>
            <div style={{fontSize:11,color:C.gray,marginTop:2}}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Heure de service */}
      {todayLog&&(
        <div style={{background:"#fff",borderRadius:16,padding:16,marginBottom:16,
          boxShadow:"0 2px 8px rgba(0,0,0,0.06)",borderLeft:`4px solid ${C.green}`}}>
          <div style={{fontWeight:800,color:C.navy,marginBottom:8}}>Service aujourd'hui</div>
          <div style={{display:"flex",gap:16,fontSize:14}}>
            <span>Début : <strong>{fmtHHMM(todayLog.heure_debut)}</strong></span>
            {todayLog.heure_fin&&<span>Fin : <strong>{fmtHHMM(todayLog.heure_fin)}</strong></span>}
            {todayLog.heure_debut&&todayLog.heure_fin&&(
              <span style={{color:C.green}}>Durée : <strong>{calcDuration(todayLog.heure_debut,todayLog.heure_fin)}</strong></span>
            )}
            {todayLog.is_replacement&&<span style={{color:C.amber}}>Remplacement</span>}
          </div>
        </div>
      )}

      {/* Absences enfants du jour */}
      {todayAbsences.length>0&&(
        <div style={{background:C.amberL,borderRadius:16,padding:16,marginBottom:16,border:`1px solid #FDE68A`}}>
          <div style={{fontWeight:800,color:C.amber,marginBottom:10,fontSize:14}}>
            Modifications du jour — {todayAbsences.length} absence(s) enfants
          </div>
          {todayAbsences.slice(0,5).map(a=>{
            const enf=enfants.find(e=>e.id===a.enfant_id);
            const confirmed=absConfirmed.has(a.id)||a.read_by_driver;
            return(
              <div key={a.id} style={{background:"#fff",borderRadius:10,padding:"10px 12px",
                marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:13,color:"#1E293B"}}>
                    {enf?.prenom} {enf?.nom} — {a.reason}
                  </div>
                  <div style={{fontSize:11,color:C.gray,marginTop:2}}>
                    Signalé à {new Date(a.reported_at).toLocaleTimeString("fr-CH",{hour:"2-digit",minute:"2-digit"})}
                  </div>
                </div>
                {!confirmed?(
                  <button onClick={()=>onConfirmerAbsence(a.id)}
                    style={{fontSize:11,padding:"5px 10px",borderRadius:8,border:`1px solid ${C.green}`,
                      background:C.greenL,color:C.greenD,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                    Lu
                  </button>
                ):(
                  <span style={{fontSize:11,color:C.green,fontWeight:700}}>Lu</span>
                )}
              </div>
            );
          })}
          {todayAbsences.length>5&&<p style={{fontSize:13,color:C.gray,marginTop:4}}>+{todayAbsences.length-5} autre(s)…</p>}
        </div>
      )}

      {/* Alerte remplacement en attente */}
      {messages.filter(m=>m.type==="remplacement"&&!m.read).slice(0,1).map(m=>(
        <div key={m.id} style={{background:C.amberL,borderRadius:16,padding:16,marginBottom:16,
          border:`2px solid ${C.amber}`,boxShadow:"0 2px 12px rgba(217,119,6,0.2)"}}>
          <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
            <span style={{display:"flex",alignItems:"center"}}><RefreshCw size={28} color={C.amber} /></span>
            <div>
              <div style={{fontWeight:900,fontSize:15,color:C.amber}}>Mission de remplacement</div>
              <div style={{fontSize:11,color:C.gray,marginTop:1}}>{fmtDateTime(m.created_at)}</div>
            </div>
          </div>
          <p style={{fontSize:14,color:"#1E293B",lineHeight:1.6,fontWeight:600,marginBottom:12}}>{m.message}</p>
          <button onClick={()=>onMarquerLu(m)}
            style={{width:"100%",padding:"13px",borderRadius:12,background:C.green,
              color:"#fff",border:"none",fontWeight:900,fontSize:15,cursor:"pointer",
              boxShadow:"0 2px 8px rgba(22,163,74,0.3)"}}>
            J'ai pris connaissance
          </button>
        </div>
      ))}

      {/* Dernier message gestionnaire */}
      {messages.filter(m=>m.type!=="remplacement").length>0&&(
        <div style={{background:"#fff",borderRadius:16,padding:16,marginBottom:16,
          boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
          <div style={{fontWeight:800,color:C.navy,marginBottom:8,fontSize:14}}>Dernier message gestionnaire</div>
          {(()=>{
            const m=messages.filter(x=>x.type!=="remplacement")[0];
            return(<>
              <p style={{fontSize:14,color:"#1E293B",lineHeight:1.5}}>{m.message}</p>
              <div style={{fontSize:12,color:C.gray,marginTop:6}}>{fmtDateTime(m.created_at)}</div>
            </>);
          })()}
          {unreadMsg>0&&(
            <button onClick={()=>onSetTab("messages")}
              style={{marginTop:8,fontSize:13,color:C.green,background:"none",border:"none",
                cursor:"pointer",fontWeight:700}}>
              Voir tous les messages ({unreadMsg} non lus) →
            </button>
          )}
        </div>
      )}

      {/* Boutons rapides */}
      <div style={{marginTop:8}}>
        {driver.status==="disponible"&&(<>
          <BigBtn label="Je prends mon service"      onClick={onShowConfirm}/>
          <BigBtn label="Je remplace un collègue"    onClick={onShowReplace} color={C.blue}/>
          <BigBtn label="Je suis absent aujourd'hui" onClick={onShowAbsence} color={C.red}/>
        </>)}
        {driver.status==="en_service"&&(
          <BigBtn label="Je termine mon service" onClick={onShowFin} color={C.navy}/>
        )}
        {driver.status==="absent"&&(
          <BigBtn label="Je reprends le service" onClick={onShowReprise}/>
        )}
      </div>
    </div>
  );
}
