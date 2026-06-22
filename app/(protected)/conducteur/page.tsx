"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Conducteur, ServiceLog, Incident, Alerte, AbsenceEnfant, Enfant } from "@/lib/types";

type Tab = "dashboard" | "fiche" | "service" | "signalements" | "messages" | "historique";

const G = {
  green:  "#16A34A", greenL: "#DCFCE7", greenD: "#15803D",
  navy:   "#0D3B7A",
  red:    "#DC2626", redL:   "#FEE2E2",
  amber:  "#D97706", amberL: "#FEF3C7",
  blue:   "#3B82F6", blueL:  "#DBEAFE",
  purple: "#7C3AED",
  gray:   "#64748B", grayL:  "#F1F5F9", grayB:  "#E2E8F0",
  white:  "#FFFFFF",
};

const baseInp: React.CSSProperties = {
  width:"100%",padding:"12px 14px",borderRadius:10,
  border:"1px solid #CBD5E1",fontSize:15,color:"#1E293B",background:"#fff",
  boxSizing:"border-box",
};
const fd = (d?:string|null)=>d?new Date(d).toLocaleDateString("fr-CH"):"—";
const fdt= (d?:string|null)=>d?new Date(d).toLocaleString("fr-CH",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
const hhmm=(d?:string|null)=>{
  if(!d)return"—";
  const t=d.includes("T")?new Date(d):new Date(`1970-01-01T${d}`);
  return t.toLocaleTimeString("fr-CH",{hour:"2-digit",minute:"2-digit"});
};
const todayISO=()=>new Date().toISOString().slice(0,10);
const nowTimeStr=()=>new Date().toTimeString().slice(0,8);

function schoolYearStart(d:Date):number{
  return d.getMonth()>=8?d.getFullYear():d.getFullYear()-1;
}
const SCHOOL_MONTHS=[9,10,11,12,1,2,3,4,5,6,7,8];
const MON=["","Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

function BSheet({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){
  return(
    <div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"flex-end",
      background:"rgba(0,0,0,0.55)"}} onClick={onClose}>
      <div style={{width:"100%",maxHeight:"93vh",overflowY:"auto",background:"#fff",
        borderRadius:"20px 20px 0 0",padding:"20px 20px 52px"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{fontSize:18,fontWeight:800,color:G.navy}}>{title}</h2>
          <button onClick={onClose} style={{fontSize:26,background:"none",border:"none",cursor:"pointer",color:G.gray,lineHeight:1}}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function BigBtn({label,onClick,color=G.green,bg="",disabled=false,outline=false}:{label:string;onClick:()=>void;color?:string;bg?:string;disabled?:boolean;outline?:boolean}){
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

function SmBtn({label,onClick,color=G.green,outline=false,small=false}:{label:string;onClick:()=>void;color?:string;outline?:boolean;small?:boolean}){
  return(
    <button onClick={onClick} style={{
      padding:small?"7px 12px":"10px 18px",borderRadius:10,fontWeight:700,fontSize:small?12:14,
      border:outline?`2px solid ${color}`:"none",
      background:outline?"transparent":color,color:outline?color:"#fff",
      cursor:"pointer",marginRight:6,marginBottom:6,
    }}>{label}</button>
  );
}

function Inp({label,type="text",value,onChange,placeholder="",required=false}:{
  label:string;type?:string;value:string;onChange:(v:string)=>void;placeholder?:string;required?:boolean;
}){
  return(
    <div style={{marginBottom:14}}>
      <label style={{display:"block",fontSize:13,fontWeight:700,color:G.gray,marginBottom:5}}>
        {label}{required&&<span style={{color:G.red}}> *</span>}
      </label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder} style={baseInp}/>
    </div>
  );
}

function TA({label,value,onChange,rows=3,placeholder=""}:{label:string;value:string;onChange:(v:string)=>void;rows?:number;placeholder?:string;}){
  return(
    <div style={{marginBottom:14}}>
      <label style={{display:"block",fontSize:13,fontWeight:700,color:G.gray,marginBottom:5}}>{label}</label>
      <textarea value={value} onChange={e=>onChange(e.target.value)} rows={rows}
        placeholder={placeholder} style={{...baseInp,resize:"vertical"} as React.CSSProperties}/>
    </div>
  );
}

function Chip({label,active,onClick,color=G.green}:{label:string;active:boolean;onClick:()=>void;color?:string;}){
  return(
    <button onClick={onClick} style={{
      padding:"8px 14px",borderRadius:20,fontWeight:700,fontSize:13,cursor:"pointer",
      border:`2px solid ${active?color:G.grayB}`,
      background:active?color:"#fff",color:active?"#fff":G.gray,marginRight:8,marginBottom:8,
    }}>{label}</button>
  );
}

function StatusBadge({status}:{status:string}){
  const map:{[k:string]:{l:string;c:string;bg:string}}={
    en_service:{l:"En service",c:G.greenD,bg:G.greenL},
    disponible:{l:"Disponible",c:"#1D4ED8",bg:G.blueL},
    absent:{l:"Absent",c:G.red,bg:G.redL},
    en_attente:{l:"En attente",c:G.amber,bg:G.amberL},
    termine:{l:"Terminé",c:G.gray,bg:G.grayL},
  };
  const s=map[status]||{l:status,c:G.gray,bg:G.grayL};
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 12px",
      borderRadius:20,fontSize:13,fontWeight:700,background:s.bg,color:s.c}}>
      {status==="en_service"?"●":status==="absent"?"●":status==="disponible"?"●":"●"} {s.l}
    </span>
  );
}

function DL({label,value}:{label:string;value:string}){
  return(
    <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",
      borderBottom:"1px solid #F1F5F9",fontSize:14}}>
      <span style={{color:G.gray,fontWeight:600}}>{label}</span>
      <span style={{color:"#1E293B",fontWeight:700,textAlign:"right",maxWidth:"60%"}}>{value}</span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ConducteurPage(){
  const sb=createClient();

  const [driver,    setDriver]    = useState<Conducteur|null>(null);
  const [todayLog,  setTodayLog]  = useState<ServiceLog|null>(null);
  const [absences,  setAbsences]  = useState<AbsenceEnfant[]>([]);
  const [enfants,   setEnfants]   = useState<Enfant[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [messages,  setMessages]  = useState<Alerte[]>([]);
  const [histLogs,  setHistLogs]  = useState<ServiceLog[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState<Tab>("dashboard");

  // Service modals
  const [showConfirm,  setShowConfirm]  = useState(false);   // prise de service
  const [showReplace,  setShowReplace]  = useState(false);   // remplacement
  const [showAbsence,  setShowAbsence]  = useState(false);   // absence
  const [showReprise,  setShowReprise]  = useState(false);   // retour maladie
  const [showFin,      setShowFin]      = useState(false);   // fin de service

  // Remplacement form
  const [replCircuit,   setReplCircuit]   = useState("");
  const [replVehicle,   setReplVehicle]   = useState("");
  const [replRemplace,  setReplRemplace]  = useState("");

  // Absence form
  const [absMotif,  setAbsMotif]  = useState("");
  const [absNotes,  setAbsNotes]  = useState("");

  // Tel edit
  const [editTel,    setEditTel]    = useState(false);
  const [telValue,   setTelValue]   = useState("");
  const [telSaving,  setTelSaving]  = useState(false);

  // Signalement form
  const [signType,    setSignType]    = useState("");
  const [signDesc,    setSignDesc]    = useState("");
  const [signUrgence, setSignUrgence] = useState("normal");
  const [signSent,    setSignSent]    = useState(false);

  // Absences confirmées localement
  const [absConfirmed, setAbsConfirmed] = useState<Set<number>>(new Set());

  // Historique navigation
  const [histYear,  setHistYear]  = useState<number|null>(null);
  const [histMonth, setHistMonth] = useState<number|null>(null);

  // ── Load ─────────────────────────────────────────────────────────────────────
  const load=useCallback(async()=>{
    const{data:{user}}=await sb.auth.getUser();
    if(!user)return;
    const{data:prof}=await sb.from("profiles").select("conducteur_id").eq("id",user.id).single();
    if(!prof?.conducteur_id){setLoading(false);return;}
    const cid=prof.conducteur_id;

    const[drv,log,abs,enf,inc,msg,hist]=await Promise.all([
      sb.from("conducteurs").select("*,circuit:circuits(*,cercle:cercles_scolaires(*)),vehicule:vehicules(*)")
        .eq("id",cid).single(),
      sb.from("service_logs").select("*")
        .eq("conducteur_id",cid).eq("date_service",todayISO()).maybeSingle(),
      sb.from("absences_enfants").select("*,enfant:enfants(*)")
        .gte("date_absence",new Date(Date.now()-30*864e5).toISOString().slice(0,10))
        .order("date_absence",{ascending:false}).order("reported_at",{ascending:false}),
      sb.from("enfants").select("*").order("nom"),
      sb.from("incidents").select("*")
        .eq("conducteur_id",cid).order("reported_at",{ascending:false}).limit(20),
      sb.from("alertes").select("*")
        .eq("driver_id",cid).order("created_at",{ascending:false}).limit(50),
      sb.from("service_logs").select("*")
        .eq("conducteur_id",cid).order("date_service",{ascending:false}).limit(365),
    ]);

    if(drv.error)  console.error("[cond] driver:",drv.error);
    if(abs.error)  console.error("[cond] absences:",abs.error);
    if(inc.error)  console.error("[cond] incidents:",inc.error);
    if(msg.error)  console.error("[cond] messages:",msg.error);

    if(drv.data) setDriver(drv.data);
    if(log.data) setTodayLog(log.data);
    if(abs.data){
      const d=drv.data;
      setAbsences(d?.circuit_id?abs.data.filter(a=>a.circuit_id===d.circuit_id):abs.data);
    }
    if(enf.data) setEnfants(enf.data);
    if(inc.data) setIncidents(inc.data);
    if(msg.data) setMessages(msg.data);
    if(hist.data)setHistLogs(hist.data);
    setLoading(false);
  },[sb]);

  useEffect(()=>{
    load();
    const ch=sb.channel("cond-rt")
      .on("postgres_changes",{event:"*",schema:"public",table:"absences_enfants"},load)
      .on("postgres_changes",{event:"*",schema:"public",table:"incidents"},load)
      .on("postgres_changes",{event:"*",schema:"public",table:"service_logs"},load)
      .on("postgres_changes",{event:"*",schema:"public",table:"alertes"},load)
      .subscribe();
    return()=>{sb.removeChannel(ch);};
  },[load,sb]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handlePrendreService(){
    if(!driver)return;
    const{data,error}=await sb.from("service_logs").insert({
      conducteur_id:driver.id,
      vehicule_id:driver.vehicule_id||null,
      circuit_id:driver.circuit_id||null,
      date_service:todayISO(),
      heure_debut:nowTimeStr(),
      status:"en_service",
      is_replacement:false,
    }).select().single();
    if(error){console.error(error);return;}
    await sb.from("conducteurs").update({status:"en_service"}).eq("id",driver.id);
    await sb.from("alertes").insert({
      type:"conducteur",severity:"normale",
      message:`${driver.prenom} ${driver.nom} a pris son service à ${hhmm(nowTimeStr())} — Circuit ${driver.circuit?.nom||"—"}`,
      read:false,
    });
    setTodayLog(data);
    setDriver(p=>p?{...p,status:"en_service"}:p);
    setShowConfirm(false);
  }

  async function handleRemplacerService(){
    if(!driver)return;
    const{data,error}=await sb.from("service_logs").insert({
      conducteur_id:driver.id,
      vehicule_id:replVehicle||driver.vehicule_id||null,
      circuit_id:replCircuit||null,
      date_service:todayISO(),
      heure_debut:nowTimeStr(),
      status:"en_service",
      is_replacement:true,
      replacement_name:replRemplace,
    }).select().single();
    if(error){console.error(error);return;}
    await sb.from("conducteurs").update({status:"en_service"}).eq("id",driver.id);
    await sb.from("alertes").insert({
      type:"conducteur",severity:"normale",
      message:`${driver.prenom} ${driver.nom} remplace ${replRemplace||"—"} sur circuit ${replCircuit} à ${hhmm(nowTimeStr())}`,
      read:false,
    });
    setTodayLog(data);
    setDriver(p=>p?{...p,status:"en_service"}:p);
    setShowReplace(false);
    setReplCircuit("");setReplVehicle("");setReplRemplace("");
  }

  async function handleTerminerService(){
    if(!driver||!todayLog)return;
    await sb.from("service_logs").update({
      heure_fin:nowTimeStr(),status:"termine",
    }).eq("id",todayLog.id);
    await sb.from("conducteurs").update({status:"disponible"}).eq("id",driver.id);
    await sb.from("alertes").insert({
      type:"conducteur",severity:"normale",
      message:`${driver.prenom} ${driver.nom} a terminé son service à ${hhmm(nowTimeStr())}`,
      read:false,
    });
    setDriver(p=>p?{...p,status:"disponible"}:p);
    setTodayLog(p=>p?{...p,heure_fin:nowTimeStr(),status:"termine"}:p);
    setShowFin(false);
  }

  async function handleSignalerAbsence(){
    if(!driver||!absMotif)return;
    await sb.from("conducteurs").update({status:"absent",absence_motif:absMotif}).eq("id",driver.id);
    await sb.from("absences_conducteurs").insert({
      conducteur_id:driver.id,
      date_absence:todayISO(),
      motif:absMotif+(absNotes?` — ${absNotes}`:""),
      circuit_id:driver.circuit_id||null,
      status:"non_couvert",
    });
    await sb.from("alertes").insert({
      type:"conducteur",severity:"haute",
      message:`🤒 ${driver.prenom} ${driver.nom} absent — Motif : ${absMotif}${absNotes?` (${absNotes})`:""}${driver.circuit?` — Circuit ${driver.circuit.nom} non couvert`:""}`,
      read:false,
    });
    setDriver(p=>p?{...p,status:"absent",absence_motif:absMotif}:p);
    setShowAbsence(false);setAbsMotif("");setAbsNotes("");
  }

  async function handleRepriseService(){
    if(!driver)return;
    await sb.from("conducteurs").update({status:"disponible",absence_motif:null}).eq("id",driver.id);
    await sb.from("alertes").insert({
      type:"conducteur",severity:"normale",
      message:`✅ ${driver.prenom} ${driver.nom} reprend le service aujourd'hui`,
      read:false,
    });
    setDriver(p=>p?{...p,status:"disponible",absence_motif:undefined}:p);
    setShowReprise(false);
  }

  async function handleEnvoyerSignalement(){
    if(!driver||!signType||!signDesc.trim())return;
    await sb.from("incidents").insert({
      type:signType,
      conducteur_id:driver.id,
      vehicule_id:driver.vehicule_id||null,
      circuit_id:driver.circuit_id||null,
      description:signDesc,
      status:"en_attente",
    });
    await sb.from("alertes").insert({
      type:"conducteur",
      severity:signUrgence==="urgent"?"haute":"normale",
      message:`${signType==="accident"?"🚨":signType==="panne"?"🔧":signType==="retard"?"⏰":"⚡"} [${SIGN_LABELS[signType]||signType}] ${driver.prenom} ${driver.nom} — ${signDesc}`,
      read:false,
    });
    setSignType("");setSignDesc("");setSignUrgence("normal");setSignSent(true);
    setTimeout(()=>setSignSent(false),4000);
    load();
  }

  async function handleMarquerLu(a:Alerte){
    await sb.from("alertes").update({read:true,read_at:new Date().toISOString()}).eq("id",a.id);
    setMessages(p=>p.map(x=>x.id===a.id?{...x,read:true}:x));
  }

  async function handleConfirmerAbsence(id:number){
    await sb.from("absences_enfants").update({read_by_driver:true}).eq("id",id);
    setAbsConfirmed(p=>new Set([...p,id]));
  }

  async function handleSaveTel(){
    if(!driver)return;
    setTelSaving(true);
    await sb.from("conducteurs").update({tel:telValue||null}).eq("id",driver.id);
    setDriver(p=>p?{...p,tel:telValue||undefined}:p);
    setEditTel(false);setTelSaving(false);
  }

  // ── Computed ─────────────────────────────────────────────────────────────────
  const circ   = driver?.circuit as{nom?:string;emoji?:string;enfants_count?:number;id?:string;cercle?:{nom?:string}}|undefined;
  const veh    = driver?.vehicule as{plaque?:string;marque?:string;modele?:string}|undefined;
  const enfantsCircuit = driver?.circuit_id
    ? enfants.filter(e=>e.circuit_id===driver.circuit_id)
    : [];
  const todayAbsences = absences.filter(a=>a.date_absence===todayISO());
  const incWithResponse = incidents.filter(i=>i.response);
  const unreadMsg = messages.filter(m=>!m.read).length;
  const pendingInc= incidents.filter(i=>i.status==="en_attente").length;
  // Messages badge : alertes non lues + réponses incidents non vues (incidents résolus/en cours avec réponse)
  const msgBadge = unreadMsg + incWithResponse.filter(i=>i.status!=="resolu_lu").length;

  // History
  const allYears=histLogs.length
    ? Array.from(new Set(histLogs.map(l=>schoolYearStart(new Date(l.date_service)))))
        .sort((a,b)=>b-a)
    : [schoolYearStart(new Date())];

  const logsForYear=(y:number)=>histLogs.filter(l=>{
    const d=new Date(l.date_service);
    const m=d.getMonth()+1;
    const yr=d.getFullYear();
    if(m>=9) return yr===y;
    return yr===y+1;
  });

  const logsForYearMonth=(y:number,mon:number)=>logsForYear(y).filter(l=>{
    return new Date(l.date_service).getMonth()+1===mon;
  });

  function calcDuration(debut?:string,fin?:string):string{
    if(!debut||!fin)return"—";
    const a=new Date(`1970-01-01T${debut}`),b=new Date(`1970-01-01T${fin}`);
    const diff=Math.round((b.getTime()-a.getTime())/60000);
    if(diff<=0)return"—";
    return`${Math.floor(diff/60)}h${String(diff%60).padStart(2,"0")}`;
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if(loading)return(
    <div style={{display:"flex",justifyContent:"center",alignItems:"center",minHeight:"60vh",color:G.gray,fontSize:15}}>
      Chargement…
    </div>
  );
  if(!driver)return(
    <div style={{textAlign:"center",padding:"60px 20px",color:G.gray}}>
      <div style={{fontSize:48}}>🚌</div>
      <p style={{fontWeight:700,marginTop:12}}>Aucun conducteur associé à votre compte.</p>
    </div>
  );

  const TABS:{id:Tab;label:string;badge?:number}[]=[
    {id:"dashboard",     label:"🏠 Dashboard"},
    {id:"fiche",         label:"📋 Ma fiche"},
    {id:"service",       label:"🚦 Mon service"},
    {id:"signalements",  label:"⚡ Signalements",badge:pendingInc||undefined},
    {id:"messages",      label:"📨 Messages",    badge:unreadMsg||undefined /* alertes gestionnaire */},
    {id:"historique",    label:"📊 Historique"},
  ];

  // ── Render ────────────────────────────────────────────────────────────────────
  return(
    <div style={{maxWidth:860,margin:"0 auto",paddingBottom:80}}>

      {/* ── Message d'accueil ── */}
      <div style={{background:`linear-gradient(135deg,${G.greenD},${G.green})`,
        borderRadius:18,padding:"20px 22px",color:"#fff",marginBottom:20}}>
        <p style={{fontSize:13,opacity:0.75,marginBottom:2}}>Bonjour,</p>
        <h1 style={{fontSize:22,fontWeight:900,marginBottom:8}}>{driver.prenom} {driver.nom} 👋</h1>
        <p style={{fontSize:13,opacity:0.85,lineHeight:1.5}}>
          Bienvenue dans votre espace conducteur.<br/>
          Pensez à pointer votre prise de service et votre fin de service chaque jour
          pour assurer un suivi correct de vos trajets.
        </p>
        <div style={{display:"flex",gap:10,marginTop:14,alignItems:"center",flexWrap:"wrap"}}>
          <StatusBadge status={driver.status}/>
          {circ&&<span style={{fontSize:13,opacity:0.85,fontWeight:600}}>
            {circ.emoji} Circuit {circ.nom}
          </span>}
          {veh&&<span style={{fontSize:13,opacity:0.75}}>🚌 {veh.plaque}</span>}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:20,paddingBottom:4}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"10px 14px",borderRadius:12,border:"none",cursor:"pointer",
              fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:5,
              whiteSpace:"nowrap",flexShrink:0,
              background:tab===t.id?G.green:"#E2E8F0",
              color:tab===t.id?"#fff":G.gray}}>
            {t.label}
            {t.badge!=null&&t.badge>0&&(
              <span style={{background:tab===t.id?"rgba(255,255,255,0.3)":G.red,
                color:"#fff",borderRadius:20,padding:"1px 6px",fontSize:11,fontWeight:800}}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ════ DASHBOARD ════ */}
      {tab==="dashboard"&&(
        <div>
          {/* Stats rapides */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
            {[
              {label:"Statut",         val:driver.status==="en_service"?"En service":driver.status==="absent"?"Absent":"Disponible",
               icon:driver.status==="en_service"?"🟢":driver.status==="absent"?"🔴":"🔵",
               c:driver.status==="en_service"?G.green:driver.status==="absent"?G.red:G.blue,bg:driver.status==="en_service"?G.greenL:driver.status==="absent"?G.redL:G.blueL},
              {label:"Circuit aujourd'hui",val:circ?`${circ.emoji} ${circ.nom}`:"Non assigné",icon:"🗺️",c:G.navy,bg:"#EFF6FF"},
              {label:"Véhicule",         val:veh?.plaque||"Non assigné",               icon:"🚌",c:G.green,bg:G.greenL},
              {label:"Enfants du circuit",val:circ?.enfants_count!=null?`${circ.enfants_count} enfants`:"—",icon:"👶",c:G.purple,bg:"#EDE9FE"},
            ].map(c=>(
              <div key={c.label} style={{background:c.bg,borderRadius:16,padding:"14px 16px",border:`1px solid ${c.c}22`}}>
                <div style={{fontSize:20}}>{c.icon}</div>
                <div style={{fontSize:15,fontWeight:900,color:c.c,lineHeight:1.3,marginTop:4}}>{c.val}</div>
                <div style={{fontSize:11,color:G.gray,marginTop:2}}>{c.label}</div>
              </div>
            ))}
          </div>

          {/* Heure de service */}
          {todayLog&&(
            <div style={{background:"#fff",borderRadius:16,padding:16,marginBottom:16,
              boxShadow:"0 2px 8px rgba(0,0,0,0.06)",borderLeft:`4px solid ${G.green}`}}>
              <div style={{fontWeight:800,color:G.navy,marginBottom:8}}>⏱ Service aujourd'hui</div>
              <div style={{display:"flex",gap:16,fontSize:14}}>
                <span>Début : <strong>{hhmm(todayLog.heure_debut)}</strong></span>
                {todayLog.heure_fin&&<span>Fin : <strong>{hhmm(todayLog.heure_fin)}</strong></span>}
                {todayLog.heure_debut&&todayLog.heure_fin&&(
                  <span style={{color:G.green}}>Durée : <strong>{calcDuration(todayLog.heure_debut,todayLog.heure_fin)}</strong></span>
                )}
                {todayLog.is_replacement&&(
                  <span style={{color:G.amber}}>🔄 Remplacement</span>
                )}
              </div>
            </div>
          )}

          {/* Absences enfants du jour */}
          {todayAbsences.length>0&&(
            <div style={{background:G.amberL,borderRadius:16,padding:16,marginBottom:16,
              border:`1px solid #FDE68A`}}>
              <div style={{fontWeight:800,color:G.amber,marginBottom:10,fontSize:14}}>
                ⚠️ Modifications du jour — {todayAbsences.length} absence(s) enfants
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
                      <div style={{fontSize:11,color:G.gray,marginTop:2}}>
                        Signalé à {new Date(a.reported_at).toLocaleTimeString("fr-CH",{hour:"2-digit",minute:"2-digit"})}
                      </div>
                    </div>
                    {!confirmed?(
                      <button onClick={()=>handleConfirmerAbsence(a.id)}
                        style={{fontSize:11,padding:"5px 10px",borderRadius:8,border:`1px solid ${G.green}`,
                          background:G.greenL,color:G.greenD,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                        ✓ Lu
                      </button>
                    ):(
                      <span style={{fontSize:11,color:G.green,fontWeight:700}}>✓ Lu</span>
                    )}
                  </div>
                );
              })}
              {todayAbsences.length>5&&<p style={{fontSize:13,color:G.gray,marginTop:4}}>+{todayAbsences.length-5} autre(s)…</p>}
            </div>
          )}

          {/* Dernier message gestionnaire */}
          {messages.length>0&&(
            <div style={{background:"#fff",borderRadius:16,padding:16,marginBottom:16,
              boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
              <div style={{fontWeight:800,color:G.navy,marginBottom:8,fontSize:14}}>
                📨 Dernier message gestionnaire
              </div>
              <p style={{fontSize:14,color:"#1E293B",lineHeight:1.5}}>{messages[0].message}</p>
              <div style={{fontSize:12,color:G.gray,marginTop:6}}>{fdt(messages[0].created_at)}</div>
              {unreadMsg>0&&(
                <button onClick={()=>setTab("messages")}
                  style={{marginTop:8,fontSize:13,color:G.green,background:"none",border:"none",
                    cursor:"pointer",fontWeight:700}}>
                  Voir tous les messages ({unreadMsg} non lus) →
                </button>
              )}
            </div>
          )}

          {/* Boutons rapides */}
          <div style={{marginTop:8}}>
            {driver.status==="disponible"&&(
              <>
                <BigBtn label="🟢 Je prends mon service"   onClick={()=>setShowConfirm(true)}/>
                <BigBtn label="🔄 Je remplace un collègue" onClick={()=>setShowReplace(true)} color={G.blue}/>
                <BigBtn label="🤒 Je suis absent aujourd'hui" onClick={()=>setShowAbsence(true)} color={G.red}/>
              </>
            )}
            {driver.status==="en_service"&&(
              <BigBtn label="🔵 Je termine mon service" onClick={()=>setShowFin(true)} color={G.navy}/>
            )}
            {driver.status==="absent"&&(
              <BigBtn label="✅ Je reprends le service" onClick={()=>setShowReprise(true)}/>
            )}
          </div>
        </div>
      )}

      {/* ════ MA FICHE ════ */}
      {tab==="fiche"&&(
        <div>
          {/* Avatar + nom */}
          <div style={{background:"#fff",borderRadius:18,padding:"20px 20px 16px",
            marginBottom:16,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
            <div style={{display:"flex",gap:16,alignItems:"center",marginBottom:16}}>
              <div style={{width:64,height:64,borderRadius:"50%",
                background:`linear-gradient(135deg,${G.greenD},${G.green})`,
                color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",
                fontWeight:900,fontSize:22,flexShrink:0}}>
                {driver.photo_initials||`${driver.prenom[0]}${driver.nom[0]}`}
              </div>
              <div>
                <div style={{fontWeight:900,fontSize:20,color:G.navy}}>{driver.prenom} {driver.nom}</div>
                <div style={{marginTop:4}}><StatusBadge status={driver.status}/></div>
              </div>
            </div>
            <DL label="Affectation"    value={driver.affectation||"—"}/>
            <DL label="N° permis"      value={driver.permis||"—"}/>
            <DL label="Expiration permis" value={driver.permis_exp?fd(driver.permis_exp):"—"}/>
            <DL label="Tachygraphe"    value={driver.tachygraphe?"Oui":"Non"}/>
            <DL label="Dans l'entreprise depuis" value={fd(driver.created_at)}/>
            {driver.absence_motif&&driver.status==="absent"&&(
              <DL label="Motif absence" value={driver.absence_motif}/>
            )}
          </div>

          {/* Téléphone modifiable */}
          <div style={{background:"#fff",borderRadius:16,padding:16,marginBottom:16,
            boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{fontWeight:700,color:G.navy,fontSize:14}}>📞 Téléphone</span>
              {!editTel&&(
                <button onClick={()=>{setEditTel(true);setTelValue(driver.tel||"");}}
                  style={{fontSize:13,color:G.green,background:"none",border:"none",cursor:"pointer",fontWeight:700}}>
                  Modifier
                </button>
              )}
            </div>
            {editTel?(
              <div style={{display:"flex",gap:8}}>
                <input value={telValue} onChange={e=>setTelValue(e.target.value)}
                  placeholder="079 000 00 00" style={{...baseInp,flex:1}}/>
                <button onClick={handleSaveTel} disabled={telSaving}
                  style={{padding:"12px 16px",borderRadius:10,background:G.green,color:"#fff",
                    border:"none",fontWeight:700,cursor:"pointer"}}>
                  {telSaving?"…":"✓"}
                </button>
                <button onClick={()=>setEditTel(false)}
                  style={{padding:"12px 16px",borderRadius:10,background:G.grayL,color:G.gray,
                    border:"none",fontWeight:700,cursor:"pointer"}}>✕</button>
              </div>
            ):(
              <p style={{fontSize:16,fontWeight:700,color:"#1E293B"}}>{driver.tel||"Non renseigné"}</p>
            )}
          </div>

          {/* Circuit + véhicule */}
          {circ&&(
            <div style={{background:G.greenL,borderRadius:16,padding:16,marginBottom:16}}>
              <div style={{fontWeight:800,color:G.greenD,marginBottom:10,fontSize:14}}>
                🗺️ Circuit habituel
              </div>
              <DL label="Circuit"   value={`${circ.emoji||""} ${circ.nom||"—"}`}/>
              <DL label="École"     value={circ.cercle?.nom||"—"}/>
              <DL label="Enfants"   value={circ.enfants_count!=null?`${circ.enfants_count} enfants`:"—"}/>
              {veh&&<DL label="Véhicule" value={`${veh.plaque} — ${veh.marque} ${veh.modele}`}/>}
            </div>
          )}

          {/* Liste enfants du circuit */}
          {enfantsCircuit.length>0&&(
            <div style={{background:"#fff",borderRadius:16,padding:16,
              boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
              <div style={{fontWeight:800,color:G.navy,marginBottom:12,fontSize:14}}>
                👶 Enfants du circuit ({enfantsCircuit.length})
              </div>
              {enfantsCircuit.map(e=>(
                <div key={e.id} style={{padding:"8px 0",borderBottom:"1px solid #F1F5F9",
                  display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14,color:"#1E293B"}}>{e.prenom} {e.nom}</div>
                    {e.parent_nom&&<div style={{fontSize:12,color:G.gray}}>Parent : {e.parent_nom}</div>}
                  </div>
                  {e.parent_tel&&<span style={{fontSize:12,color:G.blue,fontWeight:600}}>{e.parent_tel}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════ MON SERVICE ════ */}
      {tab==="service"&&(
        <div>
          {/* Statut actuel */}
          <div style={{background:"#fff",borderRadius:18,padding:20,marginBottom:20,
            boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <span style={{fontWeight:800,color:G.navy,fontSize:16}}>Statut actuel</span>
              <StatusBadge status={driver.status}/>
            </div>
            {todayLog&&(
              <>
                <DL label="Prise de service"    value={hhmm(todayLog.heure_debut)}/>
                {todayLog.heure_fin&&<DL label="Fin de service" value={hhmm(todayLog.heure_fin)}/>}
                {todayLog.heure_debut&&todayLog.heure_fin&&(
                  <DL label="Durée totale" value={calcDuration(todayLog.heure_debut,todayLog.heure_fin)}/>
                )}
                {todayLog.is_replacement&&todayLog.replacement_name&&(
                  <DL label="Remplacement de" value={todayLog.replacement_name}/>
                )}
                {todayLog.circuit_id&&todayLog.circuit_id!==driver.circuit_id&&(
                  <DL label="Circuit effectué" value={todayLog.circuit_id}/>
                )}
              </>
            )}
            {!todayLog&&driver.status!=="absent"&&(
              <p style={{color:G.gray,fontSize:14}}>Aucun pointage enregistré aujourd'hui.</p>
            )}
          </div>

          {/* Situation A — Prise de service normale */}
          {driver.status==="disponible"&&!todayLog&&(
            <>
              <div style={{background:G.greenL,borderRadius:16,padding:16,marginBottom:12}}>
                <p style={{fontSize:14,fontWeight:700,color:G.greenD,marginBottom:12}}>
                  🟢 Situation A — Prise de service normale
                </p>
                {circ&&<p style={{fontSize:14,color:"#1E293B",marginBottom:8}}>
                  Vous allez prendre le circuit <strong>{circ.emoji} {circ.nom}</strong>
                  {veh&&<> avec le véhicule <strong>{veh.plaque}</strong></>}.
                </p>}
                <BigBtn label="🟢 Je prends mon service" onClick={()=>setShowConfirm(true)}/>
              </div>
              <div style={{background:G.blueL,borderRadius:16,padding:16,marginBottom:12}}>
                <p style={{fontSize:14,fontWeight:700,color:G.blue,marginBottom:12}}>
                  🔄 Situation B — Je suis remplaçant
                </p>
                <BigBtn label="🔄 Je remplace un collègue" onClick={()=>setShowReplace(true)} color={G.blue}/>
              </div>
              <div style={{background:G.redL,borderRadius:16,padding:16}}>
                <p style={{fontSize:14,fontWeight:700,color:G.red,marginBottom:12}}>
                  🤒 Situation D — Signaler une absence
                </p>
                <BigBtn label="🤒 Je suis absent aujourd'hui" onClick={()=>setShowAbsence(true)} color={G.red}/>
              </div>
            </>
          )}

          {/* Situation C — En service, peut terminer */}
          {driver.status==="en_service"&&(
            <div style={{background:"#EFF6FF",borderRadius:16,padding:16}}>
              <p style={{fontSize:14,fontWeight:700,color:G.navy,marginBottom:12}}>
                🔵 Situation C — Fin de service
              </p>
              <BigBtn label="🔵 Je termine mon service" onClick={()=>setShowFin(true)} color={G.navy}/>
            </div>
          )}

          {/* Situation E — Absent, peut reprendre */}
          {driver.status==="absent"&&(
            <>
              <div style={{background:G.redL,borderRadius:16,padding:16,marginBottom:12,
                border:`1px solid #FCA5A5`}}>
                <p style={{fontWeight:700,color:G.red,marginBottom:4}}>🤒 Absence en cours</p>
                {driver.absence_motif&&<p style={{fontSize:14,color:"#1E293B"}}>Motif : {driver.absence_motif}</p>}
              </div>
              <div style={{background:G.greenL,borderRadius:16,padding:16}}>
                <p style={{fontSize:14,fontWeight:700,color:G.greenD,marginBottom:12}}>
                  ✅ Situation E — Retour de maladie
                </p>
                <BigBtn label="✅ Je reprends le service" onClick={()=>setShowReprise(true)}/>
              </div>
            </>
          )}
        </div>
      )}

      {/* ════ SIGNALEMENTS ════ */}
      {tab==="signalements"&&(
        <div>
          {signSent&&(
            <div style={{background:G.greenL,borderRadius:14,padding:14,marginBottom:16,
              border:`1px solid #86EFAC`,fontWeight:700,color:G.greenD}}>
              ✅ Signalement envoyé — le gestionnaire a été notifié.
            </div>
          )}

          {/* Formulaire de signalement */}
          <div style={{background:"#fff",borderRadius:18,padding:20,marginBottom:20,
            boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
            <h2 style={{fontWeight:800,color:G.navy,fontSize:16,marginBottom:16}}>
              Nouveau signalement
            </h2>

            <div style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:13,fontWeight:700,color:G.gray,marginBottom:8}}>
                Type de signalement *
              </label>
              <div style={{display:"flex",flexWrap:"wrap",gap:0}}>
                {SIGN_TYPES.map(s=>(
                  <Chip key={s.v} label={`${s.e} ${s.l}`} active={signType===s.v}
                    onClick={()=>setSignType(s.v)}/>
                ))}
              </div>
            </div>

            <TA label="Description *" value={signDesc} onChange={setSignDesc}
              placeholder="Décrivez la situation…" rows={3}/>

            <div style={{marginBottom:16}}>
              <label style={{display:"block",fontSize:13,fontWeight:700,color:G.gray,marginBottom:8}}>
                Niveau d'urgence
              </label>
              <div style={{display:"flex",gap:8}}>
                <Chip label="🟢 Normal"  active={signUrgence==="normal"}  onClick={()=>setSignUrgence("normal")}  color={G.green}/>
                <Chip label="🔴 Urgent"  active={signUrgence==="urgent"}  onClick={()=>setSignUrgence("urgent")}  color={G.red}/>
              </div>
            </div>

            <BigBtn label="📤 Envoyer au gestionnaire"
              onClick={handleEnvoyerSignalement}
              disabled={!signType||!signDesc.trim()}
              color={signUrgence==="urgent"?G.red:G.green}/>
          </div>

          {/* Signalements récents */}
          {incidents.length>0&&(
            <div>
              <h2 style={{fontWeight:800,color:G.navy,fontSize:15,marginBottom:12}}>
                Mes signalements récents
              </h2>
              {incidents.map(inc=>{
                const stype=SIGN_TYPES.find(s=>s.v===inc.type);
                const statusMap:{[k:string]:{l:string;c:string;bg:string}}={
                  en_attente:{l:"En attente de réponse",c:G.amber,bg:G.amberL},
                  en_cours:  {l:"Pris en charge",       c:G.blue, bg:G.blueL},
                  resolu:    {l:"Résolu",                c:G.green,bg:G.greenL},
                };
                const st=statusMap[inc.status]||statusMap.en_attente;
                return(
                  <div key={inc.id} style={{background:"#fff",borderRadius:16,padding:16,
                    marginBottom:12,boxShadow:"0 2px 8px rgba(0,0,0,0.06)",
                    borderLeft:`4px solid ${st.c}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",
                      alignItems:"flex-start",marginBottom:8,gap:8}}>
                      <div>
                        <span style={{fontWeight:800,fontSize:14,color:G.navy}}>
                          {stype?.e||"⚡"} {stype?.l||inc.type}
                        </span>
                        <span style={{display:"inline-block",marginLeft:8,padding:"2px 8px",
                          borderRadius:20,fontSize:11,fontWeight:700,background:st.bg,color:st.c}}>
                          {st.l}
                        </span>
                      </div>
                      <span style={{fontSize:12,color:G.gray,whiteSpace:"nowrap"}}>
                        {new Date(inc.reported_at).toLocaleDateString("fr-CH")}
                      </span>
                    </div>
                    <p style={{fontSize:14,color:"#1E293B",lineHeight:1.5,marginBottom:inc.response?8:0}}>
                      {inc.description}
                    </p>
                    {inc.response&&(
                      <div style={{background:G.greenL,borderRadius:10,padding:"10px 12px",
                        fontSize:13,color:G.greenD,fontWeight:600}}>
                        💬 Réponse gestionnaire : {inc.response}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════ MESSAGES ════ */}
      {tab==="messages"&&(
        <div>
          {/* Intro */}
          <p style={{fontSize:13,color:G.gray,marginBottom:16}}>
            Messages du gestionnaire, réponses à vos signalements et absences de votre circuit.
          </p>

          {/* ── Section 1 : Messages gestionnaire ── */}
          <div style={{marginBottom:24}}>
            <div style={{fontWeight:800,fontSize:13,color:G.navy,textTransform:"uppercase",
              letterSpacing:0.5,marginBottom:12}}>
              📨 Messages du gestionnaire
              {unreadMsg>0&&<span style={{marginLeft:8,background:G.red,color:"#fff",
                borderRadius:99,padding:"2px 7px",fontSize:11}}>{unreadMsg} non lu(s)</span>}
            </div>
            {messages.length===0?(
              <div style={{background:G.grayL,borderRadius:14,padding:"18px 16px",
                textAlign:"center",color:G.gray,fontSize:14}}>
                Aucun message du gestionnaire
              </div>
            ):messages.map(m=>{
              const isNew=!m.read;
              const sev=m.severity;
              const c=sev==="critique"?G.red:sev==="haute"?G.amber:G.navy;
              const bg=sev==="critique"?G.redL:sev==="haute"?G.amberL:"#EFF6FF";
              return(
                <div key={m.id} style={{background:isNew?"#fff":G.grayL,borderRadius:16,
                  padding:16,marginBottom:10,
                  boxShadow:isNew?"0 2px 8px rgba(0,0,0,0.06)":"none",
                  borderLeft:`4px solid ${isNew?c:G.grayB}`,opacity:isNew?1:0.75}}>
                  <div style={{display:"flex",justifyContent:"space-between",
                    alignItems:"flex-start",marginBottom:8,gap:8,flexWrap:"wrap"}}>
                    <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                      {isNew&&<span style={{width:8,height:8,borderRadius:"50%",
                        background:c,display:"inline-block",flexShrink:0}}/>}
                      <span style={{fontSize:11,fontWeight:700,color:isNew?c:G.gray,
                        background:isNew?bg:"transparent",borderRadius:99,
                        padding:isNew?"2px 8px":"0"}}>
                        {sev==="critique"?"🔴 Critique":sev==="haute"?"🟠 Important":"🔵 Info"}
                      </span>
                    </div>
                    <span style={{fontSize:12,color:G.gray}}>{fdt(m.created_at)}</span>
                  </div>
                  <p style={{fontSize:14,color:"#1E293B",lineHeight:1.5,
                    fontWeight:isNew?600:400,marginBottom:isNew?10:0}}>
                    {m.message}
                  </p>
                  {isNew&&(
                    <button onClick={()=>handleMarquerLu(m)} style={{
                      fontSize:12,padding:"6px 12px",borderRadius:8,
                      border:`1px solid ${G.green}`,background:G.greenL,
                      color:G.greenD,fontWeight:700,cursor:"pointer"}}>
                      Lu ✓
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Section 2 : Réponses à mes signalements ── */}
          {incWithResponse.length>0&&(
            <div style={{marginBottom:24}}>
              <div style={{fontWeight:800,fontSize:13,color:G.navy,textTransform:"uppercase",
                letterSpacing:0.5,marginBottom:12}}>
                💬 Réponses à mes signalements
              </div>
              {incWithResponse.map(inc=>{
                const stype=SIGN_TYPES.find(s=>s.v===inc.type);
                return(
                  <div key={inc.id} style={{background:"#fff",borderRadius:16,padding:16,
                    marginBottom:10,boxShadow:"0 2px 8px rgba(0,0,0,0.06)",
                    borderLeft:`4px solid ${G.green}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",
                      alignItems:"flex-start",marginBottom:8,gap:8,flexWrap:"wrap"}}>
                      <span style={{fontWeight:700,fontSize:14,color:G.navy}}>
                        {stype?.e||"⚡"} {stype?.l||inc.type}
                      </span>
                      <span style={{fontSize:12,color:G.gray}}>
                        {new Date(inc.reported_at).toLocaleDateString("fr-CH")}
                      </span>
                    </div>
                    <p style={{fontSize:13,color:"#475569",marginBottom:10,lineHeight:1.4}}>
                      Votre signalement : {inc.description}
                    </p>
                    <div style={{background:G.greenL,borderRadius:10,padding:"10px 12px",
                      fontSize:14,color:G.greenD,fontWeight:600,lineHeight:1.5}}>
                      💬 Réponse : {inc.response}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Section 3 : Absences enfants du circuit (30 jours) ── */}
          {absences.length>0&&(
            <div>
              <div style={{fontWeight:800,fontSize:13,color:G.navy,textTransform:"uppercase",
                letterSpacing:0.5,marginBottom:12}}>
                👶 Absences de mon circuit — 30 derniers jours
              </div>
              {absences.map(a=>{
                const enf=(a.enfant as{prenom?:string;nom?:string}|undefined);
                const isToday=a.date_absence===todayISO();
                return(
                  <div key={a.id} style={{background:isToday?"#fff":G.grayL,borderRadius:14,
                    padding:"12px 14px",marginBottom:8,
                    boxShadow:isToday?"0 1px 4px rgba(0,0,0,0.06)":"none",
                    borderLeft:`3px solid ${isToday?G.amber:G.grayB}`,
                    opacity:isToday?1:0.8}}>
                    <div style={{display:"flex",justifyContent:"space-between",
                      alignItems:"flex-start",gap:8}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:14,color:"#1E293B"}}>
                          {enf?.prenom} {enf?.nom}
                          {isToday&&<span style={{marginLeft:8,fontSize:11,fontWeight:700,
                            color:G.amber,background:G.amberL,borderRadius:99,padding:"2px 7px"}}>
                            Aujourd'hui
                          </span>}
                        </div>
                        <div style={{fontSize:13,color:G.gray,marginTop:2}}>{a.reason}</div>
                      </div>
                      <span style={{fontSize:12,color:G.gray,whiteSpace:"nowrap"}}>
                        {new Date(a.date_absence).toLocaleDateString("fr-CH",{day:"2-digit",month:"2-digit"})}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {messages.length===0&&incWithResponse.length===0&&absences.length===0&&(
            <div style={{textAlign:"center",padding:"60px 20px",color:G.gray}}>
              <div style={{fontSize:48}}>📭</div>
              <p style={{fontWeight:700,marginTop:12}}>Aucun message</p>
            </div>
          )}
        </div>
      )}

      {/* ════ HISTORIQUE ════ */}
      {tab==="historique"&&(
        <HistoriqueView
          histLogs={histLogs}
          incidents={incidents}
          allYears={allYears}
          histYear={histYear}
          setHistYear={setHistYear}
          histMonth={histMonth}
          setHistMonth={setHistMonth}
          logsForYear={logsForYear}
          logsForYearMonth={logsForYearMonth}
          calcDuration={calcDuration}
        />
      )}

      {/* ════ MODALS ════ */}

      {/* Prise de service */}
      {showConfirm&&(
        <BSheet title="Confirmer la prise de service" onClose={()=>setShowConfirm(false)}>
          <div style={{background:G.greenL,borderRadius:14,padding:16,marginBottom:20}}>
            {circ&&<p style={{fontSize:15,color:"#1E293B",lineHeight:1.6,fontWeight:600}}>
              Vous prenez le circuit <strong>{circ.emoji} {circ.nom}</strong>
              {veh&&<> avec le véhicule <strong>{veh.plaque} — {veh.marque} {veh.modele}</strong></>}.<br/>
              Heure enregistrée automatiquement.
            </p>}
            {!circ&&<p style={{fontSize:14,color:G.gray}}>Aucun circuit assigné. Contactez le gestionnaire.</p>}
          </div>
          <BigBtn label="✅ Confirmer la prise de service" onClick={handlePrendreService} disabled={!circ}/>
          <BigBtn label="Annuler" onClick={()=>setShowConfirm(false)} color={G.gray} outline/>
        </BSheet>
      )}

      {/* Remplacement */}
      {showReplace&&(
        <BSheet title="Je remplace un collègue" onClose={()=>setShowReplace(false)}>
          <Inp label="Nom du conducteur remplacé" value={replRemplace}
            onChange={setReplRemplace} placeholder="ex: Jean Dupont"/>
          <Inp label="Circuit effectué" value={replCircuit}
            onChange={setReplCircuit} placeholder="ex: C007 / Chat"/>
          <Inp label="Plaque du véhicule utilisé" value={replVehicle}
            onChange={setReplVehicle} placeholder="ex: FR 80058"/>
          <BigBtn label="🔄 Confirmer le remplacement"
            onClick={handleRemplacerService}
            disabled={!replRemplace.trim()||!replCircuit.trim()}/>
          <BigBtn label="Annuler" onClick={()=>setShowReplace(false)} color={G.gray} outline/>
        </BSheet>
      )}

      {/* Fin de service */}
      {showFin&&(
        <BSheet title="Terminer le service" onClose={()=>setShowFin(false)}>
          <div style={{background:"#EFF6FF",borderRadius:14,padding:16,marginBottom:20}}>
            <p style={{fontSize:15,color:"#1E293B",fontWeight:600,lineHeight:1.6}}>
              Heure de fin enregistrée automatiquement.<br/>
              {todayLog?.heure_debut&&(
                <>Vous avez commencé à <strong>{hhmm(todayLog.heure_debut)}</strong>.</>
              )}
            </p>
          </div>
          <BigBtn label="🔵 Terminer le service" onClick={handleTerminerService} color={G.navy}/>
          <BigBtn label="Annuler" onClick={()=>setShowFin(false)} color={G.gray} outline/>
        </BSheet>
      )}

      {/* Absence */}
      {showAbsence&&(
        <BSheet title="Signaler mon absence" onClose={()=>setShowAbsence(false)}>
          <div style={{marginBottom:14}}>
            <label style={{display:"block",fontSize:13,fontWeight:700,color:G.gray,marginBottom:8}}>
              Motif *
            </label>
            <div>
              {["Maladie","Congé","Urgence personnelle","Formation","Autre"].map(m=>(
                <Chip key={m} label={m} active={absMotif===m} onClick={()=>setAbsMotif(m)} color={G.red}/>
              ))}
            </div>
          </div>
          <TA label="Informations complémentaires (optionnel)" value={absNotes}
            onChange={setAbsNotes} rows={2} placeholder="Précisions éventuelles…"/>
          <div style={{background:G.redL,borderRadius:10,padding:12,marginBottom:16,
            fontSize:13,color:G.red,fontWeight:600}}>
            ⚠️ Le gestionnaire sera notifié immédiatement.
            Votre circuit sera marqué "Non couvert".
          </div>
          <BigBtn label="🤒 Confirmer mon absence" onClick={handleSignalerAbsence}
            disabled={!absMotif} color={G.red}/>
          <BigBtn label="Annuler" onClick={()=>setShowAbsence(false)} color={G.gray} outline/>
        </BSheet>
      )}

      {/* Reprise */}
      {showReprise&&(
        <BSheet title="Reprendre le service" onClose={()=>setShowReprise(false)}>
          <div style={{background:G.greenL,borderRadius:14,padding:16,marginBottom:20}}>
            <p style={{fontSize:15,color:"#1E293B",fontWeight:600}}>
              Votre statut repassera à "Disponible".<br/>
              Le gestionnaire sera notifié.
            </p>
          </div>
          <BigBtn label="✅ Je reprends le service" onClick={handleRepriseService}/>
          <BigBtn label="Annuler" onClick={()=>setShowReprise(false)} color={G.gray} outline/>
        </BSheet>
      )}

    </div>
  );
}

// ── Historique (extrait en sous-composant pour clarté) ────────────────────────

const SCHOOL_MONTHS_ORDER=[9,10,11,12,1,2,3,4,5,6,7,8];
const MON_NAMES=["","Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

function HistoriqueView({histLogs,incidents,allYears,histYear,setHistYear,histMonth,setHistMonth,logsForYear,logsForYearMonth,calcDuration}:{
  histLogs:ServiceLog[];incidents:Incident[];allYears:number[];
  histYear:number|null;setHistYear:(y:number|null)=>void;
  histMonth:number|null;setHistMonth:(m:number|null)=>void;
  logsForYear:(y:number)=>ServiceLog[];
  logsForYearMonth:(y:number,m:number)=>ServiceLog[];
  calcDuration:(a?:string,b?:string)=>string;
}){
  const currentSY=schoolYearStart(new Date());
  const hhmm=(d?:string|null)=>{
    if(!d)return"—";
    const t=d.includes("T")?new Date(d):new Date(`1970-01-01T${d}`);
    return t.toLocaleTimeString("fr-CH",{hour:"2-digit",minute:"2-digit"});
  };

  // Niveau 3 : détail d'un mois
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
            background:"none",border:"none",cursor:"pointer",color:G.green,fontWeight:700,fontSize:14,padding:0}}>
          ← {MON_NAMES[histMonth]} {histYear}-{histYear+1}
        </button>
        {/* Totaux */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          {[
            {label:"Jours travaillés",val:worked,     c:G.green},
            {label:"Jours remplaçant",val:repl,       c:G.blue},
            {label:"Jours absents",   val:absent,     c:G.red},
            {label:"Total heures",    val:totalH,     c:G.navy},
          ].map(s=>(
            <div key={s.label} style={{background:"#fff",borderRadius:14,padding:"12px 14px",
              boxShadow:"0 1px 4px rgba(0,0,0,0.06)",borderLeft:`3px solid ${s.c}`}}>
              <div style={{fontSize:20,fontWeight:900,color:s.c}}>{s.val}</div>
              <div style={{fontSize:11,color:G.gray,marginTop:2}}>{s.label}</div>
            </div>
          ))}
        </div>
        <button onClick={()=>window.print()}
          style={{padding:"10px 16px",borderRadius:10,border:`1px solid ${G.green}`,
            background:G.greenL,color:G.greenD,fontWeight:700,fontSize:13,cursor:"pointer",marginBottom:16}}>
          🖨️ Télécharger ce mois PDF
        </button>
        {/* Détail jours */}
        {logs.length===0?(
          <div style={{textAlign:"center",padding:"32px 20px",color:G.gray}}>
            <div style={{fontSize:40}}>📭</div>
            <p style={{fontWeight:700,marginTop:10}}>Aucun service ce mois</p>
          </div>
        ):logs.map(l=>(
          <div key={l.id} style={{background:"#fff",borderRadius:14,padding:"12px 14px",
            marginBottom:10,boxShadow:"0 1px 4px rgba(0,0,0,0.04)",
            borderLeft:`3px solid ${l.status==="absent"?G.red:l.is_replacement?G.blue:G.green}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontWeight:800,fontSize:14,color:"#1E293B"}}>
                  {new Date(l.date_service).toLocaleDateString("fr-CH",{weekday:"short",day:"numeric",month:"short"})}
                </div>
                <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap"}}>
                  {l.is_replacement&&(
                    <span style={{fontSize:11,fontWeight:700,color:G.blue,background:G.blueL,
                      borderRadius:99,padding:"2px 7px"}}>🔄 Remplacement</span>
                  )}
                  {l.status==="absent"&&(
                    <span style={{fontSize:11,fontWeight:700,color:G.red,background:G.redL,
                      borderRadius:99,padding:"2px 7px"}}>🤒 Absent</span>
                  )}
                  {l.status!=="absent"&&!l.is_replacement&&(
                    <span style={{fontSize:11,fontWeight:700,color:G.greenD,background:G.greenL,
                      borderRadius:99,padding:"2px 7px"}}>✅ Service effectué</span>
                  )}
                </div>
              </div>
              <div style={{textAlign:"right",fontSize:13,color:G.gray}}>
                {l.heure_debut&&<div>{hhmm(l.heure_debut)} → {hhmm(l.heure_fin)}</div>}
                {l.heure_debut&&l.heure_fin&&(
                  <div style={{fontWeight:700,color:G.navy}}>{calcDuration(l.heure_debut,l.heure_fin)}</div>
                )}
              </div>
            </div>
            {l.replacement_name&&(
              <div style={{fontSize:12,color:G.gray,marginTop:4}}>Remplace : {l.replacement_name}</div>
            )}
          </div>
        ))}

        {/* ── Signalements du mois ── */}
        {(()=>{
          const monthIncs=incidents.filter(inc=>{
            const d=new Date(inc.reported_at);
            return d.getMonth()+1===histMonth&&(
              d.getMonth()>=8?d.getFullYear()===histYear:d.getFullYear()===histYear+1
            );
          });
          if(monthIncs.length===0)return null;
          const statusMap:{[k:string]:{l:string;c:string;bg:string}}={
            en_attente:{l:"En attente",c:G.amber,bg:G.amberL},
            en_cours:  {l:"Traité",    c:G.blue, bg:G.blueL},
            resolu:    {l:"Résolu",    c:G.green,bg:G.greenL},
          };
          return(
            <div style={{marginTop:20}}>
              <div style={{fontWeight:800,fontSize:13,color:G.navy,textTransform:"uppercase",
                letterSpacing:0.5,marginBottom:12}}>
                ⚡ Signalements ({monthIncs.length})
              </div>
              {monthIncs.map(inc=>{
                const stype=SIGN_TYPES.find(s=>s.v===inc.type);
                const st=statusMap[inc.status]||statusMap.en_attente;
                return(
                  <div key={inc.id} style={{background:"#fff",borderRadius:12,padding:"12px 14px",
                    marginBottom:8,borderLeft:`3px solid ${st.c}`,
                    boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",
                      alignItems:"flex-start",gap:8,marginBottom:6}}>
                      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                        <span style={{fontWeight:700,fontSize:13,color:"#1E293B"}}>
                          {stype?.e||"⚡"} {stype?.l||inc.type}
                        </span>
                        <span style={{fontSize:11,fontWeight:700,color:st.c,
                          background:st.bg,borderRadius:99,padding:"2px 7px"}}>
                          {st.l}
                        </span>
                      </div>
                      <span style={{fontSize:11,color:G.gray,whiteSpace:"nowrap"}}>
                        {new Date(inc.reported_at).toLocaleDateString("fr-CH",{day:"2-digit",month:"2-digit"})}
                      </span>
                    </div>
                    <p style={{fontSize:13,color:"#475569",lineHeight:1.4,marginBottom:inc.response?8:0}}>
                      {inc.description}
                    </p>
                    {inc.response&&(
                      <div style={{background:G.greenL,borderRadius:8,padding:"8px 10px",
                        fontSize:12,color:G.greenD,fontWeight:600}}>
                        💬 {inc.response}
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

  // Niveau 2 : mois d'une année
  if(histYear!==null){
    const yLogs=logsForYear(histYear);
    return(
      <div>
        <button onClick={()=>setHistYear(null)}
          style={{display:"flex",alignItems:"center",gap:6,marginBottom:16,
            background:"none",border:"none",cursor:"pointer",color:G.green,fontWeight:700,fontSize:14,padding:0}}>
          ← Années scolaires
        </button>
        <h2 style={{fontWeight:900,color:G.navy,fontSize:18,marginBottom:16}}>
          {histYear}-{histYear+1}
          {histYear===currentSY&&" ⭐ (en cours)"}
        </h2>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          {[
            {label:"Jours travaillés",val:yLogs.filter(l=>l.status!=="absent").length,c:G.green},
            {label:"Jours absents",   val:yLogs.filter(l=>l.status==="absent").length,c:G.red},
          ].map(s=>(
            <div key={s.label} style={{background:"#fff",borderRadius:14,padding:"12px 14px",
              boxShadow:"0 1px 4px rgba(0,0,0,0.06)",borderLeft:`3px solid ${s.c}`}}>
              <div style={{fontSize:22,fontWeight:900,color:s.c}}>{s.val}</div>
              <div style={{fontSize:11,color:G.gray,marginTop:2}}>{s.label}</div>
            </div>
          ))}
        </div>
        <div>
          {SCHOOL_MONTHS_ORDER.map(mon=>{
            const mLogs=logsForYearMonth(histYear,mon);
            if(mLogs.length===0&&!(histYear===currentSY&&mon<=new Date().getMonth()+1))return null;
            const worked=mLogs.filter(l=>l.status!=="absent").length;
            const absent=mLogs.filter(l=>l.status==="absent").length;
            return(
              <button key={mon} onClick={()=>setHistMonth(mon)}
                style={{width:"100%",display:"flex",justifyContent:"space-between",
                  alignItems:"center",padding:"14px 16px",borderRadius:14,
                  background:"#fff",border:`1px solid ${G.grayB}`,cursor:"pointer",
                  marginBottom:8,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                <span style={{fontWeight:700,color:"#1E293B",fontSize:14}}>
                  {MON_NAMES[mon]}
                </span>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  {worked>0&&<span style={{fontSize:12,color:G.green,fontWeight:700}}>✅ {worked}j</span>}
                  {absent>0&&<span style={{fontSize:12,color:G.red,fontWeight:700}}>🤒 {absent}j</span>}
                  {mLogs.length===0&&<span style={{fontSize:12,color:G.gray}}>—</span>}
                  <span style={{color:G.green,fontSize:16}}>→</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Niveau 1 : années scolaires
  return(
    <div>
      <h2 style={{fontWeight:900,color:G.navy,fontSize:18,marginBottom:16}}>📊 Mon historique</h2>
      {histLogs.length===0?(
        <div style={{textAlign:"center",padding:"60px 20px",color:G.gray}}>
          <div style={{fontSize:48}}>📋</div>
          <p style={{fontWeight:700,marginTop:12}}>Aucun historique disponible</p>
        </div>
      ):(
        <>
          <button onClick={()=>window.print()}
            style={{padding:"10px 16px",borderRadius:10,border:`1px solid ${G.green}`,
              background:G.greenL,color:G.greenD,fontWeight:700,fontSize:13,cursor:"pointer",marginBottom:16}}>
            🖨️ Télécharger mon historique PDF
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
                  border:`2px solid ${isCurrent?G.navy:G.grayB}`,cursor:"pointer",
                  marginBottom:10,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
                <div style={{textAlign:"left"}}>
                  <div style={{fontWeight:900,fontSize:17,color:G.navy}}>
                    {y}-{y+1}
                    {isCurrent&&<span style={{marginLeft:8,fontSize:12,fontWeight:700,
                      color:G.green,background:G.greenL,borderRadius:99,padding:"2px 8px"}}>
                      En cours ⭐
                    </span>}
                  </div>
                  <div style={{fontSize:12,color:G.gray,marginTop:4}}>
                    {yLogs.length} entrées · {worked} jours travaillés · {absent} absences
                  </div>
                </div>
                <span style={{color:G.green,fontSize:20}}>→</span>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}

// ── Constantes ────────────────────────────────────────────────────────────────

const SIGN_TYPES=[
  {v:"panne",       e:"🔧",l:"Panne véhicule"},
  {v:"voyant",      e:"💡",l:"Voyant moteur"},
  {v:"accident",    e:"🚨",l:"Accident"},
  {v:"retard",      e:"⏰",l:"Retard"},
  {v:"degradation", e:"🪟",l:"Dégradation véhicule"},
  {v:"enfant",      e:"👶",l:"Problème enfant"},
  {v:"parent",      e:"👨‍👩‍👧",l:"Problème parent"},
  {v:"autre",       e:"❓",l:"Autre"},
];
const SIGN_LABELS:Record<string,string>=Object.fromEntries(SIGN_TYPES.map(s=>[s.v,s.l]));

