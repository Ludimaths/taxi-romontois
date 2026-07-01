"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";
import { Btn, TabBar, Badge, Modal, SectionTitle } from "@/components/ui";
import type { Ecole, Eleve, Circuit, Conducteur, PriseEnCharge, TourneeConfig, AdresseEleve } from "@/lib/types";

type ConduPartial = Pick<Conducteur, "id" | "nom" | "prenom" | "circuit_id" | "status">;
import { ArrowLeft, ChevronDown } from "lucide-react";

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
}
const EMPTY_EF: EleveForm = { nom_famille:"", prenom_initiale:"", adresse:"", circuit_id:"", type_transport:"standard", actif:true };

// ── Helpers ────────────────────────────────────────────────────────────────────

function statutLabel(s: string) {
  return s === "present" ? "Présent" : "Absent";
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
  const [prises,     setPrises]     = useState<PriseEnCharge[]>([]);
  const [tournees,   setTournees]   = useState<TourneeConfig[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState("Élèves");

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

  const load = useCallback(async () => {
    const today_ = isoToday();
    const [
      { data: ecoleData },
      { data: elevesData },
      { data: allCirData },
      { data: conduData },
      { data: prisesData },
      { data: tournData },
    ] = await Promise.all([
      sb.from("ecoles").select("*").eq("id", ecoleId).single(),
      sb.from("eleves").select("*").eq("ecole_id", ecoleId).order("nom_famille"),
      sb.from("circuits").select("*").order("nom"),
      sb.from("conducteurs").select("id,nom,prenom,circuit_id,status"),
      sb.from("prises_en_charge").select("*").eq("date", today_),
      sb.from("tournees_config").select("*").eq("ecole_id", ecoleId),
    ]);

    const elevesList: Eleve[] = elevesData ?? [];
    const circuitIds = [...new Set(elevesList.map(e => e.circuit_id).filter(Boolean) as string[])];
    const usedCircuits = (allCirData ?? []).filter((c: Circuit) => circuitIds.includes(c.id));

    setEcole(ecoleData ?? null);
    setEleves(elevesList);
    setCircuits(usedCircuits);
    setAllCircuits(allCirData ?? []);
    setConducteurs(conduData ?? []);
    setPrises(prisesData ?? []);
    setTournees(tournData ?? []);
    setLoading(false);
  }, [sb, ecoleId]);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    const ch = sb.channel(`etabl-${ecoleId}`)
      .on("postgres_changes", { event:"*", schema:"public", table:"eleves" }, load)
      .on("postgres_changes", { event:"*", schema:"public", table:"prises_en_charge" }, load)
      .on("postgres_changes", { event:"*", schema:"public", table:"ecoles" }, load)
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

  async function handleToggleActif(e: Eleve) {
    await sb.from("eleves").update({ actif: !e.actif }).eq("id", e.id);
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
    });
    setShowEdit(true);
  }

  async function handleSaveEcole() {
    if (!ecole) return;
    setSavingEc(true);
    await sb.from("ecoles").update(editForm).eq("id", ecoleId);
    setSavingEc(false);
    setShowEdit(false);
    load();
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

      const { genererFactureDGEO } = await import("@/lib/dgeo-export");
      const bytes = genererFactureDGEO({
        ecole,
        tournees,
        prises: prisesM ?? [],
        eleves,
        mois: facMois,
        annee: facAnnee,
        numFacture,
        params: { nom: params.nom_entreprise, adresse: params.adresse,
          telephone: params.telephone, tva: params.tva, iban: params.iban },
      });

      const nomEcole = ecole.nom.replace(/\s+/g,"_");
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url;
      a.download = `Facture_DGEO_${nomEcole}_${MOIS_NOMS[facMois]}_${facAnnee}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
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
  const circuitsMap = Object.fromEntries(circuits.map(c => [c.id, c]));
  const conduMap    = Object.fromEntries(conducteurs.map(c => [c.circuit_id, c]));

  return (
    <div style={{ padding: "28px 28px", maxWidth: 980, margin: "0 auto" }}>
      {/* Retour */}
      <button onClick={() => router.push("/gestionnaire/etablissements")}
        style={{ display:"flex", alignItems:"center", gap:6, color:C.gray600,
          background:"none", border:"none", cursor:"pointer", fontSize:13,
          fontWeight:600, marginBottom:18, padding:0 }}>
        <ArrowLeft size={15} /> Tous les établissements
      </button>

      {/* Header école */}
      <div style={{ background: C.white, borderRadius: 14, padding: "22px 24px",
        border: `1px solid ${C.gray200}`, marginBottom: 22,
        display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: C.gray800 }}>{ecole.nom}</div>
          {ecole.lot && <div style={{ fontSize: 13, color: C.gray400, marginTop: 2 }}>Lot {ecole.lot}</div>}
          <div style={{ display:"flex", gap:16, marginTop:12, flexWrap:"wrap" }}>
            {ecole.adresse && <span style={{ fontSize:13, color:C.gray600 }}>{ecole.adresse}</span>}
            {ecole.email   && <span style={{ fontSize:13, color:C.gray600 }}>{ecole.email}</span>}
            {ecole.telephone && <span style={{ fontSize:13, color:C.gray600 }}>Tél : {ecole.telephone}</span>}
          </div>
          <div style={{ display:"flex", gap:16, marginTop:6, flexWrap:"wrap" }}>
            {ecole.nom_responsable_facturation && (
              <span style={{ fontSize:13, color:C.gray600 }}>
                Responsable : {ecole.nom_responsable_facturation}
              </span>
            )}
            {ecole.numero_tva && <span style={{ fontSize:12, color:C.gray400 }}>TVA : {ecole.numero_tva}</span>}
            {ecole.iban       && <span style={{ fontSize:12, color:C.gray400 }}>IBAN : {ecole.iban}</span>}
          </div>
        </div>
        <Btn small outline onClick={openEditEcole}>Modifier</Btn>
      </div>

      {/* Stats */}
      <div style={{ display:"flex", gap:12, marginBottom:22, flexWrap:"wrap" }}>
        {[
          { label:"Élèves actifs",   value: elevesActifs.length },
          { label:"Circuits",        value: circuits.length },
          { label:"Tournées config", value: tournees.filter(t=>t.actif).length },
          { label:"Suivi aujourd'hui", value: prisesEcole.length },
        ].map(s => (
          <div key={s.label} style={{ background:C.white, border:`1px solid ${C.gray200}`,
            borderRadius:10, padding:"14px 18px", minWidth:130 }}>
            <div style={{ fontSize:24, fontWeight:900, color:C.navy }}>{s.value}</div>
            <div style={{ fontSize:12, color:C.gray400, marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <TabBar
        tabs={["Élèves","Circuits","Suivi du jour","Factures"]}
        active={tab}
        onChange={setTab}
      />

      {/* ── TAB 0 : ÉLÈVES ─────────────────────────────────────────────────── */}
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
                      Inscrit ℹ
                    </th>
                    <th style={{ padding:"11px 14px", textAlign:"left",
                      fontWeight:700, color:C.gray600, borderBottom:`1px solid ${C.gray200}` }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {eleves.map((e, i) => {
                    const circ = allCircuits.find(c => c.id === e.circuit_id);
                    return (
                      <tr key={e.id} style={{ background: i % 2 === 0 ? C.white : C.gray50 }}>
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
                            {e.actif ? "Inscrit" : "Non inscrit"}
                          </Badge>
                        </td>
                        <td style={{ padding:"10px 14px" }}>
                          <div style={{ display:"flex", gap:6 }}>
                            <Btn small outline onClick={() => openEdit(e)}>Éditer</Btn>
                            <Btn small outline onClick={() => handleToggleActif(e)}>
                              {e.actif ? "Désinscrire" : "Réinscrire"}
                            </Btn>
                          </div>
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

      {/* ── TAB 1 : CIRCUITS ───────────────────────────────────────────────── */}
      {tab === "Circuits" && (
        <div style={{ marginTop:20 }}>
          {circuits.length === 0 ? (
            <div style={{ padding:40, textAlign:"center", color:C.gray400,
              background:C.gray50, borderRadius:12 }}>
              Aucun circuit lié à cet établissement (via les élèves).
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {circuits.map(c => {
                const cEleves = elevesActifs.filter(e => e.circuit_id === c.id);
                const cond    = conduMap[c.id];
                const cPrises = prisesEcole.filter(p =>
                  eleves.find(e => e.id === p.eleve_id && e.circuit_id === c.id)
                );
                const presents = cPrises.filter(p => p.statut === "present").length;
                const absents  = cPrises.filter(p => p.statut === "absent").length;

                return (
                  <div key={c.id} style={{ background:C.white, border:`1px solid ${C.gray200}`,
                    borderRadius:12, padding:"18px 20px" }}>
                    <div style={{ display:"flex", alignItems:"center",
                      justifyContent:"space-between", gap:16, flexWrap:"wrap" }}>
                      <div>
                        <div style={{ fontSize:16, fontWeight:800, color:C.gray800 }}>
                          {c.emoji} {c.nom}
                        </div>
                        <div style={{ fontSize:13, color:C.gray400, marginTop:3 }}>
                          {c.num} — {c.km_aller ?? "?"} km
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
                        <div style={{ textAlign:"center" }}>
                          <div style={{ fontSize:18, fontWeight:900, color:C.navy }}>
                            {cEleves.length}
                          </div>
                          <div style={{ fontSize:11, color:C.gray400 }}>élèves</div>
                        </div>
                        {cPrises.length > 0 && (
                          <>
                            <div style={{ textAlign:"center" }}>
                              <div style={{ fontSize:18, fontWeight:900, color:C.green }}>{presents}</div>
                              <div style={{ fontSize:11, color:C.gray400 }}>présents</div>
                            </div>
                            <div style={{ textAlign:"center" }}>
                              <div style={{ fontSize:18, fontWeight:900, color:C.red }}>{absents}</div>
                              <div style={{ fontSize:11, color:C.gray400 }}>absents</div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    {cond && (
                      <div style={{ marginTop:12, fontSize:13, color:C.gray600,
                        background:C.gray50, borderRadius:8, padding:"8px 12px" }}>
                        Conducteur : <strong>{cond.prenom} {cond.nom}</strong>
                        <span style={{ marginLeft:10, color: cond.status === "en_service" ? C.green : C.gray400 }}>
                          ● {cond.status === "en_service" ? "En service" : cond.status}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2 : SUIVI DU JOUR ──────────────────────────────────────────── */}
      {tab === "Suivi du jour" && (
        <div style={{ marginTop:20 }}>
          <div style={{ fontSize:13, color:C.gray400, marginBottom:14 }}>
            Suivi en temps réel — {isoToday()}
          </div>
          {circuits.length === 0 || prisesEcole.length === 0 ? (
            <div style={{ padding:40, textAlign:"center", color:C.gray400,
              background:C.gray50, borderRadius:12 }}>
              Aucune prise en charge enregistrée aujourd&apos;hui.
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {circuits.map(c => {
                const cEleves = elevesActifs.filter(e => e.circuit_id === c.id);
                const eleveIdsC = new Set(cEleves.map(e => e.id));
                const cPrises  = prisesEcole.filter(p => eleveIdsC.has(p.eleve_id));
                if (cPrises.length === 0) return null;

                return (
                  <div key={c.id} style={{ background:C.white, border:`1px solid ${C.gray200}`,
                    borderRadius:12, padding:"16px 18px" }}>
                    <div style={{ fontWeight:800, color:C.gray800, marginBottom:12, fontSize:15 }}>
                      {c.emoji} {c.nom}
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                      {cPrises.map(p => {
                        const eleve = eleves.find(e => e.id === p.eleve_id);
                        return (
                          <div key={p.id} style={{ display:"flex", alignItems:"center",
                            justifyContent:"space-between", padding:"8px 12px",
                            background:C.gray50, borderRadius:8 }}>
                            <span style={{ fontWeight:600, color:C.gray800 }}>
                              {eleve ? `${eleve.prenom_initiale} ${eleve.nom_famille}` : `Élève #${p.eleve_id}`}
                            </span>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              {p.heure_prise && (
                                <span style={{ fontSize:12, color:C.gray400 }}>
                                  {p.heure_prise.slice(0,5)}
                                </span>
                              )}
                              <Badge color={p.statut === "present" ? "green" : "red"}>
                                {statutLabel(p.statut)}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3 : FACTURES ───────────────────────────────────────────────── */}
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
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:4 }}>
              <Btn outline onClick={() => setShowEdit(false)}>Annuler</Btn>
              <Btn color="navy" disabled={savingEc} onClick={handleSaveEcole}>
                {savingEc ? "Enregistrement…" : "Mettre à jour"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
