"use client";
import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Enfant, AbsenceEnfant, Circuit, Profile, Conducteur } from "@/lib/types";

const G = {
  green:   "#059669",
  greenD:  "#065F46",
  greenL:  "#ECFDF5",
  greenM:  "#D1FAE5",
  navy:    "#1E3A5F",
  blue:    "#2563EB",
  blueL:   "#EFF6FF",
  orange:  "#EA580C",
  orangeL: "#FFF7ED",
  amber:   "#B45309",
  amberL:  "#FEF3C7",
  gray:    "#64748B",
  grayL:   "#F8FAFC",
  border:  "#E2E8F0",
  white:   "#FFFFFF",
  text:    "#1E293B",
};

const MOTIFS = [
  { key: "malade",     label: "Mon enfant est malade",                  icon: "🤒" },
  { key: "maison",     label: "Reste à la maison aujourd'hui",          icon: "🏠" },
  { key: "pere",       label: "Va chez son père ce soir",               icon: "👨" },
  { key: "mere",       label: "Va chez sa mère ce soir",                icon: "👩" },
  { key: "ne_rentre",  label: "Ne rentre pas ce soir",                  icon: "🔄" },
  { key: "adresse",    label: "Changement d'adresse de prise en charge",icon: "📍" },
  { key: "autre",      label: "Autre",                                   icon: "✏️" },
];

const MOIS = ["Janvier","Février","Mars","Avril","Mai","Juin",
              "Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

function monthKey(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2,"0")}`;
}
function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return `${MOIS[parseInt(m)]} ${y}`;
}

/* ── small shared components ── */
function InfoRow({ icon, label, value, orange }: { icon: string; label: string; value: string; orange?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
      background: orange ? G.orangeL : G.grayL, borderRadius: 12,
      border: `1px solid ${orange ? "#FDBA74" : G.border}` }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11, color: orange ? G.orange : G.gray, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: orange ? G.orange : G.text, marginTop: 1 }}>{value}</div>
      </div>
    </div>
  );
}

function Pill({ children, color, bg }: { children: ReactNode; color: string; bg: string }) {
  return (
    <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
      color, background: bg, whiteSpace: "nowrap", display: "inline-block" }}>
      {children}
    </span>
  );
}

function Card({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: G.white, borderRadius: 16, padding: "20px 22px",
      marginBottom: 18, border: `1px solid ${G.border}`,
      boxShadow: "0 2px 8px rgba(0,0,0,0.05)", ...style }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, color: G.gray, textTransform: "uppercase",
      letterSpacing: 1, marginBottom: 16 }}>{children}</div>
  );
}

/* ══════════════════════════════════════════════════════════ */
export default function ParentPage() {
  const supabase = createClient();

  const [profile,    setProfile]    = useState<Profile | null>(null);
  const [child,      setChild]      = useState<Enfant | null>(null);
  const [circuit,    setCircuit]    = useState<Circuit | null>(null);
  const [conducteur, setConducteur] = useState<Conducteur | null>(null);
  const [remplacant, setRemplacant] = useState<Conducteur | null>(null);
  const [absences,   setAbsences]   = useState<AbsenceEnfant[]>([]);

  const [motif,      setMotif]      = useState("");
  const [complement, setComplement] = useState("");
  const [sent,       setSent]       = useState(false);
  const [activeMonth,setActiveMonth]= useState("");
  const [loading,    setLoading]    = useState(true);

  /* ── data load ── */
  const loadAbsences = async (enfantId: number) => {
    const { data } = await supabase
      .from("absences_enfants").select("*")
      .eq("enfant_id", enfantId)
      .order("date_absence", { ascending: false });
    return data ?? [];
  };

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: prof } = await supabase
        .from("profiles").select("*").eq("id", user.id).single();
      if (!prof?.enfant_id) { setLoading(false); return; }
      setProfile(prof);

      const [enfRes, absData] = await Promise.all([
        supabase.from("enfants")
          .select("*, circuit:circuits(*,cercle:cercles_scolaires(*))")
          .eq("id", prof.enfant_id).single(),
        loadAbsences(prof.enfant_id),
      ]);

      const enfant = enfRes.data;
      setChild(enfant);
      const circ: Circuit | null = (enfant as any)?.circuit ?? null;
      setCircuit(circ);
      setAbsences(absData);

      /* conducteur + remplaçant */
      if (circ?.id) {
        const { data: drivers } = await supabase
          .from("conducteurs").select("*")
          .eq("circuit_id", circ.id);

        if (drivers?.length) {
          const today = new Date().toISOString().slice(0, 10);
          const { data: absCondu } = await supabase
            .from("absences_conducteurs")
            .select("*, remplacant:conducteurs!absences_conducteurs_remplacant_id_fkey(*)")
            .eq("circuit_id", circ.id)
            .eq("date_absence", today)
            .limit(1).maybeSingle();

          const habituel = drivers[0];
          setConducteur(habituel);
          if (absCondu?.remplacant) setRemplacant(absCondu.remplacant as any);
        }
      }

      /* init mois actif = mois le plus récent avec données ou mois courant */
      const now = new Date();
      const curKey = `${now.getFullYear()}-${String(now.getMonth()).padStart(2,"0")}`;
      if (absData.length > 0) {
        setActiveMonth(monthKey(absData[0].date_absence));
      } else {
        setActiveMonth(curKey);
      }

      setLoading(false);
    })();
  }, []);

  /* ── send signalement ── */
  const handleSend = async () => {
    if (!child || !motif) return;
    const m = MOTIFS.find(x => x.key === motif)!;
    const reason = complement.trim()
      ? `${m.icon} ${m.label} — ${complement.trim()}`
      : `${m.icon} ${m.label}`;
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("absences_enfants").insert({
      enfant_id: child.id,
      circuit_id: child.circuit_id,
      date_absence: today,
      reason,
      reported_by: profile ? `${profile.prenom} ${profile.nom}` : "Parent",
      read_by_gestionnaire: false,
      transmitted_to_driver: false,
    });
    setSent(true);
    const fresh = await loadAbsences(child.id);
    setAbsences(fresh);
    if (!activeMonth) setActiveMonth(monthKey(today));
  };

  /* ── monthly history ── */
  const allMonthKeys = (() => {
    const keys = new Set(absences.map(a => monthKey(a.date_absence)));
    const now = new Date();
    keys.add(`${now.getFullYear()}-${String(now.getMonth()).padStart(2,"0")}`);
    return Array.from(keys).sort().reverse();
  })();

  const activeAbsences = absences.filter(a => monthKey(a.date_absence) === activeMonth);

  /* latest confirmed absence for the "gestionnaire confirmation" banner */
  const lastConfirmed = absences.find(a => a.read_by_gestionnaire && a.transmitted_to_driver);

  /* ── render ── */
  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: 320, gap: 14, color: G.gray }}>
      <div style={{ fontSize: 36 }}>🚌</div>
      <div style={{ fontSize: 17 }}>Chargement de votre espace…</div>
    </div>
  );

  if (!child) return (
    <div style={{ textAlign: "center", padding: "48px 24px" }}>
      <div style={{ fontSize: 40, marginBottom: 14 }}>⚠️</div>
      <div style={{ fontSize: 17, color: G.gray, lineHeight: 1.7 }}>
        Aucun enfant associé à votre compte.<br />
        Contactez le gestionnaire.
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 580, margin: "0 auto" }}>

      {/* ── Bienvenue ── */}
      <div style={{ background: `linear-gradient(135deg, ${G.greenD}, ${G.green})`,
        borderRadius: 20, padding: "26px 24px", marginBottom: 20, color: G.white }}>
        <div style={{ fontSize: 26, fontWeight: 900, marginBottom: 10 }}>
          Bonjour {profile?.civilite === "mere" ? "Madame" : profile?.civilite === "pere" ? "Monsieur" : "Madame, Monsieur"} {profile?.nom} !
        </div>
        <div style={{ fontSize: 16, lineHeight: 1.7, opacity: 0.95 }}>
          Bienvenue sur votre espace <strong>Taxi Romontois</strong>.<br />
          Cette plateforme vous permet de communiquer facilement avec notre équipe
          pour assurer le confort et la sécurité de votre enfant lors de ses trajets
          scolaires. Merci de votre confiance !
        </div>
      </div>

      {/* ── Confirmation gestionnaire ── */}
      {lastConfirmed && (
        <div style={{ background: G.blueL, borderRadius: 14, padding: "18px 20px",
          marginBottom: 18, border: "1px solid #BFDBFE" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: G.blue, marginBottom: 6 }}>
            ✅ Signalement confirmé
          </div>
          <div style={{ fontSize: 15, color: "#1E40AF", lineHeight: 1.85 }}>
            {profile?.civilite === "mere" ? "Madame" : profile?.civilite === "pere" ? "Monsieur" : "Madame, Monsieur"} {profile?.nom},<br />
            Votre signalement du{" "}
            <strong>
              {new Date(lastConfirmed.date_absence).toLocaleDateString("fr-FR",
                { day: "numeric", month: "long" })}
            </strong>{" "}
            concernant <strong>{child?.prenom}</strong> a été pris en compte par notre gestionnaire
            et transmis à votre conducteur.<br />
            Nous vous remercions de votre collaboration.
          </div>
        </div>
      )}

      {/* ── Fiche enfant ── */}
      <Card>
        <SectionTitle>Fiche enfant</SectionTitle>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
          <div style={{ width: 58, height: 58, borderRadius: "50%", background: G.greenM,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28, flexShrink: 0 }}>
            {circuit?.emoji ?? "🚌"}
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: G.navy }}>
              {child.prenom} {child.nom}
            </div>
            <div style={{ fontSize: 15, color: G.gray, marginTop: 2 }}>
              {circuit?.cercle?.nom ?? "—"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <InfoRow icon="🗺" label="Circuit habituel"
            value={circuit ? `${circuit.emoji} ${circuit.nom}` : "—"} />
          <InfoRow icon="🏫" label="École"
            value={circuit?.cercle?.nom ?? "—"} />
          <InfoRow icon="🚌" label="Conducteur habituel"
            value={conducteur ? `${conducteur.prenom} ${conducteur.nom}` : "—"} />
          {remplacant && (
            <InfoRow icon="🔄" label="Remplaçant aujourd'hui"
              value={`${remplacant.prenom} ${remplacant.nom}`} orange />
          )}
        </div>
      </Card>

      {/* ── Signalement / Confirmation envoi ── */}
      {!sent ? (
        <Card>
          <SectionTitle>Signaler un changement</SectionTitle>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
            {MOTIFS.map(m => {
              const active = motif === m.key;
              return (
                <button key={m.key}
                  onClick={() => setMotif(active ? "" : m.key)}
                  style={{ display: "flex", alignItems: "center", gap: 16,
                    padding: "15px 18px", borderRadius: 14, minHeight: 58,
                    border: `2px solid ${active ? G.blue : G.border}`,
                    background: active ? G.blueL : G.white,
                    cursor: "pointer", textAlign: "left", transition: "all .15s" }}>
                  <span style={{ fontSize: 24, flexShrink: 0 }}>{m.icon}</span>
                  <span style={{ fontSize: 16, fontWeight: active ? 700 : 500,
                    color: active ? G.blue : G.text, flex: 1 }}>
                    {m.label}
                  </span>
                  {active && <span style={{ color: G.blue, fontSize: 20 }}>✓</span>}
                </button>
              );
            })}
          </div>

          <textarea value={complement} onChange={e => setComplement(e.target.value)}
            placeholder="Informations complémentaires… (optionnel)"
            rows={3}
            style={{ width: "100%", padding: "14px 16px", borderRadius: 12,
              border: `1px solid ${G.border}`, fontSize: 16, lineHeight: 1.6,
              resize: "vertical", boxSizing: "border-box",
              fontFamily: "inherit", marginBottom: 16, outline: "none",
              color: G.text, background: G.grayL }} />

          <button onClick={handleSend} disabled={!motif}
            style={{ width: "100%", padding: "18px 20px", borderRadius: 14,
              border: "none", minHeight: 58, fontSize: 17, fontWeight: 700,
              cursor: motif ? "pointer" : "not-allowed", transition: "all .2s",
              background: motif
                ? `linear-gradient(135deg, ${G.navy}, ${G.blue})`
                : G.border,
              color: motif ? G.white : G.gray }}>
            📨 Envoyer au gestionnaire
          </button>
        </Card>
      ) : (
        <div style={{ background: G.greenL, borderRadius: 18, padding: "24px 22px",
          marginBottom: 18, border: "2px solid #86EFAC" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: G.green, marginBottom: 12 }}>
            ✅ Signalement envoyé
          </div>
          <div style={{ fontSize: 16, color: G.greenD, lineHeight: 1.85 }}>
            {profile?.civilite === "mere" ? "Madame" : profile?.civilite === "pere" ? "Monsieur" : "Madame, Monsieur"} {profile?.nom},<br />
            Votre signalement concernant <strong>{child.prenom}</strong> a bien été transmis à notre équipe.<br />
            Notre gestionnaire en prendra connaissance dans les plus brefs délais.<br />
            Nous vous remercions de votre collaboration.
          </div>
          <button
            onClick={() => { setSent(false); setMotif(""); setComplement(""); }}
            style={{ marginTop: 18, padding: "13px 22px", borderRadius: 12,
              border: `2px solid ${G.green}`, background: "transparent",
              color: G.green, fontSize: 16, fontWeight: 700, cursor: "pointer",
              minHeight: 50 }}>
            + Signaler autre chose
          </button>
        </div>
      )}

      {/* ── Historique mensuel ── */}
      <Card style={{ marginBottom: 0 }}>
        <SectionTitle>Historique des signalements</SectionTitle>

        {/* Onglets mois */}
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6,
          marginBottom: 20, msOverflowStyle: "none", scrollbarWidth: "none" } as any}>
          {allMonthKeys.map(k => (
            <button key={k} onClick={() => setActiveMonth(k)}
              style={{ padding: "9px 18px", borderRadius: 22, flexShrink: 0,
                border: `2px solid ${activeMonth === k ? G.blue : G.border}`,
                background: activeMonth === k ? G.blueL : "transparent",
                color: activeMonth === k ? G.blue : G.gray,
                fontWeight: activeMonth === k ? 700 : 500,
                fontSize: 14, cursor: "pointer", whiteSpace: "nowrap" }}>
              {monthLabel(k)}
            </button>
          ))}
        </div>

        {/* Contenu du mois */}
        {activeAbsences.length === 0 ? (
          <div style={{ textAlign: "center", padding: "28px 0", color: G.gray }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Aucun signalement ce mois-ci</div>
            <div style={{ fontSize: 14, opacity: 0.7, marginTop: 4 }}>
              Tous les trajets ont été effectués normalement.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {activeAbsences.map(a => {
              const confirmed = a.read_by_gestionnaire && a.transmitted_to_driver;
              const readOnly  = a.read_by_gestionnaire && !a.transmitted_to_driver;
              const bg     = confirmed ? G.greenL  : readOnly ? G.blueL   : G.amberL;
              const border = confirmed ? "#86EFAC" : readOnly ? "#BFDBFE" : "#FDE68A";
              return (
                <div key={a.id} style={{ borderRadius: 14, padding: "16px 18px",
                  background: bg, border: `1px solid ${border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: G.text }}>
                      {new Date(a.date_absence).toLocaleDateString("fr-FR",
                        { weekday: "long", day: "numeric", month: "long" })}
                    </div>
                    {confirmed
                      ? <Pill color={G.green}  bg={G.greenM}>✅ Transmis</Pill>
                      : readOnly
                      ? <Pill color={G.blue}   bg="#DBEAFE">📋 Lu</Pill>
                      : <Pill color={G.amber}  bg="#FEF9C3">⏳ En attente</Pill>
                    }
                  </div>
                  <div style={{ fontSize: 15, color: G.text, marginBottom: 6 }}>{a.reason}</div>
                  <div style={{ fontSize: 13, color: G.gray }}>
                    Signalé par {a.reported_by}
                    {a.reported_at && ` · ${new Date(a.reported_at).toLocaleTimeString("fr-FR",
                      { hour: "2-digit", minute: "2-digit" })}`}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
