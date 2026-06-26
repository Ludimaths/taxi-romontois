"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import {
  Bus, Users, Wrench, AlertTriangle, LayoutDashboard,
  Download, LogOut, BarChart2, CheckCircle2, CalendarDays, MessageSquare,
  CheckSquare, History, Map, Bell, Heart,
} from "lucide-react";
import MessagerieBox from "@/components/MessagerieBox";
import { createClient } from "@/lib/supabase/client";
import { C, fmtDate, fmtDateTime, isoToday } from "@/lib/constants";
import type { Conducteur, Vehicule, Incident, Reparation, AbsenceConducteur, Alerte, CongesDemande } from "@/lib/types";

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
function groupByDay<T extends { created_at: string }>(items: T[]): { day: string; label: string; items: T[] }[] {
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const map: Record<string, T[]> = {};
  items.forEach(m => {
    const d = m.created_at.slice(0, 10);
    if (!map[d]) map[d] = [];
    map[d].push(m);
  });
  return Object.entries(map).sort(([a], [b]) => b.localeCompare(a)).map(([day, items]) => {
    const d = new Date(day + "T00:00:00");
    let label = day;
    if (d.getTime() === today.getTime()) label = "Aujourd'hui";
    else if (d.getTime() === yesterday.getTime()) label = "Hier";
    else label = d.toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return { day, label, items: items.slice().sort((x, y) => y.created_at.localeCompare(x.created_at)) };
  });
}
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
  const [logoErr, setLogoErr] = useState(false);

  const [conducteurs,  setConducteurs]  = useState<Conducteur[]>([]);
  const [vehicules,    setVehicules]    = useState<Vehicule[]>([]);
  const [incidents,    setIncidents]    = useState<Incident[]>([]);
  const [reparations,  setReparations]  = useState<Reparation[]>([]);
  const [absencesCond, setAbsencesCond] = useState<AbsenceConducteur[]>([]);

  const [refusOpen,  setRefusOpen]  = useState<number | null>(null);
  const [refusMotif, setRefusMotif] = useState("");
  const [valBusy,    setValBusy]    = useState(false);
  const [adminMsgs,  setAdminMsgs]  = useState<Alerte[]>([]);
  const [msgExpandedDays, setMsgExpandedDays] = useState<Record<string, boolean>>({});

  // Congés
  const [congesAdmin,        setCongesAdmin]        = useState<CongesDemande[]>([]);
  const [congeAdminRefusId,  setCongeAdminRefusId]  = useState<number | null>(null);
  const [congeAdminRefusMotif, setCongeAdminRefusMotif] = useState("");
  const [congeAdminBusy,     setCongeAdminBusy]     = useState(false);

  const [histYear,  setHistYear]  = useState(currentSchoolYear());
  const [histMonth, setHistMonth] = useState<number | null>(null);
  const [histDay,   setHistDay]   = useState<string | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────────
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
      sb.from("alertes")
        .select("*")
        .eq("type", "msg_meca_admin")
        .order("created_at", { ascending: false })
        .limit(50),
      sb.from("conges_demandes")
        .select("*,conducteur:conducteurs!conducteur_id(prenom,nom)")
        .eq("statut", "transmis_admin")
        .order("created_at", { ascending: false }),
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

  // ── Congés direction ────────────────────────────────────────────────────────
  async function doAccepterConge(conge: CongesDemande) {
    setCongeAdminBusy(true);
    const cond = conge.conducteur as { prenom?: string; nom?: string } | undefined;
    await sb.from("conges_demandes").update({
      statut: "accepte", updated_at: new Date().toISOString(),
    }).eq("id", conge.id);
    await sb.from("alertes").insert({
      type: "conducteur", severity: "normale", driver_id: conge.conducteur_id, read: false,
      message: `Direction : votre congé du ${fmtDate(conge.date_debut)} au ${fmtDate(conge.date_fin)} (${conge.motif}) a été approuvé.`,
    });
    await sb.from("alertes").insert({
      type: "conducteur", severity: "normale", read: false,
      message: `Direction : congé de ${cond?.prenom} ${cond?.nom} approuvé — du ${fmtDate(conge.date_debut)} au ${fmtDate(conge.date_fin)}`,
    });
    await load();
    setCongeAdminBusy(false);
  }

  async function doRefuserConge(conge: CongesDemande) {
    if (!congeAdminRefusMotif.trim()) return;
    setCongeAdminBusy(true);
    const cond = conge.conducteur as { prenom?: string; nom?: string } | undefined;
    await sb.from("conges_demandes").update({
      statut: "refuse", motif_refus: congeAdminRefusMotif.trim(),
      updated_at: new Date().toISOString(),
    }).eq("id", conge.id);
    await sb.from("alertes").insert({
      type: "conducteur", severity: "haute", driver_id: conge.conducteur_id, read: false,
      message: `Direction : votre demande de congé du ${fmtDate(conge.date_debut)} au ${fmtDate(conge.date_fin)} a été refusée. Motif : ${congeAdminRefusMotif.trim()}`,
    });
    await sb.from("alertes").insert({
      type: "conducteur", severity: "normale", read: false,
      message: `Direction : congé de ${cond?.prenom} ${cond?.nom} refusé — du ${fmtDate(conge.date_debut)} au ${fmtDate(conge.date_fin)}`,
    });
    setCongeAdminRefusId(null); setCongeAdminRefusMotif("");
    await load();
    setCongeAdminBusy(false);
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
  const cPresents   = conducteurs.filter(d => ["en_service","disponible"].includes(d.status)).length;
  const incOuverts  = incidents.filter(i => i.status !== "resolu").length;
  const repEnCours  = reparations.filter(r => ["en_reparation","en_attente_piece"].includes(r.statut)).length;
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
        message: `Réparation validée — ${plaque} (${(rep.cout_estime ?? 0).toLocaleString("fr-CH")} CHF)` },
      // Notification mécanicien → onglet Messages
      { type: "decision_admin", severity: "normale", read: false, vehicle_id: rep.vehicule_id,
        message: `Admin a validé la réparation de ${plaque} — ${(rep.cout_estime ?? 0).toLocaleString("fr-CH")} CHF. Vous pouvez continuer.` },
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
        message: `Réparation refusée — ${plaque} : ${refusMotif.trim()}` },
      // Notification mécanicien → onglet Messages
      { type: "decision_admin", severity: "haute", read: false, vehicle_id: rep.vehicule_id,
        message: `Admin a refusé la réparation de ${plaque} — Motif : ${refusMotif.trim()}` },
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

  // ── Grille 4×2 accès rapide ─────────────────────────────────────────────────────
  const QUICK_ACCESS = [
    { icon: <Users size={26} />,         label: "Conducteurs",  path: "/gestionnaire/conducteurs", color: C.navy   },
    { icon: <Bus size={26} />,           label: "Véhicules",    path: "/gestionnaire/vehicules",   color: "#2563EB" },
    { icon: <Map size={26} />,           label: "Circuits",     path: "/gestionnaire/circuits",    color: C.navyL  },
    { icon: <AlertTriangle size={26} />, label: "Incidents",    path: "/gestionnaire/incidents",   color: C.red    },
    { icon: <Wrench size={26} />,        label: "Réparations",  path: "/gestionnaire/reparations", color: C.amber  },
    { icon: <Bell size={26} />,          label: "Alertes",      path: "/gestionnaire/alertes",     color: "#7C3AED" },
    { icon: <Download size={26} />,      label: "Exports",      path: "/gestionnaire/export",      color: C.green  },
    { icon: <Heart size={26} />,         label: "Parents",      path: "/gestionnaire/parents",     color: "#DB2777" },
  ];

  const TABS: { id: AdminTab; icon: React.ReactNode; label: string; badge?: number }[] = [
    { id: "dashboard",   icon: <LayoutDashboard size={17} />, label: "Tableau de bord"                                       },
    { id: "stats",       icon: <BarChart2 size={17} />,       label: "Statistiques"                                          },
    { id: "validation",  icon: <CheckSquare size={17} />,     label: "Validations",  badge: repAValider.length + congesAdmin.length },
    { id: "historique",  icon: <History size={17} />,         label: "Historique"                                            },
    { id: "messages",    icon: <MessageSquare size={17} />,   label: "Messages",     badge: unreadMsgCount || undefined      },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.gray50 }}>

      {/* ── Sidebar admin ──────────────────────────────────────────────────── */}
      <aside style={{ width: 228, background: C.navy, display: "flex", flexDirection: "column",
        flexShrink: 0, boxShadow: "2px 0 12px rgba(0,0,0,0.2)", position: "sticky", top: 0,
        height: "100vh" }}>
        {/* Logo + titre */}
        <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          {logoErr
            ? <div style={{ color: C.white, fontWeight: 900, fontSize: 16 }}>Taxi Romontois</div>
            : <img src="/logo.png" alt="Taxi Romontois"
                style={{ width: 140, height: "auto", objectFit: "contain", display: "block" }}
                onError={() => setLogoErr(true)} />}
          <div style={{ color: C.white, fontWeight: 800, fontSize: 14, marginTop: 10 }}>Taxi Romontois</div>
        </div>
        {/* Avatar */}
        <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,0.1)",
          display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: "50%", background: C.white, color: C.navy,
            display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16 }}>
            AA
          </div>
          <div>
            <div style={{ fontSize: 14, color: C.white, fontWeight: 700 }}>Admin</div>
            <div style={{ fontSize: 12, color: C.sky, fontWeight: 600 }}>Administrateur</div>
          </div>
        </div>
        {/* Nav */}
        <nav style={{ flex: 1, padding: "10px", overflowY: "auto" }}>
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                  background: active ? C.white : "transparent", color: active ? C.navy : C.white,
                  fontWeight: active ? 800 : 600, fontSize: 13, textAlign: "left", marginBottom: 2,
                  transition: "background .15s" }}>
                {t.icon}
                <span style={{ flex: 1 }}>{t.label}</span>
                {t.badge != null && t.badge > 0 && (
                  <span style={{ background: C.red, color: C.white, borderRadius: 20,
                    fontSize: 10, fontWeight: 800, padding: "1px 7px" }}>{t.badge}</span>
                )}
              </button>
            );
          })}
        </nav>
        {/* Footer */}
        <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <button onClick={handleSignOut}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.15)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            style={{ width: "100%", background: "transparent", border: "none", color: C.white,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: "12px 16px",
              borderRadius: 10, fontWeight: 700, fontSize: 14, transition: "background .15s" }}>
            <LogOut size={16} color={C.white} /> Déconnexion
          </button>
        </div>
      </aside>

      {/* ── Contenu principal ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", maxHeight: "100vh" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px" }}>

        {/* ══ TAB : TABLEAU DE BORD ════════════════════════════════════════════ */}
        {tab === "dashboard" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>

            {/* ── Colonne gauche ── */}
            <div>
              {/* 4 KPI compacts */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Véhicules en service",   value: vEnService,         color: C.green  },
                  { label: "Conducteurs présents",   value: cPresents,          color: C.navyL  },
                  { label: "Incidents ouverts",      value: incOuverts,         color: incOuverts > 0 ? C.red : C.green },
                  { label: "Réparations en cours",   value: repEnCours,         color: repEnCours > 0 ? C.amber : C.green },
                ].map(s => (
                  <div key={s.label} style={{ background: C.white, borderRadius: 14,
                    padding: "18px 14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                    borderTop: `3px solid ${s.color}` }}>
                    <div style={{ fontSize: 30, fontWeight: 900, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.gray600, marginTop: 4, lineHeight: 1.3 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Grille 4×2 accès rapide */}
              <div style={{ fontWeight: 800, fontSize: 11, color: C.gray400, textTransform: "uppercase",
                letterSpacing: 0.5, marginBottom: 12 }}>
                Accès rapide
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
                {QUICK_ACCESS.map(c => (
                  <div key={c.path} onClick={() => router.push(c.path)}
                    style={{ background: C.white, borderRadius: 14, padding: "18px 12px",
                      cursor: "pointer", boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
                      borderTop: `3px solid ${c.color}`, display: "flex", flexDirection: "column",
                      alignItems: "center", gap: 8, textAlign: "center" }}>
                    <span style={{ color: c.color }}>{c.icon}</span>
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.navy }}>{c.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Colonne droite ── */}
            <div>
              {/* Budget — priorité validation */}
              {repAValider.length > 0 && (
                <div style={{ background: C.redL, borderRadius: 14, padding: 16,
                  borderLeft: `4px solid ${C.red}`, marginBottom: 14 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: C.red, marginBottom: 10,
                    display: "flex", alignItems: "center", gap: 6 }}>
                    <AlertTriangle size={14} color={C.red} />
                    {repAValider.length} réparation(s) à valider
                  </div>
                  {repAValider.map(r => {
                    const vv = r.vehicule as { plaque?: string } | undefined;
                    return (
                      <div key={r.id} style={{ display: "flex", justifyContent: "space-between",
                        alignItems: "center", padding: "6px 0",
                        borderBottom: `1px solid ${C.red}20`, flexWrap: "wrap", gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{vv?.plaque || r.vehicule_id}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontWeight: 900, color: C.red, fontSize: 13 }}>
                            {(r.cout_estime ?? 0).toLocaleString("fr-CH")} CHF
                          </span>
                          <button onClick={() => setTab("validation")}
                            style={{ padding: "4px 10px", borderRadius: 8, border: "none",
                              background: C.red, color: C.white, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                            →
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Congés en attente */}
              {congesAdmin.length > 0 && (
                <div style={{ background: "#EFF6FF", borderRadius: 14, padding: 14,
                  borderLeft: `4px solid #2563EB`, marginBottom: 14 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#2563EB", marginBottom: 8,
                    display: "flex", alignItems: "center", gap: 6 }}>
                    <CalendarDays size={14} />
                    {congesAdmin.length} congé(s) à valider
                  </div>
                  <button onClick={() => setTab("validation")}
                    style={{ width: "100%", padding: "8px 0", borderRadius: 8, border: "none",
                      background: "#2563EB", color: C.white, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    Voir les demandes →
                  </button>
                </div>
              )}

              {repAValider.length === 0 && congesAdmin.length === 0 && (
                <div style={{ background: C.greenL, borderRadius: 14, padding: 16,
                  borderLeft: `4px solid ${C.green}`, display: "flex", alignItems: "center", gap: 8 }}>
                  <CheckCircle2 size={16} color={C.green} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.green }}>
                    Aucune validation en attente
                  </span>
                </div>
              )}
            </div>
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
            {/* Congés transmis par gestionnaire */}
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
                    <div key={conge.id} style={{ background: C.white, borderRadius: 16, padding: 20,
                      marginBottom: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
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
                          <div style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>
                            Soumis le {fmtDate(conge.created_at.slice(0, 10))}
                          </div>
                        </div>
                        <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                          background: "#EFF6FF", color: "#2563EB" }}>
                          Transmis gestionnaire
                        </span>
                      </div>
                      <p style={{ fontSize: 14, color: "#1E293B", lineHeight: 1.6, margin: "0 0 10px",
                        borderLeft: `3px solid ${C.gray200}`, paddingLeft: 10 }}>
                        {conge.justification}
                      </p>
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
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {!isRefusing ? (
                          <>
                            <button onClick={() => doAccepterConge(conge)} disabled={congeAdminBusy}
                              style={{ flex: 1, minWidth: 120, padding: "12px 0", borderRadius: 10,
                                border: "none", background: C.green, color: C.white, fontWeight: 800, fontSize: 14, cursor: "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                              <CheckCircle2 size={16} /> Approuver
                            </button>
                            <button onClick={() => { setCongeAdminRefusId(conge.id); setCongeAdminRefusMotif(""); }}
                              style={{ flex: 1, minWidth: 120, padding: "12px 0", borderRadius: 10,
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
                <CheckCircle2 size={48} strokeWidth={1} style={{ marginBottom: 12, display: "block", margin: "0 auto 12px" }} />
                <p style={{ fontWeight: 700, fontSize: 15 }}>Aucun élément en attente de validation</p>
              </div>
            ) : repAValider.length > 0 && (
              <div>
                {congesAdmin.length > 0 && (
                  <div style={{ fontWeight: 800, fontSize: 15, color: C.navy, marginBottom: 14,
                    display: "flex", alignItems: "center", gap: 8 }}>
                    <Wrench size={18} /> Réparations à valider ({repAValider.length})
                  </div>
                )}
            </div>
            )}
            {repAValider.length > 0 && repAValider.map(r => {
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
                      {r.date_reception && <div style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>Réceptionné {fmtDate(r.date_reception)}</div>}
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
                      {r.commentaire_mecanicien.split(" | ").filter(s => !s.startsWith("Photos:")).join(" | ")}
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
                          <span style={{display:"flex",alignItems:"center",gap:6}}><CheckCircle2 size={15} /> Valider</span>
                        </button>
                        <button onClick={() => { setRefusOpen(r.id); setRefusMotif(""); }}
                          style={{ flex: 1, minWidth: 120, padding: "12px 0", borderRadius: 10,
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
                          <div style={{ fontWeight: 700, fontSize: 14, color: C.red }}><span style={{display:"flex",alignItems:"center",gap:6}}><AlertTriangle size={13} color={C.red} /> {i.type}</span></div>
                          <div style={{ fontSize: 13, color: C.gray600, marginTop: 4 }}>{i.description}</div>
                        </div>
                      ))}
                      {da.map(a => {
                        const cond = a.conducteur as { prenom?: string; nom?: string } | undefined;
                        return (
                          <div key={a.id} style={{ background: C.white, borderRadius: 12, padding: 14,
                            marginBottom: 8, borderLeft: `3px solid ${C.amber}` }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: C.amber }}>
                              <span style={{display:"flex",alignItems:"center",gap:6}}><Users size={13} color={C.amber} /> {cond?.prenom} {cond?.nom}</span>
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
                            <div style={{ fontWeight: 700, fontSize: 14, color: C.navy }}><span style={{display:"flex",alignItems:"center",gap:6}}><Wrench size={13} color={C.navy} /> {vv?.plaque || r.vehicule_id}</span></div>
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
            {/* Messagerie directe */}
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

            {/* Messages du mécanicien (alertes) */}
            {adminMsgs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: C.gray400 }}>
                <MessageSquare size={48} strokeWidth={1} style={{ marginBottom: 12, display: "block", margin: "0 auto 12px" }} />
                <p style={{ fontWeight: 700, fontSize: 15 }}>Aucun message du mécanicien</p>
              </div>
            ) : groupByDay(adminMsgs).map((grp, gi) => {
              const isFirst = gi === 0;
              const open = isFirst || msgExpandedDays[grp.day];
              return (
              <div key={grp.day}>
                <div onClick={() => !isFirst && setMsgExpandedDays(s => ({ ...s, [grp.day]: !s[grp.day] }))}
                  style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0 10px",
                    cursor: isFirst ? "default" : "pointer" }}>
                  <div style={{ flex: 1, height: 1, background: C.gray200 }} />
                  <span style={{ fontSize: 11, fontWeight: 800, color: C.gray600, textTransform: "uppercase",
                    letterSpacing: 0.5, whiteSpace: "nowrap" }}>{grp.label}</span>
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
                  <div style={{ fontSize: 12, color: C.gray400 }}>
                    {fmtDateTime(m.created_at)}
                  </div>
                </div>
                <p style={{ fontSize: 14, color: "#1E293B", lineHeight: 1.5, margin: "0 0 12px" }}>
                  {(m.message || "").replace("Message du mécanicien : ", "")}
                </p>
                {!m.read && (
                  <button onClick={async () => {
                    await sb.from("alertes")
                      .update({ read: true, read_at: new Date().toISOString() }).eq("id", m.id);
                    load();
                  }} style={{ padding: "9px 20px", borderRadius: 10,
                    border: `2px solid ${C.navyL}`, background: C.white,
                    color: C.navyL, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
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
      </div>
    </div>
  );
}
