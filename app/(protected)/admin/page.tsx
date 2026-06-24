"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import {
  Bus, Users, Wrench, AlertTriangle, Smartphone, LayoutDashboard,
  Cog, Download, LogOut, Home, BarChart2, CheckCircle2, CalendarDays, MessageSquare,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { C, fmtDate, fmtDateTime, isoToday } from "@/lib/constants";
import type { Conducteur, Vehicule, Incident, Reparation, AbsenceConducteur, Alerte } from "@/lib/types";

type AdminTab = "dashboard" | "stats" | "validation" | "historique" | "messages";
type Period   = "week" | "month" | "annee";

const PIE_COLORS = [C.red, C.amber, "#2563EB", C.green, "#7C3AED", C.gray400];

const inp: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 10,
  border: `1.5px solid ${C.gray200}`, fontSize: 14, color: C.gray800,
  background: C.white, boxSizing: "border-box",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function addDays(iso: string, n: number) {
  const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10);
}
function monthKey(iso: string) { return iso.slice(0, 7); }
function currentSchoolYear() {
  const m = new Date().getMonth();
  return m >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1;
}

// ── Mini-composants ───────────────────────────────────────────────────────────
function PeriodBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ padding: "8px 16px", borderRadius: 10, border: "none",
      fontWeight: 700, fontSize: 13, cursor: "pointer",
      background: active ? C.navy : C.gray100, color: active ? C.white : C.gray600 }}>
      {label}
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const sb     = createClient();
  const router = useRouter();

  const [tab,    setTab]    = useState<AdminTab>("dashboard");
  const [period, setPeriod] = useState<Period>("month");
  const [loading, setLoading] = useState(true);

  const [conducteurs,  setConducteurs]  = useState<Conducteur[]>([]);
  const [vehicules,    setVehicules]    = useState<Vehicule[]>([]);
  const [incidents,    setIncidents]    = useState<Incident[]>([]);
  const [reparations,  setReparations]  = useState<Reparation[]>([]);
  const [absencesCond, setAbsencesCond] = useState<AbsenceConducteur[]>([]);

  const [refusOpen,  setRefusOpen]  = useState<number | null>(null);
  const [refusMotif, setRefusMotif] = useState("");
  const [valBusy,    setValBusy]    = useState(false);
  const [adminMsgs,  setAdminMsgs]  = useState<Alerte[]>([]);

  const [histYear,  setHistYear]  = useState(currentSchoolYear());
  const [histMonth, setHistMonth] = useState<number | null>(null);
  const [histDay,   setHistDay]   = useState<string | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const yearAgo = addDays(isoToday(), -365);
    const [c, v, inc, rep, abs, msgs] = await Promise.all([
      sb.from("conducteurs").select("*").order("nom"),
      sb.from("vehicules").select("*").order("plaque"),
      sb.from("incidents").select("*,vehicule:vehicules(id,plaque),conducteur:conducteurs(prenom,nom)")
        .gte("reported_at", yearAgo).order("reported_at", { ascending: false }),
      sb.from("reparations").select("*,vehicule:vehicules(id,plaque,marque,modele)")
        .gte("created_at", yearAgo).order("created_at", { ascending: false }),
      sb.from("absences_conducteurs")
        .select("*,conducteur:conducteurs!conducteur_id(prenom,nom)")
        .gte("date_absence", yearAgo).order("date_absence", { ascending: false }),
      sb.from("alertes")
        .select("*")
        .eq("type", "msg_meca_admin")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setConducteurs(c.data ?? []);
    setVehicules(v.data ?? []);
    setIncidents(inc.data ?? []);
    setReparations(rep.data ?? []);
    setAbsencesCond(abs.data ?? []);
    setAdminMsgs(msgs.data ?? []);
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
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [load, sb]);

  async function handleSignOut() {
    await sb.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // ── Period filter ────────────────────────────────────────────────────────────
  function periodStart(): string {
    const today = isoToday();
    if (period === "week")  return addDays(today, -7);
    if (period === "month") return `${today.slice(0, 7)}-01`;
    return `${currentSchoolYear()}-09-01`;
  }
  const filteredIncidents   = incidents.filter(i => i.reported_at.slice(0, 10) >= periodStart());
  const filteredReparations = reparations.filter(r => (r.date_reception || r.created_at.slice(0, 10)) >= periodStart());
  const filteredAbsences    = absencesCond.filter(a => a.date_absence >= periodStart());

  // ── Computed ─────────────────────────────────────────────────────────────────
  const vEnService  = vehicules.filter(v => ["bon","en_service"].includes(v.etat as string)).length;
  const vReparation = vehicules.filter(v => ["receptionne","en_reparation","en_attente_piece","repare","atelier"].includes(v.etat as string)).length;
  const vAttention  = vehicules.filter(v => (v.etat as string) === "attention").length;
  const cPresents   = conducteurs.filter(d => ["en_service","disponible"].includes(d.status)).length;
  const cAbsents    = conducteurs.filter(d => d.status === "absent").length;
  const incOuverts  = incidents.filter(i => i.status !== "resolu").length;
  const repAValider    = reparations.filter(r => r.statut === "en_attente_validation");
  const unreadMsgCount = adminMsgs.filter(m => !m.read).length;

  // Graphiques
  const today = isoToday();
  const inc30 = (() => {
    const cutoff = addDays(today, -29);
    const map: Record<string, number> = {};
    for (let i = 0; i < 30; i++) map[addDays(cutoff, i)] = 0;
    incidents.filter(i => i.reported_at.slice(0, 10) >= cutoff)
      .forEach(i => { const d = i.reported_at.slice(0, 10); if (d in map) map[d]++; });
    return Object.entries(map).map(([day, count]) => ({ day: day.slice(5), count }));
  })();

  const repCostByMonth = (() => {
    const map: Record<string, number> = {};
    filteredReparations.forEach(r => {
      const mk = monthKey(r.date_reception || r.created_at.slice(0, 10));
      map[mk] = (map[mk] ?? 0) + (r.cout ?? r.cout_estime ?? 0);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => ({ month, total: Math.round(total) }));
  })();

  const incByType = (() => {
    const map: Record<string, number> = {};
    filteredIncidents.forEach(i => { map[i.type] = (map[i.type] ?? 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  })();

  const vehRank = (() => {
    const map: Record<string, { plaque: string; total: number }> = {};
    reparations.forEach(r => {
      const vv = r.vehicule as { plaque?: string } | undefined;
      if (!map[r.vehicule_id]) map[r.vehicule_id] = { plaque: vv?.plaque || r.vehicule_id, total: 0 };
      map[r.vehicule_id].total += r.cout ?? r.cout_estime ?? 0;
    });
    return Object.entries(map).map(([id, x]) => ({ id, ...x }))
      .sort((a, b) => b.total - a.total).slice(0, 8);
  })();

  const condRank = (() => {
    const map: Record<string, { nom: string; count: number }> = {};
    absencesCond.forEach(a => {
      const cond = a.conducteur as { prenom?: string; nom?: string } | undefined;
      const nm = cond ? `${cond.prenom} ${cond.nom}` : String(a.conducteur_id);
      if (!map[a.conducteur_id]) map[a.conducteur_id] = { nom: nm, count: 0 };
      map[a.conducteur_id].count++;
    });
    return Object.entries(map).map(([id, x]) => ({ id, ...x }))
      .sort((a, b) => b.count - a.count).slice(0, 8);
  })();

  // ── Handlers validation ───────────────────────────────────────────────────────
  async function doValider(rep: Reparation) {
    setValBusy(true);
    const vv = rep.vehicule as { plaque?: string } | undefined;
    const plaque = vv?.plaque || rep.vehicule_id;
    await sb.from("reparations").update({ statut: "en_reparation" }).eq("id", rep.id);
    await sb.from("alertes").insert([
      // Notification gestionnaire
      { type: "reparation", severity: "normale", read: false, vehicle_id: rep.vehicule_id,
        message: `✅ Réparation validée — ${plaque} (${(rep.cout_estime ?? 0).toLocaleString("fr-CH")} CHF)` },
      // Notification mécanicien → onglet Messages
      { type: "decision_admin", severity: "normale", read: false, vehicle_id: rep.vehicule_id,
        message: `✅ Admin a validé la réparation de ${plaque} — ${(rep.cout_estime ?? 0).toLocaleString("fr-CH")} CHF. Vous pouvez continuer.` },
    ]);
    setValBusy(false);
    load();
  }

  async function doRefuser(rep: Reparation) {
    if (!refusMotif.trim()) return;
    setValBusy(true);
    const vv = rep.vehicule as { plaque?: string } | undefined;
    const plaque = vv?.plaque || rep.vehicule_id;
    await sb.from("reparations").update({ statut: "receptionne",
      commentaire_mecanicien: `[Refusé par admin: ${refusMotif.trim()}]` }).eq("id", rep.id);
    await sb.from("alertes").insert([
      // Notification gestionnaire
      { type: "reparation", severity: "haute", read: false, vehicle_id: rep.vehicule_id,
        message: `❌ Réparation refusée — ${plaque} : ${refusMotif.trim()}` },
      // Notification mécanicien → onglet Messages
      { type: "decision_admin", severity: "haute", read: false, vehicle_id: rep.vehicule_id,
        message: `❌ Admin a refusé la réparation de ${plaque} — Motif : ${refusMotif.trim()}` },
    ]);
    setRefusOpen(null); setRefusMotif(""); setValBusy(false);
    load();
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

  // ── Historique helpers ────────────────────────────────────────────────────────
  const MONTHS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const SY_START = currentSchoolYear();

  function histDayData(day: string) {
    return {
      incidents:   incidents.filter(i => i.reported_at.slice(0, 10) === day),
      absences:    absencesCond.filter(a => a.date_absence === day),
      reparations: reparations.filter(r => (r.date_reception || r.created_at.slice(0, 10)) === day),
    };
  }
  function histMonthData(year: number, month: number) {
    const mk = `${year}-${String(month).padStart(2, "0")}`;
    const mInc = incidents.filter(i => i.reported_at.slice(0, 7) === mk).length;
    const mAbs = absencesCond.filter(a => a.date_absence.slice(0, 7) === mk).length;
    const mRep = reparations.filter(r => (r.date_reception || r.created_at.slice(0, 10)).slice(0, 7) === mk);
    return { incidents: mInc, absences: mAbs, reparations: mRep.length, cout: mRep.reduce((s, r) => s + (r.cout ?? r.cout_estime ?? 0), 0) };
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
    a.download = `historique-${mk}.csv`;
    a.click();
  }

  if (loading) return (
    <div style={{ textAlign: "center", padding: 80, color: C.gray400 }}>Chargement…</div>
  );

  // ── Cards de navigation ────────────────────────────────────────────────────────
  const NAV_CARDS = [
    { icon: <Bus size={28} />,           label: "Flotte",        sub: "Véhicules & état",      path: "/gestionnaire/vehicules",   color: "#2563EB" },
    { icon: <Users size={28} />,         label: "Conducteurs",   sub: "Fiches & statuts",       path: "/gestionnaire/conducteurs", color: C.navy   },
    { icon: <Wrench size={28} />,        label: "Réparations",   sub: "Atelier & suivi",        path: "/gestionnaire/reparations", color: C.amber  },
    { icon: <AlertTriangle size={28} />, label: "Incidents",     sub: "Signalements",           path: "/gestionnaire/incidents",   color: C.red    },
    { icon: <Smartphone size={28} />,    label: "QR Codes",      sub: "Génération & scan",      path: "/admin/qrcodes",            color: "#7C3AED"},
    { icon: <LayoutDashboard size={28}/>,label: "Gestionnaire",  sub: "Dashboard complet",      path: "/gestionnaire",            color: C.navyL  },
    { icon: <Cog size={28} />,           label: "Mécanicien",    sub: "Atelier & réparations",  path: "/mecanicien",              color: "#D97706" },
    { icon: <Download size={28} />,      label: "Exports",       sub: "Rapports & données",     path: "/gestionnaire/export",      color: C.green  },
  ];

  const TABS: { id: AdminTab; icon: React.ReactNode; label: string; badge?: number }[] = [
    { id: "dashboard",   icon: <Home size={15} />,           label: "Tableau de bord"                                    },
    { id: "stats",       icon: <BarChart2 size={15} />,      label: "Statistiques"                                       },
    { id: "validation",  icon: <CheckCircle2 size={15} />,   label: "Validations",  badge: repAValider.length            },
    { id: "historique",  icon: <CalendarDays size={15} />,   label: "Historique"                                         },
    { id: "messages",    icon: <MessageSquare size={15} />,  label: "Messages",     badge: unreadMsgCount || undefined   },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: C.gray50 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header style={{ background: C.navy, padding: "0 24px", height: 60,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        boxShadow: "0 2px 12px rgba(0,0,0,0.25)", position: "sticky", top: 0, zIndex: 300 }}>
        <img src="/logo.png" alt="Taxi Romontois" style={{ height: 34, width: "auto" }} />
        <span style={{ color: C.white, fontWeight: 900, fontSize: 18, letterSpacing: 0.3 }}>
          Administration
        </span>
        <button onClick={handleSignOut}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px",
            borderRadius: 8, border: "none", background: "rgba(220,38,38,0.2)", color: "#FCA5A5",
            fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          <LogOut size={15} /> Déconnexion
        </button>
      </header>

      {/* ── Barre de navigation horizontale ────────────────────────────────── */}
      <nav style={{ background: C.white, borderBottom: `1px solid ${C.gray200}`,
        display: "flex", gap: 0, overflowX: "auto", position: "sticky", top: 60, zIndex: 200 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "14px 20px",
              border: "none", background: "none", cursor: "pointer", fontWeight: 700,
              fontSize: 13, whiteSpace: "nowrap", flexShrink: 0, position: "relative",
              color: tab === t.id ? C.navy : C.gray600,
              borderBottom: tab === t.id ? `3px solid ${C.navy}` : "3px solid transparent" }}>
            {t.icon}
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span style={{ background: C.red, color: C.white, borderRadius: 99,
                padding: "1px 6px", fontSize: 10, fontWeight: 900, marginLeft: 2 }}>{t.badge}</span>
            )}
          </button>
        ))}
      </nav>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>

        {/* ── Cards navigables ──────────────────────────────────────────────── */}
        <div style={{ display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 24 }}>
          {NAV_CARDS.map(c => (
            <div key={c.path} onClick={() => router.push(c.path)}
              style={{ background: C.white, borderRadius: 16, padding: "18px 14px",
                cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.07)",
                borderTop: `3px solid ${c.color}`, display: "flex",
                flexDirection: "column", alignItems: "flex-start", gap: 8,
                transition: "box-shadow 0.15s", minWidth: 0 }}>
              <span style={{ color: c.color }}>{c.icon}</span>
              <div style={{ minWidth: 0, width: "100%" }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: C.navy,
                  wordBreak: "break-word", lineHeight: 1.3 }}>{c.label}</div>
                <div style={{ fontSize: 11, color: C.gray400, marginTop: 2,
                  wordBreak: "break-word", lineHeight: 1.3 }}>{c.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ══ TAB : TABLEAU DE BORD ════════════════════════════════════════════ */}
        {tab === "dashboard" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 24 }}>
              {[
                { label: "Véhicules en service",     value: vEnService,   color: C.green  },
                { label: "En réparation / atelier",  value: vReparation,  color: C.amber  },
                { label: "Attention requise",         value: vAttention,   color: C.red    },
                { label: "Conducteurs présents",      value: cPresents,    color: C.navyL  },
                { label: "Absents aujourd'hui",       value: cAbsents,     color: C.red    },
                { label: "Incidents ouverts",         value: incOuverts,   color: incOuverts > 0 ? C.red : C.green },
              ].map(s => (
                <div key={s.label} style={{ background: C.white, borderRadius: 14,
                  padding: "16px 14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  borderTop: `3px solid ${s.color}`, minWidth: 0 }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.gray600, marginTop: 4,
                    lineHeight: 1.3, wordBreak: "break-word" }}>{s.label}</div>
                </div>
              ))}
            </div>

            {repAValider.length > 0 && (
              <div style={{ background: C.redL, borderRadius: 14, padding: 18,
                borderLeft: `4px solid ${C.red}`, marginBottom: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: C.red, marginBottom: 12 }}>
                  ⚠️ {repAValider.length} réparation(s) en attente de validation
                </div>
                {repAValider.map(r => {
                  const vv = r.vehicule as { plaque?: string } | undefined;
                  return (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "center", padding: "8px 0",
                      borderBottom: `1px solid ${C.red}20`, flexWrap: "wrap", gap: 8 }}>
                      <span style={{ fontWeight: 700 }}>{vv?.plaque || r.vehicule_id}</span>
                      <span style={{ fontWeight: 900, color: C.red }}>{(r.cout_estime ?? 0).toLocaleString("fr-CH")} CHF</span>
                      <button onClick={() => setTab("validation")}
                        style={{ padding: "5px 12px", borderRadius: 8, border: "none",
                          background: C.red, color: C.white, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                        Valider →
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ TAB : STATISTIQUES ══════════════════════════════════════════════ */}
        {tab === "stats" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              <PeriodBtn label="Cette semaine" active={period === "week"}  onClick={() => setPeriod("week")} />
              <PeriodBtn label="Ce mois"       active={period === "month"} onClick={() => setPeriod("month")} />
              <PeriodBtn label="Année scolaire" active={period === "annee"} onClick={() => setPeriod("annee")} />
            </div>

            {/* Incidents 30j */}
            <div style={{ background: C.white, borderRadius: 16, padding: 20, marginBottom: 20,
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.navy, marginBottom: 16 }}>
                Incidents — 30 derniers jours
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={inc30} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.gray100} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: C.gray400 }} tickLine={false} interval={4} />
                  <YAxis tick={{ fontSize: 11, fill: C.gray400 }} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${C.gray200}`, fontSize: 13 }} />
                  <Bar dataKey="count" name="Incidents" fill={C.red} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Coût réparations par mois */}
            <div style={{ background: C.white, borderRadius: 16, padding: 20, marginBottom: 20,
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.navy, marginBottom: 16 }}>
                Coût réparations par mois (CHF)
              </div>
              {repCostByMonth.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: C.gray400, fontSize: 13 }}>Aucune donnée</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={repCostByMonth} margin={{ left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.gray100} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: C.gray400 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: C.gray400 }} tickLine={false} />
                    <Tooltip formatter={(v) => `${(v as number).toLocaleString("fr-CH")} CHF`}
                      contentStyle={{ borderRadius: 10, border: `1px solid ${C.gray200}`, fontSize: 13 }} />
                    <Bar dataKey="total" name="Coût CHF" fill={C.amber} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              {/* Pie incidents par type */}
              <div style={{ background: C.white, borderRadius: 16, padding: 20,
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: C.navy, marginBottom: 12 }}>
                  Incidents par type
                </div>
                {incByType.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "30px 0", color: C.gray400, fontSize: 13 }}>Aucun incident</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={incByType} dataKey="value" nameKey="name" cx="50%" cy="50%"
                        outerRadius={70} label={({ name, percent = 0 }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false} fontSize={11}>
                        {incByType.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${C.gray200}`, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Classement véhicules */}
              <div style={{ background: C.white, borderRadius: 16, padding: 20,
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: C.navy, marginBottom: 12 }}>
                  Top véhicules — coût
                </div>
                {vehRank.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "30px 0", color: C.gray400, fontSize: 13 }}>Aucune réparation</div>
                ) : vehRank.map((v, i) => (
                  <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10,
                    padding: "7px 0", borderBottom: `1px solid ${C.gray100}` }}>
                    <span style={{ width: 20, fontSize: 12, fontWeight: 900, color: i === 0 ? C.red : C.gray400 }}>#{i + 1}</span>
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{v.plaque}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: v.total > 5000 ? C.red : C.gray800 }}>
                      {Math.round(v.total).toLocaleString("fr-CH")} CHF
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Classement conducteurs absences */}
            <div style={{ background: C.white, borderRadius: 16, padding: 20,
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.navy, marginBottom: 12 }}>
                Conducteurs — classement absences
              </div>
              {condRank.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px 0", color: C.gray400, fontSize: 13 }}>Aucune absence enregistrée</div>
              ) : condRank.map((c, i) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <span style={{ width: 24, fontSize: 12, fontWeight: 900, color: i === 0 ? C.red : C.gray400 }}>#{i + 1}</span>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{c.nom}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ height: 8, borderRadius: 4, background: C.red,
                      width: Math.max(20, c.count * 12), maxWidth: 120 }} />
                    <span style={{ fontSize: 13, fontWeight: 800, minWidth: 24 }}>{c.count}j</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ TAB : VALIDATIONS ═══════════════════════════════════════════════ */}
        {tab === "validation" && (
          <div>
            {repAValider.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: C.gray400 }}>
                <CheckCircle2 size={48} strokeWidth={1} style={{ marginBottom: 12, display: "block", margin: "0 auto 12px" }} />
                <p style={{ fontWeight: 700, fontSize: 15 }}>Aucune réparation en attente de validation</p>
              </div>
            ) : repAValider.map(r => {
              const vv = r.vehicule as { plaque?: string; marque?: string; modele?: string } | undefined;
              const isRefusing = refusOpen === r.id;
              return (
                <div key={r.id} style={{ background: C.white, borderRadius: 16, padding: 20,
                  marginBottom: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
                  borderLeft: `4px solid ${C.red}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 17, color: C.navy }}>{vv?.plaque || r.vehicule_id}</div>
                      <div style={{ fontSize: 12, color: C.gray400 }}>{vv?.marque} {vv?.modele}</div>
                      {r.date_reception && <div style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>📥 Réceptionné {fmtDate(r.date_reception)}</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 26, fontWeight: 900, color: C.red }}>{(r.cout_estime ?? 0).toLocaleString("fr-CH")} CHF</div>
                      <div style={{ fontSize: 11, color: C.gray400 }}>Coût estimé</div>
                    </div>
                  </div>
                  <p style={{ fontSize: 14, color: "#1E293B", lineHeight: 1.6, margin: "0 0 12px",
                    borderLeft: `3px solid ${C.gray200}`, paddingLeft: 10 }}>{r.description}</p>
                  {r.commentaire_mecanicien && !r.commentaire_mecanicien.startsWith("[Refusé") && (
                    <div style={{ background: C.gray50, borderRadius: 10, padding: "8px 12px",
                      fontSize: 13, color: C.gray600, marginBottom: 14, fontStyle: "italic" }}>
                      💬 {r.commentaire_mecanicien.split(" | ").filter(s => !s.startsWith("Photos:")).join(" | ")}
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
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {!isRefusing ? (
                      <>
                        <button onClick={() => doValider(r)} disabled={valBusy}
                          style={{ flex: 1, minWidth: 120, padding: "12px 0", borderRadius: 10,
                            border: "none", background: C.green, color: C.white, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                          ✅ Valider
                        </button>
                        <button onClick={() => { setRefusOpen(r.id); setRefusMotif(""); }}
                          style={{ flex: 1, minWidth: 120, padding: "12px 0", borderRadius: 10,
                            border: `2px solid ${C.red}`, background: C.white, color: C.red, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                          ❌ Refuser
                        </button>
                        <button onClick={() => printFiche(r)}
                          style={{ padding: "12px 18px", borderRadius: 10, border: `1px solid ${C.gray200}`,
                            background: C.white, color: C.gray600, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                          🖨 Imprimer
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

            {/* Historique validations */}
            {reparations.filter(r =>
              ["en_reparation","remis_en_circulation"].includes(r.statut) ||
              (r.statut === "receptionne" && (r.commentaire_mecanicien || "").startsWith("[Refusé"))
            ).length > 0 && (
              <div style={{ marginTop: 32 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: C.gray600, marginBottom: 14 }}>
                  Historique des validations
                </div>
                {reparations.filter(r =>
                  ["en_reparation","remis_en_circulation"].includes(r.statut) ||
                  (r.statut === "receptionne" && (r.commentaire_mecanicien || "").startsWith("[Refusé"))
                ).map(r => {
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
                            <span style={{ fontWeight: 800, fontSize: 14 }}>{(r.cout_estime ?? 0).toLocaleString("fr-CH")} CHF</span>
                          )}
                          <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                            background: wasRefused ? C.redL : C.greenL, color: wasRefused ? C.red : C.green }}>
                            {wasRefused ? "Refusé" : "Validé"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ TAB : HISTORIQUE ════════════════════════════════════════════════ */}
        {tab === "historique" && (
          <div>
            {/* Sélecteur année */}
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

            {/* Grille mois */}
            {histMonth === null && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12 }}>
                {([9,10,11,12,1,2,3,4,5,6,7,8]).map(m => {
                  const yr = m >= 9 ? histYear : histYear + 1;
                  const data = histMonthData(yr, m);
                  const hasData = data.incidents > 0 || data.absences > 0 || data.reparations > 0;
                  return (
                    <div key={m} onClick={() => setHistMonth(m)}
                      style={{ background: C.white, borderRadius: 14, padding: 16, cursor: "pointer",
                        boxShadow: "0 1px 6px rgba(0,0,0,0.06)", opacity: hasData ? 1 : 0.5,
                        borderTop: `3px solid ${hasData ? C.navy : C.gray200}` }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: C.navy, marginBottom: 8 }}>
                        {MONTHS_FR[m - 1]}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {data.incidents > 0 && <span style={{ fontSize: 11, color: C.red }}>🚨 {data.incidents}</span>}
                        {data.absences > 0 && <span style={{ fontSize: 11, color: C.amber }}>👤 {data.absences}</span>}
                        {data.reparations > 0 && <span style={{ fontSize: 11, color: C.navyL }}>🔧 {data.reparations}</span>}
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

            {/* Calendrier jours */}
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
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 24, fontWeight: 900, color: C.red }}>{data.incidents}</div>
                        <div style={{ fontSize: 11, color: C.gray400 }}>Incidents</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 24, fontWeight: 900, color: C.amber }}>{data.absences}</div>
                        <div style={{ fontSize: 11, color: C.gray400 }}>Absences</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 24, fontWeight: 900, color: C.navyL }}>{data.reparations}</div>
                        <div style={{ fontSize: 11, color: C.gray400 }}>Réparations</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
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
                            <span style={{ fontWeight: 700, fontSize: 13 }}>{d}</span>
                            {hasData && !isToday && (
                              <div style={{ display: "flex", gap: 2, marginTop: 2 }}>
                                {di.length > 0 && <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.red }} />}
                                {da.length > 0 && <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.amber }} />}
                                {dr.length > 0 && <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.navy }} />}
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

            {/* Détail jour */}
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
                          <div style={{ fontWeight: 700, fontSize: 14, color: C.red }}>🚨 {i.type}</div>
                          <div style={{ fontSize: 13, color: C.gray600, marginTop: 4 }}>{i.description}</div>
                        </div>
                      ))}
                      {da.map(a => {
                        const cond = a.conducteur as { prenom?: string; nom?: string } | undefined;
                        return (
                          <div key={a.id} style={{ background: C.white, borderRadius: 12, padding: 14,
                            marginBottom: 8, borderLeft: `3px solid ${C.amber}` }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: C.amber }}>
                              👤 {cond?.prenom} {cond?.nom}
                            </div>
                            <div style={{ fontSize: 13, color: C.gray600, marginTop: 4 }}>
                              {a.motif || "—"} · {a.status === "couvert" ? "✅ Couvert" : "⚠️ Non couvert"}
                            </div>
                          </div>
                        );
                      })}
                      {dr.map(r => {
                        const vv = r.vehicule as { plaque?: string } | undefined;
                        return (
                          <div key={r.id} style={{ background: C.white, borderRadius: 12, padding: 14,
                            marginBottom: 8, borderLeft: `3px solid ${C.navy}` }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: C.navy }}>🔧 {vv?.plaque || r.vehicule_id}</div>
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
        {/* ══ TAB : MESSAGES ═════════════════════════════════════════════════ */}
        {tab === "messages" && (
          <div>
            {adminMsgs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: C.gray400 }}>
                <MessageSquare size={48} strokeWidth={1} style={{ marginBottom: 12, display: "block", margin: "0 auto 12px" }} />
                <p style={{ fontWeight: 700, fontSize: 15 }}>Aucun message du mécanicien</p>
              </div>
            ) : adminMsgs.map(m => (
              <div key={m.id} style={{ background: m.read ? C.gray50 : C.white, borderRadius: 14, padding: 18,
                marginBottom: 12, border: `1px solid ${m.read ? C.gray200 : C.navyL}`,
                boxShadow: m.read ? "none" : "0 2px 10px rgba(0,0,0,0.08)",
                borderLeft: `4px solid ${m.read ? C.gray400 : C.navyL}` }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: C.navyL }}>
                    🔧 Mécanicien
                    {!m.read && (
                      <span style={{ marginLeft: 8, background: C.navyL, color: C.white,
                        borderRadius: 99, padding: "1px 7px", fontSize: 10, fontWeight: 900 }}>
                        Nouveau
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: C.gray400 }}>
                    {fmtDateTime(m.created_at)}
                  </div>
                </div>
                <p style={{ fontSize: 14, color: "#1E293B", lineHeight: 1.5, margin: "0 0 12px" }}>
                  {(m.message || "").replace("💬 Message du mécanicien : ", "")}
                </p>
                {!m.read && (
                  <button onClick={async () => {
                    await sb.from("alertes")
                      .update({ read: true, read_at: new Date().toISOString() }).eq("id", m.id);
                    load();
                  }} style={{ padding: "9px 20px", borderRadius: 10,
                    border: `2px solid ${C.navyL}`, background: C.white,
                    color: C.navyL, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                    Lu ✓
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
