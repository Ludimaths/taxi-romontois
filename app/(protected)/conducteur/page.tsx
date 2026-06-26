"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { C, isoToday, fmtHHMM, nowTimeStr } from "@/lib/constants";
import type { Conducteur, ServiceLog, Incident, Alerte, AbsenceEnfant, Enfant, CongesDemande } from "@/lib/types";
import { Bus, Home, FileText, Activity, AlertCircle, Mail, History, CalendarDays } from "lucide-react";
import { BSheet, BigBtn, Inp, TA, Chip, StatusBadge, SIGN_LABELS, schoolYearStart } from "./tabs/shared";
import { TabDashboard } from "./tabs/Dashboard";
import { TabFiche } from "./tabs/Fiche";
import { TabService } from "./tabs/Service";
import { TabSignalements } from "./tabs/Signalements";
import { TabMessages } from "./tabs/Messages";
import { TabHistorique } from "./tabs/Historique";
import { TabConges } from "./tabs/Conges";

type Tab = "dashboard" | "fiche" | "service" | "signalements" | "messages" | "historique" | "conges";

export default function ConducteurPage(){
  const sb=createClient();

  const [driver,    setDriver]    = useState<Conducteur|null>(null);
  const [todayLog,  setTodayLog]  = useState<ServiceLog|null>(null);
  const [absences,  setAbsences]  = useState<AbsenceEnfant[]>([]);
  const [enfants,   setEnfants]   = useState<Enfant[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [messages,  setMessages]  = useState<Alerte[]>([]);
  const [histLogs,  setHistLogs]  = useState<ServiceLog[]>([]);
  const [conges,    setConges]    = useState<CongesDemande[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState<Tab>("dashboard");

  // Modals service
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [showReplace,  setShowReplace]  = useState(false);
  const [showAbsence,  setShowAbsence]  = useState(false);
  const [showReprise,  setShowReprise]  = useState(false);
  const [showFin,      setShowFin]      = useState(false);

  // Formulaire remplacement
  const [replCircuit,  setReplCircuit]  = useState("");
  const [replVehicle,  setReplVehicle]  = useState("");
  const [replRemplace, setReplRemplace] = useState("");

  // Formulaire absence
  const [absMotif, setAbsMotif] = useState("");
  const [absNotes, setAbsNotes] = useState("");

  // Téléphone
  const [editTel,   setEditTel]   = useState(false);
  const [telValue,  setTelValue]  = useState("");
  const [telSaving, setTelSaving] = useState(false);

  // Signalement
  const [signType,    setSignType]    = useState("");
  const [signDesc,    setSignDesc]    = useState("");
  const [signUrgence, setSignUrgence] = useState("normal");
  const [signSent,    setSignSent]    = useState(false);

  // Absences confirmées localement
  const [absConfirmed, setAbsConfirmed] = useState<Set<number>>(new Set());

  // ID conducteur (entier) — nécessaire pour le filtre Realtime alertes
  const [condId, setCondId] = useState<number|null>(null);

  // Changement mot de passe (première connexion)
  const [mustChangePwd,  setMustChangePwd]  = useState(false);
  const [newPwd,         setNewPwd]         = useState("");
  const [newPwdConfirm,  setNewPwdConfirm]  = useState("");
  const [pwdChangeErr,   setPwdChangeErr]   = useState("");
  const [pwdChangeBusy,  setPwdChangeBusy]  = useState(false);

  // Navigation historique
  const [histYear,  setHistYear]  = useState<number|null>(null);
  const [histMonth, setHistMonth] = useState<number|null>(null);

  // ── Chargement ───────────────────────────────────────────────────────────────
  const load=useCallback(async()=>{
    const{data:{user}}=await sb.auth.getUser();
    if(!user)return;
    const{data:prof}=await sb.from("profiles").select("conducteur_id, must_change_password").eq("id",user.id).single();
    if(!prof?.conducteur_id){setLoading(false);return;}
    const cid=prof.conducteur_id;
    setCondId(cid);
    setMustChangePwd(!!prof.must_change_password);

    const[drv,log,abs,enf,inc,msg,hist,cng]=await Promise.all([
      sb.from("conducteurs").select("*,circuit:circuits(*,cercle:cercles_scolaires(*)),vehicule:vehicules(*)")
        .eq("id",cid).single(),
      sb.from("service_logs").select("*")
        .eq("conducteur_id",cid).eq("date_service",isoToday()).maybeSingle(),
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
      sb.from("conges_demandes").select("*")
        .eq("conducteur_id",cid).order("created_at",{ascending:false}),
    ]);

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
    if(cng.data) setConges(cng.data);
    setLoading(false);
  },[sb]);

  useEffect(()=>{
    load();
    const ch=sb.channel("cond-rt")
      .on("postgres_changes",{event:"*",schema:"public",table:"absences_enfants"},load)
      .on("postgres_changes",{event:"*",schema:"public",table:"incidents"},load)
      .on("postgres_changes",{event:"*",schema:"public",table:"service_logs"},load)
      .on("postgres_changes",{event:"*",schema:"public",table:"conges_demandes"},load)
      .subscribe();
    return()=>{sb.removeChannel(ch);};
  },[load,sb]);

  // Canal séparé pour alertes avec filtre driver_id — requis car RLS integer FK
  // ne garantit pas la livraison Realtime sans filtre explicite côté client
  useEffect(()=>{
    if(!condId)return;
    const ch=sb.channel(`cond-alertes-${condId}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"alertes",
        filter:`driver_id=eq.${condId}`},load)
      .subscribe();
    return()=>{sb.removeChannel(ch);};
  },[condId,load,sb]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleChangePwd(){
    if(newPwd.length<8){setPwdChangeErr("Minimum 8 caractères");return;}
    if(newPwd!==newPwdConfirm){setPwdChangeErr("Les mots de passe ne correspondent pas");return;}
    setPwdChangeBusy(true);setPwdChangeErr("");
    const{error}=await sb.auth.updateUser({password:newPwd});
    if(error){setPwdChangeErr(error.message);setPwdChangeBusy(false);return;}
    const{data:{user}}=await sb.auth.getUser();
    if(user) await sb.from("profiles").update({must_change_password:false}).eq("id",user.id);
    setMustChangePwd(false);setNewPwd("");setNewPwdConfirm("");setPwdChangeBusy(false);
  }

  async function handlePrendreService(){
    if(!driver)return;
    const{data}=await sb.from("service_logs").insert({
      conducteur_id:driver.id,vehicule_id:driver.vehicule_id||null,
      circuit_id:driver.circuit_id||null,date_service:isoToday(),
      heure_debut:nowTimeStr(),status:"en_service",is_replacement:false,
    }).select().single();
    await sb.from("conducteurs").update({status:"en_service"}).eq("id",driver.id);
    await sb.from("alertes").insert({type:"conducteur",severity:"normale",
      message:`${driver.prenom} ${driver.nom} a pris son service à ${fmtHHMM(nowTimeStr())} — Circuit ${(driver.circuit as{nom?:string}|undefined)?.nom||"—"}`,
      read:false});
    if(data)setTodayLog(data);
    setDriver(p=>p?{...p,status:"en_service"}:p);
    setShowConfirm(false);
  }

  async function handleRemplacerService(){
    if(!driver)return;
    const{data}=await sb.from("service_logs").insert({
      conducteur_id:driver.id,vehicule_id:replVehicle||driver.vehicule_id||null,
      circuit_id:replCircuit||null,date_service:isoToday(),
      heure_debut:nowTimeStr(),status:"en_service",is_replacement:true,replacement_name:replRemplace,
    }).select().single();
    await sb.from("conducteurs").update({status:"en_service"}).eq("id",driver.id);
    await sb.from("alertes").insert({type:"conducteur",severity:"normale",
      message:`${driver.prenom} ${driver.nom} remplace ${replRemplace||"—"} sur circuit ${replCircuit} à ${fmtHHMM(nowTimeStr())}`,
      read:false});
    if(data)setTodayLog(data);
    setDriver(p=>p?{...p,status:"en_service"}:p);
    setShowReplace(false);
    setReplCircuit("");setReplVehicle("");setReplRemplace("");
  }

  async function handleTerminerService(){
    if(!driver)return;
    if(todayLog){
      await sb.from("service_logs").update({heure_fin:nowTimeStr(),status:"termine"}).eq("id",todayLog.id);
    }
    await sb.from("conducteurs").update({status:"disponible"}).eq("id",driver.id);
    await sb.from("alertes").insert({type:"conducteur",severity:"normale",
      message:`${driver.prenom} ${driver.nom} a terminé son service à ${fmtHHMM(nowTimeStr())}`,
      read:false});
    setDriver(p=>p?{...p,status:"disponible"}:p);
    setTodayLog(p=>p?{...p,heure_fin:nowTimeStr(),status:"termine"}:p);
    setShowFin(false);
  }

  async function handleSignalerAbsence(){
    if(!driver||!absMotif)return;
    const circ=driver.circuit as{nom?:string}|undefined;
    await sb.from("conducteurs").update({status:"absent",absence_motif:absMotif}).eq("id",driver.id);
    await sb.from("absences_conducteurs").insert({
      conducteur_id:driver.id,date_absence:isoToday(),
      motif:absMotif+(absNotes?` — ${absNotes}`:""),circuit_id:driver.circuit_id||null,status:"non_couvert",
    });
    await sb.from("alertes").insert({type:"conducteur",severity:"haute",
      message:`${driver.prenom} ${driver.nom} absent — Motif : ${absMotif}${absNotes?` (${absNotes})`:""}${circ?` — Circuit ${circ.nom} non couvert`:""}`,
      read:false});
    setDriver(p=>p?{...p,status:"absent",absence_motif:absMotif}:p);
    setShowAbsence(false);setAbsMotif("");setAbsNotes("");
  }

  async function handleRepriseService(){
    if(!driver)return;
    await sb.from("conducteurs").update({status:"disponible",absence_motif:null}).eq("id",driver.id);
    await sb.from("alertes").insert({type:"conducteur",severity:"normale",
      message:`${driver.prenom} ${driver.nom} reprend le service aujourd'hui`,read:false});
    setDriver(p=>p?{...p,status:"disponible",absence_motif:undefined}:p);
    setShowReprise(false);
  }

  async function handleEnvoyerSignalement(){
    if(!driver||!signType||!signDesc.trim())return;
    await sb.from("incidents").insert({
      type:signType,conducteur_id:driver.id,vehicule_id:driver.vehicule_id||null,
      circuit_id:driver.circuit_id||null,description:signDesc,status:"en_attente",
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

  async function handleEnvoyerConge(form:{date_debut:string;date_fin:string;motif:string;justification:string}){
    if(!driver)return;
    await sb.from("conges_demandes").insert({
      conducteur_id:driver.id,...form,statut:"en_attente",
    });
    await load();
  }

  async function handleSaveTel(){
    if(!driver)return;
    setTelSaving(true);
    await sb.from("conducteurs").update({tel:telValue||null}).eq("id",driver.id);
    setDriver(p=>p?{...p,tel:telValue||undefined}:p);
    setEditTel(false);setTelSaving(false);
  }

  // ── Valeurs calculées ─────────────────────────────────────────────────────────
  const circ   = driver?.circuit as{nom?:string;emoji?:string;enfants_count?:number;id?:string;cercle?:{nom?:string}}|undefined;
  const veh    = driver?.vehicule as{plaque?:string;marque?:string;modele?:string}|undefined;
  const enfantsCircuit = driver?.circuit_id ? enfants.filter(e=>e.circuit_id===driver.circuit_id) : [];
  const todayAbsences  = absences.filter(a=>a.date_absence===isoToday());
  const incWithResponse= incidents.filter(i=>i.response||i.status==="resolu");
  const unreadMsg      = messages.filter(m=>!m.read).length;
  const pendingInc     = incidents.filter(i=>i.status==="en_attente").length;

  const allYears=histLogs.length
    ? Array.from(new Set(histLogs.map(l=>schoolYearStart(new Date(l.date_service))))).sort((a,b)=>b-a)
    : [schoolYearStart(new Date())];

  const logsForYear=(y:number)=>histLogs.filter(l=>{
    const d=new Date(l.date_service);const m=d.getMonth()+1;const yr=d.getFullYear();
    if(m>=9)return yr===y;return yr===y+1;
  });
  const logsForYearMonth=(y:number,mon:number)=>logsForYear(y).filter(l=>new Date(l.date_service).getMonth()+1===mon);

  const TAB_ICONS = {
    dashboard:    <Home size={14} />,
    fiche:        <FileText size={14} />,
    service:      <Activity size={14} />,
    signalements: <AlertCircle size={14} />,
    messages:     <Mail size={14} />,
    historique:   <History size={14} />,
    conges:       <CalendarDays size={14} />,
  };
  const TABS:{id:Tab;label:string;badge?:number}[]=[
    {id:"dashboard",    label:"Dashboard"},
    {id:"fiche",        label:"Ma fiche"},
    {id:"service",      label:"Mon service"},
    {id:"signalements", label:"Signalements",badge:pendingInc||undefined},
    {id:"messages",     label:"Messages",    badge:unreadMsg||undefined},
    {id:"historique",   label:"Historique"},
    {id:"conges",       label:"Congés"},
  ];

  // ── Guards ────────────────────────────────────────────────────────────────────
  if(loading)return(
    <div style={{display:"flex",justifyContent:"center",alignItems:"center",minHeight:"60vh",color:C.gray,fontSize:15}}>
      Chargement…
    </div>
  );
  if(!driver)return(
    <div style={{textAlign:"center",padding:"60px 20px",color:C.gray}}>
      <div style={{display:"flex",justifyContent:"center",marginBottom:10}}><Bus size={48} color={C.gray400} /></div>
      <p style={{fontWeight:700,marginTop:12}}>Aucun conducteur associé à votre compte.</p>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────────
  return(
    <div style={{maxWidth:860,margin:"0 auto",paddingBottom:80}}>

      {/* Bannière d'accueil */}
      <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyL})`,
        borderRadius:18,padding:"20px 22px",color:"#fff",marginBottom:20}}>
        <div style={{display:"flex",gap:16,alignItems:"center",marginBottom:14}}>
          <div style={{width:56,height:56,borderRadius:28,background:"rgba(255,255,255,0.2)",
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:20,fontWeight:900,color:"#fff",flexShrink:0,letterSpacing:1}}>
            {(driver.prenom[0]??"").toUpperCase()}{(driver.nom[0]??"").toUpperCase()}
          </div>
          <div>
            <p style={{fontSize:12,opacity:0.7,margin:"0 0 2px"}}>Bonjour,</p>
            <h1 style={{fontSize:20,fontWeight:900,margin:0}}>{driver.prenom} {driver.nom}</h1>
          </div>
        </div>
        <p style={{fontSize:13,opacity:0.85,lineHeight:1.5,margin:"0 0 14px"}}>
          Pensez à pointer votre prise de service et votre fin de service chaque jour.
        </p>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
          <StatusBadge status={driver.status}/>
          {circ&&<span style={{fontSize:13,opacity:0.85,fontWeight:600}}>{circ.emoji} Circuit {circ.nom}</span>}
          {veh&&<span style={{fontSize:13,opacity:0.75,display:"flex",alignItems:"center",gap:4}}><Bus size={13} /> {veh.plaque}</span>}
        </div>
      </div>

      {/* Barre d'onglets */}
      <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:20,paddingBottom:4}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"10px 14px",borderRadius:12,border:"none",cursor:"pointer",
              fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:5,
              whiteSpace:"nowrap",flexShrink:0,
              background:tab===t.id?C.navy:"#E2E8F0",color:tab===t.id?"#fff":C.gray}}>
            {TAB_ICONS[t.id]} {t.label}
            {t.badge!=null&&t.badge>0&&(
              <span style={{background:tab===t.id?"rgba(255,255,255,0.3)":C.red,
                color:"#fff",borderRadius:20,padding:"1px 6px",fontSize:11,fontWeight:800}}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Contenu des onglets */}
      {tab==="dashboard"&&(
        <TabDashboard driver={driver} todayLog={todayLog} todayAbsences={todayAbsences}
          enfants={enfants} messages={messages} unreadMsg={unreadMsg} absConfirmed={absConfirmed}
          circ={circ} veh={veh}
          onSetTab={t=>setTab(t as Tab)}
          onConfirmerAbsence={handleConfirmerAbsence}
          onMarquerLu={handleMarquerLu}
          onShowConfirm={()=>setShowConfirm(true)}
          onShowReplace={()=>setShowReplace(true)}
          onShowAbsence={()=>setShowAbsence(true)}
          onShowFin={()=>setShowFin(true)}
          onShowReprise={()=>setShowReprise(true)}/>
      )}
      {tab==="fiche"&&(
        <TabFiche driver={driver} circ={circ} veh={veh} enfantsCircuit={enfantsCircuit}
          editTel={editTel} telValue={telValue} telSaving={telSaving}
          onSetEditTel={setEditTel} onSetTelValue={setTelValue} onSaveTel={handleSaveTel}/>
      )}
      {tab==="service"&&(
        <TabService driver={driver} todayLog={todayLog} circ={circ} veh={veh}
          onShowConfirm={()=>setShowConfirm(true)}
          onShowReplace={()=>setShowReplace(true)}
          onShowAbsence={()=>setShowAbsence(true)}
          onShowFin={()=>setShowFin(true)}
          onShowReprise={()=>setShowReprise(true)}/>
      )}
      {tab==="signalements"&&(
        <TabSignalements driver={driver} incidents={incidents}
          signType={signType} signDesc={signDesc} signUrgence={signUrgence} signSent={signSent}
          onSetSignType={setSignType} onSetSignDesc={setSignDesc} onSetSignUrgence={setSignUrgence}
          onEnvoyer={handleEnvoyerSignalement}/>
      )}
      {tab==="messages"&&(
        <TabMessages messages={messages} incidents={incidents} absences={absences} enfants={enfants}
          incWithResponse={incWithResponse} unreadMsg={unreadMsg}
          onMarquerLu={handleMarquerLu} onSetTab={t=>setTab(t as Tab)}/>
      )}
      {tab==="historique"&&(
        <TabHistorique histLogs={histLogs} incidents={incidents} allYears={allYears}
          histYear={histYear} setHistYear={setHistYear}
          histMonth={histMonth} setHistMonth={setHistMonth}
          logsForYear={logsForYear} logsForYearMonth={logsForYearMonth}/>
      )}
      {tab==="conges"&&(
        <TabConges conges={conges} onSend={handleEnvoyerConge}/>
      )}

      {mustChangePwd&&(
        <div style={{position:"fixed",inset:0,background:"rgba(13,59,122,0.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:C.white,borderRadius:12,padding:32,width:"100%",maxWidth:400,boxShadow:"0 8px 32px rgba(0,0,0,0.3)"}}>
            <div style={{fontSize:22,marginBottom:8}}>🔐</div>
            <h2 style={{margin:"0 0 8px",fontSize:18,color:C.navy,fontWeight:700}}>Changement de mot de passe requis</h2>
            <p style={{margin:"0 0 20px",fontSize:14,color:C.gray600,lineHeight:1.5}}>
              Pour des raisons de sécurité, définissez votre propre mot de passe avant d&apos;accéder à votre compte.
            </p>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12,color:C.gray600,marginBottom:4,fontWeight:600}}>Nouveau mot de passe</div>
              <input type="password" value={newPwd} onChange={e=>setNewPwd(e.target.value)}
                placeholder="Minimum 8 caractères"
                style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1.5px solid ${C.gray200}`,fontSize:14,boxSizing:"border-box"}}/>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,color:C.gray600,marginBottom:4,fontWeight:600}}>Confirmer le mot de passe</div>
              <input type="password" value={newPwdConfirm} onChange={e=>setNewPwdConfirm(e.target.value)}
                placeholder="Répétez le mot de passe"
                style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1.5px solid ${C.gray200}`,fontSize:14,boxSizing:"border-box"}}/>
            </div>
            {pwdChangeErr&&<div style={{color:C.red,fontSize:13,marginBottom:12}}>{pwdChangeErr}</div>}
            <button onClick={handleChangePwd} disabled={pwdChangeBusy}
              style={{width:"100%",padding:"12px",background:C.navy,color:C.white,borderRadius:8,border:"none",fontSize:15,fontWeight:700,cursor:pwdChangeBusy?"not-allowed":"pointer",opacity:pwdChangeBusy?0.7:1}}>
              {pwdChangeBusy?"Enregistrement...":"Confirmer le mot de passe"}
            </button>
          </div>
        </div>
      )}

      {/* ── Modals ── */}

      {showConfirm&&(
        <BSheet title="Confirmer la prise de service" onClose={()=>setShowConfirm(false)}>
          <div style={{background:C.greenL,borderRadius:14,padding:16,marginBottom:20}}>
            {circ?<p style={{fontSize:15,color:"#1E293B",lineHeight:1.6,fontWeight:600}}>
              Vous prenez le circuit <strong>{circ.emoji} {circ.nom}</strong>
              {veh&&<> avec le véhicule <strong>{veh.plaque} — {veh.marque} {veh.modele}</strong></>}.<br/>
              Heure enregistrée automatiquement.
            </p>:<p style={{fontSize:14,color:C.gray}}>Aucun circuit assigné. Contactez le gestionnaire.</p>}
          </div>
          <BigBtn label="Confirmer la prise de service" onClick={handlePrendreService} disabled={!circ}/>
          <BigBtn label="Annuler" onClick={()=>setShowConfirm(false)} color={C.gray} outline/>
        </BSheet>
      )}

      {showReplace&&(
        <BSheet title="Je remplace un collègue" onClose={()=>setShowReplace(false)}>
          <Inp label="Nom du conducteur remplacé" value={replRemplace} onChange={setReplRemplace} placeholder="ex: Jean Dupont"/>
          <Inp label="Circuit effectué"            value={replCircuit}  onChange={setReplCircuit}  placeholder="ex: C007 / Chat"/>
          <Inp label="Plaque du véhicule utilisé" value={replVehicle}  onChange={setReplVehicle}  placeholder="ex: FR 80058"/>
          <BigBtn label="Confirmer le remplacement" onClick={handleRemplacerService}
            disabled={!replRemplace.trim()||!replCircuit.trim()}/>
          <BigBtn label="Annuler" onClick={()=>setShowReplace(false)} color={C.gray} outline/>
        </BSheet>
      )}

      {showFin&&(
        <BSheet title="Terminer le service" onClose={()=>setShowFin(false)}>
          <div style={{background:"#EFF6FF",borderRadius:14,padding:16,marginBottom:20}}>
            <p style={{fontSize:15,color:"#1E293B",fontWeight:600,lineHeight:1.6}}>
              Heure de fin enregistrée automatiquement.<br/>
              {todayLog?.heure_debut&&<>Vous avez commencé à <strong>{fmtHHMM(todayLog.heure_debut)}</strong>.</>}
            </p>
          </div>
          <BigBtn label="Terminer le service" onClick={handleTerminerService} color={C.navy}/>
          <BigBtn label="Annuler" onClick={()=>setShowFin(false)} color={C.gray} outline/>
        </BSheet>
      )}

      {showAbsence&&(
        <BSheet title="Signaler mon absence" onClose={()=>setShowAbsence(false)}>
          <div style={{marginBottom:14}}>
            <label style={{display:"block",fontSize:13,fontWeight:700,color:C.gray,marginBottom:8}}>Motif *</label>
            <div>
              {["Maladie","Congé","Urgence personnelle","Formation","Autre"].map(m=>(
                <Chip key={m} label={m} active={absMotif===m} onClick={()=>setAbsMotif(m)} color={C.red}/>
              ))}
            </div>
          </div>
          <TA label="Informations complémentaires (optionnel)" value={absNotes} onChange={setAbsNotes}
            rows={2} placeholder="Précisions éventuelles…"/>
          <div style={{background:C.redL,borderRadius:10,padding:12,marginBottom:16,fontSize:13,color:C.red,fontWeight:600}}>
            Le gestionnaire sera notifié immédiatement. Votre circuit sera marqué "Non couvert".
          </div>
          <BigBtn label="Confirmer mon absence" onClick={handleSignalerAbsence} disabled={!absMotif} color={C.red}/>
          <BigBtn label="Annuler" onClick={()=>setShowAbsence(false)} color={C.gray} outline/>
        </BSheet>
      )}

      {showReprise&&(
        <BSheet title="Reprendre le service" onClose={()=>setShowReprise(false)}>
          <div style={{background:C.greenL,borderRadius:14,padding:16,marginBottom:20}}>
            <p style={{fontSize:15,color:"#1E293B",fontWeight:600}}>
              Votre statut repassera à "Disponible".<br/>Le gestionnaire sera notifié.
            </p>
          </div>
          <BigBtn label="Je reprends le service" onClick={handleRepriseService}/>
          <BigBtn label="Annuler" onClick={()=>setShowReprise(false)} color={C.gray} outline/>
        </BSheet>
      )}

    </div>
  );
}
