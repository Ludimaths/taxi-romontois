"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";
import { Badge, Card, InfoBox, Btn, Modal } from "@/components/ui";
import type { Circuit, Conducteur, CercleScolaire } from "@/lib/types";

function CircuitForm({ init, cercles, conducteurs, onSave, onCancel, saving, isNew }: {
  init: Partial<Circuit>; cercles: CercleScolaire[]; conducteurs: Conducteur[];
  onSave: (d: any) => void; onCancel: () => void; saving: boolean; isNew?: boolean;
}) {
  const [f, setF] = useState<any>({ enfants_count: 0, km_aller: 0, ...init });
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
          <div style={{ paddingRight: 12 }}>{field("ID (ex: C055)", "id")}</div>
          <div>{field("Nom", "nom")}</div>
          <div style={{ paddingRight: 12 }}>{field("Emoji", "emoji", "text", "🚌")}</div>
          <div>{field("N° tournée", "num", "text", "01")}</div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <div style={{ paddingRight: 12 }}>{field("Nombre d'enfants", "enfants_count", "number")}</div>
        <div>{field("Km aller", "km_aller", "number")}</div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600, textTransform: "uppercase", marginBottom: 4 }}>École / Cercle scolaire</label>
        <select value={f.cercle_id ?? ""} onChange={e => set("cercle_id", e.target.value ? Number(e.target.value) : null)}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.gray200}`, fontSize: 13, marginBottom: 12 }}>
          <option value="">— Sélectionner —</option>
          {cercles.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <Btn full onClick={() => onSave(f)} disabled={saving || (isNew && (!f.id || !f.nom))} color={C.green}>
          {saving ? "Enregistrement…" : "✅ Enregistrer"}
        </Btn>
        <Btn outline onClick={onCancel} color={C.gray600}>Annuler</Btn>
      </div>
    </div>
  );
}

export default function CircuitsPage() {
  const supabase = createClient();
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [drivers, setDrivers] = useState<Conducteur[]>([]);
  const [cercles, setCercles] = useState<CercleScolaire[]>([]);
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    const [cir, drv, cer] = await Promise.all([
      supabase.from("circuits").select("*, cercle:cercles_scolaires(*)").order("num"),
      supabase.from("conducteurs").select("*, vehicule:vehicules(*)").order("nom"),
      supabase.from("cercles_scolaires").select("*").order("nom"),
    ]);
    setCircuits(cir.data ?? []);
    setDrivers(drv.data ?? []);
    setCercles(cer.data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const filtered = circuits.filter(c =>
    `${c.nom} ${c.num} ${c.cercle?.nom ?? ""}`.toLowerCase().includes(search.toLowerCase())
  );

  const editCircuit = editId ? circuits.find(c => c.id === editId) : null;

  const handleSave = async (form: any) => {
    setSaving(true);
    await supabase.from("circuits").update({
      enfants_count: form.enfants_count,
      km_aller: form.km_aller,
      cercle_id: form.cercle_id || null,
    }).eq("id", editId!);
    await fetchAll();
    setSaving(false);
    setEditId(null);
  };

  const handleAdd = async (form: any) => {
    setSaving(true);
    await supabase.from("circuits").insert({
      id: form.id, nom: form.nom, emoji: form.emoji || "🚌",
      num: form.num || "01",
      enfants_count: form.enfants_count ?? 0,
      km_aller: form.km_aller ?? 0,
      cercle_id: form.cercle_id || null,
    });
    await fetchAll();
    setSaving(false);
    setAddModal(false);
  };

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: C.gray400 }}>Chargement…</div>;

  return (
    <div>
      {editCircuit && (
        <Modal title={`Modifier — ${editCircuit.emoji} ${editCircuit.nom}`} onClose={() => setEditId(null)}>
          <CircuitForm init={editCircuit} cercles={cercles} conducteurs={drivers}
            onSave={handleSave} onCancel={() => setEditId(null)} saving={saving} />
        </Modal>
      )}
      {addModal && (
        <Modal title="Ajouter un circuit" onClose={() => setAddModal(false)}>
          <CircuitForm init={{}} cercles={cercles} conducteurs={drivers}
            onSave={handleAdd} onCancel={() => setAddModal(false)} saving={saving} isNew />
        </Modal>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: C.gray800, margin: 0 }}>Circuits ({circuits.length})</h2>
        <Btn onClick={() => setAddModal(true)} color={C.green}>+ Ajouter circuit</Btn>
      </div>
      <div style={{ marginBottom: 14 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher circuit…"
          style={{ padding: "9px 14px", borderRadius: 8, border: `1px solid ${C.gray200}`, fontSize: 13, outline: "none", width: 280 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
        {filtered.map(c => {
          const drv = drivers.find(d => d.circuit_id === c.id && d.status !== "absent");
          return (
            <Card key={c.id} style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ fontSize: 32 }}>{c.emoji}</div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: C.navy }}>{c.num}-{c.nom}</div>
                    <div style={{ fontSize: 12, color: C.gray400 }}>{c.cercle?.nom} · {c.enfants_count} enfants</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Badge color={drv ? "green" : "red"}>{drv ? "Couvert" : "Non couvert"}</Badge>
                  <Btn small onClick={() => setEditId(c.id)} color={C.navyL}>✏️</Btn>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                <InfoBox label="Conducteur" value={drv ? `${drv.prenom} ${drv.nom}` : "⚠ Non affecté"} highlight={!drv ? C.red : undefined} />
                <InfoBox label="Véhicule" value={drv?.vehicule?.plaque || "—"} />
                <InfoBox label="Kilomètres" value={c.km_aller ? `${c.km_aller} km` : "—"} />
                <InfoBox label="N° tournée" value={c.num} />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
