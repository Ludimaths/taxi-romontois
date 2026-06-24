"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { C, fmtDate, fmtDateTime, isoToday } from "@/lib/constants";
import type { Conducteur, Vehicule, Incident, Reparation, AbsenceConducteur } from "@/lib/types";

type AdminTab = "stats" | "graphiques" | "validation" | "historique" | "acces";
type Period  = "week" | "month" | "annee";

const PIE_COLORS = [C.red, C.amber, "#2563EB", C.green, C.purple ?? "#7C3AED", C.gray400];

const inp: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 10,
  border: `1.5px solid ${C.gray200}`, fontSize: 14, color: C.gray800,
  background: C.white, boxSizing: "border-box",
};

// ── helpers ──────────────────────────────────────────────────────────────────
function addDays(iso: string, n: number) {
  const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string) {
  return Math.round((+new Date(b) - +new Date(a)) / 86400000);
}
function monthKey(iso: string) { return iso.slice(0, 7); }
function schoolYearStart(year: number) { return `${year}-09-01`; }
function schoolYearEnd(year: number)   { return `${year + 1}-08-31`; }
function currentSchoolYear() {
  const m = new Date().getMonth(); // 0=Jan
  return m >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1;
}

// ── Micro-composants ─────────────────────────────────────────────────────────
function Sec({ title, children, id }: { title: string; children: React.ReactNode; id: string }) {
  return (
    <section id={id} style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 18, fontWeight: 900, color: C.navy, marginBottom: 16,
        paddingBottom: 10, borderBottom: `2px solid ${C.gray100}` }}>
        {title}
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value, sub, color = C.navy, badge }: {
  label: string; value: number | string; sub?: string; color?: string; badge?: boolean;
}) {
  return (
    <div style={{ background: C.white, borderRadius: 14, padding: "16px 18px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.07)", borderTop: `3px solid ${color}`, position: "relative" }}>
      {badge && (value as number) > 0 && (
        <span style={{ position: "absolute", top: 10, right: 12, background: C.red, color: C.white,
          borderRadius: 99, padding: "2px 7px", fontSize: 11, fontWeight: 800 }}>!</span>
      )}
      <div style={{ fontSize: 28, fontWeight: 900, color }}>{value}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.gray600, marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function PeriodBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ padding: "8px 16px", borderRadius: 10, border: "none",
      fontWeight: 700, fontSize: 13, cursor: "pointer",
      background: active ? C.navy : C.gray100, color: active ? C.white : C.gray600 }}>
      {label}
    </button>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const sb     = createClient();
  const router = useRouter();

  const [tab,     setTab]     = useState<AdminTab>("stats");
  const [period,  setPeriod]  = useState<Period>("month");
  const [loading, setLoading] = useState(true);

  const [conducteurs,   setConducteurs]   = useState<Conducteur[]>([]);
  const [vehicules,     setVehicules]     = useState<Vehicule[]>([]);
  const [incidents,     setIncidents]     = useState<Incident[]>([]);
  const [reparations,   setReparations]   = useState<Reparation[]>([]);
  const [absencesCond,  setAbsencesCond]  = useState<AbsenceConducteur[]>([]);

  // Section 3 — validation
  const [refusOpen,  setRefusOpen]  = useState<number | null>(null);
  const [refusMotif, setRefusMotif] = useState("");
  const [valBusy,    setValBusy]    = useState(false);

  // Section 4 — historique
  const [histYear,  setHistYear]  = useState(currentSchoolYear());
  const [histMonth, setHistMonth] = useState<number | null>(null);
  const [histDay,   setHistDay]   = useState<string | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const yearAgo = addDays(isoToday(), -365);
    const [c, v, inc, rep, abs] = await Promise.all([
      sb.from("conducteurs").select("*").order("nom"),
      sb.from("vehicules").select("*").order("plaque"),
      sb.from("incidents").select("*,vehicule:vehicules(id,plaque),conducteur:conducteurs(prenom,nom)")
        .gte("reported_at", yearAgo).order("reported_at", { ascending: false }),
      sb.from("reparations").select("*,vehicule:vehicules(id,plaque,marque,modele)")
        .gte("created_at", yearAgo).order("created_at", { ascending: false }),
      sb.from("absences_conducteurs")
        .select("*,conducteur:conducteurs!conducteur_id(prenom,nom)")
        .gte("date_absence", yearAgo).order("date_absence", { ascending: false }),
    ]);
    setConducteurs(c.data ?? []);
    setVehicules(v.data ?? []);
    setIncidents(inc.data ?? []);
    setReparations(rep.data ?? []);
    setAbsencesCond(abs.data ?? []);
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

  // ── Period filter ─────────────────────────────────────────────────────────
  function periodStart(): string {
    const today = isoToday();
    if (period === "week")  return addDays(today, -7);
    if (period === "month") return `${today.slice(0, 7)}-01`;
    const sy = currentSchoolYear();
    return schoolYearStart(sy);
  }

  const filteredIncidents  = incidents.filter(i => i.reported_at.slice(0, 10) >= periodStart());
  const filteredReparations = reparations.filter(r => (r.date_reception || r.created_at.slice(0, 10)) >= periodStart());
  const filteredAbsences   = absencesCond.filter(a => a.date_absence >= periodStart());

  // ── Computed — stats ──────────────────────────────────────────────────────
  const today = isoToday();
  const vEnService   = vehicules.filter(v => (v.etat as string) === "bon" || (v.etat as string) === "en_service").length;
  const vReparation  = vehicules.filter(v => ["receptionne","en_reparation","en_attente_piece","repare","atelier"].includes(v.etat as string)).length;
  const vAttention   = vehicules.filter(v => (v.etat as string) === "attention").length;
  const cPresents    = conducteurs.filter(d => d.status === "en_service" || d.status === "disponible").length;
  const cAbsents     = conducteurs.filter(d => d.status === "absent").length;
  const incOuverts   = incidents.filter(i => i.status !== "resolu").length;
  const repAValider  = reparations.filter(r => r.statut === "en_attente_validation");

  // ── Computed — graphiques ─────────────────────────────────────────────────
  // Incidents par jour (30 derniers jours)
  const inc30 = (() => {
    const cutoff = addDays(today, -29);
    const map: Record<string, number> = {};
    for (let i = 0; i < 30; i++) {
      const d = addDays(cutoff, i);
      map[d] = 0;
    }
    incidents.filter(i => i.reported_at.slice(0, 10) >= cutoff)
      .forEach(i => { const d = i.reported_at.slice(0, 10); if (d in map) map[d]++; });
    return Object.entries(map).map(([day, count]) => ({
      day: day.slice(5), count,
    }));
  })();

  // Coût réparations par mois
  const repCostByMonth = (() => {
    const map: Record<string, number> = {};
    filteredReparations.forEach(r => {
      const mk = monthKey(r.date_reception || r.created_at.slice(0, 10));
      map[mk] = (map[mk] ?? 0) + (r.cout ?? r.cout_estime ?? 0);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([month, total]) => ({
      month: month.slice(0, 7), total: Math.round(total),
    }));
  })();

  // Incidents par type (pie)
  const incByType = (() => {
    const map: Record<string, number> = {};
    filteredIncidents.forEach(i => { map[i.type] = (map[i.type] ?? 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  })();

  // Classement véhicules par coût
  const vehRank = (() => {
    const map: Record<string, { plaque: string; total: number }> = {};
    reparations.forEach(r => {
      const vv = r.vehicule as { plaque?: string } | undefined;
      if (!map[r.vehicule_id]) map[r.vehicule_id] = { plaque: vv?.plaque || r.vehicule_id, total: 0 };
      map[r.vehicule_id].total += r.cout ?? r.cout_estime ?? 0;
    });
    return Object.entries(map)
      .map(([id, x]) => ({ id, ...x }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  })();

  // Classement conducteurs par absences
  const condRank = (() => {
    const map: Record<string, { nom: string; count: number }> = {};
    absencesCond.forEach(a => {
      const cond = a.conducteur as { prenom?: string; nom?: string } | undefined;
      const nm = cond ? `${cond.prenom} ${cond.nom}` : String(a.conducteur_id);
      if (!map[a.conducteur_id]) map[a.conducteur_id] = { nom: nm, count: 0 };
      map[a.conducteur_id].count++;
    });
    return Object.entries(map)
      .map(([id, x]) => ({ id, ...x }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  })();

  // ── Section 3 — Validation ────────────────────────────────────────────────
  async function doValider(rep: Reparation) {
    setValBusy(true);
    const vv = rep.vehicule as { plaque?: string } | undefined;
    const plaque = vv?.plaque || rep.vehicule_id;
    await sb.from("reparations").update({ statut: "en_reparation" }).eq("id", rep.id);
    await sb.from("alertes").insert([
      { type: "reparation", severity: "normale", read: false, vehicle_id: rep.vehicule_id,
        message: `✅ Réparation validée — ${plaque} peut continuer (${(rep.cout_estime ?? 0).toLocaleString("fr-CH")} CHF)` },
      { type: "vehicule", severity: "normale", read: false, vehicle_id: rep.vehicule_id,
        message: `✅ Budget validé par l'admin — ${plaque} : réparation en cours` },
    ]);
    setValBusy(false);
    load();
  }

  async function doRefuser(rep: Reparation) {
    if (!refusMotif.trim()) return;
    setValBusy(true);
    const vv = rep.vehicule as { plaque?: string } | undefined;
    const plaque = vv?.plaque || rep.vehicule_id;
    await sb.from("reparations").update({ statut: "receptionne", commentaire_mecanicien:
      `[Refusé par admin: ${refusMotif.trim()}]` }).eq("id", rep.id);
    await sb.from("alertes").insert([
      { type: "reparation", severity: "haute", read: false, vehicle_id: rep.vehicule_id,
        message: `❌ Réparation refusée — ${plaque} : ${refusMotif.trim()}` },
      { type: "vehicule", severity: "haute", read: false, vehicle_id: rep.vehicule_id,
        message: `❌ Budget refusé par l'admin — ${plaque} — Motif : ${refusMotif.trim()}` },
    ]);
    setRefusOpen(null);
    setRefusMotif("");
    setValBusy(false);
    load();
  }

  function printFiche(rep: Reparation) {
    const vv = rep.vehicule as { plaque?: string; marque?: string; modele?: string } | undefined;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Fiche réparation</title>
<style>body{font-family:sans-serif;padding:32px;max-width:700px;margin:auto}
h1{color:#0D3B7A;border-bottom:2px solid #0D3B7A;padding-bottom:8px}
.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee}
.label{color:#475569;font-weight:600}.value{font-weight:700;color:#1E293B}
.badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;background:#DBEAFE;color:#1D4ED8}
footer{margin-top:32px;font-size:11px;color:#94A3B8}</style></head>
<body>
<h1>🔧 Fiche réparation — ${vv?.plaque || rep.vehicule_id}</h1>
<div class="row"><span class="label">Véhicule</span><span class="value">${vv?.marque || ""} ${vv?.modele || ""} · ${vv?.plaque || rep.vehicule_id}</span></div>
<div class="row"><span class="label">Description</span><span class="value">${rep.description}</span></div>
<div class="row"><span class="label">Statut</span><span class="badge">En attente de validation</span></div>
<div class="row"><span class="label">Coût estimé</span><span class="value" style="color:#DC2626;font-size:18px">${(rep.cout_estime ?? 0).toLocaleString("fr-CH")} CHF</span></div>
${rep.date_reception ? `<div class="row"><span class="label">Date réception</span><span class="value">${fmtDate(rep.date_reception)}</span></div>` : ""}
${rep.km_reception != null ? `<div class="row"><span class="label">Km à réception</span><span class="value">${rep.km_reception.toLocaleString()} km</span></div>` : ""}
${rep.commentaire_mecanicien ? `<div class="row"><span class="label">Notes mécanicien</span><span class="value">${rep.commentaire_mecanicien}</span></div>` : ""}
<div class="row"><span class="label">Créé le</span><span class="value">${fmtDateTime(rep.created_at)}</span></div>
<footer>Taxi Romontois · Imprimé le ${new Date().toLocaleDateString("fr-CH")} à ${new Date().toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}</footer>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300); }
  }

  // ── Section 4 — Historique ────────────────────────────────────────────────
  function histDaysInMonth(year: number, month: number) {
    return new Date(year, month, 0).getDate();
  }

  function histDayData(day: string) {
    const dayInc = incidents.filter(i => i.reported_at.slice(0, 10) === day);
    const dayAbs = absencesCond.filter(a => a.date_absence === day);
    const dayRep = reparations.filter(r =>
      (r.date_reception || r.created_at.slice(0, 10)) === day
    );
    return { incidents: dayInc, absences: dayAbs, reparations: dayRep };
  }

  function histMonthData(year: number, month: number) {
    const pad = String(month).padStart(2, "0");
    const mk = `${year}-${pad}`;
    const mInc = incidents.filter(i => i.reported_at.slice(0, 7) === mk).length;
    const mAbs = absencesCond.filter(a => a.date_absence.slice(0, 7) === mk).length;
    const mRep = reparations.filter(r => (r.date_reception || r.created_at.slice(0, 10)).slice(0, 7) === mk);
    const mCost = mRep.reduce((s, r) => s + (r.cout ?? r.cout_estime ?? 0), 0);
    return { incidents: mInc, absences: mAbs, reparations: mRep.length, cout: mCost };
  }

  // Export CSV historique mois
  function exportCSV(year: number, month: number) {
    const pad = String(month).padStart(2, "0");
    const mk = `${year}-${pad}`;
    const days = histDaysInMonth(year, month);
    const rows = [["Jour","Incidents","Absences conducteurs","Réparations"]];
    for (let d = 1; d <= days; d++) {
      const day = `${mk}-${String(d).padStart(2, "0")}`;
      const { incidents: di, absences: da, reparations: dr } = histDayData(day);
      rows.push([day, String(di.length), String(da.length), String(dr.length)]);
    }
    const csv = rows.map(r => r.join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `historique-${mk}.csv`;
    a.click();
  }

  const MONTHS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const SY_START = currentSchoolYear();

  if (loading) return (
    <div style={{ textAlign: "center", padding: 60, color: C.gray400, fontSize: 14 }}>Chargement…</div>
  );

  // ── Tab nav ───────────────────────────────────────────────────────────────
  const TABS: { id: AdminTab; label: string; badge?: number }[] = [
    { id: "stats",      label: "📊 Chiffres clés", badge: repAValider.length || undefined },
    { id: "graphiques", label: "📈 Statistiques" },
    { id: "validation", label: "✅ Validation",    badge: repAValider.length || undefined },
    { id: "historique", label: "📅 Historique" },
    { id: "acces",      label: "🔗 Accès rapide" },
  ];

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 4px" }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#4A1942,#7C3AED)", borderRadius: 16,
        padding: "20px 24px", color: C.white, marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 900 }}>Administration</div>
        <div style={{ fontSize: 13, opacity: 0.75, marginTop: 3 }}>
          Vue globale · Validation budget · Statistiques · Historique
        </div>
      </div>

      {/* Tab nav */}
      <div style={{ display: "flex", gap: 6, marginBottom: 24, overflowX: "auto", paddingBottom: 4 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px",
              borderRadius: 12, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer",
              whiteSpace: "nowrap", flexShrink: 0,
              background: tab === t.id ? C.navy : C.gray100,
              color: tab === t.id ? C.white : C.gray600 }}>
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span style={{ background: C.red, color: C.white, borderRadius: 99,
                padding: "1px 7px", fontSize: 11, fontWeight: 800 }}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══ SECTION 1 — CHIFFRES CLÉS ════════════════════════════════════════ */}
      {tab === "stats" && (
        <Sec title="Chiffres clés en temps réel" id="stats">
          {/* Véhicules */}
          <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 800, color: C.gray400,
            textTransform: "uppercase", letterSpacing: 0.5 }}>Flotte</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
            <StatCard label="En service / disponibles" value={vEnService} color={C.green} />
            <StatCard label="En réparation / atelier" value={vReparation} color={C.amber} />
            <StatCard label="Attention requise" value={vAttention} color={C.red} />
          </div>

          {/* Conducteurs */}
          <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 800, color: C.gray400,
            textTransform: "uppercase", letterSpacing: 0.5 }}>Conducteurs</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            <StatCard label="Présents / disponibles" value={cPresents} color={C.green} />
            <StatCard label="Absents aujourd'hui" value={cAbsents} color={C.red} />
          </div>

          {/* Incidents + Réparations */}
          <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 800, color: C.gray400,
            textTransform: "uppercase", letterSpacing: 0.5 }}>Incidents & réparations</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            <StatCard label="Incidents ouverts" value={incOuverts} color={incOuverts > 0 ? C.red : C.green} />
            <StatCard label="Réparations à valider" value={repAValider.length}
              color={repAValider.length > 0 ? C.red : C.green}
              sub={repAValider.length > 0 ? "Action requise" : "Aucune"}
              badge />
          </div>

          {/* Liste rapide réparations à valider */}
          {repAValider.length > 0 && (
            <div style={{ background: C.redL, borderRadius: 14, padding: 16,
              borderLeft: `4px solid ${C.red}` }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: C.red, marginBottom: 12 }}>
                ⚠️ Réparations en attente de votre validation
              </div>
              {repAValider.map(r => {
                const vv = r.vehicule as { plaque?: string } | undefined;
                return (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.red}20`,
                    flexWrap: "wrap", gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{vv?.plaque || r.vehicule_id}</span>
                    <span style={{ fontWeight: 900, color: C.red }}>
                      {(r.cout_estime ?? 0).toLocaleString("fr-CH")} CHF
                    </span>
                    <button onClick={() => setTab("validation")}
                      style={{ padding: "6px 14px", borderRadius: 8, border: "none",
                        background: C.red, color: C.white, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                      Valider →
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Sec>
      )}

      {/* ══ SECTION 2 — GRAPHIQUES ═══════════════════════════════════════════ */}
      {tab === "graphiques" && (
        <Sec title="Statistiques & graphiques" id="graphiques">
          {/* Filtre période */}
          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            <PeriodBtn label="Cette semaine" active={period === "week"}  onClick={() => setPeriod("week")} />
            <PeriodBtn label="Ce mois"       active={period === "month"} onClick={() => setPeriod("month")} />
            <PeriodBtn label="Année scolaire" active={period === "annee"} onClick={() => setPeriod("annee")} />
          </div>

          {/* Incidents 30 derniers jours */}
          <div style={{ background: C.white, borderRadius: 16, padding: 20, marginBottom: 20,
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: C.navy, marginBottom: 16 }}>
              Incidents — 30 derniers jours
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={inc30} margin={{ left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.gray100} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: C.gray400 }} tickLine={false}
                  interval={4} />
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
              <div style={{ textAlign: "center", padding: "30px 0", color: C.gray400, fontSize: 13 }}>
                Aucune donnée sur cette période
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={repCostByMonth} margin={{ left: -10, bottom: 0 }}>
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

          {/* Pie — incidents par type */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div style={{ background: C.white, borderRadius: 16, padding: 20,
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.navy, marginBottom: 16 }}>
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
                      {incByType.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${C.gray200}`, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Classement véhicules par coût */}
            <div style={{ background: C.white, borderRadius: 16, padding: 20,
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.navy, marginBottom: 12 }}>
                Top véhicules — coût réparations
              </div>
              {vehRank.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: C.gray400, fontSize: 13 }}>Aucune réparation</div>
              ) : vehRank.map((v, i) => (
                <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10,
                  padding: "7px 0", borderBottom: `1px solid ${C.gray100}` }}>
                  <span style={{ width: 20, fontSize: 12, fontWeight: 900, color: i === 0 ? C.red : C.gray400 }}>
                    #{i + 1}
                  </span>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{v.plaque}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: v.total > 5000 ? C.red : C.gray800 }}>
                    {Math.round(v.total).toLocaleString("fr-CH")} CHF
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Classement conducteurs par absences */}
          <div style={{ background: C.white, borderRadius: 16, padding: 20,
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: C.navy, marginBottom: 12 }}>
              Conducteurs — classement absences
            </div>
            {condRank.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px 0", color: C.gray400, fontSize: 13 }}>Aucune absence enregistrée</div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {condRank.map((c, i) => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ width: 24, fontSize: 12, fontWeight: 900,
                      color: i === 0 ? C.red : C.gray400 }}>#{i + 1}</span>
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{c.nom}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ height: 8, borderRadius: 4, background: C.red,
                        width: Math.max(20, c.count * 12), maxWidth: 120 }} />
                      <span style={{ fontSize: 13, fontWeight: 800, color: C.gray800, minWidth: 24 }}>
                        {c.count}j
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Sec>
      )}

      {/* ══ SECTION 3 — VALIDATION ═══════════════════════════════════════════ */}
      {tab === "validation" && (
        <Sec title="Réparations à valider" id="validation">
          {repAValider.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: C.gray400 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <p style={{ fontWeight: 700, fontSize: 15 }}>Aucune réparation en attente de validation</p>
            </div>
          ) : repAValider.map(r => {
            const vv = r.vehicule as { plaque?: string; marque?: string; modele?: string } | undefined;
            const isRefusing = refusOpen === r.id;
            return (
              <div key={r.id} style={{ background: C.white, borderRadius: 16, padding: 20,
                marginBottom: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
                borderLeft: `4px solid ${C.red}` }}>
                {/* En-tête */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                  marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 17, color: C.navy }}>
                      {vv?.plaque || r.vehicule_id}
                    </div>
                    <div style={{ fontSize: 12, color: C.gray400 }}>{vv?.marque} {vv?.modele}</div>
                    {r.date_reception && (
                      <div style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>
                        📥 Réceptionné {fmtDate(r.date_reception)}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 26, fontWeight: 900, color: C.red }}>
                      {(r.cout_estime ?? 0).toLocaleString("fr-CH")} CHF
                    </div>
                    <div style={{ fontSize: 11, color: C.gray400 }}>Coût estimé</div>
                  </div>
                </div>

                <p style={{ fontSize: 14, color: "#1E293B", lineHeight: 1.6, margin: "0 0 12px",
                  borderLeft: `3px solid ${C.gray200}`, paddingLeft: 10 }}>
                  {r.description}
                </p>

                {r.commentaire_mecanicien && !r.commentaire_mecanicien.startsWith("[Refusé") && (
                  <div style={{ background: C.gray50, borderRadius: 10, padding: "8px 12px",
                    fontSize: 13, color: C.gray600, marginBottom: 14, fontStyle: "italic" }}>
                    💬 {r.commentaire_mecanicien.split(" | ").filter(s => !s.startsWith("Photos:")).join(" | ")}
                  </div>
                )}

                {/* Refus — champ motif */}
                {isRefusing && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 700,
                      color: C.red, marginBottom: 6 }}>
                      Motif du refus *
                    </label>
                    <textarea value={refusMotif} onChange={e => setRefusMotif(e.target.value)}
                      rows={2} placeholder="Ex: Obtenir deuxième devis, montant trop élevé…"
                      style={{ ...inp, resize: "vertical" }} />
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {!isRefusing ? (
                    <>
                      <button onClick={() => doValider(r)} disabled={valBusy}
                        style={{ flex: 1, minWidth: 120, padding: "12px 0", borderRadius: 10,
                          border: "none", background: C.green, color: C.white,
                          fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                        ✅ Valider
                      </button>
                      <button onClick={() => { setRefusOpen(r.id); setRefusMotif(""); }}
                        style={{ flex: 1, minWidth: 120, padding: "12px 0", borderRadius: 10,
                          border: `2px solid ${C.red}`, background: C.white, color: C.red,
                          fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
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
                          background: refusMotif.trim() ? C.red : C.gray200,
                          color: C.white, fontWeight: 800, fontSize: 14,
                          cursor: refusMotif.trim() ? "pointer" : "not-allowed" }}>
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

          {/* Historique des validations */}
          {reparations.filter(r => r.statut === "en_reparation" || r.statut === "remis_en_circulation").length > 0 && (
            <div style={{ marginTop: 32 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.gray600, marginBottom: 14 }}>
                Historique des validations passées
              </div>
              {["en_reparation", "remis_en_circulation"].flatMap(st =>
                reparations.filter(r => r.statut === st)
              ).map(r => {
                const vv = r.vehicule as { plaque?: string } | undefined;
                const wasRefused = (r.commentaire_mecanicien || "").startsWith("[Refusé");
                return (
                  <div key={r.id} style={{ background: C.gray50, borderRadius: 12, padding: 14,
                    marginBottom: 10, borderLeft: `3px solid ${wasRefused ? C.red : C.green}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{vv?.plaque || r.vehicule_id}</div>
                        <div style={{ fontSize: 12, color: C.gray400 }}>{fmtDate(r.date_reception)}</div>
                      </div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        {(r.cout_estime ?? 0) > 0 && (
                          <span style={{ fontWeight: 800, fontSize: 14, color: C.gray800 }}>
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
          )}
        </Sec>
      )}

      {/* ══ SECTION 4 — HISTORIQUE JOURNALIER ════════════════════════════════ */}
      {tab === "historique" && (
        <Sec title="Historique journalier" id="historique">
          {/* Sélecteur année scolaire */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            {[SY_START, SY_START - 1].map(y => (
              <button key={y} onClick={() => { setHistYear(y); setHistMonth(null); setHistDay(null); }}
                style={{ padding: "9px 18px", borderRadius: 10, border: "none", fontWeight: 700,
                  fontSize: 13, cursor: "pointer",
                  background: histYear === y ? C.navy : C.gray100,
                  color: histYear === y ? C.white : C.gray600 }}>
                Année {y}-{y + 1}
              </button>
            ))}
            {histMonth !== null && (
              <button onClick={() => { setHistMonth(null); setHistDay(null); }}
                style={{ padding: "9px 18px", borderRadius: 10, border: `1px solid ${C.gray200}`,
                  background: C.white, color: C.gray600, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                ← Retour aux mois
              </button>
            )}
            {histDay !== null && (
              <button onClick={() => setHistDay(null)}
                style={{ padding: "9px 18px", borderRadius: 10, border: `1px solid ${C.gray200}`,
                  background: C.white, color: C.gray600, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                ← Retour aux jours
              </button>
            )}
          </div>

          {/* Niveau 1 : liste des mois de l'année scolaire */}
          {histMonth === null && (() => {
            const months: number[] = [];
            for (let m = 9; m <= 12; m++) months.push(m);
            for (let m = 1; m <= 8; m++) months.push(m);
            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                {months.map(m => {
                  const yr = m >= 9 ? histYear : histYear + 1;
                  const data = histMonthData(yr, m);
                  const hasData = data.incidents > 0 || data.absences > 0 || data.reparations > 0;
                  return (
                    <div key={m} onClick={() => setHistMonth(m)}
                      style={{ background: C.white, borderRadius: 14, padding: 16, cursor: "pointer",
                        boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
                        borderTop: `3px solid ${hasData ? C.navy : C.gray200}`,
                        opacity: hasData ? 1 : 0.5 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: C.navy, marginBottom: 8 }}>
                        {MONTHS_FR[m - 1]}
                        <span style={{ fontWeight: 400, color: C.gray400, fontSize: 12, marginLeft: 4 }}>
                          {yr}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {data.incidents > 0 && (
                          <span style={{ fontSize: 12, color: C.red }}>🚨 {data.incidents}</span>
                        )}
                        {data.absences > 0 && (
                          <span style={{ fontSize: 12, color: C.amber }}>👤 {data.absences}</span>
                        )}
                        {data.reparations > 0 && (
                          <span style={{ fontSize: 12, color: C.navyL }}>🔧 {data.reparations}</span>
                        )}
                        {!hasData && (
                          <span style={{ fontSize: 12, color: C.gray400 }}>—</span>
                        )}
                      </div>
                      {data.cout > 0 && (
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.gray600, marginTop: 6 }}>
                          {Math.round(data.cout).toLocaleString("fr-CH")} CHF
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Niveau 2 : jours du mois */}
          {histMonth !== null && histDay === null && (() => {
            const yr = histMonth >= 9 ? histYear : histYear + 1;
            const totalDays = histDaysInMonth(yr, histMonth);
            const pad = String(histMonth).padStart(2, "0");
            const data = histMonthData(yr, histMonth);

            return (
              <>
                {/* Bilan mensuel */}
                <div style={{ background: C.white, borderRadius: 14, padding: 18, marginBottom: 20,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                    marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
                    <div style={{ fontWeight: 800, fontSize: 16, color: C.navy }}>
                      Bilan {MONTHS_FR[histMonth - 1]} {yr}
                    </div>
                    <button onClick={() => exportCSV(yr, histMonth)}
                      style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.gray200}`,
                        background: C.white, color: C.gray600, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                      📥 Export CSV
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
                  {data.cout > 0 && (
                    <div style={{ textAlign: "center", marginTop: 12, padding: "8px 0",
                      borderTop: `1px solid ${C.gray100}` }}>
                      <span style={{ fontSize: 18, fontWeight: 900, color: C.green }}>
                        {Math.round(data.cout).toLocaleString("fr-CH")} CHF
                      </span>
                      <span style={{ fontSize: 12, color: C.gray400, marginLeft: 6 }}>coût réparations</span>
                    </div>
                  )}
                </div>

                {/* Grille jours */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
                  {["Lu","Ma","Me","Je","Ve","Sa","Di"].map(d => (
                    <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700,
                      color: C.gray400, paddingBottom: 6 }}>{d}</div>
                  ))}
                  {(() => {
                    const firstDay = new Date(`${yr}-${pad}-01`).getDay();
                    const offset = firstDay === 0 ? 6 : firstDay - 1;
                    const cells = [];
                    for (let i = 0; i < offset; i++) {
                      cells.push(<div key={`e${i}`} />);
                    }
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

          {/* Niveau 3 : détail d'un jour */}
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
                    {di.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: C.red,
                          textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
                          🚨 Incidents ({di.length})
                        </div>
                        {di.map(i => (
                          <div key={i.id} style={{ background: C.white, borderRadius: 12, padding: 14,
                            marginBottom: 8, borderLeft: `3px solid ${C.red}` }}>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{i.type}</div>
                            <div style={{ fontSize: 13, color: C.gray600, marginTop: 4 }}>{i.description}</div>
                            <div style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>
                              Status : {i.status}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {da.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: C.amber,
                          textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
                          👤 Absences conducteurs ({da.length})
                        </div>
                        {da.map(a => {
                          const cond = a.conducteur as { prenom?: string; nom?: string } | undefined;
                          return (
                            <div key={a.id} style={{ background: C.white, borderRadius: 12, padding: 14,
                              marginBottom: 8, borderLeft: `3px solid ${C.amber}` }}>
                              <div style={{ fontWeight: 700, fontSize: 14 }}>
                                {cond?.prenom} {cond?.nom}
                              </div>
                              <div style={{ fontSize: 13, color: C.gray600, marginTop: 4 }}>{a.motif || "—"}</div>
                              <div style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>
                                {a.status === "couvert" ? "✅ Couvert" : "⚠️ Non couvert"}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {dr.length > 0 && (
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: C.navy,
                          textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
                          🔧 Réparations réceptionnées ({dr.length})
                        </div>
                        {dr.map(r => {
                          const vv = r.vehicule as { plaque?: string } | undefined;
                          return (
                            <div key={r.id} style={{ background: C.white, borderRadius: 12, padding: 14,
                              marginBottom: 8, borderLeft: `3px solid ${C.navy}` }}>
                              <div style={{ fontWeight: 700, fontSize: 14 }}>{vv?.plaque || r.vehicule_id}</div>
                              <div style={{ fontSize: 13, color: C.gray600, marginTop: 4 }}>{r.description}</div>
                              {(r.cout_estime ?? 0) > 0 && (
                                <div style={{ fontSize: 13, fontWeight: 800, color: C.red, marginTop: 4 }}>
                                  {(r.cout_estime ?? 0).toLocaleString("fr-CH")} CHF
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}
        </Sec>
      )}

      {/* ══ SECTION 5 — ACCÈS RAPIDE ═════════════════════════════════════════ */}
      {tab === "acces" && (
        <Sec title="Accès rapide" id="acces">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 16 }}>
            {[
              { icon: "📋", label: "Gestionnaire", sub: "Dashboard, circuits, alertes", path: "/gestionnaire", color: C.navy },
              { icon: "🔧", label: "Mécanicien",   sub: "Atelier, réparations, prêts",  path: "/mecanicien",  color: "#D97706" },
              { icon: "👤", label: "Conducteurs",  sub: "Liste & fiches conducteurs",   path: "/gestionnaire/conducteurs", color: C.green },
              { icon: "🚌", label: "Véhicules",    sub: "Flotte & état des véhicules",  path: "/gestionnaire/vehicules",   color: "#2563EB" },
            ].map(c => (
              <div key={c.path} onClick={() => router.push(c.path)}
                style={{ background: C.white, borderRadius: 18, padding: 24, cursor: "pointer",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.08)", borderTop: `4px solid ${c.color}`,
                  transition: "transform 0.1s", display: "flex", flexDirection: "column",
                  alignItems: "flex-start", gap: 10 }}>
                <span style={{ fontSize: 36 }}>{c.icon}</span>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: C.navy }}>{c.label}</div>
                  <div style={{ fontSize: 13, color: C.gray400, marginTop: 4 }}>{c.sub}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: c.color, marginTop: 4 }}>
                  Accéder →
                </div>
              </div>
            ))}
          </div>
        </Sec>
      )}
    </div>
  );
}
