"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { C, isoToday, fmtHHMM, nowTimeStr } from "@/lib/constants";
import type { Conducteur, ServiceLog, Incident, Alerte, AbsenceEnfant, Enfant, CongesDemande, Eleve, PriseEnCharge, Circuit } from "@/lib/types";

type JourneeCircuit = { id: string; nom: string; emoji?: string; nb: number;
  premierRamassage: string | null; premiereDepose: string | null; derniereDepose: string | null; excEnf: number };
type HebdoRow = { id: number; circuit_id: string; jour: number; sens: "matin" | "aprem";
  ordre: number; heure: string; eleve_nom: string; adresse: string | null;
  eleve_id: number | null; besoin_special: boolean };
type ExcRange = { eleve_id: number; type: string; date_debut: string; date_fin: string };
import { Bus, FileText, AlertCircle, Mail, History, CalendarDays, CalendarRange, LogOut, MoreHorizontal, MapPin, X, ShieldCheck, Info } from "lucide-react";
import { BSheet, BigBtn, TA, Chip, StatusBadge } from "./tabs/shared";
import { TabFiche } from "./tabs/Fiche";
import { TabSignalements } from "./tabs/Signalements";
import { TabMessages } from "./tabs/Messages";
import { TabHistorique } from "./tabs/Historique";
import { TabConges } from "./tabs/Conges";
import { TabTournee, type ExcToday } from "./tabs/Tournee";
import { TabPlanning } from "./tabs/Planning";

type Tab = "tournee" | "fiche" | "signalements" | "messages" | "historique" | "conges" | "planning" | "info";

export default function ConducteurPage(){
  const sb=createClient();
  const router=useRouter();

  const [driver,    setDriver]    = useState<Conducteur|null>(null);
  const [todayLog,  setTodayLog]  = useState<ServiceLog|null>(null);
  const [absences,  setAbsences]  = useState<AbsenceEnfant[]>([]);
  const [enfants,   setEnfants]   = useState<Enfant[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [messages,  setMessages]  = useState<Alerte[]>([]);
  const [histLogs,  setHistLogs]  = useState<ServiceLog[]>([]);
  const [conges,    setConges]    = useState<CongesDemande[]>([]);
  const [prises,    setPrises]    = useState<PriseEnCharge[]>([]);
  const [exceptions,setExceptions]= useState<ExcToday[]>([]);
  const [journeeCircuits, setJourneeCircuits] = useState<JourneeCircuit[]>([]);
  const [journeeSeen,      setJourneeSeen]     = useState<boolean>(() => {
    try { return typeof window !== "undefined" && localStorage.getItem("taxi_journee_seen") === isoToday(); }
    catch { return false; }
  });
  function markJourneeSeen() {
    try { localStorage.setItem("taxi_journee_seen", isoToday()); } catch { /* noop */ }
    setJourneeSeen(true);
  }
  const [matinEleves, setMatinEleves] = useState<Eleve[]>([]);
  const [apremEleves, setApremEleves] = useState<Eleve[]>([]);
  const [weekStops,   setWeekStops]   = useState<HebdoRow[]>([]);
  const [excRange,    setExcRange]    = useState<ExcRange[]>([]);
  const [myCircuits,  setMyCircuits]  = useState<{id:string;nom:string;emoji?:string}[]>([]);
  const [prisesHist,  setPrisesHist]  = useState<PriseEnCharge[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState<Tab>("tournee");
  const [drawerOpen,setDrawerOpen]= useState(false);

  // Annonce de lancement (« vos circuits sont attribués ») + accusé de lecture + signalement d'écart
  const ANNONCE_CLE = "lancement_circuits";
  const [annonceLue,  setAnnonceLue]  = useState<string|null>(null);   // date de lecture, ou null
  const [showAnnonce, setShowAnnonce] = useState(false);
  const [ecartOpen,   setEcartOpen]   = useState(false);
  const [ecartText,   setEcartText]   = useState("");
  const [ecartBusy,   setEcartBusy]   = useState(false);
  const [mesEcarts,   setMesEcarts]   = useState<{id:number;message:string;statut:string;created_at:string;circuit_id:string|null}[]>([]);

  // Modals service
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [showAbsence,  setShowAbsence]  = useState(false);
  const [showReprise,  setShowReprise]  = useState(false);
  const [showFin,      setShowFin]      = useState(false);

  // Formulaire absence
  const [absMotif, setAbsMotif] = useState("");
  const [absNotes, setAbsNotes] = useState("");

  // Signalement
  const [signType,    setSignType]    = useState("");
  const [signDesc,    setSignDesc]    = useState("");
  const [signUrgence, setSignUrgence] = useState("normal");
  const [signSent,    setSignSent]    = useState(false);

  // ID conducteur (entier) — nécessaire pour le filtre Realtime alertes
  const [condId, setCondId] = useState<number|null>(null);

  // Changement mot de passe (première connexion)
  const [mustChangePwd,  setMustChangePwd]  = useState(false);
  const [newPwd,         setNewPwd]         = useState("");
  const [newPwdConfirm,  setNewPwdConfirm]  = useState("");
  const [pwdChangeErr,   setPwdChangeErr]   = useState("");
  const [pwdChangeBusy,  setPwdChangeBusy]  = useState(false);


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
      sb.from("conducteurs").select("*,circuit:circuits!conducteurs_circuit_id_fkey(*,cercle:cercles_scolaires(*)),vehicule:vehicules(*)")
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

    // ── Jour courant (1=lundi … 5=vendredi ; week-end → aperçu du lundi) ──
    const t2 = isoToday();
    const jsDay = new Date().getDay();               // 0=dimanche … 6=samedi
    const jour = (jsDay >= 1 && jsDay <= 5) ? jsDay : 1;

    // Tous les circuits du conducteur
    const { data: myCircsRaw } = await sb.from("circuits").select("*").eq("conducteur_id", cid).order("nom");
    let myCircs = (myCircsRaw ?? []) as Circuit[];

    // Remplacement exceptionnel actif aujourd'hui → le conducteur couvre un autre circuit.
    // Additif : sans remplacement, rien ne change (circuit habituel).
    let effectiveCircuitId: string | null = drv.data?.circuit_id ?? null;
    let coveredCircuit: Circuit | null = null;
    const { data: rempls } = await sb.from("remplacements_exceptionnels")
      .select("circuit_id").eq("remplacant_id", cid)
      .lte("date_debut", t2).gte("date_fin", t2).order("date_debut").limit(1);
    if (rempls && rempls[0]) {
      const { data: cc } = await sb.from("circuits")
        .select("*,cercle:cercles_scolaires(*)").eq("id", rempls[0].circuit_id).maybeSingle();
      if (cc) {
        coveredCircuit = cc as Circuit;
        effectiveCircuitId = coveredCircuit.id;
        if (!myCircs.some(c => c.id === coveredCircuit!.id)) myCircs = [coveredCircuit, ...myCircs];
      }
    }
    const circIds = myCircs.map(c => c.id);

    setMyCircuits(myCircs.map(c => ({ id: c.id, nom: c.nom, emoji: c.emoji })));
    // Si remplacement actif, la fiche affichée (en-tête, image, tournée) suit le circuit couvert
    if (coveredCircuit) setDriver(prev => prev ? { ...prev, circuit_id: effectiveCircuitId!, circuit: coveredCircuit! } : prev);

    // Planning hebdo COMPLET (tous les jours) + exceptions (avec période) + prises + élèves (contacts)
    let hebdo: HebdoRow[] = [];      // arrêts du JOUR courant
    let jexc: { eleve_id: number; type: string; moments?: string[] | null }[] = [];   // exceptions ACTIVES aujourd'hui
    let excAll: ExcRange[] = [];                             // exceptions en cours ou à venir (avec dates)
    let prisesJour: PriseEnCharge[] = [];
    let elevesAll: Eleve[] = [];
    if (circIds.length) {
      const [{ data: th }, { data: ex2 }, { data: pr }, { data: elA }] = await Promise.all([
        sb.from("tournee_hebdo").select("*").in("circuit_id", circIds).order("jour").order("sens").order("ordre"),
        sb.from("exceptions_eleves").select("eleve_id,type,date_debut,date_fin,moments").gte("date_fin", t2),
        sb.from("prises_en_charge").select("*").eq("conducteur_id", cid).eq("date", t2),
        sb.from("eleves").select("*").in("circuit_id", circIds).eq("actif", true),
      ]);
      const week = (th ?? []) as HebdoRow[];
      setWeekStops(week);
      hebdo = week.filter(h => h.jour === jour);
      excAll = (ex2 ?? []) as ExcRange[];
      jexc = excAll.filter(x => x.date_debut <= t2 && x.date_fin >= t2).map(x => ({ eleve_id: x.eleve_id, type: x.type, moments: (x as { moments?: string[] | null }).moments ?? null }));
      prisesJour = (pr ?? []) as PriseEnCharge[];
      elevesAll = (elA ?? []) as Eleve[];
    } else {
      setWeekStops([]);
    }
    setExceptions(jexc as ExcToday[]);
    setExcRange(excAll);
    setPrises(prisesJour);

    // Historique des prises (120 derniers jours) pour l'onglet Historique
    const { data: prAll } = await sb.from("prises_en_charge").select("*")
      .eq("conducteur_id", cid)
      .gte("date", new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10))
      .order("date", { ascending: false });
    setPrisesHist((prAll ?? []) as PriseEnCharge[]);

    // Résumé pop-up : par circuit, matin + après-midi du jour
    const journee: JourneeCircuit[] = myCircs.map(c => {
      const stops = hebdo.filter(h => h.circuit_id === c.id);
      const matin = stops.filter(h => h.sens === "matin");
      const aprem = stops.filter(h => h.sens === "aprem");
      const excEnf = new Set(stops.filter(h => h.eleve_id && jexc.some(x => x.eleve_id === h.eleve_id)).map(h => h.eleve_id)).size;
      const nbEnf = new Set(matin.map(h => (h.eleve_id ?? h.eleve_nom) as string | number)).size;
      return { id: c.id, nom: c.nom, emoji: c.emoji, nb: nbEnf,
        premierRamassage: matin[0]?.heure ?? null,
        premiereDepose: aprem[0]?.heure ?? null,
        derniereDepose: aprem[aprem.length - 1]?.heure ?? null, excEnf };
    });
    setJourneeCircuits(journee);

    // Tournée du circuit principal : arrêts matin + après-midi (map → forme Eleve)
    const eleveById = new Map<number, Eleve>(elevesAll.map(e => [e.id, e]));
    const toEleve = (h: HebdoRow): Eleve => {
      const parts = (h.eleve_nom || "").trim().split(/\s+/);
      const prenom = parts.shift() || "";
      const nom = parts.join(" ");
      const base = h.eleve_id ? eleveById.get(h.eleve_id) : undefined;
      return {
        ...(base ?? {} as Eleve),
        id: h.eleve_id ?? -h.id,
        nom_famille: base?.nom_famille ?? nom,
        prenom_initiale: base?.prenom_initiale ?? prenom,
        adresse: h.adresse ?? base?.adresse ?? "",
        circuit_id: h.circuit_id,
        actif: true, type_transport: "standard", created_at: "",
        heure_ramassage: h.heure,
      } as Eleve;
    };
    const primary = effectiveCircuitId;
    const primStops = hebdo.filter(h => h.circuit_id === primary);
    setMatinEleves(primStops.filter(h => h.sens === "matin").map(toEleve));
    setApremEleves(primStops.filter(h => h.sens === "aprem").map(toEleve));

    // Annonce de lancement (accusé de lecture) + écarts signalés
    const [{ data: ack }, { data: ec }] = await Promise.all([
      sb.from("annonces_conducteur_lues").select("lu_at").eq("conducteur_id", cid).eq("cle", ANNONCE_CLE).maybeSingle(),
      sb.from("signalements_ecart").select("id,message,statut,created_at,circuit_id").eq("conducteur_id", cid).order("created_at", { ascending: false }),
    ]);
    setAnnonceLue(ack?.lu_at ?? null);
    setMesEcarts(ec ?? []);
    // Pop-up seulement si un circuit est attribué ET pas encore accusé réception
    setShowAnnonce(!!effectiveCircuitId && !ack);

    setLoading(false);
  },[sb]);

  useEffect(()=>{
    load();
    const ch=sb.channel("cond-rt")
      .on("postgres_changes",{event:"*",schema:"public",table:"absences_enfants"},load)
      .on("postgres_changes",{event:"*",schema:"public",table:"incidents"},load)
      .on("postgres_changes",{event:"*",schema:"public",table:"service_logs"},load)
      .on("postgres_changes",{event:"*",schema:"public",table:"conges_demandes"},load)
      .on("postgres_changes",{event:"*",schema:"public",table:"prises_en_charge"},load)
      .on("postgres_changes",{event:"*",schema:"public",table:"exceptions_eleves"},load)
      // Actualisation en direct (sans rafraîchir) quand la répartition/planning change
      .on("postgres_changes",{event:"*",schema:"public",table:"conducteurs"},load)
      .on("postgres_changes",{event:"*",schema:"public",table:"circuits"},load)
      .on("postgres_changes",{event:"*",schema:"public",table:"tournee_hebdo"},load)
      .on("postgres_changes",{event:"*",schema:"public",table:"remplacements_exceptionnels"},load)
      .subscribe();
    return()=>{sb.removeChannel(ch);};
  },[load,sb]);

  // Bascule automatique au changement de jour — infaillible :
  //  • timer chaque minute (bascule à minuit si l'appli reste ouverte)
  //  • re-vérif dès que l'appli revient au premier plan (ouverture le matin, retour d'arrière-plan)
  useEffect(()=>{
    let cur=isoToday();
    const check=()=>{ const now=isoToday(); if(now!==cur){ cur=now; setJourneeSeen(false); load(); } };
    const id=setInterval(check,60000);
    const onVis=()=>{ if(typeof document!=="undefined" && document.visibilityState==="visible") check(); };
    document.addEventListener("visibilitychange",onVis);
    window.addEventListener("focus",onVis);
    return()=>{ clearInterval(id); document.removeEventListener("visibilitychange",onVis); window.removeEventListener("focus",onVis); };
  },[load]);

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
    // Pas de notification de prise de service (bruit inutile côté gestionnaire).
    if(data)setTodayLog(data);
    setDriver(p=>p?{...p,status:"en_service"}:p);
    setShowConfirm(false);
  }

  async function handleTerminerService(){
    if(!driver)return;
    if(todayLog){
      await sb.from("service_logs").update({heure_fin:nowTimeStr(),status:"termine"}).eq("id",todayLog.id);
    }
    await sb.from("conducteurs").update({status:"disponible"}).eq("id",driver.id);
    // Pas de notification de fin de service — bruit inutile.
    setDriver(p=>p?{...p,status:"disponible"}:p);
    setTodayLog(p=>p?{...p,heure_fin:nowTimeStr(),status:"termine"}:p);
    setShowFin(false);
  }

  // Rouvrir un service terminé (pour ne pas rester bloqué sur « Service terminé »)
  async function handleReopenService(){
    if(!driver)return;
    if(todayLog){
      await sb.from("service_logs").update({heure_fin:null,status:"en_service"}).eq("id",todayLog.id);
      setTodayLog(p=>p?{...p,heure_fin:undefined,status:"en_service"}:p);
      await sb.from("conducteurs").update({status:"en_service"}).eq("id",driver.id);
      setDriver(p=>p?{...p,status:"en_service"}:p);
    } else {
      await handlePrendreService();
    }
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
    // Pas de notification de reprise — bruit inutile.
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

  async function handleSaveFiche(patch:Partial<Conducteur>){
    if(!driver)return;
    await sb.from("conducteurs").update(patch).eq("id",driver.id);
    setDriver(p=>p?{...p,...patch}:p);
  }

  async function handleMarquerEleve(eleveId: number, statut: "present" | "absent", sens: "aller" | "retour") {
    if (!driver) return;
    const today = isoToday();
    // Arrêt non relié à un élève en base (id synthétique négatif) → progression locale.
    if (eleveId <= 0) {
      setPrises(p => [...p.filter(x => !(x.eleve_id === eleveId && x.sens === sens)),
        { id: eleveId, eleve_id: eleveId, conducteur_id: driver.id,
          circuit_id: driver.circuit_id || undefined, date: today,
          sens, statut, created_at: "" } as PriseEnCharge]);
      return;
    }
    const now = new Date().toTimeString().slice(0, 8);

    // Vérifie si une entrée existe déjà pour ce sens
    const { data: existing } = await sb.from("prises_en_charge")
      .select("id").eq("eleve_id", eleveId).eq("conducteur_id", driver.id)
      .eq("date", today).eq("sens", sens).maybeSingle();

    if (existing) {
      await sb.from("prises_en_charge").update({ statut }).eq("id", existing.id);
    } else {
      await sb.from("prises_en_charge").insert({
        eleve_id: eleveId, conducteur_id: driver.id,
        circuit_id: driver.circuit_id || null,
        date: today, heure_prise: statut === "present" ? now : null,
        sens, statut,
      });
    }

    // Mise à jour locale immédiate (on garde les prises locales synthétiques)
    const { data: pr } = await sb.from("prises_en_charge").select("*")
      .eq("conducteur_id", driver.id).eq("date", today);
    setPrises(prev => {
      const locales = prev.filter(x => x.eleve_id <= 0);
      return [...(pr ?? []), ...locales];
    });
  }

  async function handleEnvoyerConge(form:{date_debut:string;date_fin:string;motif:string;justification:string}){
    if(!driver)return;
    await sb.from("conges_demandes").insert({
      conducteur_id:driver.id,...form,statut:"en_attente",
    });
    await load();
  }

  async function handleSignOut(){
    await sb.auth.signOut();
    router.push("/login");
  }

  // ── Valeurs calculées ─────────────────────────────────────────────────────────
  const circ   = driver?.circuit as{nom?:string;emoji?:string;enfants_count?:number;id?:string;cercle?:{nom?:string}}|undefined;
  const veh    = driver?.vehicule as{plaque?:string;marque?:string;modele?:string}|undefined;
  const enfantsCircuit = driver?.circuit_id ? enfants.filter(e=>e.circuit_id===driver.circuit_id) : [];
  const incWithResponse= incidents.filter(i=>i.response||i.status==="resolu");
  const unreadMsg      = messages.filter(m=>!m.read).length;
  const pendingInc     = incidents.filter(i=>i.status==="en_attente").length;


  const tabIcon=(id:Tab,size:number)=>({
    tournee:      <MapPin size={size} />,
    fiche:        <FileText size={size} />,
    signalements: <AlertCircle size={size} />,
    messages:     <Mail size={size} />,
    planning:     <CalendarRange size={size} />,
    historique:   <History size={size} />,
    conges:       <CalendarDays size={size} />,
    info:         <Info size={size} />,
  }[id]);
  // Barre du bas (accès rapide) — la tournée est en premier, mise en avant.
  const BOTTOM:{id:Tab;label:string;badge?:number}[]=[
    {id:"tournee",      label:"Ma tournée"},
    {id:"fiche",        label:"Ma fiche"},
    {id:"signalements", label:"Signaler",badge:pendingInc||undefined},
    {id:"messages",     label:"Messages",badge:unreadMsg||undefined},
  ];
  // Menu « Plus » (tiroir) — le reste des onglets.
  const MORE:{id:Tab;label:string;badge?:number}[]=[
    {id:"info",         label:"Infos"},
    {id:"planning",     label:"Planning"},
    {id:"historique",   label:"Historique"},
    {id:"conges",       label:"Mes congés"},
  ];
  const TAB_LABELS:Record<Tab,string>={
    tournee:"Ma tournée",fiche:"Ma fiche",
    signalements:"Signalements",messages:"Messages",planning:"Planning",historique:"Historique",conges:"Congés",info:"Infos",
  };

  // ── Annonce de lancement : accusé de lecture (privé) + signalement d'écart (→ responsable) ──
  async function markAnnonceLue(){
    if(!condId) return;
    const now=new Date().toISOString();
    await sb.from("annonces_conducteur_lues").upsert(
      {conducteur_id:condId, cle:ANNONCE_CLE, lu_at:now}, {onConflict:"conducteur_id,cle"});
    setAnnonceLue(now);
    setShowAnnonce(false);
  }
  async function submitEcart(){
    if(!condId || !ecartText.trim()) return;
    setEcartBusy(true);
    await sb.from("signalements_ecart").insert(
      {conducteur_id:condId, circuit_id:driver?.circuit_id||null, message:ecartText.trim()});
    const {data:ec}=await sb.from("signalements_ecart")
      .select("id,message,statut,created_at,circuit_id").eq("conducteur_id",condId)
      .order("created_at",{ascending:false});
    setMesEcarts(ec??[]);
    setEcartBusy(false);
    setEcartText("");
    setEcartOpen(false);
    await markAnnonceLue();
  }

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
  const initials=((driver.prenom[0]??"").toUpperCase()+(driver.nom[0]??"").toUpperCase());
  const inMore=MORE.some(m=>m.id===tab);
  return(
    <div style={{minHeight:"100vh",background:C.gray50}}>

      {/* ── Header sticky : logo + identité + statut ── */}
      <header style={{position:"sticky",top:0,zIndex:100,background:C.navy,
        height:58,display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"0 14px",boxShadow:"0 2px 8px rgba(0,0,0,0.2)",gap:10}}>
        <img src="/logo.png" alt="Taxi Romontois" style={{height:30,width:"auto",display:"block",flexShrink:0}} />
        <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
          <div style={{textAlign:"right",minWidth:0}}>
            <div style={{color:C.white,fontWeight:800,fontSize:13.5,lineHeight:1.15,
              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {driver.prenom} {driver.nom}
            </div>
            {circ&&<div style={{color:C.sky,fontWeight:600,fontSize:11,lineHeight:1.2,
              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {circ.emoji} {circ.nom}
            </div>}
          </div>
          <StatusBadge status={driver.status}/>
        </div>
      </header>

      {/* ── Tiroir « Plus » depuis la droite ── */}
      {drawerOpen&&(
        <div style={{position:"fixed",inset:0,zIndex:200}}>
          <div onClick={()=>setDrawerOpen(false)}
            style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.45)"}} />
          <div style={{position:"absolute",right:0,top:0,bottom:0,width:260,
            background:C.navy,display:"flex",flexDirection:"column",
            boxShadow:"-4px 0 20px rgba(0,0,0,0.3)",zIndex:1}}>
            <div style={{padding:"16px 18px",borderBottom:"1px solid rgba(255,255,255,0.1)",
              display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:42,height:42,borderRadius:"50%",background:C.white,
                color:C.navy,display:"flex",alignItems:"center",justifyContent:"center",
                fontWeight:900,fontSize:16,flexShrink:0}}>
                {initials||"??"}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:C.white,fontWeight:700,fontSize:14}}>{driver.prenom} {driver.nom}</div>
                <div style={{color:C.sky,fontWeight:600,fontSize:12}}>Conducteur</div>
              </div>
              <button onClick={()=>setDrawerOpen(false)}
                style={{background:"none",border:"none",color:"rgba(255,255,255,0.7)",
                  cursor:"pointer",lineHeight:1,padding:4,display:"flex"}}>
                <X size={20} color="rgba(255,255,255,0.7)"/>
              </button>
            </div>
            <nav style={{flex:1,padding:10,overflowY:"auto"}}>
              {MORE.map(t=>(
                <button key={t.id} onClick={()=>{setTab(t.id);setDrawerOpen(false);}}
                  style={{width:"100%",display:"flex",alignItems:"center",gap:10,
                    padding:"12px 12px",borderRadius:8,border:"none",cursor:"pointer",
                    background:tab===t.id?C.white:"transparent",
                    color:tab===t.id?C.navy:C.white,
                    fontWeight:tab===t.id?800:600,fontSize:14,textAlign:"left",marginBottom:2}}>
                  <span style={{display:"flex",alignItems:"center"}}>{tabIcon(t.id,16)}</span>
                  <span style={{flex:1}}>{t.label}</span>
                </button>
              ))}
              {(driver as {est_responsable?:boolean}).est_responsable && (
                <button onClick={()=>router.push("/gestionnaire/etablissements")}
                  style={{width:"100%",display:"flex",alignItems:"center",gap:10,
                    padding:"12px 12px",borderRadius:8,border:"none",cursor:"pointer",
                    background:"rgba(255,255,255,0.12)",color:C.white,
                    fontWeight:700,fontSize:14,textAlign:"left",marginTop:8}}>
                  <span style={{display:"flex",alignItems:"center"}}><ShieldCheck size={16}/></span>
                  <span style={{flex:1}}>Gérer mon secteur</span>
                </button>
              )}
            </nav>
            <div style={{padding:"12px 14px",borderTop:"1px solid rgba(255,255,255,0.1)"}}>
              <button onClick={handleSignOut}
                style={{width:"100%",padding:"12px 16px",borderRadius:10,border:"none",
                  background:"transparent",color:C.white,cursor:"pointer",
                  fontSize:14,fontWeight:700,textAlign:"left",
                  display:"flex",alignItems:"center",gap:8}}>
                <LogOut size={16} color={C.white} /> Déconnexion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Contenu ── */}
      <div style={{maxWidth:860,margin:"0 auto",padding:"16px 16px 92px"}}>

      {/* Titre de la vue courante */}
      <h1 style={{fontSize:19,fontWeight:900,color:C.navy,margin:"2px 2px 14px"}}>{TAB_LABELS[tab]}</h1>

      {/* Contenu des onglets */}
      {tab==="tournee"&&(
        <TabTournee driver={driver} circ={circ}
          matin={matinEleves} aprem={apremEleves} prises={prises} exceptions={exceptions}
          enService={driver.status==="en_service"} serviceFini={!!todayLog?.heure_fin}
          onMarquerEleve={handleMarquerEleve}
          onShowConfirm={()=>setShowConfirm(true)}
          onShowFin={()=>setShowFin(true)}
          onReopenService={handleReopenService}
          onShowReprise={()=>setShowReprise(true)}/>
      )}
      {tab==="fiche"&&(
        <TabFiche driver={driver} circ={circ} veh={veh} enfantsCircuit={enfantsCircuit}
          todayLog={todayLog} onSave={handleSaveFiche}/>
      )}
      {tab==="signalements"&&(
        <TabSignalements driver={driver} incidents={incidents}
          signType={signType} signDesc={signDesc} signUrgence={signUrgence} signSent={signSent}
          onSetSignType={setSignType} onSetSignDesc={setSignDesc} onSetSignUrgence={setSignUrgence}
          onEnvoyer={handleEnvoyerSignalement} onShowAbsence={()=>setShowAbsence(true)}/>
      )}
      {tab==="messages"&&(
        <TabMessages messages={messages} incidents={incidents} absences={absences} enfants={enfants}
          incWithResponse={incWithResponse} unreadMsg={unreadMsg}
          myNom={driver?`${driver.prenom} ${driver.nom}`:"Conducteur"}
          isResponsable={!!(driver as {est_responsable?:boolean})?.est_responsable}
          onMarquerLu={handleMarquerLu} onSetTab={t=>setTab(t as Tab)}/>
      )}
      {tab==="planning"&&(
        <TabPlanning circuits={myCircuits} week={weekStops} exceptions={excRange}/>
      )}
      {tab==="historique"&&(
        <TabHistorique histLogs={histLogs} incidents={incidents} prisesHist={prisesHist} week={weekStops} />
      )}
      {tab==="conges"&&(
        <TabConges conges={conges} onSend={handleEnvoyerConge}/>
      )}
      {tab==="info"&&(
        <div style={{maxWidth:640}}>
          <div style={{background:C.white,borderRadius:16,padding:18,boxShadow:"0 2px 8px rgba(0,0,0,.06)",marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <Info size={18} color={C.navy}/>
              <div style={{fontWeight:800,fontSize:15,color:C.navy}}>Attribution des circuits</div>
            </div>
            <p style={{fontSize:14,color:"#475569",lineHeight:1.55,margin:0}}>
              Vos circuits sont désormais attribués. Merci de vérifier votre affectation avec le document
              remis lors de la formation. En cas d&apos;écart, signalez-le à votre responsable de secteur.
            </p>
            {annonceLue
              ? <div style={{marginTop:12,fontSize:12.5,color:C.green,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>
                  ✓ Lu et vérifié le {new Date(annonceLue).toLocaleDateString("fr-CH")}
                </div>
              : <button onClick={markAnnonceLue}
                  style={{marginTop:12,padding:"11px 16px",background:C.navy,color:C.white,borderRadius:10,border:"none",fontSize:14,fontWeight:800,cursor:"pointer"}}>
                  J&apos;ai vérifié
                </button>}
            <button onClick={()=>{setEcartText("");setEcartOpen(true);}}
              style={{marginTop:10,marginLeft:annonceLue?0:10,padding:"11px 16px",background:"#fff",color:C.navy,borderRadius:10,border:`1.5px solid ${C.gray200}`,fontSize:14,fontWeight:800,cursor:"pointer"}}>
              Signaler un écart
            </button>
          </div>
          {mesEcarts.length>0&&(
            <div style={{background:C.white,borderRadius:16,padding:18,boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}>
              <div style={{fontWeight:800,fontSize:14,color:C.navy,marginBottom:6}}>Mes écarts signalés</div>
              {mesEcarts.map(e=>(
                <div key={e.id} style={{padding:"10px 0",borderTop:`1px solid ${C.gray100}`}}>
                  <div style={{fontSize:13.5,color:"#1E293B"}}>{e.message}</div>
                  <div style={{fontSize:11.5,color:C.gray400,marginTop:2}}>
                    {new Date(e.created_at).toLocaleDateString("fr-CH")} · {e.statut==="ouvert"?"Transmis au responsable":e.statut}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pop-up de lancement : « vos circuits sont attribués » (une fois, accusé de lecture qui reste) */}
      {showAnnonce&&(
        <div style={{position:"fixed",inset:0,background:"rgba(13,59,122,0.6)",zIndex:9998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:C.white,borderRadius:16,padding:26,width:"100%",maxWidth:420,boxShadow:"0 8px 32px rgba(0,0,0,0.3)"}}>
            <div style={{fontSize:30,marginBottom:8}}>📋</div>
            <h2 style={{margin:"0 0 8px",fontSize:19,color:C.navy,fontWeight:900}}>Vos circuits sont attribués</h2>
            <p style={{margin:"0 0 18px",fontSize:14.5,color:"#475569",lineHeight:1.55}}>
              Merci de vérifier votre affectation avec le document remis lors de la formation.
              En cas d&apos;écart, signalez-le à votre responsable de secteur.
            </p>
            <button onClick={markAnnonceLue}
              style={{width:"100%",padding:"13px",background:C.navy,color:C.white,borderRadius:12,border:"none",fontSize:15.5,fontWeight:800,cursor:"pointer",marginBottom:10}}>
              J&apos;ai vérifié
            </button>
            <button onClick={()=>{setShowAnnonce(false);setEcartText("");setEcartOpen(true);}}
              style={{width:"100%",padding:"12px",background:"#fff",color:C.navy,borderRadius:12,border:`1.5px solid ${C.gray200}`,fontSize:14.5,fontWeight:800,cursor:"pointer"}}>
              Signaler un écart
            </button>
          </div>
        </div>
      )}

      {/* Signaler un écart → remonte au responsable de secteur */}
      {ecartOpen&&(
        <div style={{position:"fixed",inset:0,background:"rgba(13,59,122,0.6)",zIndex:9998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:C.white,borderRadius:16,padding:24,width:"100%",maxWidth:420,boxShadow:"0 8px 32px rgba(0,0,0,0.3)"}}>
            <h2 style={{margin:"0 0 6px",fontSize:18,color:C.navy,fontWeight:900}}>Signaler un écart</h2>
            <p style={{margin:"0 0 12px",fontSize:13.5,color:C.gray600,lineHeight:1.5}}>
              Décrivez ce qui ne correspond pas à votre document. Votre responsable de secteur sera prévenu.
            </p>
            <textarea value={ecartText} onChange={e=>setEcartText(e.target.value)} rows={4}
              placeholder="Ex : mon circuit ne correspond pas, véhicule différent…"
              style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1.5px solid ${C.gray200}`,fontSize:14,boxSizing:"border-box",fontFamily:"inherit",resize:"vertical",marginBottom:14}}/>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>setEcartOpen(false)}
                style={{padding:"10px 16px",borderRadius:10,border:`1px solid ${C.gray200}`,background:"#fff",color:C.gray800,fontSize:14,fontWeight:700,cursor:"pointer"}}>
                Annuler
              </button>
              <button onClick={submitEcart} disabled={ecartBusy||!ecartText.trim()}
                style={{padding:"10px 16px",borderRadius:10,border:"none",background:ecartText.trim()?C.navy:C.gray200,color:C.white,fontSize:14,fontWeight:800,cursor:ecartText.trim()?"pointer":"default"}}>
                {ecartBusy?"Envoi…":"Envoyer au responsable"}
              </button>
            </div>
          </div>
        </div>
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

      {/* ── Résumé de la journée (pop-up d'accueil) ── */}
      {!journeeSeen && journeeCircuits.length>0 && driver.status!=="absent" && (
        <div onClick={markJourneeSeen} style={{position:"fixed",inset:0,zIndex:9998,
          background:"rgba(13,59,122,0.55)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{background:C.white,borderRadius:20,padding:22,width:"100%",
            maxWidth:440,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.35)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <h2 style={{margin:0,fontSize:20,fontWeight:900,color:C.navy}}>Votre journée</h2>
              <button onClick={markJourneeSeen} style={{background:"none",border:"none",cursor:"pointer",padding:4,display:"flex",lineHeight:1}}>
                <X size={20} color={C.gray}/>
              </button>
            </div>
          <p style={{fontSize:14,color:C.gray600,lineHeight:1.5,margin:"0 0 16px"}}>
            Bonjour {driver.prenom}, voici {journeeCircuits.length>1?"vos circuits":"votre circuit"} pour aujourd&apos;hui.
          </p>
          {journeeCircuits.map((jc,i)=>(
            <div key={jc.id} style={{background:C.gray50,border:`1.5px solid ${C.gray200}`,
              borderRadius:14,padding:14,marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <span style={{fontSize:20,lineHeight:1}}>{jc.emoji||"🚌"}</span>
                <span style={{fontWeight:800,fontSize:15,color:C.navy,flex:1}}>{jc.nom}</span>
                <span style={{fontSize:12,fontWeight:700,color:C.gray600,background:C.white,
                  border:`1px solid ${C.gray200}`,borderRadius:99,padding:"2px 9px"}}>
                  {jc.nb} élève{jc.nb>1?"s":""}
                </span>
              </div>
              <div style={{display:"flex",gap:10}}>
                <div style={{flex:1,background:C.white,borderRadius:10,padding:"9px 11px",border:`1px solid ${C.gray200}`}}>
                  <div style={{fontSize:10.5,fontWeight:800,color:"#F59E0B",letterSpacing:".3px",marginBottom:3}}>☀️ MATIN</div>
                  <div style={{fontSize:13,color:"#1E293B",fontWeight:600,lineHeight:1.4}}>
                    {jc.premierRamassage
                      ? <>Ramassage dès <strong>{jc.premierRamassage}</strong></>
                      : <span style={{color:C.gray}}>—</span>}
                  </div>
                </div>
                <div style={{flex:1,background:C.white,borderRadius:10,padding:"9px 11px",border:`1px solid ${C.gray200}`}}>
                  <div style={{fontSize:10.5,fontWeight:800,color:"#6366F1",letterSpacing:".3px",marginBottom:3}}>🌙 APRÈS-MIDI</div>
                  <div style={{fontSize:13,color:"#1E293B",fontWeight:600,lineHeight:1.4}}>
                    {jc.derniereDepose
                      ? (jc.premiereDepose && jc.premiereDepose!==jc.derniereDepose
                          ? <>Dépose <strong>{jc.premiereDepose}</strong> → <strong>{jc.derniereDepose}</strong></>
                          : <>Dépose <strong>{jc.derniereDepose}</strong></>)
                      : <span style={{color:C.gray}}>—</span>}
                  </div>
                </div>
              </div>
              {jc.excEnf>0&&(
                <div style={{marginTop:9,background:"#FFF7ED",border:"1px solid #FED7AA",borderRadius:9,
                  padding:"7px 10px",fontSize:12.5,color:"#9A3412",fontWeight:600}}>
                  ⚠️ {jc.excEnf} élève{jc.excEnf>1?"s":""} à ne pas récupérer aujourd&apos;hui (absent / ramené par les parents).
                </div>
              )}
            </div>
          ))}
          <BigBtn label="J'ai pris connaissance" onClick={markJourneeSeen} color={C.navy}/>
          </div>
        </div>
      )}

      </div>

      {/* ── Barre de navigation du bas (mobile) ── */}
      <nav style={{position:"fixed",left:0,right:0,bottom:0,zIndex:150,background:C.white,
        borderTop:`1px solid ${C.gray200}`,boxShadow:"0 -2px 12px rgba(0,0,0,0.06)",
        display:"flex",paddingBottom:"env(safe-area-inset-bottom)"}}>
        {BOTTOM.map(t=>{
          const active=tab===t.id;
          return(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",
                gap:3,padding:"9px 2px 8px",border:"none",background:"transparent",
                cursor:"pointer",color:active?C.navy:C.gray}}>
              <span style={{position:"relative",display:"flex"}}>
                {tabIcon(t.id,active?23:22)}
                {t.badge!=null&&t.badge>0&&(
                  <span style={{position:"absolute",top:-5,right:-8,background:C.red,color:C.white,
                    borderRadius:99,fontSize:9,fontWeight:900,minWidth:15,height:15,
                    display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",
                    lineHeight:1,border:`1.5px solid ${C.white}`}}>{Math.min(t.badge,99)}</span>
                )}
              </span>
              <span style={{fontSize:10.5,fontWeight:active?800:600,letterSpacing:"-.2px"}}>{t.label}</span>
            </button>
          );
        })}
        <button onClick={()=>setDrawerOpen(true)}
          style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",
            gap:3,padding:"9px 2px 8px",border:"none",background:"transparent",
            cursor:"pointer",color:inMore?C.navy:C.gray}}>
          <MoreHorizontal size={inMore?23:22}/>
          <span style={{fontSize:10.5,fontWeight:inMore?800:600,letterSpacing:"-.2px"}}>Plus</span>
        </button>
      </nav>
    </div>
  );
}
