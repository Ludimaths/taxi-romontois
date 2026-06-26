"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Bus, Users, Wrench, AlertTriangle, LayoutDashboard,
  Download, LogOut, BarChart2, CheckCircle2, CalendarDays, MessageSquare,
  History, QrCode, Settings, Menu, X,
} from "lucide-react";
import MessagerieBox from "@/components/MessagerieBox";
import { createClient } from "@/lib/supabase/client";
import { C, fmtDate, fmtDateTime, isoToday } from "@/lib/constants";
import type { Conducteur, Vehicule, Incident, Reparation, AbsenceConducteur, Alerte, CongesDemande } from "@/lib/types";

type AdminTab = "dashboard" | "stats" | "validation" | "historique" | "messages";
type Period   = "week" | "month" | "annee";

const inp: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 10,
  border: `1.5px solid ${C.gray200}`, fontSize: 14, color: C.gray800,
  background: C.white, boxSizing: "border-box",
};

function addDays(iso: string, n: number) {
  const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10);
}
function monthKey(iso: string) { return iso.slice(0, 7); }
function groupByDay<T extends { created_at: string }>(items: T[]): { day: string; label: string; items: T[] }[] {
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const map: Record<string, T[]> = {};
  items.forEach(m => { const d = m.created_at.slice(0, 10); if (!map[d]) map[d] = []; map[d].push(m); });
  return Object.entries(map).sort(([a], [b]) => b.localeCompare(a)).map(([day, its]) => {
    const d = new Date(day + "T00:00:00");
    let label = day;
    if (d.getTime() === today.getTime()) label = "Aujourd'hui";
    else if (d.getTime() === yesterday.getTime()) label = "Hier";
    else label = d.toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return { day, label, items: its.slice().sort((x, y) => y.created_at.localeCompare(x.created_at)) };
  });
}
function currentSchoolYear() {
  const m = new Date().getMonth();
  return m >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1;
}

export default function AdminPage() {
  const sb     = createClient();
  const router = useRouter();

  const [tab,    setTab]    = useState<AdminTab>("dashboard");
  const [period, setPeriod] = useState<Period>("month");
  const [loading, setLoading] = useState(true);
  const [logoErr, setLogoErr] = useState(false);

  // Mobile responsive
  const [isMobile,   setIsMobile]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Seuil budget configurable
  const [seuil,       setSeuil]       = useState<number | null>(null);
  const [seuilEdit,   setSeuilEdit]   = useState(false);
  const [seuilInput,  setSeuilInput]  = useState("1000");
  const [seuilSaving, setSeuilSaving] = useState(false);

  const [conducteurs,  setConducteurs]  = useState<Conducteur[]>([]);
  const [vehicules,    setVehicules]    = useState<Vehicule[]>([]);
  const [incidents,    setIncidents]    = useState<Incident[]>([]);
  const [reparations,  setReparations]  = useState<Reparation[]>([]);
  const [absencesCond, setAbsencesCond] = useState<AbsenceConducteur[]>([]);

  const [refusOpen,  setRefusOpen]  = useState<number | null>(null);
  const [refusMotif, setRefusMotif] = useState("");
  const [valBusy,    setValBusy]    = useState(false);
  const [adminMsgs,  setAdminMsgs]  = useState<Alerte[]>([]);
  const [msgExpandedDays,  setMsgExpandedDays]  = useState<Record<string, boolean>>({});
  const [histValExpanded, setHistValExpanded] = useState<Record<string, boolean>>({});

  const [congesAdmin,          setCongesAdmin]          = useState<CongesDemande[]>([]);
  const [congeAdminRefusId,    setCongeAdminRefusId]    = useState<number | null>(null);
  const [congeAdminRefusMotif, setCongeAdminRefusMotif] = useState("");
  const [congeAdminBusy,       setCongeAdminBusy]       = useState(false);

  const [histYear,  setHistYear]  = useState(currentSchoolYear());
  const [histMonth, setHistMonth] = useState<number | null>(null);
  const [histDay,   setHistDay]   = useState<string | null>(null);

  // Détection mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Chargement seuil budget depuis parametres
  useEffect(() => {
    sb.from("parametres").select("valeur").eq("cle", "seuil_validation").maybeSingle()
      .then(({ data }) => {
        if (data?.valeur) {
          const v = parseInt(data.valeur as string, 10);
          if (!isNaN(v)) { setSeuil(v); setSeuilInput(String(v)); }
          else { setSeuil(1000); setSeuilInput("1000"); }
        } else {
          // Insérer la valeur par défaut si absente
          sb.from("parametres").upsert({ cle: "seuil_validation", valeur: "1000" }, { onConflict: "cle" });
          setSeuil(1000);
          setSeuilInput("1000");
        }
      });
  }, [sb]);

  const load = useCallback(async () => {
    const yearAgo = addDays(isoToday(), -365);
    const [c, v, inc, rep, abs, msgs, cng] = await Promise.all([
      sb.from("conducteurs").select("*").order("nom"),
      sb.from("vehicules").select("*").order("plaque"),
      sb.from("incidents").select("*,vehicule:vehicules(id,plaque),conducteur:conducteurs(prenom,nom)")
        .gte("reported_at", yearAgo).order("reported_at", { ascending: false }),
      sb.from("reparations").select("*,vehicule:vehicules(id,plaque,marque,modele)")
        .gte("created_at", yearAgo).order("created_at", { ascending: false }),
      sb.from("absences_conducteurs")
        .select("*,conducteur:conducteurs!conducteur_id(prenom,nom)")
        .gte("date_absence", yearAgo).order("date_absence", { ascending: false }),
      sb.from("alertes").select("*").eq("type", "msg_meca_admin")
        .order("created_at", { ascending: false }).limit(50),
      sb.from("conges_demandes")
        .select("*,conducteur:conducteurs!conducteur_id(prenom,nom)")
        .eq("statut", "transmis_admin").order("created_at", { ascending: false }),
    ]);
    setConducteurs(c.data ?? []);
    setVehicules(v.data ?? []);
    setIncidents(inc.data ?? []);
    setReparations(rep.data ?? []);
    setAbsencesCond(abs.data ?? []);
    setAdminMsgs(msgs.data ?? []);
    setCongesAdmin(cng.data ?? []);
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    load();
    const ch = sb.channel("admin-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "conducteurs" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicules" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "reparations" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "absences_conducteurs" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "conges_demandes" }, load)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [load, sb]);

  async function handleSignOut() {
    await sb.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function saveSeuil() {
    setSeuilSaving(true);
    const v = parseInt(seuilInput, 10);
    if (!isNaN(v) && v > 0) {
      await sb.from("parametres").upsert({ cle: "seuil_validation", valeur: String(v) }, { onConflict: "cle" });
      setSeuil(v);
    }
    setSeuilEdit(false);
    setSeuilSaving(false);
  }

  async function doAccepterConge(conge: CongesDemande) {
    setCongeAdminBusy(true);
    const cond = conge.conducteur as { prenom?: string; nom?: string } | undefined;
    await sb.from("conges_demandes").update({ statut: "accepte", updated_at: new Date().toISOString() }).eq("id", conge.id);
    await sb.from("alertes").insert([
      { type: "conducteur", severity: "normale", driver_id: conge.conducteur_id, read: false,
        message: `Direction : votre congé du ${fmtDate(conge.date_debut)} au ${fmtDate(conge.date_fin)} (${conge.motif}) a été approuvé.` },
      { type: "conducteur", severity: "normale", read: false,
        message: `Direction : congé de ${cond?.prenom} ${cond?.nom} approuvé — du ${fmtDate(conge.date_debut)} au ${fmtDate(conge.date_fin)}` },
    ]);
    await load(); setCongeAdminBusy(false);
  }

  async function doRefuserConge(conge: CongesDemande) {
    if (!congeAdminRefusMotif.trim()) return;
    setCongeAdminBusy(true);
    const cond = conge.conducteur as { prenom?: string; nom?: string } | undefined;
    await sb.from("conges_demandes").update({ statut: "refuse", motif_refus: congeAdminRefusMotif.trim(), updated_at: new Date().toISOString() }).eq("id", conge.id);
    await sb.from("alertes").insert([
      { type: "conducteur", severity: "haute", driver_id: conge.conducteur_id, read: false,
        message: `Direction : votre demande de congé du ${fmtDate(conge.date_debut)} au ${fmtDate(conge.date_fin)} a été refusée. Motif : ${congeAdminRefusMotif.trim()}` },
      { type: "conducteur", severity: "normale", read: false,
        message: `Direction : congé de ${cond?.prenom} ${cond?.nom} refusé — du ${fmtDate(conge.date_debut)} au ${fmtDate(conge.date_fin)}` },
    ]);
    setCongeAdminRefusId(null); setCongeAdminRefusMotif("");
    await load(); setCongeAdminBusy(false);
  }

  function periodStart(): string {
    const today = isoToday();
    if (period === "week")  return addDays(today, -7);
    if (period === "month") return `${today.slice(0, 7)}-01`;
    return `${currentSchoolYear()}-09-01`;
  }
  const filteredIncidents   = incidents.filter(i => i.reported_at.slice(0, 10) >= periodStart());
  const filteredReparations = reparations.filter(r => (r.date_reception || r.created_at.slice(0, 10)) >= periodStart());
  const filteredAbsences    = absencesCond.filter(a => a.date_absence >= periodStart());

  const vEnService  = vehicules.filter(v => ["bon","en_service"].includes(v.etat as string)).length;
  const cPresents   = conducteurs.filter(d => ["en_service","disponible"].includes(d.status)).length;
  const incOuverts  = incidents.filter(i => i.status !== "resolu").length;
  const repAValider = reparations.filter(r => r.statut === "en_attente_validation");
  const unreadMsgCount = adminMsgs.filter(m => !m.read).length;

  // ── Données graphiques ──────────────────────────────────────────────────────
  const absencesByWeek = (() => {
    const result: { week: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const monday = addDays(isoToday(), -i * 7 - new Date().getDay() + 1);
      const friday = addDays(monday, 4);
      const count  = filteredAbsences.filter(a => a.date_absence >= monday && a.date_absence <= friday).length;
      result.push({ week: monday.slice(5), count });
    }
    return result;
  })();

  const repCostByMonth = (() => {
    const map: Record<string, number> = {};
    filteredReparations.forEach(r => {
      const mk = monthKey(r.date_reception || r.created_at.slice(0, 10));
      map[mk] = (map[mk] ?? 0) + (r.cout ?? r.cout_estime ?? 0);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => ({ month: month.slice(5), total: Math.round(total) }));
  })();

  const vehRank = (() => {
    const map: Record<string, { plaque: string; total: number }> = {};
    reparations.forEach(r => {
      const vv = r.vehicule as { plaque?: string } | undefined;
      if (!map[r.vehicule_id]) map[r.vehicule_id] = { plaque: vv?.plaque || r.vehicule_id, total: 0 };
      map[r.vehicule_id].total += r.cout ?? r.cout_estime ?? 0;
    });
    return Object.entries(map).map(([id, x]) => ({ id, ...x }))
      .sort((a, b) => b.total - a.total).slice(0, 4);
  })();
  const maxVehCost = vehRank[0]?.total || 1;
  const vehBarColors = ["#DC2626", "#D97706", "#2563EB", "#94A3B8"];

  const incByType = (() => {
    const map: Record<string, number> = {};
    filteredIncidents.forEach(i => { map[i.type] = (map[i.type] ?? 0) + 1; });
    return Object.entries(map).sort(([, a], [, b]) => b - a);
  })();
  const maxIncType = incByType[0]?.[1] || 1;
  const totalIncType = incByType.reduce((s, [, v]) => s + v, 0);

  const totalAbsences    = filteredAbsences.length;
  const totalRemplace    = filteredAbsences.filter(a => a.status === "couvert").length;
  const totalNonCouvert  = filteredAbsences.filter(a => a.status === "non_couvert").length;
  const today2 = isoToday().slice(0, 7);
  const coutCeMois  = filteredReparations.filter(r => (r.date_reception || r.created_at.slice(0,10)).slice(0,7) === today2)
    .reduce((s, r) => s + (r.cout ?? r.cout_estime ?? 0), 0);
  const coutAnnee   = filteredReparations.reduce((s, r) => s + (r.cout ?? r.cout_estime ?? 0), 0);

  // ── Historique helpers ──────────────────────────────────────────────────────
  const MONTHS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const SY_START  = currentSchoolYear();

  function histDayData(day: string) {
    return {
      incidents:   incidents.filter(i => i.reported_at.slice(0, 10) === day),
      absences:    absencesCond.filter(a => a.date_absence === day),
      reparations: reparations.filter(r => (r.date_reception || r.created_at.slice(0, 10)) === day),
    };
  }
  function histMonthData(year: number, month: number) {
    const mk = `${year}-${String(month).padStart(2, "0")}`;
    const mRep = reparations.filter(r => (r.date_reception || r.created_at.slice(0, 10)).slice(0, 7) === mk);
    return {
      incidents:   incidents.filter(i => i.reported_at.slice(0, 7) === mk).length,
      absences:    absencesCond.filter(a => a.date_absence.slice(0, 7) === mk).length,
      reparations: mRep.length,
      cout:        mRep.reduce((s, r) => s + (r.cout ?? r.cout_estime ?? 0), 0),
    };
  }
  function exportCSV(year: number, month: number) {
    const pad = String(month).padStart(2, "0");
    const mk = `${year}-${pad}`;
    const days = new Date(year, month, 0).getDate();
    const rows = [["Jour","Incidents","Absences","Réparations"]];
    for (let d = 1; d <= days; d++) {
      const day = `${mk}-${String(d).padStart(2, "0")}`;
      const { incidents: di, absences: da, reparations: dr } = histDayData(day);
      rows.push([day, String(di.length), String(da.length), String(dr.length)]);
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + rows.map(r => r.join(";")).join("\n")], { type: "text/csv;charset=utf-8;" }));
    a.download = `historique-${mk}.csv`; a.click();
  }

  async function doValider(rep: Reparation) {
    setValBusy(true);
    const vv = rep.vehicule as { plaque?: string } | undefined;
    const plaque = vv?.plaque || rep.vehicule_id;
    await sb.from("reparations").update({ statut: "en_reparation" }).eq("id", rep.id);
    await sb.from("alertes").insert([
      { type: "reparation", severity: "normale", read: false, vehicle_id: rep.vehicule_id,
        message: `Réparation validée — ${plaque} (${(rep.cout_estime ?? 0).toLocaleString("fr-CH")} CHF)` },
      { type: "decision_admin", severity: "normale", read: false, vehicle_id: rep.vehicule_id,
        message: `Admin a validé la réparation de ${plaque} — ${(rep.cout_estime ?? 0).toLocaleString("fr-CH")} CHF. Vous pouvez continuer.` },
    ]);
    setValBusy(false); load();
  }

  async function doRefuser(rep: Reparation) {
    if (!refusMotif.trim()) return;
    setValBusy(true);
    const vv = rep.vehicule as { plaque?: string } | undefined;
    const plaque = vv?.plaque || rep.vehicule_id;
    await sb.from("reparations").update({ statut: "receptionne",
      commentaire_mecanicien: `[Refusé par admin: ${refusMotif.trim()}]` }).eq("id", rep.id);
    await sb.from("alertes").insert([
      { type: "reparation", severity: "haute", read: false, vehicle_id: rep.vehicule_id,
        message: `Réparation refusée — ${plaque} : ${refusMotif.trim()}` },
      { type: "decision_admin", severity: "haute", read: false, vehicle_id: rep.vehicule_id,
        message: `Admin a refusé la réparation de ${plaque} — Motif : ${refusMotif.trim()}` },
    ]);
    setRefusOpen(null); setRefusMotif(""); setValBusy(false); load();
  }

  function printFiche(rep: Reparation) {
    const vv = rep.vehicule as { plaque?: string; marque?: string; modele?: string } | undefined;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fiche réparation</title>
<style>body{font-family:sans-serif;padding:32px;max-width:700px;margin:auto}h1{color:#0D3B7A;border-bottom:2px solid #0D3B7A;padding-bottom:8px}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee}.label{color:#475569;font-weight:600}.value{font-weight:700;color:#1E293B}footer{margin-top:32px;font-size:11px;color:#94A3B8}</style></head>
<body><h1>Fiche réparation — ${vv?.plaque || rep.vehicule_id}</h1>
<div class="row"><span class="label">Véhicule</span><span class="value">${vv?.marque || ""} ${vv?.modele || ""} · ${vv?.plaque || rep.vehicule_id}</span></div>
<div class="row"><span class="label">Description</span><span class="value">${rep.description}</span></div>
<div class="row"><span class="label">Coût estimé</span><span class="value" style="color:#DC2626;font-size:20px">${(rep.cout_estime ?? 0).toLocaleString("fr-CH")} CHF</span></div>
${rep.date_reception ? `<div class="row"><span class="label">Date réception</span><span class="value">${fmtDate(rep.date_reception)}</span></div>` : ""}
${rep.commentaire_mecanicien ? `<div class="row"><span class="label">Notes mécanicien</span><span class="value">${rep.commentaire_mecanicien}</span></div>` : ""}
<div class="row"><span class="label">Créé le</span><span class="value">${fmtDateTime(rep.created_at)}</span></div>
<footer>Taxi Romontois · ${new Date().toLocaleDateString("fr-CH")} à ${new Date().toLocaleTimeString("fr-CH",{hour:"2-digit",minute:"2-digit"})}</footer>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300); }
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", background: "#F7F8FC", color: C.gray400, fontSize: 14 }}>
      Chargement…
    </div>
  );

  // ── Navigation items ────────────────────────────────────────────────────────
  const NAV_ITEMS: { id: AdminTab; icon: React.ReactNode; label: string; badge?: number }[] = [
    { id: "dashboard",  icon: <LayoutDashboard size={16} />, label: "Tableau de bord" },
    { id: "stats",      icon: <BarChart2 size={16} />,       label: "Statistiques" },
    { id: "validation", icon: <CheckCircle2 size={16} />,    label: "Validations",
      badge: repAValider.length + congesAdmin.length },
    { id: "historique", icon: <History size={16} />,         label: "Historique" },
    { id: "messages",   icon: <MessageSquare size={16} />,   label: "Messages",
      badge: unreadMsgCount || undefined },
  ];

  // ── Accès rapide ────────────────────────────────────────────────────────────
  const QUICK_ACCESS = [
    { icon: Bus,             color: "#1565C0", label: "Flotte",       sub: "24 véhicules",  path: "/gestionnaire/vehicules"  },
    { icon: Users,           color: "#16A34A", label: "Conducteurs",  sub: "53 actifs",     path: "/gestionnaire/conducteurs"},
    { icon: Wrench,          color: "#D97706", label: "Réparations",  sub: "Atelier",       path: "/gestionnaire/reparations"},
    { icon: AlertTriangle,   color: "#DC2626", label: "Incidents",    sub: "Signalements",  path: "/gestionnaire/incidents"  },
    { icon: QrCode,          color: "#7C3AED", label: "QR Codes",     sub: "Véhicules",     path: "/admin/qrcodes"           },
    { icon: LayoutDashboard, color: "#0D3B7A", label: "Gestionnaire", sub: "Dashboard",     path: "/gestionnaire"            },
    { icon: Settings,        color: "#EA580C", label: "Mécanicien",   sub: "Atelier",       path: "/mecanicien"              },
    { icon: Download,        color: "#16A34A", label: "Exports",      sub: "CSV / PDF",     path: "/gestionnaire/export"     },
  ];

  // ── Sidebar content (shared desktop + mobile drawer) ───────────────────────
  function renderNav() {
    return (
      <>
        {/* Logo + titre */}
        <div style={{ padding: "20px 16px 14px", borderBottom: "1px solid rgba(255,255,255,0.1)",
          position: "relative" }}>
          {isMobile && (
            <button onClick={() => setMobileOpen(false)}
              style={{ position: "absolute", top: 12, right: 12, background: "transparent",
                border: "none", color: C.white, cursor: "pointer", padding: 4 }}>
              <X size={18} />
            </button>
          )}
          {logoErr
            ? <div style={{ color: C.white, fontWeight: 900, fontSize: 15 }}>Taxi Romontois</div>
            : <img src="/logo.png" alt="Taxi Romontois"
                style={{ width: 130, height: "auto", objectFit: "contain", display: "block" }}
                onError={() => setLogoErr(true)} />}
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, marginTop: 8, letterSpacing: 0.3 }}>
            Administration
          </div>
        </div>

        {/* Avatar */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.1)",
          display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#1565C0",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: C.white, fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
            AA
          </div>
          <div>
            <div style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>Administrateur</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Accès complet</div>
          </div>
        </div>

        {/* Navigation */}
        <div style={{ padding: "14px 10px 0", flex: 1, overflowY: "auto" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)",
            textTransform: "uppercase", letterSpacing: 1, padding: "0 8px", marginBottom: 6 }}>
            Navigation
          </div>
          {NAV_ITEMS.map(item => {
            const active = tab === item.id;
            return (
              <button key={item.id}
                onClick={() => { setTab(item.id); if (isMobile) setMobileOpen(false); }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 9,
                  padding: "9px 10px", borderRadius: 7, border: "none", cursor: "pointer",
                  background: active ? "rgba(255,255,255,0.12)" : "transparent",
                  color: C.white, fontWeight: 500, fontSize: 13, textAlign: "left",
                  marginBottom: 2, transition: "background .12s" }}>
                {item.icon}
                <span style={{ flex: 1 }}>{item.label}</span>
                {!!item.badge && item.badge > 0 && (
                  <span style={{ background: C.red, color: C.white, borderRadius: 20,
                    fontSize: 10, fontWeight: 800, padding: "1px 6px" }}>{item.badge}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: "10px 10px 14px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <button onClick={handleSignOut}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            style={{ width: "100%", background: "transparent", border: "none", color: C.white,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
              padding: "10px 10px", borderRadius: 7, fontWeight: 500, fontSize: 13,
              transition: "background .12s" }}>
            <LogOut size={15} /> Déconnexion
          </button>
        </div>
      </>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#F7F8FC" }}>

      {/* ── Overlay mobile ─────────────────────────────────────────────────── */}
      {isMobile && mobileOpen && (
        <div onClick={() => setMobileOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.45)" }} />
      )}

      {/* ── Sidebar desktop / Drawer mobile ──────────────────────────────── */}
      <aside style={{
        width: 260, background: C.navy, display: "flex", flexDirection: "column",
        overflow: "hidden",
        ...(isMobile ? {
          position: "fixed", top: 0, right: 0, height: "100vh", zIndex: 500,
          transform: mobileOpen ? "translateX(0)" : "translateX(260px)",
          transition: "transform .25s ease",
        } : {
          position: "sticky", top: 0, height: "100vh", flexShrink: 0,
        }),
      }}>
        {renderNav()}
      </aside>

      {/* ── Contenu principal ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto",
        ...(isMobile ? { width: "100%" } : { maxHeight: "100vh" }) }}>

        {/* Header mobile fixe */}
        {isMobile && (
          <div style={{ position: "sticky", top: 0, zIndex: 300, background: C.navy,
            height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.2)", flexShrink: 0 }}>
            {logoErr
              ? <div style={{ color: C.white, fontWeight: 900, fontSize: 15 }}>Taxi Romontois</div>
              : <img src="/logo.png" alt="Taxi Romontois"
                  style={{ height: 28, width: "auto", objectFit: "contain" }}
                  onError={() => setLogoErr(true)} />}
            <button onClick={() => setMobileOpen(true)}
              style={{ background: "transparent", border: "none", color: C.white,
                cursor: "pointer", padding: 6, display: "flex", alignItems: "center" }}>
              <Menu size={24} />
            </button>
          </div>
        )}

        <div style={{ maxWidth: 1080, margin: "0 auto",
          padding: isMobile ? "16px 12px" : "24px 20px" }}>

          {/* ══ TABLEAU DE BORD ═════════════════════════════════════════════ */}
          {tab === "dashboard" && (
            <div>
              {/* 4 KPI — 2×2 sur mobile */}
              <div style={{ display: "grid",
                gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)",
                gap: 8, marginBottom: 20 }}>
                {[
                  { label: "Véhicules en service", value: vEnService,         color: "#1565C0" },
                  { label: "Conducteurs présents", value: cPresents,          color: "#16A34A" },
                  { label: "Incidents ouverts",    value: incOuverts,         color: "#DC2626" },
                  { label: "Réparations à valider",value: repAValider.length, color: "#D97706" },
                ].map(k => (
                  <div key={k.label} style={{ background: C.white, borderRadius: 8,
                    border: "0.5px solid rgba(0,0,0,0.05)", padding: "12px 14px" }}>
                    <div style={{ fontSize: 22, fontWeight: 500, color: k.color, lineHeight: 1.2 }}>{k.value}</div>
                    <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 4, lineHeight: 1.4 }}>{k.label}</div>
                  </div>
                ))}
              </div>

              {/* Accès rapide — 2×4 sur mobile, 4×2 sur desktop */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8",
                textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
                Accès rapide
              </div>
              <div style={{ display: "grid",
                gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)",
                gap: 8, marginBottom: 20 }}>
                {QUICK_ACCESS.map(c => {
                  const Icon = c.icon;
                  return (
                    <Link key={c.path} href={c.path}
                      onClick={() => setMobileOpen(false)}
                      style={{ background: C.white, borderRadius: 8,
                        border: "0.5px solid rgba(0,0,0,0.05)", padding: "14px 10px",
                        cursor: "pointer", display: "flex", flexDirection: "column",
                        alignItems: "center", gap: 6, textAlign: "center",
                        transition: "background .12s, border-color .12s",
                        textDecoration: "none",
                        position: "relative", pointerEvents: "all" }}>
                      <Icon size={22} color={c.color} />
                      <div style={{ fontSize: 11, fontWeight: 500, color: "#0F172A" }}>{c.label}</div>
                      <div style={{ fontSize: 9, color: "#94A3B8" }}>{c.sub}</div>
                    </Link>
                  );
                })}
              </div>

              {/* Validation urgente */}
              {repAValider.length > 0 ? (
                <div style={{ background: C.white, borderRadius: 8, border: "0.5px solid rgba(0,0,0,0.05)", padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <Wrench size={15} color="#D97706" />
                    <span style={{ fontWeight: 700, fontSize: 13, color: C.gray800 }}>Validation en attente</span>
                    <span style={{ background: C.amberL, color: C.amber, borderRadius: 20,
                      fontSize: 11, fontWeight: 700, padding: "1px 8px" }}>{repAValider.length}</span>
                  </div>
                  {repAValider.map(r => {
                    const vv = r.vehicule as { plaque?: string } | undefined;
                    return (
                      <div key={r.id} style={{ borderBottom: `1px solid ${C.gray100}`, paddingBottom: 10, marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between",
                          alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: C.gray800 }}>
                              {vv?.plaque || r.vehicule_id}
                            </div>
                            <div style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>
                              {r.description?.slice(0, 60)}{(r.description?.length ?? 0) > 60 ? "…" : ""}
                            </div>
                          </div>
                          <span style={{ fontWeight: 800, color: C.red, fontSize: 14 }}>
                            {(r.cout_estime ?? 0).toLocaleString("fr-CH")} CHF
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 8,
                          flexDirection: isMobile ? "column" : "row" }}>
                          <button onClick={() => doValider(r)} disabled={valBusy}
                            style={{ flex: 1, padding: "8px 0", borderRadius: 7, border: "none",
                              background: C.green, color: C.white, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                            Valider
                          </button>
                          <button onClick={() => { setRefusOpen(r.id); setRefusMotif(""); setTab("validation"); }}
                            style={{ flex: 1, padding: "8px 0", borderRadius: 7,
                              border: `1px solid ${C.red}`, background: C.white,
                              color: C.red, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                            Refuser
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ background: C.greenL, borderRadius: 8, padding: "12px 16px",
                  border: "0.5px solid rgba(0,0,0,0.05)",
                  display: "flex", alignItems: "center", gap: 8 }}>
                  <CheckCircle2 size={15} color={C.green} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.green }}>
                    Aucune validation en attente
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ══ STATISTIQUES ═══════════════════════════════════════════════ */}
          {tab === "stats" && (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                {([ ["week","Cette semaine"], ["month","Ce mois"], ["annee","Année scolaire"] ] as [Period,string][]).map(([p, l]) => (
                  <button key={p} onClick={() => setPeriod(p)}
                    style={{ padding: "7px 14px", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer",
                      background:  period === p ? "#EFF6FF" : C.white,
                      border:      period === p ? "1px solid #BFDBFE" : `1px solid ${C.gray200}`,
                      color:       period === p ? "#1D4ED8" : C.gray600 }}>
                    {l}
                  </button>
                ))}
              </div>

              <div style={{ display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>

                {/* Panel 1 — Absences */}
                <div style={{ background: C.white, borderRadius: 12, padding: 18, border: "0.5px solid rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
                    <Users size={15} color="#1565C0" />
                    <span style={{ fontWeight: 700, fontSize: 14, color: C.gray800 }}>Absences conducteurs</span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <div style={{ minWidth: 280 }}>
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={absencesByWeek} margin={{ left: -20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={C.gray100} vertical={false} />
                          <XAxis dataKey="week" tick={{ fontSize: 9, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} allowDecimals={false} />
                          <Tooltip contentStyle={{ borderRadius: 8, border: `1px solid ${C.gray200}`, fontSize: 12 }} />
                          <Bar dataKey="count" name="Absences" radius={[3,3,0,0]}>
                            {absencesByWeek.map((_, i) => (
                              <Cell key={i} fill={i === absencesByWeek.length - 1 ? "#1565C0" : "#BFDBFE"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 12 }}>
                    {[
                      { label: "Total absences",  value: totalAbsences,   color: "#1565C0" },
                      { label: "Remplacements",   value: totalRemplace,   color: C.green   },
                      { label: "Non couverts",    value: totalNonCouvert, color: C.red     },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: 10, color: "#94A3B8" }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Panel 2 — Coûts */}
                <div style={{ background: C.white, borderRadius: 12, padding: 18, border: "0.5px solid rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
                    <Wrench size={15} color="#D97706" />
                    <span style={{ fontWeight: 700, fontSize: 14, color: C.gray800 }}>Coûts réparations CHF</span>
                  </div>
                  {repCostByMonth.length === 0 ? (
                    <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#94A3B8", fontSize: 13 }}>Aucune donnée</div>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <div style={{ minWidth: 280 }}>
                        <ResponsiveContainer width="100%" height={160}>
                          <BarChart data={repCostByMonth} margin={{ left: -10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={C.gray100} vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
                            <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
                            <Tooltip formatter={(v) => `${(v as number).toLocaleString("fr-CH")} CHF`}
                              contentStyle={{ borderRadius: 8, border: `1px solid ${C.gray200}`, fontSize: 12 }} />
                            <Bar dataKey="total" name="CHF" radius={[3,3,0,0]}>
                              {repCostByMonth.map((_, i) => (
                                <Cell key={i} fill={i === repCostByMonth.length - 1 ? "#D97706" : "#FEF3C7"} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 12 }}>
                    {[
                      { label: "Ce mois", value: `${Math.round(coutCeMois).toLocaleString("fr-CH")} CHF`, color: "#D97706" },
                      { label: "Total période", value: `${Math.round(coutAnnee).toLocaleString("fr-CH")} CHF`, color: C.gray800 },
                      { label: "À valider", value: repAValider.length, color: C.red },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: typeof s.value === "number" ? 18 : 11, fontWeight: 700, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: 10, color: "#94A3B8" }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Panel 3 — Véhicules coûteux */}
                <div style={{ background: C.white, borderRadius: 12, padding: 18, border: "0.5px solid rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
                    <Bus size={15} color="#DC2626" />
                    <span style={{ fontWeight: 700, fontSize: 14, color: C.gray800 }}>Véhicules coûteux</span>
                  </div>
                  {vehRank.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "30px 0", color: "#94A3B8", fontSize: 13 }}>
                      Aucune réparation
                    </div>
                  ) : vehRank.map((v, i) => (
                    <div key={v.id} style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.gray800 }}>{v.plaque}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: vehBarColors[i] }}>
                          {Math.round(v.total).toLocaleString("fr-CH")} CHF
                        </span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: C.gray100 }}>
                        <div style={{ height: 6, borderRadius: 3, background: vehBarColors[i],
                          width: `${Math.round(v.total / maxVehCost * 100)}%`, transition: "width .4s" }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Panel 4 — Incidents par type */}
                <div style={{ background: C.white, borderRadius: 12, padding: 18, border: "0.5px solid rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
                    <AlertTriangle size={15} color="#DC2626" />
                    <span style={{ fontWeight: 700, fontSize: 14, color: C.gray800 }}>Incidents par type</span>
                  </div>
                  {incByType.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "30px 0", color: "#94A3B8", fontSize: 13 }}>
                      Aucun incident
                    </div>
                  ) : (
                    <>
                      {incByType.map(([type, count]) => (
                        <div key={type} style={{ marginBottom: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: C.gray800, textTransform: "capitalize" }}>{type}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: C.red }}>{count}</span>
                          </div>
                          <div style={{ height: 5, borderRadius: 3, background: C.gray100 }}>
                            <div style={{ height: 5, borderRadius: 3, background: "#FCA5A5",
                              width: `${Math.round(count / maxIncType * 100)}%` }} />
                          </div>
                        </div>
                      ))}
                      <div style={{ paddingTop: 10, borderTop: `1px solid ${C.gray100}`,
                        fontSize: 12, fontWeight: 700, color: C.gray600, display: "flex", justifyContent: "space-between" }}>
                        <span>Total</span><span>{totalIncType}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══ VALIDATIONS ════════════════════════════════════════════════ */}
          {tab === "validation" && (
            <div>
              {/* Seuil budget configurable */}
              <div style={{ background: C.white, borderRadius: 12, padding: 18, marginBottom: 24,
                border: `1px solid ${C.amber}`, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                  flexWrap: "wrap", gap: 8, marginBottom: seuilEdit ? 14 : 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Settings size={15} color={C.amber} />
                    <span style={{ fontWeight: 700, fontSize: 14, color: C.gray800 }}>
                      Seuil de validation budget
                    </span>
                  </div>
                  {!seuilEdit && (
                    <button onClick={() => { setSeuilEdit(true); setSeuilInput(String(seuil ?? 1000)); }}
                      style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${C.gray200}`,
                        background: C.white, color: C.gray600, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                      Modifier
                    </button>
                  )}
                </div>
                {!seuilEdit ? (
                  <p style={{ fontSize: 13, color: C.gray600, margin: "10px 0 0", lineHeight: 1.6 }}>
                    Toute réparation dépassant{" "}
                    <strong style={{ color: C.amber, fontSize: 15 }}>
                      {seuil !== null ? seuil.toLocaleString("fr-CH") : "…"} CHF
                    </strong>{" "}
                    nécessite votre validation avant que le mécanicien puisse continuer.
                  </p>
                ) : (
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600,
                      color: C.gray600, marginBottom: 8 }}>
                      Nouveau seuil (CHF)
                    </label>
                    <div style={{ display: "flex", gap: 8,
                      flexDirection: isMobile ? "column" : "row" }}>
                      <input type="number" min="0" step="100" value={seuilInput}
                        onChange={e => setSeuilInput(e.target.value)}
                        style={{ ...inp, flex: 1 }} />
                      <button onClick={saveSeuil} disabled={seuilSaving}
                        style={{ padding: "10px 18px", borderRadius: 10, border: "none",
                          background: C.amber, color: C.white, fontWeight: 700,
                          fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
                        {seuilSaving ? "…" : "Sauvegarder"}
                      </button>
                      <button onClick={() => setSeuilEdit(false)}
                        style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.gray200}`,
                          background: C.white, color: C.gray600, fontWeight: 600,
                          fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Congés */}
              {congesAdmin.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: C.navy, marginBottom: 14,
                    display: "flex", alignItems: "center", gap: 8 }}>
                    <CalendarDays size={18} /> Congés à valider ({congesAdmin.length})
                  </div>
                  {congesAdmin.map(conge => {
                    const cond = conge.conducteur as { prenom?: string; nom?: string } | undefined;
                    const isRefusing = congeAdminRefusId === conge.id;
                    return (
                      <div key={conge.id} style={{ background: C.white, borderRadius: 14, padding: 20,
                        marginBottom: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
                        borderLeft: `4px solid #2563EB` }}>
                        <div style={{ display: "flex", justifyContent: "space-between",
                          alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                          <div>
                            <div style={{ fontWeight: 900, fontSize: 17, color: C.navy }}>
                              {cond?.prenom} {cond?.nom}
                            </div>
                            <div style={{ fontSize: 13, color: C.gray600, marginTop: 2 }}>
                              {conge.motif} · {fmtDate(conge.date_debut)} → {fmtDate(conge.date_fin)}
                            </div>
                          </div>
                          <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                            background: "#EFF6FF", color: "#2563EB" }}>Transmis gestionnaire</span>
                        </div>
                        <p style={{ fontSize: 14, color: C.gray800, lineHeight: 1.6, margin: "0 0 10px",
                          borderLeft: `3px solid ${C.gray200}`, paddingLeft: 10 }}>{conge.justification}</p>
                        {conge.note_gestionnaire && (
                          <div style={{ background: C.skyL, borderRadius: 10, padding: "8px 12px",
                            fontSize: 13, color: C.navyL, marginBottom: 12, fontStyle: "italic" }}>
                            Note gestionnaire : {conge.note_gestionnaire}
                          </div>
                        )}
                        {isRefusing && (
                          <div style={{ marginBottom: 12 }}>
                            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 6 }}>
                              Motif du refus *
                            </label>
                            <textarea value={congeAdminRefusMotif} onChange={e => setCongeAdminRefusMotif(e.target.value)}
                              rows={2} placeholder="Ex: Période de pointe scolaire…"
                              style={{ ...inp, resize: "vertical" }} />
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap",
                          flexDirection: isMobile ? "column" : "row" }}>
                          {!isRefusing ? (
                            <>
                              <button onClick={() => doAccepterConge(conge)} disabled={congeAdminBusy}
                                style={{ flex: 1, padding: "12px 0", borderRadius: 10,
                                  border: "none", background: C.green, color: C.white, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                  <CheckCircle2 size={15} /> Approuver
                                </span>
                              </button>
                              <button onClick={() => { setCongeAdminRefusId(conge.id); setCongeAdminRefusMotif(""); }}
                                style={{ flex: 1, padding: "12px 0", borderRadius: 10,
                                  border: `2px solid ${C.red}`, background: C.white, color: C.red, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                                Refuser
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => doRefuserConge(conge)}
                                disabled={congeAdminBusy || !congeAdminRefusMotif.trim()}
                                style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none",
                                  background: congeAdminRefusMotif.trim() ? C.red : C.gray200,
                                  color: C.white, fontWeight: 800, fontSize: 14,
                                  cursor: congeAdminRefusMotif.trim() ? "pointer" : "not-allowed" }}>
                                Confirmer le refus
                              </button>
                              <button onClick={() => setCongeAdminRefusId(null)}
                                style={{ padding: "12px 18px", borderRadius: 10, border: `1px solid ${C.gray200}`,
                                  background: C.white, color: C.gray600, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                                Annuler
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Réparations */}
              {repAValider.length === 0 && congesAdmin.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 20px", color: C.gray400 }}>
                  <CheckCircle2 size={48} strokeWidth={1} style={{ display: "block", margin: "0 auto 12px" }} />
                  <p style={{ fontWeight: 700, fontSize: 15 }}>Aucun élément en attente de validation</p>
                </div>
              ) : (
                <>
                  {repAValider.length > 0 && congesAdmin.length > 0 && (
                    <div style={{ fontWeight: 800, fontSize: 15, color: C.navy, marginBottom: 14,
                      display: "flex", alignItems: "center", gap: 8 }}>
                      <Wrench size={18} /> Réparations à valider ({repAValider.length})
                    </div>
                  )}
                  {repAValider.map(r => {
                    const vv = r.vehicule as { plaque?: string; marque?: string; modele?: string } | undefined;
                    const isRefusing = refusOpen === r.id;
                    return (
                      <div key={r.id} style={{ background: C.white, borderRadius: 14, padding: 20,
                        marginBottom: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
                        borderLeft: `4px solid ${C.red}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between",
                          alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                          <div>
                            <div style={{ fontWeight: 900, fontSize: 17, color: C.navy }}>{vv?.plaque || r.vehicule_id}</div>
                            <div style={{ fontSize: 12, color: C.gray400 }}>{vv?.marque} {vv?.modele}</div>
                            {r.date_reception && <div style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>Réceptionné {fmtDate(r.date_reception)}</div>}
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: isMobile ? 18 : 24, fontWeight: 900, color: C.red }}>
                              {(r.cout_estime ?? 0).toLocaleString("fr-CH")} CHF
                            </div>
                            <div style={{ fontSize: 11, color: C.gray400 }}>Coût estimé</div>
                          </div>
                        </div>
                        <p style={{ fontSize: 14, color: C.gray800, lineHeight: 1.6, margin: "0 0 12px",
                          borderLeft: `3px solid ${C.gray200}`, paddingLeft: 10 }}>{r.description}</p>
                        {r.commentaire_mecanicien && !r.commentaire_mecanicien.startsWith("[Refusé") && (
                          <div style={{ background: C.gray50, borderRadius: 10, padding: "8px 12px",
                            fontSize: 13, color: C.gray600, marginBottom: 14, fontStyle: "italic" }}>
                            {r.commentaire_mecanicien.split(" | ").filter((s: string) => !s.startsWith("Photos:")).join(" | ")}
                          </div>
                        )}
                        {isRefusing && (
                          <div style={{ marginBottom: 14 }}>
                            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 6 }}>
                              Motif du refus *
                            </label>
                            <textarea value={refusMotif} onChange={e => setRefusMotif(e.target.value)}
                              rows={2} placeholder="Ex: Obtenir deuxième devis…"
                              style={{ ...inp, resize: "vertical" }} />
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap",
                          flexDirection: isMobile ? "column" : "row" }}>
                          {!isRefusing ? (
                            <>
                              <button onClick={() => doValider(r)} disabled={valBusy}
                                style={{ flex: 1, padding: "12px 0", borderRadius: 10,
                                  border: "none", background: C.green, color: C.white, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                  <CheckCircle2 size={15} /> Valider
                                </span>
                              </button>
                              <button onClick={() => { setRefusOpen(r.id); setRefusMotif(""); }}
                                style={{ flex: 1, padding: "12px 0", borderRadius: 10,
                                  border: `2px solid ${C.red}`, background: C.white, color: C.red, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                                Refuser
                              </button>
                              <button onClick={() => printFiche(r)}
                                style={{ padding: "12px 18px", borderRadius: 10, border: `1px solid ${C.gray200}`,
                                  background: C.white, color: C.gray600, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                                Imprimer
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => doRefuser(r)} disabled={valBusy || !refusMotif.trim()}
                                style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none",
                                  background: refusMotif.trim() ? C.red : C.gray200, color: C.white,
                                  fontWeight: 800, fontSize: 14, cursor: refusMotif.trim() ? "pointer" : "not-allowed" }}>
                                Confirmer le refus
                              </button>
                              <button onClick={() => setRefusOpen(null)}
                                style={{ padding: "12px 18px", borderRadius: 10, border: `1px solid ${C.gray200}`,
                                  background: C.white, color: C.gray600, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                                Annuler
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* Historique validations */}
              {(() => {
                const histItems = reparations.filter(r =>
                  ["en_reparation","remis_en_circulation"].includes(r.statut) ||
                  (r.statut === "receptionne" && (r.commentaire_mecanicien || "").startsWith("[Refusé"))
                );
                if (histItems.length === 0) return null;
                const grouped: Record<string, typeof histItems> = {};
                histItems.forEach(r => {
                  const d = r.date_reception || r.created_at.slice(0, 10);
                  if (!grouped[d]) grouped[d] = [];
                  grouped[d].push(r);
                });
                const days = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
                const tod = isoToday();
                return (
                  <div style={{ marginTop: 32 }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: C.gray600, marginBottom: 14 }}>
                      Historique des validations
                    </div>
                    {days.map((day, di) => {
                      const isOpen = di === 0 || !!histValExpanded[day];
                      const dayLabel = day === tod ? "Aujourd'hui"
                        : day === addDays(tod, -1) ? "Hier"
                        : new Date(day + "T00:00:00").toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
                      return (
                        <div key={day} style={{ marginBottom: 6 }}>
                          <div onClick={() => { if (di !== 0) setHistValExpanded(s => ({ ...s, [day]: !s[day] })); }}
                            style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0 10px",
                              cursor: di === 0 ? "default" : "pointer" }}>
                            <div style={{ flex: 1, height: 1, background: C.gray200 }} />
                            <span style={{ fontSize: 11, fontWeight: 800, color: C.gray400,
                              textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>
                              {dayLabel}
                            </span>
                            {di !== 0 && !isOpen && (
                              <span style={{ fontSize: 11, color: C.navy, fontWeight: 700 }}>
                                Voir les {grouped[day].length} élément{grouped[day].length > 1 ? "s" : ""}
                              </span>
                            )}
                            <div style={{ flex: 1, height: 1, background: C.gray200 }} />
                          </div>
                          {isOpen && grouped[day].map(r => {
                            const vv = r.vehicule as { plaque?: string } | undefined;
                            const wasRefused = (r.commentaire_mecanicien || "").startsWith("[Refusé");
                            const refusMotifText = wasRefused
                              ? (r.commentaire_mecanicien || "").replace("[Refusé par admin: ", "").replace("]", "")
                              : null;
                            return (
                              <div key={r.id} style={{ background: C.gray50, borderRadius: 12, padding: 14,
                                marginBottom: 10, borderLeft: `3px solid ${wasRefused ? C.red : C.green}` }}>
                                <div style={{ display: "flex", justifyContent: "space-between",
                                  alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                                  <div>
                                    <div style={{ fontWeight: 700, fontSize: 14 }}>{vv?.plaque || r.vehicule_id}</div>
                                    <div style={{ fontSize: 12, color: C.gray400 }}>{fmtDate(r.date_reception)}</div>
                                    {refusMotifText && (
                                      <div style={{ fontSize: 12, color: C.red, marginTop: 3, fontStyle: "italic" }}>
                                        Motif : {refusMotifText}
                                      </div>
                                    )}
                                  </div>
                                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                    {(r.cout_estime ?? 0) > 0 && (
                                      <span style={{ fontWeight: 800, fontSize: 14 }}>
                                        {(r.cout_estime ?? 0).toLocaleString("fr-CH")} CHF
                                      </span>
                                    )}
                                    <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                                      background: wasRefused ? C.redL : C.greenL,
                                      color: wasRefused ? C.red : C.green }}>
                                      {wasRefused ? "Refusé" : "Validé"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ══ HISTORIQUE ═════════════════════════════════════════════════ */}
          {tab === "historique" && (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
                {[SY_START, SY_START - 1].map(y => (
                  <button key={y} onClick={() => { setHistYear(y); setHistMonth(null); setHistDay(null); }}
                    style={{ padding: "9px 18px", borderRadius: 10, border: "none", fontWeight: 700,
                      fontSize: 13, cursor: "pointer",
                      background: histYear === y ? C.navy : C.gray100,
                      color: histYear === y ? C.white : C.gray600 }}>
                    {y}–{y + 1}
                  </button>
                ))}
                {histMonth !== null && (
                  <button onClick={() => { setHistMonth(null); setHistDay(null); }}
                    style={{ padding: "9px 18px", borderRadius: 10, border: `1px solid ${C.gray200}`,
                      background: C.white, color: C.gray600, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                    ← Mois
                  </button>
                )}
                {histDay !== null && (
                  <button onClick={() => setHistDay(null)}
                    style={{ padding: "9px 18px", borderRadius: 10, border: `1px solid ${C.gray200}`,
                      background: C.white, color: C.gray600, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                    ← Jours
                  </button>
                )}
              </div>

              {histMonth === null && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12 }}>
                  {[9,10,11,12,1,2,3,4,5,6,7,8].map(m => {
                    const yr = m >= 9 ? histYear : histYear + 1;
                    const data = histMonthData(yr, m);
                    const hasData = data.incidents > 0 || data.absences > 0 || data.reparations > 0;
                    return (
                      <div key={m} onClick={() => setHistMonth(m)}
                        style={{ background: C.white, borderRadius: 12, padding: 16, cursor: "pointer",
                          boxShadow: "0 1px 6px rgba(0,0,0,0.06)", opacity: hasData ? 1 : 0.5,
                          borderTop: `3px solid ${hasData ? C.navy : C.gray200}` }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: C.navy, marginBottom: 8 }}>
                          {MONTHS_FR[m - 1]}
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {data.incidents > 0 && <span style={{ fontSize: 11, color: C.red }}>{data.incidents} inc.</span>}
                          {data.absences > 0 && <span style={{ fontSize: 11, color: C.amber }}>{data.absences} abs.</span>}
                          {data.reparations > 0 && <span style={{ fontSize: 11, color: C.navyL }}>{data.reparations} rép.</span>}
                          {!hasData && <span style={{ fontSize: 11, color: C.gray400 }}>—</span>}
                        </div>
                        {data.cout > 0 && (
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.gray600, marginTop: 6 }}>
                            {Math.round(data.cout).toLocaleString("fr-CH")} CHF
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {histMonth !== null && histDay === null && (() => {
                const yr = histMonth >= 9 ? histYear : histYear + 1;
                const pad = String(histMonth).padStart(2, "0");
                const data = histMonthData(yr, histMonth);
                const totalDays = new Date(yr, histMonth, 0).getDate();
                return (
                  <>
                    <div style={{ background: C.white, borderRadius: 14, padding: 18, marginBottom: 20,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between",
                        alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
                        <div style={{ fontWeight: 800, fontSize: 16, color: C.navy }}>
                          {MONTHS_FR[histMonth - 1]} {yr}
                        </div>
                        <button onClick={() => exportCSV(yr, histMonth)}
                          style={{ display: "flex", alignItems: "center", gap: 6,
                            padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.gray200}`,
                            background: C.white, color: C.gray600, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                          <Download size={13} /> Export CSV
                        </button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                        {[
                          { val: data.incidents, label: "Incidents", color: C.red },
                          { val: data.absences, label: "Absences", color: C.amber },
                          { val: data.reparations, label: "Réparations", color: C.navyL },
                        ].map(s => (
                          <div key={s.label} style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 24, fontWeight: 900, color: s.color }}>{s.val}</div>
                            <div style={{ fontSize: 11, color: C.gray400 }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: isMobile ? 4 : 6 }}>
                      {["Lu","Ma","Me","Je","Ve","Sa","Di"].map(d => (
                        <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700,
                          color: C.gray400, paddingBottom: 6 }}>{d}</div>
                      ))}
                      {(() => {
                        const firstDay = new Date(`${yr}-${pad}-01`).getDay();
                        const offset = firstDay === 0 ? 6 : firstDay - 1;
                        const cells = [];
                        for (let i = 0; i < offset; i++) cells.push(<div key={`e${i}`} />);
                        for (let d = 1; d <= totalDays; d++) {
                          const dayStr = `${yr}-${pad}-${String(d).padStart(2, "0")}`;
                          const { incidents: di, absences: da, reparations: dr } = histDayData(dayStr);
                          const hasData = di.length > 0 || da.length > 0 || dr.length > 0;
                          const isToday = dayStr === isoToday();
                          cells.push(
                            <div key={d} onClick={() => hasData && setHistDay(dayStr)}
                              style={{ aspectRatio: "1", display: "flex", flexDirection: "column",
                                alignItems: "center", justifyContent: "center", borderRadius: 10,
                                cursor: hasData ? "pointer" : "default",
                                background: isToday ? C.navy : hasData ? C.skyL : C.gray50,
                                color: isToday ? C.white : C.gray800,
                                border: isToday ? "none" : `1px solid ${C.gray200}` }}>
                              <span style={{ fontWeight: 700, fontSize: isMobile ? 11 : 13 }}>{d}</span>
                              {hasData && !isToday && (
                                <div style={{ display: "flex", gap: 2, marginTop: 2 }}>
                                  {di.length > 0 && <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.red }} />}
                                  {da.length > 0 && <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.amber }} />}
                                  {dr.length > 0 && <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.navy }} />}
                                </div>
                              )}
                            </div>
                          );
                        }
                        return cells;
                      })()}
                    </div>
                  </>
                );
              })()}

              {histDay !== null && (() => {
                const { incidents: di, absences: da, reparations: dr } = histDayData(histDay);
                return (
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: C.navy, marginBottom: 16 }}>
                      {new Date(histDay).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    </div>
                    {di.length === 0 && da.length === 0 && dr.length === 0 ? (
                      <div style={{ textAlign: "center", padding: 40, color: C.gray400 }}>Aucun événement ce jour</div>
                    ) : (
                      <>
                        {di.map(i => (
                          <div key={i.id} style={{ background: C.white, borderRadius: 12, padding: 14,
                            marginBottom: 8, borderLeft: `3px solid ${C.red}` }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: C.red,
                              display: "flex", alignItems: "center", gap: 6 }}>
                              <AlertTriangle size={13} /> {i.type}
                            </div>
                            <div style={{ fontSize: 13, color: C.gray600, marginTop: 4 }}>{i.description}</div>
                          </div>
                        ))}
                        {da.map(a => {
                          const cond = a.conducteur as { prenom?: string; nom?: string } | undefined;
                          return (
                            <div key={a.id} style={{ background: C.white, borderRadius: 12, padding: 14,
                              marginBottom: 8, borderLeft: `3px solid ${C.amber}` }}>
                              <div style={{ fontWeight: 700, fontSize: 14, color: C.amber,
                                display: "flex", alignItems: "center", gap: 6 }}>
                                <Users size={13} /> {cond?.prenom} {cond?.nom}
                              </div>
                              <div style={{ fontSize: 13, color: C.gray600, marginTop: 4 }}>
                                {a.motif || "—"} · {a.status === "couvert" ? "Couvert" : "Non couvert"}
                              </div>
                            </div>
                          );
                        })}
                        {dr.map(r => {
                          const vv = r.vehicule as { plaque?: string } | undefined;
                          return (
                            <div key={r.id} style={{ background: C.white, borderRadius: 12, padding: 14,
                              marginBottom: 8, borderLeft: `3px solid ${C.navy}` }}>
                              <div style={{ fontWeight: 700, fontSize: 14, color: C.navy,
                                display: "flex", alignItems: "center", gap: 6 }}>
                                <Wrench size={13} /> {vv?.plaque || r.vehicule_id}
                              </div>
                              <div style={{ fontSize: 13, color: C.gray600, marginTop: 4 }}>{r.description}</div>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ══ MESSAGES ═══════════════════════════════════════════════════ */}
          {tab === "messages" && (
            <div>
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: C.navy, textTransform: "uppercase",
                  letterSpacing: 0.5, marginBottom: 12 }}>
                  Messagerie directe
                </div>
                <MessagerieBox myRole="admin"
                  allowedTargets={[
                    { label: "Gestionnaire", role: "gestionnaire" },
                    { label: "Mécanicien",   role: "mecanicien"   },
                    { label: "Conducteurs",  role: "conducteur"   },
                  ]} />
              </div>

              {adminMsgs.length > 0 && (
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: C.navy, textTransform: "uppercase",
                    letterSpacing: 0.5, marginBottom: 12 }}>
                    Messages mécanicien
                  </div>
                  {groupByDay(adminMsgs).map((grp, gi) => {
                    const isFirst = gi === 0;
                    const open = isFirst || msgExpandedDays[grp.day];
                    return (
                      <div key={grp.day}>
                        <div onClick={() => !isFirst && setMsgExpandedDays(s => ({ ...s, [grp.day]: !s[grp.day] }))}
                          style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0 10px",
                            cursor: isFirst ? "default" : "pointer" }}>
                          <div style={{ flex: 1, height: 1, background: C.gray200 }} />
                          <span style={{ fontSize: 11, fontWeight: 800, color: C.gray600,
                            textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>{grp.label}</span>
                          {!isFirst && !open && (
                            <span style={{ fontSize: 11, color: C.navyL, fontWeight: 700, whiteSpace: "nowrap" }}>
                              Voir les {grp.items.length} message{grp.items.length > 1 ? "s" : ""}
                            </span>
                          )}
                          <div style={{ flex: 1, height: 1, background: C.gray200 }} />
                        </div>
                        {open && grp.items.map(m => (
                          <div key={m.id} style={{ background: m.read ? C.gray50 : C.white, borderRadius: 14, padding: 18,
                            marginBottom: 12, border: `1px solid ${m.read ? C.gray200 : C.navyL}`,
                            boxShadow: m.read ? "none" : "0 2px 10px rgba(0,0,0,0.08)",
                            borderLeft: `4px solid ${m.read ? C.gray400 : C.navyL}` }}>
                            <div style={{ display: "flex", justifyContent: "space-between",
                              alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                              <div style={{ fontWeight: 700, fontSize: 13, color: C.navyL }}>
                                Mécanicien
                                {!m.read && (
                                  <span style={{ marginLeft: 8, background: C.navyL, color: C.white,
                                    borderRadius: 99, padding: "1px 7px", fontSize: 10, fontWeight: 900 }}>
                                    Nouveau
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: 12, color: C.gray400 }}>{fmtDateTime(m.created_at)}</div>
                            </div>
                            <p style={{ fontSize: 14, color: C.gray800, lineHeight: 1.5, margin: "0 0 12px" }}>
                              {(m.message || "").replace("Message du mécanicien : ", "")}
                            </p>
                            {!m.read && (
                              <button onClick={async () => {
                                await sb.from("alertes").update({ read: true, read_at: new Date().toISOString() }).eq("id", m.id);
                                load();
                              }} style={{ padding: "9px 20px", borderRadius: 10, border: `2px solid ${C.navyL}`,
                                background: C.white, color: C.navyL, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                                Lu
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
