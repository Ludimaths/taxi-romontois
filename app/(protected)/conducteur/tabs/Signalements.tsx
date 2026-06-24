"use client";
import { C } from "@/lib/constants";
import type { Conducteur, Incident } from "@/lib/types";
import { BigBtn, Chip, TA, SIGN_TYPES } from "./shared";

export interface SignalementsProps {
  driver: Conducteur;
  incidents: Incident[];
  signType: string;
  signDesc: string;
  signUrgence: string;
  signSent: boolean;
  onSetSignType: (v: string) => void;
  onSetSignDesc: (v: string) => void;
  onSetSignUrgence: (v: string) => void;
  onEnvoyer: () => void;
}

export function TabSignalements({
  driver,incidents,signType,signDesc,signUrgence,signSent,
  onSetSignType,onSetSignDesc,onSetSignUrgence,onEnvoyer,
}:SignalementsProps){
  const statusMap:{[k:string]:{l:string;c:string;bg:string}}={
    en_attente:{l:"En attente de réponse",c:C.amber,bg:C.amberL},
    en_cours:  {l:"Pris en charge",       c:C.blue, bg:C.blueL},
    resolu:    {l:"Résolu",               c:C.green,bg:C.greenL},
  };

  return(
    <div>
      {signSent&&(
        <div style={{background:C.greenL,borderRadius:14,padding:14,marginBottom:16,
          border:`1px solid #86EFAC`,fontWeight:700,color:C.greenD}}>
          ✅ Signalement envoyé — le gestionnaire a été notifié.
        </div>
      )}

      {/* Formulaire */}
      <div style={{background:"#fff",borderRadius:18,padding:20,marginBottom:20,
        boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
        <h2 style={{fontWeight:800,color:C.navy,fontSize:16,marginBottom:16}}>Nouveau signalement</h2>

        <div style={{marginBottom:14}}>
          <label style={{display:"block",fontSize:13,fontWeight:700,color:C.gray,marginBottom:8}}>
            Type de signalement *
          </label>
          <div style={{display:"flex",flexWrap:"wrap",gap:0}}>
            {SIGN_TYPES.map(s=>(
              <Chip key={s.v} label={`${s.e} ${s.l}`} active={signType===s.v} onClick={()=>onSetSignType(s.v)}/>
            ))}
          </div>
        </div>

        <TA label="Description *" value={signDesc} onChange={onSetSignDesc}
          placeholder="Décrivez la situation…" rows={3}/>

        <div style={{marginBottom:16}}>
          <label style={{display:"block",fontSize:13,fontWeight:700,color:C.gray,marginBottom:8}}>
            Niveau d'urgence
          </label>
          <div style={{display:"flex",gap:8}}>
            <Chip label="🟢 Normal" active={signUrgence==="normal"} onClick={()=>onSetSignUrgence("normal")} color={C.green}/>
            <Chip label="🔴 Urgent" active={signUrgence==="urgent"} onClick={()=>onSetSignUrgence("urgent")} color={C.red}/>
          </div>
        </div>

        <BigBtn label="📤 Envoyer au gestionnaire"
          onClick={onEnvoyer}
          disabled={!signType||!signDesc.trim()}
          color={signUrgence==="urgent"?C.red:C.green}/>
      </div>

      {/* Signalements récents */}
      {incidents.length>0&&(
        <div>
          <h2 style={{fontWeight:800,color:C.navy,fontSize:15,marginBottom:12}}>Mes signalements récents</h2>
          {incidents.map(inc=>{
            const stype=SIGN_TYPES.find(s=>s.v===inc.type);
            const st=statusMap[inc.status]||statusMap.en_attente;
            return(
              <div key={inc.id} style={{background:"#fff",borderRadius:16,padding:16,
                marginBottom:12,boxShadow:"0 2px 8px rgba(0,0,0,0.06)",borderLeft:`4px solid ${st.c}`}}>
                <div style={{display:"flex",justifyContent:"space-between",
                  alignItems:"flex-start",marginBottom:8,gap:8}}>
                  <div>
                    <span style={{fontWeight:800,fontSize:14,color:C.navy}}>
                      {stype?.e||"⚡"} {stype?.l||inc.type}
                    </span>
                    <span style={{display:"inline-block",marginLeft:8,padding:"2px 8px",
                      borderRadius:20,fontSize:11,fontWeight:700,background:st.bg,color:st.c}}>
                      {st.l}
                    </span>
                  </div>
                  <span style={{fontSize:12,color:C.gray,whiteSpace:"nowrap"}}>
                    {new Date(inc.reported_at).toLocaleDateString("fr-CH")}
                  </span>
                </div>
                <p style={{fontSize:14,color:"#1E293B",lineHeight:1.5,marginBottom:inc.response?8:0}}>
                  {inc.description}
                </p>
                {inc.response&&(
                  <div style={{background:C.greenL,borderRadius:10,padding:"10px 12px",
                    fontSize:13,color:C.greenD,fontWeight:600}}>
                    💬 Réponse gestionnaire : {inc.response}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
