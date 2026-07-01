"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Download, RefreshCw, CheckCircle2, XCircle, Users, Bus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";
import type { Eleve, PriseEnCharge, TourneeConfig, Ecole } from "@/lib/types";
import { genererFactureDGEO } from "@/lib/dgeo-export";

const isoToday = () => new Date().toISOString().slice(0, 10);
const MOIS = ["","Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const fmtMoisAnnee = (m: number, a: number) => `${MOIS[m]} ${a}`;

// ── Types locaux ──────────────────────────────────────────────────────────────
type Tab = "aujourd_hui" | "historique" | "facturation";

interface CircuitView {
  id: string;
  nom: string;
  emoji?: string;
  elevesCount: number;
  presents: number;
  absents: number;
}

export default function EcolePage() {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();

  const [ecole,    setEcole]    = useState<Ecole | null>(null);
  const [eleves,   setEleves]   = useState<Eleve[]>([]);
  const [prises,   setPrises]   = useState<PriseEnCharge[]>([]);
  const [tournees, setTournees] = useState<TourneeConfig[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState<Tab>("aujourd_hui");

  // Facturation
  const [factureMois, setFactureMois] = useState(new Date().getMonth() + 1);
  const [factureAnnee, setFactureAnnee] = useState(new Date().getFullYear());
  const [factureBusy,  setFactureBusy]  = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { data: prof } = await sb.from("profiles")
      .select("ecole_id").eq("id", user.id).single();
    if (!prof?.ecole_id) { setLoading(false); return; }

    const ecoleId = prof.ecole_id as number;
    const today   = isoToday();

    const [ec, el, pr, to] = await Promise.all([
      sb.from("ecoles").select("*").eq("id", ecoleId).single(),
      sb.from("eleves").select("*").eq("ecole_id", ecoleId).eq("actif", true).order("nom_famille"),
      sb.from("prises_en_charge")
        .select("*,eleve:eleves(nom_famille,prenom_initiale,circuit_id,ecole_id)")
        .eq("date", today)
        .order("heure_prise"),
      sb.from("tournees_config").select("*").eq("ecole_id", ecoleId).eq("actif", true),
    ]);

    setEcole(ec.data ?? null);
    setEleves(el.data ?? []);
    setPrises(pr.data ?? []);
    setTournees(to.data ?? []);
    setLoading(false);
  }, [sb, router]);

  useEffect(() => {
    load();
    const ch = sb.channel("ecole-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "prises_en_charge" }, load)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [load, sb]);

  const handleSignOut = async () => {
    await sb.auth.signOut();
    router.push("/login");
  };

  // ── Calculs aujourd'hui ───────────────────────────────────────────────────
  const elevesIds = useMemo(() => new Set(eleves.map(e => e.id)), [eleves]);

  const prisesAujourdhui = useMemo(
    () => prises.filter(p => elevesIds.has(p.eleve_id)),
    [prises, elevesIds]
  );

  const presents = prisesAujourdhui.filter(p => p.statut === "present").length;
  const absents  = prisesAujourdhui.filter(p => p.statut === "absent").length;
  const nonValides = eleves.length - presents - absents;

  // Vue par circuit
  const circuitViews = useMemo((): CircuitView[] => {
    const map: Record<string, CircuitView> = {};
    eleves.forEach(e => {
      const cid = e.circuit_id || "_sans";
      if (!map[cid]) map[cid] = { id: cid, nom: cid === "_sans" ? "Sans circuit" : cid, elevesCount: 0, presents: 0, absents: 0 };
      map[cid].elevesCount++;
    });
    prisesAujourdhui.forEach(p => {
      const eleve = eleves.find(e => e.id === p.eleve_id);
      const cid = eleve?.circuit_id || "_sans";
      if (map[cid]) {
        if (p.statut === "present") map[cid].presents++;
        else map[cid].absents++;
      }
    });
    return Object.values(map);
  }, [eleves, prisesAujourdhui]);

  // ── Historique prises en charge ───────────────────────────────────────────
  const [histMois,  setHistMois]  = useState(new Date().getMonth() + 1);
  const [histAnnee, setHistAnnee] = useState(new Date().getFullYear());
  const [histPrises, setHistPrises] = useState<PriseEnCharge[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  const loadHist = useCallback(async () => {
    if (!ecole) return;
    setHistLoading(true);
    const debut = `${histAnnee}-${String(histMois).padStart(2,"0")}-01`;
    const fin   = new Date(histAnnee, histMois, 0).toISOString().slice(0,10);
    const { data } = await sb.from("prises_en_charge")
      .select("*,eleve:eleves(nom_famille,prenom_initiale,circuit_id,ecole_id)")
      .gte("date", debut).lte("date", fin)
      .in("eleve_id", eleves.map(e => e.id))
      .order("date");
    setHistPrises(data ?? []);
    setHistLoading(false);
  }, [sb, ecole, eleves, histMois, histAnnee]);

  useEffect(() => {
    if (tab === "historique" && ecole) loadHist();
  }, [tab, histMois, histAnnee, ecole, loadHist]);

  // ── Export DGEO ───────────────────────────────────────────────────────────
  const handleDownloadFacture = async () => {
    if (!ecole) return;
    setFactureBusy(true);
    try {
      // Prises du mois pour calcul
      const debut = `${factureAnnee}-${String(factureMois).padStart(2,"0")}-01`;
      const fin   = new Date(factureAnnee, factureMois, 0).toISOString().slice(0,10);
      const { data: prisesM } = await sb.from("prises_en_charge")
        .select("*").gte("date", debut).lte("date", fin)
        .in("eleve_id", eleves.map(e => e.id));

      // Paramètres entreprise depuis Supabase
      const { data: paramRows } = await sb.from("parametres")
        .select("cle,valeur")
        .in("cle", ["nom_entreprise","adresse","telephone","tva","iban"]);
      const params: Record<string,string> = {};
      (paramRows ?? []).forEach((r: { cle: string; valeur: string }) => { params[r.cle] = r.valeur; });

      const numFacture = `TR-${factureAnnee}${String(factureMois).padStart(2,"0")}-${String(ecole.id).padStart(3,"0")}`;

      const bytes = genererFactureDGEO({
        ecole,
        tournees,
        prises: prisesM ?? [],
        eleves,
        mois: factureMois,
        annee: factureAnnee,
        numFacture,
        params: {
          nom:       params.nom_entreprise,
          adresse:   params.adresse,
          telephone: params.telephone,
          tva:       params.tva,
          iban:      params.iban,
        },
      });

      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `Facture_DGEO_${ecole.nom.replace(/\s+/g,"_")}_${fmtMoisAnnee(factureMois, factureAnnee).replace(" ","_")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setFactureBusy(false);
    }
  };

  if (loading) return (
    <div style={{ textAlign: "center", padding: 60, color: C.gray400 }}>Chargement…</div>
  );

  if (!ecole) return (
    <div style={{ textAlign: "center", padding: 60, color: C.red, fontWeight: 700 }}>
      Aucun établissement associé à ce compte.
    </div>
  );

  const today = isoToday();
  const todayLabel = new Date(today + "T00:00:00").toLocaleDateString("fr-CH", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div style={{ minHeight: "100vh", background: C.gray50 }}>
      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 100, background: C.navy,
        height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>
        <div>
          <div style={{ color: C.white, fontWeight: 800, fontSize: 15 }}>{ecole.nom}</div>
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>Espace établissement</div>
        </div>
        <button onClick={handleSignOut}
          style={{ background: "rgba(255,255,255,0.15)", border: "none", color: C.white,
            cursor: "pointer", padding: "6px 10px", borderRadius: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <LogOut size={16} /> Déconnexion
        </button>
      </header>

      {/* Tabs */}
      <div style={{ background: C.white, borderBottom: `1px solid ${C.gray200}`,
        display: "flex", overflow: "auto", padding: "0 8px" }}>
        {([
          { id: "aujourd_hui",  label: "Aujourd'hui" },
          { id: "historique",   label: "Historique" },
          { id: "facturation",  label: "Facturation" },
        ] as { id: Tab; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: "14px 16px", border: "none", background: "none",
              cursor: "pointer", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap",
              color: tab === t.id ? C.navy : C.gray400,
              borderBottom: `2px solid ${tab === t.id ? C.navy : "transparent"}` }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "20px 16px", maxWidth: 720, margin: "0 auto" }}>

        {/* ── AUJOURD'HUI ────────────────────────────────────────── */}
        {tab === "aujourd_hui" && (
          <div>
            <div style={{ fontWeight: 700, color: C.gray600, fontSize: 13,
              textTransform: "capitalize", marginBottom: 16 }}>{todayLabel}</div>

            {/* Stats globales */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 20 }}>
              {[
                { l: "Présents",    v: presents,   c: C.green,   bg: C.greenL },
                { l: "Absents",     v: absents,    c: C.red,     bg: C.redL   },
                { l: "Non signalés",v: nonValides, c: C.amber,   bg: C.amberL },
              ].map(s => (
                <div key={s.l} style={{ background: s.bg, borderRadius: 14, padding: "14px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 26, fontWeight: 900, color: s.c }}>{s.v}</div>
                  <div style={{ fontSize: 11, color: C.gray600, marginTop: 2 }}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* Par circuit */}
            <div style={{ fontWeight: 800, fontSize: 14, color: C.navy, marginBottom: 10 }}>
              <Bus size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
              Par circuit
            </div>
            {circuitViews.map(cv => (
              <div key={cv.id} style={{ background: C.white, borderRadius: 12, padding: "14px 16px",
                marginBottom: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: C.navy }}>{cv.nom}</div>
                  <div style={{ fontSize: 12, color: C.gray400 }}>{cv.elevesCount} élève{cv.elevesCount > 1 ? "s" : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {cv.presents > 0 && (
                    <span style={{ background: C.greenL, color: C.green, borderRadius: 20,
                      padding: "3px 10px", fontWeight: 800, fontSize: 12 }}>
                      {cv.presents} ✓
                    </span>
                  )}
                  {cv.absents > 0 && (
                    <span style={{ background: C.redL, color: C.red, borderRadius: 20,
                      padding: "3px 10px", fontWeight: 800, fontSize: 12 }}>
                      {cv.absents} ✗
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* Liste élèves du jour */}
            <div style={{ fontWeight: 800, fontSize: 14, color: C.navy, margin: "20px 0 10px" }}>
              <Users size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
              Élèves du jour
            </div>
            {eleves.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: C.gray400 }}>
                Aucun élève enregistré pour cet établissement
              </div>
            ) : eleves.map(el => {
              const prise = prisesAujourdhui.find(p => p.eleve_id === el.id);
              return (
                <div key={el.id} style={{ background: C.white, borderRadius: 12,
                  padding: "12px 16px", marginBottom: 6,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  borderLeft: `3px solid ${prise ? (prise.statut === "present" ? C.green : C.red) : C.gray200}` }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.gray800 }}>
                      {el.nom_famille} {el.prenom_initiale}.
                    </div>
                    <div style={{ fontSize: 11, color: C.gray400 }}>
                      {el.circuit_id || "Circuit non défini"}
                    </div>
                  </div>
                  {prise ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6,
                      color: prise.statut === "present" ? C.green : C.red, fontWeight: 700, fontSize: 13 }}>
                      {prise.statut === "present"
                        ? <><CheckCircle2 size={16} /> Présent</>
                        : <><XCircle size={16} /> Absent</>
                      }
                      {prise.heure_prise && (
                        <span style={{ fontSize: 11, color: C.gray400, fontWeight: 400 }}>
                          {prise.heure_prise.slice(0,5)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, color: C.amber, fontWeight: 700 }}>En attente</span>
                  )}
                </div>
              );
            })}

            <button onClick={load}
              style={{ display: "flex", alignItems: "center", gap: 6, margin: "16px auto 0",
                background: "none", border: `1px solid ${C.gray200}`, borderRadius: 8,
                padding: "8px 14px", cursor: "pointer", color: C.gray600, fontSize: 13 }}>
              <RefreshCw size={14} /> Actualiser
            </button>
          </div>
        )}

        {/* ── HISTORIQUE ─────────────────────────────────────────── */}
        {tab === "historique" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <select value={histMois} onChange={e => setHistMois(Number(e.target.value))}
                style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.gray200}`,
                  fontSize: 13, color: C.gray800, background: C.white }}>
                {MOIS.slice(1).map((n, i) => <option key={i+1} value={i+1}>{n}</option>)}
              </select>
              <select value={histAnnee} onChange={e => setHistAnnee(Number(e.target.value))}
                style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.gray200}`,
                  fontSize: 13, color: C.gray800, background: C.white }}>
                {[2024,2025,2026,2027].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            {histLoading ? (
              <div style={{ textAlign: "center", padding: 40, color: C.gray400 }}>Chargement…</div>
            ) : histPrises.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: C.gray400, fontWeight: 700 }}>
                Aucune prise en charge ce mois
              </div>
            ) : (() => {
              // Grouper par jour
              const byDay: Record<string, PriseEnCharge[]> = {};
              histPrises.forEach(p => { (byDay[p.date] ??= []).push(p); });
              return Object.entries(byDay).sort(([a],[b]) => b.localeCompare(a)).map(([day, dps]) => {
                const dt = new Date(day + "T00:00:00");
                const label = dt.toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long" });
                const pres = dps.filter(p => p.statut === "present").length;
                const abs  = dps.filter(p => p.statut === "absent").length;
                return (
                  <div key={day} style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: C.navy,
                      textTransform: "capitalize", marginBottom: 6 }}>
                      {label}
                      <span style={{ marginLeft: 8, fontSize: 12, color: C.green, fontWeight: 700 }}>{pres} présents</span>
                      {abs > 0 && <span style={{ marginLeft: 6, fontSize: 12, color: C.red, fontWeight: 700 }}>{abs} absents</span>}
                    </div>
                    {dps.map(p => {
                      const el = eleves.find(e => e.id === p.eleve_id);
                      return (
                        <div key={p.id} style={{ background: C.white, borderRadius: 10,
                          padding: "10px 14px", marginBottom: 4, fontSize: 13,
                          display: "flex", justifyContent: "space-between",
                          borderLeft: `3px solid ${p.statut === "present" ? C.green : C.red}` }}>
                          <span style={{ fontWeight: 700, color: C.gray800 }}>
                            {el ? `${el.nom_famille} ${el.prenom_initiale}.` : `Élève #${p.eleve_id}`}
                          </span>
                          <span style={{ color: p.statut === "present" ? C.green : C.red, fontWeight: 700 }}>
                            {p.statut === "present" ? "Présent" : "Absent"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              });
            })()}
          </div>
        )}

        {/* ── FACTURATION ────────────────────────────────────────── */}
        {tab === "facturation" && (
          <div>
            <div style={{ background: C.white, borderRadius: 16, padding: 20,
              boxShadow: "0 2px 8px rgba(0,0,0,0.07)", marginBottom: 20 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: C.navy, marginBottom: 4 }}>
                Facture DGEO — Annexe 6b
              </div>
              <div style={{ fontSize: 13, color: C.gray600, marginBottom: 20 }}>
                Sélectionnez le mois et téléchargez la facture au format Excel officiel.
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600,
                    textTransform: "uppercase", marginBottom: 4 }}>Mois</label>
                  <select value={factureMois} onChange={e => setFactureMois(Number(e.target.value))}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8,
                      border: `1px solid ${C.gray200}`, fontSize: 13, color: C.gray800 }}>
                    {MOIS.slice(1).map((n, i) => <option key={i+1} value={i+1}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600,
                    textTransform: "uppercase", marginBottom: 4 }}>Année</label>
                  <select value={factureAnnee} onChange={e => setFactureAnnee(Number(e.target.value))}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8,
                      border: `1px solid ${C.gray200}`, fontSize: 13, color: C.gray800 }}>
                    {[2024,2025,2026,2027].map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ background: C.skyL, borderRadius: 10, padding: "12px 14px",
                marginBottom: 20, fontSize: 13, color: C.navy }}>
                <strong>{ecole.nom}</strong><br />
                {tournees.length} tournée{tournees.length > 1 ? "s" : ""} configurée{tournees.length > 1 ? "s" : ""} ·{" "}
                {eleves.length} élève{eleves.length > 1 ? "s" : ""} actif{eleves.length > 1 ? "s" : ""}
              </div>

              <button onClick={handleDownloadFacture} disabled={factureBusy}
                style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none",
                  background: factureBusy ? C.gray200 : C.navy, color: C.white, cursor: factureBusy ? "default" : "pointer",
                  fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Download size={18} />
                {factureBusy ? "Génération en cours…" : `Télécharger la facture — ${fmtMoisAnnee(factureMois, factureAnnee)}`}
              </button>
            </div>

            {/* Tournées configurées */}
            {tournees.length > 0 && (
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: C.navy, marginBottom: 10 }}>
                  Tournées de cet établissement
                </div>
                {tournees.map(t => (
                  <div key={t.id} style={{ background: C.white, borderRadius: 12,
                    padding: "12px 16px", marginBottom: 8,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.gray800 }}>{t.nom}</div>
                    <div style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>
                      {t.sens === "aller" ? "Aller" : "Retour"} ·{" "}
                      {["","Lun","Mar","Mer","Jeu","Ven","Sam","Dim"][t.jour_semaine]} ·{" "}
                      {t.km} km · {t.duree_minutes} min ·{" "}
                      {t.prix_km} CHF/km · {t.prix_heure} CHF/h
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
