"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { C, fmtDate, fmtDateTime } from "@/lib/constants";
import { Badge, Btn } from "@/components/ui";
import type { Reparation } from "@/lib/types";
const nbJ = (a: string, b: string) => Math.round((+new Date(b) - +new Date(a)) / 86400000);

// ── Statut config ─────────────────────────────────────────────────────────────
const RS: Record<string, { label: string; color: string; bg: string }> = {
  receptionne:           { label: "Réceptionné",         color: "#2563EB", bg: "#DBEAFE" },
  en_attente_validation: { label: "Attente validation",  color: C.amber,  bg: C.amberL  },
  en_attente_piece:      { label: "Attente pièce",       color: C.amber,  bg: C.amberL  },
  en_reparation:         { label: "En réparation",       color: C.navy,   bg: "#EFF6FF" },
  repare:                { label: "Réparé — prêt",       color: "#7C3AED",bg: "#EDE9FE" },
  remis_en_circulation:  { label: "Remis en service",    color: C.green,  bg: C.greenL  },
  annulee:               { label: "Annulée",             color: C.gray600,bg: C.gray100 },
};

function ChipR({ s }: { s: string }) {
  const r = RS[s] ?? RS.annulee;
  return (
    <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: r.bg, color: r.color }}>
      {r.label}
    </span>
  );
}

const SEUIL = 1000;
const iso1M = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString(); };
const iso1Y = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString(); };

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ReparationsGestPage() {
  const sb = createClient();
  const [reparations, setReparations] = useState<Reparation[]>([]);
  const [vehicles,    setVehicles]    = useState<{ id: string; plaque: string }[]>([]);
  const [drivers,     setDrivers]     = useState<{ id: number; prenom: string; nom: string }[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [sel,         setSel]         = useState<Reparation | null>(null);

  // Filters
  const [filterSt,  setFilterSt]  = useState("active"); // active | done | all
  const [filterVeh, setFilterVeh] = useState("");
  const [filterPer, setFilterPer] = useState("all");   // all | mois | annee

  // Messaging
  const [msgOpen, setMsgOpen]   = useState(false);
  const [msgText, setMsgText]   = useState("");
  const [sending, setSending]   = useState(false);

  const fetchAll = useCallback(async () => {
    const [rep, veh, drv] = await Promise.all([
      sb.from("reparations")
        .select("*,vehicule:vehicules(id,plaque,marque,modele)")
        .order("created_at", { ascending: false }),
      sb.from("vehicules").select("id,plaque,marque,conducteur:conducteurs(prenom,nom)").order("plaque"),
      sb.from("conducteurs").select("id,prenom,nom").order("nom"),
    ]);
    setReparations(rep.data ?? []);
    setVehicles(veh.data ?? []);
    setDrivers(drv.data ?? []);
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    fetchAll();
    const ch = sb.channel("gest-rep-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "reparations" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicules" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "alertes" }, fetchAll)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [fetchAll, sb]);

  const sendMsg = async () => {
    if (!sel || !msgText.trim()) return;
    setSending(true);
    const veh = (sel.vehicule as { plaque?: string } | undefined)?.plaque || sel.vehicule_id;
    await sb.from("alertes").insert({
      type: "transmis_meca", severity: "normale",
      message: `[Gestionnaire → Mécanicien] ${veh} : ${msgText.trim()}`,
      read: false, vehicle_id: sel.vehicule_id,
    });
    setMsgText("");
    setSending(false);
    setMsgOpen(false);
  };

  // ── Filter ─────────────────────────────────────────────────────────────────
  const ACTIVE_STATUTS = ["receptionne","en_attente_validation","en_attente_piece","en_reparation","repare"];
  const filtered = reparations.filter(r => {
    if (filterSt === "active" && !ACTIVE_STATUTS.includes(r.statut)) return false;
    if (filterSt === "done"   && ACTIVE_STATUTS.includes(r.statut)) return false;
    if (filterVeh && r.vehicule_id !== filterVeh) return false;
    if (filterPer === "mois"  && r.created_at < iso1M()) return false;
    if (filterPer === "annee" && r.created_at < iso1Y()) return false;
    return true;
  });

  // ── Computed ───────────────────────────────────────────────────────────────
  const now = new Date();
  const m0  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const y0  = new Date(now.getFullYear(), 0, 1).toISOString();
  const budgetMois = reparations.filter(r => r.created_at >= m0).reduce((s,r) => s+(r.cout||0), 0);
  const budgetAn   = reparations.filter(r => r.created_at >= y0).reduce((s,r) => s+(r.cout||0), 0);
  const enCours    = reparations.filter(r => ACTIVE_STATUTS.includes(r.statut));
  const avValidation = reparations.filter(r => r.statut === "en_attente_validation");

  if (loading) return (
    <div style={{ textAlign: "center", padding: 60, color: C.gray400, fontSize: 14 }}>Chargement…</div>
  );

  const inp: React.CSSProperties = {
    padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.gray200}`,
    fontSize: 13, color: C.gray800, background: C.white,
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: C.navy, margin: "0 0 4px" }}>Réparations</h1>
        <p style={{ fontSize: 13, color: C.gray600, margin: 0 }}>
          {enCours.length} en cours · suivi mécanicien en temps réel
        </p>
      </div>

      {/* Budget cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "En cours",         val: enCours.length,         c: C.amber,  bg: C.amberL,   unit: "" },
          { label: "Validation requise",val: avValidation.length,    c: C.red,    bg: C.redL,     unit: "" },
          { label: "Budget ce mois",   val: budgetMois,             c: C.navy,   bg: "#EFF6FF",   unit: " CHF" },
          { label: "Budget cette année",val: budgetAn,              c: "#7C3AED",bg: "#EDE9FE",   unit: " CHF" },
        ].map(x => (
          <div key={x.label} style={{ background: x.bg, borderRadius: 14, padding: "14px 16px",
            border: `1px solid ${x.c}22` }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: x.c }}>
              {typeof x.val === "number" && x.unit ? x.val.toLocaleString("fr-CH") + x.unit : x.val}
            </div>
            <div style={{ fontSize: 11, color: C.gray600, marginTop: 3, lineHeight: 1.3 }}>{x.label}</div>
          </div>
        ))}
      </div>

      {/* Validation en attente banner */}
      {avValidation.length > 0 && (
        <div style={{ background: C.redL, borderRadius: 14, padding: 16, marginBottom: 20,
          border: `1px solid #FCA5A5` }}>
          <div style={{ fontWeight: 800, color: C.red, marginBottom: 10 }}>
            ⚠️ {avValidation.length} réparation(s) en attente de validation budget
          </div>
          {avValidation.map(r => {
            const veh = (r.vehicule as { plaque?: string } | undefined)?.plaque || r.vehicule_id;
            return (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 0", borderTop: `1px solid #FCA5A5`, fontSize: 13 }}>
                <span style={{ fontWeight: 700 }}>{veh} — {r.description.slice(0,60)}</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {r.cout_estime != null && (
                    <span style={{ fontWeight: 800, color: C.red }}>
                      {r.cout_estime.toLocaleString("fr-CH")} CHF
                    </span>
                  )}
                  <button onClick={() => setSel(r)}
                    style={{ padding: "4px 10px", borderRadius: 8, border: `1px solid ${C.red}`,
                      background: C.white, color: C.red, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    Voir →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div style={{ background: C.white, borderRadius: 14, padding: "12px 16px", marginBottom: 20,
        border: `1px solid ${C.gray200}`, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>

        {([["active","En cours"],["done","Archivées"],["all","Toutes"]] as const).map(([v,l]) => (
          <button key={v} onClick={() => setFilterSt(v)}
            style={{ padding: "5px 12px", borderRadius: 20, border: `1.5px solid ${filterSt === v ? C.navyL : C.gray200}`,
              background: filterSt === v ? C.navyL : C.white,
              color: filterSt === v ? C.white : C.gray600,
              fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            {l}
          </button>
        ))}

        <div style={{ height: 24, width: 1, background: C.gray200 }} />

        <select value={filterVeh} onChange={e => setFilterVeh(e.target.value)} style={inp}>
          <option value="">Tous véhicules</option>
          {vehicles.map(v => <option key={v.id} value={v.id}>{v.plaque}</option>)}
        </select>

        <select value={filterPer} onChange={e => setFilterPer(e.target.value)} style={inp}>
          <option value="all">Toutes périodes</option>
          <option value="mois">Ce mois</option>
          <option value="annee">Cette année</option>
        </select>
      </div>

      {/* List + detail */}
      <div style={{ display: "grid", gridTemplateColumns: sel ? "1fr 1fr" : "1fr", gap: 20, alignItems: "start" }}>

        {/* List */}
        <div>
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "50px 0" }}>
              <div style={{ fontSize: 48 }}>🔧</div>
              <p style={{ fontWeight: 700, color: C.gray600, marginTop: 12, fontSize: 15 }}>Aucune réparation</p>
            </div>
          ) : filtered.map(r => {
            const veh = (r.vehicule as { plaque?: string; marque?: string; modele?: string } | undefined);
            const duree = r.date_debut_reparation && r.date_fin_reparation
              ? nbJ(r.date_debut_reparation, r.date_fin_reparation) : null;
            const isSelected = sel?.id === r.id;
            const needsVal = r.statut === "en_attente_validation";
            return (
              <div key={r.id} onClick={() => setSel(isSelected ? null : r)}
                style={{ background: needsVal ? "#FFF5F5" : C.white, borderRadius: 14, padding: "14px 18px", marginBottom: 10,
                  cursor: "pointer", boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
                  borderLeft: `4px solid ${RS[r.statut]?.color ?? C.gray600}`,
                  border: isSelected ? `2px solid ${C.navyL}` : undefined,
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                  gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: C.navy }}>
                      {veh?.plaque || r.vehicule_id}
                      <span style={{ fontWeight: 400, color: C.gray600, fontSize: 13, marginLeft: 8 }}>
                        {veh?.marque} {veh?.modele}
                      </span>
                    </div>
                    <ChipR s={r.statut} />
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {r.cout != null && (
                      <div style={{ fontWeight: 800, color: C.navy, fontSize: 15 }}>
                        {r.cout.toLocaleString("fr-CH")} CHF
                      </div>
                    )}
                    {r.cout_estime != null && r.cout == null && (
                      <div style={{ fontWeight: 700, color: C.amber, fontSize: 14 }}>
                        ~{r.cout_estime.toLocaleString("fr-CH")} CHF estimé
                      </div>
                    )}
                  </div>
                </div>
                <p style={{ fontSize: 13, color: "#475569", margin: "0 0 8px", lineHeight: 1.5 }}>
                  {r.description.slice(0, 100)}{r.description.length > 100 ? "…" : ""}
                </p>
                <div style={{ display: "flex", gap: 14, fontSize: 11, color: C.gray400, flexWrap: "wrap" }}>
                  {r.date_reception && <span>📥 Réceptionné le {fmtDate(r.date_reception)}</span>}
                  {r.date_debut_reparation && <span>🔧 Début {fmtDate(r.date_debut_reparation)}</span>}
                  {r.date_fin_reparation && <span>✅ Terminé {fmtDate(r.date_fin_reparation)}</span>}
                  {duree != null && <span>⏱ {duree}j</span>}
                  {r.date_remise_circulation && <span>🚌 En service {fmtDate(r.date_remise_circulation)}</span>}
                  {(r.cout_estime ?? 0) >= SEUIL && r.cout == null && (
                    <span style={{ color: C.red, fontWeight: 700 }}>⚠ Validation requise</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        {sel && (() => {
          const veh = (sel.vehicule as { plaque?: string; marque?: string; modele?: string } | undefined);
          const duree = sel.date_debut_reparation && sel.date_fin_reparation
            ? nbJ(sel.date_debut_reparation, sel.date_fin_reparation) : null;
          return (
            <div style={{ background: C.white, borderRadius: 16, padding: 20,
              border: `1px solid ${C.gray200}`, position: "sticky", top: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ fontWeight: 800, fontSize: 15, color: C.navy }}>
                  {veh?.plaque || sel.vehicule_id}
                </span>
                <button onClick={() => setSel(null)}
                  style={{ fontSize: 22, background: "none", border: "none", cursor: "pointer",
                    color: C.gray400, lineHeight: 1, padding: "0 4px" }}>×</button>
              </div>

              <ChipR s={sel.statut} />

              <p style={{ fontSize: 13, color: C.gray800, lineHeight: 1.6, margin: "12px 0" }}>
                {sel.description}
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 0, marginBottom: 16 }}>
                {[
                  ["Véhicule",       `${veh?.marque ?? ""} ${veh?.modele ?? ""}`.trim() || "—"],
                  ["Réceptionné",    fmtDate(sel.date_reception)],
                  ["Km réception",   sel.km_reception != null ? `${sel.km_reception.toLocaleString()} km` : "—"],
                  ["Type interv.",   sel.type_intervention === "externe" ? `Externe${sel.nom_garage ? ` — ${sel.nom_garage}` : ""}` : sel.type_intervention === "piece" ? "Pièce détachée" : sel.type_intervention === "interne" ? "Interne atelier" : "—"],
                  ["Pièce",          sel.piece_nom ? `${sel.piece_nom}${sel.piece_fournisseur ? ` — ${sel.piece_fournisseur}` : ""}` : "—"],
                  ["Commandée le",   fmtDate(sel.date_commande_piece)],
                  ["Réception est.", fmtDate(sel.date_reception_piece_estimee)],
                  ["Début réparat.", fmtDate(sel.date_debut_reparation)],
                  ["Fin réparat.",   fmtDate(sel.date_fin_reparation)],
                  ["Durée",          duree != null ? `${duree} jour${duree > 1 ? "s" : ""}` : "—"],
                  ["Km sortie",      sel.km_sortie != null ? `${sel.km_sortie.toLocaleString()} km` : "—"],
                  ["Coût estimé",    sel.cout_estime != null ? `${sel.cout_estime.toLocaleString("fr-CH")} CHF` : "—"],
                  ["Coût final",     sel.cout != null ? `${sel.cout.toLocaleString("fr-CH")} CHF` : "—"],
                  ["Remis en serv.", fmtDate(sel.date_remise_circulation)],
                ].filter(([,v]) => v !== "—").map(([l,v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between",
                    padding: "7px 0", borderBottom: `1px solid ${C.gray100}`, fontSize: 13 }}>
                    <span style={{ color: C.gray600, fontWeight: 600 }}>{l}</span>
                    <span style={{ color: C.gray800, fontWeight: 700, textAlign: "right", maxWidth: "60%" }}>{v}</span>
                  </div>
                ))}
              </div>

              {sel.commentaire_mecanicien && !sel.commentaire_mecanicien.startsWith("Photos:") && (
                <div style={{ background: C.gray50, borderRadius: 10, padding: 12, marginBottom: 12,
                  fontSize: 12, fontStyle: "italic", color: C.gray600, lineHeight: 1.5 }}>
                  💬 {sel.commentaire_mecanicien}
                </div>
              )}

              {sel.statut === "en_attente_validation" && (
                <div style={{ background: C.amberL, borderRadius: 10, padding: 12, marginBottom: 12,
                  fontSize: 13, color: C.amber, fontWeight: 700, lineHeight: 1.5 }}>
                  ⚠️ Cette réparation dépasse {SEUIL.toLocaleString()} CHF et nécessite une validation.
                  L'administrateur a été notifié automatiquement.
                </div>
              )}

              <div style={{ fontSize: 11, color: C.gray400, marginBottom: 12 }}>
                Enregistré {fmtDateTime(sel.created_at)}
              </div>

              {/* Message au mécanicien */}
              {!msgOpen ? (
                <Btn full outline color={C.navyL} onClick={() => setMsgOpen(true)}>
                  💬 Envoyer un message au mécanicien
                </Btn>
              ) : (
                <div>
                  <textarea value={msgText} onChange={e => setMsgText(e.target.value)} rows={3}
                    placeholder="Votre message au mécanicien…"
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, boxSizing: "border-box",
                      border: `1px solid ${C.gray200}`, fontSize: 13, resize: "vertical", marginBottom: 8 }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn full onClick={sendMsg} disabled={!msgText.trim() || sending} color={C.navyL}>
                      {sending ? "Envoi…" : "📤 Envoyer"}
                    </Btn>
                    <Btn outline color={C.gray600} onClick={() => { setMsgOpen(false); setMsgText(""); }}>
                      Annuler
                    </Btn>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
