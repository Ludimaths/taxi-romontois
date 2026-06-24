"use client";
import type { ReactNode, CSSProperties } from "react";
import { C } from "@/lib/constants";

// ── Styles de base ────────────────────────────────────────────────────────────

export const baseInp: CSSProperties = {
  width:"100%",padding:"12px 14px",borderRadius:10,
  border:"1px solid #CBD5E1",fontSize:15,color:"#1E293B",background:"#fff",
  boxSizing:"border-box",
};

// ── Mini-composants locaux ────────────────────────────────────────────────────

export function BSheet({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
  return(
    <div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"flex-end",
      background:"rgba(0,0,0,0.55)"}} onClick={onClose}>
      <div style={{width:"100%",maxHeight:"93vh",overflowY:"auto",background:"#fff",
        borderRadius:"20px 20px 0 0",padding:"20px 20px 52px"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{fontSize:18,fontWeight:800,color:C.navy}}>{title}</h2>
          <button onClick={onClose} style={{fontSize:26,background:"none",border:"none",cursor:"pointer",color:C.gray,lineHeight:1}}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function BigBtn({label,onClick,color=C.green,bg="",disabled=false,outline=false}:{
  label:string;onClick:()=>void;color?:string;bg?:string;disabled?:boolean;outline?:boolean;
}){
  return(
    <button onClick={onClick} disabled={disabled} style={{
      width:"100%",padding:"16px",borderRadius:14,fontWeight:800,fontSize:16,
      border:outline?`2px solid ${color}`:"none",
      background:disabled?"#CBD5E1":outline?"transparent":(bg||color),
      color:disabled?"#94A3B8":outline?color:"#fff",
      cursor:disabled?"not-allowed":"pointer",marginBottom:10,
      boxShadow:disabled?"none":"0 2px 8px rgba(0,0,0,0.12)",
    }}>{label}</button>
  );
}

export function SmBtn({label,onClick,color=C.green,outline=false,small=false}:{
  label:string;onClick:()=>void;color?:string;outline?:boolean;small?:boolean;
}){
  return(
    <button onClick={onClick} style={{
      padding:small?"7px 12px":"10px 18px",borderRadius:10,fontWeight:700,fontSize:small?12:14,
      border:outline?`2px solid ${color}`:"none",
      background:outline?"transparent":color,color:outline?color:"#fff",
      cursor:"pointer",marginRight:6,marginBottom:6,
    }}>{label}</button>
  );
}

export function Inp({label,type="text",value,onChange,placeholder="",required=false}:{
  label:string;type?:string;value:string;onChange:(v:string)=>void;placeholder?:string;required?:boolean;
}){
  return(
    <div style={{marginBottom:14}}>
      <label style={{display:"block",fontSize:13,fontWeight:700,color:C.gray,marginBottom:5}}>
        {label}{required&&<span style={{color:C.red}}> *</span>}
      </label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder} style={baseInp}/>
    </div>
  );
}

export function TA({label,value,onChange,rows=3,placeholder=""}:{
  label:string;value:string;onChange:(v:string)=>void;rows?:number;placeholder?:string;
}){
  return(
    <div style={{marginBottom:14}}>
      <label style={{display:"block",fontSize:13,fontWeight:700,color:C.gray,marginBottom:5}}>{label}</label>
      <textarea value={value} onChange={e=>onChange(e.target.value)} rows={rows}
        placeholder={placeholder} style={{...baseInp,resize:"vertical"} as CSSProperties}/>
    </div>
  );
}

export function Chip({label,active,onClick,color=C.green}:{
  label:string;active:boolean;onClick:()=>void;color?:string;
}){
  return(
    <button onClick={onClick} style={{
      padding:"8px 14px",borderRadius:20,fontWeight:700,fontSize:13,cursor:"pointer",
      border:`2px solid ${active?color:C.gray200}`,
      background:active?color:"#fff",color:active?"#fff":C.gray,marginRight:8,marginBottom:8,
    }}>{label}</button>
  );
}

export function StatusBadge({status}:{status:string}){
  const map:{[k:string]:{l:string;c:string;bg:string}}={
    en_service:{l:"En service",c:C.greenD,bg:C.greenL},
    disponible:{l:"Disponible",c:"#1D4ED8",bg:C.blueL},
    absent:{l:"Absent",c:C.red,bg:C.redL},
    en_attente:{l:"En attente",c:C.amber,bg:C.amberL},
    termine:{l:"Terminé",c:C.gray,bg:C.gray100},
  };
  const s=map[status]||{l:status,c:C.gray,bg:C.gray100};
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 12px",
      borderRadius:20,fontSize:13,fontWeight:700,background:s.bg,color:s.c}}>
      {"●"} {s.l}
    </span>
  );
}

export function DL({label,value}:{label:string;value:string}){
  return(
    <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",
      borderBottom:"1px solid #F1F5F9",fontSize:14}}>
      <span style={{color:C.gray,fontWeight:600}}>{label}</span>
      <span style={{color:"#1E293B",fontWeight:700,textAlign:"right",maxWidth:"60%"}}>{value}</span>
    </div>
  );
}

// ── Constantes signalements ───────────────────────────────────────────────────

export const SIGN_TYPES=[
  {v:"panne",       l:"Panne véhicule"},
  {v:"voyant",      l:"Voyant moteur"},
  {v:"accident",    l:"Accident"},
  {v:"retard",      l:"Retard"},
  {v:"degradation", l:"Dégradation véhicule"},
  {v:"enfant",      l:"Problème enfant"},
  {v:"parent",      l:"Problème parent"},
  {v:"autre",       l:"Autre"},
];
export const SIGN_LABELS:Record<string,string>=Object.fromEntries(SIGN_TYPES.map(s=>[s.v,s.l]));

// ── Helpers année scolaire ────────────────────────────────────────────────────

export function schoolYearStart(d:Date):number{
  return d.getMonth()>=8?d.getFullYear():d.getFullYear()-1;
}
export const SCHOOL_MONTHS=[9,10,11,12,1,2,3,4,5,6,7,8];
export const MON=["","Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

export function calcDuration(debut?:string,fin?:string):string{
  if(!debut||!fin)return"—";
  const a=new Date(`1970-01-01T${debut}`),b=new Date(`1970-01-01T${fin}`);
  const diff=Math.round((b.getTime()-a.getTime())/60000);
  if(diff<=0)return"—";
  return`${Math.floor(diff/60)}h${String(diff%60).padStart(2,"0")}`;
}
