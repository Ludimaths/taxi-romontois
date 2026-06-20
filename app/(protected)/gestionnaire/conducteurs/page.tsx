"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { C, statusColor, statusLabel } from "@/lib/constants";
import { Badge, Avatar, Card, InfoBox, Btn, SectionTitle, TabBar, Modal } from "@/components/ui";
import type { Conducteur, Circuit, Vehicule } from "@/lib/types";

const STATUTS = ["disponible","en_service","en_attente","absent","termine"] as const;

function DriverForm({ init, circuits, vehicules, onSave, onCancel, saving }: {
  init: Partial<Conducteur>; circuits: Circuit[]; vehicules: Vehicule[];
  onSave: (d: Partial<Conducteur>) => void; onCancel: () => void; saving: boolean;
}) {
  const [f, setF] = useState<Partial<Conducteur>>({ status: "disponible", ...init });
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));
  const field = (label: string, key: string, type = "text", ph = "") => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600, textTransform: "uppercase", marginBottom: 4 }}>{label}</label>
      <input type={type} value={(f as any)[key] ?? ""} onChange={e => set(key, e.target.value)} placeholder={ph}
        style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.gray200}`, fontSize: 13, boxSizing: "border-box" }} />
    </div>
  );
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <div style={{ paddingRight: 12 }}>{field("Nom", "nom")}</div>
        <div>{field("Prénom", "prenom")}</div>
        <div style={{ paddingRight: 12 }}>{field("Téléphone", "tel", "tel", "079 000 00 00")}</div>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600, textTransform: "uppercase", marginBottom: 4 }}>Statut</label>
          <select value={f.status ?? "disponible"} onChange={e => set("status", e.target.value)}
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.gray200}`, fontSize: 13, marginBottom: 12 }}>
            {STATUTS.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </div>
        <div style={{ paddingRight: 12 }}>{field("Permis (ex: B,D)", "permis")}</div>
        <div>{field("Validité permis", "permis_exp", "date")}</div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600, textTransform: "uppercase", marginBottom: 4 }}>Circuit assigné</label>
        <select value={f.circuit_id ?? ""} onChange={e => set("circuit_id", e.target.value || null)}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.gray200}`, fontSize: 13, marginBottom: 12 }}>
          <option value="">— Aucun circuit —</option>
          {circuits.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.num}-{c.nom} ({c.cercle?.nom})</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600, textTransform: "uppercase", marginBottom: 4 }}>Véhicule assigné</label>
        <select value={f.vehicule_id ?? ""} onChange={e => set("vehicule_id", e.target.value || null)}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.gray200}`, fontSize: 13, marginBottom: 12 }}>
          <option value="">— Aucun véhicule —</option>
          {vehicules.map(v => <option key={v.id} value={v.id}>{v.plaque} · {v.marque} {v.modele}</option>)}
        </select>
      </div>

      {f.status === "absent" && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600, textTransform: "uppercase", marginBottom: 4 }}>Motif absence</label>
          <input value={f.absence_motif ?? ""} onChange={e => set("absence_motif", e.target.value)}
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.gray200}`, fontSize: 13, boxSizing: "border-box" }} />
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600, textTransform: "uppercase", marginBottom: 4 }}>Initiales photo</label>
        <input value={f.photo_initials ?? ""} onChange={e => set("photo_initials", e.target.value.toUpperCase().slice(0,4))} maxLength={4}
          style={{ width: 80, padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.gray200}`, fontSize: 13 }} />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <Btn full onClick={() => onSave(f)} disabled={saving || !f.nom || !f.prenom} color={C.green}>
          {saving ? "Enregistrement…" : "✅ Enregistrer"}
        </Btn>
        <Btn outline onClick={onCancel} color={C.gray600}>Annuler</Btn>
      </div>
    </div>
  );
}

export default function ConducteursPage() {
  const supabase = createClient();
  const [drivers, setDrivers] = useState<Conducteur[]>([]);
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [tab, setTab] = useState("infos");
  const [search, setSearch] = useState("");
  const [editModal, setEditModal] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    const [drv, cir, veh] = await Promise.all([
      supabase.from("conducteurs").select("*, circuit:circuits(*,cercle:cercles_scolaires(*)), vehicule:vehicules(*), cercle:cercles_scolaires(*)").order("nom"),
      supabase.from("circuits").select("*, cercle:cercles_scolaires(*)").order("num"),
      supabase.from("vehicules").select("*").order("plaque"),
    ]);
    setDrivers(drv.data ?? []);
    setCircuits(cir.data ?? []);
    setVehicules(veh.data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const filtered = drivers.filter(d =>
    `${d.prenom} ${d.nom} ${d.tel ?? ""}`.toLowerCase().includes(search.toLowerCase())
  );

  const d = sel ? drivers.find(x => x.id === sel) : null;

  const handleSave = async (form: Partial<Conducteur>) => {
    setSaving(true);
    if (sel) {
      await supabase.from("conducteurs").update({
        nom: form.nom, prenom: form.prenom, tel: form.tel || null,
        permis: form.permis || null, permis_exp: form.permis_exp || null,
        circuit_id: form.circuit_id || null, vehicule_id: form.vehicule_id || null,
        status: form.status, absence_motif: form.status === "absent" ? (form.absence_motif || null) : null,
        photo_initials: form.photo_initials || ((form.nom?.[0] ?? "").toUpperCase() + (form.prenom?.[0] ?? "").toUpperCase()),
      }).eq("id", sel);
    }
    await fetchAll();
    setSaving(false);
    setEditModal(false);
  };

  const handleAdd = async (form: Partial<Conducteur>) => {
    setSaving(true);
    await supabase.from("conducteurs").insert({
      nom: form.nom!, prenom: form.prenom!, tel: form.tel || null,
      affectation: "Scolaire",
      permis: form.permis || null, permis_exp: form.permis_exp || null,
      circuit_id: form.circuit_id || null, vehicule_id: form.vehicule_id || null,
      status: form.status ?? "disponible",
      absence_motif: form.status === "absent" ? (form.absence_motif || null) : null,
      photo_initials: form.photo_initials || (form.nom?.slice(0,1).toUpperCase() ?? "") + (form.prenom?.slice(0,1).toUpperCase() ?? ""),
      tachygraphe: false,
    });
    await fetchAll();
    setSaving(false);
    setAddModal(false);
  };

  const handleDelete = async () => {
    if (!sel || !confirm("Supprimer ce conducteur ?")) return;
    await supabase.from("conducteurs").delete().eq("id", sel);
    setSel(null);
    fetchAll();
  };

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: C.gray400 }}>Chargement…</div>;

  // ── Fiche détail ─────────────────────────────────────────────────────────────
  if (sel && d) {
    const circ = circuits.find(c => c.id === d.circuit_id);
    const permisExpireSoon = d.permis_exp && new Date(d.permis_exp) < new Date(Date.now() + 90 * 864e5);
    return (
      <div>
        {editModal && (
          <Modal title={`Modifier — ${d.prenom} ${d.nom}`} onClose={() => setEditModal(false)}>
            <DriverForm init={d} circuits={circuits} vehicules={vehicules}
              onSave={handleSave} onCancel={() => setEditModal(false)} saving={saving} />
          </Modal>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <button onClick={() => setSel(null)} style={{ background: "none", border: "none", color: C.navyL, cursor: "pointer", fontWeight: 700, fontSize: 14, padding: 0 }}>
            ← Tous les conducteurs
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn small onClick={() => setEditModal(true)} color={C.navyL}>✏️ Modifier</Btn>
            <Btn small onClick={handleDelete} color={C.red} outline>🗑 Supprimer</Btn>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 22 }}>
          <Card style={{ padding: 26 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center", padding: 18, background: C.skyL, borderRadius: 12, marginBottom: 20 }}>
              <Avatar initials={d.photo_initials} size={52} />
              <div>
                <div style={{ fontSize: 17, fontWeight: 900, color: C.navy }}>{d.prenom} {d.nom}</div>
                <div style={{ fontSize: 12, color: C.gray600, marginTop: 2 }}>{d.tel || "—"} · {d.affectation}</div>
                <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Badge color={statusColor(d.status) as any}>{statusLabel(d.status)}</Badge>
                  {permisExpireSoon && <Badge color="red">⚠ Permis bientôt</Badge>}
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 16 }}>
              <InfoBox label="Véhicule" value={d.vehicule?.plaque} />
              <InfoBox label="Circuit" value={circ ? `${circ.emoji} ${circ.nom}` : "—"} />
              <InfoBox label="Permis" value={d.permis || "—"} highlight={permisExpireSoon ? C.red : undefined} />
              <InfoBox label="Validité permis" value={d.permis_exp ? new Date(d.permis_exp).toLocaleDateString("fr-FR") : "—"} highlight={permisExpireSoon ? C.red : undefined} />
              <InfoBox label="École" value={circ?.cercle?.nom} />
              <InfoBox label="Tachygraphe" value={d.tachygraphe ? "Requis" : "Non requis"} />
              {d.absence_motif && <InfoBox label="Motif absence" value={d.absence_motif} full highlight={C.red} />}
            </div>
          </Card>

          <Card style={{ padding: 26 }}>
            <TabBar tabs={["infos","historique"]} active={tab} onChange={setTab} />
            {tab === "infos" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                <InfoBox label="Nom" value={d.nom} />
                <InfoBox label="Prénom" value={d.prenom} />
                <InfoBox label="Téléphone" value={d.tel} />
                <InfoBox label="Affectation" value={d.affectation} />
                <InfoBox label="Cercle scolaire" value={d.cercle?.nom} full />
                <InfoBox label="Notes" value={d.notes} full />
              </div>
            )}
            {tab === "historique" && (
              <div style={{ background: C.gray50, borderRadius: 10, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr 1fr 1fr", padding: "8px 14px",
                  background: C.gray200, fontSize: 10, fontWeight: 700, color: C.gray600, textTransform: "uppercase" }}>
                  <span>Date</span><span>Circuit</span><span>Début</span><span>Statut</span>
                </div>
                <div style={{ padding: 14, textAlign: "center", color: C.gray400, fontSize: 13 }}>
                  Historique disponible via les logs de service
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    );
  }

  // ── Liste ─────────────────────────────────────────────────────────────────────
  return (
    <div>
      {addModal && (
        <Modal title="Ajouter un conducteur" onClose={() => setAddModal(false)}>
          <DriverForm init={{}} circuits={circuits} vehicules={vehicules}
            onSave={handleAdd} onCancel={() => setAddModal(false)} saving={saving} />
        </Modal>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: C.gray800, margin: 0 }}>Conducteurs ({drivers.length})</h2>
        <Btn onClick={() => setAddModal(true)} color={C.green}>+ Ajouter conducteur</Btn>
      </div>
      <div style={{ marginBottom: 14 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher conducteur…"
          style={{ padding: "9px 14px", borderRadius: 8, border: `1px solid ${C.gray200}`, fontSize: 13, outline: "none", width: 280 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        {filtered.map(d => {
          const circ = circuits.find(c => c.id === d.circuit_id);
          const permisExpireSoon = d.permis_exp && new Date(d.permis_exp) < new Date(Date.now() + 90 * 864e5);
          return (
            <Card key={d.id} onClick={() => setSel(d.id)} style={{ padding: 18 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
                <Avatar initials={d.photo_initials} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: C.gray800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.prenom} {d.nom}
                  </div>
                  <div style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>{d.tel || "—"}</div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Badge color={statusColor(d.status) as any}>{statusLabel(d.status)}</Badge>
                {permisExpireSoon && <Badge color="red">⚠ Permis</Badge>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, fontSize: 12 }}>
                {[
                  ["Véhicule", d.vehicule?.plaque || "—"],
                  ["Circuit", circ ? `${circ.emoji} ${circ.nom}` : "—"],
                  ["Cercle", d.cercle?.nom || "—"],
                  ["Permis", d.permis || "—"],
                ].map(([l, v]) => (
                  <div key={l} style={{ background: C.gray50, borderRadius: 6, padding: "6px 9px" }}>
                    <div style={{ fontSize: 9, color: C.gray400, textTransform: "uppercase" }}>{l}</div>
                    <div style={{ fontWeight: 600, color: C.gray800, marginTop: 1, fontSize: 12 }}>{v}</div>
                  </div>
                ))}
              </div>
              {d.absence_motif && (
                <div style={{ marginTop: 8, fontSize: 11, color: C.red, fontWeight: 600 }}>Motif : {d.absence_motif}</div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
