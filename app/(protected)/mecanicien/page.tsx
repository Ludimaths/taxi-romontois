"use client";
import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { SEUIL_REPARATION_CHF } from "@/lib/constants";
import type { Vehicule, Reparation, Alerte, Incident, Profile } from "@/lib/types";

/* ─── palette ─── */
const M = {
  green:  "#16A34A", greenL: "#DCFCE7", greenM: "#BBF7D0",
  navy:   "#0D3B7A", navyL: "#1565C0",
  blue:   "#2563EB", blueL: "#EFF6FF",
  amber:  "#D97706", amberL: "#FEF3C7",
  red:    "#DC2626", redL: "#FEE2E2",
  gray:   "#64748B", grayL: "#F8FAFC",
  border: "#E2E8F0", white: "#FFFFFF", text: "#1E293B",
  teal:   "#0D9488", tealL: "#F0FDFA",
};

/* ─── constants ─── */
const BUDGET_MENSUEL = 5000; // CHF — modifiable par admin

type Tab = "dashboard" | "en_cours" | "terminees" | "alertes" | "historique";
type TypeIntervention = "interne" | "externe" | "piece";
type NiveauUrgence   = "urgent" | "important" | "normal" | "planifie";

interface RepForm {
  vehicule_id: string; probleme: string;
  type: TypeIntervention; garage: string; piece: string; fournisseur: string;
  urgence: NiveauUrgence; cout_estime: string; date_reception: string; notes: string;
}
const EMPTY_FORM: RepForm = {
  vehicule_id: "", probleme: "", type: "interne", garage: "", piece: "",
  fournisseur: "", urgence: "normal", cout_estime: "", date_reception: "", notes: "",
};

/* ─── helpers ─── */
function parseCT(ct?: string | null): Date | null {
  if (!ct) return null;
  const [mm, yyyy] = ct.split(".");
  if (!mm || !yyyy) return null;
  return new Date(parseInt(yyyy), parseInt(mm), 0);
}
function ctStatut(ct?: string | null): "valide" | "bientot" | "expire" | null {
  const d = parseCT(ct);
  if (!d) return null;
  const now = new Date(), in3m = new Date(); in3m.setMonth(now.getMonth() + 3);
  if (d < now) return "expire";
  if (d < in3m) return "bientot";
  return "valide";
}
function ctBadge(ct?: string | null) {
  const s = ctStatut(ct);
  if (!s) return { label: "—", color: M.gray, bg: M.grayL };
  return {
    expire:  { label: "⚠ Expiré",  color: M.red,   bg: M.redL   },
    bientot: { label: "Bientôt",   color: M.amber, bg: M.amberL },
    valide:  { label: "Valide",    color: M.green, bg: M.greenL },
  }[s];
}
const URGENCE_MAP: Record<NiveauUrgence, { label: string; icon: string; color: string; bg: string }> = {
  urgent:    { label: "Urgent",    icon: "🔴", color: M.red,   bg: M.redL   },
  important: { label: "Important", icon: "🟠", color: M.amber, bg: M.amberL },
  normal:    { label: "Normal",    icon: "🟡", color: M.navy,  bg: M.blueL  },
  planifie:  { label: "Planifié",  icon: "🟢", color: M.green, bg: M.greenL },
};
const STATUT_MAP: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  signalee:             { label: "Signalée",              icon: "📋", color: M.gray,  bg: M.grayL  },
  en_attente_validation:{ label: "Attente validation",    icon: "⏳", color: M.amber, bg: M.amberL },
  en_attente_piece:     { label: "Attente pièce",         icon: "⏳", color: M.blue,  bg: M.blueL  },
  en_cours:             { label: "En cours",              icon: "🔧", color: M.navyL, bg: "#DBEAFE" },
  termine:              { label: "Terminée",              icon: "✅", color: M.green, bg: M.greenL },
  refusee:              { label: "Refusée",               icon: "❌", color: M.red,   bg: M.redL   },
};
function statutInfo(s: string) { return STATUT_MAP[s] ?? STATUT_MAP.signalee; }

/* encode type+urgence in responsable field: "type|urgence|extra" */
function encodeResp(type: TypeIntervention, urgence: NiveauUrgence, extra: string) {
  return `${type}|${urgence}|${extra}`;
}
function decodeResp(r?: string | null): { type: TypeIntervention; urgence: NiveauUrgence; extra: string } {
  if (!r || !r.includes("|")) return { type: "interne", urgence: "normal", extra: r ?? "" };
  const [type, urgence, ...rest] = r.split("|");
  return {
    type: (type as TypeIntervention) || "interne",
    urgence: (urgence as NiveauUrgence) || "normal",
    extra: rest.join("|"),
  };
}

/* budget progress color */
function budgetColor(pct: number) {
  if (pct > 90) return M.red;
  if (pct > 70) return M.amber;
  return M.green;
}

function fmtDate(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
function fmtShort(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("fr-FR");
}

/* ─── small components ─── */
function Pill({ children, color, bg }: { children: ReactNode; color: string; bg: string }) {
  return (
    <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700,
      color, background: bg, whiteSpace: "nowrap", display: "inline-block" }}>
      {children}
    </span>
  );
}
function InfoRow({ icon, label, value, sub }: { icon: string; label: string; value: ReactNode; sub?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
      background: M.grayL, borderRadius: 10, border: `1px solid ${M.border}` }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11, color: M.gray, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: M.text, marginTop: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: M.gray, marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}
function Card({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: M.white, borderRadius: 16, padding: "20px 20px",
      marginBottom: 16, border: `1px solid ${M.border}`,
      boxShadow: "0 2px 8px rgba(0,0,0,0.04)", ...style }}>
      {children}
    </div>
  );
}
function SectionTitle({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 800, color: M.gray, textTransform: "uppercase",
    letterSpacing: 1, marginBottom: 14 }}>{children}</div>;
}
function FieldLabel({ children }: { children: ReactNode }) {
  return <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: M.text, marginBottom: 6 }}>{children}</label>;
}
function Input({ value, onChange, type = "text", placeholder = "" }: {
  value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: "100%", padding: "13px 14px", borderRadius: 10, border: `1px solid ${M.border}`,
        fontSize: 16, color: M.text, background: M.grayL, boxSizing: "border-box",
        outline: "none", minHeight: 48 }} />
  );
}
function BigBtn({ children, onClick, disabled, color = M.navy }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; color?: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ width: "100%", padding: "16px", minHeight: 56, borderRadius: 12, border: "none",
        background: disabled ? M.border : color, color: disabled ? M.gray : M.white,
        fontSize: 16, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer" }}>
      {children}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════ */
export default function MecanicienPage() {
  const supabase = createClient();

  const [profile,     setProfile]     = useState<Profile | null>(null);
  const [vehicles,    setVehicles]    = useState<Vehicule[]>([]);
  const [reparations, setReparations] = useState<Reparation[]>([]);
  const [alertes,     setAlertes]     = useState<Alerte[]>([]);
  const [incidents,   setIncidents]   = useState<Incident[]>([]);
  const [activeTab,   setActiveTab]   = useState<Tab>("dashboard");
  const [selVehId,    setSelVehId]    = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [repForm,     setRepForm]     = useState<RepForm>(EMPTY_FORM);
  const [saving,      setSaving]      = useState(false);
  const [loading,     setLoading]     = useState(true);

  const setF = (k: keyof RepForm, v: string) => setRepForm(p => ({ ...p, [k]: v }));

  /* ── load ── */
  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: p } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (p) setProfile(p);
    }
    const [veh, rep, alt, inc] = await Promise.all([
      supabase.from("vehicules").select("*, circuit:circuits(*), conducteur:conducteurs(*)").order("plaque"),
      supabase.from("reparations").select("*, vehicule:vehicules(*)").order("created_at", { ascending: false }),
      supabase.from("alertes").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("incidents").select("*, vehicule:vehicules(*), conducteur:conducteurs(*)").order("reported_at", { ascending: false }).limit(50),
    ]);
    setVehicles(veh.data ?? []);
    setReparations((rep.data ?? []) as Reparation[]);
    setAlertes(alt.data ?? []);
    setIncidents(inc.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const channels = ["reparations", "alertes", "vehicules", "incidents"].map(t =>
      supabase.channel(`meca-${t}`)
        .on("postgres_changes", { event: "*", schema: "public", table: t }, () => loadData())
        .subscribe()
    );
    return () => { channels.forEach(c => supabase.removeChannel(c)); };
  }, [loadData]);

  /* ── computed ── */
  const enAtelier  = vehicles.filter(v => v.etat === "atelier");
  const urgentes   = vehicles.filter(v => v.km > 130000 || ctStatut(v.ct_date) === "expire");
  const enCours    = reparations.filter(r => r.statut !== "termine" && r.statut !== "refusee");
  const terminees  = reparations.filter(r => r.statut === "termine");

  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const totalMois = reparations
    .filter(r => r.created_at >= firstOfMonth && r.statut !== "refusee")
    .reduce((s, r) => s + (r.cout ?? 0), 0);
  const budgetPct = Math.min((totalMois / BUDGET_MENSUEL) * 100, 100);

  const selVeh = selVehId ? vehicles.find(v => v.id === selVehId) ?? null : null;
  const selVehReps = reparations.filter(r => r.vehicule_id === selVehId);

  const alertesUrgentes = alertes.filter(a => !a.read && (a.severity === "critique" || a.severity === "haute"));

  /* ── handlers ── */
  const handleAddRepair = async () => {
    if (!repForm.vehicule_id || !repForm.probleme) return;
    setSaving(true);
    const cout = parseFloat(repForm.cout_estime) || 0;
    const depasseSeuil = cout >= SEUIL_REPARATION_CHF;
    const extra = repForm.type === "externe" ? repForm.garage
      : repForm.type === "piece" ? `${repForm.piece} — ${repForm.fournisseur}`
      : "";
    const statut = depasseSeuil ? "en_attente_validation" : "signalee";
    await supabase.from("reparations").insert({
      vehicule_id:     repForm.vehicule_id,
      description:     repForm.probleme + (repForm.notes ? `\n\nNotes: ${repForm.notes}` : ""),
      cout:            cout,
      responsable:     encodeResp(repForm.type, repForm.urgence, extra),
      statut,
      alerte_envoyee:  depasseSeuil,
      date_reparation: repForm.date_reception || new Date().toISOString().slice(0,10),
    });
    if (depasseSeuil) {
      const veh = vehicles.find(v => v.id === repForm.vehicule_id);
      await supabase.from("alertes").insert({
        type: "reparation", severity: "haute", read: false,
        message: `⚠ Réparation ${veh?.plaque ?? repForm.vehicule_id} : ${cout.toFixed(2)} CHF — Dépasse le seuil de ${SEUIL_REPARATION_CHF} CHF. En attente de validation.`,
      });
    }
    setRepForm(EMPTY_FORM);
    setShowAddForm(false);
    setSaving(false);
    loadData();
  };

  const handleStatut = async (id: number, statut: string) => {
    await supabase.from("reparations").update({ statut } as any).eq("id", id);
    loadData();
  };

  const handleVehicleEtat = async (id: string, etat: string) => {
    await supabase.from("vehicules").update({ etat }).eq("id", id);
    loadData();
  };

  const handleAlerteRead = async (id: number) => {
    await supabase.from("alertes").update({ read: true }).eq("id", id);
    loadData();
  };

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: 300, gap: 14, color: M.gray }}>
      <div style={{ fontSize: 36 }}>🔧</div>
      <div style={{ fontSize: 17 }}>Chargement de l'atelier…</div>
    </div>
  );

  const nomMeca = profile?.nom
    ? `${profile.prenom ?? ""} ${profile.nom}`.trim()
    : null;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>

      {/* ── Bienvenue ── */}
      <div style={{ background: "linear-gradient(135deg,#1B4332,#2D6A4F)",
        borderRadius: 20, padding: "24px 22px", marginBottom: 20, color: M.white }}>
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>
          {nomMeca ? `Bonjour ${nomMeca} !` : "Bonjour — Profil en cours de configuration"}
        </div>
        <div style={{ fontSize: 15, lineHeight: 1.7, opacity: 0.92 }}>
          Bienvenue dans votre espace atelier.<br />
          Retrouvez ici le suivi complet de l'entretien et des réparations
          de la flotte Taxi Romontois.
        </div>
      </div>

      {/* ── 4 Stat cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>

        <button onClick={() => setActiveTab("dashboard")}
          style={{ background: M.white, borderRadius: 16, padding: "18px 20px",
            border: `2px solid ${M.border}`, textAlign: "left", cursor: "pointer",
            boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>🚌</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: M.navy }}>{vehicles.length}</div>
          <div style={{ fontSize: 13, color: M.gray, marginTop: 2 }}>Total véhicules</div>
        </button>

        <button onClick={() => setActiveTab("en_cours")}
          style={{ background: enAtelier.length > 0 ? M.redL : M.white, borderRadius: 16,
            padding: "18px 20px", border: `2px solid ${enAtelier.length > 0 ? "#FECACA" : M.border}`,
            textAlign: "left", cursor: "pointer", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>🔧</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: enAtelier.length > 0 ? M.red : M.navy }}>{enAtelier.length}</div>
          <div style={{ fontSize: 13, color: M.gray, marginTop: 2 }}>En atelier</div>
        </button>

        <button onClick={() => { setActiveTab("dashboard"); }}
          style={{ background: urgentes.length > 0 ? M.amberL : M.white, borderRadius: 16,
            padding: "18px 20px", border: `2px solid ${urgentes.length > 0 ? "#FDE68A" : M.border}`,
            textAlign: "left", cursor: "pointer", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>⚠️</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: urgentes.length > 0 ? M.amber : M.navy }}>{urgentes.length}</div>
          <div style={{ fontSize: 13, color: M.gray, marginTop: 2 }}>Révisions urgentes</div>
        </button>

        <div style={{ background: budgetPct > 90 ? M.redL : M.white, borderRadius: 16,
          padding: "18px 20px", border: `2px solid ${budgetPct > 90 ? "#FECACA" : M.border}`,
          boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>💰</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: budgetColor(budgetPct) }}>
            {totalMois.toFixed(0)} CHF
          </div>
          <div style={{ fontSize: 12, color: M.gray, marginTop: 2 }}>Budget mois / {BUDGET_MENSUEL} CHF</div>
          <div style={{ marginTop: 8, background: M.border, borderRadius: 6, height: 8, overflow: "hidden" }}>
            <div style={{ width: `${budgetPct}%`, height: "100%",
              background: budgetColor(budgetPct), borderRadius: 6, transition: "width .4s" }} />
          </div>
          {budgetPct >= 100 && (
            <div style={{ fontSize: 12, color: M.red, fontWeight: 700, marginTop: 6 }}>
              🔴 Limite dépassée — alerte admin envoyée
            </div>
          )}
        </div>
      </div>

      {/* ── Bouton ajouter ── */}
      <button onClick={() => setShowAddForm(true)}
        style={{ width: "100%", padding: "15px", minHeight: 54, borderRadius: 14,
          border: "none", background: `linear-gradient(135deg,${M.navy},${M.blue})`,
          color: M.white, fontSize: 16, fontWeight: 700, cursor: "pointer", marginBottom: 20 }}>
        🔧 Ajouter une réparation
      </button>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 18,
        scrollbarWidth: "none" } as any}>
        {([
          { id: "dashboard",  label: "🏠 Tableau de bord", badge: 0 },
          { id: "en_cours",   label: "🔧 En réparation",   badge: enCours.length },
          { id: "terminees",  label: "✅ Terminées",         badge: 0 },
          { id: "alertes",    label: "🔔 Alertes",           badge: alertesUrgentes.length },
          { id: "historique", label: "📋 Historique",        badge: 0 },
        ] as { id: Tab; label: string; badge: number }[]).map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ padding: "9px 14px", borderRadius: 22, flexShrink: 0,
              border: `2px solid ${activeTab === t.id ? M.blue : M.border}`,
              background: activeTab === t.id ? M.blueL : "transparent",
              color: activeTab === t.id ? M.blue : M.gray,
              fontWeight: activeTab === t.id ? 700 : 500,
              fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
              position: "relative" } as any}>
            {t.label}
            {t.badge > 0 && (
              <span style={{ marginLeft: 6, background: M.red, color: M.white,
                borderRadius: 20, fontSize: 10, fontWeight: 800, padding: "1px 6px" }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══ DASHBOARD ══ */}
      {activeTab === "dashboard" && (
        <div>
          {/* Révisions urgentes */}
          {urgentes.length > 0 && (
            <Card>
              <SectionTitle>⚠️ Révisions urgentes ({urgentes.length})</SectionTitle>
              {urgentes.map(v => (
                <VehiculeRow key={v.id} v={v} onSelect={() => setSelVehId(v.id)} selected={selVehId === v.id} />
              ))}
            </Card>
          )}
          {/* Tous les véhicules */}
          <Card>
            <SectionTitle>🚌 Tous les véhicules ({vehicles.length})</SectionTitle>
            {vehicles.map(v => (
              <VehiculeRow key={v.id} v={v} onSelect={() => setSelVehId(v.id)} selected={selVehId === v.id} />
            ))}
          </Card>
        </div>
      )}

      {/* ══ EN COURS ══ */}
      {activeTab === "en_cours" && (
        <div>
          {enCours.length === 0
            ? <EmptyState icon="🔧" text="Aucune réparation en cours" />
            : enCours.map(r => <RepCard key={r.id} r={r} onStatut={handleStatut}
                onVehicule={(id) => { setSelVehId(id); setActiveTab("dashboard"); }} />)
          }
        </div>
      )}

      {/* ══ TERMINÉES ══ */}
      {activeTab === "terminees" && (
        <div>
          {terminees.length === 0
            ? <EmptyState icon="✅" text="Aucune réparation terminée enregistrée" />
            : terminees.map(r => <RepCard key={r.id} r={r} onStatut={handleStatut}
                onVehicule={(id) => { setSelVehId(id); setActiveTab("dashboard"); }} />)
          }
        </div>
      )}

      {/* ══ ALERTES ══ */}
      {activeTab === "alertes" && (
        <div>
          {/* Incidents véhicules */}
          {incidents.length > 0 && (
            <Card>
              <SectionTitle>🚗 Incidents signalés ({incidents.length})</SectionTitle>
              {incidents.map(i => (
                <div key={i.id} style={{ padding: "13px 0", borderBottom: `1px solid ${M.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{i.vehicule?.plaque ?? "—"}</div>
                    <Pill color={i.status === "resolu" ? M.green : M.amber}
                      bg={i.status === "resolu" ? M.greenL : M.amberL}>
                      {i.status === "resolu" ? "Résolu" : "En cours"}
                    </Pill>
                  </div>
                  <div style={{ fontSize: 14, color: M.text, marginBottom: 4 }}>{i.description}</div>
                  <div style={{ fontSize: 12, color: M.gray }}>
                    {i.conducteur?.prenom} {i.conducteur?.nom} · {fmtShort(i.reported_at)}
                  </div>
                </div>
              ))}
            </Card>
          )}
          {/* Alertes */}
          <Card>
            <SectionTitle>🔔 Alertes ({alertes.length})</SectionTitle>
            {alertes.length === 0
              ? <EmptyState icon="🔔" text="Aucune alerte" />
              : alertes.map(a => (
                <div key={a.id} style={{ padding: "14px", borderRadius: 12, marginBottom: 10,
                  background: a.severity === "critique" ? M.redL : a.severity === "haute" ? M.amberL : M.grayL,
                  border: `1px solid ${a.severity === "critique" ? "#FECACA" : a.severity === "haute" ? "#FDE68A" : M.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                    <Pill color={a.severity === "critique" ? M.red : a.severity === "haute" ? M.amber : M.gray}
                      bg={a.severity === "critique" ? "#FEE2E2" : a.severity === "haute" ? "#FEF3C7" : M.grayL}>
                      {a.severity === "critique" ? "🔴 Critique" : a.severity === "haute" ? "🟠 Haute" : "🟡 Normale"}
                    </Pill>
                    {!a.read && (
                      <button onClick={() => handleAlerteRead(a.id)}
                        style={{ padding: "4px 10px", borderRadius: 8, border: `1px solid ${M.border}`,
                          background: M.white, fontSize: 12, cursor: "pointer", color: M.green, fontWeight: 700 }}>
                        ✓ Traité
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 14, color: M.text, fontWeight: a.read ? 400 : 600 }}>{a.message}</div>
                  <div style={{ fontSize: 12, color: M.gray, marginTop: 4 }}>{fmtDate(a.created_at)}</div>
                </div>
              ))
            }
          </Card>
        </div>
      )}

      {/* ══ HISTORIQUE ══ */}
      {activeTab === "historique" && (
        <Card>
          <SectionTitle>📋 Historique complet ({reparations.length} réparations)</SectionTitle>
          {reparations.length === 0
            ? <EmptyState icon="📋" text="Aucune réparation enregistrée" />
            : reparations.map(r => <RepCard key={r.id} r={r} onStatut={handleStatut}
                onVehicule={(id) => { setSelVehId(id); setActiveTab("dashboard"); }} />)
          }
        </Card>
      )}

      {/* ══ VEHICLE DETAIL MODAL ══ */}
      {selVeh && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={e => { if (e.target === e.currentTarget) setSelVehId(null); }}>
          <div style={{ background: M.white, borderRadius: "20px 20px 0 0",
            width: "100%", maxWidth: 680, maxHeight: "90vh",
            overflowY: "auto", padding: "24px 22px" }}>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, color: M.navy }}>{selVeh.plaque}</div>
                <div style={{ fontSize: 14, color: M.gray }}>{selVeh.marque} {selVeh.modele}</div>
              </div>
              <button onClick={() => setSelVehId(null)}
                style={{ background: M.grayL, border: "none", borderRadius: "50%",
                  width: 36, height: 36, fontSize: 20, cursor: "pointer", color: M.gray }}>
                ×
              </button>
            </div>

            {/* Infos véhicule */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              <InfoRow icon="🔢" label="Kilométrage" value={`${selVeh.km.toLocaleString("fr-FR")} km`}
                sub={selVeh.km > 130000 ? "⚠ Kilométrage élevé" : undefined} />
              <InfoRow icon="📋" label="Contrôle technique"
                value={<span style={{ color: ctStatut(selVeh.ct_date) === "expire" ? M.red : M.text }}>
                  {selVeh.ct_date || "—"} · {(ctBadge(selVeh.ct_date) as any)?.label ?? "—"}
                </span>} />
              <InfoRow icon="🛡" label="Assurance" value={selVeh.assurance_date || "—"} />
              {selVeh.circuit && (
                <InfoRow icon="🗺" label="Circuit" value={`${selVeh.circuit.emoji} ${selVeh.circuit.nom}`} />
              )}
              {selVeh.conducteur && (
                <InfoRow icon="👤" label="Conducteur"
                  value={`${selVeh.conducteur.prenom} ${selVeh.conducteur.nom}`} />
              )}
            </div>

            {/* État véhicule */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>État du véhicule</div>
              <div style={{ display: "flex", gap: 8 }}>
                {([["bon","✅ Bon état",M.green],["attention","⚠️ Attention",M.amber],["atelier","🔧 Atelier",M.red]] as const).map(([e,l,c]) => (
                  <button key={e} onClick={() => handleVehicleEtat(selVeh.id, e)}
                    style={{ flex: 1, padding: "11px 8px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                      border: `2px solid ${selVeh.etat === e ? c : M.border}`,
                      background: selVeh.etat === e ? c + "22" : M.white,
                      color: selVeh.etat === e ? c : M.gray, cursor: "pointer" }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Réparations du véhicule */}
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
              Historique réparations ({selVehReps.length})
            </div>
            {selVehReps.length === 0
              ? <div style={{ textAlign: "center", padding: 24, color: M.gray, fontSize: 15 }}>
                  Aucune réparation enregistrée
                </div>
              : selVehReps.map(r => <RepCard key={r.id} r={r} compact onStatut={handleStatut} />)
            }

            <button onClick={() => window.print()}
              style={{ width: "100%", marginTop: 16, padding: "13px", borderRadius: 12,
                border: `2px solid ${M.navy}`, background: "transparent",
                color: M.navy, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              🖨 Télécharger fiche réparations PDF
            </button>
          </div>
        </div>
      )}

      {/* ══ ADD REPAIR MODAL ══ */}
      {showAddForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddForm(false); }}>
          <div style={{ background: M.white, borderRadius: "20px 20px 0 0",
            width: "100%", maxWidth: 680, maxHeight: "95vh",
            overflowY: "auto", padding: "24px 22px" }}>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: M.navy }}>🔧 Ajouter une réparation</div>
              <button onClick={() => setShowAddForm(false)}
                style={{ background: M.grayL, border: "none", borderRadius: "50%",
                  width: 36, height: 36, fontSize: 20, cursor: "pointer", color: M.gray }}>×</button>
            </div>

            {/* Véhicule */}
            <div style={{ marginBottom: 16 }}>
              <FieldLabel>Véhicule concerné</FieldLabel>
              <select value={repForm.vehicule_id} onChange={e => setF("vehicule_id", e.target.value)}
                style={{ width: "100%", padding: "13px 14px", borderRadius: 10,
                  border: `1px solid ${M.border}`, fontSize: 16, background: M.grayL,
                  color: M.text, minHeight: 48 }}>
                <option value="">— Sélectionner un véhicule —</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.plaque} — {v.marque} {v.modele}</option>)}
              </select>
            </div>

            {/* Problème */}
            <div style={{ marginBottom: 16 }}>
              <FieldLabel>Problème observé</FieldLabel>
              <textarea value={repForm.probleme} onChange={e => setF("probleme", e.target.value)}
                placeholder="Décrivez le problème…" rows={3}
                style={{ width: "100%", padding: "13px 14px", borderRadius: 10,
                  border: `1px solid ${M.border}`, fontSize: 16, resize: "vertical",
                  boxSizing: "border-box", fontFamily: "inherit", background: M.grayL, color: M.text }} />
            </div>

            {/* Type intervention */}
            <div style={{ marginBottom: 16 }}>
              <FieldLabel>Type d'intervention</FieldLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {([["interne","🔧 Réparation interne"],["externe","🏢 Réparation externe"],["piece","📦 Commande de pièce"]] as const).map(([k,l]) => (
                  <button key={k} onClick={() => setF("type", k)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px",
                      borderRadius: 12, border: `2px solid ${repForm.type === k ? M.blue : M.border}`,
                      background: repForm.type === k ? M.blueL : M.white,
                      cursor: "pointer", textAlign: "left", minHeight: 50 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: repForm.type === k ? M.blue : M.text }}>{l}</span>
                    {repForm.type === k && <span style={{ marginLeft: "auto", color: M.blue }}>✓</span>}
                  </button>
                ))}
              </div>
              {repForm.type === "externe" && (
                <div style={{ marginTop: 10 }}>
                  <Input value={repForm.garage} onChange={v => setF("garage", v)} placeholder="Nom du garage" />
                </div>
              )}
              {repForm.type === "piece" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                  <Input value={repForm.piece} onChange={v => setF("piece", v)} placeholder="Désignation de la pièce" />
                  <Input value={repForm.fournisseur} onChange={v => setF("fournisseur", v)} placeholder="Fournisseur" />
                </div>
              )}
            </div>

            {/* Urgence */}
            <div style={{ marginBottom: 16 }}>
              <FieldLabel>Niveau d'urgence</FieldLabel>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {(Object.entries(URGENCE_MAP) as [NiveauUrgence, typeof URGENCE_MAP[NiveauUrgence]][]).map(([k, u]) => (
                  <button key={k} onClick={() => setF("urgence", k)}
                    style={{ padding: "12px 14px", borderRadius: 12, minHeight: 50,
                      border: `2px solid ${repForm.urgence === k ? u.color : M.border}`,
                      background: repForm.urgence === k ? u.bg : M.white,
                      cursor: "pointer", fontWeight: 700, fontSize: 14,
                      color: repForm.urgence === k ? u.color : M.gray }}>
                    {u.icon} {u.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Coût + Date */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <FieldLabel>Coût estimé (CHF)</FieldLabel>
                <Input type="number" value={repForm.cout_estime} onChange={v => setF("cout_estime", v)} placeholder="ex: 450" />
              </div>
              <div>
                <FieldLabel>Date de réception</FieldLabel>
                <Input type="date" value={repForm.date_reception} onChange={v => setF("date_reception", v)} />
              </div>
            </div>

            {/* Seuil dépassé */}
            {repForm.cout_estime && parseFloat(repForm.cout_estime) >= SEUIL_REPARATION_CHF && (
              <div style={{ background: M.amberL, border: "1px solid #FDE68A",
                borderRadius: 12, padding: "14px", marginBottom: 16 }}>
                <div style={{ fontWeight: 700, color: M.amber, marginBottom: 4 }}>
                  ⚠ Montant ≥ {SEUIL_REPARATION_CHF} CHF
                </div>
                <div style={{ fontSize: 14, color: M.text }}>
                  Ce montant dépasse la limite autorisée. Votre demande sera mise en attente
                  de validation par l'administrateur. Une alerte sera envoyée automatiquement.
                </div>
              </div>
            )}

            {/* Notes */}
            <div style={{ marginBottom: 20 }}>
              <FieldLabel>Notes complémentaires (optionnel)</FieldLabel>
              <textarea value={repForm.notes} onChange={e => setF("notes", e.target.value)}
                placeholder="Informations supplémentaires…" rows={2}
                style={{ width: "100%", padding: "13px 14px", borderRadius: 10,
                  border: `1px solid ${M.border}`, fontSize: 16, resize: "vertical",
                  boxSizing: "border-box", fontFamily: "inherit", background: M.grayL, color: M.text }} />
            </div>

            <BigBtn onClick={handleAddRepair}
              disabled={saving || !repForm.vehicule_id || !repForm.probleme}
              color="linear-gradient(135deg,#1B4332,#2D6A4F)">
              {saving ? "Enregistrement…" : "✅ Enregistrer la réparation"}
            </BigBtn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── sub-components définis hors du composant principal ─── */

function VehiculeRow({ v, onSelect, selected }: { v: Vehicule; onSelect: () => void; selected: boolean }) {
  const ct = ctStatut(v.ct_date);
  return (
    <div onClick={onSelect}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "13px 0", borderBottom: `1px solid ${M.border}`, cursor: "pointer",
        background: selected ? M.blueL : "transparent", borderRadius: selected ? 10 : 0,
        paddingLeft: selected ? 12 : 0, paddingRight: selected ? 12 : 0 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, color: M.text }}>{v.plaque} — {v.marque} {v.modele}</div>
        <div style={{ fontSize: 12, color: M.gray, marginTop: 2 }}>
          {v.km.toLocaleString("fr-FR")} km · CT {v.ct_date || "—"}
          {v.circuit && ` · ${v.circuit.emoji} ${v.circuit.nom}`}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {v.km > 130000 && <Pill color={M.red} bg={M.redL}>⚠ Km</Pill>}
        {ct === "expire" && <Pill color={M.red} bg={M.redL}>CT expiré</Pill>}
        {ct === "bientot" && <Pill color={M.amber} bg={M.amberL}>CT bientôt</Pill>}
        <Pill
          color={v.etat === "bon" ? M.green : v.etat === "atelier" ? M.red : M.amber}
          bg={v.etat === "bon" ? M.greenL : v.etat === "atelier" ? M.redL : M.amberL}>
          {v.etat === "bon" ? "✅ OK" : v.etat === "atelier" ? "🔧 Atelier" : "⚠️"}
        </Pill>
      </div>
    </div>
  );
}

function RepCard({ r, onStatut, compact = false, onVehicule }: {
  r: Reparation; onStatut?: (id: number, s: string) => void;
  compact?: boolean; onVehicule?: (id: string) => void;
}) {
  const si = statutInfo(r.statut);
  const { urgence, type, extra } = decodeResp(r.responsable);
  const u = URGENCE_MAP[urgence] ?? URGENCE_MAP.normal;
  const NEXT_STATUTS: Record<string, string[]> = {
    signalee:              ["en_attente_piece", "en_cours"],
    en_attente_validation: ["en_cours", "refusee"],
    en_attente_piece:      ["en_cours"],
    en_cours:              ["termine"],
    termine:               [],
    refusee:               [],
  };
  const nextStatuts = NEXT_STATUTS[r.statut] ?? [];
  return (
    <div style={{ borderRadius: 14, padding: compact ? "12px" : "16px",
      marginBottom: 12, border: `1px solid ${M.border}`,
      background: r.statut === "refusee" ? M.redL : r.statut === "termine" ? M.greenL : M.white }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
        <div>
          {onVehicule && r.vehicule && (
            <button onClick={() => onVehicule(r.vehicule_id)}
              style={{ background: "none", border: "none", fontWeight: 800, fontSize: 15,
                color: M.navy, cursor: "pointer", padding: 0, marginBottom: 2 }}>
              {r.vehicule.plaque}
            </button>
          )}
          {!onVehicule && r.vehicule && (
            <div style={{ fontWeight: 800, fontSize: 14, color: M.navy }}>{r.vehicule.plaque}</div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Pill color={u.color} bg={u.bg}>{u.icon} {u.label}</Pill>
          <Pill color={si.color} bg={si.bg}>{si.icon} {si.label}</Pill>
        </div>
      </div>
      <div style={{ fontSize: 14, color: M.text, marginBottom: 6 }}>{r.description}</div>
      {extra && (
        <div style={{ fontSize: 12, color: M.gray, marginBottom: 4 }}>
          {type === "externe" ? `🏢 ${extra}` : type === "piece" ? `📦 ${extra}` : "🔧 Interne"}
        </div>
      )}
      <div style={{ fontSize: 12, color: M.gray, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span>{new Date(r.date_reparation).toLocaleDateString("fr-FR")}</span>
        {r.cout > 0 && <span>· {r.cout.toFixed(2)} CHF {r.alerte_envoyee ? "· ⚠ Alerte envoyée" : ""}</span>}
      </div>
      {!compact && onStatut && nextStatuts.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {nextStatuts.map(ns => {
            const nsi = statutInfo(ns);
            return (
              <button key={ns} onClick={() => onStatut(r.id, ns)}
                style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${nsi.color}`,
                  background: M.white, color: nsi.color, fontSize: 13, fontWeight: 700,
                  cursor: "pointer" }}>
                {nsi.icon} {nsi.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ textAlign: "center", padding: "32px 0", color: M.gray }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 16 }}>{text}</div>
    </div>
  );
}
