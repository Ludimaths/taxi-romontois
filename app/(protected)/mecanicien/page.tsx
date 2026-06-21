"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Vehicule, Reparation, Alerte } from "@/lib/types";

type Tab = "dashboard" | "alertes" | "en_reparation" | "terminees" | "historique";

const M = {
  navy:"#0D3B7A", green:"#16A34A", amber:"#D97706",
  red:"#DC2626",  blue:"#3B82F6",  purple:"#7C3AED", gray:"#64748B",
};

const BUDGET_INTERVENTION = 1000;
const KM_ALERTE = 200_000;

const VS: Record<string,{l:string;e:string;c:string;bg:string}> = {
  en_service:       {l:"En service",        e:"✅",c:M.green,  bg:"#DCFCE7"},
  receptionne:      {l:"Réceptionné",       e:"👁️",c:M.blue,   bg:"#DBEAFE"},
  en_attente_piece: {l:"Attente pièce",     e:"⏳",c:M.amber,  bg:"#FEF9C3"},
  en_reparation:    {l:"En réparation",     e:"🔧",c:M.navy,   bg:"#EFF6FF"},
  repare:           {l:"Réparé",            e:"✔️",c:M.purple, bg:"#EDE9FE"},
  attention:        {l:"Attention requise", e:"⚠️",c:M.red,    bg:"#FEF2F2"},
};

const RS: Record<string,{l:string;c:string}> = {
  receptionne:           {l:"Réceptionné",           c:M.blue},
  en_attente_validation: {l:"Attente validation",    c:M.amber},
  en_attente_piece:      {l:"Attente pièce",         c:M.amber},
  en_reparation:         {l:"En réparation",         c:M.navy},
  repare:                {l:"Réparé",                c:M.purple},
  remis_en_circulation:  {l:"Remis en circulation",  c:M.green},
  annulee:               {l:"Annulée",               c:M.gray},
};

const URGENCES = [
  {v:"normal",     l:"🟢 Normal"},
  {v:"urgent",     l:"🟡 Urgent"},
  {v:"tres_urgent",l:"🟠 Très urgent"},
  {v:"bloquant",   l:"🔴 Bloquant (véhicule immobilisé)"},
];

const TYPE_LABELS: Record<string,string> = {
  vehicule:"Véhicule", reparation:"Réparation",
  validation_requise:"Validation requise",
  remise_circulation:"Remise en service",
  transmis_meca:"Incident transmis",
};

const fd = (d?:string|null) => d ? new Date(d).toLocaleDateString("fr-CH") : "—";
const todayStr = () => new Date().toISOString().slice(0,10);
function nbJours(a:string,b:string){return Math.round((+new Date(b)-+new Date(a))/86400000);}
function ctCheck(ct?:string|null):{label:string;c:string}|null {
  if (!ct) return null;
  const [mm,yy]=ct.split(".");
  if (!mm||!yy) return null;
  const exp=new Date(+yy,+mm-1,1),now=new Date(),in3m=new Date();
  in3m.setMonth(now.getMonth()+3);
  if (exp<now)  return {label:`CT expiré (${ct})`,c:M.red};
  if (exp<in3m) return {label:`CT bientôt (${ct})`,c:M.amber};
  return null;
}

// ── Micro-components ──────────────────────────────────────────────────────────

function VBadge({s}:{s:string}) {
  const v=VS[s]; if (!v) return null;
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",
      borderRadius:20,fontSize:12,fontWeight:700,background:v.bg,color:v.c}}>
      {v.e} {v.l}
    </span>
  );
}

function RBadge({s}:{s:string}) {
  const r=RS[s]; if (!r) return null;
  return (
    <span style={{padding:"3px 10px",borderRadius:20,fontSize:12,fontWeight:700,
      background:"#F1F5F9",color:r.c}}>● {r.l}</span>
  );
}

function BSheet({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}) {
  return (
    <div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"flex-end",
      background:"rgba(0,0,0,0.55)"}} onClick={onClose}>
      <div style={{width:"100%",maxHeight:"93vh",overflowY:"auto",background:"#fff",
        borderRadius:"20px 20px 0 0",padding:"20px 20px 48px"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{fontSize:18,fontWeight:800,color:M.navy}}>{title}</h2>
          <button onClick={onClose} style={{fontSize:26,background:"none",border:"none",
            cursor:"pointer",color:M.gray,lineHeight:1}}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const baseInp: React.CSSProperties = {
  width:"100%",padding:"11px 14px",borderRadius:10,
  border:"1px solid #CBD5E1",fontSize:15,color:"#1E293B",background:"#fff",
};

function Inp({label,type="text",value,onChange,placeholder="",required=false}:{
  label:string;type?:string;value:string;onChange:(v:string)=>void;
  placeholder?:string;required?:boolean;
}) {
  return (
    <div style={{marginBottom:14}}>
      <label style={{display:"block",fontSize:13,fontWeight:700,color:M.gray,marginBottom:5}}>
        {label}{required&&<span style={{color:M.red}}> *</span>}
      </label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder} style={baseInp}/>
    </div>
  );
}

function TA({label,value,onChange,rows=3,placeholder=""}:{
  label:string;value:string;onChange:(v:string)=>void;rows?:number;placeholder?:string;
}) {
  return (
    <div style={{marginBottom:14}}>
      <label style={{display:"block",fontSize:13,fontWeight:700,color:M.gray,marginBottom:5}}>{label}</label>
      <textarea value={value} onChange={e=>onChange(e.target.value)} rows={rows}
        placeholder={placeholder} style={{...baseInp,resize:"vertical"} as React.CSSProperties}/>
    </div>
  );
}

function Sel({label,value,onChange,opts}:{
  label:string;value:string;onChange:(v:string)=>void;opts:{v:string;l:string}[];
}) {
  return (
    <div style={{marginBottom:14}}>
      <label style={{display:"block",fontSize:13,fontWeight:700,color:M.gray,marginBottom:5}}>{label}</label>
      <select value={value} onChange={e=>onChange(e.target.value)} style={baseInp as React.CSSProperties}>
        {opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

function DL({label,value}:{label:string;value:string}) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",
      borderBottom:"1px solid #F1F5F9",fontSize:13}}>
      <span style={{color:M.gray,fontWeight:600}}>{label}</span>
      <span style={{color:"#1E293B",fontWeight:700,textAlign:"right",maxWidth:"65%"}}>{value}</span>
    </div>
  );
}

function Btn({label,onClick,color=M.navy,outline=false,full=false,small=false,disabled=false}:{
  label:string;onClick:()=>void;color?:string;outline?:boolean;
  full?:boolean;small?:boolean;disabled?:boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding:small?"8px 12px":"11px 18px",
      borderRadius:12,fontWeight:700,fontSize:small?12:14,
      cursor:disabled?"not-allowed":"pointer",
      border:outline?`2px solid ${color}`:"none",
      background:outline?"transparent":disabled?"#CBD5E1":color,
      color:outline?color:"#fff",
      width:full?"100%":"auto",
      opacity:disabled?0.6:1,
      marginBottom:8,marginRight:4,
    }}>{label}</button>
  );
}

function InfoBox({msg,color=M.amber,bg="#FFFBEB"}:{msg:string;color?:string;bg?:string}) {
  return (
    <div style={{background:bg,borderRadius:10,padding:12,marginBottom:14,
      fontSize:13,color,fontWeight:700}}>{msg}</div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function MecanicienPage() {
  const sb = createClient();

  const [vehicules,   setVehicules]   = useState<Vehicule[]>([]);
  const [reparations, setReparations] = useState<Reparation[]>([]);
  const [alertes,     setAlertes]     = useState<Alerte[]>([]);

  // Alert workflow: persists across realtime refetches (session-local)
  const [luAlerts,      setLuAlerts]      = useState<Alerte[]>([]);
  const [enCoursAlerts, setEnCoursAlerts] = useState<Alerte[]>([]);

  const [tab,     setTab]     = useState<Tab>("dashboard");
  const [loading, setLoading] = useState(true);

  // Modal — détail alerte
  const [alertDetailOpen, setAlertDetailOpen] = useState<Alerte|null>(null);

  // Modal — étape 3 : réceptionner
  type ReceptionInit = {alerteId?:number;vehicule_id:string;description:string};
  const [receptionOpen, setReceptionOpen] = useState<ReceptionInit|null>(null);
  const [receptionF, setReceptionF] = useState({
    vehicule_id:"",description:"",km_reception:"",
    date_reception:todayStr(),etat_visuel:"",
  });

  // Modal — étape 4 : créer réparation
  const [createRepOpen, setCreateRepOpen] = useState<Reparation|null>(null);
  const freshCRF = () => ({
    type_intervention:"interne" as "interne"|"externe"|"piece",
    nom_garage:"",piece_nom:"",piece_fournisseur:"",
    date_commande_piece:"",date_reception_piece_estimee:"",
    urgence:"normal",cout_estime:"",date_debut_reparation:todayStr(),notes:"",
  });
  const [crF, setCrF] = useState(freshCRF());

  // Modal — étape 5 : pièce reçue
  const [pieceRecueOpen, setPieceRecueOpen] = useState<Reparation|null>(null);
  const [pieceRecueF, setPieceRecueF] = useState({
    date_reception_piece_reelle:todayStr(),date_debut_reparation:todayStr(),
  });

  // Modal — étape 6 : marquer réparé
  const [marquerRepareOpen, setMarquerRepareOpen] = useState<Reparation|null>(null);
  const [mrF, setMrF] = useState({
    date_fin_reparation:todayStr(),cout:"",km_sortie:"",commentaire_mecanicien:"",
  });

  // Modal — étape 7 : remettre en circulation
  const [remettreOpen, setRemettreOpen] = useState<Reparation|null>(null);
  const [remettreDate, setRemettreDate] = useState(todayStr());

  // Modal — modifier véhicule
  const [veOpen, setVeOpen] = useState<Vehicule|null>(null);
  const [veF,    setVeF]    = useState({km:"",ct_date:"",etat:"",notes:""});

  // Modal — détail historique
  const [detailOpen, setDetailOpen] = useState<Reparation|null>(null);

  // Historique filters
  const [histVeh, setHistVeh] = useState("all");
  const [histPer, setHistPer] = useState("all");

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const [v, r, a] = await Promise.all([
      sb.from("vehicules").select("*,circuit(*)").order("plaque"),
      sb.from("reparations")
        .select("*,vehicule(plaque,marque,modele)")
        .order("created_at",{ascending:false}),
      sb.from("alertes").select("*")
        .in("type",["vehicule","reparation","validation_requise","remise_circulation","transmis_meca"])
        .eq("read",false)
        .order("created_at",{ascending:false}),
    ]);
    if (v.data) setVehicules(v.data);
    if (r.data) setReparations(r.data);
    if (a.data) setAlertes(a.data);
    setLoading(false);
  }, [sb]);

  useEffect(()=>{
    load();
    const ch = sb.channel("meca-rt")
      .on("postgres_changes",{event:"*",schema:"public",table:"reparations"},load)
      .on("postgres_changes",{event:"*",schema:"public",table:"vehicules"},load)
      .on("postgres_changes",{event:"*",schema:"public",table:"alertes"},load)
      .subscribe();
    return ()=>{ sb.removeChannel(ch); };
  },[load,sb]);

  // ── Computed ───────────────────────────────────────────────────────────────
  const now = new Date();
  const m0  = new Date(now.getFullYear(),now.getMonth(),1).toISOString();

  const luIds      = new Set(luAlerts.map(a=>a.id));
  const enCoursIds = new Set(enCoursAlerts.map(a=>a.id));

  // alertes from DB minus those in local lu/en-cours sets (prevent ghost display)
  const alertesNonLues = alertes.filter(a=>!luIds.has(a.id)&&!enCoursIds.has(a.id));
  const alertesLues    = luAlerts;
  const alertesEnCours = enCoursAlerts;

  const repsActives   = reparations.filter(r=>
    ["receptionne","en_attente_validation","en_attente_piece","en_reparation"].includes(r.statut)
  );
  const repsTerminees = reparations.filter(r=>r.statut==="repare");
  const repsHisto     = reparations.filter(r=>r.statut==="remis_en_circulation");

  const inAtelier   = vehicules.filter(v=>
    ["receptionne","en_attente_piece","en_reparation","repare"].includes(v.etat)
  );
  const urgentVehs  = vehicules.filter(v=>ctCheck(v.ct_date)||v.km>=KM_ALERTE);

  const budgetMois  = reparations
    .filter(r=>["en_reparation","repare","remis_en_circulation"].includes(r.statut)&&r.created_at>=m0)
    .reduce((s,r)=>s+(r.cout||0),0);

  const totalAlertesBadge = alertesNonLues.length;

  const histFiltered = repsHisto.filter(r=>{
    if (histVeh!=="all"&&r.vehicule_id!==histVeh) return false;
    if (histPer==="mois"&&r.created_at<m0) return false;
    if (histPer==="3mois"){const d=new Date();d.setMonth(d.getMonth()-3);if(r.created_at<d.toISOString())return false;}
    if (histPer==="annee"){const d=new Date();d.setFullYear(d.getFullYear()-1);if(r.created_at<d.toISOString())return false;}
    return true;
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  // Étape 1 : Marquer comme lu
  async function handleMarkLu(a:Alerte) {
    await sb.from("alertes").update({read:true,read_at:new Date().toISOString()}).eq("id",a.id);
    setLuAlerts(p=>[...p.filter(x=>x.id!==a.id),a]);
    setAlertDetailOpen(null);
  }

  // Étape 2 : Mettre en cours → ouvre directement la réception
  function handleMettrEnCours(a:Alerte) {
    setEnCoursAlerts(p=>[...p.filter(x=>x.id!==a.id),a]);
    setLuAlerts(p=>p.filter(x=>x.id!==a.id));
    setAlertDetailOpen(null);
    if (a.vehicle_id) {
      setReceptionOpen({alerteId:a.id,vehicule_id:a.vehicle_id,description:a.message});
      setReceptionF({
        vehicule_id:a.vehicle_id,description:a.message,
        km_reception:"",date_reception:todayStr(),etat_visuel:"",
      });
    }
  }

  // Étape 3 : Réceptionner le véhicule
  async function handleReception() {
    const {vehicule_id,description,km_reception,date_reception,etat_visuel}=receptionF;
    if (!vehicule_id||!description.trim()) return;
    const fullDesc=etat_visuel?`${description}\nÉtat visuel : ${etat_visuel}`:description;
    const {error}=await sb.from("reparations").insert({
      vehicule_id,description:fullDesc,
      km_reception:km_reception?+km_reception:null,
      date_reception:date_reception||null,
      statut:"receptionne",alerte_envoyee:false,
    });
    if (error) { console.error(error); return; }
    await sb.from("vehicules").update({etat:"receptionne"}).eq("id",vehicule_id);
    if (receptionOpen?.alerteId) {
      setEnCoursAlerts(p=>p.filter(x=>x.id!==receptionOpen.alerteId));
    }
    setReceptionOpen(null);
    setReceptionF({vehicule_id:"",description:"",km_reception:"",date_reception:todayStr(),etat_visuel:""});
  }

  // Étape 4 : Créer la réparation
  async function handleCreateRep() {
    if (!createRepOpen) return;
    const rep=createRepOpen, f=crF;
    const cout=f.cout_estime?+f.cout_estime:0;

    let nextStatus:string, nextVehicleState:string;
    if (f.type_intervention==="piece") {
      nextStatus="en_attente_piece"; nextVehicleState="en_attente_piece";
    } else if (cout>=BUDGET_INTERVENTION) {
      nextStatus="en_attente_validation"; nextVehicleState="receptionne";
    } else {
      nextStatus="en_reparation"; nextVehicleState="en_reparation";
    }

    await sb.from("reparations").update({
      statut:nextStatus,
      type_intervention:f.type_intervention,
      nom_garage:f.type_intervention==="externe"?f.nom_garage:null,
      piece_nom:f.type_intervention==="piece"?f.piece_nom:null,
      piece_fournisseur:f.type_intervention==="piece"?f.piece_fournisseur:null,
      date_commande_piece:f.date_commande_piece||null,
      date_reception_piece_estimee:f.date_reception_piece_estimee||null,
      cout_estime:cout||null,
      date_debut_reparation:f.type_intervention!=="piece"?(f.date_debut_reparation||null):null,
      commentaire_mecanicien:f.notes||null,
      responsable:`${f.type_intervention}|${f.urgence}`,
    }).eq("id",rep.id);
    await sb.from("vehicules").update({etat:nextVehicleState}).eq("id",rep.vehicule_id);

    if (nextStatus==="en_attente_validation") {
      const plaque=(rep.vehicule as {plaque?:string}|undefined)?.plaque||rep.vehicule_id;
      await sb.from("alertes").insert({
        type:"validation_requise",severity:"haute",
        message:`Réparation ${plaque} en attente de validation — Coût estimé : ${cout.toLocaleString("fr-CH")} CHF`,
        vehicle_id:rep.vehicule_id,read:false,
      });
    }
    setCreateRepOpen(null); setCrF(freshCRF());
  }

  // Étape 5 : Pièce reçue → démarrer réparation
  async function handlePieceRecue() {
    if (!pieceRecueOpen) return;
    const rep=pieceRecueOpen, f=pieceRecueF;
    await sb.from("reparations").update({
      statut:"en_reparation",
      date_reception_piece_reelle:f.date_reception_piece_reelle||null,
      date_debut_reparation:f.date_debut_reparation||null,
    }).eq("id",rep.id);
    await sb.from("vehicules").update({etat:"en_reparation"}).eq("id",rep.vehicule_id);
    setPieceRecueOpen(null);
  }

  // Étape 6 : Marquer réparé
  async function handleMarquerRepare() {
    if (!marquerRepareOpen) return;
    const rep=marquerRepareOpen, f=mrF;
    const upd: Record<string,unknown>={
      statut:"repare",
      date_fin_reparation:f.date_fin_reparation||null,
      cout:f.cout?+f.cout:null,
      km_sortie:f.km_sortie?+f.km_sortie:null,
      commentaire_mecanicien:f.commentaire_mecanicien||rep.commentaire_mecanicien||null,
    };
    if (rep.date_debut_reparation&&f.date_fin_reparation) {
      upd.duree_jours=nbJours(rep.date_debut_reparation,f.date_fin_reparation);
    }
    await sb.from("reparations").update(upd).eq("id",rep.id);
    await sb.from("vehicules").update({etat:"repare"}).eq("id",rep.vehicule_id);
    setMarquerRepareOpen(null); setMrF({date_fin_reparation:todayStr(),cout:"",km_sortie:"",commentaire_mecanicien:""});
  }

  // Étape 7 : Remettre en circulation + notification gestionnaire
  async function handleRemettre() {
    if (!remettreOpen) return;
    const rep=remettreOpen;
    const plaque=(rep.vehicule as {plaque?:string}|undefined)?.plaque||rep.vehicule_id;
    await sb.from("reparations").update({
      statut:"remis_en_circulation",
      date_remise_circulation:remettreDate||null,
    }).eq("id",rep.id);
    const vUpd: Record<string,unknown>={etat:"en_service"};
    if (rep.km_sortie) vUpd.km=rep.km_sortie;
    await sb.from("vehicules").update(vUpd).eq("id",rep.vehicule_id);
    await sb.from("alertes").insert({
      type:"remise_circulation",severity:"normale",
      message:`✅ Véhicule ${plaque} remis en service le ${fd(remettreDate)}`,
      vehicle_id:rep.vehicule_id,read:false,
    });
    setRemettreOpen(null); setRemettreDate(todayStr());
  }

  // Modifier véhicule
  async function handleVeEdit() {
    if (!veOpen) return;
    await sb.from("vehicules").update({
      km:veF.km?+veF.km:veOpen.km,
      ct_date:veF.ct_date||null,
      etat:(veF.etat||veOpen.etat) as Vehicule["etat"],
      notes:veF.notes||null,
    }).eq("id",veOpen.id);
    setVeOpen(null);
  }

  function openVe(v:Vehicule) {
    setVeOpen(v);
    setVeF({km:String(v.km),ct_date:v.ct_date||"",etat:v.etat,notes:v.notes||""});
  }

  // ── Inner components ────────────────────────────────────────────────────────

  function RepCard({rep,actions=true}:{rep:Reparation;actions?:boolean}) {
    type VMin={plaque?:string;marque?:string;modele?:string};
    const v=rep.vehicule as VMin|undefined;
    const [type,urgence]=(rep.responsable||"").split("|");
    const urgColor=urgence==="bloquant"?M.red:urgence==="tres_urgent"?M.amber:urgence==="urgent"?M.blue:undefined;
    const duree=rep.date_debut_reparation&&rep.date_fin_reparation
      ?nbJours(rep.date_debut_reparation,rep.date_fin_reparation):null;
    const veh=vehicules.find(x=>x.id===rep.vehicule_id);

    return (
      <div style={{background:"#fff",borderRadius:16,padding:16,marginBottom:12,
        boxShadow:"0 2px 8px rgba(0,0,0,0.06)",
        borderLeft:`4px solid ${RS[rep.statut]?.c??M.gray}`}}>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",
          marginBottom:8,flexWrap:"wrap",gap:8}}>
          <div>
            <div style={{fontWeight:800,fontSize:16,color:M.navy}}>
              {v?.plaque||rep.vehicule_id}{" "}
              <span style={{fontWeight:400,color:M.gray,fontSize:14}}>{v?.marque} {v?.modele}</span>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",marginTop:4,flexWrap:"wrap"}}>
              <RBadge s={rep.statut}/>
              {urgence&&urgColor&&(
                <span style={{fontSize:12,fontWeight:700,color:urgColor}}>
                  {urgence==="bloquant"?"🔴 Bloquant":urgence==="tres_urgent"?"🟠 Très urgent":"🟡 Urgent"}
                </span>
              )}
            </div>
          </div>
          {rep.cout!=null&&<div style={{fontWeight:800,color:M.navy,fontSize:16}}>
            {rep.cout.toLocaleString("fr-CH")} CHF
          </div>}
        </div>

        <p style={{fontSize:14,color:"#1E293B",marginBottom:10,lineHeight:1.5}}>{rep.description}</p>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px",marginBottom:10}}>
          {rep.date_reception             &&<DL label="Réceptionné"     value={fd(rep.date_reception)}/>}
          {rep.km_reception!=null         &&<DL label="Km réception"    value={`${rep.km_reception.toLocaleString()} km`}/>}
          {type&&<DL label="Type" value={
            type==="externe"?`Externe${rep.nom_garage?` — ${rep.nom_garage}`:""}`:
            type==="piece"?"Pièce détachée":"Interne atelier"}/>}
          {rep.cout_estime!=null          &&<DL label="Coût estimé"    value={`${rep.cout_estime.toLocaleString("fr-CH")} CHF`}/>}
          {rep.piece_nom                  &&<DL label="Pièce"           value={`${rep.piece_nom}${rep.piece_fournisseur?` — ${rep.piece_fournisseur}`:""}`}/>}
          {rep.date_commande_piece        &&<DL label="Commandée le"    value={fd(rep.date_commande_piece)}/>}
          {rep.date_reception_piece_estimee&&<DL label="Réception est." value={fd(rep.date_reception_piece_estimee)}/>}
          {rep.date_reception_piece_reelle&&<DL label="Pièce reçue"    value={fd(rep.date_reception_piece_reelle)}/>}
          {rep.date_debut_reparation      &&<DL label="Début répa."    value={fd(rep.date_debut_reparation)}/>}
          {rep.date_fin_reparation        &&<DL label="Fin répa."      value={fd(rep.date_fin_reparation)}/>}
          {duree!=null                    &&<DL label="Durée"           value={`${duree} jour${duree>1?"s":""}`}/>}
          {rep.km_sortie!=null            &&<DL label="Km sortie"       value={`${rep.km_sortie.toLocaleString()} km`}/>}
          {rep.date_remise_circulation    &&<DL label="Remis en service" value={fd(rep.date_remise_circulation)}/>}
        </div>

        {rep.commentaire_mecanicien&&(
          <div style={{padding:10,background:"#F8FAFC",borderRadius:10,fontSize:13,
            fontStyle:"italic",marginBottom:10}}>
            💬 {rep.commentaire_mecanicien}
          </div>
        )}

        {actions&&(
          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:8}}>
            {/* Étape 4 */}
            {rep.statut==="receptionne"&&(
              <Btn label="🔧 Créer la réparation" onClick={()=>{setCreateRepOpen(rep);setCrF(freshCRF());}}/>
            )}
            {/* Attente validation */}
            {rep.statut==="en_attente_validation"&&(
              <InfoBox msg="⏳ En attente de validation par le gestionnaire"/>
            )}
            {/* Étape 5 */}
            {rep.statut==="en_attente_piece"&&(
              <Btn label="📦 Pièce reçue — Démarrer" onClick={()=>{
                setPieceRecueOpen(rep);
                setPieceRecueF({date_reception_piece_reelle:todayStr(),date_debut_reparation:todayStr()});
              }}/>
            )}
            {/* Étape 6 */}
            {rep.statut==="en_reparation"&&(
              <Btn label="✔️ Marquer réparé" onClick={()=>{
                setMarquerRepareOpen(rep);
                setMrF({date_fin_reparation:todayStr(),cout:"",km_sortie:"",commentaire_mecanicien:""});
              }}/>
            )}
            {/* Étape 7 */}
            {rep.statut==="repare"&&(
              <Btn label="🚌 Remettre en circulation" color={M.green} onClick={()=>{
                setRemettreOpen(rep); setRemettreDate(todayStr());
              }}/>
            )}
            {/* Fiche véhicule */}
            {veh&&(
              <Btn label="📋 Fiche véhicule" small outline onClick={()=>openVe(veh)}/>
            )}
          </div>
        )}
      </div>
    );
  }

  function AlertCard({a}:{a:Alerte}) {
    const isLu      = luIds.has(a.id);
    const isEnCours = enCoursIds.has(a.id);
    const sev=a.severity;
    const sevColor=sev==="critique"?M.red:sev==="haute"?M.amber:M.blue;
    const sevBg=sev==="critique"?"#FEF2F2":sev==="haute"?"#FFFBEB":"#DBEAFE";
    const v=vehicules.find(x=>x.id===a.vehicle_id);
    return (
      <div style={{background:sevBg,borderRadius:16,padding:16,marginBottom:12,
        borderLeft:`4px solid ${sevColor}`,cursor:"pointer"}}
        onClick={()=>setAlertDetailOpen(a)}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",
          marginBottom:8,flexWrap:"wrap",gap:8}}>
          <div style={{flex:1}}>
            <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
              <span style={{fontSize:12,fontWeight:800,color:sevColor,textTransform:"uppercase"}}>
                {sev==="critique"?"🔴 Critique":sev==="haute"?"🟠 Haute":"🔵 Normale"}
              </span>
              <span style={{fontSize:11,color:M.gray,background:"#E2E8F0",borderRadius:99,padding:"2px 7px"}}>
                {TYPE_LABELS[a.type]||a.type}
              </span>
              {isLu&&!isEnCours&&(
                <span style={{fontSize:11,fontWeight:700,color:M.green,background:"#DCFCE7",
                  borderRadius:99,padding:"2px 7px"}}>✓ Lu</span>
              )}
              {isEnCours&&(
                <span style={{fontSize:11,fontWeight:700,color:M.blue,background:"#DBEAFE",
                  borderRadius:99,padding:"2px 7px"}}>▶ En cours</span>
              )}
            </div>
            <div style={{fontWeight:700,fontSize:14,color:"#1E293B"}}>{a.message}</div>
            <div style={{fontSize:12,color:M.gray,marginTop:2}}>
              {new Date(a.created_at).toLocaleDateString("fr-CH")}
            </div>
          </div>
          {v&&<VBadge s={v.etat}/>}
        </div>
        {v&&(
          <div style={{fontSize:13,color:M.navy,fontWeight:700}}>
            🚌 {v.plaque} — {v.marque} {v.modele} · {v.km.toLocaleString()} km
          </div>
        )}
      </div>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{display:"flex",justifyContent:"center",alignItems:"center",
      minHeight:"60vh",color:M.gray,fontSize:15}}>
      Chargement…
    </div>
  );

  const TABS: {id:Tab;label:string;badge?:number}[] = [
    {id:"dashboard",     label:"🏠 Dashboard"},
    {id:"alertes",       label:"🔔 Alertes",        badge:totalAlertesBadge||undefined},
    {id:"en_reparation", label:"🔧 En réparation",  badge:repsActives.length||undefined},
    {id:"terminees",     label:"✅ Terminées",       badge:repsTerminees.length||undefined},
    {id:"historique",    label:"📋 Historique"},
  ];

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{maxWidth:900,margin:"0 auto"}}>

      {/* Header */}
      <div style={{marginBottom:24}}>
        <h1 style={{fontSize:24,fontWeight:900,color:M.navy}}>🔧 Atelier mécanique</h1>
        <p style={{color:M.gray,fontSize:14,marginTop:4}}>Gestion des réparations · Workflow complet</p>
      </div>

      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:16}}>
        {[
          {label:"Véhicules",          val:vehicules.length,      icon:"🚌",c:M.navy,  bg:"#EFF6FF"},
          {label:"En atelier",         val:inAtelier.length,      icon:"🔧",c:M.amber, bg:"#FFFBEB"},
          {label:"Alertes non lues",   val:totalAlertesBadge,     icon:"🔔",c:M.red,   bg:"#FEF2F2", click:()=>setTab("alertes")},
          {label:"Réparations actives",val:repsActives.length,    icon:"📋",c:M.blue,  bg:"#DBEAFE", click:()=>setTab("en_reparation")},
        ].map(c=>(
          <div key={c.label} onClick={c.click}
            style={{background:c.bg,borderRadius:16,padding:"14px 16px",
              cursor:c.click?"pointer":"default",border:`1px solid ${c.c}22`}}>
            <div style={{fontSize:22}}>{c.icon}</div>
            <div style={{fontSize:26,fontWeight:900,color:c.c,lineHeight:1.2}}>{c.val}</div>
            <div style={{fontSize:12,color:M.gray,marginTop:2}}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Budget */}
      <div style={{background:"#fff",borderRadius:16,padding:16,marginBottom:20,
        boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
          <span style={{fontWeight:700,color:M.navy,fontSize:14}}>Dépenses — mois en cours</span>
          <span style={{fontWeight:800,color:M.navy,fontSize:14}}>
            {budgetMois.toLocaleString("fr-CH")} CHF
          </span>
        </div>
        <div style={{fontSize:12,color:M.gray}}>
          Limite par intervention : {BUDGET_INTERVENTION.toLocaleString("fr-CH")} CHF
          — au-delà → validation gestionnaire
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:20,paddingBottom:4}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"10px 14px",borderRadius:12,border:"none",cursor:"pointer",
              fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap",
              background:tab===t.id?M.navy:"#E2E8F0",color:tab===t.id?"#fff":M.gray}}>
            {t.label}
            {t.badge!=null&&t.badge>0&&(
              <span style={{background:tab===t.id?"rgba(255,255,255,0.25)":M.red,
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
          {totalAlertesBadge>0&&(
            <div style={{background:"#FEF2F2",borderRadius:14,padding:16,marginBottom:16,
              border:"1px solid #FECACA",cursor:"pointer"}} onClick={()=>setTab("alertes")}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:800,color:M.red}}>
                  🔔 {alertesNonLues.length} alerte(s) non lue(s)
                  {alertesLues.length>0&&` · ${alertesLues.length} lue(s) en attente`}
                  {alertesEnCours.length>0&&` · ${alertesEnCours.length} en cours`}
                </span>
                <span style={{fontSize:13,color:M.red,fontWeight:700}}>Voir →</span>
              </div>
            </div>
          )}

          {urgentVehs.length>0&&(
            <div style={{background:"#FFFBEB",borderRadius:14,padding:14,marginBottom:16,
              border:"1px solid #FDE68A"}}>
              <div style={{fontWeight:800,color:M.amber,marginBottom:10,fontSize:14}}>
                ⚠️ {urgentVehs.length} véhicule(s) nécessitent attention
              </div>
              {urgentVehs.map(v=>{
                const ct=ctCheck(v.ct_date);
                return (
                  <div key={v.id} style={{fontSize:13,color:"#1E293B",
                    padding:"5px 0",borderBottom:"1px solid #FDE68A"}}>
                    <span style={{fontWeight:700}}>🚌 {v.plaque}</span>
                    {ct&&<span style={{color:ct.c,marginLeft:8}}>— {ct.label}</span>}
                    {v.km>=KM_ALERTE&&<span style={{color:M.amber,marginLeft:8}}>
                      — {v.km.toLocaleString()} km</span>}
                    <button onClick={()=>openVe(v)}
                      style={{marginLeft:12,fontSize:12,color:M.navy,background:"none",
                        border:"none",cursor:"pointer",fontWeight:700}}>
                      Modifier →
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {repsActives.length===0?(
            <div style={{textAlign:"center",padding:"40px 20px",color:M.gray}}>
              <div style={{fontSize:44}}>✅</div>
              <p style={{fontWeight:700,fontSize:16,marginTop:12}}>Aucune réparation en cours</p>
            </div>
          ):(
            <>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <h2 style={{fontSize:15,fontWeight:800,color:M.navy}}>En cours ({repsActives.length})</h2>
                {repsActives.length>3&&(
                  <button onClick={()=>setTab("en_reparation")}
                    style={{fontSize:13,color:M.navy,background:"none",border:"none",
                      cursor:"pointer",fontWeight:700}}>Voir toutes →</button>
                )}
              </div>
              {repsActives.slice(0,3).map(r=><RepCard key={r.id} rep={r}/>)}
            </>
          )}
        </div>
      )}

      {/* ════ ALERTES ════ */}
      {tab==="alertes"&&(
        <div>
          {alertesNonLues.length===0&&alertesLues.length===0&&alertesEnCours.length===0?(
            <div style={{textAlign:"center",padding:"60px 20px",color:M.gray}}>
              <div style={{fontSize:48}}>🔔</div>
              <p style={{fontWeight:700,marginTop:12,fontSize:16}}>Aucune alerte</p>
            </div>
          ):(
            <>
              {alertesNonLues.length>0&&(
                <section style={{marginBottom:24}}>
                  <div style={{fontWeight:800,fontSize:13,color:M.red,
                    textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>
                    🔴 Non lues ({alertesNonLues.length})
                  </div>
                  {alertesNonLues.map(a=><AlertCard key={a.id} a={a}/>)}
                </section>
              )}
              {alertesLues.length>0&&(
                <section style={{marginBottom:24}}>
                  <div style={{fontWeight:800,fontSize:13,color:M.amber,
                    textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>
                    🟡 Lues — en attente ({alertesLues.length})
                  </div>
                  {alertesLues.map(a=><AlertCard key={a.id} a={a}/>)}
                </section>
              )}
              {alertesEnCours.length>0&&(
                <section>
                  <div style={{fontWeight:800,fontSize:13,color:M.blue,
                    textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>
                    🔵 En cours ({alertesEnCours.length})
                  </div>
                  {alertesEnCours.map(a=><AlertCard key={a.id} a={a}/>)}
                </section>
              )}
            </>
          )}
        </div>
      )}

      {/* ════ EN RÉPARATION ════ */}
      {tab==="en_reparation"&&(
        <div>
          {repsActives.length===0?(
            <div style={{textAlign:"center",padding:"60px 20px",color:M.gray}}>
              <div style={{fontSize:48}}>✅</div>
              <p style={{fontWeight:700,marginTop:12,fontSize:16}}>Aucune réparation en cours</p>
            </div>
          ):repsActives.map(r=><RepCard key={r.id} rep={r}/>)}
        </div>
      )}

      {/* ════ TERMINÉES ════ */}
      {tab==="terminees"&&(
        <div>
          {repsTerminees.length===0?(
            <div style={{textAlign:"center",padding:"60px 20px",color:M.gray}}>
              <div style={{fontSize:48}}>✅</div>
              <p style={{fontWeight:700,marginTop:12,fontSize:16}}>Aucune réparation terminée</p>
              <p style={{fontSize:13,color:M.gray,marginTop:8}}>
                Véhicules réparés en attente de remise en service.
              </p>
            </div>
          ):repsTerminees.map(r=><RepCard key={r.id} rep={r}/>)}
        </div>
      )}

      {/* ════ HISTORIQUE ════ */}
      {tab==="historique"&&(
        <div>
          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
            <select value={histVeh} onChange={e=>setHistVeh(e.target.value)}
              style={{...baseInp,flex:1,minWidth:140} as React.CSSProperties}>
              <option value="all">Tous les véhicules</option>
              {vehicules.map(v=><option key={v.id} value={v.id}>{v.plaque} — {v.marque}</option>)}
            </select>
            <select value={histPer} onChange={e=>setHistPer(e.target.value)}
              style={{...baseInp,flex:1,minWidth:120} as React.CSSProperties}>
              <option value="all">Toutes périodes</option>
              <option value="mois">Ce mois</option>
              <option value="3mois">3 derniers mois</option>
              <option value="annee">Cette année</option>
            </select>
          </div>
          <p style={{color:M.gray,fontSize:13,marginBottom:12}}>
            {histFiltered.length} réparation(s) archivée(s)
          </p>
          {histFiltered.length===0?(
            <div style={{textAlign:"center",padding:"60px 20px",color:M.gray}}>
              <div style={{fontSize:48}}>📭</div>
              <p style={{fontWeight:700,marginTop:12}}>Aucune réparation dans l&apos;historique</p>
            </div>
          ):histFiltered.map(r=>{
            type VMin={plaque?:string;marque?:string;modele?:string};
            const vv=r.vehicule as VMin|undefined;
            const duree=r.date_debut_reparation&&r.date_fin_reparation
              ?nbJours(r.date_debut_reparation,r.date_fin_reparation):null;
            return (
              <div key={r.id} style={{background:"#fff",borderRadius:16,padding:16,
                marginBottom:12,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
                <div style={{display:"flex",justifyContent:"space-between",
                  alignItems:"flex-start",marginBottom:8,flexWrap:"wrap",gap:8}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:15,color:M.navy}}>
                      {vv?.plaque}{" "}
                      <span style={{color:M.gray,fontWeight:400,fontSize:13}}>
                        {vv?.marque} {vv?.modele}
                      </span>
                    </div>
                    <RBadge s={r.statut}/>
                  </div>
                  <div style={{textAlign:"right"}}>
                    {r.cout!=null&&<div style={{fontWeight:800,color:M.navy}}>
                      {r.cout.toLocaleString("fr-CH")} CHF
                    </div>}
                    <button onClick={()=>setDetailOpen(r)}
                      style={{fontSize:13,color:M.blue,background:"none",border:"none",
                        cursor:"pointer",fontWeight:700,marginTop:4}}>Détails →</button>
                  </div>
                </div>
                <p style={{fontSize:14,color:"#475569",marginBottom:8}}>{r.description}</p>
                <div style={{display:"flex",gap:12,fontSize:13,color:M.gray,flexWrap:"wrap"}}>
                  {r.date_reception&&<span>📥 {fd(r.date_reception)}</span>}
                  {r.date_fin_reparation&&<span>✅ {fd(r.date_fin_reparation)}</span>}
                  {duree!=null&&<span>⏱ {duree}j</span>}
                  {r.date_remise_circulation&&<span>🚌 {fd(r.date_remise_circulation)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FAB */}
      <button onClick={()=>{
        setReceptionOpen({vehicule_id:"",description:""});
        setReceptionF({vehicule_id:"",description:"",km_reception:"",date_reception:todayStr(),etat_visuel:""});
      }}
        style={{position:"fixed",bottom:24,right:24,zIndex:90,background:M.navy,color:"#fff",
          border:"none",borderRadius:20,padding:"14px 22px",fontSize:15,fontWeight:800,
          cursor:"pointer",boxShadow:"0 4px 20px rgba(13,59,122,0.35)"}}>
        + Réceptionner
      </button>

      {/* ════════════════════ MODALS ════════════════════ */}

      {/* ── Détail alerte (étapes 1 & 2) ── */}
      {alertDetailOpen&&(()=>{
        const a=alertDetailOpen;
        const isLu=luIds.has(a.id);
        const isEnCours=enCoursIds.has(a.id);
        const sev=a.severity;
        const sevColor=sev==="critique"?M.red:sev==="haute"?M.amber:M.blue;
        const sevBg=sev==="critique"?"#FEF2F2":sev==="haute"?"#FFFBEB":"#DBEAFE";
        const v=vehicules.find(x=>x.id===a.vehicle_id);
        return (
          <BSheet title="Détail de l'alerte" onClose={()=>setAlertDetailOpen(null)}>
            <div style={{background:sevBg,borderRadius:12,padding:16,marginBottom:20,
              borderLeft:`4px solid ${sevColor}`}}>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
                <span style={{fontSize:13,fontWeight:800,color:sevColor}}>
                  {sev==="critique"?"🔴 Critique":sev==="haute"?"🟠 Haute":"🔵 Normale"}
                </span>
                <span style={{fontSize:12,color:M.gray,background:"#E2E8F0",
                  borderRadius:99,padding:"2px 8px"}}>{TYPE_LABELS[a.type]||a.type}</span>
                {isLu&&!isEnCours&&(
                  <span style={{fontSize:12,fontWeight:700,color:M.green,background:"#DCFCE7",
                    borderRadius:99,padding:"2px 8px"}}>✓ Lu</span>
                )}
                {isEnCours&&(
                  <span style={{fontSize:12,fontWeight:700,color:M.blue,background:"#DBEAFE",
                    borderRadius:99,padding:"2px 8px"}}>▶ En cours</span>
                )}
              </div>
              <p style={{fontSize:15,fontWeight:700,color:"#1E293B",lineHeight:1.5}}>{a.message}</p>
              <div style={{fontSize:12,color:M.gray,marginTop:8}}>
                Reçue le {new Date(a.created_at).toLocaleDateString("fr-CH")}
              </div>
            </div>

            {v&&(
              <div style={{background:"#EFF6FF",borderRadius:12,padding:14,marginBottom:20}}>
                <div style={{fontWeight:700,color:M.navy,marginBottom:8,fontSize:13}}>🚌 Véhicule concerné</div>
                <DL label="Plaque"      value={v.plaque}/>
                <DL label="Modèle"      value={`${v.marque} ${v.modele}`}/>
                <DL label="Kilométrage" value={`${v.km.toLocaleString()} km`}/>
                {v.ct_date&&<DL label="CT" value={v.ct_date}/>}
                <div style={{marginTop:8}}><VBadge s={v.etat}/></div>
              </div>
            )}

            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {/* Étape 1 : Marquer comme lu */}
              {!isLu&&!isEnCours&&(
                <Btn label="✓ Marquer comme lu" color={M.gray} outline full
                  onClick={()=>handleMarkLu(a)}/>
              )}
              {/* Étape 2 : Mettre en cours */}
              {!isEnCours&&a.vehicle_id&&(
                <Btn label="▶ Mettre en cours" full
                  onClick={()=>handleMettrEnCours(a)}/>
              )}
              {/* Étape 3 si déjà en cours */}
              {isEnCours&&a.vehicle_id&&(
                <Btn label="👁️ Réceptionner le véhicule" color={M.green} full
                  onClick={()=>{
                    setReceptionOpen({alerteId:a.id,vehicule_id:a.vehicle_id!,description:a.message});
                    setReceptionF({vehicule_id:a.vehicle_id!,description:a.message,
                      km_reception:"",date_reception:todayStr(),etat_visuel:""});
                    setAlertDetailOpen(null);
                  }}/>
              )}
            </div>
          </BSheet>
        );
      })()}

      {/* ── Étape 3 : Réceptionner le véhicule ── */}
      {receptionOpen&&(
        <BSheet title="Réceptionner un véhicule" onClose={()=>setReceptionOpen(null)}>
          <Sel label="Véhicule *" value={receptionF.vehicule_id}
            onChange={v=>setReceptionF(p=>({...p,vehicule_id:v}))}
            opts={[{v:"",l:"— Choisir un véhicule —"},
              ...vehicules.map(v=>({v:v.id,l:`${v.plaque} — ${v.marque} ${v.modele}`}))]}/>
          <TA label="Problème observé *" value={receptionF.description}
            onChange={v=>setReceptionF(p=>({...p,description:v}))}
            placeholder="Décrivez le problème signalé…"/>
          <Inp label="Kilométrage à la réception" type="number" value={receptionF.km_reception}
            onChange={v=>setReceptionF(p=>({...p,km_reception:v}))}/>
          <Inp label="Date de réception" type="date" value={receptionF.date_reception}
            onChange={v=>setReceptionF(p=>({...p,date_reception:v}))}/>
          <TA label="État visuel du véhicule" value={receptionF.etat_visuel}
            onChange={v=>setReceptionF(p=>({...p,etat_visuel:v}))} rows={2}
            placeholder="Rayures, dommages visibles, propreté…"/>
          <Btn label="✅ Réceptionner le véhicule" color={M.green} full
            onClick={handleReception}
            disabled={!receptionF.vehicule_id||!receptionF.description.trim()}/>
        </BSheet>
      )}

      {/* ── Étape 4 : Créer la réparation ── */}
      {createRepOpen&&(
        <BSheet title="Créer la réparation" onClose={()=>setCreateRepOpen(null)}>
          <div style={{background:"#EFF6FF",borderRadius:12,padding:12,marginBottom:16,
            fontSize:13,color:M.navy,fontWeight:600}}>
            🚌 {(createRepOpen.vehicule as {plaque?:string}|undefined)?.plaque||createRepOpen.vehicule_id}
            {" — "}{createRepOpen.description.slice(0,80)}{createRepOpen.description.length>80&&"…"}
          </div>
          <Sel label="Type d'intervention" value={crF.type_intervention}
            onChange={v=>setCrF(p=>({...p,type_intervention:v as "interne"|"externe"|"piece"}))}
            opts={[
              {v:"interne",l:"🏭 Interne (atelier)"},
              {v:"externe",l:"🏗️ Externe (garage extérieur)"},
              {v:"piece",  l:"🔩 Commande de pièce"},
            ]}/>
          {crF.type_intervention==="externe"&&(
            <Inp label="Nom du garage" value={crF.nom_garage}
              onChange={v=>setCrF(p=>({...p,nom_garage:v}))} placeholder="ex: Garage Martin"/>
          )}
          {crF.type_intervention==="piece"&&(<>
            <Inp label="Nom de la pièce" value={crF.piece_nom}
              onChange={v=>setCrF(p=>({...p,piece_nom:v}))} placeholder="ex: Filtre à huile"/>
            <Inp label="Fournisseur" value={crF.piece_fournisseur}
              onChange={v=>setCrF(p=>({...p,piece_fournisseur:v}))} placeholder="ex: Peugeot Parts"/>
            <Inp label="Date de commande" type="date" value={crF.date_commande_piece}
              onChange={v=>setCrF(p=>({...p,date_commande_piece:v}))}/>
            <Inp label="Réception estimée" type="date" value={crF.date_reception_piece_estimee}
              onChange={v=>setCrF(p=>({...p,date_reception_piece_estimee:v}))}/>
          </>)}
          <Sel label="Niveau d'urgence" value={crF.urgence}
            onChange={v=>setCrF(p=>({...p,urgence:v}))} opts={URGENCES}/>
          <Inp label="Coût estimé (CHF)" type="number" value={crF.cout_estime}
            onChange={v=>setCrF(p=>({...p,cout_estime:v}))} placeholder="0"/>
          {crF.cout_estime&&+crF.cout_estime>=BUDGET_INTERVENTION&&(
            <InfoBox msg={`⚠️ Coût ≥ ${BUDGET_INTERVENTION.toLocaleString()} CHF — soumis à validation gestionnaire + admin`}/>
          )}
          {crF.type_intervention!=="piece"&&(
            <Inp label="Date de début prévue" type="date" value={crF.date_debut_reparation}
              onChange={v=>setCrF(p=>({...p,date_debut_reparation:v}))}/>
          )}
          <TA label="Notes" value={crF.notes}
            onChange={v=>setCrF(p=>({...p,notes:v}))} rows={2}
            placeholder="Informations complémentaires…"/>
          <Btn label="✅ Confirmer la réparation" color={M.green} full onClick={handleCreateRep}/>
        </BSheet>
      )}

      {/* ── Étape 5 : Pièce reçue ── */}
      {pieceRecueOpen&&(
        <BSheet title="Pièce reçue — Démarrer la réparation" onClose={()=>setPieceRecueOpen(null)}>
          <div style={{background:"#EFF6FF",borderRadius:12,padding:12,marginBottom:16,fontSize:13}}>
            <span style={{fontWeight:700,color:M.navy}}>🔩 {pieceRecueOpen.piece_nom||"Pièce"}</span>
            {pieceRecueOpen.piece_fournisseur&&(
              <span style={{color:M.gray}}> — {pieceRecueOpen.piece_fournisseur}</span>
            )}
            {pieceRecueOpen.date_reception_piece_estimee&&(
              <div style={{color:M.gray,marginTop:4}}>
                Réception estimée : {fd(pieceRecueOpen.date_reception_piece_estimee)}
              </div>
            )}
          </div>
          <Inp label="Date de réception réelle de la pièce" type="date"
            value={pieceRecueF.date_reception_piece_reelle}
            onChange={v=>setPieceRecueF(p=>({...p,date_reception_piece_reelle:v}))}/>
          <Inp label="Date de début de réparation" type="date"
            value={pieceRecueF.date_debut_reparation}
            onChange={v=>setPieceRecueF(p=>({...p,date_debut_reparation:v}))}/>
          <InfoBox msg="✅ La réparation démarre dès confirmation." color={M.green} bg="#DCFCE7"/>
          <Btn label="✅ Pièce reçue — Démarrer" color={M.green} full onClick={handlePieceRecue}/>
        </BSheet>
      )}

      {/* ── Étape 6 : Marquer réparé ── */}
      {marquerRepareOpen&&(
        <BSheet title="Réparation terminée" onClose={()=>setMarquerRepareOpen(null)}>
          <div style={{background:"#F8FAFC",borderRadius:12,padding:12,marginBottom:16,fontSize:13}}>
            <span style={{fontWeight:700,color:M.navy}}>
              🚌 {(marquerRepareOpen.vehicule as {plaque?:string}|undefined)?.plaque||marquerRepareOpen.vehicule_id}
            </span>
            <span style={{color:M.gray}}> — {marquerRepareOpen.description.slice(0,60)}</span>
          </div>
          <Inp label="Date de fin de réparation" type="date" value={mrF.date_fin_reparation}
            onChange={v=>setMrF(p=>({...p,date_fin_reparation:v}))}/>
          {marquerRepareOpen.date_debut_reparation&&mrF.date_fin_reparation&&(
            <InfoBox msg={`⏱ Durée : ${nbJours(marquerRepareOpen.date_debut_reparation,mrF.date_fin_reparation)} jour(s)`}
              color={M.navy} bg="#EFF6FF"/>
          )}
          <Inp label="Coût réel final (CHF)" type="number" value={mrF.cout}
            onChange={v=>setMrF(p=>({...p,cout:v}))} placeholder="0"/>
          <Inp label="Kilométrage à la sortie" type="number" value={mrF.km_sortie}
            onChange={v=>setMrF(p=>({...p,km_sortie:v}))}/>
          <TA label="Commentaire du mécanicien" value={mrF.commentaire_mecanicien}
            onChange={v=>setMrF(p=>({...p,commentaire_mecanicien:v}))}
            placeholder="Observations, pièces remplacées, conseils de suivi…"/>
          <Btn label="✔️ Confirmer — Véhicule réparé" color={M.purple} full
            onClick={handleMarquerRepare}/>
        </BSheet>
      )}

      {/* ── Étape 7 : Remettre en circulation ── */}
      {remettreOpen&&(
        <BSheet title="Remettre en circulation" onClose={()=>setRemettreOpen(null)}>
          <div style={{background:"#DCFCE7",borderRadius:12,padding:14,marginBottom:20}}>
            <p style={{fontWeight:700,color:M.green,fontSize:15,marginBottom:4}}>
              🚌 {(remettreOpen.vehicule as {plaque?:string}|undefined)?.plaque||remettreOpen.vehicule_id}
            </p>
            <p style={{fontSize:13,color:"#15803D",lineHeight:1.5}}>
              Le véhicule repassera en &quot;En service&quot;.<br/>
              Le gestionnaire recevra une notification automatique en temps réel.
            </p>
          </div>
          {remettreOpen.cout!=null&&(
            <InfoBox msg={`Coût final : ${remettreOpen.cout.toLocaleString("fr-CH")} CHF`}
              color={M.navy} bg="#EFF6FF"/>
          )}
          <Inp label="Date de remise en service" type="date" value={remettreDate}
            onChange={setRemettreDate}/>
          <Btn label="🚌 Remettre en circulation" color={M.green} full onClick={handleRemettre}/>
        </BSheet>
      )}

      {/* ── Modifier véhicule (fiche) ── */}
      {veOpen&&(
        <BSheet title={`Fiche véhicule — ${veOpen.plaque}`} onClose={()=>setVeOpen(null)}>
          <div style={{background:"#F8FAFC",borderRadius:12,padding:12,marginBottom:16}}>
            <p style={{fontSize:12,fontWeight:700,color:M.gray,marginBottom:8}}>🔒 Informations verrouillées</p>
            <DL label="Immatriculation" value={veOpen.plaque}/>
            <DL label="Marque / Modèle" value={`${veOpen.marque} ${veOpen.modele}`}/>
            <DL label="Places" value={`${veOpen.places}${veOpen.places_handi?` + ${veOpen.places_handi} handi`:""}`}/>
            <DL label="Circuit"    value={(veOpen.circuit as {nom?:string}|undefined)?.nom||"Non assigné"}/>
            <DL label="Assurance"  value={veOpen.assurance_date||"—"}/>
          </div>
          <Inp label="Kilométrage actuel" type="number" value={veF.km}
            onChange={v=>setVeF(p=>({...p,km:v}))}/>
          <Inp label="Prochain CT (MM.YYYY)" value={veF.ct_date} placeholder="ex: 06.2026"
            onChange={v=>setVeF(p=>({...p,ct_date:v}))}/>
          <Sel label="État du véhicule" value={veF.etat}
            onChange={v=>setVeF(p=>({...p,etat:v}))}
            opts={Object.entries(VS).map(([k,c])=>({v:k,l:`${c.e} ${c.l}`}))}/>
          <TA label="Notes techniques" value={veF.notes}
            onChange={v=>setVeF(p=>({...p,notes:v}))}
            placeholder="Observations, historique, alertes particulières…"/>

          {/* Historique réparations du véhicule */}
          {(()=>{
            const vReps=reparations.filter(r=>r.vehicule_id===veOpen.id&&r.statut==="remis_en_circulation");
            if (!vReps.length) return null;
            return (
              <div style={{marginTop:8,marginBottom:16}}>
                <p style={{fontSize:13,fontWeight:700,color:M.gray,marginBottom:8}}>
                  📋 Historique réparations ({vReps.length})
                </p>
                {vReps.slice(0,3).map(r=>(
                  <div key={r.id} style={{fontSize:12,color:"#475569",padding:"4px 0",
                    borderBottom:"1px solid #F1F5F9"}}>
                    {fd(r.date_remise_circulation)} — {r.description.slice(0,50)}
                    {r.cout!=null&&<span style={{float:"right",fontWeight:700,color:M.navy}}>
                      {r.cout.toLocaleString("fr-CH")} CHF
                    </span>}
                  </div>
                ))}
              </div>
            );
          })()}

          <Btn label="💾 Enregistrer" full onClick={handleVeEdit}/>
        </BSheet>
      )}

      {/* ── Détail historique ── */}
      {detailOpen&&(
        <BSheet title="Fiche réparation" onClose={()=>setDetailOpen(null)}>
          <RepCard rep={detailOpen} actions={false}/>
          <Btn label="🖨 Imprimer" outline color={M.navy} full onClick={()=>window.print()}/>
        </BSheet>
      )}

    </div>
  );
}
