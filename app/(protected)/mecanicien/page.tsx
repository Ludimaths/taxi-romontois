"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Vehicule, Reparation, Alerte } from "@/lib/types";

type Tab = "dashboard" | "alertes" | "en_cours" | "revisions" | "historique" | "vehicules";

// ── Palette ──────────────────────────────────────────────────────────────────
const M = {
  navy:"#0D3B7A", green:"#16A34A", amber:"#D97706",
  red:"#DC2626",  blue:"#3B82F6",  purple:"#7C3AED", gray:"#64748B",
};

// ── Budget limite (modifiable par admin) ─────────────────────────────────────
const BUDGET_INTERVENTION = 1000; // CHF — au-delà → en_attente_validation
const KM_ALERTE = 200000;

// ── Status configs ────────────────────────────────────────────────────────────
const VS: Record<string,{l:string;e:string;c:string;bg:string}> = {
  en_service:          {l:"En service",          e:"✅",c:M.green,  bg:"#DCFCE7"},
  receptionne:         {l:"Réceptionné",         e:"👁️",c:M.blue,   bg:"#DBEAFE"},
  en_attente_piece:    {l:"Attente pièce",       e:"⏳",c:M.amber,  bg:"#FEF9C3"},
  en_reparation:       {l:"En réparation",       e:"🔧",c:M.navy,   bg:"#EFF6FF"},
  repare:              {l:"Réparé — en attente", e:"✔️",c:M.purple, bg:"#EDE9FE"},
  attention:           {l:"Attention requise",   e:"⚠️",c:M.red,    bg:"#FEF2F2"},
};
const RS: Record<string,{l:string;c:string}> = {
  receptionne:          {l:"Réceptionné",          c:M.blue},
  en_attente_validation:{l:"En attente validation",c:M.amber},
  en_attente_piece:     {l:"Attente pièce",        c:M.amber},
  en_reparation:        {l:"En réparation",        c:M.navy},
  repare:               {l:"Réparé",               c:M.purple},
  remis_en_circulation: {l:"Remis en circulation", c:M.green},
  annulee:              {l:"Annulée",              c:M.gray},
};
// Transitions standard (hors "receptionne" géré séparément)
const TRANS: Record<string,{label:string;to:string}[]> = {
  en_attente_piece:    [{label:"📦 Pièce reçue — Commencer",to:"en_reparation"}],
  en_reparation:       [{label:"✔️ Marquer réparé",         to:"repare"}],
  repare:              [{label:"🚌 Remettre en circulation", to:"remis_en_circulation"}],
};
const URGENCES = [
  {v:"normal",    l:"🟢 Normal"},
  {v:"urgent",    l:"🟡 Urgent"},
  {v:"tres_urgent",l:"🟠 Très urgent"},
  {v:"bloquant",  l:"🔴 Bloquant (véhicule immobilisé)"},
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fd = (d?:string|null) => d ? new Date(d).toLocaleDateString("fr-CH") : "—";
const todayStr = () => new Date().toISOString().slice(0,10);
function nbJours(a:string, b:string) { return Math.round((+new Date(b) - +new Date(a)) / 86400000); }
function ctCheck(ct?:string|null):{label:string;c:string}|null {
  if (!ct) return null;
  const [mm,yy] = ct.split(".");
  if (!mm||!yy) return null;
  const exp = new Date(+yy,+mm-1,1), now = new Date(), in3m = new Date();
  in3m.setMonth(now.getMonth()+3);
  if (exp < now)  return {label:`CT expiré (${ct})`,  c:M.red};
  if (exp < in3m) return {label:`CT bientôt (${ct})`, c:M.amber};
  return null;
}

// ── Micro-components ──────────────────────────────────────────────────────────
function VBadge({s}:{s:string}) {
  const v=VS[s]; if(!v) return null;
  return <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",
    borderRadius:20,fontSize:12,fontWeight:700,background:v.bg,color:v.c}}>{v.e} {v.l}</span>;
}
function RBadge({s}:{s:string}) {
  const r=RS[s]; if(!r) return null;
  return <span style={{padding:"3px 10px",borderRadius:20,fontSize:12,
    fontWeight:700,background:"#F1F5F9",color:r.c}}>● {r.l}</span>;
}
function BSheet({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}) {
  return (
    <div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"flex-end",
      background:"rgba(0,0,0,0.55)"}} onClick={onClose}>
      <div style={{width:"100%",maxHeight:"93vh",overflowY:"auto",background:"#fff",
        borderRadius:"20px 20px 0 0",padding:"20px 20px 48px"}} onClick={e=>e.stopPropagation()}>
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
const baseInp: React.CSSProperties = {width:"100%",padding:"11px 14px",borderRadius:10,
  border:"1px solid #CBD5E1",fontSize:15,color:"#1E293B",background:"#fff"};
function Inp({label,type="text",value,onChange,placeholder=""}:{
  label:string;type?:string;value:string;onChange:(v:string)=>void;placeholder?:string
}) {
  return (
    <div style={{marginBottom:14}}>
      <label style={{display:"block",fontSize:13,fontWeight:700,color:M.gray,marginBottom:5}}>{label}</label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder} style={baseInp}/>
    </div>
  );
}
function TA({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}) {
  return (
    <div style={{marginBottom:14}}>
      <label style={{display:"block",fontSize:13,fontWeight:700,color:M.gray,marginBottom:5}}>{label}</label>
      <textarea value={value} onChange={e=>onChange(e.target.value)} rows={3}
        style={{...baseInp,resize:"vertical"} as React.CSSProperties}/>
    </div>
  );
}
function Sel({label,value,onChange,opts}:{label:string;value:string;onChange:(v:string)=>void;opts:{v:string;l:string}[]}) {
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
function NavBtn({label,onClick,color=M.navy,full=false,outline=false}:{
  label:string;onClick:()=>void;color?:string;full?:boolean;outline?:boolean
}) {
  return (
    <button onClick={onClick} style={{
      padding:"11px 18px",borderRadius:12,fontWeight:700,fontSize:14,cursor:"pointer",
      border:outline?`2px solid ${color}`:"none",
      background:outline?"transparent":color,
      color:outline?color:"#fff",
      width:full?"100%":"auto",marginBottom:8,marginRight:outline?8:0,
    }}>{label}</button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MecanicienPage() {
  const sb = createClient();
  const [vehicules,   setVehicules]   = useState<Vehicule[]>([]);
  const [reparations, setReparations] = useState<Reparation[]>([]);
  const [alertes,     setAlertes]     = useState<Alerte[]>([]);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [loading, setLoading] = useState(true);

  // Modal : réceptionner un véhicule
  const [addOpen, setAddOpen] = useState(false);
  const [addF, setAddF] = useState({vehicule_id:"",description:"",km_reception:"",date_reception:todayStr()});

  // Modal : créer une réparation (depuis "receptionne")
  const [createRepOpen, setCreateRepOpen] = useState<Reparation|null>(null);
  const freshCRF = () => ({
    type_intervention:"interne" as "interne"|"externe"|"piece",
    nom_garage:"",
    piece_nom:"",piece_fournisseur:"",
    date_commande_piece:"",date_reception_piece_estimee:"",
    urgence:"normal",
    cout_estime:"",
    date_debut_reparation:todayStr(),
  });
  const [crF, setCrF] = useState(freshCRF());

  // Modal : modifier véhicule
  const [veOpen, setVeOpen] = useState<Vehicule|null>(null);
  const [veF, setVeF] = useState({km:"",ct_date:"",etat:"",notes:""});

  // Modal : transition workflow (hors réception)
  const [tmOpen, setTmOpen] = useState<{rep:Reparation;to:string}|null>(null);
  const freshTF = () => ({
    date_reception_piece_reelle:"",
    date_debut_reparation:todayStr(),
    date_fin_reparation:todayStr(),cout:"",commentaire_mecanicien:"",km_sortie:"",
    date_remise_circulation:todayStr(),
  });
  const [tmF, setTmF] = useState(freshTF());

  // Modal : détail historique
  const [detailOpen, setDetailOpen] = useState<Reparation|null>(null);

  // Historique filters
  const [histVeh, setHistVeh] = useState("all");
  const [histPer, setHistPer] = useState("all");

  const load = useCallback(async () => {
    const [v, r, a] = await Promise.all([
      sb.from("vehicules").select("*,circuit(*)").order("plaque"),
      sb.from("reparations").select("*,vehicule(plaque,marque,modele)").order("created_at",{ascending:false}),
      sb.from("alertes").select("*")
        .in("type",["vehicule","reparation","validation_requise","remise_circulation","transmis_meca"])
        .eq("read",false).order("created_at",{ascending:false}),
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
      .on("postgres_changes",{event:"*",schema:"public",table:"incidents"},load)
      .subscribe();
    return ()=>{ sb.removeChannel(ch); };
  },[load,sb]);

  // ── Computed ──────────────────────────────────────────────────────────────
  const now = new Date();
  const m0  = new Date(now.getFullYear(),now.getMonth(),1).toISOString();
  const budgetMois = reparations
    .filter(r=>["en_reparation","repare","remis_en_circulation"].includes(r.statut)&&r.created_at>=m0)
    .reduce((s,r)=>s+(r.cout||0),0);
  const activeReps  = reparations.filter(r=>!["remis_en_circulation","annulee"].includes(r.statut));
  const histReps    = reparations.filter(r=>r.statut==="remis_en_circulation");
  const inAtelier   = vehicules.filter(v=>["receptionne","en_attente_piece","en_reparation","repare"].includes(v.etat));
  const urgentVehs  = vehicules.filter(v=>ctCheck(v.ct_date)||v.km>=KM_ALERTE);

  // ── Handlers ─────────────────────────────────────────────────────────────
  async function handleAddRepair() {
    const {vehicule_id,description,km_reception,date_reception}=addF;
    if (!vehicule_id||!description.trim()) return;
    await sb.from("reparations").insert({
      vehicule_id,description,
      km_reception:km_reception?+km_reception:null,
      date_reception:date_reception||null,
      statut:"receptionne",alerte_envoyee:false,
    });
    await sb.from("vehicules").update({etat:"receptionne"}).eq("id",vehicule_id);
    setAddOpen(false);
    setAddF({vehicule_id:"",description:"",km_reception:"",date_reception:todayStr()});
  }

  async function handleCreateRep() {
    if (!createRepOpen) return;
    const rep = createRepOpen;
    const f = crF;
    const cout = f.cout_estime ? +f.cout_estime : 0;

    // Déterminer le prochain statut
    let nextStatus: string;
    let nextVehicleState: string;
    if (f.type_intervention === "piece") {
      nextStatus = "en_attente_piece";
      nextVehicleState = "en_attente_piece";
    } else if (cout >= BUDGET_INTERVENTION) {
      nextStatus = "en_attente_validation";
      nextVehicleState = "receptionne"; // reste réceptionné en attente de validation
    } else {
      nextStatus = "en_reparation";
      nextVehicleState = "en_reparation";
    }

    const upd: Record<string,unknown> = {
      statut: nextStatus,
      type_intervention: f.type_intervention,
      nom_garage: f.type_intervention==="externe" ? f.nom_garage : null,
      piece_nom: f.type_intervention==="piece" ? f.piece_nom : null,
      piece_fournisseur: f.type_intervention==="piece" ? f.piece_fournisseur : null,
      date_commande_piece: f.date_commande_piece||null,
      date_reception_piece_estimee: f.date_reception_piece_estimee||null,
      cout_estime: cout||null,
      date_debut_reparation: f.type_intervention!=="piece" ? (f.date_debut_reparation||null) : null,
      responsable: `${f.type_intervention}|${f.urgence}`,
    };
    await sb.from("reparations").update(upd).eq("id",rep.id);
    await sb.from("vehicules").update({etat:nextVehicleState}).eq("id",rep.vehicule_id);

    // Si en attente validation → créer alerte pour gestionnaire
    if (nextStatus === "en_attente_validation") {
      await sb.from("alertes").insert({
        type: "validation_requise",
        severity: "haute",
        message: `Réparation ${(rep.vehicule as {plaque?:string}|undefined)?.plaque||""} en attente de validation — Coût estimé : ${cout.toLocaleString("fr-CH")} CHF`,
        vehicle_id: rep.vehicule_id,
        read: false,
      });
    }
    setCreateRepOpen(null);
  }

  async function handleVeEdit() {
    if (!veOpen) return;
    await sb.from("vehicules").update({
      km:veF.km?+veF.km:veOpen.km,
      ct_date:veF.ct_date||null,
      etat:veF.etat||veOpen.etat,
      notes:veF.notes,
    }).eq("id",veOpen.id);
    setVeOpen(null);
  }

  async function handleTransition() {
    if (!tmOpen) return;
    const {rep,to}=tmOpen; const f=tmF;
    const upd: Record<string,unknown>={statut:to};

    if (to==="en_reparation"&&rep.statut==="en_attente_piece") {
      upd.date_reception_piece_reelle=f.date_reception_piece_reelle||null;
      upd.date_debut_reparation=f.date_debut_reparation||null;
      await sb.from("vehicules").update({etat:"en_reparation"}).eq("id",rep.vehicule_id);
    }
    if (to==="repare") {
      upd.date_fin_reparation=f.date_fin_reparation||null;
      upd.cout=f.cout?+f.cout:null;
      upd.commentaire_mecanicien=f.commentaire_mecanicien||null;
      upd.km_sortie=f.km_sortie?+f.km_sortie:null;
      if (rep.date_debut_reparation&&f.date_fin_reparation)
        upd.duree_jours=nbJours(rep.date_debut_reparation,f.date_fin_reparation);
      await sb.from("vehicules").update({etat:"repare"}).eq("id",rep.vehicule_id);
    }
    if (to==="remis_en_circulation") {
      upd.date_remise_circulation=f.date_remise_circulation||null;
      await sb.from("vehicules").update({etat:"en_service"}).eq("id",rep.vehicule_id);
      // Notification gestionnaire
      await sb.from("alertes").insert({
        type:"remise_circulation",
        severity:"normale",
        message:`Véhicule ${(rep.vehicule as {plaque?:string}|undefined)?.plaque||""} remis en service le ${fd(f.date_remise_circulation)}`,
        vehicle_id:rep.vehicule_id,
        read:false,
      });
    }
    await sb.from("reparations").update(upd).eq("id",rep.id);
    setTmOpen(null);
  }

  async function markAlertRead(id:number) {
    await sb.from("alertes").update({read:true,read_at:new Date().toISOString()}).eq("id",id);
  }

  function openVe(v:Vehicule){setVeOpen(v);setVeF({km:String(v.km),ct_date:v.ct_date||"",etat:v.etat,notes:v.notes||""});}
  function openTrans(rep:Reparation,to:string){setTmOpen({rep,to});setTmF(freshTF());}

  // ── Historique filter ─────────────────────────────────────────────────────
  const histFiltered = histReps.filter(r=>{
    if (histVeh!=="all"&&r.vehicule_id!==histVeh) return false;
    if (histPer==="mois"&&r.created_at<m0) return false;
    if (histPer==="3mois"){const d=new Date();d.setMonth(d.getMonth()-3);if(r.created_at<d.toISOString())return false;}
    if (histPer==="annee"){const d=new Date();d.setFullYear(d.getFullYear()-1);if(r.created_at<d.toISOString())return false;}
    return true;
  });

  // ── Repair card ───────────────────────────────────────────────────────────
  function RepCard({rep,showActions=true}:{rep:Reparation;showActions?:boolean}) {
    type VMin={plaque:string;marque:string;modele:string};
    const v=rep.vehicule as VMin|undefined;
    const trans=TRANS[rep.statut]||[];
    const duree=rep.date_debut_reparation&&rep.date_fin_reparation
      ?nbJours(rep.date_debut_reparation,rep.date_fin_reparation):null;
    const [type,urgence] = (rep.responsable||"").split("|");
    return (
      <div style={{background:"#fff",borderRadius:16,padding:16,marginBottom:12,
        boxShadow:"0 2px 8px rgba(0,0,0,0.06)",borderLeft:`4px solid ${RS[rep.statut]?.c??M.gray}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
          <div>
            <div style={{fontWeight:800,fontSize:16,color:M.navy}}>
              {v?.plaque}{" "}<span style={{fontWeight:400,color:M.gray,fontSize:14}}>{v?.marque} {v?.modele}</span>
            </div>
            <RBadge s={rep.statut}/>
            {urgence&&urgence!=="normal"&&<span style={{marginLeft:8,fontSize:12,fontWeight:700,
              color:urgence==="bloquant"?M.red:urgence==="tres_urgent"?M.amber:M.blue}}>
              {urgence==="bloquant"?"🔴 Bloquant":urgence==="tres_urgent"?"🟠 Très urgent":"🟡 Urgent"}
            </span>}
          </div>
          {rep.cout&&<div style={{fontWeight:800,color:M.navy,fontSize:16}}>{rep.cout.toLocaleString("fr-CH")} CHF</div>}
        </div>
        <p style={{fontSize:14,color:"#1E293B",marginBottom:10,lineHeight:1.5}}>{rep.description}</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
          {rep.date_reception             &&<DL label="Réceptionné"     value={fd(rep.date_reception)}/>}
          {rep.km_reception               &&<DL label="Km réception"    value={`${rep.km_reception.toLocaleString()} km`}/>}
          {rep.piece_nom                  &&<DL label="Pièce"           value={`${rep.piece_nom}${rep.piece_fournisseur?` — ${rep.piece_fournisseur}`:""}`}/>}
          {rep.date_commande_piece        &&<DL label="Commandée le"    value={fd(rep.date_commande_piece)}/>}
          {rep.date_reception_piece_estimee&&<DL label="Réception est." value={fd(rep.date_reception_piece_estimee)}/>}
          {rep.date_reception_piece_reelle &&<DL label="Pièce reçue"   value={fd(rep.date_reception_piece_reelle)}/>}
          {rep.date_debut_reparation      &&<DL label="Début réparat."  value={fd(rep.date_debut_reparation)}/>}
          {type&&<DL label="Type" value={type==="externe"?`Externe${rep.nom_garage?` — ${rep.nom_garage}`:""}`:type==="piece"?"Pièce détachée":"Interne"}/>}
          {rep.cout_estime                &&<DL label="Coût estimé"    value={`${rep.cout_estime.toLocaleString("fr-CH")} CHF`}/>}
          {rep.date_fin_reparation        &&<DL label="Fin réparation"  value={fd(rep.date_fin_reparation)}/>}
          {duree!==null                   &&<DL label="Durée totale"    value={`${duree} jour${duree>1?"s":""}`}/>}
          {rep.km_sortie                  &&<DL label="Km sortie"       value={`${rep.km_sortie.toLocaleString()} km`}/>}
          {rep.date_remise_circulation    &&<DL label="Remis en service" value={fd(rep.date_remise_circulation)}/>}
        </div>
        {rep.commentaire_mecanicien&&(
          <div style={{marginTop:10,padding:10,background:"#F8FAFC",borderRadius:10,fontSize:13,fontStyle:"italic"}}>
            💬 {rep.commentaire_mecanicien}
          </div>
        )}
        {showActions&&(
          <div style={{marginTop:14,display:"flex",flexWrap:"wrap",gap:8}}>
            {/* Étape 1 → Créer une réparation */}
            {rep.statut==="receptionne"&&(
              <button onClick={()=>{setCreateRepOpen(rep);setCrF(freshCRF());}}
                style={{padding:"10px 18px",borderRadius:10,fontWeight:700,fontSize:14,cursor:"pointer",
                  border:"none",background:M.navy,color:"#fff"}}>
                🔧 Créer une réparation
              </button>
            )}
            {/* En attente validation : info */}
            {rep.statut==="en_attente_validation"&&(
              <div style={{fontSize:13,color:M.amber,fontWeight:700,padding:"10px 0"}}>
                ⏳ En attente de validation par le gestionnaire
              </div>
            )}
            {/* Transitions standard */}
            {trans.map(t=>(
              <button key={t.to} onClick={()=>openTrans(rep,t.to)}
                style={{padding:"10px 18px",borderRadius:10,fontWeight:700,fontSize:14,cursor:"pointer",
                  border:"none",background:M.navy,color:"#fff"}}>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{display:"flex",justifyContent:"center",alignItems:"center",minHeight:"60vh",color:M.gray}}>
      Chargement…
    </div>
  );

  const TABS: {id:Tab;label:string;badge?:number}[] = [
    {id:"dashboard",  label:"Dashboard"},
    {id:"alertes",    label:"Alertes",    badge:alertes.length||undefined},
    {id:"en_cours",   label:"En cours",   badge:activeReps.length||undefined},
    {id:"revisions",  label:"Révisions",  badge:urgentVehs.length||undefined},
    {id:"historique", label:"Historique"},
    {id:"vehicules",  label:"Véhicules"},
  ];

  return (
    <div style={{maxWidth:900,margin:"0 auto"}}>

      {/* Header */}
      <div style={{marginBottom:24}}>
        <h1 style={{fontSize:24,fontWeight:900,color:M.navy}}>🔧 Atelier mécanique</h1>
        <p style={{color:M.gray,fontSize:14,marginTop:4}}>Gestion des réparations et contrôles techniques</p>
      </div>

      {/* Stat cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:16}}>
        {[
          {label:"Véhicules",          val:vehicules.length,   icon:"🚌",c:M.navy, bg:"#EFF6FF"},
          {label:"En atelier",         val:inAtelier.length,   icon:"🔧",c:M.amber,bg:"#FFFBEB"},
          {label:"Alertes non lues",   val:alertes.length,     icon:"🔔",c:M.red,  bg:"#FEF2F2", click:()=>setTab("alertes")},
          {label:"Réparations actives",val:activeReps.length,  icon:"📋",c:M.blue, bg:"#DBEAFE", click:()=>setTab("en_cours")},
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
      <div style={{background:"#fff",borderRadius:16,padding:16,marginBottom:24,
        boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
          <span style={{fontWeight:700,color:M.navy,fontSize:14}}>Budget réparations — mois en cours</span>
          <span style={{fontWeight:800,color:budgetMois>BUDGET_INTERVENTION*5?M.red:M.navy,fontSize:14}}>
            {budgetMois.toLocaleString("fr-CH")} CHF
          </span>
        </div>
        <div style={{fontSize:12,color:M.gray,marginBottom:6}}>
          Limite par intervention : {BUDGET_INTERVENTION.toLocaleString("fr-CH")} CHF
          (au-delà → validation gestionnaire)
        </div>
        <div style={{background:"#E2E8F0",borderRadius:99,height:6}}>
          <div style={{background:M.green,borderRadius:99,height:6,
            width:`${Math.min(100,(budgetMois/(BUDGET_INTERVENTION*10))*100)}%`}}/>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:20,paddingBottom:4}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"10px 14px",borderRadius:12,border:"none",cursor:"pointer",
              fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap",
              background:tab===t.id?M.navy:"#E2E8F0",color:tab===t.id?"#fff":M.gray}}>
            {t.label}
            {t.badge?(
              <span style={{background:tab===t.id?"rgba(255,255,255,0.25)":M.red,color:"#fff",
                borderRadius:20,padding:"1px 6px",fontSize:11,fontWeight:800}}>{t.badge}</span>
            ):null}
          </button>
        ))}
      </div>

      {/* ── DASHBOARD ────────────────────────────────────────────────────────── */}
      {tab==="dashboard"&&(
        <div>
          {alertes.length>0&&(
            <div style={{background:"#FEF2F2",borderRadius:14,padding:16,marginBottom:20,
              border:"1px solid #FECACA"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:800,color:M.red,fontSize:15}}>🔔 {alertes.length} alerte(s) non lue(s)</span>
                <button onClick={()=>setTab("alertes")}
                  style={{fontSize:13,color:M.red,background:"none",border:"none",cursor:"pointer",fontWeight:700}}>
                  Voir toutes →
                </button>
              </div>
            </div>
          )}
          {activeReps.length===0?(
            <div style={{textAlign:"center",padding:"48px 20px",color:M.gray}}>
              <div style={{fontSize:44}}>✅</div>
              <p style={{fontWeight:700,fontSize:16,marginTop:12}}>Aucune réparation en cours</p>
            </div>
          ):(
            <>
              <h2 style={{fontSize:15,fontWeight:800,color:M.navy,marginBottom:12}}>
                Réparations en cours ({activeReps.length})
              </h2>
              {activeReps.slice(0,3).map(r=><RepCard key={r.id} rep={r}/>)}
              {activeReps.length>3&&(
                <button onClick={()=>setTab("en_cours")}
                  style={{width:"100%",padding:14,borderRadius:12,border:`2px solid ${M.navy}`,
                    background:"transparent",color:M.navy,fontWeight:700,fontSize:15,cursor:"pointer",marginBottom:20}}>
                  Voir toutes ({activeReps.length})
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── ALERTES ──────────────────────────────────────────────────────────── */}
      {tab==="alertes"&&(
        <div>
          <h2 style={{fontSize:15,fontWeight:800,color:M.navy,marginBottom:16}}>
            Alertes non lues ({alertes.length})
          </h2>
          {alertes.length===0?(
            <div style={{textAlign:"center",padding:"60px 20px",color:M.gray}}>
              <div style={{fontSize:48}}>🔔</div>
              <p style={{fontWeight:700,marginTop:12}}>Aucune alerte</p>
            </div>
          ):alertes.map(a=>{
            const sev=a.severity;
            const sevColor=sev==="critique"?M.red:sev==="haute"?M.amber:M.blue;
            const sevBg=sev==="critique"?"#FEF2F2":sev==="haute"?"#FFFBEB":"#DBEAFE";
            const v=vehicules.find(veh=>veh.id===a.vehicle_id);
            return (
              <div key={a.id} style={{background:sevBg,borderRadius:16,padding:16,marginBottom:12,
                borderLeft:`4px solid ${sevColor}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",
                  marginBottom:8,flexWrap:"wrap",gap:8}}>
                  <div>
                    <span style={{fontSize:12,fontWeight:800,color:sevColor,textTransform:"uppercase",
                      letterSpacing:0.5}}>
                      {sev==="critique"?"🔴 Critique":sev==="haute"?"🟠 Haute":"🔵 Normale"}
                    </span>
                    <div style={{fontWeight:700,fontSize:14,color:"#1E293B",marginTop:4}}>{a.message}</div>
                    <div style={{fontSize:12,color:M.gray,marginTop:2}}>
                      {a.type} · {new Date(a.created_at).toLocaleDateString("fr-CH")}
                    </div>
                  </div>
                  {v&&<VBadge s={v.etat}/>}
                </div>
                {v&&<div style={{fontSize:13,color:M.navy,fontWeight:700,marginBottom:10}}>
                  🚌 {v.plaque} — {v.marque} {v.modele}
                </div>}
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {a.vehicle_id&&(
                    <button onClick={()=>{
                        setAddF(p=>({...p,vehicule_id:a.vehicle_id!,description:a.message}));
                        setAddOpen(true);
                      }}
                      style={{padding:"10px 16px",borderRadius:10,fontWeight:700,fontSize:14,cursor:"pointer",
                        border:"none",background:M.navy,color:"#fff"}}>
                      👁️ Réceptionner le véhicule
                    </button>
                  )}
                  <button onClick={()=>markAlertRead(a.id)}
                    style={{padding:"10px 16px",borderRadius:10,fontWeight:700,fontSize:14,cursor:"pointer",
                      border:`2px solid ${M.gray}`,background:"transparent",color:M.gray}}>
                    ✓ Marquer comme lu
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── EN COURS ─────────────────────────────────────────────────────────── */}
      {tab==="en_cours"&&(
        <div>
          {activeReps.length===0?(
            <div style={{textAlign:"center",padding:"60px 20px",color:M.gray}}>
              <div style={{fontSize:48}}>✅</div>
              <p style={{fontWeight:700,marginTop:12,fontSize:16}}>Aucune réparation en cours</p>
            </div>
          ):activeReps.map(r=><RepCard key={r.id} rep={r}/>)}
        </div>
      )}

      {/* ── RÉVISIONS ────────────────────────────────────────────────────────── */}
      {tab==="revisions"&&(
        <div>
          {urgentVehs.length===0?(
            <div style={{textAlign:"center",padding:"60px 20px",color:M.gray}}>
              <div style={{fontSize:48}}>✅</div>
              <p style={{fontWeight:700,marginTop:12}}>Tous les véhicules sont à jour</p>
            </div>
          ):urgentVehs.map(v=>{
            const ct=ctCheck(v.ct_date);
            return (
              <div key={v.id} style={{background:"#fff",borderRadius:16,padding:16,marginBottom:12,
                boxShadow:"0 2px 8px rgba(0,0,0,0.06)",borderLeft:`4px solid ${ct?ct.c:M.amber}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",
                  marginBottom:10,flexWrap:"wrap",gap:8}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:16,color:M.navy}}>{v.plaque}</div>
                    <div style={{fontSize:14,color:M.gray}}>{v.marque} {v.modele}</div>
                  </div>
                  <VBadge s={v.etat}/>
                </div>
                {ct&&<div style={{fontSize:14,fontWeight:700,color:ct.c,marginBottom:4}}>⚠️ {ct.label}</div>}
                {v.km>=KM_ALERTE&&<div style={{fontSize:14,fontWeight:700,color:M.amber,marginBottom:4}}>
                  🛞 Kilométrage élevé : {v.km.toLocaleString()} km</div>}
                <div style={{marginTop:12,display:"flex",gap:8,flexWrap:"wrap"}}>
                  <button onClick={()=>{setAddF(p=>({...p,vehicule_id:v.id}));setAddOpen(true);}}
                    style={{padding:"10px 16px",borderRadius:10,fontWeight:700,fontSize:14,cursor:"pointer",
                      border:"none",background:M.navy,color:"#fff"}}>
                    🔧 Créer une réparation
                  </button>
                  <button onClick={()=>openVe(v)}
                    style={{padding:"10px 16px",borderRadius:10,fontWeight:700,fontSize:14,cursor:"pointer",
                      border:`2px solid ${M.navy}`,background:"transparent",color:M.navy}}>
                    📅 Mettre à jour le CT
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── HISTORIQUE ───────────────────────────────────────────────────────── */}
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
          <p style={{color:M.gray,fontSize:13,marginBottom:12}}>{histFiltered.length} réparation(s) terminée(s)</p>
          {histFiltered.length===0?(
            <div style={{textAlign:"center",padding:"60px 20px",color:M.gray}}>
              <div style={{fontSize:48}}>📭</div>
              <p style={{fontWeight:700,marginTop:12}}>Aucune réparation terminée</p>
            </div>
          ):histFiltered.map(r=>{
            type VMin={plaque?:string;marque?:string;modele?:string};
            const vv=r.vehicule as VMin|undefined;
            const duree=r.date_debut_reparation&&r.date_fin_reparation
              ?nbJours(r.date_debut_reparation,r.date_fin_reparation):null;
            return (
              <div key={r.id} style={{background:"#fff",borderRadius:16,padding:16,marginBottom:12,
                boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",
                  marginBottom:8,flexWrap:"wrap",gap:8}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:15,color:M.navy}}>
                      {vv?.plaque} <span style={{color:M.gray,fontWeight:400,fontSize:13}}>{vv?.marque} {vv?.modele}</span>
                    </div>
                    <RBadge s={r.statut}/>
                  </div>
                  <div style={{textAlign:"right"}}>
                    {r.cout&&<div style={{fontWeight:800,color:M.navy}}>{r.cout.toLocaleString("fr-CH")} CHF</div>}
                    <button onClick={()=>setDetailOpen(r)}
                      style={{fontSize:13,color:M.blue,background:"none",border:"none",cursor:"pointer",fontWeight:700,marginTop:4}}>
                      Détails →
                    </button>
                  </div>
                </div>
                <p style={{fontSize:14,color:"#475569",marginBottom:8}}>{r.description}</p>
                <div style={{display:"flex",gap:12,fontSize:13,color:M.gray,flexWrap:"wrap"}}>
                  {r.date_reception&&<span>📥 {fd(r.date_reception)}</span>}
                  {r.date_fin_reparation&&<span>✅ {fd(r.date_fin_reparation)}</span>}
                  {duree!==null&&<span>⏱ {duree}j</span>}
                  {r.date_remise_circulation&&<span>🚌 {fd(r.date_remise_circulation)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── VÉHICULES ────────────────────────────────────────────────────────── */}
      {tab==="vehicules"&&(
        <div>
          {vehicules.map(v=>{
            const ct=ctCheck(v.ct_date);
            type CMin={nom?:string;num?:string}; type DMin={prenom?:string;nom?:string};
            const circ=v.circuit as CMin|undefined;
            const cond=v.conducteur as DMin|undefined;
            return (
              <div key={v.id} style={{background:"#fff",borderRadius:16,padding:16,marginBottom:10,
                boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",
                  marginBottom:8,flexWrap:"wrap",gap:8}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:16,color:M.navy}}>{v.plaque}</div>
                    <div style={{fontSize:14,color:M.gray}}>{v.marque} {v.modele} · {v.places} places</div>
                  </div>
                  <VBadge s={v.etat}/>
                </div>
                <div style={{display:"flex",gap:12,fontSize:13,color:M.gray,flexWrap:"wrap",marginBottom:8}}>
                  <span>🛞 {v.km.toLocaleString()} km</span>
                  {v.ct_date&&<span style={{color:ct?ct.c:"#059669",fontWeight:ct?700:400}}>CT: {v.ct_date}</span>}
                  {circ&&<span>🔒 {circ.num||circ.nom||""}</span>}
                  {cond&&<span>🔒 {cond.prenom} {cond.nom}</span>}
                </div>
                {ct&&<div style={{fontSize:13,fontWeight:700,color:ct.c,marginBottom:8}}>⚠️ {ct.label}</div>}
                {v.notes&&<p style={{fontSize:13,color:"#475569",fontStyle:"italic",marginBottom:8}}>📝 {v.notes}</p>}
                <button onClick={()=>openVe(v)}
                  style={{padding:"9px 16px",borderRadius:10,fontWeight:700,fontSize:14,cursor:"pointer",
                    border:`2px solid ${M.navy}`,background:"transparent",color:M.navy}}>
                  ✏️ Modifier
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* FAB */}
      <button onClick={()=>setAddOpen(true)}
        style={{position:"fixed",bottom:24,right:24,zIndex:90,background:M.navy,color:"#fff",
          border:"none",borderRadius:20,padding:"14px 22px",fontSize:15,fontWeight:800,cursor:"pointer",
          boxShadow:"0 4px 20px rgba(13,59,122,0.35)"}}>
        + Réceptionner
      </button>

      {/* ═══════════════════════ MODALS ════════════════════════════════════════ */}

      {/* Réceptionner un véhicule */}
      {addOpen&&(
        <BSheet title="Réceptionner un véhicule" onClose={()=>setAddOpen(false)}>
          <Sel label="Véhicule *" value={addF.vehicule_id} onChange={v=>setAddF(p=>({...p,vehicule_id:v}))}
            opts={[{v:"",l:"— Choisir un véhicule —"},...vehicules.map(v=>({v:v.id,l:`${v.plaque} — ${v.marque} ${v.modele}`}))]}/>
          <TA label="Problème observé *" value={addF.description} onChange={v=>setAddF(p=>({...p,description:v}))}/>
          <Inp label="Kilométrage à la réception" type="number" value={addF.km_reception}
            onChange={v=>setAddF(p=>({...p,km_reception:v}))}/>
          <Inp label="Date de réception" type="date" value={addF.date_reception}
            onChange={v=>setAddF(p=>({...p,date_reception:v}))}/>
          <NavBtn label="Réceptionner le véhicule" onClick={handleAddRepair} full/>
        </BSheet>
      )}

      {/* Créer une réparation (depuis "receptionne") */}
      {createRepOpen&&(
        <BSheet title="Créer une réparation" onClose={()=>setCreateRepOpen(null)}>
          <div style={{background:"#EFF6FF",borderRadius:12,padding:12,marginBottom:16,fontSize:13,color:M.navy,fontWeight:600}}>
            🚌 {(createRepOpen.vehicule as {plaque?:string}|undefined)?.plaque} — {createRepOpen.description}
          </div>
          <Sel label="Type d'intervention" value={crF.type_intervention}
            onChange={v=>setCrF(p=>({...p,type_intervention:v as "interne"|"externe"|"piece"}))}
            opts={[{v:"interne",l:"🏭 Interne (atelier)"},{v:"externe",l:"🏗️ Externe (garage)"},{v:"piece",l:"🔩 Commande de pièce"}]}/>
          {crF.type_intervention==="externe"&&(
            <Inp label="Nom du garage" value={crF.nom_garage} onChange={v=>setCrF(p=>({...p,nom_garage:v}))}/>
          )}
          {crF.type_intervention==="piece"&&<>
            <Inp label="Pièce commandée" value={crF.piece_nom} onChange={v=>setCrF(p=>({...p,piece_nom:v}))}/>
            <Inp label="Fournisseur" value={crF.piece_fournisseur} onChange={v=>setCrF(p=>({...p,piece_fournisseur:v}))}/>
            <Inp label="Date de commande" type="date" value={crF.date_commande_piece}
              onChange={v=>setCrF(p=>({...p,date_commande_piece:v}))}/>
            <Inp label="Réception estimée" type="date" value={crF.date_reception_piece_estimee}
              onChange={v=>setCrF(p=>({...p,date_reception_piece_estimee:v}))}/>
          </>}
          <Sel label="Niveau d'urgence" value={crF.urgence} onChange={v=>setCrF(p=>({...p,urgence:v}))} opts={URGENCES}/>
          <Inp label="Coût estimé (CHF)" type="number" value={crF.cout_estime}
            onChange={v=>setCrF(p=>({...p,cout_estime:v}))}/>
          {crF.cout_estime&&+crF.cout_estime>=BUDGET_INTERVENTION&&(
            <div style={{background:"#FFFBEB",borderRadius:10,padding:12,marginBottom:14,
              fontSize:13,color:M.amber,fontWeight:700}}>
              ⚠️ Coût ≥ {BUDGET_INTERVENTION.toLocaleString()} CHF — sera soumis à validation du gestionnaire
            </div>
          )}
          {crF.type_intervention!=="piece"&&(
            <Inp label="Date de début" type="date" value={crF.date_debut_reparation}
              onChange={v=>setCrF(p=>({...p,date_debut_reparation:v}))}/>
          )}
          <NavBtn label="Confirmer" onClick={handleCreateRep} color={M.green} full/>
        </BSheet>
      )}

      {/* Modifier véhicule */}
      {veOpen&&(
        <BSheet title={`Modifier — ${veOpen.plaque}`} onClose={()=>setVeOpen(null)}>
          <div style={{background:"#F8FAFC",borderRadius:12,padding:12,marginBottom:16}}>
            <p style={{fontSize:12,fontWeight:700,color:M.gray,marginBottom:8}}>🔒 Champs verrouillés</p>
            <DL label="Immatriculation" value={veOpen.plaque}/>
            <DL label="Circuit"    value={(veOpen.circuit as {nom?:string}|undefined)?.nom||"Non assigné"}/>
            <DL label="Conducteur" value={(veOpen.conducteur as {prenom?:string;nom?:string}|undefined)
              ?`${(veOpen.conducteur as {prenom?:string}).prenom||""} ${(veOpen.conducteur as {nom?:string}).nom||""}`.trim()
              :"Non assigné"}/>
          </div>
          <Inp label="Kilométrage actuel" type="number" value={veF.km} onChange={v=>setVeF(p=>({...p,km:v}))}/>
          <Inp label="Prochain CT (MM.YYYY)" value={veF.ct_date} placeholder="ex: 06.2026"
            onChange={v=>setVeF(p=>({...p,ct_date:v}))}/>
          <Sel label="État du véhicule" value={veF.etat} onChange={v=>setVeF(p=>({...p,etat:v}))}
            opts={Object.entries(VS).map(([k,c])=>({v:k,l:`${c.e} ${c.l}`}))}/>
          <TA label="Notes techniques" value={veF.notes} onChange={v=>setVeF(p=>({...p,notes:v}))}/>
          <NavBtn label="Enregistrer" onClick={handleVeEdit} full/>
        </BSheet>
      )}

      {/* Transition workflow */}
      {tmOpen&&(()=>{
        const {rep,to}=tmOpen;
        return (
          <BSheet title={
            to==="en_reparation"?"Pièce reçue — Démarrer la réparation":
            to==="repare"?"Marquer le véhicule réparé":
            "Remettre en circulation"
          } onClose={()=>setTmOpen(null)}>
            {to==="en_reparation"&&<>
              <Inp label="Date de réception de la pièce" type="date" value={tmF.date_reception_piece_reelle}
                onChange={v=>setTmF(p=>({...p,date_reception_piece_reelle:v}))}/>
              <Inp label="Date de début de réparation" type="date" value={tmF.date_debut_reparation}
                onChange={v=>setTmF(p=>({...p,date_debut_reparation:v}))}/>
            </>}
            {to==="repare"&&<>
              <Inp label="Date de fin de réparation" type="date" value={tmF.date_fin_reparation}
                onChange={v=>setTmF(p=>({...p,date_fin_reparation:v}))}/>
              <Inp label="Coût réel final (CHF)" type="number" value={tmF.cout}
                onChange={v=>setTmF(p=>({...p,cout:v}))}/>
              <Inp label="Kilométrage à la sortie" type="number" value={tmF.km_sortie}
                onChange={v=>setTmF(p=>({...p,km_sortie:v}))}/>
              <TA label="Commentaire" value={tmF.commentaire_mecanicien}
                onChange={v=>setTmF(p=>({...p,commentaire_mecanicien:v}))}/>
              {rep.date_debut_reparation&&tmF.date_fin_reparation&&(
                <div style={{background:"#EFF6FF",borderRadius:10,padding:12,marginBottom:14,
                  fontSize:14,fontWeight:700,color:M.navy}}>
                  ⏱ Durée : {nbJours(rep.date_debut_reparation,tmF.date_fin_reparation)} jour(s)
                </div>
              )}
            </>}
            {to==="remis_en_circulation"&&<>
              <div style={{background:"#DCFCE7",borderRadius:12,padding:14,marginBottom:16}}>
                <p style={{fontWeight:700,color:M.green,fontSize:14}}>
                  ✅ Le véhicule repassera en &quot;En service&quot; et le gestionnaire sera notifié automatiquement.
                </p>
              </div>
              <Inp label="Date de remise en service" type="date" value={tmF.date_remise_circulation}
                onChange={v=>setTmF(p=>({...p,date_remise_circulation:v}))}/>
            </>}
            <NavBtn label="Confirmer" onClick={handleTransition} color={M.green} full/>
          </BSheet>
        );
      })()}

      {/* Détail historique */}
      {detailOpen&&(
        <BSheet title="Fiche réparation" onClose={()=>setDetailOpen(null)}>
          <RepCard rep={detailOpen} showActions={false}/>
          <NavBtn label="🖨 Imprimer cette fiche" onClick={()=>window.print()} outline color={M.navy} full/>
        </BSheet>
      )}

    </div>
  );
}
