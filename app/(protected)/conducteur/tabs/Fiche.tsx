"use client";
import { C, fmtDate, fmtEnfant } from "@/lib/constants";
import type { Conducteur, Enfant } from "@/lib/types";
import { StatusBadge, DL, baseInp } from "./shared";

type CircType = { nom?: string; emoji?: string; enfants_count?: number; cercle?: { nom?: string } };
type VehType  = { plaque?: string; marque?: string; modele?: string };

export interface FicheProps {
  driver: Conducteur;
  circ?: CircType;
  veh?: VehType;
  enfantsCircuit: Enfant[];
  editTel: boolean;
  telValue: string;
  telSaving: boolean;
  onSetEditTel: (v: boolean) => void;
  onSetTelValue: (v: string) => void;
  onSaveTel: () => void;
}

export function TabFiche({driver,circ,veh,enfantsCircuit,editTel,telValue,telSaving,onSetEditTel,onSetTelValue,onSaveTel}:FicheProps){
  return(
    <div>
      {/* Avatar + infos */}
      <div style={{background:"#fff",borderRadius:18,padding:"20px 20px 16px",
        marginBottom:16,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
        <div style={{display:"flex",gap:16,alignItems:"center",marginBottom:16}}>
          <div style={{width:64,height:64,borderRadius:"50%",
            background:`linear-gradient(135deg,${C.greenD},${C.green})`,
            color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",
            fontWeight:900,fontSize:22,flexShrink:0}}>
            {driver.photo_initials||`${driver.prenom[0]}${driver.nom[0]}`}
          </div>
          <div>
            <div style={{fontWeight:900,fontSize:20,color:C.navy}}>{driver.prenom} {driver.nom}</div>
            <div style={{marginTop:4}}><StatusBadge status={driver.status}/></div>
          </div>
        </div>
        <DL label="Affectation"          value={driver.affectation||"—"}/>
        <DL label="N° permis"            value={driver.permis||"—"}/>
        <DL label="Expiration permis"    value={driver.permis_exp?fmtDate(driver.permis_exp):"—"}/>
        <DL label="Tachygraphe"          value={driver.tachygraphe?"Oui":"Non"}/>
        <DL label="Dans l'entreprise depuis" value={fmtDate(driver.created_at)}/>
        {driver.absence_motif&&driver.status==="absent"&&(
          <DL label="Motif absence" value={driver.absence_motif}/>
        )}
      </div>

      {/* Téléphone modifiable */}
      <div style={{background:"#fff",borderRadius:16,padding:16,marginBottom:16,
        boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontWeight:700,color:C.navy,fontSize:14}}>Téléphone</span>
          {!editTel&&(
            <button onClick={()=>{onSetEditTel(true);onSetTelValue(driver.tel||"");}}
              style={{fontSize:13,color:C.green,background:"none",border:"none",cursor:"pointer",fontWeight:700}}>
              Modifier
            </button>
          )}
        </div>
        {editTel?(
          <div style={{display:"flex",gap:8}}>
            <input value={telValue} onChange={e=>onSetTelValue(e.target.value)}
              placeholder="079 000 00 00" style={{...baseInp,flex:1}}/>
            <button onClick={onSaveTel} disabled={telSaving}
              style={{padding:"12px 16px",borderRadius:10,background:C.green,color:"#fff",
                border:"none",fontWeight:700,cursor:"pointer"}}>
              {telSaving?"…":"✓"}
            </button>
            <button onClick={()=>onSetEditTel(false)}
              style={{padding:"12px 16px",borderRadius:10,background:C.gray100,color:C.gray,
                border:"none",fontWeight:700,cursor:"pointer"}}>✕</button>
          </div>
        ):(
          <p style={{fontSize:16,fontWeight:700,color:"#1E293B"}}>{driver.tel||"Non renseigné"}</p>
        )}
      </div>

      {/* Circuit + véhicule */}
      {circ&&(
        <div style={{background:C.greenL,borderRadius:16,padding:16,marginBottom:16}}>
          <div style={{fontWeight:800,color:C.greenD,marginBottom:10,fontSize:14}}>Circuit habituel</div>
          <DL label="Circuit"   value={`${circ.emoji||""} ${circ.nom||"—"}`}/>
          <DL label="École"     value={circ.cercle?.nom||"—"}/>
          <DL label="Enfants"   value={circ.enfants_count!=null?`${circ.enfants_count} enfants`:"—"}/>
          {veh&&<DL label="Véhicule" value={`${veh.plaque} — ${veh.marque} ${veh.modele}`}/>}
        </div>
      )}

      {/* Liste enfants */}
      {enfantsCircuit.length>0&&(
        <div style={{background:"#fff",borderRadius:16,padding:16,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
          <div style={{fontWeight:800,color:C.navy,marginBottom:12,fontSize:14}}>
            Enfants du circuit ({enfantsCircuit.length})
          </div>
          {enfantsCircuit.map(e=>(
            <div key={e.id} style={{padding:"8px 0",borderBottom:"1px solid #F1F5F9",
              display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:"#1E293B"}}>{fmtEnfant(e.prenom, e.nom)}</div>
                {e.parent_nom&&<div style={{fontSize:12,color:C.gray}}>Parent : {e.parent_nom}</div>}
              </div>
              {e.parent_tel&&<span style={{fontSize:12,color:C.blue,fontWeight:600}}>{e.parent_tel}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
