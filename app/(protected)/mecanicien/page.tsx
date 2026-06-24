"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { C, fmtDate, fmtDateTime, isoToday } from "@/lib/constants";
import type { Vehicule, Reparation, Alerte } from "@/lib/types";

type Tab = "dashboard" | "flotte" | "alertes" | "atelier" | "prets" | "messages";


const BUDGET_SEUIL = 1000;

const VS: Record<string,{l:string;c:string;bg:string}> = {
  en_service:       {l:"En service",     c:C.green,  bg:C.greenL},
  receptionne:      {l:"Réceptionné",   c:C.blue,   bg:C.blueL},
  en_attente_piece: {l:"Attente pièce", c:C.amber,  bg:C.amberL},
  en_reparation:    {l:"En réparation", c:C.navy,   bg:"#EFF6FF"},
  repare:           {l:"Réparé",        c:C.purple, bg:C.purpleL},
  attention:        {l:"Attention",     c:C.red,    bg:C.redL},
  bon:              {l:"En service",    c:C.green,  bg:C.greenL},
  atelier:          {l:"En atelier",    c:C.amber,  bg:C.amberL},
};

const RS: Record<string,{l:string;c:string}> = {
  receptionne:           {l:"Réceptionné",        c:C.blue},
  en_attente_validation: {l:"Attente validation", c:C.amber},
  en_attente_piece:      {l:"Attente pièce",      c:C.amber},
  en_reparation:         {l:"En réparation",      c:C.navy},
  repare:                {l:"Réparé — prêt",      c:C.purple},
  remis_en_circulation:  {l:"Remis en service",   c:C.green},
  annulee:               {l:"Annulée",            c:C.gray},
};

const URGENCES = [
  {v:"normal",     l:"Normal"},
  {v:"urgent",     l:"Urgent"},
  {v:"tres_urgent",l:"Très urgent"},
  {v:"bloquant",   l:"Bloquant (immobilisé)"},
];

function nbJ(a: string, b: string) { return Math.round((+new Date(b) - +new Date(a)) / 86400000); }
function ctCheck(ct?: string | null): { label: string; c: string } | null {
  if (!ct) return null;
  const [mm, yy] = ct.split(".");
  if (!mm || !yy) return null;
  const exp = new Date(+yy, +mm - 1, 1), now = new Date(), in3m = new Date();
  in3m.setMonth(now.getMonth() + 3);
  if (exp < now)  return { label: `CT expiré (${ct})`,  c: C.red };
  if (exp < in3m) return { label: `CT bientôt (${ct})`, c: C.amber };
  return null;
}

// ── Micro-composants ──────────────────────────────────────────────────────────

function ChipV({ s }: { s: string }) {
  const v = VS[s]; if (!v) return null;
  return <span style={{ display:"inline-flex", padding:"4px 12px", borderRadius:20, fontSize:12, fontWeight:700, background:v.bg, color:v.c }}>{v.l}</span>;
}
function ChipR({ s }: { s: string }) {
  const r = RS[s]; if (!r) return null;
  return <span style={{ padding:"4px 12px", borderRadius:20, fontSize:12, fontWeight:700, background:C.gray100, color:r.c }}>● {r.l}</span>;
}

function Sheet({ title, onClose, children }: { title:string; onClose:()=>void; children:React.ReactNode }) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, display:"flex", alignItems:"flex-end", background:"rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div style={{ width:"100%", maxHeight:"94vh", overflowY:"auto", background:C.white, borderRadius:"24px 24px 0 0", padding:"24px 20px 80px" }} onClick={e => e.stopPropagation()}>
        <div style={{ width:40, height:4, background:"#CBD5E1", borderRadius:4, margin:"0 auto 20px" }} />
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <h2 style={{ fontSize:18, fontWeight:800, color:C.navy, margin:0 }}>{title}</h2>
          <button onClick={onClose} style={{ fontSize:28, background:"none", border:"none", cursor:"pointer", color:C.gray, lineHeight:1, padding:"0 4px", minWidth:44, minHeight:44 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { width:"100%", padding:"14px 16px", borderRadius:12, border:"1.5px solid #CBD5E1", fontSize:15, color:"#1E293B", background:C.white, boxSizing:"border-box" };

function F({ label, type="text", value, onChange, placeholder="", required=false }: { label:string; type?:string; value:string; onChange:(v:string)=>void; placeholder?:string; required?:boolean }) {
  return (
    <div style={{ marginBottom:16 }}>
      <label style={{ display:"block", fontSize:13, fontWeight:700, color:C.gray, marginBottom:6 }}>
        {label}{required && <span style={{ color:C.red }}> *</span>}
      </label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inp} />
    </div>
  );
}
function TA({ label, value, onChange, rows=3, placeholder="" }: { label:string; value:string; onChange:(v:string)=>void; rows?:number; placeholder?:string }) {
  return (
    <div style={{ marginBottom:16 }}>
      <label style={{ display:"block", fontSize:13, fontWeight:700, color:C.gray, marginBottom:6 }}>{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder} style={{ ...inp, resize:"vertical" }} />
    </div>
  );
}
function Sel({ label, value, onChange, opts }: { label:string; value:string; onChange:(v:string)=>void; opts:{v:string;l:string}[] }) {
  return (
    <div style={{ marginBottom:16 }}>
      <label style={{ display:"block", fontSize:13, fontWeight:700, color:C.gray, marginBottom:6 }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inp, appearance:"none" } as React.CSSProperties}>{opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
    </div>
  );
}
function DL({ l, v }: { l:string; v:string }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${C.gray100}`, fontSize:14 }}>
      <span style={{ color:C.gray, fontWeight:600 }}>{l}</span>
      <span style={{ color:"#1E293B", fontWeight:700, textAlign:"right", maxWidth:"65%" }}>{v}</span>
    </div>
  );
}
function BigBtn({ icon="", label, onClick, color=C.navy, outline=false, disabled=false }: { icon?:string; label:string; onClick:()=>void; color?:string; outline?:boolean; disabled?:boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width:"100%", padding:"16px 20px", marginBottom:10, borderRadius:16, fontWeight:800, fontSize:15, cursor:disabled?"not-allowed":"pointer", border:outline?`2px solid ${color}`:"none", background:outline?C.white:disabled?"#CBD5E1":color, color:outline?color:C.white, opacity:disabled?0.6:1, display:"flex", alignItems:"center", justifyContent:"center", gap:8, minHeight:52 }}>
      {icon && <span style={{ fontSize:18 }}>{icon}</span>}{label}
    </button>
  );
}
function SmBtn({ label, onClick, color=C.navy, outline=false }: { label:string; onClick:()=>void; color?:string; outline?:boolean }) {
  return <button onClick={onClick} style={{ padding:"10px 16px", borderRadius:12, fontWeight:700, fontSize:13, cursor:"pointer", marginRight:6, marginBottom:6, border:outline?`2px solid ${color}`:"none", background:outline?C.white:color, color:outline?color:C.white }}>{label}</button>;
}
function InfoBox({ msg, color=C.amber, bg=C.amberL }: { msg:string; color?:string; bg?:string }) {
  return <div style={{ background:bg, borderRadius:12, padding:14, marginBottom:16, fontSize:14, color, fontWeight:700, lineHeight:1.5 }}>{msg}</div>;
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function MecanicienPage() {
  const sb = createClient();

  const [vehicules,      setVehicules]      = useState<Vehicule[]>([]);
  const [reparations,    setReparations]    = useState<Reparation[]>([]);
  const [vehicleAlerts,  setVehicleAlerts]  = useState<Alerte[]>([]);
  const [messages,       setMessages]       = useState<Alerte[]>([]);
  const [conducteurs,    setConducteurs]    = useState<{ id:number; prenom:string; nom:string }[]>([]);
  const [tab,            setTab]            = useState<Tab>("dashboard");
  const [loading,        setLoading]        = useState(true);
  const [showMsgHistory, setShowMsgHistory] = useState(false);

  // Modals
  const [alertSheet,  setAlertSheet]  = useState<Alerte | null>(null);
  const [recepOpen,   setRecepOpen]   = useState<{ alerteId?:number; vehicule_id:string; description:string } | null>(null);
  const [recepF,      setRecepF]      = useState({ vehicule_id:"", description:"", km_reception:"", date_reception:isoToday(), etat_visuel:"" });
  const [photos,      setPhotos]      = useState<File[]>([]);
  const [uploading,   setUploading]   = useState(false);

  const freshCRF = () => ({ type_intervention:"interne" as "interne"|"externe"|"piece", nom_garage:"", piece_nom:"", piece_fournisseur:"", date_commande_piece:"", date_reception_piece_estimee:"", urgence:"normal", cout_estime:"", date_debut_reparation:isoToday(), notes:"" });
  const [createRep, setCreateRep] = useState<Reparation | null>(null);
  const [crF,       setCrF]       = useState(freshCRF());

  const [pieceOpen, setPieceOpen] = useState<Reparation | null>(null);
  const [pieceF,    setPieceF]    = useState({ date_reception_piece_reelle:isoToday(), date_debut_reparation:isoToday() });

  const [repareOpen, setRepareOpen] = useState<Reparation | null>(null);
  const [repareF,    setRepareF]    = useState({ date_fin_reparation:isoToday(), cout:"", km_sortie:"", commentaire_mecanicien:"" });

  const [remettreRep, setRemettreRep] = useState<Reparation | null>(null);
  const [remettreD,   setRemettreD]   = useState(isoToday());
  const [recupPar,    setRecupPar]    = useState<"conducteur"|"personnel"|"autre">("conducteur");
  const [recupNom,    setRecupNom]    = useState("");

  const [veSheet, setVeSheet] = useState<Vehicule | null>(null);
  const [veF,     setVeF]     = useState({ km:"", ct_date:"", date_vidange:"", etat:"", notes:"" });

  // ── Load ──────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const [v, r, va, msgs, cond] = await Promise.all([
      sb.from("vehicules").select("*,circuit:circuits(*),conducteur:conducteurs(prenom,nom)").order("plaque"),
      sb.from("reparations").select("*,vehicule:vehicules(plaque,marque,modele)").order("created_at", { ascending:false }),
      sb.from("alertes").select("*").in("type", ["vehicule","reparation","validation_requise","remise_circulation"]).order("created_at", { ascending:false }),
      sb.from("alertes").select("*").eq("type", "transmis_meca").order("created_at", { ascending:false }),
      sb.from("conducteurs").select("id,prenom,nom").order("nom"),
    ]);
    if (v.data)    setVehicules(v.data);
    if (r.data)    setReparations(r.data);
    if (va.data)   setVehicleAlerts(va.data);
    if (msgs.data) setMessages(msgs.data);
    if (cond.data) setConducteurs(cond.data as { id:number; prenom:string; nom:string }[]);
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    load();
    const ch = sb.channel("meca-rt-v2")
      .on("postgres_changes", { event:"*", schema:"public", table:"reparations" }, load)
      .on("postgres_changes", { event:"*", schema:"public", table:"vehicules" },   load)
      .on("postgres_changes", { event:"*", schema:"public", table:"alertes" },     load)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [load, sb]);

  // ── Computed ──────────────────────────────────────────────────────────────────
  const m0 = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const alertesNL        = vehicleAlerts.filter(a => !a.read);
  const alertesEnAttente = vehicleAlerts.filter(a => {
    if (!a.read) return false;
    if (!a.vehicle_id) return true;
    return !reparations.some(r => r.vehicule_id === a.vehicle_id && !["remis_en_circulation","annulee"].includes(r.statut));
  });

  const repsAct  = reparations.filter(r => ["receptionne","en_attente_validation","en_attente_piece","en_reparation"].includes(r.statut));
  const repsPret = reparations.filter(r => r.statut === "repare");
  const enAtelier = vehicules.filter(v => ["receptionne","en_attente_piece","en_reparation","repare"].includes(v.etat as string));
  const urgents   = vehicules.filter(v => ctCheck(v.ct_date));
  const budget    = reparations.filter(r => ["en_reparation","repare","remis_en_circulation"].includes(r.statut) && r.created_at >= m0).reduce((s, r) => s + (r.cout || 0), 0);

  const flotteSorted = [...vehicules].sort((a, b) => {
    const o: Record<string,number> = { en_reparation:0, en_attente_piece:1, receptionne:2, repare:3, attention:4, en_service:5, bon:5, atelier:1 };
    return (o[a.etat as string] ?? 9) - (o[b.etat as string] ?? 9);
  });

  const todayStr   = isoToday();
  const msgsToday  = messages.filter(m => m.created_at.startsWith(todayStr));
  const msgsOlder  = messages.filter(m => !m.created_at.startsWith(todayStr));
  const msgsUnread = messages.filter(m => !m.read).length;
  const olderByDay: Record<string, Alerte[]> = {};
  msgsOlder.forEach(m => { const d = m.created_at.slice(0,10); if (!olderByDay[d]) olderByDay[d]=[]; olderByDay[d].push(m); });

  // ── Handlers ──────────────────────────────────────────────────────────────────
  async function markLu(a: Alerte) {
    await sb.from("alertes").update({ read:true, read_at:new Date().toISOString() }).eq("id", a.id);
    setAlertSheet(null);
  }
  async function markMsgLu(a: Alerte) {
    await sb.from("alertes").update({ read:true, read_at:new Date().toISOString() }).eq("id", a.id);
  }
  function mettrEnCours(a: Alerte) {
    sb.from("alertes").update({ read:true, read_at:new Date().toISOString() }).eq("id", a.id);
    setAlertSheet(null);
    if (a.vehicle_id) {
      setRecepOpen({ alerteId:a.id, vehicule_id:a.vehicle_id, description:a.message });
      setRecepF({ vehicule_id:a.vehicle_id, description:a.message, km_reception:"", date_reception:isoToday(), etat_visuel:"" });
      setPhotos([]);
    }
  }

  async function doReception() {
    const { vehicule_id, description, km_reception, date_reception, etat_visuel } = recepF;
    if (!vehicule_id || !description.trim()) return;
    setUploading(true);
    const desc = etat_visuel ? `${description}\nÉtat visuel : ${etat_visuel}` : description;
    const { data:rep, error } = await sb.from("reparations").insert({
      vehicule_id, description:desc,
      km_reception: km_reception ? +km_reception : null,
      date_reception: date_reception || null,
      statut:"receptionne", alerte_envoyee:false,
    }).select().single();
    if (error) { console.error(error); setUploading(false); return; }
    if (rep && photos.length > 0) {
      const urls: string[] = [];
      for (const f of photos) {
        const path = `${rep.id}/${Date.now()}_${f.name.replace(/[^a-zA-Z0-9.]/g,"_")}`;
        const { error:ue } = await sb.storage.from("reparations-photos").upload(path, f);
        if (!ue) {
          const { data:pub } = sb.storage.from("reparations-photos").getPublicUrl(path);
          if (pub?.publicUrl) urls.push(pub.publicUrl);
        }
      }
      if (urls.length > 0) await sb.from("reparations").update({ commentaire_mecanicien:`Photos: ${urls.join(" | ")}` }).eq("id", rep.id);
    }
    await sb.from("vehicules").update({ etat:"receptionne" }).eq("id", vehicule_id);
    const veh = vehicules.find(x => x.id === vehicule_id);
    await sb.from("alertes").insert({ type:"reparation", severity:"normale", message:`🚌 Véhicule ${veh?.plaque || vehicule_id} réceptionné à l'atelier`, vehicle_id:vehicule_id, read:false });
    setRecepOpen(null);
    setRecepF({ vehicule_id:"", description:"", km_reception:"", date_reception:isoToday(), etat_visuel:"" });
    setPhotos([]);
    setUploading(false);
  }

  async function doCreateRep() {
    if (!createRep) return;
    const f = crF; const cout = f.cout_estime ? +f.cout_estime : 0;
    let nextSt: string, nextVe: string;
    if (f.type_intervention === "piece")         { nextSt="en_attente_piece";      nextVe="en_attente_piece"; }
    else if (cout >= BUDGET_SEUIL)               { nextSt="en_attente_validation"; nextVe="receptionne"; }
    else                                          { nextSt="en_reparation";         nextVe="en_reparation"; }
    await sb.from("reparations").update({
      statut:nextSt, type_intervention:f.type_intervention,
      nom_garage: f.type_intervention==="externe" ? f.nom_garage : null,
      piece_nom: f.type_intervention==="piece" ? f.piece_nom : null,
      piece_fournisseur: f.type_intervention==="piece" ? f.piece_fournisseur : null,
      date_commande_piece: f.date_commande_piece || null,
      date_reception_piece_estimee: f.date_reception_piece_estimee || null,
      cout_estime: cout || null,
      date_debut_reparation: f.type_intervention!=="piece" ? (f.date_debut_reparation||null) : null,
      commentaire_mecanicien: f.notes || null,
      responsable: `${f.type_intervention}|${f.urgence}`,
    }).eq("id", createRep.id);
    await sb.from("vehicules").update({ etat:nextVe }).eq("id", createRep.vehicule_id);
    if (nextSt === "en_attente_validation") {
      const plaque = (createRep.vehicule as { plaque?:string } | undefined)?.plaque || createRep.vehicule_id;
      await sb.from("alertes").insert({ type:"validation_requise", severity:"haute", message:`Réparation ${plaque} en attente de validation — Coût estimé : ${cout.toLocaleString("fr-CH")} CHF`, vehicle_id:createRep.vehicule_id, read:false });
    }
    setCreateRep(null); setCrF(freshCRF());
  }

  async function doPiece() {
    if (!pieceOpen) return;
    await sb.from("reparations").update({ statut:"en_reparation", date_reception_piece_reelle:pieceF.date_reception_piece_reelle||null, date_debut_reparation:pieceF.date_debut_reparation||null }).eq("id", pieceOpen.id);
    await sb.from("vehicules").update({ etat:"en_reparation" }).eq("id", pieceOpen.vehicule_id);
    setPieceOpen(null);
  }

  async function doRepare() {
    if (!repareOpen) return;
    const f = repareF;
    const upd: Record<string,unknown> = { statut:"repare", date_fin_reparation:f.date_fin_reparation||null, cout:f.cout?+f.cout:null, km_sortie:f.km_sortie?+f.km_sortie:null, commentaire_mecanicien:f.commentaire_mecanicien||repareOpen.commentaire_mecanicien||null };
    if (repareOpen.date_debut_reparation && f.date_fin_reparation) upd.duree_jours = nbJ(repareOpen.date_debut_reparation, f.date_fin_reparation);
    await sb.from("reparations").update(upd).eq("id", repareOpen.id);
    await sb.from("vehicules").update({ etat:"repare" }).eq("id", repareOpen.vehicule_id);
    setRepareOpen(null);
    setRepareF({ date_fin_reparation:isoToday(), cout:"", km_sortie:"", commentaire_mecanicien:"" });
  }

  async function doRemettre() {
    if (!remettreRep) return;
    const plaque = (remettreRep.vehicule as { plaque?:string } | undefined)?.plaque || remettreRep.vehicule_id;
    let recupLabel = "";
    if (recupPar === "conducteur") {
      const c = conducteurs.find(x => String(x.id) === recupNom);
      recupLabel = c ? `${c.prenom} ${c.nom}` : "";
    } else {
      recupLabel = recupNom;
    }
    await sb.from("reparations").update({ statut:"remis_en_circulation", date_remise_circulation:remettreD||null }).eq("id", remettreRep.id);
    const vu: Record<string,unknown> = { etat:"en_service" };
    if (remettreRep.km_sortie) vu.km = remettreRep.km_sortie;
    await sb.from("vehicules").update(vu).eq("id", remettreRep.vehicule_id);
    const msg = recupLabel
      ? `✅ Véhicule ${plaque} remis en service le ${fmtDate(remettreD)} — Récupéré par ${recupLabel}`
      : `✅ Véhicule ${plaque} remis en service le ${fmtDate(remettreD)}`;
    await sb.from("alertes").insert({ type:"remise_circulation", severity:"normale", message:msg, vehicle_id:remettreRep.vehicule_id, read:false });
    setRemettreRep(null); setRemettreD(isoToday()); setRecupPar("conducteur"); setRecupNom("");
  }

  async function doVeSave() {
    if (!veSheet) return;
    await sb.from("vehicules").update({
      km: veF.km ? +veF.km : veSheet.km,
      ct_date: veF.ct_date || null,
      date_vidange: veF.date_vidange || null,
      etat: (veF.etat || veSheet.etat) as Vehicule["etat"],
      notes: veF.notes || null,
    }).eq("id", veSheet.id);
    setVeSheet(null);
  }

  function openVe(v: Vehicule) {
    setVeSheet(v);
    setVeF({ km:String(v.km), ct_date:v.ct_date||"", date_vidange:v.date_vidange||"", etat:v.etat as string, notes:v.notes||"" });
  }

  // ── RepCard ───────────────────────────────────────────────────────────────────
  function RepCard({ rep, actions=true }: { rep:Reparation; actions?:boolean }) {
    type VM = { plaque?:string; marque?:string; modele?:string };
    const vv = rep.vehicule as VM | undefined;
    const [type, urgence] = (rep.responsable || "").split("|");
    const uc = urgence==="bloquant" ? C.red : urgence==="tres_urgent" ? C.amber : urgence==="urgent" ? C.blue : undefined;
    const duree = rep.date_debut_reparation && rep.date_fin_reparation ? nbJ(rep.date_debut_reparation, rep.date_fin_reparation) : null;
    const veh = vehicules.find(x => x.id === rep.vehicule_id);
    return (
      <div style={{ background:C.white, borderRadius:16, padding:16, marginBottom:12, boxShadow:"0 2px 8px rgba(0,0,0,0.06)", borderLeft:`4px solid ${RS[rep.statut]?.c ?? C.gray}` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10, flexWrap:"wrap", gap:8 }}>
          <div>
            <div style={{ fontWeight:800, fontSize:16, color:C.navy }}>
              {vv?.plaque || rep.vehicule_id} <span style={{ fontWeight:400, color:C.gray, fontSize:14 }}>{vv?.marque} {vv?.modele}</span>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:5, flexWrap:"wrap" }}>
              <ChipR s={rep.statut} />
              {urgence && uc && <span style={{ fontSize:12, fontWeight:700, color:uc }}>{urgence==="bloquant" ? "🔴 Bloquant" : urgence==="tres_urgent" ? "🟠 Très urgent" : "🟡 Urgent"}</span>}
            </div>
          </div>
          {rep.cout != null && <div style={{ fontWeight:800, color:C.navy, fontSize:16 }}>{rep.cout.toLocaleString("fr-CH")} CHF</div>}
        </div>
        <p style={{ fontSize:14, color:"#1E293B", marginBottom:10, lineHeight:1.5 }}>{rep.description}</p>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 12px", marginBottom:10 }}>
          {rep.date_reception               && <DL l="Réceptionné"      v={fmtDate(rep.date_reception)} />}
          {rep.km_reception != null         && <DL l="Km réception"     v={`${rep.km_reception.toLocaleString()} km`} />}
          {type                             && <DL l="Type"              v={type==="externe" ? `Externe${rep.nom_garage ? ` — ${rep.nom_garage}` : ""}` : type==="piece" ? "Pièce détachée" : "Interne atelier"} />}
          {rep.cout_estime != null          && <DL l="Coût estimé"      v={`${rep.cout_estime.toLocaleString("fr-CH")} CHF`} />}
          {rep.piece_nom                    && <DL l="Pièce"             v={`${rep.piece_nom}${rep.piece_fournisseur ? ` — ${rep.piece_fournisseur}` : ""}`} />}
          {rep.date_commande_piece          && <DL l="Commandée le"     v={fmtDate(rep.date_commande_piece)} />}
          {rep.date_reception_piece_estimee && <DL l="Réception est."   v={fmtDate(rep.date_reception_piece_estimee)} />}
          {rep.date_reception_piece_reelle  && <DL l="Pièce reçue"     v={fmtDate(rep.date_reception_piece_reelle)} />}
          {rep.date_debut_reparation        && <DL l="Début"            v={fmtDate(rep.date_debut_reparation)} />}
          {rep.date_fin_reparation          && <DL l="Fin"              v={fmtDate(rep.date_fin_reparation)} />}
          {duree != null                    && <DL l="Durée"             v={`${duree} jour${duree > 1 ? "s" : ""}`} />}
          {rep.km_sortie != null            && <DL l="Km sortie"         v={`${rep.km_sortie.toLocaleString()} km`} />}
          {rep.date_remise_circulation      && <DL l="Remis en service"  v={fmtDate(rep.date_remise_circulation)} />}
        </div>
        {rep.commentaire_mecanicien && !rep.commentaire_mecanicien.startsWith("Photos:") && (
          <div style={{ padding:10, background:C.gray50, borderRadius:10, fontSize:13, fontStyle:"italic", marginBottom:10 }}>💬 {rep.commentaire_mecanicien}</div>
        )}
        {actions && (
          <div style={{ marginTop:10 }}>
            {rep.statut === "receptionne"          && <BigBtn icon="🔧" label="Créer la réparation"        onClick={() => { setCreateRep(rep); setCrF(freshCRF()); }} />}
            {rep.statut === "en_attente_validation" && <InfoBox msg="⏳ En attente de validation — gestionnaire/admin informé" />}
            {rep.statut === "en_attente_piece"      && <BigBtn icon="📦" label="Pièce reçue — Démarrer" color={C.blue} onClick={() => { setPieceOpen(rep); setPieceF({ date_reception_piece_reelle:isoToday(), date_debut_reparation:isoToday() }); }} />}
            {rep.statut === "en_reparation"         && <BigBtn icon="✔️" label="Marquer réparé" color={C.purple} onClick={() => { setRepareOpen(rep); setRepareF({ date_fin_reparation:isoToday(), cout:"", km_sortie:"", commentaire_mecanicien:"" }); }} />}
            {rep.statut === "repare"                && <BigBtn icon="🚌" label="Remettre en circulation" color={C.green} onClick={() => { setRemettreRep(rep); setRemettreD(isoToday()); setRecupPar("conducteur"); setRecupNom(""); }} />}
            {veh && <SmBtn label="📋 Fiche véhicule" outline onClick={() => openVe(veh)} />}
          </div>
        )}
      </div>
    );
  }

  // ── AlertCard ─────────────────────────────────────────────────────────────────
  function AlertCard({ a }: { a:Alerte }) {
    const sc  = a.severity==="critique" ? C.red : a.severity==="haute" ? C.amber : C.blue;
    const sbg = a.severity==="critique" ? C.redL : a.severity==="haute" ? C.amberL : C.blueL;
    const v = vehicules.find(x => x.id === a.vehicle_id);
    return (
      <div style={{ background:sbg, borderRadius:16, padding:16, marginBottom:12, borderLeft:`4px solid ${sc}`, cursor:"pointer" }} onClick={() => setAlertSheet(a)}>
        <div style={{ display:"flex", gap:8, marginBottom:6, flexWrap:"wrap" }}>
          <span style={{ fontSize:12, fontWeight:800, color:sc, textTransform:"uppercase" }}>
            {a.severity==="critique" ? "🔴 Critique" : a.severity==="haute" ? "🟠 Haute" : "🔵 Normale"}
          </span>
          {a.read && <span style={{ fontSize:11, fontWeight:700, color:C.amber, background:C.amberL, borderRadius:99, padding:"2px 8px" }}>⏳ En attente du véhicule</span>}
        </div>
        <div style={{ fontWeight:700, fontSize:14, color:"#1E293B", marginBottom:4 }}>{a.message}</div>
        <div style={{ fontSize:12, color:C.gray }}>{fmtDateTime(a.created_at)}</div>
        {v && <div style={{ fontSize:13, color:C.navy, fontWeight:700, marginTop:6 }}>🚌 {v.plaque} — {v.marque} {v.modele} · {v.km.toLocaleString()} km</div>}
        {a.read && a.vehicle_id && (
          <button onClick={e => { e.stopPropagation(); setRecepOpen({ alerteId:a.id, vehicule_id:a.vehicle_id!, description:a.message }); setRecepF({ vehicule_id:a.vehicle_id!, description:a.message, km_reception:"", date_reception:isoToday(), etat_visuel:"" }); setPhotos([]); }}
            style={{ marginTop:10, padding:"10px 16px", borderRadius:12, border:"none", background:C.navy, color:C.white, fontWeight:700, fontSize:13, cursor:"pointer", width:"100%" }}>
            📋 Réceptionner ce véhicule
          </button>
        )}
      </div>
    );
  }

  if (loading) return <div style={{ display:"flex", justifyContent:"center", alignItems:"center", minHeight:"60vh", color:C.gray, fontSize:15 }}>Chargement…</div>;

  const TABS: { id:Tab; label:string; badge?:number }[] = [
    { id:"dashboard", label:"🏠 Accueil" },
    { id:"flotte",    label:"🚌 Flotte",   badge:enAtelier.length || undefined },
    { id:"alertes",   label:"🔔 Alertes",  badge:alertesNL.length || undefined },
    { id:"atelier",   label:"🔧 Atelier",  badge:repsAct.length || undefined },
    { id:"prets",     label:"✅ Prêts",    badge:repsPret.length || undefined },
    { id:"messages",  label:"💬 Messages", badge:msgsUnread || undefined },
  ];

  return (
    <div style={{ maxWidth:700, margin:"0 auto", paddingBottom:100 }}>

      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:900, color:C.navy, margin:"0 0 4px" }}>🔧 Atelier</h1>
        <p style={{ color:C.gray, fontSize:13, margin:0 }}>
          {vehicules.length} véhicules · {enAtelier.length} en atelier · <strong style={{ color:C.navy }}>{budget.toLocaleString("fr-CH")} CHF</strong> ce mois
        </p>
      </div>

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:16 }}>
        {([
          { label:"Flotte",  val:vehicules.length,  c:C.navy,   bg:"#EFF6FF", t:"flotte"   as Tab },
          { label:"Atelier", val:enAtelier.length,  c:C.amber,  bg:C.amberL,  t:"atelier"  as Tab },
          { label:"Alertes", val:alertesNL.length,  c:C.red,    bg:C.redL,    t:"alertes"  as Tab },
          { label:"Prêts",   val:repsPret.length,   c:C.purple, bg:C.purpleL, t:"prets"    as Tab },
        ]).map(c => (
          <div key={c.label} onClick={() => setTab(c.t)} style={{ background:c.bg, borderRadius:14, padding:"12px 8px", cursor:"pointer", textAlign:"center", border:`1px solid ${c.c}22` }}>
            <div style={{ fontSize:24, fontWeight:900, color:c.c }}>{c.val}</div>
            <div style={{ fontSize:11, color:C.gray, marginTop:2, lineHeight:1.2 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:6, overflowX:"auto", marginBottom:20, paddingBottom:4 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding:"10px 14px", borderRadius:12, border:"none", cursor:"pointer", fontWeight:700, fontSize:13, display:"flex", alignItems:"center", gap:5, whiteSpace:"nowrap", flexShrink:0, minHeight:44, background:tab===t.id ? C.navy : "#E2E8F0", color:tab===t.id ? C.white : C.gray }}>
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span style={{ background:tab===t.id ? "rgba(255,255,255,0.25)" : C.red, color:C.white, borderRadius:20, padding:"1px 6px", fontSize:11, fontWeight:800 }}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ════ ACCUEIL ════ */}
      {tab === "dashboard" && (
        <div>
          {alertesNL.length > 0 && (
            <div style={{ background:C.redL, borderRadius:14, padding:16, marginBottom:16, border:"1px solid #FECACA", cursor:"pointer" }} onClick={() => setTab("alertes")}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontWeight:800, color:C.red }}>🔔 {alertesNL.length} alerte(s) non lue(s)</span>
                <span style={{ fontSize:13, color:C.red, fontWeight:700 }}>Voir →</span>
              </div>
            </div>
          )}
          {msgsUnread > 0 && (
            <div style={{ background:C.blueL, borderRadius:14, padding:16, marginBottom:16, border:"1px solid #BFDBFE", cursor:"pointer" }} onClick={() => setTab("messages")}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontWeight:800, color:C.blue }}>💬 {msgsUnread} message(s) non lu(s)</span>
                <span style={{ fontSize:13, color:C.blue, fontWeight:700 }}>Voir →</span>
              </div>
            </div>
          )}
          {urgents.length > 0 && (
            <div style={{ background:C.amberL, borderRadius:14, padding:14, marginBottom:16, border:"1px solid #FDE68A" }}>
              <div style={{ fontWeight:800, color:C.amber, marginBottom:10, fontSize:14 }}>⚠️ {urgents.length} CT à surveiller</div>
              {urgents.map(v => {
                const ct = ctCheck(v.ct_date);
                return (
                  <div key={v.id} style={{ fontSize:13, color:"#1E293B", padding:"7px 0", borderBottom:"1px solid #FDE68A", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div><span style={{ fontWeight:700 }}>🚌 {v.plaque}</span>{ct && <span style={{ color:ct.c, marginLeft:8 }}>— {ct.label}</span>}</div>
                    <button onClick={() => openVe(v)} style={{ fontSize:13, color:C.navy, background:"none", border:"none", cursor:"pointer", fontWeight:700, minWidth:44, minHeight:44 }}>Modifier →</button>
                  </div>
                );
              })}
            </div>
          )}
          {repsAct.length === 0 ? (
            <div style={{ textAlign:"center", padding:"40px 20px", color:C.gray }}>
              <div style={{ fontSize:48 }}>✅</div>
              <p style={{ fontWeight:700, fontSize:16, marginTop:12 }}>Atelier libre</p>
            </div>
          ) : (
            <>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <h2 style={{ fontSize:15, fontWeight:800, color:C.navy, margin:0 }}>En cours ({repsAct.length})</h2>
                {repsAct.length > 2 && <button onClick={() => setTab("atelier")} style={{ fontSize:13, color:C.navy, background:"none", border:"none", cursor:"pointer", fontWeight:700 }}>Voir tout →</button>}
              </div>
              {repsAct.slice(0, 2).map(r => <RepCard key={r.id} rep={r} />)}
            </>
          )}
        </div>
      )}

      {/* ════ FLOTTE ════ */}
      {tab === "flotte" && (
        <div>
          <p style={{ fontSize:13, color:C.gray, marginBottom:14 }}>{enAtelier.length} en atelier · {vehicules.length - enAtelier.length} en service</p>
          {flotteSorted.map(v => {
            const ct   = ctCheck(v.ct_date);
            const inA  = ["receptionne","en_attente_piece","en_reparation","repare"].includes(v.etat as string);
            const cond = v.conducteur as { prenom?:string; nom?:string } | undefined;
            return (
              <div key={v.id} onClick={() => openVe(v)} style={{ background:C.white, borderRadius:16, padding:16, marginBottom:10, cursor:"pointer", boxShadow:"0 2px 8px rgba(0,0,0,0.06)", borderLeft:`4px solid ${VS[v.etat as string]?.c ?? C.gray}`, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, minHeight:64 }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:5, flexWrap:"wrap" }}>
                    <span style={{ fontWeight:800, fontSize:16, color:C.navy }}>{v.plaque}</span>
                    <ChipV s={v.etat as string} />
                  </div>
                  <div style={{ fontSize:13, color:C.gray }}>{v.marque} {v.modele} · {v.km.toLocaleString()} km{cond?.nom ? ` · ${cond.prenom} ${cond.nom}` : ""}</div>
                  {ct && <div style={{ fontSize:12, color:ct.c, fontWeight:700, marginTop:3 }}>{ct.label}</div>}
                </div>
                <span style={{ fontSize:22 }}>{inA ? "🔧" : "✅"}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ════ ALERTES ════ */}
      {tab === "alertes" && (
        <div>
          {alertesNL.length === 0 && alertesEnAttente.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 20px", color:C.gray }}>
              <div style={{ fontSize:48 }}>🔔</div>
              <p style={{ fontWeight:700, marginTop:12, fontSize:16 }}>Aucune alerte</p>
            </div>
          ) : (
            <>
              {alertesNL.length > 0 && (
                <section style={{ marginBottom:24 }}>
                  <div style={{ fontWeight:800, fontSize:13, color:C.red, textTransform:"uppercase", letterSpacing:0.5, marginBottom:10 }}>🔴 Nouvelles ({alertesNL.length})</div>
                  {alertesNL.map(a => <AlertCard key={a.id} a={a} />)}
                </section>
              )}
              {alertesEnAttente.length > 0 && (
                <section>
                  <div style={{ fontWeight:800, fontSize:13, color:C.amber, textTransform:"uppercase", letterSpacing:0.5, marginBottom:10 }}>⏳ En attente du véhicule ({alertesEnAttente.length})</div>
                  {alertesEnAttente.map(a => <AlertCard key={a.id} a={a} />)}
                </section>
              )}
            </>
          )}
        </div>
      )}

      {/* ════ ATELIER ════ */}
      {tab === "atelier" && (
        <div>
          {repsAct.length === 0
            ? <div style={{ textAlign:"center", padding:"60px 20px", color:C.gray }}><div style={{ fontSize:48 }}>✅</div><p style={{ fontWeight:700, marginTop:12, fontSize:16 }}>Atelier libre</p></div>
            : repsAct.map(r => <RepCard key={r.id} rep={r} />)}
        </div>
      )}

      {/* ════ PRÊTS ════ */}
      {tab === "prets" && (
        <div>
          {repsPret.length === 0
            ? <div style={{ textAlign:"center", padding:"60px 20px", color:C.gray }}><div style={{ fontSize:48 }}>✅</div><p style={{ fontWeight:700, marginTop:12, fontSize:16 }}>Aucun véhicule prêt</p></div>
            : repsPret.map(r => <RepCard key={r.id} rep={r} />)}
        </div>
      )}

      {/* ════ MESSAGES ════ */}
      {tab === "messages" && (
        <div>
          {messages.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 20px", color:C.gray }}>
              <div style={{ fontSize:48 }}>💬</div>
              <p style={{ fontWeight:700, marginTop:12, fontSize:16 }}>Aucun message</p>
            </div>
          ) : (
            <>
              <div style={{ fontWeight:800, fontSize:12, color:C.gray, textTransform:"uppercase", letterSpacing:0.5, marginBottom:12 }}>Aujourd'hui</div>
              {msgsToday.length === 0
                ? <div style={{ textAlign:"center", padding:"16px 0", color:C.gray, fontSize:13, marginBottom:16 }}>Aucun message aujourd'hui</div>
                : msgsToday.map(m => {
                  const isNew = !m.read;
                  return (
                    <div key={m.id} style={{ background:isNew ? C.blueL : C.gray50, borderRadius:16, padding:16, marginBottom:10, borderLeft:`4px solid ${isNew ? C.blue : C.gray200}` }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8, gap:8 }}>
                        <span style={{ fontSize:11, fontWeight:700, color:isNew ? C.blue : C.gray, background:isNew ? "#DBEAFE" : C.gray100, borderRadius:99, padding:"2px 8px" }}>
                          {isNew ? "● Nouveau" : "✓ Lu"}
                        </span>
                        <span style={{ fontSize:11, color:C.gray }}>{fmtDateTime(m.created_at)}</span>
                      </div>
                      <p style={{ fontSize:14, color:"#1E293B", lineHeight:1.5, fontWeight:isNew ? 600 : 400, marginBottom:isNew ? 10 : 0 }}>{m.message}</p>
                      {isNew && (
                        <button onClick={() => markMsgLu(m)} style={{ padding:"8px 14px", borderRadius:10, border:`1px solid ${C.blue}`, background:C.blueL, color:C.blue, fontWeight:700, fontSize:12, cursor:"pointer" }}>
                          ✓ Confirmer lecture
                        </button>
                      )}
                    </div>
                  );
                })}

              {msgsOlder.length > 0 && (
                <>
                  <button onClick={() => setShowMsgHistory(p => !p)} style={{ width:"100%", padding:"12px", borderRadius:12, border:`1px solid ${C.gray200}`, background:C.gray50, color:C.gray, fontWeight:700, fontSize:13, cursor:"pointer", marginTop:8, marginBottom:12 }}>
                    {showMsgHistory ? "Masquer l'historique" : `Voir l'historique (${msgsOlder.length})`}
                  </button>
                  {showMsgHistory && Object.entries(olderByDay).sort((a, b) => b[0].localeCompare(a[0])).map(([day, msgs]) => (
                    <div key={day} style={{ marginBottom:16 }}>
                      <div style={{ fontSize:12, fontWeight:800, color:C.gray, textTransform:"uppercase", letterSpacing:0.5, marginBottom:8, paddingBottom:4, borderBottom:`1px solid ${C.gray200}` }}>
                        {fmtDate(day)}
                      </div>
                      {msgs.map(m => {
                        const isNew = !m.read;
                        return (
                          <div key={m.id} style={{ background:isNew ? C.blueL : C.gray50, borderRadius:12, padding:12, marginBottom:8, borderLeft:`3px solid ${isNew ? C.blue : C.gray200}`, opacity:isNew ? 1 : 0.8 }}>
                            <div style={{ display:"flex", justifyContent:"space-between", gap:8, marginBottom:4 }}>
                              <span style={{ fontSize:11, color:isNew ? C.blue : C.gray, fontWeight:isNew ? 700 : 400 }}>{isNew ? "● Nouveau" : "✓ Lu"}</span>
                              <span style={{ fontSize:11, color:C.gray }}>{fmtDateTime(m.created_at)}</span>
                            </div>
                            <p style={{ fontSize:13, color:"#1E293B", lineHeight:1.5, fontWeight:isNew ? 600 : 400, marginBottom:isNew ? 8 : 0 }}>{m.message}</p>
                            {isNew && (
                              <button onClick={() => markMsgLu(m)} style={{ padding:"6px 12px", borderRadius:8, border:`1px solid ${C.blue}`, background:C.blueL, color:C.blue, fontWeight:700, fontSize:11, cursor:"pointer" }}>✓ Lu</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* FAB */}
      <button onClick={() => { setRecepOpen({ vehicule_id:"", description:"" }); setRecepF({ vehicule_id:"", description:"", km_reception:"", date_reception:isoToday(), etat_visuel:"" }); setPhotos([]); }}
        style={{ position:"fixed", bottom:24, right:24, zIndex:90, background:C.navy, color:C.white, border:"none", borderRadius:20, padding:"16px 24px", fontSize:15, fontWeight:800, cursor:"pointer", boxShadow:"0 4px 20px rgba(13,59,122,0.35)", display:"flex", alignItems:"center", gap:8, minHeight:56 }}>
        <span style={{ fontSize:20 }}>+</span> Réceptionner
      </button>

      {/* ════════════ MODALS ════════════ */}

      {/* Détail alerte */}
      {alertSheet && (() => {
        const a  = alertSheet;
        const sc  = a.severity==="critique" ? C.red : a.severity==="haute" ? C.amber : C.blue;
        const sbg = a.severity==="critique" ? C.redL : a.severity==="haute" ? C.amberL : C.blueL;
        const v = vehicules.find(x => x.id === a.vehicle_id);
        return (
          <Sheet title="Alerte" onClose={() => setAlertSheet(null)}>
            <div style={{ background:sbg, borderRadius:12, padding:16, marginBottom:20, borderLeft:`4px solid ${sc}` }}>
              <div style={{ fontSize:13, fontWeight:800, color:sc, marginBottom:8 }}>
                {a.severity==="critique" ? "🔴 Critique" : a.severity==="haute" ? "🟠 Haute" : "🔵 Normale"}
                {a.read && <span style={{ marginLeft:8, color:C.amber }}>⏳ En attente du véhicule</span>}
              </div>
              <p style={{ fontSize:15, fontWeight:700, color:"#1E293B", lineHeight:1.5, margin:0 }}>{a.message}</p>
              <div style={{ fontSize:12, color:C.gray, marginTop:8 }}>{fmtDateTime(a.created_at)}</div>
            </div>
            {v && (
              <div style={{ background:"#EFF6FF", borderRadius:12, padding:14, marginBottom:20 }}>
                <div style={{ fontWeight:700, color:C.navy, marginBottom:8, fontSize:13 }}>🚌 Véhicule</div>
                <DL l="Plaque"      v={v.plaque} />
                <DL l="Modèle"      v={`${v.marque} ${v.modele}`} />
                <DL l="Kilométrage" v={`${v.km.toLocaleString()} km`} />
                {v.ct_date && <DL l="CT" v={v.ct_date} />}
                <div style={{ marginTop:8 }}><ChipV s={v.etat as string} /></div>
              </div>
            )}
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {!a.read && <BigBtn icon="✓" label="Marquer comme lu" color={C.gray} outline onClick={() => markLu(a)} />}
              {a.vehicle_id && <BigBtn icon="📋" label={a.read ? "Réceptionner ce véhicule" : "Mettre en cours + Réceptionner"} onClick={() => mettrEnCours(a)} />}
            </div>
          </Sheet>
        );
      })()}

      {/* Fiche réception */}
      {recepOpen && (
        <Sheet title="Réception véhicule" onClose={() => setRecepOpen(null)}>
          <Sel label="Véhicule *" value={recepF.vehicule_id} onChange={v => setRecepF(p => ({ ...p, vehicule_id:v }))}
            opts={[{ v:"", l:"— Choisir un véhicule —" }, ...vehicules.map(v => ({ v:v.id, l:`${v.plaque} — ${v.marque} ${v.modele}` }))]} />
          <TA label="Problème observé *" value={recepF.description} onChange={v => setRecepF(p => ({ ...p, description:v }))} placeholder="Décrivez le problème…" />
          <F  label="Kilométrage" type="number" value={recepF.km_reception} onChange={v => setRecepF(p => ({ ...p, km_reception:v }))} />
          <F  label="Date de réception" type="date" value={recepF.date_reception} onChange={v => setRecepF(p => ({ ...p, date_reception:v }))} />
          <TA label="État visuel" value={recepF.etat_visuel} onChange={v => setRecepF(p => ({ ...p, etat_visuel:v }))} rows={2} placeholder="Rayures, dommages, propreté…" />
          <div style={{ marginBottom:16 }}>
            <label style={{ display:"block", fontSize:13, fontWeight:700, color:C.gray, marginBottom:6 }}>📷 Photos (optionnel)</label>
            <input type="file" accept="image/*" multiple onChange={e => setPhotos(Array.from(e.target.files || []))} style={{ fontSize:14, width:"100%", padding:"12px 0", cursor:"pointer" }} />
            {photos.length > 0 && <div style={{ fontSize:13, color:C.green, marginTop:6, fontWeight:700 }}>{photos.length} photo(s) sélectionnée(s)</div>}
          </div>
          <BigBtn icon={uploading ? "" : "✅"} label={uploading ? "Enregistrement…" : "Réceptionner"} color={C.green} disabled={!recepF.vehicule_id || !recepF.description.trim() || uploading} onClick={doReception} />
        </Sheet>
      )}

      {/* Créer réparation */}
      {createRep && (
        <Sheet title="Réparation" onClose={() => setCreateRep(null)}>
          <div style={{ background:"#EFF6FF", borderRadius:12, padding:12, marginBottom:16, fontSize:13, color:C.navy, fontWeight:600 }}>
            🚌 {(createRep.vehicule as { plaque?:string } | undefined)?.plaque || createRep.vehicule_id}
          </div>
          <Sel label="Type d'intervention" value={crF.type_intervention} onChange={v => setCrF(p => ({ ...p, type_intervention:v as "interne"|"externe"|"piece" }))}
            opts={[{ v:"interne", l:"Interne (atelier)" }, { v:"externe", l:"Externe (garage)" }, { v:"piece", l:"Commande de pièce" }]} />
          {crF.type_intervention === "externe" && <F label="Nom du garage" value={crF.nom_garage} onChange={v => setCrF(p => ({ ...p, nom_garage:v }))} placeholder="ex: Garage Martin" />}
          {crF.type_intervention === "piece" && (<>
            <F label="Nom de la pièce" value={crF.piece_nom} onChange={v => setCrF(p => ({ ...p, piece_nom:v }))} placeholder="ex: Filtre à huile" />
            <F label="Fournisseur" value={crF.piece_fournisseur} onChange={v => setCrF(p => ({ ...p, piece_fournisseur:v }))} />
            <F label="Date commande" type="date" value={crF.date_commande_piece} onChange={v => setCrF(p => ({ ...p, date_commande_piece:v }))} />
            <F label="Réception estimée" type="date" value={crF.date_reception_piece_estimee} onChange={v => setCrF(p => ({ ...p, date_reception_piece_estimee:v }))} />
          </>)}
          <Sel label="Urgence" value={crF.urgence} onChange={v => setCrF(p => ({ ...p, urgence:v }))} opts={URGENCES} />
          <F label="Coût estimé (CHF)" type="number" value={crF.cout_estime} onChange={v => setCrF(p => ({ ...p, cout_estime:v }))} placeholder="0" />
          {crF.cout_estime && +crF.cout_estime >= BUDGET_SEUIL && (
            <InfoBox msg={`⚠️ Coût ≥ ${BUDGET_SEUIL.toLocaleString()} CHF → validation gestionnaire/admin requise`} />
          )}
          {crF.type_intervention !== "piece" && <F label="Date de début" type="date" value={crF.date_debut_reparation} onChange={v => setCrF(p => ({ ...p, date_debut_reparation:v }))} />}
          <TA label="Notes" value={crF.notes} onChange={v => setCrF(p => ({ ...p, notes:v }))} rows={2} />
          <BigBtn icon="✅" label="Confirmer la réparation" color={C.green} onClick={doCreateRep} />
        </Sheet>
      )}

      {/* Pièce reçue */}
      {pieceOpen && (
        <Sheet title="Pièce reçue" onClose={() => setPieceOpen(null)}>
          <div style={{ background:"#EFF6FF", borderRadius:12, padding:12, marginBottom:16, fontSize:13 }}>
            <span style={{ fontWeight:700, color:C.navy }}>🔩 {pieceOpen.piece_nom || "Pièce"}</span>
            {pieceOpen.piece_fournisseur && <span style={{ color:C.gray }}> — {pieceOpen.piece_fournisseur}</span>}
          </div>
          <F label="Date de réception de la pièce" type="date" value={pieceF.date_reception_piece_reelle} onChange={v => setPieceF(p => ({ ...p, date_reception_piece_reelle:v }))} />
          <F label="Date de début de réparation" type="date" value={pieceF.date_debut_reparation} onChange={v => setPieceF(p => ({ ...p, date_debut_reparation:v }))} />
          <BigBtn icon="✅" label="Démarrer la réparation" color={C.green} onClick={doPiece} />
        </Sheet>
      )}

      {/* Marquer réparé */}
      {repareOpen && (
        <Sheet title="Réparation terminée" onClose={() => setRepareOpen(null)}>
          <div style={{ background:C.gray50, borderRadius:12, padding:12, marginBottom:16, fontSize:13 }}>
            <span style={{ fontWeight:700, color:C.navy }}>🚌 {(repareOpen.vehicule as { plaque?:string } | undefined)?.plaque || repareOpen.vehicule_id}</span>
          </div>
          <F label="Date de fin" type="date" value={repareF.date_fin_reparation} onChange={v => setRepareF(p => ({ ...p, date_fin_reparation:v }))} />
          {repareOpen.date_debut_reparation && repareF.date_fin_reparation && (
            <InfoBox msg={`⏱ Durée : ${nbJ(repareOpen.date_debut_reparation, repareF.date_fin_reparation)} jour(s)`} color={C.navy} bg="#EFF6FF" />
          )}
          <F label="Coût final (CHF)" type="number" value={repareF.cout} onChange={v => setRepareF(p => ({ ...p, cout:v }))} placeholder="0" />
          <F label="Kilométrage à la sortie" type="number" value={repareF.km_sortie} onChange={v => setRepareF(p => ({ ...p, km_sortie:v }))} />
          <TA label="Observations" value={repareF.commentaire_mecanicien} onChange={v => setRepareF(p => ({ ...p, commentaire_mecanicien:v }))} placeholder="Pièces remplacées, conseils de suivi…" />
          <BigBtn icon="✔️" label="Confirmer — Véhicule réparé" color={C.purple} onClick={doRepare} />
        </Sheet>
      )}

      {/* Remettre en circulation */}
      {remettreRep && (
        <Sheet title="Remettre en circulation" onClose={() => setRemettreRep(null)}>
          <div style={{ background:C.greenL, borderRadius:12, padding:14, marginBottom:20 }}>
            <p style={{ fontWeight:700, color:C.green, fontSize:15, margin:"0 0 4px" }}>🚌 {(remettreRep.vehicule as { plaque?:string } | undefined)?.plaque || remettreRep.vehicule_id}</p>
            <p style={{ fontSize:13, color:C.greenD, lineHeight:1.5, margin:0 }}>Le gestionnaire sera notifié automatiquement.</p>
          </div>
          {remettreRep.cout != null && <InfoBox msg={`Coût final : ${remettreRep.cout.toLocaleString("fr-CH")} CHF`} color={C.navy} bg="#EFF6FF" />}
          <F label="Date de remise en service" type="date" value={remettreD} onChange={setRemettreD} />
          <div style={{ marginBottom:16 }}>
            <label style={{ display:"block", fontSize:13, fontWeight:700, color:C.gray, marginBottom:8 }}>Récupéré par</label>
            <div style={{ display:"flex", gap:8, marginBottom:12 }}>
              {(["conducteur","personnel","autre"] as const).map(opt => (
                <button key={opt} onClick={() => { setRecupPar(opt); setRecupNom(""); }} style={{ flex:1, padding:"10px 8px", borderRadius:10, fontSize:12, fontWeight:700, cursor:"pointer", border:`2px solid ${recupPar===opt ? C.navy : C.gray200}`, background:recupPar===opt ? "#EFF6FF" : C.white, color:recupPar===opt ? C.navy : C.gray }}>
                  {opt === "conducteur" ? "Conducteur" : opt === "personnel" ? "Personnel" : "Autre"}
                </button>
              ))}
            </div>
            {recupPar === "conducteur" ? (
              <select value={recupNom} onChange={e => setRecupNom(e.target.value)} style={{ ...inp, appearance:"none" } as React.CSSProperties}>
                <option value="">— Choisir —</option>
                {conducteurs.map(c => <option key={c.id} value={String(c.id)}>{c.prenom} {c.nom}</option>)}
              </select>
            ) : (
              <input value={recupNom} onChange={e => setRecupNom(e.target.value)} placeholder={recupPar === "personnel" ? "Nom de la personne…" : "Préciser…"} style={inp} />
            )}
          </div>
          <BigBtn icon="🚌" label="Remettre en circulation" color={C.green} onClick={doRemettre} />
        </Sheet>
      )}

      {/* Fiche véhicule */}
      {veSheet && (() => {
        const qrUrl = typeof window !== "undefined" ? `${window.location.origin}/scan/${veSheet.id}` : `/scan/${veSheet.id}`;
        const cond  = veSheet.conducteur as { prenom?:string; nom?:string } | undefined;
        const circ  = veSheet.circuit   as { nom?:string; emoji?:string }   | undefined;
        return (
          <Sheet title={veSheet.plaque} onClose={() => setVeSheet(null)}>
            <div style={{ background:C.gray50, borderRadius:12, padding:14, marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:800, color:C.gray, marginBottom:10, textTransform:"uppercase", letterSpacing:0.5 }}>🔒 Informations verrouillées</div>
              <DL l="Immatriculation" v={veSheet.plaque} />
              <DL l="Marque / Modèle" v={`${veSheet.marque} ${veSheet.modele}`} />
              <DL l="Places"          v={`${veSheet.places}${veSheet.places_handi ? ` + ${veSheet.places_handi} PMR` : ""}`} />
              <DL l="Conducteur"      v={cond?.nom ? `${cond.prenom} ${cond.nom}` : "Non assigné"} />
              <DL l="Circuit"         v={circ?.nom ? `${circ.emoji || ""} ${circ.nom}` : "Non assigné"} />
              <DL l="Assurance"       v={veSheet.assurance_date || "À compléter"} />
            </div>
            <div style={{ background:"#EFF6FF", borderRadius:12, padding:16, marginBottom:20, display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.navy }}>QR Code — Scan véhicule</div>
              <div style={{ background:C.white, padding:12, borderRadius:10, display:"inline-flex", boxShadow:"0 2px 8px rgba(0,0,0,0.08)" }}>
                <QRCodeSVG value={qrUrl} size={148} level="M" imageSettings={{ src:"/logo.png", height:28, width:28, excavate:true }} />
              </div>
              <div style={{ fontSize:11, color:C.gray, textAlign:"center", wordBreak:"break-all" }}>{qrUrl}</div>
              <button onClick={() => window.print()} style={{ fontSize:13, color:C.navy, background:"none", border:`1.5px solid ${C.navy}`, borderRadius:10, padding:"8px 18px", cursor:"pointer", fontWeight:700 }}>🖨 Imprimer le QR</button>
            </div>
            <div style={{ fontSize:11, fontWeight:800, color:C.gray, marginBottom:14, textTransform:"uppercase", letterSpacing:0.5 }}>✏️ Données mécanicien</div>
            <F label="Kilométrage actuel" type="number" value={veF.km} onChange={v => setVeF(p => ({ ...p, km:v }))} />
            <F label="Prochain CT (MM.YYYY)" value={veF.ct_date} placeholder="ex: 06.2026" onChange={v => setVeF(p => ({ ...p, ct_date:v }))} />
            <F label="Prochaine vidange (MM.YYYY)" value={veF.date_vidange} placeholder="ex: 09.2026" onChange={v => setVeF(p => ({ ...p, date_vidange:v }))} />
            <Sel label="État général" value={veF.etat} onChange={v => setVeF(p => ({ ...p, etat:v }))} opts={Object.entries(VS).map(([k, c]) => ({ v:k, l:c.l }))} />
            <TA label="Notes techniques" value={veF.notes} onChange={v => setVeF(p => ({ ...p, notes:v }))} placeholder="Observations, historique, alertes particulières…" />
            {(() => {
              const vr = reparations.filter(r => r.vehicule_id === veSheet.id && r.statut === "remis_en_circulation");
              if (!vr.length) return null;
              return (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.gray, marginBottom:10 }}>📋 Historique réparations ({vr.length})</div>
                  {vr.slice(0, 5).map(r => (
                    <div key={r.id} style={{ fontSize:13, color:"#475569", padding:"8px 0", borderBottom:`1px solid ${C.gray100}`, display:"flex", justifyContent:"space-between", gap:8 }}>
                      <div>
                        <div style={{ fontWeight:600 }}>{r.description.slice(0, 55)}</div>
                        <div style={{ fontSize:11, color:C.gray }}>{fmtDate(r.date_remise_circulation)}</div>
                      </div>
                      {r.cout != null && <span style={{ fontWeight:700, color:C.navy, flexShrink:0 }}>{r.cout.toLocaleString("fr-CH")} CHF</span>}
                    </div>
                  ))}
                </div>
              );
            })()}
            <BigBtn icon="💾" label="Enregistrer" onClick={doVeSave} />
          </Sheet>
        );
      })()}

    </div>
  );
}
