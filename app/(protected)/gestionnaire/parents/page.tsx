"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";
import { Badge, Btn, Modal, InfoBox } from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Parent {
  id: number;
  user_id?: string;
  prenom: string;
  nom: string;
  tel?: string;
  email?: string;
  civilite?: "mere" | "pere" | null;
  enfant_id?: number;
  enfant?: Enfant;
}
interface Enfant {
  id: number;
  prenom: string;
  nom: string;
  circuit_id?: string;
  circuit?: { nom: string; emoji: string; num: string };
  adresse_mere?: string;
  adresse_pere?: string;
  parent_tel?: string;
}
interface Message {
  id: number;
  type: string;
  message: string;
  read: boolean;
  driver_id?: number;
  created_at: string;
  severity: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDTLong = (d: string) => {
  const dt = new Date(d);
  const date = dt.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const h = String(dt.getHours()).padStart(2, "0");
  const m = String(dt.getMinutes()).padStart(2, "0");
  return `${date} à ${h}h${m}`;
};

const inp: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: `1px solid ${C.gray200}`, fontSize: 14, color: C.gray800,
  background: C.white, boxSizing: "border-box",
};
const lbl: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 700, color: C.gray600,
  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5,
};

// ── ParentForm ─────────────────────────────────────────────────────────────────
function ParentForm({ init, enfants, onSave, onCancel, saving }: {
  init: Partial<Parent>;
  enfants: Enfant[];
  onSave: (f: Partial<Parent>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [f, setF] = useState<Partial<Parent>>({ civilite: "mere", ...init });
  const set = (k: string, v: unknown) => setF(p => ({ ...p, [k]: v }));

  const field = (label: string, key: string, type = "text", ph = "") => (
    <div style={{ marginBottom: 12 }}>
      <label style={lbl}>{label}</label>
      <input type={type} value={(f as Record<string,string>)[key] ?? ""} placeholder={ph}
        onChange={e => set(key, e.target.value)}
        style={inp} />
    </div>
  );

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
        <div>{field("Prénom", "prenom")}</div>
        <div>{field("Nom", "nom")}</div>
        <div>{field("Téléphone", "tel", "tel", "079 000 00 00")}</div>
        <div>{field("Email", "email", "email", "parent@example.com")}</div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>Civilité</label>
        <select value={f.civilite ?? "mere"} onChange={e => set("civilite", e.target.value)}
          style={{ ...inp }}>
          <option value="mere">Mère</option>
          <option value="pere">Père</option>
        </select>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>Enfant concerné</label>
        <select value={f.enfant_id ?? ""} onChange={e => set("enfant_id", e.target.value ? Number(e.target.value) : undefined)}
          style={{ ...inp }}>
          <option value="">— À compléter —</option>
          {enfants.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}{e.circuit ? ` · ${e.circuit.emoji} ${e.circuit.nom}` : ""}</option>)}
        </select>
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

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ParentsPage() {
  const sb = createClient();
  const [parents,  setParents]  = useState<Parent[]>([]);
  const [enfants,  setEnfants]  = useState<Enfant[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [sel,      setSel]      = useState<Parent | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [editModal,setEditModal]= useState(false);
  const [saving,   setSaving]   = useState(false);

  // Notification to parent
  const [notifOpen, setNotifOpen]   = useState(false);
  const [notifText, setNotifText]   = useState("");
  const [notifSev,  setNotifSev]    = useState<"normale"|"haute">("normale");
  const [sending,   setSending]     = useState(false);
  const [notifSent, setNotifSent]   = useState(false);

  const fetchAll = useCallback(async () => {
    const [par, enf, msg] = await Promise.all([
      sb.from("profiles")
        .select("id,prenom,nom,tel,civilite,enfant_id,enfant:enfants(id,prenom,nom,circuit_id,circuit:circuits(nom,emoji,num),adresse_mere,adresse_pere,parent_tel)")
        .eq("role", "parent")
        .order("nom"),
      sb.from("enfants")
        .select("id,prenom,nom,circuit_id,circuit:circuits(nom,emoji,num),adresse_mere,adresse_pere,parent_tel")
        .order("nom"),
      sb.from("alertes")
        .select("*")
        .in("type", ["imprévu","parent_message","info_parent"])
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setParents((par.data ?? []) as Parent[]);
    setEnfants((enf.data ?? []) as Enfant[]);
    setMessages(msg.data ?? []);
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    fetchAll();
    const ch = sb.channel("gest-parents-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "alertes" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, fetchAll)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [fetchAll, sb]);

  const handleAdd = async (form: Partial<Parent>) => {
    setSaving(true);
    await sb.from("profiles").insert({
      prenom: form.prenom!, nom: form.nom!, tel: form.tel || null,
      role: "parent", civilite: form.civilite || "mere",
      enfant_id: form.enfant_id || null,
    });
    await fetchAll();
    setSaving(false);
    setAddModal(false);
  };

  const handleEdit = async (form: Partial<Parent>) => {
    if (!sel) return;
    setSaving(true);
    await sb.from("profiles").update({
      prenom: form.prenom, nom: form.nom,
      tel: form.tel || null, civilite: form.civilite || null,
      enfant_id: form.enfant_id || null,
    }).eq("id", sel.id);
    await fetchAll();
    setSaving(false);
    setEditModal(false);
  };

  const handleDelete = async (p: Parent) => {
    if (!confirm(`Supprimer le profil de ${p.prenom} ${p.nom} ?`)) return;
    await sb.from("profiles").delete().eq("id", p.id);
    setSel(null);
    fetchAll();
  };

  const sendNotif = async () => {
    if (!sel || !notifText.trim()) return;
    setSending(true);
    await sb.from("alertes").insert({
      type: "info_parent", severity: notifSev,
      message: `[Pour ${sel.prenom} ${sel.nom}] ${notifText.trim()}`,
      read: false,
    });
    setNotifText(""); setSending(false); setNotifOpen(false); setNotifSent(true);
    setTimeout(() => setNotifSent(false), 4000);
  };

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = parents.filter(p =>
    `${p.prenom} ${p.nom} ${p.tel ?? ""}`.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div style={{ textAlign: "center", padding: 60, color: C.gray400, fontSize: 14 }}>Chargement…</div>
  );

  // ── Detail view ────────────────────────────────────────────────────────────
  if (sel) {
    const enfant = sel.enfant as Enfant | undefined;
    const msgs = messages.filter(m => m.message?.includes(sel.prenom + " " + sel.nom));
    return (
      <div>
        {editModal && (
          <Modal title={`Modifier — ${sel.prenom} ${sel.nom}`} onClose={() => setEditModal(false)}>
            <ParentForm init={sel} enfants={enfants}
              onSave={handleEdit} onCancel={() => setEditModal(false)} saving={saving} />
          </Modal>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <button onClick={() => setSel(null)}
            style={{ background: "none", border: "none", color: C.navyL, cursor: "pointer",
              fontWeight: 700, fontSize: 14, padding: 0 }}>
            ← Tous les parents
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn small onClick={() => setEditModal(true)} color={C.navyL}>✏️ Modifier</Btn>
            <Btn small onClick={() => handleDelete(sel)} color={C.red} outline>🗑 Supprimer</Btn>
          </div>
        </div>

        {notifSent && (
          <div style={{ background: C.greenL, borderRadius: 10, padding: 12, marginBottom: 16,
            fontWeight: 700, color: C.green, fontSize: 13 }}>
            ✅ Notification envoyée à {sel.prenom} {sel.nom}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 20 }}>

          {/* Info card */}
          <div style={{ background: C.white, borderRadius: 16, padding: 24,
            border: `1px solid ${C.gray200}` }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 20,
              padding: 16, background: C.skyL, borderRadius: 12 }}>
              <div style={{ width: 52, height: 52, borderRadius: 26, background: C.navyL,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, color: C.white, fontWeight: 800, flexShrink: 0 }}>
                {(sel.prenom[0] ?? "").toUpperCase()}{(sel.nom[0] ?? "").toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 900, color: C.navy }}>
                  {sel.civilite === "mere" ? "Mme" : "M."} {sel.prenom} {sel.nom}
                </div>
                <div style={{ fontSize: 12, color: C.gray600, marginTop: 2 }}>
                  {sel.civilite === "mere" ? "Mère" : "Père"}
                  {" · "}{sel.user_id ? "✅ Compte actif" : "⚠ Pas de compte"}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <InfoBox label="Téléphone" value={sel.tel || "À compléter"} />
              {/* email not in profiles schema, will show placeholder */}
              <InfoBox label="Email" value="À compléter" />
            </div>

            {/* Enfant */}
            {enfant && (
              <div style={{ marginTop: 16, background: C.gray50, borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.gray600,
                  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
                  Enfant
                </div>
                <InfoBox label="Nom" value={`${enfant.prenom} ${enfant.nom}`} />
                {enfant.circuit && <InfoBox label="Circuit" value={`${enfant.circuit.emoji} ${enfant.circuit.nom}`} />}
                {enfant.adresse_mere && <InfoBox label="Adresse mère" value={enfant.adresse_mere} full />}
                {enfant.adresse_pere && <InfoBox label="Adresse père" value={enfant.adresse_pere} full />}
              </div>
            )}
            {!enfant && sel.enfant_id && (
              <div style={{ marginTop: 12, padding: 12, background: C.amberL, borderRadius: 10,
                fontSize: 12, color: C.amber, fontWeight: 600 }}>
                ⚠ Enfant non trouvé (ID {sel.enfant_id})
              </div>
            )}
            {!sel.enfant_id && (
              <div style={{ marginTop: 12, padding: 12, background: C.gray50, borderRadius: 10,
                fontSize: 12, color: C.gray400 }}>
                Aucun enfant associé — À compléter
              </div>
            )}

            {/* Notification */}
            <div style={{ marginTop: 16 }}>
              {!notifOpen ? (
                <Btn full onClick={() => setNotifOpen(true)} color={C.navyL}>
                  📨 Envoyer une notification
                </Btn>
              ) : (
                <div style={{ background: C.skyL, borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 8 }}>
                    Notification pour {sel.prenom} {sel.nom}
                  </div>
                  <textarea value={notifText} onChange={e => setNotifText(e.target.value)} rows={3}
                    placeholder="Votre message…"
                    style={{ ...inp, marginBottom: 8, resize: "vertical" }} />
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    {(["normale","haute"] as const).map(v => (
                      <button key={v} onClick={() => setNotifSev(v)}
                        style={{ flex: 1, padding: "6px 0", borderRadius: 8, cursor: "pointer",
                          border: `2px solid ${notifSev === v ? C.navyL : C.gray200}`,
                          background: notifSev === v ? C.navyL : C.white,
                          color: notifSev === v ? C.white : C.gray600,
                          fontWeight: 700, fontSize: 12 }}>
                        {v === "haute" ? "⚡ Urgente" : "📢 Normale"}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn full onClick={sendNotif} disabled={!notifText.trim() || sending} color={C.navyL}>
                      {sending ? "Envoi…" : "📤 Envoyer"}
                    </Btn>
                    <Btn outline color={C.gray600} onClick={() => { setNotifOpen(false); setNotifText(""); }}>
                      Annuler
                    </Btn>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Messages / Historique */}
          <div style={{ background: C.white, borderRadius: 16, padding: 24,
            border: `1px solid ${C.gray200}` }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: C.navy, marginBottom: 14 }}>
              Communications ({msgs.length})
            </div>
            {msgs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: C.gray400 }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
                <p style={{ fontSize: 13, margin: 0 }}>Aucune communication avec ce parent</p>
              </div>
            ) : msgs.map(m => (
              <div key={m.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.gray100}` }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 4 }}>
                  <span style={{ fontSize: 14 }}>{m.severity === "haute" ? "⚡" : "📢"}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, color: C.gray800, margin: 0, lineHeight: 1.5, fontWeight: m.read ? 400 : 700 }}>
                      {m.message.replace(/^\[Pour[^\]]+\]\s*/, "")}
                    </p>
                    <div style={{ fontSize: 11, color: C.gray400, marginTop: 3 }}>
                      {fmtDTLong(m.created_at)} · {m.read ? "✓ Lu" : "⏳ Non lu"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── List ───────────────────────────────────────────────────────────────────
  return (
    <div>
      {addModal && (
        <Modal title="Ajouter un parent" onClose={() => setAddModal(false)}>
          <ParentForm init={{}} enfants={enfants}
            onSave={handleAdd} onCancel={() => setAddModal(false)} saving={saving} />
        </Modal>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: C.navy, margin: "0 0 4px" }}>Parents</h1>
          <p style={{ fontSize: 13, color: C.gray600, margin: 0 }}>
            {parents.length} parent(s) enregistré(s) · {enfants.length} enfants dans le système
          </p>
        </div>
        <Btn onClick={() => setAddModal(true)} color={C.green}>+ Ajouter parent</Btn>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un parent…"
          style={{ padding: "9px 14px", borderRadius: 8, border: `1px solid ${C.gray200}`,
            fontSize: 13, outline: "none", width: 280 }} />
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ fontSize: 48 }}>👪</div>
          <p style={{ fontWeight: 700, color: C.gray600, marginTop: 12 }}>
            {search ? "Aucun parent trouvé" : "Aucun parent enregistré"}
          </p>
          {!search && (
            <p style={{ fontSize: 13, color: C.gray400 }}>
              Ajoutez les parents pour leur envoyer des notifications et gérer les absences.
            </p>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
          {filtered.map(p => {
            const enfant = p.enfant as Enfant | undefined;
            return (
              <div key={p.id} onClick={() => setSel(p)}
                style={{ background: C.white, borderRadius: 14, padding: 18, cursor: "pointer",
                  border: `1px solid ${C.gray200}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 20, background: C.navyL,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, color: C.white, fontWeight: 800, flexShrink: 0 }}>
                    {(p.prenom[0] ?? "").toUpperCase()}{(p.nom[0] ?? "").toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: C.gray800,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.civilite === "mere" ? "Mme" : "M."} {p.prenom} {p.nom}
                    </div>
                    <div style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>{p.tel || "Tél. à compléter"}</div>
                  </div>
                </div>
                {enfant ? (
                  <div style={{ background: C.skyL, borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>
                      {enfant.prenom} {enfant.nom}
                    </div>
                    {enfant.circuit && (
                      <div style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>
                        {enfant.circuit.emoji} {enfant.circuit.nom}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ background: C.gray50, borderRadius: 8, padding: "8px 10px",
                    fontSize: 11, color: C.gray400 }}>
                    Enfant non associé — À compléter
                  </div>
                )}
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 700,
                    background: p.user_id ? C.greenL : C.amberL,
                    color: p.user_id ? C.green : C.amber }}>
                    {p.user_id ? "✅ Compte actif" : "⏳ Sans compte"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
