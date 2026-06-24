"use client";
import { Bell, Wrench, CheckCircle2, Archive, MessageSquare, Save, Bus, Package, AlertTriangle, Inbox, BarChart2, FileText, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { C, fmtDate, fmtDateTime, isoToday } from "@/lib/constants";
import type { Vehicule, Reparation, Alerte } from "@/lib/types";

type MTab = "alertes" | "atelier" | "prets" | "historique" | "messages";

const BUDGET_SEUIL = 1000;

const RS: Record<string, { l: string; c: string; bg: string }> = {
  receptionne:           { l: "Réceptionné",          c: "#2563EB", bg: "#DBEAFE" },
  en_attente_validation: { l: "Attente validation",   c: C.red,     bg: C.redL   },
  en_attente_piece:      { l: "Attente pièce",        c: C.amber,   bg: C.amberL },
  en_reparation:         { l: "En réparation",        c: C.navy,    bg: "#EFF6FF" },
  repare:                { l: "Réparé — Prêt",        c: "#7C3AED", bg: "#EDE9FE" },
  remis_en_circulation:  { l: "Remis en circulation", c: C.green,   bg: C.greenL },
};

function nbJ(a: string, b: string) {
  return Math.round((+new Date(b) - +new Date(a)) / 86400000);
}

// ── Micro-composants ──────────────────────────────────────────────────────────

function ChipR({ s }: { s: string }) {
  const r = RS[s];
  if (!r) return null;
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20,
      fontSize: 12, fontWeight: 700, background: r.bg, color: r.c }}>
      {r.l}
    </span>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex",
      alignItems: "flex-end", background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div style={{ width: "100%", maxHeight: "94vh", overflowY: "auto", background: C.white,
        borderRadius: "24px 24px 0 0", padding: "24px 20px 80px" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ width: 40, height: 4, background: "#CBD5E1", borderRadius: 4, margin: "0 auto 20px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: C.navy, margin: 0 }}>{title}</h2>
          <button onClick={onClose}
            style={{ fontSize: 28, background: "none", border: "none", cursor: "pointer",
              color: C.gray400, lineHeight: 1, padding: "0 4px", minWidth: 44, minHeight: 44 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  width: "100%", padding: "14px 16px", borderRadius: 12,
  border: "1.5px solid #CBD5E1", fontSize: 15, color: "#1E293B",
  background: C.white, boxSizing: "border-box",
};

function F({ label, type = "text", value, onChange, placeholder = "", required = false }: {
  label: string; type?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.gray600, marginBottom: 6 }}>
        {label}{required && <span style={{ color: C.red }}> *</span>}
      </label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} style={inp} />
    </div>
  );
}

function TA({ label, value, onChange, rows = 3, placeholder = "" }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.gray600, marginBottom: 6 }}>
        {label}
      </label>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows}
        placeholder={placeholder} style={{ ...inp, resize: "vertical" }} />
    </div>
  );
}

function DL({ l, v }: { l: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between",
      padding: "8px 0", borderBottom: `1px solid ${C.gray100}`, fontSize: 14 }}>
      <span style={{ color: C.gray600, fontWeight: 600 }}>{l}</span>
      <span style={{ color: "#1E293B", fontWeight: 700, textAlign: "right", maxWidth: "65%" }}>{v}</span>
    </div>
  );
}

function BigBtn({ icon, label, onClick, color = C.navy, outline = false, disabled = false }: {
  icon?: React.ReactNode; label: string; onClick: () => void; color?: string; outline?: boolean; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ width: "100%", padding: "16px 20px", marginBottom: 10, borderRadius: 16,
        fontWeight: 800, fontSize: 15, cursor: disabled ? "not-allowed" : "pointer",
        border: outline ? `2px solid ${color}` : "none",
        background: outline ? C.white : disabled ? "#CBD5E1" : color,
        color: outline ? color : C.white, opacity: disabled ? 0.6 : 1,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 52 }}>
      {icon && <span style={{ display: "flex", alignItems: "center" }}>{icon}</span>}{label}
    </button>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function MecanicienPage() {
  // useMemo : référence stable → useCallback([sb]) ne change pas chaque render → Realtime stable
  const sb = useMemo(() => createClient(), []);

  const [tab,         setTab]         = useState<MTab>("alertes");
  const [loading,     setLoading]     = useState(true);

  // Data
  const [alertesMeca, setAlertesMeca] = useState<Alerte[]>([]);
  const [reparations, setReparations] = useState<Reparation[]>([]);
  const [vehicules,   setVehicules]   = useState<Vehicule[]>([]);
  const [conducteurs, setConducteurs] = useState<{ id: number; prenom: string; nom: string }[]>([]);

  // Messages
  const [msgDecisions,   setMsgDecisions]   = useState<Alerte[]>([]);
  const [msgSendText,    setMsgSendText]    = useState("");
  const [msgSendTarget,  setMsgSendTarget]  = useState<"gestionnaire"|"admin">("gestionnaire");
  const [msgSending,     setMsgSending]     = useState(false);

  // Réception depuis alerte
  const [recepAlerte, setRecepAlerte] = useState<Alerte | null>(null);
  const [recepF,      setRecepF]      = useState({ description: "", etat_visuel: "", km: "", notes: "" });
  const [recepPhotos, setRecepPhotos] = useState<File[]>([]);
  const [recepBusy,   setRecepBusy]   = useState(false);
  const [recepErr,    setRecepErr]    = useState("");

  // Réception directe (sans alerte)
  const [directRecep,      setDirectRecep]      = useState(false);
  const [directRecepVehId, setDirectRecepVehId] = useState("");
  const [directRecepF,     setDirectRecepF]     = useState({ description: "", etat_visuel: "", km: "", notes: "" });
  const [directRecepBusy,  setDirectRecepBusy]  = useState(false);
  const [directRecepErr,   setDirectRecepErr]   = useState("");

  // Suivi atelier form
  const [suiviRep,  setSuiviRep]  = useState<Reparation | null>(null);
  const [suiviF,    setSuiviF]    = useState({ statut: "", cout: "", notes: "", remarques: "", statut_libre: "" });
  const [suiviPhotos, setSuiviPhotos] = useState<File[]>([]);
  const [suiviBusy, setSuiviBusy] = useState(false);

  // Sortie prêts form
  const [sortieRep,  setSortieRep]  = useState<Reparation | null>(null);
  const [sortieF,    setSortieF]    = useState({ type: "conducteur", condId: "", nom: "", km: "" });
  const [sortieBusy, setSortieBusy] = useState(false);

  // Fiche véhicule
  const [veSheet, setVeSheet] = useState<Vehicule | null>(null);
  const [veF,     setVeF]     = useState({ km: "", ct_date: "", date_vidange: "", etat: "", notes: "" });
  const [saveErr, setSaveErr] = useState("");

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const [v, r, alt, cond, dec] = await Promise.all([
      sb.from("vehicules")
        .select("*,circuit:circuits(*),conducteur:conducteurs(prenom,nom)")
        .order("plaque"),
      sb.from("reparations")
        .select("*,vehicule:vehicules(id,plaque,marque,modele)")
        .order("created_at", { ascending: false }),
      sb.from("alertes")
        .select("*")
        .eq("type", "transmis_meca")
        .eq("read", false)
        .order("created_at", { ascending: false }),
      sb.from("conducteurs").select("id,prenom,nom").order("nom"),
      sb.from("alertes")
        .select("*")
        .eq("type", "decision_admin")
        .eq("read", false)
        .order("created_at", { ascending: false }),
    ]);
    setVehicules(v.data ?? []);
    setReparations(r.data ?? []);
    setAlertesMeca(alt.data ?? []);
    setConducteurs(cond.data ?? []);
    setMsgDecisions(dec.data ?? []);
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    load();
    const ch = sb.channel("meca-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "alertes" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "reparations" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicules" }, load)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [load, sb]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function vehOf(id: string | undefined) {
    return vehicules.find(v => v.id === id);
  }

  function plaqueOf(id: string | undefined) {
    return vehOf(id)?.plaque || id || "—";
  }

  function openSuivi(rep: Reparation) {
    const veh = vehOf(rep.vehicule_id);
    setSuiviRep(rep);
    setSuiviPhotos([]);
    setSuiviF({
      statut: rep.statut,
      cout: rep.cout_estime != null ? String(rep.cout_estime) : rep.cout != null ? String(rep.cout) : "",
      notes: rep.commentaire_mecanicien || "",
      remarques: veh?.notes || "",
      statut_libre: "",
    });
  }

  function openVe(v: Vehicule) {
    setVeSheet(v);
    setSaveErr("");
    setVeF({ km: String(v.km ?? ""), ct_date: v.ct_date || "", date_vidange: v.date_vidange || "", etat: v.etat as string, notes: v.notes || "" });
  }

  // ── Handlers ────────────────────────────────────────────────────────────────
  async function doReceptionner() {
    if (!recepAlerte || !recepF.description.trim()) return;
    setRecepBusy(true);
    setRecepErr("");
    const vId = recepAlerte.vehicle_id;
    console.log("[doReceptionner] vehicle_id:", vId);
    if (!vId) {
      console.error("[doReceptionner] vehicle_id manquant sur l'alerte", recepAlerte);
      setRecepErr("Aucun véhicule associé à cet incident — le gestionnaire doit préciser le véhicule concerné");
      setRecepBusy(false);
      return;
    }
    const plaque = plaqueOf(vId);
    console.log("[doReceptionner] plaque:", plaque, "description:", recepF.description);

    // Vérifier si une réparation active existe déjà pour ce véhicule
    const { data: existingRep } = await sb.from("reparations")
      .select("id,commentaire_mecanicien")
      .eq("vehicule_id", vId)
      .neq("statut", "remis_en_circulation")
      .maybeSingle();
    if (existingRep) {
      const prevNote = existingRep.commentaire_mecanicien || "";
      const addNote = `Nouvelle alerte le ${isoToday()} : ${recepF.description.trim()}`;
      await sb.from("reparations").update({
        commentaire_mecanicien: [prevNote, addNote].filter(Boolean).join(" | "),
      }).eq("id", existingRep.id);
      await sb.from("alertes")
        .update({ read: true, read_at: new Date().toISOString() }).eq("id", recepAlerte.id);
      setRecepAlerte(null);
      setRecepF({ description: "", etat_visuel: "", km: "", notes: "" });
      setRecepPhotos([]);
      setRecepErr("");
      setRecepBusy(false);
      setTab("atelier");
      load();
      return;
    }

    const urls: string[] = [];
    for (const f of recepPhotos) {
      const { data, error: stErr } = await sb.storage.from("vehicule-photos")
        .upload(`${vId}/${Date.now()}-${f.name}`, f, { upsert: true });
      if (stErr) console.warn("[doReceptionner] storage:", stErr.message);
      if (data) urls.push(data.path);
    }

    const notesArr = [
      recepF.etat_visuel ? `État: ${recepF.etat_visuel}` : "",
      recepF.notes,
      urls.length ? `Photos:${urls.join(",")}` : "",
    ].filter(Boolean);

    console.log("[doReceptionner] INSERT reparation…");
    const { error } = await sb.from("reparations").insert({
      vehicule_id: vId,
      statut: "receptionne",
      description: recepF.description.trim(),
      km_reception: recepF.km ? +recepF.km : null,
      date_reception: isoToday(),
      commentaire_mecanicien: notesArr.join(" | ") || null,
      alerte_envoyee: false,
    });

    if (error) {
      console.error("[doReceptionner] INSERT error:", error.code, error.message, error.details);
      setRecepErr(`Erreur DB: ${error.message}`);
      setRecepBusy(false);
      return;
    }
    console.log("[doReceptionner] INSERT OK");

    const { error: vErr } = await sb.from("vehicules").update({ etat: "atelier" }).eq("id", vId);
    if (vErr) console.error("[doReceptionner] vehicule update:", vErr.message);

    const { error: aErr } = await sb.from("alertes")
      .update({ read: true, read_at: new Date().toISOString() }).eq("id", recepAlerte.id);
    if (aErr) console.error("[doReceptionner] alerte read:", aErr.message);

    const { error: a2Err } = await sb.from("alertes").insert({
      type: "vehicule", severity: "normale", read: false, vehicle_id: vId,
      message: `Véhicule ${plaque} réceptionné à l'atelier — ${recepF.description.slice(0, 80)}`,
    });
    if (a2Err) console.error("[doReceptionner] alerte insert:", a2Err.message);

    setRecepAlerte(null);
    setRecepF({ description: "", etat_visuel: "", km: "", notes: "" });
    setRecepPhotos([]);
    setRecepErr("");
    setRecepBusy(false);
    setTab("atelier");
    load();
  }

  async function doReceptionnerDirect() {
    if (!directRecepVehId || !directRecepF.description.trim()) return;
    setDirectRecepBusy(true);
    setDirectRecepErr("");
    const vId = directRecepVehId;
    const plaque = plaqueOf(vId);
    console.log("[doReceptionnerDirect] vId:", vId, "plaque:", plaque);

    // Vérifier si une réparation active existe déjà pour ce véhicule
    const { data: existingRepD } = await sb.from("reparations")
      .select("id,commentaire_mecanicien")
      .eq("vehicule_id", vId)
      .neq("statut", "remis_en_circulation")
      .maybeSingle();
    if (existingRepD) {
      const prevNoteD = existingRepD.commentaire_mecanicien || "";
      const addNoteD = `Nouvelle réception le ${isoToday()} : ${directRecepF.description.trim()}`;
      await sb.from("reparations").update({
        commentaire_mecanicien: [prevNoteD, addNoteD].filter(Boolean).join(" | "),
      }).eq("id", existingRepD.id);
      setDirectRecep(false);
      setDirectRecepVehId("");
      setDirectRecepF({ description: "", etat_visuel: "", km: "", notes: "" });
      setDirectRecepErr("");
      setDirectRecepBusy(false);
      setTab("atelier");
      load();
      return;
    }

    const notesArr = [
      directRecepF.etat_visuel ? `État: ${directRecepF.etat_visuel}` : "",
      directRecepF.notes,
    ].filter(Boolean);

    const { error } = await sb.from("reparations").insert({
      vehicule_id: vId,
      statut: "receptionne",
      description: directRecepF.description.trim(),
      km_reception: directRecepF.km ? +directRecepF.km : null,
      date_reception: isoToday(),
      commentaire_mecanicien: notesArr.join(" | ") || null,
      alerte_envoyee: false,
    });

    if (error) {
      console.error("[doReceptionnerDirect] INSERT error:", error.code, error.message, error.details);
      setDirectRecepErr(`Erreur DB: ${error.message}`);
      setDirectRecepBusy(false);
      return;
    }
    console.log("[doReceptionnerDirect] INSERT OK");

    const { error: vErr } = await sb.from("vehicules").update({ etat: "atelier" }).eq("id", vId);
    if (vErr) console.error("[doReceptionnerDirect] vehicule update:", vErr.message);

    const { error: aErr } = await sb.from("alertes").insert({
      type: "vehicule", severity: "normale", read: false, vehicle_id: vId,
      message: `Véhicule ${plaque} réceptionné directement à l'atelier — ${directRecepF.description.slice(0, 80)}`,
    });
    if (aErr) console.error("[doReceptionnerDirect] alerte insert:", aErr.message);

    setDirectRecep(false);
    setDirectRecepVehId("");
    setDirectRecepF({ description: "", etat_visuel: "", km: "", notes: "" });
    setDirectRecepErr("");
    setDirectRecepBusy(false);
    setTab("atelier");
    load();
  }

  async function doSauvegarderSuivi() {
    if (!suiviRep) return;
    setSuiviBusy(true);
    const vId = suiviRep.vehicule_id;
    const plaque = plaqueOf(vId);
    const veh = vehOf(vId);

    const cout = suiviF.cout ? +suiviF.cout : null;
    let newStatut = (suiviF.statut || suiviRep.statut) as string;
    if (cout !== null && cout > BUDGET_SEUIL) newStatut = "en_attente_validation";

    const upd: Record<string, unknown> = {
      statut: newStatut,
      commentaire_mecanicien: suiviF.notes || suiviRep.commentaire_mecanicien || null,
    };
    if (cout !== null) upd.cout_estime = cout;
    if (newStatut === "en_reparation" && !suiviRep.date_debut_reparation) {
      upd.date_debut_reparation = isoToday();
    }

    // Upload photos supplémentaires
    const urls: string[] = [];
    for (const f of suiviPhotos) {
      const { data } = await sb.storage.from("vehicule-photos")
        .upload(`${vId}/${Date.now()}-${f.name}`, f, { upsert: true });
      if (data) urls.push(data.path);
    }
    if (urls.length) {
      const prev = (upd.commentaire_mecanicien as string) || "";
      upd.commentaire_mecanicien = [prev, `Photos:${urls.join(",")}`].filter(Boolean).join(" | ");
    }

    const { error: repErr } = await sb.from("reparations").update(upd).eq("id", suiviRep.id);
    if (repErr) { console.error("[doSauvegarderSuivi]", repErr.message); setSuiviBusy(false); return; }

    // Remarques véhicule → vehicules.notes
    if (suiviF.remarques !== (veh?.notes || "")) {
      await sb.from("vehicules").update({ notes: suiviF.remarques || null }).eq("id", vId);
    }

    // Notification gestionnaire
    const sl = RS[newStatut]?.l || newStatut;
    const sev = newStatut === "en_attente_validation" ? "haute" : "normale";
    const coutTxt = cout ? ` · ${cout.toLocaleString("fr-CH")} CHF` : "";
    await sb.from("alertes").insert({
      type: newStatut === "en_attente_validation" ? "validation_requise" : "reparation",
      severity: sev, read: false, vehicle_id: vId,
      message: `${plaque} — ${sl}${coutTxt}`,
    });

    setSuiviRep(null);
    setSuiviF({ statut: "", cout: "", notes: "", remarques: "", statut_libre: "" });
    setSuiviPhotos([]);
    setSuiviBusy(false);
    load();
  }

  async function doTerminer() {
    if (!suiviRep) return;
    setSuiviBusy(true);
    const vId = suiviRep.vehicule_id;
    const plaque = plaqueOf(vId);

    const upd: Record<string, unknown> = { statut: "repare", date_fin_reparation: isoToday() };
    if (suiviF.cout) upd.cout = +suiviF.cout;
    if (suiviF.notes) upd.commentaire_mecanicien = suiviF.notes;

    const { error } = await sb.from("reparations").update(upd).eq("id", suiviRep.id);
    if (error) { console.error("[doTerminer]", error.message); setSuiviBusy(false); return; }
    await sb.from("vehicules").update({ etat: "repare" }).eq("id", vId);
    await sb.from("alertes").insert({
      type: "reparation", severity: "normale", read: false, vehicle_id: vId,
      message: `Véhicule ${plaque} — Réparation terminée, prêt à être récupéré`,
    });

    setSuiviRep(null);
    setSuiviF({ statut: "", cout: "", notes: "", remarques: "", statut_libre: "" });
    setSuiviPhotos([]);
    setSuiviBusy(false);
    setTab("prets");
    load();
  }

  async function doSortie() {
    if (!sortieRep) return;
    setSortieBusy(true);
    const vId = sortieRep.vehicule_id;
    const plaque = plaqueOf(vId);

    let recupLabel = "";
    if (sortieF.type === "conducteur") {
      const c = conducteurs.find(x => String(x.id) === sortieF.condId);
      recupLabel = c ? `${c.prenom} ${c.nom}` : "";
    } else {
      recupLabel = sortieF.nom.trim();
    }

    const upd: Record<string, unknown> = { statut: "remis_en_circulation", date_remise_circulation: isoToday() };
    if (sortieF.km) upd.km_sortie = +sortieF.km;
    if (recupLabel) upd.responsable = `sortie|${recupLabel}`;

    const { error } = await sb.from("reparations").update(upd).eq("id", sortieRep.id);
    if (error) { console.error("[doSortie]", error.message); setSortieBusy(false); return; }
    await sb.from("vehicules").update({ etat: "bon" }).eq("id", vId);

    const msg = recupLabel
      ? `Véhicule ${plaque} récupéré par ${recupLabel}`
      : `Véhicule ${plaque} remis en circulation`;
    await sb.from("alertes").insert({
      type: "remise_circulation", severity: "normale", read: false, vehicle_id: vId, message: msg,
    });

    setSortieRep(null);
    setSortieF({ type: "conducteur", condId: "", nom: "", km: "" });
    setSortieBusy(false);
    setTab("historique");
    load();
  }

  async function doVeSave() {
    if (!veSheet) return;
    setSaveErr("");
    const { error } = await sb.from("vehicules").update({
      km: veF.km ? +veF.km : veSheet.km,
      ct_date: veF.ct_date || null,
      date_vidange: veF.date_vidange || null,
      etat: (veF.etat || veSheet.etat) as Vehicule["etat"],
      notes: veF.notes || null,
    }).eq("id", veSheet.id);
    if (error) { console.error("[doVeSave]", error.message); setSaveErr(error.message); return; }
    await load();
    setVeSheet(null);
  }

  // ── Computed ─────────────────────────────────────────────────────────────────
  const ATELIER_ST = ["receptionne", "en_reparation", "en_attente_piece", "en_attente_validation"];
  const atelierReps = reparations.filter(r => ATELIER_ST.includes(r.statut));
  const pretsReps   = reparations.filter(r => r.statut === "repare");
  const histReps    = reparations.filter(r => r.statut === "remis_en_circulation");

  const now = new Date();
  const m0  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const y0  = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
  const totalMois = histReps.filter(r => (r.date_remise_circulation || "") >= m0).reduce((s, r) => s + (r.cout || 0), 0);
  const totalAn   = histReps.filter(r => (r.date_remise_circulation || "") >= y0).reduce((s, r) => s + (r.cout || 0), 0);
  const totalGlob = histReps.reduce((s, r) => s + (r.cout || 0), 0);

  const MTAB_ICONS: Record<MTab, React.ReactNode> = {
    alertes:    <Bell size={14} />,
    atelier:    <Wrench size={14} />,
    prets:      <CheckCircle2 size={14} />,
    historique: <Archive size={14} />,
    messages:   <MessageSquare size={14} />,
  };
  const tabs: { id: MTab; label: string; badge?: number }[] = [
    { id: "alertes",    label: "Alertes",    badge: alertesMeca.length || undefined },
    { id: "atelier",    label: "Atelier",    badge: atelierReps.length || undefined },
    { id: "prets",      label: "Prêts",      badge: pretsReps.length || undefined },
    { id: "historique", label: "Historique" },
    { id: "messages",   label: "Messages",   badge: msgDecisions.length || undefined },
  ];

  if (loading) return (
    <div style={{ textAlign: "center", padding: 60, color: C.gray400, fontSize: 14 }}>Chargement…</div>
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 4px" }}>

      {/* Profil mécanicien */}
      <div style={{ background: `linear-gradient(135deg,${C.navy},${C.navyL})`, borderRadius: 16,
        padding: 20, marginBottom: 20, color: "#fff" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ width: 52, height: 52, borderRadius: 26, background: "rgba(255,255,255,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 900, color: "#fff", flexShrink: 0 }}>
            RM
          </div>
          <div>
            <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 2px" }}>Mécanicien</p>
            <h1 style={{ fontSize: 19, fontWeight: 900, margin: 0 }}>Rachid Mehni</h1>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 12, opacity: 0.85, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <Wrench size={13} /> {atelierReps.length} en atelier
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <CheckCircle2 size={13} /> {pretsReps.length} prêt(s)
          </span>
          {alertesMeca.length > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Bell size={13} /> {alertesMeca.length} alerte(s)
            </span>
          )}
        </div>
      </div>

      {/* Tab nav */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px",
              borderRadius: 12, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer",
              whiteSpace: "nowrap", flexShrink: 0,
              background: tab === t.id ? C.navy : C.gray100,
              color: tab === t.id ? C.white : C.gray600 }}>
            {MTAB_ICONS[t.id]}{" "}{t.label}
            {t.badge != null && t.badge > 0 && (
              <span style={{ background: C.red, color: C.white, borderRadius: 99,
                padding: "1px 7px", fontSize: 11, fontWeight: 800 }}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── TAB ALERTES ───────────────────────────────────────────────────────── */}
      {tab === "alertes" && (
        <div>
          {alertesMeca.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: C.gray400 }}>
              <div style={{ display:"flex",justifyContent:"center",marginBottom:12 }}><Inbox size={48} color={C.gray400} /></div>
              <p style={{ fontWeight: 700, fontSize: 15 }}>Aucune alerte mécanicien</p>
              <p style={{ fontSize: 13 }}>Les incidents transmis par le gestionnaire apparaîtront ici</p>
            </div>
          ) : alertesMeca.map(a => {
            const hasVehicle = !!a.vehicle_id;
            const veh = vehOf(a.vehicle_id || "");
            return (
              <div key={a.id} style={{ background: C.white, borderRadius: 16, padding: 18,
                marginBottom: 12, boxShadow: "0 2px 10px rgba(0,0,0,0.07)",
                borderLeft: `4px solid ${hasVehicle ? C.amber : C.navyL}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                  marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: C.navy }}>
                      {hasVehicle
                        ? (veh?.plaque || a.vehicle_id)
                        : "Message gestionnaire"}
                      {veh && (
                        <span style={{ fontWeight: 400, color: C.gray400, fontSize: 13, marginLeft: 8 }}>
                          {veh.marque} {veh.modele}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>
                      {fmtDateTime(a.created_at)}
                    </div>
                  </div>
                  <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                    background: hasVehicle ? C.amberL : C.skyL,
                    color: hasVehicle ? C.amber : C.navyL }}>
                    {hasVehicle ? "À réceptionner" : "Message"}
                  </span>
                </div>
                <p style={{ fontSize: 14, color: "#1E293B", lineHeight: 1.5, margin: "0 0 14px" }}>
                  {a.message}
                </p>
                {hasVehicle ? (
                  <button onClick={() => {
                    setRecepAlerte(a);
                    setRecepF({ description: "", etat_visuel: "", km: String(veh?.km ?? ""), notes: "" });
                    setRecepPhotos([]);
                  }} style={{ width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
                    background: C.navy, color: C.white, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                    Réceptionner ce véhicule
                  </button>
                ) : (
                  <button onClick={async () => {
                    await sb.from("alertes")
                      .update({ read: true, read_at: new Date().toISOString() })
                      .eq("id", a.id);
                    load();
                  }} style={{ width: "100%", padding: "13px 0", borderRadius: 12,
                    border: `2px solid ${C.navyL}`, background: C.white,
                    color: C.navyL, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                    Marquer comme lu
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── TAB ATELIER ───────────────────────────────────────────────────────── */}
      {tab === "atelier" && (
        <div>
          {/* Bouton réception directe */}
          <button onClick={() => {
            setDirectRecep(true);
            setDirectRecepVehId("");
            setDirectRecepF({ description: "", etat_visuel: "", km: "", notes: "" });
            setDirectRecepErr("");
          }} style={{ width: "100%", marginBottom: 16, padding: "14px 0", borderRadius: 14,
            border: `2px dashed ${C.navyL}`, background: "#F0F7FF", color: C.navyL,
            fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
            + Réceptionner un véhicule directement
          </button>

          {atelierReps.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: C.gray400 }}>
              <div style={{ display:"flex",justifyContent:"center",marginBottom:12 }}><Wrench size={48} color={C.gray400} /></div>
              <p style={{ fontWeight: 700, fontSize: 15 }}>Aucun véhicule en atelier</p>
            </div>
          ) : atelierReps.map(r => {
            type VM = { plaque?: string; marque?: string; modele?: string };
            const vv = r.vehicule as VM | undefined;
            const veh2 = vehOf(r.vehicule_id);
            const isUrgent = r.statut === "en_attente_validation";
            return (
              <div key={r.id} onClick={() => openSuivi(r)}
                style={{ background: isUrgent ? "#FFF5F5" : C.white, borderRadius: 16, padding: 18,
                  marginBottom: 12, cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.07)",
                  borderLeft: `4px solid ${RS[r.statut]?.c ?? C.gray400}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                  marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: C.navy }}>
                      {vv?.plaque || r.vehicule_id}
                      <span style={{ fontWeight: 400, color: C.gray400, fontSize: 13, marginLeft: 8 }}>
                        {vv?.marque} {vv?.modele}
                      </span>
                    </div>
                    <div style={{ marginTop: 5 }}><ChipR s={r.statut} /></div>
                  </div>
                  {r.cout_estime != null && (
                    <div style={{ fontWeight: 800, color: isUrgent ? C.red : C.navy, fontSize: 15 }}>
                      ~{r.cout_estime.toLocaleString("fr-CH")} CHF
                    </div>
                  )}
                </div>
                <p style={{ fontSize: 13, color: "#475569", margin: "0 0 10px", lineHeight: 1.5 }}>
                  {(r.description || "").slice(0, 100)}{(r.description || "").length > 100 ? "…" : ""}
                </p>
                <div style={{ display: "flex", gap: 12, fontSize: 12, color: C.gray400, flexWrap: "wrap" }}>
                  {r.date_reception && <span>Réceptionné {fmtDate(r.date_reception)}</span>}
                  {r.date_debut_reparation && <span>Début {fmtDate(r.date_debut_reparation)}</span>}
                  {veh2?.notes && <span style={{ color: C.amber }}>{veh2.notes.slice(0, 40)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── TAB PRÊTS ─────────────────────────────────────────────────────────── */}
      {tab === "prets" && (
        <div>
          {pretsReps.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: C.gray400 }}>
              <div style={{ display:"flex",justifyContent:"center",marginBottom:12 }}><CheckCircle2 size={48} color={C.gray400} /></div>
              <p style={{ fontWeight: 700, fontSize: 15 }}>Aucun véhicule prêt</p>
            </div>
          ) : pretsReps.map(r => {
            type VM = { plaque?: string; marque?: string; modele?: string };
            const vv = r.vehicule as VM | undefined;
            return (
              <div key={r.id} style={{ background: C.white, borderRadius: 16, padding: 18,
                marginBottom: 12, boxShadow: "0 2px 10px rgba(0,0,0,0.07)",
                borderLeft: "4px solid #7C3AED" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                  marginBottom: 12, gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: C.navy }}>
                      {vv?.plaque || r.vehicule_id}
                      <span style={{ fontWeight: 400, color: C.gray400, fontSize: 13, marginLeft: 8 }}>
                        {vv?.marque} {vv?.modele}
                      </span>
                    </div>
                    <ChipR s="repare" />
                  </div>
                  {r.cout != null && (
                    <div style={{ fontWeight: 800, color: C.green, fontSize: 15 }}>
                      {r.cout.toLocaleString("fr-CH")} CHF
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 12, color: C.gray400, marginBottom: 14, flexWrap: "wrap" }}>
                  {r.date_reception && <span>Réceptionné {fmtDate(r.date_reception)}</span>}
                  {r.date_fin_reparation && <span>Terminé {fmtDate(r.date_fin_reparation)}</span>}
                  {r.date_debut_reparation && r.date_fin_reparation && (
                    <span>{nbJ(r.date_debut_reparation, r.date_fin_reparation)}j</span>
                  )}
                </div>
                <button onClick={() => {
                  setSortieRep(r);
                  setSortieF({ type: "conducteur", condId: "", nom: "", km: "" });
                }} style={{ width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
                  background: C.green, color: C.white, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                  Véhicule sorti — Enregistrer la remise
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── TAB HISTORIQUE ────────────────────────────────────────────────────── */}
      {tab === "historique" && (
        <div>
          {/* Totaux */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 20 }}>
            {[
              { l: "Ce mois", v: totalMois, c: C.navy,   bg: "#EFF6FF" },
              { l: "Cette année", v: totalAn, c: "#7C3AED", bg: "#EDE9FE" },
              { l: "Total", v: totalGlob, c: C.green,  bg: C.greenL },
            ].map(x => (
              <div key={x.l} style={{ background: x.bg, borderRadius: 14, padding: "14px 16px" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: x.c }}>
                  {x.v.toLocaleString("fr-CH")} CHF
                </div>
                <div style={{ fontSize: 11, color: C.gray600, marginTop: 3 }}>{x.l}</div>
              </div>
            ))}
          </div>

          {histReps.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: C.gray400 }}>
              <div style={{ display:"flex",justifyContent:"center",marginBottom:12 }}><BarChart2 size={48} color={C.gray400} /></div>
              <p style={{ fontWeight: 700, fontSize: 15 }}>Aucune réparation clôturée</p>
            </div>
          ) : histReps.map(r => {
            type VM = { plaque?: string; marque?: string; modele?: string };
            const vv = r.vehicule as VM | undefined;
            const duree = r.date_debut_reparation && r.date_fin_reparation
              ? nbJ(r.date_debut_reparation, r.date_fin_reparation) : null;
            const recupPar = r.responsable?.startsWith("sortie|") ? r.responsable.slice(7) : null;
            return (
              <div key={r.id} style={{ background: C.white, borderRadius: 16, padding: 20,
                marginBottom: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
                borderLeft: `4px solid ${C.green}` }}>
                {/* En-tête ticket */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                  marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 17, color: C.navy }}>
                      {vv?.plaque || r.vehicule_id}
                    </div>
                    <div style={{ fontSize: 12, color: C.gray400 }}>{vv?.marque} {vv?.modele}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {r.cout != null
                      ? <div style={{ fontWeight: 900, fontSize: 18, color: C.green }}>{r.cout.toLocaleString("fr-CH")} CHF</div>
                      : r.cout_estime != null
                        ? <div style={{ fontWeight: 700, fontSize: 15, color: C.amber }}>~{r.cout_estime.toLocaleString("fr-CH")} CHF</div>
                        : null}
                  </div>
                </div>

                <p style={{ fontSize: 14, color: "#1E293B", lineHeight: 1.6, margin: "0 0 12px",
                  borderLeft: `3px solid ${C.gray200}`, paddingLeft: 10 }}>
                  {r.description}
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {r.date_reception       && <DL l="Réceptionné"         v={fmtDate(r.date_reception)} />}
                  {r.km_reception != null && <DL l="Km réception"        v={`${r.km_reception.toLocaleString()} km`} />}
                  {r.date_debut_reparation && <DL l="Début réparation"   v={fmtDate(r.date_debut_reparation)} />}
                  {r.date_fin_reparation   && <DL l="Fin réparation"     v={fmtDate(r.date_fin_reparation)} />}
                  {duree != null           && <DL l="Durée"              v={`${duree} jour${duree > 1 ? "s" : ""}`} />}
                  {r.km_sortie != null     && <DL l="Km sortie"          v={`${r.km_sortie.toLocaleString()} km`} />}
                  {r.date_remise_circulation && <DL l="Remis en service" v={fmtDate(r.date_remise_circulation)} />}
                  {recupPar                && <DL l="Récupéré par"       v={recupPar} />}
                </div>

                {r.commentaire_mecanicien && !r.commentaire_mecanicien.startsWith("Photos:") && (
                  <div style={{ background: C.gray50, borderRadius: 10, padding: "10px 12px",
                    marginTop: 10, fontSize: 13, color: C.gray600, fontStyle: "italic" }}>
                    {r.commentaire_mecanicien.split(" | ").filter(s => !s.startsWith("Photos:")).join(" | ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── TAB MESSAGES ─────────────────────────────────────────────────────── */}
      {tab === "messages" && (
        <div>
          {/* Décisions admin reçues */}
          {msgDecisions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 20px", color: C.gray400, marginBottom: 24 }}>
              <div style={{ display:"flex",justifyContent:"center",marginBottom:8 }}><MessageSquare size={36} color={C.gray400} /></div>
              <p style={{ fontWeight: 700, fontSize: 14 }}>Aucune décision en attente</p>
              <p style={{ fontSize: 12 }}>Les validations et refus de l&apos;admin apparaîtront ici</p>
            </div>
          ) : (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: C.gray600, marginBottom: 12 }}>
                Décisions de l&apos;administrateur
              </div>
              {msgDecisions.map(a => {
                const isOk = !a.message.toLowerCase().includes("refus");
                return (
                  <div key={a.id} style={{ background: C.white, borderRadius: 14, padding: 16,
                    marginBottom: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
                    borderLeft: `4px solid ${isOk ? C.green : C.red}` }}>
                    <div style={{ fontWeight: 800, fontSize: 15,
                      color: isOk ? C.green : C.red, marginBottom: 4 }}>
                      {isOk ? "Validation accordée" : "Demande refusée"}
                    </div>
                    <div style={{ fontSize: 12, color: C.gray400, marginBottom: 8 }}>
                      {fmtDateTime(a.created_at)}
                    </div>
                    <p style={{ fontSize: 14, color: "#1E293B", lineHeight: 1.5, margin: "0 0 14px" }}>
                      {a.message}
                    </p>
                    <button onClick={async () => {
                      await sb.from("alertes")
                        .update({ read: true, read_at: new Date().toISOString() }).eq("id", a.id);
                      load();
                    }} style={{ width: "100%", padding: "11px 0", borderRadius: 10,
                      border: `2px solid ${isOk ? C.green : C.gray400}`,
                      background: C.white, color: isOk ? C.green : C.gray600,
                      fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                      Lu
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Envoyer un message */}
          <div style={{ background: C.white, borderRadius: 16, padding: 20,
            boxShadow: "0 2px 10px rgba(0,0,0,0.07)" }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: C.navy, marginBottom: 16 }}>
              Envoyer un message
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700,
                color: C.gray600, marginBottom: 6 }}>
                Destinataire
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["gestionnaire", "admin"] as const).map(t => (
                  <button key={t} onClick={() => setMsgSendTarget(t)}
                    style={{ flex: 1, padding: "10px 0", borderRadius: 10, fontWeight: 700,
                      fontSize: 13, cursor: "pointer", border: "none",
                      background: msgSendTarget === t ? C.navy : C.gray100,
                      color: msgSendTarget === t ? C.white : C.gray600 }}>
                    {t === "gestionnaire" ? "Gestionnaire" : "Admin"}
                  </button>
                ))}
              </div>
            </div>
            <TA label="Message *" value={msgSendText}
              onChange={v => setMsgSendText(v)}
              rows={4} placeholder="Votre message…" />
            <BigBtn label={msgSending ? "Envoi…" : "Envoyer le message"}
              onClick={async () => {
                if (!msgSendText.trim()) return;
                setMsgSending(true);
                await sb.from("alertes").insert({
                  type: msgSendTarget === "admin" ? "msg_meca_admin" : "msg_meca_gest",
                  severity: "normale",
                  message: `Message du mécanicien : ${msgSendText.trim()}`,
                  read: false,
                });
                setMsgSendText("");
                setMsgSending(false);
              }}
              disabled={msgSending || !msgSendText.trim()}
              color={C.navy} />
          </div>
        </div>
      )}

      {/* ── SHEET : Réception ─────────────────────────────────────────────────── */}
      {recepAlerte && (
        <Sheet title={`Réceptionner — ${vehOf(recepAlerte.vehicle_id || "")?.plaque || "Véhicule"}`}
          onClose={() => setRecepAlerte(null)}>
          <div style={{ background: C.amberL, borderRadius: 12, padding: 12, marginBottom: 16,
            fontSize: 13, color: C.amber, lineHeight: 1.5 }}>
            {recepAlerte.message}
          </div>
          <F label="Description du problème *" value={recepF.description}
            onChange={v => setRecepF(p => ({ ...p, description: v }))}
            placeholder="Ex: Voyant moteur, bruit suspect, panne…" required />
          <F label="État à l'arrivée" value={recepF.etat_visuel}
            onChange={v => setRecepF(p => ({ ...p, etat_visuel: v }))}
            placeholder="Ex: Carrosserie OK, pneus usés…" />
          <F label="Kilométrage" type="number" value={recepF.km}
            onChange={v => setRecepF(p => ({ ...p, km: v }))}
            placeholder="Ex: 125000" />
          <TA label="Notes mécanicien" value={recepF.notes}
            onChange={v => setRecepF(p => ({ ...p, notes: v }))}
            placeholder="Observations initiales…" />
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.gray600, marginBottom: 6 }}>
              Photos (optionnel)
            </label>
            <input type="file" accept="image/*" multiple
              onChange={e => setRecepPhotos(Array.from(e.target.files || []))}
              style={{ fontSize: 13, color: C.gray600 }} />
            {recepPhotos.length > 0 && (
              <div style={{ fontSize: 12, color: C.green, marginTop: 4 }}>
                {recepPhotos.length} photo(s) sélectionnée(s)
              </div>
            )}
          </div>
          {recepErr && (
            <div style={{ background: C.redL, color: C.red, borderRadius: 10,
              padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>
              Erreur : {recepErr}
            </div>
          )}
          <BigBtn icon={<Wrench size={16} />} label={recepBusy ? "Enregistrement…" : "Réceptionner et mettre en atelier"}
            onClick={doReceptionner} disabled={recepBusy || !recepF.description.trim()} color={C.navy} />
        </Sheet>
      )}

      {/* ── SHEET : Réception directe ──────────────────────────────────────────── */}
      {directRecep && (
        <Sheet title="Réceptionner un véhicule" onClose={() => setDirectRecep(false)}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.gray600, marginBottom: 6 }}>
              Véhicule *
            </label>
            <select value={directRecepVehId}
              onChange={e => {
                const v = vehicules.find(x => x.id === e.target.value);
                setDirectRecepVehId(e.target.value);
                setDirectRecepF(p => ({ ...p, km: String(v?.km ?? "") }));
              }}
              style={{ ...inp, appearance: "none" } as React.CSSProperties}>
              <option value="">— Sélectionner un véhicule —</option>
              {vehicules.map(v => (
                <option key={v.id} value={v.id}>{v.plaque} · {v.marque} {v.modele}</option>
              ))}
            </select>
          </div>
          <F label="Description du problème *" value={directRecepF.description}
            onChange={v => setDirectRecepF(p => ({ ...p, description: v }))}
            placeholder="Ex: Voyant moteur, bruit suspect, panne…" required />
          <F label="État à l'arrivée" value={directRecepF.etat_visuel}
            onChange={v => setDirectRecepF(p => ({ ...p, etat_visuel: v }))}
            placeholder="Ex: Carrosserie OK, pneus usés…" />
          <F label="Kilométrage" type="number" value={directRecepF.km}
            onChange={v => setDirectRecepF(p => ({ ...p, km: v }))}
            placeholder="Ex: 125000" />
          <TA label="Notes mécanicien" value={directRecepF.notes}
            onChange={v => setDirectRecepF(p => ({ ...p, notes: v }))}
            placeholder="Observations initiales…" />
          {directRecepErr && (
            <div style={{ background: C.redL, color: C.red, borderRadius: 10,
              padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>
              Erreur : {directRecepErr}
            </div>
          )}
          <BigBtn icon={<Wrench size={16} />}
            label={directRecepBusy ? "Enregistrement…" : "Réceptionner et mettre en atelier"}
            onClick={doReceptionnerDirect}
            disabled={directRecepBusy || !directRecepVehId || !directRecepF.description.trim()}
            color={C.navy} />
        </Sheet>
      )}

      {/* ── SHEET : Suivi atelier ─────────────────────────────────────────────── */}
      {suiviRep && (() => {
        type VM = { plaque?: string; marque?: string; modele?: string };
        const vv = suiviRep.vehicule as VM | undefined;
        const STATUTS = [
          { v: "en_reparation",         l: "En réparation",      c: C.navy   },
          { v: "en_attente_piece",       l: "Attente de pièce",   c: C.amber  },
          { v: "en_attente_validation",  l: "Attente validation", c: C.red    },
        ];
        return (
          <Sheet title={`Suivi — ${vv?.plaque || suiviRep.vehicule_id}`}
            onClose={() => setSuiviRep(null)}>
            <div style={{ marginBottom: 8 }}><ChipR s={suiviRep.statut} /></div>
            <p style={{ fontSize: 13, color: C.gray600, marginBottom: 16, lineHeight: 1.5 }}>
              {suiviRep.description}
            </p>

            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.gray600, marginBottom: 8 }}>
              Statut
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {STATUTS.map(s => (
                <button key={s.v} onClick={() => setSuiviF(p => ({ ...p, statut: s.v }))}
                  style={{ padding: "9px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700,
                    cursor: "pointer",
                    border: `2px solid ${suiviF.statut === s.v ? s.c : C.gray200}`,
                    background: suiviF.statut === s.v ? s.c : C.white,
                    color: suiviF.statut === s.v ? C.white : C.gray600 }}>
                  {s.l}
                </button>
              ))}
            </div>

            {suiviF.statut === "en_attente_piece" && (
              <div style={{ background: C.amberL, borderRadius: 10, padding: 12, marginBottom: 16,
                fontSize: 13, color: C.amber }}>
                Saisir la pièce commandée dans les notes ci-dessous.
              </div>
            )}

            <F label="Montant estimé (CHF)" type="number" value={suiviF.cout}
              onChange={v => setSuiviF(p => ({ ...p, cout: v }))}
              placeholder="Ex: 450" />
            {suiviF.cout && +suiviF.cout > BUDGET_SEUIL && (
              <div style={{ background: C.redL, borderRadius: 10, padding: 12, marginBottom: 16,
                fontSize: 13, color: C.red, fontWeight: 700 }}>
                Montant &gt; {BUDGET_SEUIL} CHF — statut automatique "En attente de validation"
              </div>
            )}
            <TA label="Notes mécanicien" value={suiviF.notes}
              onChange={v => setSuiviF(p => ({ ...p, notes: v }))}
              placeholder="Détail intervention, pièces, observations…" />
            <TA label="Remarques véhicule (visible gestionnaire)" value={suiviF.remarques}
              onChange={v => setSuiviF(p => ({ ...p, remarques: v }))}
              placeholder="Ex: Batterie à changer sous 2 semaines, CT avant 15/07…" />

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.gray600, marginBottom: 6 }}>
                Photos supplémentaires
              </label>
              <input type="file" accept="image/*" multiple
                onChange={e => setSuiviPhotos(Array.from(e.target.files || []))}
                style={{ fontSize: 13, color: C.gray600 }} />
              {suiviPhotos.length > 0 && (
                <div style={{ fontSize: 12, color: C.green, marginTop: 4 }}>
                  {suiviPhotos.length} photo(s) sélectionnée(s)
                </div>
              )}
            </div>

            <BigBtn icon={<Save size={16} />} label={suiviBusy ? "Enregistrement…" : "Enregistrer le suivi"}
              onClick={doSauvegarderSuivi} disabled={suiviBusy} color={C.navyL} />
            <BigBtn icon={<CheckCircle2 size={16} />} label={suiviBusy ? "Traitement…" : "Réparation terminée → Prêts"}
              onClick={doTerminer} disabled={suiviBusy} color={C.green} />
            <button onClick={() => { setSuiviRep(null); openVe(vehOf(suiviRep.vehicule_id)!); }}
              style={{ width: "100%", padding: "10px 0", borderRadius: 10, border: `1px solid ${C.gray200}`,
                background: C.white, color: C.gray600, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              <span style={{display:"flex",alignItems:"center",gap:6}}><FileText size={14} /> Voir fiche véhicule</span>
            </button>
          </Sheet>
        );
      })()}

      {/* ── SHEET : Sortie ────────────────────────────────────────────────────── */}
      {sortieRep && (() => {
        type VM = { plaque?: string; marque?: string; modele?: string };
        const vv = sortieRep.vehicule as VM | undefined;
        return (
          <Sheet title={`Sortie — ${vv?.plaque || sortieRep.vehicule_id}`}
            onClose={() => setSortieRep(null)}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.gray600, marginBottom: 8 }}>
                Qui récupère le véhicule ?
              </label>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {[{ v: "conducteur", l: "Conducteur de la liste" }, { v: "autre", l: "Autre / Libre" }].map(t => (
                  <button key={t.v} onClick={() => setSortieF(p => ({ ...p, type: t.v, condId: "", nom: "" }))}
                    style={{ flex: 1, padding: "10px 0", borderRadius: 10, fontSize: 13, fontWeight: 700,
                      cursor: "pointer", border: `2px solid ${sortieF.type === t.v ? C.navy : C.gray200}`,
                      background: sortieF.type === t.v ? C.skyL : C.white,
                      color: sortieF.type === t.v ? C.navy : C.gray600 }}>
                    {t.l}
                  </button>
                ))}
              </div>
              {sortieF.type === "conducteur" ? (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.gray600, marginBottom: 6 }}>
                    Conducteur
                  </label>
                  <select value={sortieF.condId}
                    onChange={e => setSortieF(p => ({ ...p, condId: e.target.value }))}
                    style={{ ...inp, appearance: "none" } as React.CSSProperties}>
                    <option value="">— Sélectionner —</option>
                    {conducteurs.map(c => (
                      <option key={c.id} value={String(c.id)}>{c.prenom} {c.nom}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <F label="Nom / Prénom" value={sortieF.nom}
                  onChange={v => setSortieF(p => ({ ...p, nom: v }))}
                  placeholder="Ex: Jean Dupont, Garage Michaud…" />
              )}
            </div>
            <F label="Kilométrage sortie" type="number" value={sortieF.km}
              onChange={v => setSortieF(p => ({ ...p, km: v }))}
              placeholder="Ex: 127500" />
            <BigBtn icon={<Bus size={16} />} label={sortieBusy ? "Enregistrement…" : "Valider la sortie → Historique"}
              onClick={doSortie}
              disabled={sortieBusy || (sortieF.type === "conducteur" ? !sortieF.condId : !sortieF.nom.trim())}
              color={C.green} />
          </Sheet>
        );
      })()}

      {/* ── SHEET : Fiche véhicule ────────────────────────────────────────────── */}
      {veSheet && (
        <Sheet title={`Fiche — ${veSheet.plaque}`} onClose={() => setVeSheet(null)}>
          <div style={{ marginBottom: 14 }}>
            <DL l="Marque / Modèle" v={`${veSheet.marque} ${veSheet.modele}`} />
            <DL l="Places" v={String(veSheet.places ?? "—")} />
            {veSheet.ct_date && <DL l="Contrôle technique" v={veSheet.ct_date} />}
          </div>
          <F label="Kilométrage" type="number" value={veF.km}
            onChange={v => setVeF(p => ({ ...p, km: v }))} />
          <F label="Date CT (MM.AAAA)" value={veF.ct_date}
            onChange={v => setVeF(p => ({ ...p, ct_date: v }))} placeholder="Ex: 04.2026" />
          <F label="Dernière vidange" value={veF.date_vidange}
            onChange={v => setVeF(p => ({ ...p, date_vidange: v }))} placeholder="AAAA-MM-JJ" />
          <TA label="Remarques véhicule" value={veF.notes}
            onChange={v => setVeF(p => ({ ...p, notes: v }))}
            placeholder="CT à faire, batterie à changer, pneus usés…" />
          {saveErr && (
            <div style={{ background: C.redL, color: C.red, borderRadius: 8,
              padding: "10px 14px", fontSize: 13, marginBottom: 10 }}>{saveErr}</div>
          )}
          <BigBtn icon={<Save size={16} />} label="Enregistrer" onClick={doVeSave} />
        </Sheet>
      )}

    </div>
  );
}
