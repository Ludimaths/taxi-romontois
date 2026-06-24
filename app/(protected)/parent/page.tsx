"use client";
import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import {
  Bus, AlertTriangle, MapPin, School, User, RefreshCw,
  Thermometer, Home, Edit3, CheckCircle2, Calendar, Printer, Send,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Enfant, AbsenceEnfant, Circuit, Profile, Conducteur } from "@/lib/types";

/* ─── palette ─── */
const G = {
  green:  "#059669", greenD: "#065F46", greenL: "#ECFDF5", greenM: "#D1FAE5",
  navy:   "#1E3A5F", blue:   "#2563EB", blueL:  "#EFF6FF",
  orange: "#EA580C", orangeL:"#FFF7ED",
  amber:  "#B45309", amberL: "#FEF3C7",
  gray:   "#64748B", grayL:  "#F8FAFC",
  border: "#E2E8F0", white:  "#FFFFFF", text:   "#1E293B",
};

const MOTIFS: { key: string; label: string; icon: ReactNode }[] = [
  { key: "malade",    label: "Mon enfant est malade",                   icon: <Thermometer size={22} color={G.amber} /> },
  { key: "maison",    label: "Reste à la maison aujourd'hui",           icon: <Home size={22} color={G.navy} /> },
  { key: "pere",      label: "Va chez son père ce soir",                icon: <User size={22} color={G.blue} /> },
  { key: "mere",      label: "Va chez sa mère ce soir",                 icon: <User size={22} color={G.blue} /> },
  { key: "ne_rentre", label: "Ne rentre pas ce soir",                   icon: <RefreshCw size={22} color={G.orange} /> },
  { key: "adresse",   label: "Changement d'adresse de prise en charge", icon: <MapPin size={22} color={G.green} /> },
  { key: "autre",     label: "Autre",                                    icon: <Edit3 size={22} color={G.gray} /> },
];

const MOIS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin",
                 "Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

/* ─── school year helpers ─── */
function schoolYearOf(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear(), m = d.getMonth();
  return m >= 8 ? `${y}-${y+1}` : `${y-1}-${y}`;
}
function currentSchoolYear(): string {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  return m >= 8 ? `${y}-${y+1}` : `${y-1}-${y}`;
}
function schoolYearLabel(sy: string) {
  return `Année scolaire ${sy.replace("-", "–")}`;
}
function monthKey(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2,"0")}`;
}
function monthLabel(mk: string) {
  const [, m] = mk.split("-");
  return MOIS_FR[parseInt(m)];
}

/* ─── small components ─── */
function InfoRow({ icon, label, value, orange }: { icon: ReactNode; label: string; value: string; orange?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 16px",
      background: orange ? G.orangeL : G.grayL, borderRadius: 12,
      border: `1px solid ${orange ? "#FDBA74" : G.border}` }}>
      <span style={{ display:"flex", alignItems:"center", flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11, color: orange ? G.orange : G.gray, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: orange ? G.orange : G.text, marginTop: 2 }}>{value}</div>
      </div>
    </div>
  );
}

function Pill({ children, color, bg }: { children: ReactNode; color: string; bg: string }) {
  return (
    <span style={{ padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
      color, background: bg, whiteSpace: "nowrap", display: "inline-block" }}>
      {children}
    </span>
  );
}

function Card({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: G.white, borderRadius: 16, padding: "20px 20px",
      marginBottom: 18, border: `1px solid ${G.border}`,
      boxShadow: "0 2px 8px rgba(0,0,0,0.04)", ...style }}>
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

function BackBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20,
        background: "none", border: "none", color: G.blue, fontSize: 15,
        fontWeight: 700, cursor: "pointer", padding: "4px 0" }}>
      ← {label}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════ */
export default function ParentPage() {
  const supabase = createClient();

  const [profile,    setProfile]    = useState<Profile | null>(null);
  const [child,      setChild]      = useState<Enfant | null>(null);
  const [circuit,    setCircuit]    = useState<Circuit | null>(null);
  const [conducteur, setConducteur] = useState<Conducteur | null>(null);
  const [remplacant, setRemplacant] = useState<Conducteur | null>(null);
  const [absences,   setAbsences]   = useState<AbsenceEnfant[]>([]);

  const [motif,       setMotif]      = useState("");
  const [complement,  setComplement] = useState("");
  const [sent,        setSent]       = useState(false);
  const [loading,     setLoading]    = useState(true);

  /* history navigation */
  const [selYear,  setSelYear]  = useState<string | null>(null);
  const [selMonth, setSelMonth] = useState<string | null>(null);

  /* ── load ── */
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

      if (circ?.id) {
        const { data: drivers } = await supabase
          .from("conducteurs").select("*").eq("circuit_id", circ.id);
        if (drivers?.length) {
          const today = new Date().toISOString().slice(0,10);
          const { data: absCondu } = await supabase
            .from("absences_conducteurs")
            .select("*, remplacant:conducteurs!absences_conducteurs_remplacant_id_fkey(*)")
            .eq("circuit_id", circ.id).eq("date_absence", today)
            .limit(1).maybeSingle();
          setConducteur(drivers[0]);
          if (absCondu?.remplacant) setRemplacant(absCondu.remplacant as any);
        }
      }

      setLoading(false);
    })();
  }, []);

  /* ── send ── */
  const handleSend = async () => {
    if (!child || !motif) return;
    const m = MOTIFS.find(x => x.key === motif)!;
    const reason = complement.trim()
      ? `${m.label} — ${complement.trim()}`
      : m.label;
    const today = new Date().toISOString().slice(0,10);
    await supabase.from("absences_enfants").insert({
      enfant_id: child.id, circuit_id: child.circuit_id,
      date_absence: today, reason,
      reported_by: profile ? `${profile.prenom} ${profile.nom}` : "Parent",
      read_by_gestionnaire: false, transmitted_to_driver: false,
    });
    setSent(true);
    const fresh = await loadAbsences(child.id);
    setAbsences(fresh);
  };

  /* ── school year tree ── */
  const curYear = currentSchoolYear();
  const yearSet = new Set([curYear, ...absences.map(a => schoolYearOf(a.date_absence))]);
  const allYears = Array.from(yearSet).sort().reverse();

  const absForYear = (sy: string) =>
    absences.filter(a => schoolYearOf(a.date_absence) === sy);

  const monthsForYear = (sy: string) => {
    const keys = new Set(absForYear(sy).map(a => monthKey(a.date_absence)));
    return Array.from(keys).sort().reverse();
  };

  const absForMonth = (mk: string) =>
    absences.filter(a => monthKey(a.date_absence) === mk);

  const civility = profile?.civilite === "mere" ? "Madame"
    : profile?.civilite === "pere" ? "Monsieur"
    : "Madame, Monsieur";

  const lastConfirmed = absences.find(a => a.read_by_gestionnaire && a.transmitted_to_driver);

  /* ── print month ── */
  const handlePrintMonth = () => window.print();

  if (loading) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", minHeight:300, gap:14, color:G.gray }}>
      <Bus size={36} color={G.gray} />
      <div style={{ fontSize:17 }}>Chargement de votre espace…</div>
    </div>
  );

  if (!child) return (
    <div style={{ textAlign:"center", padding:"48px 24px" }}>
      <div style={{ display:"flex", justifyContent:"center", marginBottom:14 }}>
        <AlertTriangle size={40} color={G.amber} />
      </div>
      <div style={{ fontSize:17, color:G.gray, lineHeight:1.7 }}>
        Aucun enfant associé à votre compte.<br />Contactez le gestionnaire.
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth:600, margin:"0 auto" }}>

      {/* ── Bienvenue ── */}
      <div style={{ background:`linear-gradient(135deg,${G.greenD},${G.green})`,
        borderRadius:20, padding:"26px 22px", marginBottom:20, color:G.white }}>
        <div style={{ fontSize:24, fontWeight:900, marginBottom:10 }}>
          Bonjour {civility} {profile?.nom} !
        </div>
        <div style={{ fontSize:16, lineHeight:1.7, opacity:0.95 }}>
          Bienvenue sur votre espace <strong>Taxi Romontois</strong>.<br />
          Cette plateforme vous permet de communiquer facilement avec notre équipe
          pour assurer le confort et la sécurité de votre enfant lors de ses trajets
          scolaires. Merci de votre confiance !
        </div>
      </div>

      {/* ── Confirmation gestionnaire ── */}
      {lastConfirmed && (
        <div style={{ background:G.blueL, borderRadius:14, padding:"18px 20px",
          marginBottom:18, border:"1px solid #BFDBFE" }}>
          <div style={{ fontSize:16, fontWeight:800, color:G.blue, marginBottom:8,
            display:"flex", alignItems:"center", gap:8 }}>
            <CheckCircle2 size={18} color={G.blue} /> Signalement confirmé
          </div>
          <div style={{ fontSize:15, color:"#1E40AF", lineHeight:1.8 }}>
            {civility} {profile?.nom},<br />
            Votre signalement du{" "}
            <strong>{new Date(lastConfirmed.date_absence).toLocaleDateString("fr-FR",
              { day:"numeric", month:"long" })}</strong>{" "}
            concernant <strong>{child.prenom}</strong> a été pris en compte par notre
            gestionnaire et transmis à votre conducteur.<br />
            Nous vous remercions de votre collaboration.
          </div>
        </div>
      )}

      {/* ── Fiche enfant ── */}
      <Card>
        <SectionTitle>Fiche enfant</SectionTitle>
        <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:18 }}>
          <div style={{ width:56, height:56, borderRadius:"50%", background:G.greenM,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:26, flexShrink:0 }}>
            {circuit?.emoji ?? <Bus size={26} color={G.green} />}
          </div>
          <div>
            <div style={{ fontSize:22, fontWeight:900, color:G.navy }}>
              {child.prenom} {child.nom}
            </div>
            <div style={{ fontSize:15, color:G.gray, marginTop:2 }}>
              {circuit?.cercle?.nom ?? "—"}
            </div>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <InfoRow icon={<MapPin size={20} color={G.gray} />} label="Circuit habituel"
            value={circuit ? `${circuit.emoji} ${circuit.nom}` : "—"} />
          <InfoRow icon={<School size={20} color={G.gray} />} label="École"
            value={circuit?.cercle?.nom ?? "—"} />
          <InfoRow icon={<Bus size={20} color={G.gray} />} label="Conducteur habituel"
            value={conducteur ? `${conducteur.prenom} ${conducteur.nom}` : "—"} />
          {remplacant && (
            <InfoRow icon={<RefreshCw size={20} color={G.orange} />} label="Remplaçant aujourd'hui"
              value={`${remplacant.prenom} ${remplacant.nom}`} orange />
          )}
        </div>
      </Card>

      {/* ── Signalement ── */}
      {!sent ? (
        <Card>
          <SectionTitle>Signaler un changement</SectionTitle>
          <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:18 }}>
            {MOTIFS.map(m => {
              const active = motif === m.key;
              return (
                <button key={m.key} onClick={() => setMotif(active ? "" : m.key)}
                  style={{ display:"flex", alignItems:"center", gap:16,
                    padding:"15px 16px", borderRadius:14, minHeight:58,
                    border:`2px solid ${active ? G.blue : G.border}`,
                    background: active ? G.blueL : G.white,
                    cursor:"pointer", textAlign:"left", transition:"all .15s" }}>
                  <span style={{ display:"flex", alignItems:"center", flexShrink:0 }}>{m.icon}</span>
                  <span style={{ fontSize:16, fontWeight: active ? 700 : 500,
                    color: active ? G.blue : G.text, flex:1 }}>{m.label}</span>
                  {active && <CheckCircle2 size={20} color={G.blue} />}
                </button>
              );
            })}
          </div>

          <textarea value={complement} onChange={e => setComplement(e.target.value)}
            placeholder="Informations complémentaires… (optionnel)"
            rows={3}
            style={{ width:"100%", padding:"14px 16px", borderRadius:12,
              border:`1px solid ${G.border}`, fontSize:16, lineHeight:1.6,
              resize:"vertical", boxSizing:"border-box", fontFamily:"inherit",
              marginBottom:16, outline:"none", color:G.text, background:G.grayL }} />

          <button onClick={handleSend} disabled={!motif}
            style={{ width:"100%", padding:"16px 20px", borderRadius:14,
              border:"none", minHeight:58, fontSize:17, fontWeight:700,
              cursor: motif ? "pointer" : "not-allowed", transition:"all .2s",
              background: motif ? `linear-gradient(135deg,${G.navy},${G.blue})` : G.border,
              color: motif ? G.white : G.gray }}>
            <span style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
              <Send size={18} /> Envoyer au gestionnaire
            </span>
          </button>
        </Card>
      ) : (
        <div style={{ background:G.greenL, borderRadius:18, padding:"24px 20px",
          marginBottom:18, border:"2px solid #86EFAC" }}>
          <div style={{ fontSize:22, fontWeight:900, color:G.green, marginBottom:12,
            display:"flex", alignItems:"center", gap:10 }}>
            <CheckCircle2 size={24} color={G.green} /> Signalement envoyé
          </div>
          <div style={{ fontSize:16, color:G.greenD, lineHeight:1.85 }}>
            {civility} {profile?.nom},<br />
            Votre signalement concernant <strong>{child.prenom}</strong> a bien été
            transmis à notre équipe.<br />
            Notre gestionnaire en prendra connaissance dans les plus brefs délais.<br />
            Nous vous remercions de votre collaboration.
          </div>
          <button onClick={() => { setSent(false); setMotif(""); setComplement(""); }}
            style={{ marginTop:18, padding:"13px 22px", borderRadius:12,
              border:`2px solid ${G.green}`, background:"transparent",
              color:G.green, fontSize:16, fontWeight:700, cursor:"pointer", minHeight:50 }}>
            + Signaler autre chose
          </button>
        </div>
      )}

      {/* ── Historique hiérarchique ── */}
      <Card style={{ marginBottom:0 }}>
        <SectionTitle>Historique des trajets</SectionTitle>

        {/* Niveau 3 : détail du mois */}
        {selYear && selMonth ? (
          <>
            <BackBtn label={`${schoolYearLabel(selYear)}`}
              onClick={() => setSelMonth(null)} />
            <div style={{ fontSize:18, fontWeight:800, color:G.navy, marginBottom:16 }}>
              {monthLabel(selMonth)} {selMonth.split("-")[0]}
            </div>

            {absForMonth(selMonth).length === 0 ? (
              <div style={{ textAlign:"center", padding:"24px 0", color:G.gray }}>
                <div style={{ display:"flex", justifyContent:"center", marginBottom:8 }}>
                  <CheckCircle2 size={28} color={G.green} />
                </div>
                <div style={{ fontSize:16 }}>Aucun signalement ce mois-ci</div>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {absForMonth(selMonth).map(a => {
                  const confirmed = a.read_by_gestionnaire && a.transmitted_to_driver;
                  const readOnly  = a.read_by_gestionnaire && !a.transmitted_to_driver;
                  const bg     = confirmed ? G.greenL  : readOnly ? G.blueL   : G.amberL;
                  const border = confirmed ? "#86EFAC" : readOnly ? "#BFDBFE" : "#FDE68A";
                  return (
                    <div key={a.id} style={{ borderRadius:14, padding:"16px",
                      background:bg, border:`1px solid ${border}` }}>
                      <div style={{ display:"flex", justifyContent:"space-between",
                        alignItems:"flex-start", gap:10, marginBottom:8 }}>
                        <div style={{ fontSize:16, fontWeight:700, color:G.text }}>
                          {new Date(a.date_absence).toLocaleDateString("fr-FR",
                            { weekday:"long", day:"numeric", month:"long" })}
                        </div>
                        {confirmed
                          ? <Pill color={G.green} bg={G.greenM}>Transmis</Pill>
                          : readOnly
                          ? <Pill color={G.blue}  bg="#DBEAFE">Lu</Pill>
                          : <Pill color={G.amber} bg="#FEF9C3">En attente</Pill>
                        }
                      </div>
                      <div style={{ fontSize:15, color:G.text, marginBottom:6 }}>{a.reason}</div>
                      <div style={{ fontSize:13, color:G.gray }}>
                        Signalé par {a.reported_by}
                        {a.reported_at && ` · ${new Date(a.reported_at)
                          .toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" })}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button onClick={handlePrintMonth}
              style={{ width:"100%", marginTop:20, padding:"14px 16px", borderRadius:12,
                border:`2px solid ${G.navy}`, background:"transparent",
                color:G.navy, fontSize:15, fontWeight:700, cursor:"pointer", minHeight:50 }}>
              <span style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                <Printer size={16} /> Télécharger ce mois en PDF
              </span>
            </button>
          </>
        ) : selYear ? (
          /* Niveau 2 : mois de l'année */
          <>
            <BackBtn label="Toutes les années" onClick={() => setSelYear(null)} />
            <div style={{ fontSize:18, fontWeight:800, color:G.navy, marginBottom:18 }}>
              {schoolYearLabel(selYear)}
            </div>
            {monthsForYear(selYear).length === 0 ? (
              <div style={{ textAlign:"center", padding:"24px 0", color:G.gray }}>
                <div style={{ display:"flex", justifyContent:"center", marginBottom:8 }}>
                  <Calendar size={28} color={G.gray} />
                </div>
                <div style={{ fontSize:16 }}>Aucun signalement enregistré cette année</div>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {monthsForYear(selYear).map(mk => {
                  const count = absForMonth(mk).length;
                  return (
                    <button key={mk} onClick={() => setSelMonth(mk)}
                      style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                        padding:"16px 18px", borderRadius:14, border:`1px solid ${G.border}`,
                        background:G.grayL, cursor:"pointer", minHeight:58, textAlign:"left" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10,
                        fontSize:17, fontWeight:700, color:G.text }}>
                        <Calendar size={16} color={G.gray} /> {monthLabel(mk)}
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        {count > 0 && (
                          <Pill color={G.amber} bg={G.amberL}>{count} signalement{count > 1 ? "s" : ""}</Pill>
                        )}
                        <span style={{ color:G.gray, fontSize:18 }}>›</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* Niveau 1 : années scolaires */
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {allYears.map(sy => {
              const count = absForYear(sy).length;
              const isCur = sy === curYear;
              return (
                <button key={sy} onClick={() => setSelYear(sy)}
                  style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                    padding:"18px 20px", borderRadius:16, cursor:"pointer", textAlign:"left",
                    minHeight:64, transition:"all .15s",
                    border:`2px solid ${isCur ? G.blue : G.border}`,
                    background: isCur ? G.blueL : G.white }}>
                  <div>
                    <div style={{ fontSize:17, fontWeight:800,
                      color: isCur ? G.blue : G.text }}>
                      {schoolYearLabel(sy)}
                    </div>
                    {isCur && (
                      <div style={{ fontSize:12, color:G.blue, fontWeight:600, marginTop:2 }}>
                        En cours
                      </div>
                    )}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    {count > 0 && (
                      <Pill color={G.gray} bg={G.grayL}>{count} signalement{count>1?"s":""}</Pill>
                    )}
                    <span style={{ color:G.gray, fontSize:20 }}>›</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
