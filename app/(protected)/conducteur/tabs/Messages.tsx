"use client";
import { C, fmtDateTime, isoToday } from "@/lib/constants";
import type { Alerte, Incident, AbsenceEnfant, Enfant } from "@/lib/types";
import { SIGN_TYPES } from "./shared";

export interface MessagesProps {
  messages: Alerte[];
  incidents: Incident[];
  absences: AbsenceEnfant[];
  enfants: Enfant[];
  incWithResponse: Incident[];
  unreadMsg: number;
  onMarquerLu: (a: Alerte) => void;
  onSetTab: (t: string) => void;
}

export function TabMessages({
  messages,incidents,absences,enfants,incWithResponse,unreadMsg,
  onMarquerLu,onSetTab,
}:MessagesProps){
  return(
    <div>
      <p style={{fontSize:13,color:C.gray,marginBottom:16}}>
        Messages du gestionnaire, réponses à vos signalements et absences de votre circuit.
      </p>

      {/* Section 1 : Messages gestionnaire */}
      <div style={{marginBottom:24}}>
        <div style={{fontWeight:800,fontSize:13,color:C.navy,textTransform:"uppercase",
          letterSpacing:0.5,marginBottom:12}}>
          📨 Messages du gestionnaire
          {unreadMsg>0&&<span style={{marginLeft:8,background:C.red,color:"#fff",
            borderRadius:99,padding:"2px 7px",fontSize:11}}>{unreadMsg} non lu(s)</span>}
        </div>
        {messages.length===0?(
          <div style={{background:C.gray100,borderRadius:14,padding:"18px 16px",
            textAlign:"center",color:C.gray,fontSize:14}}>
            Aucun message du gestionnaire
          </div>
        ):messages.map(m=>{
          const isNew=!m.read;

          if(m.type==="remplacement"){
            return(
              <div key={m.id} style={{background:isNew?C.amberL:C.gray100,borderRadius:16,
                padding:16,marginBottom:10,border:`2px solid ${isNew?C.amber:C.gray200}`,
                boxShadow:isNew?"0 2px 12px rgba(217,119,6,0.15)":"none",opacity:isNew?1:0.75}}>
                <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:22}}>🔄</span>
                  <div>
                    <div style={{fontWeight:800,fontSize:14,color:isNew?C.amber:C.gray}}>
                      Mission de remplacement
                    </div>
                    <div style={{fontSize:11,color:C.gray}}>{fmtDateTime(m.created_at)}</div>
                  </div>
                </div>
                <p style={{fontSize:14,color:"#1E293B",lineHeight:1.5,
                  fontWeight:isNew?600:400,marginBottom:isNew?12:0}}>
                  {m.message}
                </p>
                {isNew?(
                  <button onClick={()=>onMarquerLu(m)} style={{
                    width:"100%",padding:"12px",borderRadius:10,
                    background:C.green,color:"#fff",border:"none",
                    fontWeight:800,fontSize:14,cursor:"pointer",
                    boxShadow:"0 2px 8px rgba(22,163,74,0.25)"}}>
                    ✅ J'ai pris connaissance
                  </button>
                ):(
                  <div style={{fontSize:12,color:C.green,fontWeight:700}}>✅ Prise en charge confirmée</div>
                )}
              </div>
            );
          }

          if(m.type==="imprévu"){
            return(
              <div key={m.id} style={{background:isNew?"#EFF6FF":C.gray100,borderRadius:16,
                padding:16,marginBottom:10,border:`2px solid ${isNew?"#3B82F6":C.gray200}`,
                boxShadow:isNew?"0 2px 12px rgba(59,130,246,0.15)":"none",opacity:isNew?1:0.75}}>
                <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:22}}>⚡</span>
                  <div>
                    <div style={{fontWeight:800,fontSize:14,color:isNew?"#2563EB":C.gray}}>
                      Message du gestionnaire
                    </div>
                    <div style={{fontSize:11,color:C.gray}}>{fmtDateTime(m.created_at)}</div>
                  </div>
                </div>
                <p style={{fontSize:14,color:"#1E293B",lineHeight:1.5,
                  fontWeight:isNew?600:400,marginBottom:isNew?12:0}}>
                  {m.message}
                </p>
                {isNew?(
                  <button onClick={()=>onMarquerLu(m)} style={{
                    width:"100%",padding:"12px",borderRadius:10,
                    background:"#2563EB",color:"#fff",border:"none",
                    fontWeight:800,fontSize:14,cursor:"pointer",
                    boxShadow:"0 2px 8px rgba(37,99,235,0.25)"}}>
                    ✅ Confirmer lecture
                  </button>
                ):(
                  <div style={{fontSize:12,color:"#2563EB",fontWeight:700}}>✅ Lu et confirmé</div>
                )}
              </div>
            );
          }

          const sev=m.severity;
          const col=sev==="critique"?C.red:sev==="haute"?C.amber:C.navy;
          const bg=sev==="critique"?C.redL:sev==="haute"?C.amberL:"#EFF6FF";
          return(
            <div key={m.id} style={{background:isNew?"#fff":C.gray100,borderRadius:16,
              padding:16,marginBottom:10,
              boxShadow:isNew?"0 2px 8px rgba(0,0,0,0.06)":"none",
              borderLeft:`4px solid ${isNew?col:C.gray200}`,opacity:isNew?1:0.75}}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"flex-start",marginBottom:8,gap:8,flexWrap:"wrap"}}>
                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                  {isNew&&<span style={{width:8,height:8,borderRadius:"50%",
                    background:col,display:"inline-block",flexShrink:0}}/>}
                  <span style={{fontSize:11,fontWeight:700,color:isNew?col:C.gray,
                    background:isNew?bg:"transparent",borderRadius:99,
                    padding:isNew?"2px 8px":"0"}}>
                    {sev==="critique"?"🔴 Critique":sev==="haute"?"🟠 Important":"🔵 Info"}
                  </span>
                </div>
                <span style={{fontSize:12,color:C.gray}}>{fmtDateTime(m.created_at)}</span>
              </div>
              <p style={{fontSize:14,color:"#1E293B",lineHeight:1.5,
                fontWeight:isNew?600:400,marginBottom:isNew?10:0}}>
                {m.message}
              </p>
              {isNew&&(
                <button onClick={()=>onMarquerLu(m)} style={{
                  fontSize:12,padding:"6px 12px",borderRadius:8,
                  border:`1px solid ${C.green}`,background:C.greenL,
                  color:C.greenD,fontWeight:700,cursor:"pointer"}}>
                  Lu ✓
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Section 2 : Réponses aux signalements */}
      {incWithResponse.length>0&&(
        <div style={{marginBottom:24}}>
          <div style={{fontWeight:800,fontSize:13,color:C.navy,textTransform:"uppercase",
            letterSpacing:0.5,marginBottom:12}}>
            💬 Réponses à mes signalements
          </div>
          {incWithResponse.map(inc=>{
            const stype=SIGN_TYPES.find(s=>s.v===inc.type);
            return(
              <div key={inc.id} style={{background:"#fff",borderRadius:16,padding:16,
                marginBottom:10,boxShadow:"0 2px 8px rgba(0,0,0,0.06)",borderLeft:`4px solid ${C.green}`}}>
                <div style={{display:"flex",justifyContent:"space-between",
                  alignItems:"flex-start",marginBottom:8,gap:8,flexWrap:"wrap"}}>
                  <span style={{fontWeight:700,fontSize:14,color:C.navy}}>
                    {stype?.e||"⚡"} {stype?.l||inc.type}
                  </span>
                  <span style={{fontSize:12,color:C.gray}}>
                    {new Date(inc.reported_at).toLocaleDateString("fr-CH")}
                  </span>
                </div>
                <p style={{fontSize:13,color:"#475569",marginBottom:10,lineHeight:1.4}}>
                  Votre signalement : {inc.description}
                </p>
                <div style={{background:C.greenL,borderRadius:10,padding:"10px 12px",
                  fontSize:14,color:C.greenD,fontWeight:600,lineHeight:1.5}}>
                  💬 Réponse : {inc.response}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Section 3 : Absences circuit */}
      {absences.length>0&&(
        <div>
          <div style={{fontWeight:800,fontSize:13,color:C.navy,textTransform:"uppercase",
            letterSpacing:0.5,marginBottom:12}}>
            👶 Absences de mon circuit — 30 derniers jours
          </div>
          {absences.map(a=>{
            const enf=(a.enfant as{prenom?:string;nom?:string}|undefined);
            const isToday=a.date_absence===isoToday();
            return(
              <div key={a.id} style={{background:isToday?"#fff":C.gray100,borderRadius:14,
                padding:"12px 14px",marginBottom:8,
                boxShadow:isToday?"0 1px 4px rgba(0,0,0,0.06)":"none",
                borderLeft:`3px solid ${isToday?C.amber:C.gray200}`,opacity:isToday?1:0.8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14,color:"#1E293B"}}>
                      {enf?.prenom} {enf?.nom}
                      {isToday&&<span style={{marginLeft:8,fontSize:11,fontWeight:700,
                        color:C.amber,background:C.amberL,borderRadius:99,padding:"2px 7px"}}>
                        Aujourd'hui
                      </span>}
                    </div>
                    <div style={{fontSize:13,color:C.gray,marginTop:2}}>{a.reason}</div>
                  </div>
                  <span style={{fontSize:12,color:C.gray,whiteSpace:"nowrap"}}>
                    {new Date(a.date_absence).toLocaleDateString("fr-CH",{day:"2-digit",month:"2-digit"})}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {messages.length===0&&incWithResponse.length===0&&absences.length===0&&(
        <div style={{textAlign:"center",padding:"60px 20px",color:C.gray}}>
          <div style={{fontSize:48}}>📭</div>
          <p style={{fontWeight:700,marginTop:12}}>Aucun message</p>
        </div>
      )}
    </div>
  );
}
