"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";
import { circuitImage } from "@/lib/circuit-images";
import { Btn, Badge, Modal } from "@/components/ui";
import { ImportExcelModal } from "./ImportExcelModal";
import HistoriqueEtab from "./HistoriqueEtab";
import type { Ecole, Eleve, Circuit, Conducteur, PriseEnCharge, TourneeConfig, AdresseEleve, CercleScolaire } from "@/lib/types";

type ConduPartial = Pick<Conducteur, "id" | "nom" | "prenom" | "circuit_id" | "status"> & { est_responsable?: boolean; tel?: string; secteur?: string };
type HebdoStop = { id: number; circuit_id: string; jour: number; sens: "matin" | "aprem"; ordre: number; heure: string; eleve_nom: string; adresse: string | null; eleve_id: number | null };
type NotifParent = { id: number; eleve_id: number | null; circuit_id: string | null; type: string; message: string; date_jour: string; created_at: string; lu: boolean };
import { ArrowLeft, ChevronDown, Plus, Pencil, Trash2, User } from "lucide-react";

interface CircuitForm { id: string; nom: string; emoji: string; num: string; km_aller: number; cercle_id: number | null; conducteur_id: number | ""; }
const EMPTY_CF: CircuitForm = { id:"", nom:"", emoji:"🚌", num:"", km_aller:0, cercle_id:null, conducteur_id:"" };

type ExcType = "absent" | "parent" | "changement_circuit";
interface ExceptionEleve {
  id: number; eleve_id: number; type: ExcType; date_debut: string; date_fin: string;
  circuit_cible_id: string | null; definitif: boolean; justification: string | null;
  source: string; statut: string; created_at: string;
}
interface ExcForm { eleve_id: number; type: ExcType; date_debut: string; date_fin: string; circuit_cible_id: string; definitif: boolean; justification: string; }
const EXC_LABEL: Record<ExcType,string> = { absent:"Absent", parent:"Ramené par les parents", changement_circuit:"Changement de circuit" };

const isoToday = () => new Date().toISOString().slice(0, 10);

const MOIS_NOMS = ["","Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

const TYPE_OPTS: { value: Eleve["type_transport"]; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "equipe",   label: "Équipé (PMR)" },
];

interface EleveForm {
  nom_famille: string;
  prenom_initiale: string;
  adresse: string;
  circuit_id: string;
  type_transport: Eleve["type_transport"];
  actif: boolean;
  nom_mere: string;
  tel_mere: string;
  nom_pere: string;
  tel_pere: string;
  remarques: string;
}
const EMPTY_EF: EleveForm = { nom_famille:"", prenom_initiale:"", adresse:"", circuit_id:"", type_transport:"standard", actif:true,
  nom_mere:"", tel_mere:"", nom_pere:"", tel_pere:"", remarques:"" };

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtJour(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-CH", { day: "numeric", month: "short" });
}

// Panneau du circuit (image générée) — sinon fallback emoji
function circIcon(c: Circuit, size: number) {
  const src = circuitImage(c.id);
  return src
    ? <img src={src} alt={c.nom} style={{ width: size, height: size, objectFit: "contain" }} />
    : <span style={{ fontSize: Math.round(size * 0.55) }}>{c.emoji || "🚌"}</span>;
}

// Génère un code de circuit à partir du nom (ex: "Petit Lac" → "PETIT-LAC-4821")
function slugCircuitId(nom: string) {
  const base = nom.trim().toUpperCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 16) || "CIRCUIT";
  return `${base}-${String(Date.now()).slice(-4)}`;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function EtablissementDetail() {
  const { id } = useParams<{ id: string }>();
  const ecoleId = Number(id);
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);

  const [ecole,      setEcole]      = useState<Ecole | null>(null);
  const [eleves,     setEleves]     = useState<Eleve[]>([]);
  const [circuits,   setCircuits]   = useState<Circuit[]>([]);
  const [allCircuits,setAllCircuits]= useState<Circuit[]>([]);
  const [conducteurs,setConducteurs]= useState<ConduPartial[]>([]);
  const [cercles,    setCercles]    = useState<CercleScolaire[]>([]);
  const [prises,     setPrises]     = useState<PriseEnCharge[]>([]);
  const [tournees,   setTournees]   = useState<TourneeConfig[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionEleve[]>([]);
  const [notifsParents, setNotifsParents] = useState<NotifParent[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState("Circuits & élèves");

  // Détail d'un circuit (liste des enfants) + menu d'actions par élève
  const [openCircuitId, setOpenCircuitId] = useState<string | null>(null);
  const [apercuFor,     setApercuFor]     = useState<string | null>(null);   // aperçu côté conducteur
  const [showImport,    setShowImport]    = useState(false);                 // import Excel
  const [circView,      setCircView]      = useState<"cartes" | "liste">("cartes"); // affichage circuits
  const [showActions,   setShowActions]   = useState(false);                 // menu Actions
  const [menuFor,       setMenuFor]       = useState<number | null>(null);
  const [openAcc,       setOpenAcc]       = useState<Record<string, boolean>>({});

  // Modal exception (absence période / ramené parents / changement de circuit)
  const [showExc, setShowExc] = useState(false);
  const [excForm, setExcForm] = useState<ExcForm | null>(null);
  const [savingExc, setSavingExc] = useState(false);

  // Circuit modal (gestion des circuits depuis l'établissement)
  const [showCircuit,  setShowCircuit]  = useState(false);
  const [editCircuit,  setEditCircuit]  = useState<Circuit | null>(null);
  const [circuitForm,  setCircuitForm]  = useState<CircuitForm>(EMPTY_CF);
  const [savingCirc,   setSavingCirc]   = useState(false);
  const [circErr,      setCircErr]      = useState("");

  // Élève modal
  const [showModal,  setShowModal]  = useState(false);
  const [editEleve,  setEditEleve]  = useState<Eleve | null>(null);
  const [eleveForm,  setEleveForm]  = useState<EleveForm>(EMPTY_EF);
  const [savingEl,   setSavingEl]   = useState(false);
  const [elErr,      setElErr]      = useState("");

  // Adresses multiples
  const EMPTY_ADDR = { type: "autre" as AdresseEleve["type"], nom_contact: "", telephone: "", adresse: "", jours: [] as string[] };
  const [eleveAdresses,  setEleveAdresses]  = useState<AdresseEleve[]>([]);
  const [showAddrAdd,    setShowAddrAdd]    = useState(false);
  const [addrForm,       setAddrForm]       = useState(EMPTY_ADDR);
  const [addrSaving,     setAddrSaving]     = useState(false);

  // Édition école
  const [showEdit,   setShowEdit]   = useState(false);
  const [editForm,   setEditForm]   = useState<Partial<Ecole>>({});
  const [savingEc,   setSavingEc]   = useState(false);

  // Factures
  const today = new Date();
  const [facMois,      setFacMois]      = useState(today.getMonth() + 1);
  const [facAnnee,     setFacAnnee]     = useState(today.getFullYear());
  const [numFacture,   setNumFacture]   = useState("");
  const [genLoading,   setGenLoading]   = useState(false);

  // Mois affiché dans le calendrier du Planning
  const [calRef, setCalRef] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [planCircuit, setPlanCircuit] = useState<string>("all");   // filtre circuit du Planning & absences
  const [hebdo, setHebdo] = useState<HebdoStop[]>([]);             // planning hebdo (matin + après-midi)
  const [planDay, setPlanDay] = useState<number>(0);              // jour consulté dans « Circuits & élèves » (0 = aujourd'hui)
  const shiftMonth = (delta: number) => setCalRef(r => {
    const t = r.m + delta;
    return { y: r.y + Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
  });

  const load = useCallback(async () => {
    const today_ = isoToday();
    const [
      { data: ecoleData },
      { data: elevesData },
      { data: allCirData },
      { data: conduData },
      { data: prisesData },
      { data: tournData },
      { data: cerclesData },
    ] = await Promise.all([
      sb.from("ecoles").select("*").eq("id", ecoleId).single(),
      sb.from("eleves").select("*").eq("ecole_id", ecoleId).order("nom_famille"),
      sb.from("circuits").select("*").order("nom"),
      sb.from("conducteurs").select("id,nom,prenom,circuit_id,status,est_responsable,tel,secteur"),
      sb.from("prises_en_charge").select("*").eq("date", today_),
      sb.from("tournees_config").select("*").eq("ecole_id", ecoleId),
      sb.from("cercles_scolaires").select("*").order("nom"),
    ]);

    const elevesList: Eleve[] = elevesData ?? [];
    // Circuits de cet établissement (lien direct ecole_id)
    const ecoleCircuits = (allCirData ?? []).filter((c: Circuit) => c.ecole_id === ecoleId);

    // Planning hebdo (matin + après-midi) des circuits de cet établissement
    const circIds = ecoleCircuits.map((c: Circuit) => c.id);
    let hebdoData: HebdoStop[] = [];
    if (circIds.length) {
      const { data: th } = await sb.from("tournee_hebdo")
        .select("id,circuit_id,jour,sens,ordre,heure,eleve_nom,adresse,eleve_id")
        .in("circuit_id", circIds);
      hebdoData = (th ?? []) as HebdoStop[];
    }

    // Exceptions par période des élèves de cet établissement
    const ids = elevesList.map(e => e.id);
    let excData: ExceptionEleve[] = [];
    let notifData: NotifParent[] = [];
    if (ids.length) {
      const [{ data: exc }, { data: notif }] = await Promise.all([
        sb.from("exceptions_eleves").select("*")
          .in("eleve_id", ids).neq("statut", "clos").order("date_debut", { ascending: false }),
        sb.from("notifications_parents").select("*")
          .eq("date_jour", today_).in("eleve_id", ids).order("created_at", { ascending: false }),
      ]);
      excData = (exc ?? []) as ExceptionEleve[];
      notifData = (notif ?? []) as NotifParent[];
    }

    setEcole(ecoleData ?? null);
    setEleves(elevesList);
    setCircuits(ecoleCircuits);
    setAllCircuits(allCirData ?? []);
    setConducteurs(conduData ?? []);
    setCercles(cerclesData ?? []);
    setPrises(prisesData ?? []);
    setTournees(tournData ?? []);
    setExceptions(excData);
    setNotifsParents(notifData);
    setHebdo(hebdoData);
    setLoading(false);
  }, [sb, ecoleId]);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    const ch = sb.channel(`etabl-${ecoleId}`)
      .on("postgres_changes", { event:"*", schema:"public", table:"eleves" }, load)
      .on("postgres_changes", { event:"*", schema:"public", table:"prises_en_charge" }, load)
      .on("postgres_changes", { event:"*", schema:"public", table:"ecoles" }, load)
      .on("postgres_changes", { event:"*", schema:"public", table:"circuits" }, load)
      .on("postgres_changes", { event:"*", schema:"public", table:"conducteurs" }, load)
      .on("postgres_changes", { event:"*", schema:"public", table:"exceptions_eleves" }, load)
      .on("postgres_changes", { event:"*", schema:"public", table:"notifications_parents" }, load)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [sb, ecoleId, load]);

  // ── Élève modal ────────────────────────────────────────────────────────────

  function openAdd() {
    setEditEleve(null);
    setEleveForm(EMPTY_EF);
    setElErr("");
    setEleveAdresses([]);
    setShowAddrAdd(false);
    setAddrForm(EMPTY_ADDR);
    setShowModal(true);
  }
  async function openEdit(e: Eleve) {
    setEditEleve(e);
    setEleveForm({
      nom_famille: e.nom_famille,
      prenom_initiale: e.prenom_initiale,
      adresse: e.adresse ?? "",
      circuit_id: e.circuit_id ?? "",
      type_transport: e.type_transport,
      actif: e.actif,
      nom_mere: e.nom_mere ?? "",
      tel_mere: e.tel_mere ?? "",
      nom_pere: e.nom_pere ?? "",
      tel_pere: e.tel_pere ?? "",
      remarques: e.remarques ?? "",
    });
    setElErr("");
    setShowAddrAdd(false);
    setAddrForm(EMPTY_ADDR);
    const { data: adrData } = await sb.from("adresses_eleves").select("*").eq("eleve_id", e.id);
    setEleveAdresses(adrData ?? []);
    setShowModal(true);
  }

  async function handleAddAdresse() {
    if (!addrForm.adresse.trim() || !editEleve) return;
    setAddrSaving(true);
    const { data } = await sb.from("adresses_eleves").insert({
      eleve_id: editEleve.id,
      type: addrForm.type,
      nom_contact: addrForm.nom_contact.trim() || null,
      telephone: addrForm.telephone.trim() || null,
      adresse: addrForm.adresse.trim(),
      jours_application: addrForm.jours,
    }).select().single();
    if (data) setEleveAdresses(prev => [...prev, data as AdresseEleve]);
    setAddrForm(EMPTY_ADDR);
    setShowAddrAdd(false);
    setAddrSaving(false);
  }

  async function handleDeleteAdresse(id: number) {
    await sb.from("adresses_eleves").delete().eq("id", id);
    setEleveAdresses(prev => prev.filter(a => a.id !== id));
  }

  async function handleSaveEleve() {
    if (!eleveForm.nom_famille.trim()) { setElErr("Le nom est obligatoire."); return; }
    setSavingEl(true);
    setElErr("");
    const payload = {
      nom_famille: eleveForm.nom_famille.trim(),
      prenom_initiale: eleveForm.prenom_initiale.trim(),
      adresse: eleveForm.adresse.trim() || null,
      circuit_id: eleveForm.circuit_id || null,
      type_transport: eleveForm.type_transport,
      actif: eleveForm.actif,
      nom_mere: eleveForm.nom_mere.trim() || null,
      tel_mere: eleveForm.tel_mere.trim() || null,
      nom_pere: eleveForm.nom_pere.trim() || null,
      tel_pere: eleveForm.tel_pere.trim() || null,
      remarques: eleveForm.remarques.trim() || null,
      ecole_id: ecoleId,
    };
    let err;
    if (editEleve) {
      ({ error: err } = await sb.from("eleves").update(payload).eq("id", editEleve.id));
    } else {
      ({ error: err } = await sb.from("eleves").insert(payload));
    }
    setSavingEl(false);
    if (err) { setElErr(err.message); return; }
    setShowModal(false);
    load();
  }

  // ── Édition école ──────────────────────────────────────────────────────────

  function openEditEcole() {
    if (!ecole) return;
    setEditForm({
      nom: ecole.nom, adresse: ecole.adresse ?? "",
      nom_responsable_facturation: ecole.nom_responsable_facturation ?? "",
      email: ecole.email ?? "", telephone: ecole.telephone ?? "",
      numero_tva: ecole.numero_tva ?? "", iban: ecole.iban ?? "",
      lot: ecole.lot ?? "",
      secteur: ecole.secteur ?? "",
    });
    setShowEdit(true);
  }

  async function handleSaveEcole() {
    if (!ecole) return;
    setSavingEc(true);
    // Secteur vide → null (un établissement sans secteur n'est rattaché à aucun responsable)
    const payload = { ...editForm, secteur: (editForm.secteur || "").trim() || null };
    await sb.from("ecoles").update(payload).eq("id", ecoleId);
    setSavingEc(false);
    setShowEdit(false);
    load();
  }

  // ── Circuits (gérés directement dans l'établissement) ────────────────────────

  function openAddCircuit() {
    setEditCircuit(null);
    setCircErr("");
    setCircuitForm(EMPTY_CF);
    setShowCircuit(true);
  }
  function openEditCircuit(c: Circuit) {
    setEditCircuit(c);
    setCircErr("");
    const drv = conducteurs.find(d => d.circuit_id === c.id);
    setCircuitForm({
      id: c.id, nom: c.nom || "", emoji: c.emoji || "🚌", num: c.num || "",
      km_aller: c.km_aller ?? 0, cercle_id: c.cercle_id ?? null,
      conducteur_id: drv?.id ?? "",
    });
    setShowCircuit(true);
  }

  // Affecte un conducteur à un circuit — modèle « circuit → conducteur »
  // (un conducteur peut porter plusieurs circuits, chacun entier).
  async function assignConducteur(circuitId: string, newDriverId: number | "") {
    const newId = newDriverId === "" ? null : Number(newDriverId);
    const prevId = circuits.find(c => c.id === circuitId)?.conducteur_id ?? null;
    await sb.from("circuits").update({ conducteur_id: newId }).eq("id", circuitId);
    // Sync du « circuit principal » (le compte conducteur lit encore conducteurs.circuit_id)
    await syncPrimaryCircuit(newId);
    if (prevId && prevId !== newId) await syncPrimaryCircuit(prevId);
  }
  // conducteurs.circuit_id = un des circuits du conducteur (ou null) — cohérence avec le nouveau modèle
  async function syncPrimaryCircuit(driverId: number | null) {
    if (!driverId) return;
    const { data } = await sb.from("circuits").select("id").eq("conducteur_id", driverId).order("nom").limit(1);
    await sb.from("conducteurs").update({ circuit_id: data && data[0] ? data[0].id : null }).eq("id", driverId);
  }

  async function handleSaveCircuit() {
    const f = circuitForm;
    if (!f.nom.trim()) { setCircErr("Le nom du circuit est obligatoire."); return; }
    setSavingCirc(true);
    setCircErr("");

    if (editCircuit) {
      const { error } = await sb.from("circuits").update({
        nom: f.nom.trim(), emoji: f.emoji.trim() || "🚌", num: f.num.trim(),
        km_aller: Number(f.km_aller) || 0, cercle_id: f.cercle_id,
      }).eq("id", editCircuit.id);
      if (error) { setCircErr(error.message); setSavingCirc(false); return; }
      await assignConducteur(editCircuit.id, f.conducteur_id);
    } else {
      const newId = (f.id.trim() || slugCircuitId(f.nom)).toUpperCase();
      const { error } = await sb.from("circuits").insert({
        id: newId, nom: f.nom.trim(), emoji: f.emoji.trim() || "🚌",
        num: f.num.trim(), km_aller: Number(f.km_aller) || 0,
        cercle_id: f.cercle_id, ecole_id: ecoleId, enfants_count: 0,
      });
      if (error) {
        setCircErr(error.message.includes("duplicate") ? "Ce code de circuit existe déjà." : error.message);
        setSavingCirc(false); return;
      }
      if (f.conducteur_id) await assignConducteur(newId, f.conducteur_id);
    }
    setSavingCirc(false);
    setShowCircuit(false);
    load();
  }

  async function handleDeleteCircuit(c: Circuit) {
    const eleveIds = eleves.filter(e => e.circuit_id === c.id).map(e => e.id);
    const nb = eleveIds.length;
    if (!confirm(nb > 0
      ? `Supprimer le circuit « ${c.nom} » ET ses ${nb} élève(s) rattaché(s) ? Action définitive.`
      : `Supprimer définitivement le circuit « ${c.nom} » ?`)) return;

    const prevCond = c.conducteur_id ?? null;
    // 1) Élèves rattachés : suppression (ou détachement si la suppression est bloquée)
    if (nb > 0) {
      const { error } = await sb.from("eleves").delete().in("id", eleveIds);
      if (error) await sb.from("eleves").update({ circuit_id: null }).in("id", eleveIds);
    }
    // 2) Libère les références au circuit avant de le supprimer
    await sb.from("conducteurs").update({ circuit_id: null }).eq("circuit_id", c.id);
    await sb.from("vehicules").update({ circuit_id: null }).eq("circuit_id", c.id);
    // 3) Supprime le circuit
    const { error: cErr } = await sb.from("circuits").delete().eq("id", c.id);
    if (cErr) { alert("Suppression impossible : " + cErr.message); return; }
    // 4) Cohérence du conducteur (circuit principal) + fermeture du détail
    if (prevCond) await syncPrimaryCircuit(prevCond);
    if (openCircuitId === c.id) setOpenCircuitId(null);
    load();
  }

  // ── Exceptions (absence période, ramené parents, changement de circuit) ──────

  // Exception active aujourd'hui pour un élève (couvre la date du jour)
  function excToday(eleveId: number) {
    const t = isoToday();
    return exceptions.find(x => x.eleve_id === eleveId && x.date_debut <= t && x.date_fin >= t);
  }
  function excColor(type?: ExcType) {
    return type === "absent" ? C.red : type === "parent" ? C.amber : type === "changement_circuit" ? "#7C3AED" : C.gray400;
  }

  // Jour courant (1=lundi … 5=vendredi ; week-end → aperçu du lundi)
  const todayJour = (() => { const d = new Date().getDay(); return d >= 1 && d <= 5 ? d : 1; })();
  // Arrêts du planning hebdo pour un circuit, par sens, pour un jour donné (défaut = aujourd'hui)
  const stopsOf = (circuitId: string, sens: "matin" | "aprem", jour: number = todayJour) =>
    hebdo.filter(h => h.circuit_id === circuitId && h.jour === jour && h.sens === sens).sort((a, b) => a.ordre - b.ordre);

  // Absent / ramené parents pour AUJOURD'HUI (raccourci 1 jour)
  async function quickExc(e: Eleve, type: ExcType) {
    const t = isoToday();
    setMenuFor(null);
    await sb.from("exceptions_eleves").insert({
      eleve_id: e.id, type, date_debut: t, date_fin: t, source: "gestionnaire", statut: "actif",
    });
    load();
  }
  async function removeExc(id: number) {
    await sb.from("exceptions_eleves").delete().eq("id", id);
    load();
  }
  function openExc(e: Eleve, type: ExcType) {
    setMenuFor(null);
    const t = isoToday();
    setExcForm({ eleve_id: e.id, type, date_debut: t, date_fin: t, circuit_cible_id: "", definitif: false, justification: "" });
    setShowExc(true);
  }
  async function handleSaveExc() {
    if (!excForm) return;
    const f = excForm;
    setSavingExc(true);
    if (f.type === "changement_circuit" && f.definitif && f.circuit_cible_id) {
      // changement définitif : on déplace l'élève de circuit
      await sb.from("eleves").update({ circuit_id: f.circuit_cible_id }).eq("id", f.eleve_id);
    } else {
      await sb.from("exceptions_eleves").insert({
        eleve_id: f.eleve_id, type: f.type, date_debut: f.date_debut, date_fin: f.date_fin,
        circuit_cible_id: f.type === "changement_circuit" ? (f.circuit_cible_id || null) : null,
        definitif: !!f.definitif, justification: f.justification.trim() || null,
        source: "gestionnaire", statut: "actif",
      });
    }
    setSavingExc(false);
    setShowExc(false);
    load();
  }

  // Mise en pause justifiée (au lieu de supprimer) — réactivable
  async function handlePause(e: Eleve) {
    setMenuFor(null);
    if (e.actif) {
      const m = prompt(`Motif de la mise en pause de ${e.prenom_initiale} ${e.nom_famille} ?\n(ex : congé longue durée, déménagement…)`);
      if (m === null) return;
      await sb.from("eleves").update({ actif: false, pause_motif: m || null, paused_at: new Date().toISOString() }).eq("id", e.id);
    } else {
      await sb.from("eleves").update({ actif: true, pause_motif: null, paused_at: null }).eq("id", e.id);
    }
    load();
  }

  // Conducteurs groupés par secteur (pour l'affectation « par catégorie »)
  function driverOptgroups() {
    const groups: Record<string, ConduPartial[]> = {};
    conducteurs.forEach(d => { const s = d.secteur || "Sans secteur"; (groups[s] = groups[s] || []).push(d); });
    return Object.entries(groups).map(([sect, list]) => (
      <optgroup key={sect} label={`Secteur ${sect}`}>
        {list.map(d => (
          <option key={d.id} value={d.id}>{d.prenom} {d.nom}{d.est_responsable ? " (resp.)" : ""}</option>
        ))}
      </optgroup>
    ));
  }

  // ── Facture DGEO ───────────────────────────────────────────────────────────

  async function handleGenererFacture() {
    if (!ecole) return;
    setGenLoading(true);
    try {
      const debut = `${facAnnee}-${String(facMois).padStart(2,"0")}-01`;
      const fin   = new Date(facAnnee, facMois, 0).toISOString().slice(0, 10);
      const eleveIds = eleves.filter(e => e.actif).map(e => e.id);

      const [{ data: prisesM }, { data: paramRows }] = await Promise.all([
        sb.from("prises_en_charge").select("*").gte("date", debut).lte("date", fin)
          .in("eleve_id", eleveIds.length ? eleveIds : [-1]),
        sb.from("parametres").select("cle,valeur")
          .in("cle", ["nom_entreprise","adresse","telephone","tva","iban"]),
      ]);

      const params: Record<string,string> = {};
      (paramRows ?? []).forEach((r: { cle: string; valeur: string }) => { params[r.cle] = r.valeur; });

      const resp = await fetch("/api/gestionnaire/facture-dgeo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ecole,
          tournees,
          prises: prisesM ?? [],
          eleves,
          mois: facMois,
          annee: facAnnee,
          numFacture,
          params: { nom: params.nom_entreprise, adresse: params.adresse,
            telephone: params.telephone, tva: params.tva, iban: params.iban },
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const bytes = await resp.arrayBuffer();

      const nomEcole = ecole.nom.replace(/\s+/g,"_");
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `Facture_DGEO_${nomEcole}_${MOIS_NOMS[facMois]}_${facAnnee}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Erreur génération facture :\n${msg.slice(0, 300)}`);
      console.error("[facture-dgeo]", err);
    } finally {
      setGenLoading(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading || !ecole) return (
    <div style={{ padding: 40, color: C.gray600 }}>Chargement…</div>
  );

  const elevesActifs = eleves.filter(e => e.actif);
  const elevesIds    = new Set(eleves.filter(e => e.actif).map(e => e.id));

  // Suivi du jour — prises de cette école aujourd'hui
  const prisesEcole = prises.filter(p => elevesIds.has(p.eleve_id));
  // Conducteur d'un circuit — via le nouveau modèle circuits.conducteur_id
  const condOf = (c: Circuit): ConduPartial | undefined => conducteurs.find(d => d.id === c.conducteur_id);

  return (
    <div style={{ padding: "28px 28px", maxWidth: 980, margin: "0 auto" }}>
      <style>{`
        .etab-card{ transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease; }
        .etab-card:hover{ transform: translateY(-1px); box-shadow: 0 8px 22px rgba(13,59,122,.10); border-color:#c9d8ef; }
        .etab-card select, .etab-card button{ transition: background .12s ease; }
        .plan-grid{ display:grid; grid-template-columns:1.4fr 1fr; gap:16; }
        @media(max-width:860px){ .plan-grid{ grid-template-columns:1fr; } }
        .cal-days{ display:grid; grid-template-columns:repeat(7,1fr); gap:6px; }
        .cal-cell{ min-height:76px; border:1px solid #F1F5F9; border-radius:9px; padding:6px; }
      `}</style>
      {/* Retour */}
      <button onClick={() => router.push("/gestionnaire/etablissements")}
        style={{ display:"flex", alignItems:"center", gap:6, color:C.gray600,
          background:"none", border:"none", cursor:"pointer", fontSize:13,
          fontWeight:600, marginBottom:18, padding:0 }}>
        <ArrowLeft size={15} /> Tous les établissements
      </button>

      {/* En-tête établissement — compact, aligné (style simulateur) */}
      <div style={{ background: C.white, borderRadius: 14, padding: "12px 18px",
        border: `1px solid ${C.gray200}`, marginBottom: 16,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#0f2540" }}>{ecole.nom}</div>
          <div style={{ fontSize: 12, color: C.gray400, marginTop: 1 }}>
            {ecole.adresse || ""}{ecole.lot ? ` · Lot ${ecole.lot}` : ""} · Arrivée 08:25
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 7, fontSize: 11, color: C.gray }}>
            {([["#16A34A","Déposé"],["#E02424","Absent"],["#D97706","Parents"],["#7C3AED","Circuit temp."]] as const).map(([col,lbl]) => (
              <span key={lbl} style={{ display:"flex", alignItems:"center", gap:5 }}>
                <span style={{ width:8, height:8, borderRadius:"50%", background:col, display:"inline-block" }} />{lbl}
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          {[
            { v: elevesActifs.length, l: "Élèves", c: C.navy },
            { v: circuits.length,     l: "Circuits", c: C.navy },
            { v: prisesEcole.filter(p => p.statut === "present").length, l: "Déposés", c: C.green },
            { v: exceptions.filter(x => { const t = isoToday(); return x.date_debut <= t && x.date_fin >= t; }).length, l: "Exceptions", c: C.amber },
          ].map(s => (
            <div key={s.l} style={{ background: C.gray50, border: `1px solid ${C.gray200}`,
              borderRadius: 10, padding: "6px 11px", textAlign: "center", minWidth: 62 }}>
              <div style={{ fontSize: 17, fontWeight: 900, color: s.c, lineHeight: 1 }}>{s.v}</div>
              <div style={{ fontSize: 10, color: C.gray400, marginTop: 2 }}>{s.l}</div>
            </div>
          ))}
          <Btn small outline onClick={openEditEcole}>Modifier</Btn>
        </div>
      </div>

      {/* Onglets — style simulateur (emoji + soulignement) */}
      <div style={{ display:"flex", gap:4, borderBottom:`2px solid ${C.gray100}`, marginBottom:4, flexWrap:"wrap" }}>
        {([
          { id:"Circuits & élèves", ic:"🗺️" },
          { id:"Suivi du jour", ic:"✅", badge: circuits.length },
          { id:"Planning & absences", ic:"📅", badge: exceptions.filter(x => { const t = isoToday(); return x.date_debut <= t && x.date_fin >= t; }).length },
          { id:"Historique", ic:"🗂️" },
          { id:"Élèves", ic:"👥" },
          { id:"Factures", ic:"🧾" },
        ] as const).map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding:"11px 15px", fontSize:14, fontWeight:700, cursor:"pointer", background:"none", border:"none",
                borderBottom:`3px solid ${active ? C.navy : "transparent"}`, marginBottom:-2,
                color: active ? C.navy : C.gray400, display:"flex", alignItems:"center", gap:7, whiteSpace:"nowrap" }}>
              <span>{t.ic}</span> {t.id}
              {"badge" in t && t.badge > 0 && (
                <span style={{ background: active ? C.navy : C.gray100, color: active ? "#fff" : C.gray,
                  borderRadius:20, fontSize:11, padding:"1px 8px", fontWeight:800 }}>{t.badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── ÉLÈVES (liste complète) ────────────────────────────────────────── */}
      {tab === "Élèves" && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:14 }}>
            <Btn color="navy" small onClick={openAdd}>+ Ajouter un élève</Btn>
          </div>
          {eleves.length === 0 ? (
            <div style={{ padding:40, textAlign:"center", color:C.gray400,
              background:C.gray50, borderRadius:12 }}>
              Aucun élève enregistré pour cet établissement.
            </div>
          ) : (
            <div style={{ background:C.white, borderRadius:12, border:`1px solid ${C.gray200}`, overflow:"hidden" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr style={{ background:C.gray50 }}>
                    {["Nom","Prénom","Circuit","Type"].map(h => (
                      <th key={h} style={{ padding:"11px 14px", textAlign:"left",
                        fontWeight:700, color:C.gray600, borderBottom:`1px solid ${C.gray200}` }}>
                        {h}
                      </th>
                    ))}
                    <th style={{ padding:"11px 14px", textAlign:"left",
                      fontWeight:700, color:C.gray600, borderBottom:`1px solid ${C.gray200}`,
                      cursor:"help" }}
                      title="Indique si l'élève est inscrit et pris en charge cette année scolaire">
                      Statut
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {eleves.map((e, i) => {
                    const circ = allCircuits.find(c => c.id === e.circuit_id);
                    return (
                      <tr key={e.id} onClick={() => openEdit(e)} title="Ouvrir la fiche"
                        style={{ background: i % 2 === 0 ? C.white : C.gray50, cursor:"pointer" }}>
                        <td style={{ padding:"10px 14px", fontWeight:700, color:C.gray800 }}>
                          {e.nom_famille}
                        </td>
                        <td style={{ padding:"10px 14px", color:C.gray600 }}>{e.prenom_initiale}</td>
                        <td style={{ padding:"10px 14px", color:C.gray600 }}>
                          {circ ? `${circ.emoji} ${circ.nom}` : <span style={{color:C.gray400}}>—</span>}
                        </td>
                        <td style={{ padding:"10px 14px", color:C.gray600 }}>
                          {e.type_transport === "equipe" ? "Équipé" : "Standard"}
                        </td>
                        <td style={{ padding:"10px 14px" }}>
                          <Badge color={e.actif ? "green" : "gray"}>
                            {e.actif ? "Actif" : "En pause"}
                          </Badge>
                          {!e.actif && (e as Eleve & {pause_motif?:string}).pause_motif && (
                            <div style={{ fontSize:11, color:C.gray400, marginTop:3 }}>
                              {(e as Eleve & {pause_motif?:string}).pause_motif}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── CIRCUITS & ÉLÈVES (clic = détail + actions par enfant) ──────────── */}
      {tab === "Circuits & élèves" && (
        <div style={{ marginTop:20 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
            marginBottom:14, gap:12, flexWrap:"wrap" }}>
            <div style={{ fontSize:13, color:C.gray400 }}>Clique un circuit pour voir les enfants et agir sur chacun.</div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <div style={{ display:"flex", border:`1px solid ${C.gray200}`, borderRadius:8, overflow:"hidden" }}>
                {([["cartes","▦"],["liste","☰"]] as const).map(([v,lbl])=>(
                  <button key={v} onClick={()=>setCircView(v)} title={v==="cartes"?"Cartes":"Liste"}
                    style={{ padding:"6px 11px", fontSize:14, fontWeight:700, cursor:"pointer", border:"none",
                      background: circView===v?C.navy:C.white, color: circView===v?"#fff":C.gray }}>{lbl}</button>
                ))}
              </div>
              <div style={{ position:"relative" }}>
                <Btn color={C.navy} small onClick={()=>setShowActions(s=>!s)}>Actions ▾</Btn>
                {showActions && (
                  <>
                    <div onClick={()=>setShowActions(false)} style={{ position:"fixed", inset:0, zIndex:40 }} />
                    <div style={{ position:"absolute", right:0, top:36, width:210, background:C.white, border:`1px solid ${C.gray200}`,
                      borderRadius:12, boxShadow:"0 12px 30px rgba(0,0,0,.16)", zIndex:41, overflow:"hidden" }}>
                      <button onClick={()=>{ setShowActions(false); openAddCircuit(); }}
                        style={{ width:"100%", textAlign:"left", background:C.white, border:"none", padding:"11px 14px", fontSize:13, cursor:"pointer", display:"flex", gap:9, color:C.gray800 }}>
                        <Plus size={15}/> Ajouter un circuit
                      </button>
                      <button onClick={()=>{ setShowActions(false); setShowImport(true); }}
                        style={{ width:"100%", textAlign:"left", background:C.white, border:"none", padding:"11px 14px", fontSize:13, cursor:"pointer", display:"flex", gap:9, color:C.gray800, borderTop:`1px solid ${C.gray100}` }}>
                        📄 Importer un Excel
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {circuits.length === 0 ? (
            <div style={{ padding:40, textAlign:"center", color:C.gray400,
              background:C.gray50, borderRadius:12 }}>
              Aucun circuit pour cet établissement. Cliquez sur « Ajouter un circuit ».
            </div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns: circView==="liste" ? "1fr" : "repeat(auto-fill,minmax(300px,1fr))", gap:14, alignItems:"start" }}>
              {circuits.map(c => {
                const cEleves = eleves.filter(e => e.circuit_id === c.id && e.actif)
                  .sort((a,b)=>(a.heure_ramassage||"~").localeCompare(b.heure_ramassage||"~"));
                const cond = condOf(c);
                const open = openCircuitId === c.id;
                const liste = circView === "liste";
                return (
                  <div key={c.id} className="etab-card" style={{ background:C.white, border:`1px solid ${open?C.navy:C.gray200}`,
                    borderRadius:16, overflow: open ? "visible" : "hidden", gridColumn: (open || liste) ? "1 / -1" : "auto" }}>
                    {/* En-tête / carte cliquable */}
                    <div onClick={()=>{ setOpenCircuitId(open?null:c.id); setMenuFor(null); setApercuFor(null); }}
                      style={{ display:"flex", flexDirection: (liste||open) ? "row" : "column", alignItems: (liste||open) ? "center" : "stretch",
                        gap: (liste||open) ? 13 : 0, padding: liste?"11px 16px":"16px", cursor:"pointer" }}>
                      <div style={{ display:"flex", gap:13, alignItems:"center", flex:1, minWidth:0 }}>
                        <div style={{ width: liste?40:58, height: liste?40:58, borderRadius:14, background:C.white, border:`1px solid ${C.gray100}`,
                          display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, boxShadow:"0 2px 8px rgba(0,0,0,.06)" }}>{circIcon(c, liste?32:48)}</div>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontSize: liste?15:18, fontWeight:900, color:"#0f2540" }}>{c.nom}</div>
                          <div style={{ fontSize:12, color:C.gray400, marginTop:2 }}>{c.id}{c.km_aller?` · ${c.km_aller} km`:""} · {cEleves.length} élèves</div>
                          <div style={{ marginTop:7 }}>
                            {cond
                              ? <span style={{ display:"inline-flex", alignItems:"center", gap:5, background:C.greenL, color:C.greenD, borderRadius:20, padding:"3px 11px", fontSize:11.5, fontWeight:800 }}>● {cond.prenom} {cond.nom}</span>
                              : <span style={{ background:C.amberL, color:C.amber, borderRadius:20, padding:"3px 11px", fontSize:11.5, fontWeight:800 }}>Conducteur non affecté</span>}
                          </div>
                        </div>
                      </div>
                      {(liste||open)
                        ? <ChevronDown size={16} style={{ color:C.gray400, transform:open?"rotate(180deg)":"none", transition:"transform .18s", flexShrink:0 }} />
                        : <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:14 }}>
                            <span style={{ fontSize:12.5, color:C.gray400 }}>{cEleves.length} élève{cEleves.length>1?"s":""} dans la tournée</span>
                            <span style={{ fontSize:12.5, fontWeight:800, color:C.navyL }}>Voir les élèves →</span>
                          </div>}
                    </div>

                    {open && (
                      <div style={{ borderTop:`1px solid ${C.gray100}` }}>
                        {/* Gestion du circuit */}
                        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 18px", background:C.gray50, flexWrap:"wrap" }}>
                          <User size={15} color={C.gray400} />
                          <span style={{ fontSize:13, color:C.gray600, fontWeight:600 }}>Conducteur :</span>
                          <select value={cond?.id ?? ""} onChange={e=>assignConducteur(c.id, e.target.value?Number(e.target.value):"").then(load)}
                            style={{ padding:"7px 10px", borderRadius:8, border:`1px solid ${C.gray200}`, fontSize:13, background:C.white, minWidth:210 }}>
                            <option value="">— Non affecté —</option>
                            {driverOptgroups()}
                          </select>
                          <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
                            <Btn small outline onClick={()=>setApercuFor(c.id)}>👁️ Aperçu conducteur</Btn>
                            <Btn small outline onClick={()=>openEditCircuit(c)}><Pencil size={13}/> Circuit</Btn>
                            <Btn small outline color={C.red} onClick={()=>handleDeleteCircuit(c)}><Trash2 size={13}/></Btn>
                          </div>
                        </div>

                        {/* 👥 Élèves du circuit (roster + gestion par élève) */}
                        <div style={{ padding:"8px 18px", fontSize:11, fontWeight:800, color:C.gray600, background:C.gray50, textTransform:"uppercase", letterSpacing:".4px" }}>👥 Élèves du circuit</div>
                        {cEleves.length===0 ? (
                          <div style={{ padding:"18px", color:C.gray400, fontSize:13 }}>Aucun élève actif sur ce circuit.</div>
                        ) : cEleves.map((e,i)=>{
                          const ex = excToday(e.id);
                          const col = excColor(ex?.type);
                          return (
                            <div key={e.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 18px", borderTop:`1px solid ${C.gray100}` }}>
                              <div style={{ width:24,height:24,borderRadius:"50%",background:"#94A3B8",color:"#fff",fontWeight:800,fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>{i+1}</div>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontWeight:700, fontSize:14, color:C.gray800 }}>
                                  {e.prenom_initiale} {e.nom_famille}
                                  {e.remarques && <span title={e.remarques} style={{ marginLeft:6, cursor:"help" }}>📌</span>}
                                </div>
                                <div style={{ fontSize:12, color:C.gray400, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.adresse||"Adresse non renseignée"}</div>
                                {ex && (
                                  <div style={{ fontSize:11, fontWeight:700, color:col, marginTop:2 }}>
                                    {EXC_LABEL[ex.type]}{ex.date_debut!==ex.date_fin?` · ${fmtJour(ex.date_debut)}–${fmtJour(ex.date_fin)}`:" · aujourd'hui"}
                                    <button onClick={()=>removeExc(ex.id)} style={{ marginLeft:8, background:"none", border:"none", color:C.gray400, cursor:"pointer", fontSize:11, textDecoration:"underline" }}>annuler</button>
                                  </div>
                                )}
                              </div>
                              <div style={{ position:"relative" }}>
                                <button onClick={()=>setMenuFor(menuFor===e.id?null:e.id)}
                                  style={{ width:34,height:30,borderRadius:8,border:`1px solid ${ex?col:C.gray200}`,
                                    background:ex?col+"18":C.white, color:ex?col:C.gray600, cursor:"pointer", fontWeight:900, fontSize:16, lineHeight:1 }}>⋯</button>
                                {menuFor===e.id && (
                                  <>
                                    <div onClick={()=>setMenuFor(null)} style={{ position:"fixed", inset:0, zIndex:40 }} />
                                    <div style={{ position:"absolute", right:0, top:34, width:236, background:C.white, border:`1px solid ${C.gray200}`,
                                      borderRadius:12, boxShadow:"0 12px 30px rgba(0,0,0,.16)", zIndex:41, overflow:"hidden" }}>
                                      {[
                                        {ic:"📇", t:"Voir / éditer la fiche",     fn:()=>{ setMenuFor(null); openEdit(e); }},
                                        {ic:"✗",  t:"Absent aujourd'hui",        fn:()=>quickExc(e,"absent")},
                                        {ic:"🚗", t:"Ramené par les parents",     fn:()=>quickExc(e,"parent")},
                                        {ic:"📅", t:"Absence sur une période…",   fn:()=>openExc(e,"absent")},
                                        {ic:"🔀", t:"Changer de circuit…",        fn:()=>openExc(e,"changement_circuit")},
                                        {ic:"⏸️", t:e.actif?"Mettre en pause":"Réactiver", fn:()=>handlePause(e)},
                                      ].map(m=>(
                                        <button key={m.t} onClick={m.fn}
                                          style={{ width:"100%", textAlign:"left", background:C.white, border:"none", padding:"11px 14px",
                                            fontSize:13, cursor:"pointer", display:"flex", gap:9, color:C.gray800 }}>
                                          <span style={{ width:18, textAlign:"center" }}>{m.ic}</span>{m.t}
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {/* 📅 Planning par jour (matin + après-midi ; change selon le jour) */}
                        {(() => {
                          const jour = planDay || todayJour;
                          const mat = stopsOf(c.id, "matin", jour);
                          const aps = stopsOf(c.id, "aprem", jour);
                          const JOURS: [string, number][] = [["Lun", 1], ["Mar", 2], ["Mer", 3], ["Jeu", 4], ["Ven", 5]];
                          const line = (h: HebdoStop, idx: number, bg: string) => (
                            <div key={h.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"9px 18px", borderTop:`1px solid ${C.gray100}` }}>
                              <div style={{ width:24,height:24,borderRadius:7,background:bg,color:"#fff",fontWeight:800,fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>{idx+1}</div>
                              <div style={{ minWidth:50, fontSize:13, fontWeight:800, color:C.navy }}>{h.heure}</div>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontWeight:700, fontSize:13.5, color:C.gray800 }}>{h.eleve_nom}</div>
                                {h.adresse && <div style={{ fontSize:12, color:C.gray400, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{h.adresse}</div>}
                              </div>
                            </div>
                          );
                          return (
                            <div>
                              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", padding:"10px 18px", background:"#EEF4FB", borderTop:`1px solid ${C.gray100}` }}>
                                <span style={{ fontSize:11, fontWeight:800, color:C.navy, textTransform:"uppercase", letterSpacing:".4px" }}>📅 Planning du</span>
                                {JOURS.map(([lbl,d])=>(
                                  <button key={d} onClick={()=>setPlanDay(d)}
                                    style={{ padding:"4px 11px", borderRadius:20, cursor:"pointer", fontWeight:800, fontSize:11.5,
                                      border:`1.5px solid ${jour===d?C.navy:C.gray200}`, background:jour===d?C.navy:"#fff", color:jour===d?"#fff":C.gray600 }}>
                                    {lbl}{d===todayJour?" ·":""}
                                  </button>
                                ))}
                              </div>
                              {mat.length===0 && aps.length===0 ? (
                                <div style={{ padding:"12px 18px", color:C.gray400, fontSize:13 }}>Aucun planning importé pour ce jour.</div>
                              ) : (<>
                                {mat.length>0 && <div style={{ padding:"7px 18px", fontSize:11, fontWeight:800, color:C.gray600, background:C.gray50, textTransform:"uppercase", letterSpacing:".4px" }}>☀️ Matin — ramassage</div>}
                                {mat.map((h,idx)=>line(h,idx,C.navy))}
                                {aps.length>0 && <div style={{ padding:"7px 18px", fontSize:11, fontWeight:800, color:C.gray600, background:C.gray50, textTransform:"uppercase", letterSpacing:".4px" }}>🌙 Après-midi — dépose</div>}
                                {aps.map((h,idx)=>line(h,idx,"#6366F1"))}
                              </>)}
                            </div>
                          );
                        })()}
                        <div style={{ padding:"12px 18px" }}>
                          <Btn small outline onClick={()=>{ setEditEleve(null); setEleveForm({...EMPTY_EF, circuit_id:c.id}); setElErr(""); setEleveAdresses([]); setShowAddrAdd(false); setAddrForm(EMPTY_ADDR); setShowModal(true); }}>
                            + Ajouter un élève à {c.nom}
                          </Btn>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── SUIVI DU JOUR (accordéon par circuit) ──────────────────────────── */}
      {tab === "Suivi du jour" && (
        <div style={{ marginTop:20 }}>
          {/* 🔔 Notifications envoyées aux parents — automatique, en direct */}
          <div style={{ background:C.white, border:`1px solid ${C.gray200}`, borderRadius:12, marginBottom:16, overflow:"hidden" }}>
            <div style={{ display:"flex", alignItems:"center", gap:11, padding:"13px 16px",
              borderBottom: notifsParents.length ? `1px solid ${C.gray100}` : "none" }}>
              <div style={{ width:36, height:36, borderRadius:10, background:"#EFF6FF", display:"flex",
                alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:18 }}>🔔</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:800, color:C.navy, fontSize:14 }}>Notifications envoyées aux parents</div>
                <div style={{ fontSize:12, color:C.gray400 }}>Automatique — à la prise en charge et à la dépose de chaque enfant</div>
              </div>
              <span style={{ background:"#EFF6FF", color:"#2563EB", borderRadius:20, padding:"4px 11px",
                fontSize:12, fontWeight:800, flexShrink:0 }}>{notifsParents.length}</span>
            </div>
            {notifsParents.length === 0 ? (
              <div style={{ padding:16, fontSize:13, color:C.gray400 }}>
                Aucune notification pour l&apos;instant aujourd&apos;hui — elles apparaissent ici en direct au fil de la tournée.
              </div>
            ) : (
              <div style={{ maxHeight:320, overflowY:"auto" }}>
                {notifsParents.map(n => {
                  const isEcole = n.type === "arrivee_ecole";
                  const h = new Date(n.created_at).toLocaleTimeString("fr-CH", { hour:"2-digit", minute:"2-digit" });
                  return (
                    <div key={n.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 16px", borderTop:`1px solid ${C.gray100}` }}>
                      <div style={{ minWidth:42, fontSize:13, fontWeight:800, color:C.navy }}>{h}</div>
                      <div style={{ width:30, height:30, borderRadius:9, flexShrink:0, display:"flex", alignItems:"center",
                        justifyContent:"center", fontSize:15, background: isEcole ? "#EFF6FF" : "#DCFCE7" }}>{isEcole ? "🏫" : "🏠"}</div>
                      <div style={{ flex:1, minWidth:0, fontSize:13.5, color:C.gray800 }}>{n.message}</div>
                      <span style={{ background:"#F1F5F9", color:C.gray600, borderRadius:20, padding:"3px 9px",
                        fontSize:11, fontWeight:800, flexShrink:0, whiteSpace:"nowrap" }}>✓ Envoyée</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ fontSize:14, fontWeight:800, color:C.navy, marginBottom:14 }}>
            En direct — {fmtJour(isoToday())} · clique un circuit pour le détail
          </div>
          {circuits.length === 0 ? (
            <div style={{ padding:40, textAlign:"center", color:C.gray400, background:C.gray50, borderRadius:12 }}>
              Aucun circuit.
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {circuits.map(c => {
                const cEleves = eleves.filter(e => e.circuit_id === c.id && e.actif);
                const eids = new Set(cEleves.map(e => e.id));
                const cPrises = prisesEcole.filter(p => eids.has(p.eleve_id));
                const dep   = cPrises.filter(p => p.statut === "present").length;
                const absPr = cPrises.filter(p => p.statut === "absent").length;
                const excCnt = cEleves.filter(e => { const x = excToday(e.id); return x && (x.type === "absent" || x.type === "parent"); }).length;
                const rest  = Math.max(0, cEleves.length - dep - absPr - excCnt);
                const cond = condOf(c);
                const acc = openAcc[c.id];
                const pill = (bg:string,fg:string,txt:string)=>(
                  <span style={{ background:bg, color:fg, borderRadius:20, padding:"4px 10px", fontSize:12, fontWeight:800 }}>{txt}</span>
                );
                return (
                  <div key={c.id} style={{ background:C.white, border:`1px solid ${C.gray200}`, borderRadius:12, overflow:"hidden" }}>
                    <div onClick={()=>setOpenAcc(p=>({...p,[c.id]:!p[c.id]}))} style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 16px", cursor:"pointer" }}>
                      <div style={{ width:40,height:40,borderRadius:10,background:C.white,border:`1px solid ${C.gray100}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>{circIcon(c,32)}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:800, color:C.gray800, fontSize:15 }}>{c.nom}</div>
                        <div style={{ fontSize:12, color:C.gray400 }}>{cond?`👤 ${cond.prenom} ${cond.nom}`:"non affecté"} · {cEleves.length} élèves</div>
                      </div>
                      <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                        {pill("#DCFCE7","#15803D",`${dep} déposés`)}
                        {(absPr+excCnt)>0 && pill("#FDECEC","#E02424",`${absPr+excCnt} absents`)}
                        {pill("#EFF6FF","#2563EB",`${rest} restants`)}
                        <ChevronDown size={15} style={{ color:C.gray400, transform:acc?"rotate(180deg)":"none", transition:"transform .18s" }} />
                      </div>
                    </div>
                    {acc && (() => {
                      const secHead = { padding:"7px 16px", fontSize:11, fontWeight:800, color:C.gray600, background:C.gray50, textTransform:"uppercase" as const, letterSpacing:".4px" };
                      const aps = stopsOf(c.id, "aprem");
                      return (
                      <div style={{ borderTop:`1px solid ${C.gray100}` }}>
                        {/* ☀️ Matin — ramassage */}
                        <div style={secHead}>☀️ Matin — ramassage</div>
                        {cEleves.length===0 ? <div style={{padding:16,color:C.gray400,fontSize:13}}>Aucun élève.</div> :
                          cEleves.slice().sort((a,b)=>(a.heure_ramassage||"~").localeCompare(b.heure_ramassage||"~")).map(e=>{
                            const pr = cPrises.find(p=>p.eleve_id===e.id && p.sens==="aller");
                            const ex = excToday(e.id);
                            let label = "En attente"; let bg: string = "#F1F5F9"; let fg: string = C.gray;
                            if (pr?.statut==="present"){label="Pris";bg="#DCFCE7";fg="#15803D";}
                            else if (pr?.statut==="absent"){label="Absent";bg="#FDECEC";fg="#E02424";}
                            else if (ex?.type==="absent"){label="Absent (prévu)";bg="#FDECEC";fg="#E02424";}
                            else if (ex?.type==="parent"){label="Ramené parents";bg="#FEF3C7";fg="#D97706";}
                            else if (ex?.type==="changement_circuit"){label="Autre circuit";bg="#EDE9FE";fg="#7C3AED";}
                            return (
                              <div key={"m"+e.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 16px", borderTop:`1px solid ${C.gray100}` }}>
                                <span style={{ fontSize:13.5, color:C.gray800 }}><b style={{color:C.navy}}>{e.heure_ramassage||"—"}</b> &nbsp; {e.prenom_initiale} {e.nom_famille}</span>
                                <span style={{ background:bg, color:fg, borderRadius:20, padding:"3px 10px", fontSize:12, fontWeight:800 }}>{label}</span>
                              </div>
                            );
                          })}
                        {/* 🌙 Après-midi — dépose */}
                        {aps.length>0 && <div style={secHead}>🌙 Après-midi — dépose</div>}
                        {aps.map(h=>{
                          const pr = cPrises.find(p=>p.eleve_id===h.eleve_id && p.sens==="retour");
                          const ex = h.eleve_id!=null ? excToday(h.eleve_id) : undefined;
                          let label = "En attente"; let bg: string = "#F1F5F9"; let fg: string = C.gray;
                          if (pr?.statut==="present"){label="Déposé";bg="#DCFCE7";fg="#15803D";}
                          else if (pr?.statut==="absent"){label="Absent";bg="#FDECEC";fg="#E02424";}
                          else if (ex?.type==="absent"){label="Absent (prévu)";bg="#FDECEC";fg="#E02424";}
                          else if (ex?.type==="parent"){label="Ramené parents";bg="#FEF3C7";fg="#D97706";}
                          else if (ex?.type==="changement_circuit"){label="Autre circuit";bg="#EDE9FE";fg="#7C3AED";}
                          return (
                            <div key={"a"+h.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 16px", borderTop:`1px solid ${C.gray100}` }}>
                              <span style={{ fontSize:13.5, color:C.gray800 }}><b style={{color:"#6366F1"}}>{h.heure}</b> &nbsp; {h.eleve_nom}</span>
                              <span style={{ background:bg, color:fg, borderRadius:20, padding:"3px 10px", fontSize:12, fontWeight:800 }}>{label}</span>
                            </div>
                          );
                        })}
                      </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── PLANNING & ABSENCES (calendrier + infos à droite) ──────────────── */}
      {tab === "Planning & absences" && (() => {
        const { y, m } = calRef;
        const startCol = (new Date(y, m, 1).getDay() + 6) % 7;        // Lundi = 0
        const dim = new Date(y, m + 1, 0).getDate();
        const dISO = (d:number) => `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
        const excBg = (t:ExcType) => t==="absent"?"#FDECEC":t==="parent"?"#FEF3C7":"#EDE9FE";
        const circOf = (eleveId:number) => eleves.find(el => el.id === eleveId)?.circuit_id;
        const planExcs = planCircuit === "all" ? exceptions : exceptions.filter(x => circOf(x.eleve_id) === planCircuit);
        return (
          <div style={{ marginTop:20 }}>
            <div style={{ background:"#EFF6FF", border:"1px solid #cfe0fb", borderRadius:12, padding:"12px 16px", fontSize:13, color:"#0f2f66", lineHeight:1.5, marginBottom:16 }}>
              Ce qui est planifié ici s'applique <b>automatiquement à la tournée du conducteur</b> aux bonnes dates — visible par le responsable de secteur, le conducteur et le parent.
            </div>
            {/* Filtre par circuit : sinon toutes les exceptions se chevauchent */}
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, flexWrap:"wrap" }}>
              <span style={{ fontSize:13, fontWeight:800, color:C.gray600 }}>Circuit :</span>
              <select value={planCircuit} onChange={e=>setPlanCircuit(e.target.value)}
                style={{ padding:"8px 12px", borderRadius:8, border:`1px solid ${C.gray200}`, fontSize:13, background:C.white, minWidth:220 }}>
                <option value="all">Tous les circuits ({exceptions.length})</option>
                {circuits.map(c => {
                  const n = exceptions.filter(x => circOf(x.eleve_id) === c.id).length;
                  return <option key={c.id} value={c.id}>{c.nom} ({n})</option>;
                })}
              </select>
            </div>
            <div className="plan-grid">
              {/* Calendrier */}
              <div style={{ background:C.white, border:`1px solid ${C.gray200}`, borderRadius:14, padding:18 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                  <button onClick={()=>shiftMonth(-1)} style={{ background:C.gray50, border:`1px solid ${C.gray200}`, borderRadius:8, width:30, height:30, cursor:"pointer", fontWeight:900, color:C.gray }}>‹</button>
                  <div style={{ fontSize:15, fontWeight:900, color:"#0f2540" }}>{MOIS_NOMS[m+1]} {y}</div>
                  <button onClick={()=>shiftMonth(1)} style={{ background:C.gray50, border:`1px solid ${C.gray200}`, borderRadius:8, width:30, height:30, cursor:"pointer", fontWeight:900, color:C.gray }}>›</button>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:6, marginBottom:6 }}>
                  {["L","M","M","J","V","S","D"].map((d,i)=>(<div key={i} style={{ textAlign:"center", fontSize:11, fontWeight:800, color:C.gray400 }}>{d}</div>))}
                </div>
                <div className="cal-days">
                  {Array.from({length:startCol}).map((_,i)=><div key={"e"+i} className="cal-cell" style={{ background:C.gray50 }} />)}
                  {Array.from({length:dim}).map((_,i)=>{
                    const day=i+1; const iso=dISO(day);
                    const evts = planExcs.filter(x=>x.date_debut<=iso && x.date_fin>=iso);
                    return (
                      <div key={day} className="cal-cell">
                        <div style={{ fontSize:11, fontWeight:800, color:C.gray400 }}>{day}</div>
                        {evts.slice(0,3).map(x=>{ const e=eleves.find(el=>el.id===x.eleve_id); return (
                          <div key={x.id} title={e?`${e.prenom_initiale} ${e.nom_famille}`:""}
                            style={{ marginTop:3, borderRadius:6, padding:"2px 5px", fontSize:10, fontWeight:800, lineHeight:1.25,
                              background:excBg(x.type), color:excColor(x.type), overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            {e?e.prenom_initiale:"?"}
                          </div>
                        );})}
                        {evts.length>3 && <div style={{ fontSize:10, color:C.gray400, marginTop:2 }}>+{evts.length-3}</div>}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display:"flex", gap:14, flexWrap:"wrap", marginTop:12, fontSize:11.5, color:C.gray }}>
                  <span style={{ display:"flex", alignItems:"center", gap:5 }}><span style={{ width:10,height:10,borderRadius:3,background:"#E02424",display:"inline-block" }} /> Absent</span>
                  <span style={{ display:"flex", alignItems:"center", gap:5 }}><span style={{ width:10,height:10,borderRadius:3,background:"#D97706",display:"inline-block" }} /> Ramené parents</span>
                  <span style={{ display:"flex", alignItems:"center", gap:5 }}><span style={{ width:10,height:10,borderRadius:3,background:"#7C3AED",display:"inline-block" }} /> Circuit temporaire</span>
                </div>
              </div>

              {/* Infos à droite : exceptions en cours / à venir */}
              <div>
                <div style={{ fontSize:15, fontWeight:900, color:"#0f2540", marginBottom:12 }}>Exceptions en cours &amp; à venir</div>
                {planExcs.length === 0 ? (
                  <div style={{ padding:26, textAlign:"center", color:C.gray400, background:C.gray50, borderRadius:12, fontSize:13 }}>
                    {planCircuit === "all"
                      ? <>Aucune exception. Ajoute-les depuis un élève (Circuits &amp; élèves → « ⋯ »).</>
                      : <>Aucune exception pour ce circuit.</>}
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {planExcs.map(x=>{
                      const e = eleves.find(el=>el.id===x.eleve_id);
                      const col = excColor(x.type);
                      const cible = x.circuit_cible_id ? allCircuits.find(c=>c.id===x.circuit_cible_id) : null;
                      return (
                        <div key={x.id} style={{ display:"flex", alignItems:"center", gap:12, background:C.white, border:`1px solid ${C.gray200}`, borderRadius:12, padding:"12px 14px" }}>
                          <div style={{ width:5, alignSelf:"stretch", borderRadius:6, background:col }} />
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontWeight:800, fontSize:14, color:C.gray800 }}>
                              {e ? `${e.prenom_initiale} ${e.nom_famille}` : `Élève #${x.eleve_id}`}
                              <span style={{ color:col, marginLeft:8, fontWeight:800 }}>· {EXC_LABEL[x.type]}</span>
                            </div>
                            <div style={{ fontSize:12.5, color:C.gray }}>
                              du {fmtJour(x.date_debut)} au {fmtJour(x.date_fin)}
                              {cible ? ` · vers ${cible.emoji} ${cible.nom}${x.definitif?" (définitif)":""}` : ""}
                              {x.justification ? ` · ${x.justification}` : ""}
                            </div>
                          </div>
                          <Btn small outline color={C.red} onClick={()=>removeExc(x.id)}>Clôturer</Btn>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── TAB 3 : FACTURES ───────────────────────────────────────────────── */}
      {tab === "Historique" && <HistoriqueEtab circuits={circuits.map(c => { const d = condOf(c); return { id: c.id, nom: c.nom, emoji: c.emoji, conducteur: d ? `${d.prenom} ${d.nom}` : "" }; })} />}

      {tab === "Factures" && (
        <div style={{ marginTop:20 }}>
          <div style={{ background:C.white, border:`1px solid ${C.gray200}`,
            borderRadius:14, padding:"24px 26px", maxWidth:480 }}>
            <div style={{ fontWeight:800, fontSize:16, color:C.gray800, marginBottom:18 }}>
              Générer une facture DGEO
            </div>

            <div style={{ display:"flex", gap:12, marginBottom:18, flexWrap:"wrap" }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:13, color:C.gray600, fontWeight:600,
                  display:"block", marginBottom:4 }}>Mois</label>
                <div style={{ position:"relative" }}>
                  <select value={facMois} onChange={e => setFacMois(Number(e.target.value))}
                    style={{ width:"100%", padding:"9px 32px 9px 12px", border:`1px solid ${C.gray200}`,
                      borderRadius:8, fontSize:14, appearance:"none", background:C.white, cursor:"pointer" }}>
                    {MOIS_NOMS.slice(1).map((m,i) => (
                      <option key={i+1} value={i+1}>{m}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} style={{ position:"absolute", right:10, top:"50%",
                    transform:"translateY(-50%)", pointerEvents:"none", color:C.gray400 }} />
                </div>
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:13, color:C.gray600, fontWeight:600,
                  display:"block", marginBottom:4 }}>Année</label>
                <div style={{ position:"relative" }}>
                  <select value={facAnnee} onChange={e => setFacAnnee(Number(e.target.value))}
                    style={{ width:"100%", padding:"9px 32px 9px 12px", border:`1px solid ${C.gray200}`,
                      borderRadius:8, fontSize:14, appearance:"none", background:C.white, cursor:"pointer" }}>
                    {[2024,2025,2026,2027].map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <ChevronDown size={14} style={{ position:"absolute", right:10, top:"50%",
                    transform:"translateY(-50%)", pointerEvents:"none", color:C.gray400 }} />
                </div>
              </div>
            </div>

            <div style={{ marginBottom:18 }}>
              <label style={{ fontSize:13, color:C.gray600, fontWeight:600,
                display:"block", marginBottom:4 }}>N° de facture *</label>
              <input
                value={numFacture}
                onChange={e => setNumFacture(e.target.value)}
                placeholder={`${facAnnee}-${String(facMois).padStart(2,"0")}-${ecole.nom.toUpperCase().replace(/\s+/g,"_")}`}
                style={{ width:"100%", padding:"9px 12px", border:`1px solid ${C.gray200}`,
                  borderRadius:8, fontSize:14, boxSizing:"border-box", fontFamily:"monospace" }}
              />
              <div style={{ fontSize:11, color:C.gray400, marginTop:4 }}>
                Format recommandé : AAAA-MM-NOM_ECOLE — ex : 2026-06-MERINE
              </div>
            </div>

            <div style={{ background:C.gray50, borderRadius:8, padding:"12px 14px",
              fontSize:13, color:C.gray600, marginBottom:18 }}>
              <div><strong>Période :</strong> {MOIS_NOMS[facMois]} {facAnnee}</div>
              <div style={{ marginTop:4 }}>
                <strong>Élèves actifs :</strong> {elevesActifs.length}
              </div>
              <div style={{ marginTop:4 }}>
                <strong>Tournées configurées :</strong> {tournees.filter(t=>t.actif).length}
              </div>
            </div>

            {tournees.filter(t=>t.actif).length === 0 && (
              <div style={{ background:C.amberL, borderRadius:8, padding:"10px 14px",
                fontSize:13, color:C.amber, marginBottom:14 }}>
                Aucune tournée configurée — les prix/km et prix/heure sont définis dans les tournées.
              </div>
            )}
            {tournees.filter(t=>t.actif && (t.prix_km === 0 || t.prix_heure === 0)).length > 0 && (
              <div style={{ background:C.amberL, borderRadius:8, padding:"10px 14px",
                fontSize:13, color:C.amber, marginBottom:14 }}>
                Certaines tournées ont un prix/km ou prix/heure à 0. Vérifier la configuration des tournées.
              </div>
            )}

            <Btn color="navy" full
              disabled={genLoading || !numFacture.trim()}
              onClick={handleGenererFacture}>
              {genLoading ? "Génération en cours…" : "Télécharger la facture DGEO (.xlsx)"}
            </Btn>
            {!numFacture.trim() && (
              <div style={{ fontSize:12, color:C.amber, marginTop:8, textAlign:"center" }}>
                Saisir le numéro de facture avant de générer
              </div>
            )}
            <div style={{ fontSize:11, color:C.gray400, marginTop:10, textAlign:"center" }}>
              Format DGEO — onglet unique avec en-têtes colorés
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ÉLÈVE ──────────────────────────────────────────────────────── */}
      {showModal && (
        <Modal title={editEleve ? "Modifier l'élève" : "Ajouter un élève"}
          onClose={() => setShowModal(false)}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {[
              { key:"nom_famille",     label:"Nom de famille *", ph:"Ex : Dupont" },
              { key:"prenom_initiale", label:"Prénom",           ph:"Ex : Léa" },
              { key:"adresse",         label:"Adresse",          ph:"Rue, NPA, ville" },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize:13, color:C.gray600, fontWeight:600,
                  display:"block", marginBottom:4 }}>{f.label}</label>
                <input
                  value={(eleveForm as unknown as Record<string,string>)[f.key]}
                  onChange={ev => setEleveForm(prev => ({ ...prev, [f.key]: ev.target.value }))}
                  placeholder={f.ph}
                  style={{ width:"100%", padding:"9px 12px", border:`1px solid ${C.gray200}`,
                    borderRadius:8, fontSize:14, boxSizing:"border-box" }}
                />
              </div>
            ))}

            <div>
              <label style={{ fontSize:13, color:C.gray600, fontWeight:600,
                display:"block", marginBottom:4 }}>Circuit</label>
              <div style={{ position:"relative" }}>
                <select value={eleveForm.circuit_id}
                  onChange={e => setEleveForm(prev => ({ ...prev, circuit_id: e.target.value }))}
                  style={{ width:"100%", padding:"9px 32px 9px 12px", border:`1px solid ${C.gray200}`,
                    borderRadius:8, fontSize:14, appearance:"none", background:C.white, boxSizing:"border-box" }}>
                  <option value="">— Aucun circuit —</option>
                  {allCircuits.map(c => (
                    <option key={c.id} value={c.id}>{c.emoji} {c.nom}</option>
                  ))}
                </select>
                <ChevronDown size={14} style={{ position:"absolute", right:10, top:"50%",
                  transform:"translateY(-50%)", pointerEvents:"none", color:C.gray400 }} />
              </div>
            </div>

            <div>
              <label style={{ fontSize:13, color:C.gray600, fontWeight:600,
                display:"block", marginBottom:4 }}>Type de transport</label>
              <div style={{ display:"flex", gap:10 }}>
                {TYPE_OPTS.map(o => (
                  <button key={o.value}
                    onClick={() => setEleveForm(prev => ({ ...prev, type_transport: o.value }))}
                    style={{ flex:1, padding:"9px 12px", borderRadius:8, fontSize:13,
                      fontWeight: eleveForm.type_transport === o.value ? 800 : 600,
                      background: eleveForm.type_transport === o.value ? C.navy : C.white,
                      color: eleveForm.type_transport === o.value ? C.white : C.gray600,
                      border: `1px solid ${eleveForm.type_transport === o.value ? C.navy : C.gray200}`,
                      cursor:"pointer" }}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Contacts parents */}
            <div style={{ borderTop:`1px solid ${C.gray200}`, paddingTop:14 }}>
              <div style={{ fontWeight:700, fontSize:13, color:C.gray800, marginBottom:10 }}>Contacts parents</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                {[
                  { key:"nom_mere", label:"Mère — nom", ph:"Prénom Nom" },
                  { key:"tel_mere", label:"Mère — téléphone", ph:"079 000 00 00" },
                  { key:"nom_pere", label:"Père — nom", ph:"Prénom Nom" },
                  { key:"tel_pere", label:"Père — téléphone", ph:"079 000 00 00" },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize:12.5, color:C.gray600, fontWeight:600, display:"block", marginBottom:4 }}>{f.label}</label>
                    <input value={(eleveForm as unknown as Record<string,string>)[f.key]}
                      onChange={ev => setEleveForm(prev => ({ ...prev, [f.key]: ev.target.value }))}
                      placeholder={f.ph}
                      style={{ width:"100%", padding:"9px 12px", border:`1px solid ${C.gray200}`, borderRadius:8, fontSize:14, boxSizing:"border-box" }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Remarques */}
            <div>
              <label style={{ fontSize:13, color:C.gray600, fontWeight:600, display:"block", marginBottom:4 }}>
                Remarques (médical, comportement, informations partagées…)
              </label>
              <textarea value={eleveForm.remarques}
                onChange={e => setEleveForm(prev => ({ ...prev, remarques: e.target.value }))}
                rows={3} placeholder="Ex : allergie, PAI, consignes particulières…"
                style={{ width:"100%", padding:"9px 12px", border:`1px solid ${C.gray200}`, borderRadius:8, fontSize:14, boxSizing:"border-box", fontFamily:"inherit", resize:"vertical" }} />
            </div>

            {editEleve && (
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <input type="checkbox" id="actif" checked={eleveForm.actif}
                  onChange={e => setEleveForm(prev => ({ ...prev, actif: e.target.checked }))} />
                <label htmlFor="actif"
                  title="Indique si l'élève est inscrit et pris en charge cette année scolaire"
                  style={{ fontSize:14, color:C.gray600, cursor:"help" }}>
                  Inscrit cette année scolaire
                </label>
              </div>
            )}

            {editEleve && (
              <div style={{ borderTop:`1px solid ${C.gray200}`, paddingTop:14, marginTop:4 }}>
                <div style={{ fontWeight:700, fontSize:13, color:C.gray800, marginBottom:10 }}>
                  Adresses spécifiques par jour
                </div>
                <div style={{ fontSize:12, color:C.gray400, marginBottom:10 }}>
                  Définissez des adresses de prise en charge selon le jour de la semaine (ex : chez la mère le lundi, chez le père le mercredi).
                </div>

                {eleveAdresses.length > 0 && (
                  <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:12 }}>
                    {eleveAdresses.map(a => (
                      <div key={a.id} style={{ background:C.gray50, borderRadius:8,
                        padding:"10px 12px", display:"flex", alignItems:"flex-start",
                        justifyContent:"space-between", gap:10 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:12, fontWeight:700, color:C.navy,
                            textTransform:"capitalize" }}>{a.type}</div>
                          {a.nom_contact && (
                            <div style={{ fontSize:12, color:C.gray600 }}>{a.nom_contact}</div>
                          )}
                          <div style={{ fontSize:12, color:C.gray800 }}>{a.adresse}</div>
                          {a.jours_application?.length > 0 && (
                            <div style={{ fontSize:11, color:C.gray400, marginTop:3 }}>
                              {a.jours_application.join(", ")}
                            </div>
                          )}
                        </div>
                        <button onClick={() => handleDeleteAdresse(a.id)}
                          style={{ fontSize:11, color:C.red, background:"none", border:"none",
                            cursor:"pointer", padding:"2px 6px", flexShrink:0, fontWeight:600 }}>
                          Supprimer
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {!showAddrAdd ? (
                  <button onClick={() => setShowAddrAdd(true)}
                    style={{ fontSize:12, color:C.navyL, background:C.skyL, border:"none",
                      borderRadius:7, padding:"6px 12px", cursor:"pointer", fontWeight:600 }}>
                    + Ajouter une adresse
                  </button>
                ) : (
                  <div style={{ background:C.skyL, borderRadius:10, padding:"12px 14px" }}>
                    <div style={{ fontSize:12, fontWeight:700, color:C.navy, marginBottom:10 }}>
                      Nouvelle adresse
                    </div>
                    <div style={{ display:"flex", gap:10, marginBottom:8, flexWrap:"wrap" }}>
                      <div style={{ flex:1, minWidth:120 }}>
                        <label style={{ fontSize:11, fontWeight:600, color:C.gray600,
                          display:"block", marginBottom:3 }}>Relation</label>
                        <select value={addrForm.type}
                          onChange={e => setAddrForm(p => ({ ...p, type: e.target.value as AdresseEleve["type"] }))}
                          style={{ width:"100%", padding:"7px 10px", border:`1px solid ${C.gray200}`,
                            borderRadius:7, fontSize:13, background:C.white }}>
                          {(["père","mère","grand-parent","autre"] as AdresseEleve["type"][]).map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ flex:1, minWidth:120 }}>
                        <label style={{ fontSize:11, fontWeight:600, color:C.gray600,
                          display:"block", marginBottom:3 }}>Nom contact</label>
                        <input value={addrForm.nom_contact}
                          onChange={e => setAddrForm(p => ({ ...p, nom_contact: e.target.value }))}
                          placeholder="Ex : Marie Dupont"
                          style={{ width:"100%", padding:"7px 10px", border:`1px solid ${C.gray200}`,
                            borderRadius:7, fontSize:13, boxSizing:"border-box" }} />
                      </div>
                    </div>
                    <div style={{ marginBottom:8 }}>
                      <label style={{ fontSize:11, fontWeight:600, color:C.gray600,
                        display:"block", marginBottom:3 }}>Adresse *</label>
                      <input value={addrForm.adresse}
                        onChange={e => setAddrForm(p => ({ ...p, adresse: e.target.value }))}
                        placeholder="Rue, NPA, ville"
                        style={{ width:"100%", padding:"7px 10px", border:`1px solid ${C.gray200}`,
                          borderRadius:7, fontSize:13, boxSizing:"border-box" }} />
                    </div>
                    <div style={{ marginBottom:10 }}>
                      <label style={{ fontSize:11, fontWeight:600, color:C.gray600,
                        display:"block", marginBottom:5 }}>Jours applicables</label>
                      <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                        {["lundi","mardi","mercredi","jeudi","vendredi"].map(j => (
                          <label key={j} style={{ display:"flex", alignItems:"center",
                            gap:4, fontSize:12, cursor:"pointer" }}>
                            <input type="checkbox" checked={addrForm.jours.includes(j)}
                              onChange={e => setAddrForm(p => ({
                                ...p,
                                jours: e.target.checked ? [...p.jours, j] : p.jours.filter(d => d !== j),
                              }))} />
                            {j}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={handleAddAdresse}
                        disabled={addrSaving || !addrForm.adresse.trim()}
                        style={{ padding:"7px 16px", borderRadius:8, border:"none",
                          background: addrForm.adresse.trim() ? C.navy : C.gray200,
                          color:C.white, fontWeight:700, fontSize:12,
                          cursor: addrForm.adresse.trim() ? "pointer" : "not-allowed" }}>
                        {addrSaving ? "…" : "Ajouter"}
                      </button>
                      <button onClick={() => setShowAddrAdd(false)}
                        style={{ padding:"7px 14px", borderRadius:8,
                          border:`1px solid ${C.gray200}`, background:C.white,
                          color:C.gray600, fontWeight:600, fontSize:12, cursor:"pointer" }}>
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {elErr && (
              <div style={{ background:C.redL, color:C.red, borderRadius:8,
                padding:"10px 14px", fontSize:13 }}>{elErr}</div>
            )}

            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:4 }}>
              <Btn outline onClick={() => setShowModal(false)}>Annuler</Btn>
              <Btn color="navy" disabled={savingEl} onClick={handleSaveEleve}>
                {savingEl ? "Enregistrement…" : editEleve ? "Mettre à jour" : "Ajouter"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── MODAL ÉDITION ÉCOLE ──────────────────────────────────────────────── */}
      {showEdit && (
        <Modal title="Modifier l'établissement" onClose={() => setShowEdit(false)}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {[
              { key:"nom",                        label:"Nom *",                     ph:"Ex : Mérine" },
              { key:"adresse",                    label:"Adresse",                   ph:"Rue, NPA, ville" },
              { key:"nom_responsable_facturation",label:"Responsable facturation",   ph:"Prénom Nom" },
              { key:"email",                      label:"Email",                     ph:"facturation@ecole.ch" },
              { key:"telephone",                  label:"Téléphone",                 ph:"+41 XX XXX XX XX" },
              { key:"numero_tva",                 label:"N° TVA",                    ph:"CHE-XXX.XXX.XXX TVA" },
              { key:"iban",                       label:"IBAN",                      ph:"CH XX XXXX …" },
              { key:"lot",                        label:"Lot (contrat)",             ph:"Ex : A" },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize:13, color:C.gray600, fontWeight:600,
                  display:"block", marginBottom:4 }}>{f.label}</label>
                <input
                  value={((editForm as Record<string,string>)[f.key]) ?? ""}
                  onChange={ev => setEditForm(prev => ({ ...prev, [f.key]: ev.target.value }))}
                  placeholder={f.ph}
                  style={{ width:"100%", padding:"9px 12px", border:`1px solid ${C.gray200}`,
                    borderRadius:8, fontSize:14, boxSizing:"border-box" }}
                />
              </div>
            ))}
            {/* Secteur — détermine quel responsable de secteur gère cet établissement */}
            <div>
              <label style={{ fontSize:13, color:C.gray600, fontWeight:600,
                display:"block", marginBottom:4 }}>Secteur</label>
              <select
                value={editForm.secteur ?? ""}
                onChange={ev => setEditForm(prev => ({ ...prev, secteur: ev.target.value }))}
                style={{ width:"100%", padding:"9px 12px", border:`1px solid ${C.gray200}`,
                  borderRadius:8, fontSize:14, boxSizing:"border-box", background:C.white }}>
                <option value="">— Aucun secteur —</option>
                {Array.from(new Set(["Morges","Moudon","Payerne","Yverdon-les-Bains",
                  ...(editForm.secteur ? [editForm.secteur] : [])])).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <div style={{ fontSize:11, color:C.gray400, marginTop:4 }}>
                Le responsable de ce secteur pourra gérer cet établissement.
              </div>
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:4 }}>
              <Btn outline onClick={() => setShowEdit(false)}>Annuler</Btn>
              <Btn color="navy" disabled={savingEc} onClick={handleSaveEcole}>
                {savingEc ? "Enregistrement…" : "Mettre à jour"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal circuit (ajout / édition) ─────────────────────────────────── */}
      {showCircuit && (
        <Modal title={editCircuit ? "Modifier le circuit" : "Nouveau circuit"} onClose={() => setShowCircuit(false)}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {!editCircuit && (
              <CircField label="Code du circuit (optionnel)">
                <input value={circuitForm.id}
                  onChange={e => setCircuitForm(p => ({ ...p, id: e.target.value }))}
                  placeholder="Généré automatiquement si vide (ex : LEOPARD-1234)"
                  style={cInp} />
              </CircField>
            )}
            <div style={{ display:"grid", gridTemplateColumns:"80px 1fr", gap:12 }}>
              <CircField label="Emoji">
                <input value={circuitForm.emoji}
                  onChange={e => setCircuitForm(p => ({ ...p, emoji: e.target.value }))}
                  placeholder="🚌" style={{ ...cInp, textAlign:"center" }} />
              </CircField>
              <CircField label="Nom du circuit *">
                <input value={circuitForm.nom}
                  onChange={e => setCircuitForm(p => ({ ...p, nom: e.target.value }))}
                  placeholder="Ex : Léopard" style={cInp} />
              </CircField>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <CircField label="N° de tournée">
                <input value={circuitForm.num}
                  onChange={e => setCircuitForm(p => ({ ...p, num: e.target.value }))}
                  placeholder="Ex : 01" style={cInp} />
              </CircField>
              <CircField label="Km (aller)">
                <input type="number" value={circuitForm.km_aller}
                  onChange={e => setCircuitForm(p => ({ ...p, km_aller: Number(e.target.value) }))}
                  style={cInp} />
              </CircField>
            </div>
            <CircField label="Cercle scolaire">
              <select value={circuitForm.cercle_id ?? ""}
                onChange={e => setCircuitForm(p => ({ ...p, cercle_id: e.target.value ? Number(e.target.value) : null }))}
                style={cInp}>
                <option value="">— Sans cercle —</option>
                {cercles.map(cr => <option key={cr.id} value={cr.id}>{cr.nom}</option>)}
              </select>
            </CircField>
            <CircField label="Conducteur affecté">
              <select value={circuitForm.conducteur_id}
                onChange={e => setCircuitForm(p => ({ ...p, conducteur_id: e.target.value ? Number(e.target.value) : "" }))}
                style={cInp}>
                <option value="">— Non affecté —</option>
                {conducteurs.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.prenom} {d.nom}{d.est_responsable ? " (Responsable)" : ""}
                  </option>
                ))}
              </select>
            </CircField>

            {circErr && (
              <div style={{ background:C.redL, color:C.red, borderRadius:8,
                padding:"10px 14px", fontSize:13 }}>{circErr}</div>
            )}

            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:4 }}>
              <Btn outline onClick={() => setShowCircuit(false)}>Annuler</Btn>
              <Btn color="navy" disabled={savingCirc} onClick={handleSaveCircuit}>
                {savingCirc ? "Enregistrement…" : editCircuit ? "Mettre à jour" : "Créer le circuit"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal exception (période / changement de circuit) ─────────────── */}
      {showExc && excForm && (() => {
        const e = eleves.find(el => el.id === excForm.eleve_id);
        const set = (patch: Partial<ExcForm>) => setExcForm(f => f ? { ...f, ...patch } : f);
        const isChg = excForm.type === "changement_circuit";
        return (
          <Modal title={isChg ? "Changer de circuit" : "Absence sur une période"} onClose={() => setShowExc(false)}>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ fontWeight:800, fontSize:15, color:"#0f2540" }}>{e ? `${e.prenom_initiale} ${e.nom_famille}` : ""}</div>
              <CircField label="Type">
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {(["absent","parent","changement_circuit"] as ExcType[]).map(t => (
                    <button key={t} onClick={()=>set({type:t})}
                      style={{ flex:1, minWidth:130, padding:"10px", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:13,
                        border:`1.5px solid ${excForm.type===t?C.navy:C.gray200}`,
                        background:excForm.type===t?"#EFF6FF":"#fff", color:excForm.type===t?C.navy:C.gray }}>
                      {EXC_LABEL[t]}
                    </button>
                  ))}
                </div>
              </CircField>
              {isChg && (
                <>
                  <CircField label="Circuit cible (cet établissement ou un autre)">
                    <select value={excForm.circuit_cible_id} onChange={ev=>set({circuit_cible_id:ev.target.value})} style={cInp}>
                      <option value="">— Choisir un circuit —</option>
                      {Object.entries(allCircuits.reduce<Record<string,Circuit[]>>((acc,c)=>{ const k=String(c.ecole_id??0); (acc[k]=acc[k]||[]).push(c); return acc; }, {})).map(([eid,list])=>(
                        <optgroup key={eid} label={Number(eid)===ecoleId ? `${ecole.nom} · même établissement` : "Autre établissement"}>
                          {list.map(c=>{ const d=conducteurs.find(x=>x.circuit_id===c.id); return (
                            <option key={c.id} value={c.id}>{c.emoji} {c.nom}{d?` · ${d.prenom} ${d.nom}`:" · non affecté"}</option>
                          );})}
                        </optgroup>
                      ))}
                    </select>
                  </CircField>
                  <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:C.gray, fontWeight:600 }}>
                    <input type="checkbox" checked={excForm.definitif} onChange={ev=>set({definitif:ev.target.checked})} />
                    Changement définitif (l'élève reste sur ce circuit)
                  </label>
                </>
              )}
              {!(isChg && excForm.definitif) && (
                <div style={{ display:"flex", gap:12 }}>
                  <CircField label="Du"><input type="date" value={excForm.date_debut} onChange={ev=>set({date_debut:ev.target.value})} style={cInp} /></CircField>
                  <CircField label="Au"><input type="date" value={excForm.date_fin} onChange={ev=>set({date_fin:ev.target.value})} style={cInp} /></CircField>
                </div>
              )}
              <CircField label="Justification (visible par le conducteur & le responsable)">
                <textarea rows={2} value={excForm.justification} onChange={ev=>set({justification:ev.target.value})}
                  placeholder="Ex : certificat médical, garde alternée…" style={{ ...cInp, fontFamily:"inherit", resize:"vertical" }} />
              </CircField>
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                <Btn outline onClick={()=>setShowExc(false)}>Annuler</Btn>
                <Btn color="navy" disabled={savingExc || (isChg && !excForm.circuit_cible_id)} onClick={handleSaveExc}>
                  {savingExc ? "Enregistrement…" : "Enregistrer"}
                </Btn>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* ── Import Excel ── */}
      {showImport && (
        <ImportExcelModal ecoleId={ecoleId} ecoleNom={ecole.nom} circuits={circuits} eleves={eleves}
          onClose={() => setShowImport(false)} onDone={load} />
      )}

      {/* ── Aperçu côté conducteur (pop-up) ── */}
      {apercuFor && (() => {
        const c = circuits.find(x => x.id === apercuFor);
        if (!c) return null;
        const cEleves = eleves.filter(e => e.circuit_id === c.id && e.actif)
          .sort((a,b)=>(a.heure_ramassage||"~").localeCompare(b.heure_ramassage||"~"));
        let n = 0;
        return (
          <Modal title={`Aperçu conducteur — ${c.nom}`} onClose={() => setApercuFor(null)} wide>
            <div style={{ background:C.navy, color:"#fff", borderRadius:10, padding:"11px 15px", marginBottom:12 }}>
              <div style={{ fontWeight:800, fontSize:13 }}>📱 Vue conducteur — tournée du jour</div>
              <div style={{ fontSize:11.5, opacity:.85 }}>Un enfant absent ou ramené par les parents n'est pas un arrêt : « ne pas récupérer », on passe au suivant.</div>
            </div>
            <div style={{ border:`1px solid ${C.gray200}`, borderRadius:12, overflow:"hidden" }}>
              {cEleves.map(e => {
                const ex = excToday(e.id);
                if (ex) {
                  const info = ex.type==="absent" ? { c:"#E02424", bg:"#FDECEC", t:"Absent — ne pas récupérer" }
                    : ex.type==="parent" ? { c:"#D97706", bg:"#FEF3C7", t:"Ramené par les parents — ne pas récupérer" }
                    : { c:"#7C3AED", bg:"#EDE9FE", t:"Sur un autre circuit — ne pas récupérer ici" };
                  return (
                    <div key={e.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px", borderBottom:`1px solid ${C.gray100}`, background:info.bg }}>
                      <div style={{ width:24,height:24,borderRadius:7,background:info.c,color:"#fff",fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0 }}>⤳</div>
                      <div style={{ flex:1, minWidth:0 }}><b style={{ color:info.c }}>{e.prenom_initiale} {e.nom_famille}</b><div style={{ fontSize:11.5, color:info.c, fontWeight:600 }}>{info.t}</div></div>
                    </div>
                  );
                }
                n += 1;
                return (
                  <div key={e.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px", borderBottom:`1px solid ${C.gray100}`, background:"#fff" }}>
                    <div style={{ width:24,height:24,borderRadius:7,background:C.navy,color:"#fff",fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0 }}>{n}</div>
                    <div style={{ minWidth:46, fontSize:12.5, fontWeight:800, color:C.navy }}>{e.heure_ramassage||"—"}</div>
                    <div style={{ flex:1, minWidth:0 }}><div style={{ fontWeight:700, fontSize:13.5, color:C.gray800 }}>{e.prenom_initiale} {e.nom_famille}</div><div style={{ fontSize:11.5, color:C.gray400, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.adresse||""}</div></div>
                    <span style={{ background:"#EFF6FF", color:C.navy, borderRadius:20, padding:"3px 10px", fontSize:11.5, fontWeight:800 }}>À récupérer</span>
                  </div>
                );
              })}
              <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 16px", background:"#F8FAFC" }}>
                <div style={{ width:24,height:24,borderRadius:7,background:"#fff",border:`1px solid ${C.gray200}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:13 }}>🏫</div>
                <div style={{ fontSize:13, fontWeight:700, color:C.gray800 }}>Arrivée établissement — dépose</div>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

const cInp: CSSProperties = {
  width:"100%", padding:"9px 12px", border:"1px solid #E2E8F0",
  borderRadius:8, fontSize:14, boxSizing:"border-box", outline:"none",
};

function CircField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label style={{ fontSize:13, color:"#64748B", fontWeight:600, display:"block", marginBottom:4 }}>{label}</label>
      {children}
    </div>
  );
}
