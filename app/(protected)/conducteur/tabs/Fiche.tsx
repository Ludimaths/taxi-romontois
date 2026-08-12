"use client";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { C, fmtDate, fmtEnfant, fmtHHMM } from "@/lib/constants";
import type { Conducteur, Enfant, ServiceLog } from "@/lib/types";
import { StatusBadge, DL, baseInp, calcDuration } from "./shared";

type CircType = { nom?: string; emoji?: string; enfants_count?: number; cercle?: { nom?: string } };
type VehType  = { plaque?: string; marque?: string; modele?: string };

export interface FicheProps {
  driver: Conducteur;
  circ?: CircType;
  veh?: VehType;
  enfantsCircuit: Enfant[];
  todayLog: ServiceLog | null;
  onSave: (patch: Partial<Conducteur>) => Promise<void>;
}

type Form = {
  tel: string;
  permis: string;
  permis_exp: string;
  tachygraphe: boolean;
  notes: string;
};

export function TabFiche({ driver, circ, veh, enfantsCircuit, todayLog, onSave }: FicheProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [form, setForm]       = useState<Form>(() => blank(driver));

  function blank(d: Conducteur): Form {
    return {
      tel: d.tel || "",
      permis: d.permis || "",
      permis_exp: d.permis_exp || "",
      tachygraphe: !!d.tachygraphe,
      notes: d.notes || "",
    };
  }

  function startEdit() { setForm(blank(driver)); setEditing(true); }
  function cancel()    { setEditing(false); }

  async function save() {
    setSaving(true);
    await onSave({
      tel: form.tel.trim() || undefined,
      permis: form.permis.trim() || undefined,
      permis_exp: form.permis_exp || undefined,
      tachygraphe: form.tachygraphe,
      notes: form.notes.trim() || undefined,
    });
    setSaving(false);
    setEditing(false);
  }

  const set = (k: keyof Form, v: string | boolean) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div>
      {/* Avatar + statut */}
      <div style={{ background: "#fff", borderRadius: 18, padding: "20px 20px 16px",
        marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%",
            background: `linear-gradient(135deg,${C.greenD},${C.green})`,
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 900, fontSize: 22, flexShrink: 0 }}>
            {driver.photo_initials || `${driver.prenom[0]}${driver.nom[0]}`}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 20, color: C.navy }}>{driver.prenom} {driver.nom}</div>
            <div style={{ marginTop: 4 }}><StatusBadge status={driver.status} /></div>
          </div>
        </div>
      </div>

      {/* Mon service aujourd'hui (repris de l'ancien tableau de bord) */}
      {todayLog && (
        <div style={{ background: "#fff", borderRadius: 16, padding: 16, marginBottom: 16,
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)", borderLeft: `4px solid ${C.green}` }}>
          <div style={{ fontWeight: 800, color: C.navy, marginBottom: 8, fontSize: 14 }}>Mon service aujourd'hui</div>
          <div style={{ display: "flex", gap: 16, fontSize: 14, flexWrap: "wrap" }}>
            {todayLog.heure_debut && <span>Début : <strong>{fmtHHMM(todayLog.heure_debut)}</strong></span>}
            {todayLog.heure_fin && <span>Fin : <strong>{fmtHHMM(todayLog.heure_fin)}</strong></span>}
            {todayLog.heure_debut && todayLog.heure_fin && (
              <span style={{ color: C.green }}>Durée : <strong>{calcDuration(todayLog.heure_debut, todayLog.heure_fin)}</strong></span>
            )}
          </div>
        </div>
      )}

      {/* Mes informations — modifiable */}
      <div style={{ background: "#fff", borderRadius: 16, padding: 18, marginBottom: 16,
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontWeight: 800, color: C.navy, fontSize: 15 }}>Mes informations</span>
          {!editing && (
            <button onClick={startEdit}
              style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: C.green,
                background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>
              <Pencil size={13} /> Modifier
            </button>
          )}
        </div>

        {!editing ? (
          <>
            <DL label="Téléphone"         value={driver.tel || "Non renseigné"} />
            <DL label="N° permis"         value={driver.permis || "Non renseigné"} />
            <DL label="Expiration permis" value={driver.permis_exp ? fmtDate(driver.permis_exp) : "Non renseignée"} />
            <DL label="Tachygraphe"       value={driver.tachygraphe ? "Oui" : "Non"} />
            <DL label="Affectation"       value={driver.affectation || "—"} />
            <DL label="Dans l'entreprise depuis" value={fmtDate(driver.created_at)} />
            {driver.notes && <DL label="Notes" value={driver.notes} />}
            {driver.absence_motif && driver.status === "absent" && (
              <DL label="Motif absence" value={driver.absence_motif} />
            )}
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Téléphone">
              <input value={form.tel} onChange={e => set("tel", e.target.value)}
                placeholder="079 000 00 00" style={baseInp} />
            </Field>
            <Field label="N° de permis">
              <input value={form.permis} onChange={e => set("permis", e.target.value)}
                placeholder="Ex : FR 123456" style={baseInp} />
            </Field>
            <Field label="Expiration du permis">
              <input type="date" value={form.permis_exp} onChange={e => set("permis_exp", e.target.value)}
                style={baseInp} />
            </Field>
            <Field label="Tachygraphe">
              <div style={{ display: "flex", gap: 8 }}>
                {[["Oui", true], ["Non", false]].map(([lbl, val]) => (
                  <button key={String(val)} onClick={() => set("tachygraphe", val as boolean)}
                    style={{ flex: 1, padding: "11px", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 14,
                      border: `1.5px solid ${form.tachygraphe === val ? C.green : C.gray200}`,
                      background: form.tachygraphe === val ? C.greenL : "#fff",
                      color: form.tachygraphe === val ? C.greenD : C.gray }}>
                    {lbl}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Notes (optionnel)">
              <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={3}
                placeholder="Informations complémentaires…"
                style={{ ...baseInp, resize: "vertical", fontFamily: "inherit" }} />
            </Field>
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button onClick={save} disabled={saving}
                style={{ flex: 1, padding: "13px", borderRadius: 12, background: C.green, color: "#fff",
                  border: "none", fontWeight: 800, fontSize: 15, cursor: saving ? "default" : "pointer",
                  opacity: saving ? 0.7 : 1 }}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button onClick={cancel} disabled={saving}
                style={{ padding: "13px 18px", borderRadius: 12, background: C.gray100, color: C.gray,
                  border: "none", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Circuit + véhicule */}
      {circ && (
        <div style={{ background: C.greenL, borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 800, color: C.greenD, marginBottom: 10, fontSize: 14 }}>Mon circuit</div>
          <DL label="Circuit" value={`${circ.emoji || ""} ${circ.nom || "—"}`} />
          <DL label="École"   value={circ.cercle?.nom || "—"} />
          <DL label="Enfants" value={circ.enfants_count != null ? `${circ.enfants_count} enfants` : "—"} />
          {veh && <DL label="Véhicule" value={`${veh.plaque} — ${veh.marque} ${veh.modele}`} />}
        </div>
      )}

      {/* Liste enfants */}
      {enfantsCircuit.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
          <div style={{ fontWeight: 800, color: C.navy, marginBottom: 12, fontSize: 14 }}>
            Enfants du circuit ({enfantsCircuit.length})
          </div>
          {enfantsCircuit.map(e => (
            <div key={e.id} style={{ padding: "8px 0", borderBottom: "1px solid #F1F5F9",
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1E293B" }}>{fmtEnfant(e.prenom, e.nom)}</div>
                {e.parent_nom && <div style={{ fontSize: 12, color: C.gray }}>Parent : {e.parent_nom}</div>}
              </div>
              {e.parent_tel && <span style={{ fontSize: 12, color: C.blue, fontWeight: 600 }}>{e.parent_tel}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.gray, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}
