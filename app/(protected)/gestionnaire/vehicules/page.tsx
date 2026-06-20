"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";
import { Badge, Card, InfoBox, Btn, Modal } from "@/components/ui";
import type { Vehicule, Circuit, Conducteur } from "@/lib/types";

const ETATS = ["bon","attention","atelier"] as const;
const stateColor = (s: string) => ({ bon: "green", atelier: "red", attention: "amber" }[s] ?? "gray") as any;
const stateLabel = (s: string) => ({ bon: "Bon état", atelier: "En atelier", attention: "Attention" }[s] ?? s);

function VehiculeForm({ init, circuits, conducteurs, onSave, onCancel, saving, isNew }: {
  init: Partial<Vehicule>; circuits: Circuit[]; conducteurs: Conducteur[];
  onSave: (d: Partial<Vehicule> & { conducteur_new_id?: number }) => void;
  onCancel: () => void; saving: boolean; isNew?: boolean;
}) {
  const [f, setF] = useState<any>({ etat: "bon", km: 0, places: 0, places_handi: 0, ...init });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const field = (label: string, key: string, type = "text", ph = "") => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600, textTransform: "uppercase", marginBottom: 4 }}>{label}</label>
      <input type={type} value={f[key] ?? ""} onChange={e => set(key, type === "number" ? Number(e.target.value) : e.target.value)} placeholder={ph}
        style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.gray200}`, fontSize: 13, boxSizing: "border-box" }} />
    </div>
  );
  return (
    <div>
      {isNew && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
          <div style={{ paddingRight: 12 }}>{field("ID plaque (ex: FR-12345)", "id")}</div>
          <div>{field("Plaque affichée (ex: FR 12345)", "plaque")}</div>
          <div style={{ paddingRight: 12 }}>{field("Marque", "marque")}</div>
          <div>{field("Modèle", "modele")}</div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <div style={{ paddingRight: 12 }}>{field("Kilométrage", "km", "number")}</div>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600, textTransform: "uppercase", marginBottom: 4 }}>État</label>
          <select value={f.etat ?? "bon"} onChange={e => set("etat", e.target.value)}
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.gray200}`, fontSize: 13, marginBottom: 12 }}>
            {ETATS.map(e => <option key={e} value={e}>{stateLabel(e)}</option>)}
          </select>
        </div>
        <div style={{ paddingRight: 12 }}>{field("CT (ex: 04.2027)", "ct_date")}</div>
        <div>{field("Assurance (ex: 04.2027)", "assurance_date")}</div>
        <div style={{ paddingRight: 12 }}>{field("Places", "places", "number")}</div>
        <div>{field("Places handi", "places_handi", "number")}</div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600, textTransform: "uppercase", marginBottom: 4 }}>Circuit assigné</label>
        <select value={f.circuit_id ?? ""} onChange={e => set("circuit_id", e.target.value || null)}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.gray200}`, fontSize: 13, marginBottom: 12 }}>
          <option value="">— Aucun —</option>
          {circuits.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.num}-{c.nom}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600, textTransform: "uppercase", marginBottom: 4 }}>Conducteur assigné</label>
        <select value={f.conducteur_new_id ?? ""} onChange={e => set("conducteur_new_id", e.target.value ? Number(e.target.value) : null)}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.gray200}`, fontSize: 13, marginBottom: 12 }}>
          <option value="">— Aucun —</option>
          {conducteurs.map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <Btn full onClick={() => onSave(f)} disabled={saving || (isNew && (!f.id || !f.plaque || !f.marque || !f.modele))} color={C.green}>
          {saving ? "Enregistrement…" : "✅ Enregistrer"}
        </Btn>
        <Btn outline onClick={onCancel} color={C.gray600}>Annuler</Btn>
      </div>
    </div>
  );
}

export default function VehiculesPage() {
  const supabase = createClient();
  const [vehicles, setVehicles] = useState<Vehicule[]>([]);
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [conducteurs, setConducteurs] = useState<Conducteur[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [editModal, setEditModal] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    const [veh, cir, drv] = await Promise.all([
      supabase.from("vehicules").select("*, circuit:circuits(*,cercle:cercles_scolaires(*)), conducteur:conducteurs(*)").order("plaque"),
      supabase.from("circuits").select("*, cercle:cercles_scolaires(*)").order("num"),
      supabase.from("conducteurs").select("*").order("nom"),
    ]);
    setVehicles(veh.data ?? []);
    setCircuits(cir.data ?? []);
    setConducteurs(drv.data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const v = sel ? vehicles.find(x => x.id === sel) : null;

  const handleSave = async (form: any) => {
    setSaving(true);
    await supabase.from("vehicules").update({
      etat: form.etat, km: form.km,
      ct_date: form.ct_date || null,
      assurance_date: form.assurance_date || null,
      circuit_id: form.circuit_id || null,
      places: form.places, places_handi: form.places_handi,
    }).eq("id", sel!);
    if (form.conducteur_new_id) {
      await supabase.from("conducteurs").update({ vehicule_id: sel }).eq("id", form.conducteur_new_id);
      if (v?.conducteur && v.conducteur.id !== form.conducteur_new_id) {
        await supabase.from("conducteurs").update({ vehicule_id: null }).eq("id", v.conducteur.id);
      }
    }
    await fetchAll();
    setSaving(false);
    setEditModal(false);
  };

  const handleAdd = async (form: any) => {
    setSaving(true);
    await supabase.from("vehicules").insert({
      id: form.id, plaque: form.plaque, marque: form.marque, modele: form.modele,
      etat: form.etat ?? "bon", km: form.km ?? 0,
      ct_date: form.ct_date || null, assurance_date: form.assurance_date || null,
      circuit_id: form.circuit_id || null, places: form.places ?? 0, places_handi: form.places_handi ?? 0,
    });
    if (form.conducteur_new_id) {
      await supabase.from("conducteurs").update({ vehicule_id: form.id }).eq("id", form.conducteur_new_id);
    }
    await fetchAll();
    setSaving(false);
    setAddModal(false);
  };

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: C.gray400 }}>Chargement…</div>;

  return (
    <div>
      {editModal && v && (
        <Modal title={`Modifier — ${v.plaque}`} onClose={() => setEditModal(false)}>
          <VehiculeForm init={{ ...v, conducteur_new_id: v.conducteur?.id } as any}
            circuits={circuits} conducteurs={conducteurs}
            onSave={handleSave} onCancel={() => setEditModal(false)} saving={saving} />
        </Modal>
      )}
      {addModal && (
        <Modal title="Ajouter un véhicule" onClose={() => setAddModal(false)}>
          <VehiculeForm init={{}} circuits={circuits} conducteurs={conducteurs}
            onSave={handleAdd} onCancel={() => setAddModal(false)} saving={saving} isNew />
        </Modal>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: C.gray800, margin: 0 }}>Flotte véhicules ({vehicles.length})</h2>
        <Btn onClick={() => setAddModal(true)} color={C.green}>+ Ajouter véhicule</Btn>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        {vehicles.map(veh => (
          <Card key={veh.id} style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900, color: C.navy }}>{veh.plaque}</div>
                <div style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>{veh.marque} {veh.modele}</div>
              </div>
              <Badge color={stateColor(veh.etat)}>{stateLabel(veh.etat)}</Badge>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, fontSize: 12, marginBottom: 12 }}>
              <div style={{ background: C.gray50, borderRadius: 6, padding: "6px 9px" }}>
                <div style={{ fontSize: 9, color: C.gray400, textTransform: "uppercase" }}>Places</div>
                <div style={{ fontWeight: 600, marginTop: 1 }}>{veh.places}{veh.places_handi > 0 ? ` + ${veh.places_handi}ha` : ""}</div>
              </div>
              <div style={{ background: veh.km > 130000 ? C.redL : C.gray50, borderRadius: 6, padding: "6px 9px" }}>
                <div style={{ fontSize: 9, color: C.gray400, textTransform: "uppercase" }}>Kilométrage</div>
                <div style={{ fontWeight: 600, color: veh.km > 130000 ? C.red : C.gray800, marginTop: 1 }}>
                  {veh.km.toLocaleString("fr-FR")} km
                </div>
              </div>
              <div style={{ background: C.gray50, borderRadius: 6, padding: "6px 9px", gridColumn: "1/-1" }}>
                <div style={{ fontSize: 9, color: C.gray400, textTransform: "uppercase" }}>Conducteur</div>
                <div style={{ fontWeight: 600, color: veh.conducteur ? C.gray800 : C.red, marginTop: 1 }}>
                  {veh.conducteur ? `${veh.conducteur.prenom} ${veh.conducteur.nom}` : "⚠ Non affecté"}
                </div>
              </div>
              {veh.circuit && (
                <div style={{ background: C.skyL, borderRadius: 6, padding: "6px 9px", gridColumn: "1/-1" }}>
                  <div style={{ fontSize: 9, color: C.gray400, textTransform: "uppercase" }}>Circuit</div>
                  <div style={{ fontWeight: 600, color: C.navy, marginTop: 1 }}>{veh.circuit.emoji} {veh.circuit.nom}</div>
                </div>
              )}
            </div>
            <div style={{ borderTop: `1px solid ${C.gray100}`, paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: C.gray400 }}>CT: {veh.ct_date || "—"}</span>
              <Btn small onClick={() => { setSel(veh.id); setEditModal(true); }} color={C.navyL}>✏️ Modifier</Btn>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
