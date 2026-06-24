"use client";
import { Inbox, BarChart2 } from "lucide-react";
import { C, fmtHHMM } from "@/lib/constants";
import type { ServiceLog, Incident } from "@/lib/types";
import { schoolYearStart, SCHOOL_MONTHS, MON, calcDuration, SIGN_TYPES } from "./shared";

export interface HistoriqueProps {
  histLogs: ServiceLog[];
  incidents: Incident[];
  allYears: number[];
  histYear: number | null;
  setHistYear: (y: number | null) => void;
  histMonth: number | null;
  setHistMonth: (m: number | null) => void;
  logsForYear: (y: number) => ServiceLog[];
  logsForYearMonth: (y: number, m: number) => ServiceLog[];
}

export function TabHistorique({
  histLogs,incidents,allYears,histYear,setHistYear,histMonth,setHistMonth,
  logsForYear,logsForYearMonth,
}:HistoriqueProps){
  const currentSY=schoolYearStart(new Date());

  // Niveau 3 — détail d'un mois
  if(histYear!==null&&histMonth!==null){
    const logs=logsForYearMonth(histYear,histMonth);
    const worked=logs.filter(l=>l.status!=="absent").length;
    const absent=logs.filter(l=>l.status==="absent").length;
    const repl=logs.filter(l=>l.is_replacement).length;
    const totalMin=logs.reduce((s,l)=>{
      if(!l.heure_debut||!l.heure_fin)return s;
      const a=new Date(`1970-01-01T${l.heure_debut}`);
      const b=new Date(`1970-01-01T${l.heure_fin}`);
      return s+Math.max(0,Math.round((b.getTime()-a.getTime())/60000));
    },0);
    const totalH=`${Math.floor(totalMin/60)}h${String(totalMin%60).padStart(2,"0")}`;
    return(
      <div>
        <button onClick={()=>setHistMonth(null)}
          style={{display:"flex",alignItems:"center",gap:6,marginBottom:16,
            background:"none",border:"none",cursor:"pointer",color:C.green,fontWeight:700,fontSize:14,padding:0}}>
          ← {MON[histMonth]} {histYear}-{histYear+1}
        </button>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          {[
            {label:"Jours travaillés",val:worked,c:C.green},
            {label:"Jours remplaçant",val:repl,  c:C.blue},
            {label:"Jours absents",   val:absent, c:C.red},
            {label:"Total heures",    val:totalH, c:C.navy},
          ].map(s=>(
            <div key={s.label} style={{background:"#fff",borderRadius:14,padding:"12px 14px",
              boxShadow:"0 1px 4px rgba(0,0,0,0.06)",borderLeft:`3px solid ${s.c}`}}>
              <div style={{fontSize:20,fontWeight:900,color:s.c}}>{s.val}</div>
              <div style={{fontSize:11,color:C.gray,marginTop:2}}>{s.label}</div>
            </div>
          ))}
        </div>
        <button onClick={()=>window.print()}
          style={{padding:"10px 16px",borderRadius:10,border:`1px solid ${C.green}`,
            background:C.greenL,color:C.greenD,fontWeight:700,fontSize:13,cursor:"pointer",marginBottom:16}}>
          Télécharger ce mois PDF
        </button>
        {logs.length===0?(
          <div style={{textAlign:"center",padding:"32px 20px",color:C.gray}}>
            <div style={{display:"flex",justifyContent:"center",marginBottom:8}}><Inbox size={40} color={C.gray400} /></div>
            <p style={{fontWeight:700,marginTop:10}}>Aucun service ce mois</p>
          </div>
        ):logs.map(l=>(
          <div key={l.id} style={{background:"#fff",borderRadius:14,padding:"12px 14px",
            marginBottom:10,boxShadow:"0 1px 4px rgba(0,0,0,0.04)",
            borderLeft:`3px solid ${l.status==="absent"?C.red:l.is_replacement?C.blue:C.green}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontWeight:800,fontSize:14,color:"#1E293B"}}>
                  {new Date(l.date_service).toLocaleDateString("fr-CH",{weekday:"short",day:"numeric",month:"short"})}
                </div>
                <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap"}}>
                  {l.is_replacement&&(
                    <span style={{fontSize:11,fontWeight:700,color:C.blue,background:C.blueL,
                      borderRadius:99,padding:"2px 7px"}}>Remplacement</span>
                  )}
                  {l.status==="absent"&&(
                    <span style={{fontSize:11,fontWeight:700,color:C.red,background:C.redL,
                      borderRadius:99,padding:"2px 7px"}}>Absent</span>
                  )}
                  {l.status!=="absent"&&!l.is_replacement&&(
                    <span style={{fontSize:11,fontWeight:700,color:C.greenD,background:C.greenL,
                      borderRadius:99,padding:"2px 7px"}}>Service effectué</span>
                  )}
                </div>
              </div>
              <div style={{textAlign:"right",fontSize:13,color:C.gray}}>
                {l.heure_debut&&<div>{fmtHHMM(l.heure_debut)} → {fmtHHMM(l.heure_fin)}</div>}
                {l.heure_debut&&l.heure_fin&&(
                  <div style={{fontWeight:700,color:C.navy}}>{calcDuration(l.heure_debut,l.heure_fin)}</div>
                )}
              </div>
            </div>
            {l.replacement_name&&(
              <div style={{fontSize:12,color:C.gray,marginTop:4}}>Remplace : {l.replacement_name}</div>
            )}
          </div>
        ))}

        {/* Signalements du mois */}
        {(()=>{
          const monthIncs=incidents.filter(inc=>{
            const d=new Date(inc.reported_at);
            return d.getMonth()+1===histMonth&&(
              d.getMonth()>=8?d.getFullYear()===histYear:d.getFullYear()===histYear+1
            );
          });
          if(monthIncs.length===0)return null;
          const statusMap:{[k:string]:{l:string;c:string;bg:string}}={
            en_attente:{l:"En attente",c:C.amber,bg:C.amberL},
            en_cours:  {l:"Traité",    c:C.blue, bg:C.blueL},
            resolu:    {l:"Résolu",    c:C.green,bg:C.greenL},
          };
          return(
            <div style={{marginTop:20}}>
              <div style={{fontWeight:800,fontSize:13,color:C.navy,textTransform:"uppercase",
                letterSpacing:0.5,marginBottom:12}}>
                Signalements ({monthIncs.length})
              </div>
              {monthIncs.map(inc=>{
                const stype=SIGN_TYPES.find(s=>s.v===inc.type);
                const st=statusMap[inc.status]||statusMap.en_attente;
                return(
                  <div key={inc.id} style={{background:"#fff",borderRadius:12,padding:"12px 14px",
                    marginBottom:8,borderLeft:`3px solid ${st.c}`,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",
                      alignItems:"flex-start",gap:8,marginBottom:6}}>
                      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                        <span style={{fontWeight:700,fontSize:13,color:"#1E293B"}}>
                          {stype?.l||inc.type}
                        </span>
                        <span style={{fontSize:11,fontWeight:700,color:st.c,
                          background:st.bg,borderRadius:99,padding:"2px 7px"}}>
                          {st.l}
                        </span>
                      </div>
                      <span style={{fontSize:11,color:C.gray,whiteSpace:"nowrap"}}>
                        {new Date(inc.reported_at).toLocaleDateString("fr-CH",{day:"2-digit",month:"2-digit"})}
                      </span>
                    </div>
                    <p style={{fontSize:13,color:"#475569",lineHeight:1.4,marginBottom:inc.response?8:0}}>
                      {inc.description}
                    </p>
                    {inc.response&&(
                      <div style={{background:C.greenL,borderRadius:8,padding:"8px 10px",
                        fontSize:12,color:C.greenD,fontWeight:600}}>
                        {inc.response}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    );
  }

  // Niveau 2 — mois d'une année
  if(histYear!==null){
    const yLogs=logsForYear(histYear);
    return(
      <div>
        <button onClick={()=>setHistYear(null)}
          style={{display:"flex",alignItems:"center",gap:6,marginBottom:16,
            background:"none",border:"none",cursor:"pointer",color:C.green,fontWeight:700,fontSize:14,padding:0}}>
          ← Années scolaires
        </button>
        <h2 style={{fontWeight:900,color:C.navy,fontSize:18,marginBottom:16}}>
          {histYear}-{histYear+1}
          {histYear===currentSY&&" (en cours)"}
        </h2>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          {[
            {label:"Jours travaillés",val:yLogs.filter(l=>l.status!=="absent").length,c:C.green},
            {label:"Jours absents",   val:yLogs.filter(l=>l.status==="absent").length,c:C.red},
          ].map(s=>(
            <div key={s.label} style={{background:"#fff",borderRadius:14,padding:"12px 14px",
              boxShadow:"0 1px 4px rgba(0,0,0,0.06)",borderLeft:`3px solid ${s.c}`}}>
              <div style={{fontSize:22,fontWeight:900,color:s.c}}>{s.val}</div>
              <div style={{fontSize:11,color:C.gray,marginTop:2}}>{s.label}</div>
            </div>
          ))}
        </div>
        <div>
          {SCHOOL_MONTHS.map(mon=>{
            const mLogs=logsForYearMonth(histYear,mon);
            if(mLogs.length===0&&!(histYear===currentSY&&mon<=new Date().getMonth()+1))return null;
            const worked=mLogs.filter(l=>l.status!=="absent").length;
            const absent=mLogs.filter(l=>l.status==="absent").length;
            return(
              <button key={mon} onClick={()=>setHistMonth(mon)}
                style={{width:"100%",display:"flex",justifyContent:"space-between",
                  alignItems:"center",padding:"14px 16px",borderRadius:14,
                  background:"#fff",border:`1px solid ${C.gray200}`,cursor:"pointer",
                  marginBottom:8,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                <span style={{fontWeight:700,color:"#1E293B",fontSize:14}}>{MON[mon]}</span>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  {worked>0&&<span style={{fontSize:12,color:C.green,fontWeight:700}}>{worked}j</span>}
                  {absent>0&&<span style={{fontSize:12,color:C.red,fontWeight:700}}>{absent}j</span>}
                  {mLogs.length===0&&<span style={{fontSize:12,color:C.gray}}>—</span>}
                  <span style={{color:C.green,fontSize:16}}>→</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Niveau 1 — liste des années
  return(
    <div>
      <h2 style={{fontWeight:900,color:C.navy,fontSize:18,marginBottom:16}}>Mon historique</h2>
      {histLogs.length===0?(
        <div style={{textAlign:"center",padding:"60px 20px",color:C.gray}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:8}}><BarChart2 size={48} color={C.gray400} /></div>
          <p style={{fontWeight:700,marginTop:12}}>Aucun historique disponible</p>
        </div>
      ):(
        <>
          <button onClick={()=>window.print()}
            style={{padding:"10px 16px",borderRadius:10,border:`1px solid ${C.green}`,
              background:C.greenL,color:C.greenD,fontWeight:700,fontSize:13,cursor:"pointer",marginBottom:16}}>
            Télécharger mon historique PDF
          </button>
          {allYears.map(y=>{
            const yLogs=logsForYear(y);
            const worked=yLogs.filter(l=>l.status!=="absent").length;
            const absent=yLogs.filter(l=>l.status==="absent").length;
            const isCurrent=y===currentSY;
            return(
              <button key={y} onClick={()=>setHistYear(y)}
                style={{width:"100%",display:"flex",justifyContent:"space-between",
                  alignItems:"center",padding:"18px 20px",borderRadius:16,
                  background:isCurrent?"#EFF6FF":"#fff",
                  border:`2px solid ${isCurrent?C.navy:C.gray200}`,cursor:"pointer",
                  marginBottom:10,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
                <div style={{textAlign:"left"}}>
                  <div style={{fontWeight:900,fontSize:17,color:C.navy}}>
                    {y}-{y+1}
                    {isCurrent&&<span style={{marginLeft:8,fontSize:12,fontWeight:700,
                      color:C.green,background:C.greenL,borderRadius:99,padding:"2px 8px"}}>
                      En cours
                    </span>}
                  </div>
                  <div style={{fontSize:12,color:C.gray,marginTop:4}}>
                    {yLogs.length} entrées · {worked} jours travaillés · {absent} absences
                  </div>
                </div>
                <span style={{color:C.green,fontSize:20}}>→</span>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
