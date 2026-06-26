"use client";
import { useState } from "react";
import { CalendarDays, Send, Clock, CheckCircle2, XCircle, ArrowRight, Inbox, AlertTriangle } from "lucide-react";
import { C, fmtDate } from "@/lib/constants";
import type { CongesDemande, CongesStatut } from "@/lib/types";

const MOTIFS_CONGE = ["Congé payé", "Maladie", "Formation", "Personnel", "Autre"];

const STATUT_CFG: Record<CongesStatut, { label: string; color: string; bg: string }> = {
  en_attente:     { label: "En attente",              color: C.amber,   bg: C.amberL },
  transmis_admin: { label: "Transmis à la direction", color: "#2563EB", bg: "#EFF6FF" },
  accepte:        { label: "Accepté",                 color: C.green,   bg: C.greenL },
  refuse:         { label: "Refusé",                  color: C.red,     bg: C.redL   },
};

const inp: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: `1.5px solid ${C.gray200}`, fontSize: 14, color: C.gray800,
  background: C.white, boxSizing: "border-box",
};

interface CongesProps {
  conges: CongesDemande[];
  onSend: (form: { date_debut: string; date_fin: string; motif: string; justification: string }) => Promise<void>;
}

export function TabConges({ conges, onSend }: CongesProps) {
  const [showForm,      setShowForm]      = useState(false);
  const [dateDebut,     setDateDebut]     = useState("");
  const [dateFin,       setDateFin]       = useState("");
  const [motif,         setMotif]         = useState(MOTIFS_CONGE[0]);
  const [justification, setJustification] = useState("");
  const [sending,       setSending]       = useState(false);

  const canSubmit = !!dateDebut && !!dateFin && dateFin >= dateDebut && justification.trim().length >= 10;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSending(true);
    await onSend({ date_debut: dateDebut, date_fin: dateFin, motif, justification: justification.trim() });
    setSending(false);
    setShowForm(false);
    setDateDebut(""); setDateFin(""); setMotif(MOTIFS_CONGE[0]); setJustification("");
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: C.gray600, margin: 0 }}>
          Demandes de congés — tout refus inclut un motif.
        </p>
        {!showForm && (
          <button onClick={() => setShowForm(true)}
            style={{ padding: "9px 16px", borderRadius: 10, border: "none",
              background: C.navy, color: C.white, fontWeight: 800, fontSize: 13, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
            <CalendarDays size={15} /> Nouvelle demande
          </button>
        )}
      </div>

      {showForm && (
        <div style={{ background: C.skyL, borderRadius: 16, padding: 18, marginBottom: 20,
          border: `1.5px solid ${C.sky}` }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: C.navy, marginBottom: 16,
            display: "flex", alignItems: "center", gap: 8 }}>
            <CalendarDays size={18} color={C.navy} /> Nouvelle demande de congé
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600,
                textTransform: "uppercase", marginBottom: 4 }}>Date de début *</label>
              <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600,
                textTransform: "uppercase", marginBottom: 4 }}>Date de fin *</label>
              <input type="date" value={dateFin} min={dateDebut || undefined}
                onChange={e => setDateFin(e.target.value)} style={inp} />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600,
              textTransform: "uppercase", marginBottom: 4 }}>Motif *</label>
            <select value={motif} onChange={e => setMotif(e.target.value)} style={inp}>
              {MOTIFS_CONGE.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600,
              textTransform: "uppercase", marginBottom: 4 }}>Justification * (min. 10 caractères)</label>
            <textarea value={justification} onChange={e => setJustification(e.target.value)}
              rows={3} placeholder="Décrivez les raisons de votre demande…"
              style={{ ...inp, resize: "vertical" }} />
            {justification.trim().length > 0 && justification.trim().length < 10 && (
              <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>
                Minimum 10 caractères ({justification.trim().length}/10)
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={handleSubmit} disabled={!canSubmit || sending}
              style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none",
                background: canSubmit ? C.green : C.gray200,
                color: canSubmit ? C.white : C.gray400,
                fontWeight: 800, fontSize: 14, cursor: canSubmit ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Send size={16} /> {sending ? "Envoi…" : "Envoyer la demande"}
            </button>
            <button onClick={() => setShowForm(false)}
              style={{ padding: "12px 18px", borderRadius: 10, border: `1px solid ${C.gray200}`,
                background: C.white, color: C.gray600, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {conges.length === 0 && !showForm ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: C.gray600 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <Inbox size={48} color={C.gray400} />
          </div>
          <p style={{ fontWeight: 700, margin: 0 }}>Aucune demande de congé</p>
          <p style={{ fontSize: 13, marginTop: 4, color: C.gray400 }}>
            Cliquez sur "Nouvelle demande" pour en créer une.
          </p>
        </div>
      ) : conges.length > 0 && (
        <div>
          <div style={{ fontWeight: 800, fontSize: 13, color: C.navy, textTransform: "uppercase",
            letterSpacing: 0.5, marginBottom: 12 }}>Mes demandes</div>
          {conges.map(c => {
            const cfg = STATUT_CFG[c.statut];
            return (
              <div key={c.id} style={{ background: C.white, borderRadius: 14, padding: 16,
                marginBottom: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                borderLeft: `4px solid ${cfg.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "flex-start", marginBottom: 8, gap: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, fontSize: 14, color: C.navy }}>
                        {fmtDate(c.date_debut)}
                      </span>
                      <ArrowRight size={14} color={C.gray400} />
                      <span style={{ fontWeight: 800, fontSize: 14, color: C.navy }}>
                        {fmtDate(c.date_fin)}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: C.gray600 }}>{c.motif}</div>
                  </div>
                  <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                    background: cfg.bg, color: cfg.color, flexShrink: 0 }}>
                    {cfg.label}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#1E293B", lineHeight: 1.5,
                  borderLeft: `2px solid ${C.gray200}`, paddingLeft: 10,
                  marginBottom: (c.motif_refus || c.note_gestionnaire) ? 8 : 0 }}>
                  {c.justification}
                </div>
                {c.motif_refus && (
                  <div style={{ background: C.redL, borderRadius: 8, padding: "8px 12px", marginTop: 8,
                    fontSize: 13, color: C.red, fontWeight: 600,
                    display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>Motif du refus : {c.motif_refus}</span>
                  </div>
                )}
                {c.statut === "transmis_admin" && c.note_gestionnaire && (
                  <div style={{ background: "#EFF6FF", borderRadius: 8, padding: "8px 12px", marginTop: 8,
                    fontSize: 12, color: "#2563EB", fontStyle: "italic" }}>
                    Note du gestionnaire : {c.note_gestionnaire}
                  </div>
                )}
                <div style={{ fontSize: 11, color: C.gray400, marginTop: 8, textAlign: "right",
                  display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                  <Clock size={11} />
                  {new Date(c.created_at).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
