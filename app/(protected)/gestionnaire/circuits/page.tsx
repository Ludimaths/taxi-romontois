"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";
import { Badge, Card, InfoBox, Btn, Modal } from "@/components/ui";
import type { Circuit, Conducteur, CercleScolaire, Eleve, PriseEnCharge, Ecole, TourneeConfig } from "@/lib/types";

const isoToday = () => new Date().toISOString().slice(0, 10);
const MOIS = ["","Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

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
      {field("Nb enfants", "enfants_count", "number")}
      {field("Km aller", "km_aller", "number")}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600, textTransform: "uppercase", marginBottom: 4 }}>Cercle scolaire</label>
        <select value={f.cercle_id ?? ""} onChange={e => set("cercle_id", e.target.value ? Number(e.target.value) : null)}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.gray200}`, fontSize: 13 }}>
          <option value="">— Sans cercle —</option>
          {cercles.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <Btn color={C.navy} onClick={() => onSave(f)} disabled={saving}>{saving ? "Sauvegarde…" : "Enregistrer"}</Btn>
        <Btn outline onClick={onCancel}>Annuler</Btn>
      </div>
    </div>
  );
}

export default function CircuitsPage() {
  const supabase = createClient();
  const [circuits,  setCircuits]  = useState<Circuit[]>([]);
  const [drivers,   setDrivers]   = useState<Conducteur[]>([]);
  const [cercles,   setCercles]   = useState<CercleScolaire[]>([]);
  const [eleves,    setEleves]    = useState<Eleve[]>([]);
  const [prises,    setPrises]    = useState<PriseEnCharge[]>([]);
  const [ecoles,    setEcoles]    = useState<Ecole[]>([]);
  const [tournees,  setTournees]  = useState<TourneeConfig[]>([]);
  const [search,    setSearch]    = useState("");
  const [editId,    setEditId]    = useState<string | null>(null);
  const [addModal,  setAddModal]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [loading,   setLoading]   = useState(true);

  // Facturation
  const [facModal,    setFacModal]    = useState<string | null>(null); // circuit_id sélectionné
  const [facEcoleId,  setFacEcoleId]  = useState<number | null>(null);
  const [facMois,     setFacMois]     = useState(new Date().getMonth() + 1);
  const [facAnnee,    setFacAnnee]    = useState(new Date().getFullYear());
  const [facNumFac,   setFacNumFac]   = useState("");
  const [facBusy,     setFacBusy]     = useState(false);

  // Élèves du circuit — drill-down
  const [eleveModal,  setEleveModal]  = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const today = isoToday();
    const [cir, drv, cer, el, pr, ec, to] = await Promise.all([
      supabase.from("circuits").select("*, cercle:cercles_scolaires(*)").order("num"),
      supabase.from("conducteurs").select("*, vehicule:vehicules(*)").order("nom"),
      supabase.from("cercles_scolaires").select("*").order("nom"),
      supabase.from("eleves").select("*").eq("actif", true),
      supabase.from("prises_en_charge").select("*").eq("date", today),
      supabase.from("ecoles").select("*").order("nom"),
      supabase.from("tournees_config").select("*").eq("actif", true),
    ]);
    setCircuits(cir.data ?? []);
    setDrivers(drv.data ?? []);
    setCercles(cer.data ?? []);
    setEleves(el.data ?? []);
    setPrises(pr.data ?? []);
    setEcoles(ec.data ?? []);
    setTournees(to.data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = circuits.filter(c =>
    `${c.nom} ${c.num} ${(c.cercle as any)?.nom ?? ""}`.toLowerCase().includes(search.toLowerCase())
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

  // Télécharger facture DGEO depuis le gestionnaire
  const handleDownloadFacture = async () => {
    if (!facModal || !facEcoleId) return;
    setFacBusy(true);
    try {
      const ecole = ecoles.find(e => e.id === facEcoleId);
      if (!ecole) return;

      const debut = `${facAnnee}-${String(facMois).padStart(2,"0")}-01`;
      const fin   = new Date(facAnnee, facMois, 0).toISOString().slice(0,10);
      const elevesEcole = eleves.filter(e => e.ecole_id === facEcoleId);

      const { data: prisesM } = await supabase.from("prises_en_charge")
        .select("*").gte("date", debut).lte("date", fin)
        .in("eleve_id", elevesEcole.map(e => e.id));

      const { data: paramRows } = await supabase.from("parametres")
        .select("cle,valeur").in("cle", ["nom_entreprise","adresse","telephone","tva","iban"]);
      const params: Record<string,string> = {};
      (paramRows ?? []).forEach((r: { cle: string; valeur: string }) => { params[r.cle] = r.valeur; });

      const tourneesCir = tournees.filter(t => t.circuit_id === facModal && t.ecole_id === facEcoleId);

      const resp = await fetch("/api/gestionnaire/facture-dgeo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ecole, tournees: tourneesCir, prises: prisesM ?? [],
          eleves: elevesEcole, mois: facMois, annee: facAnnee,
          numFacture: facNumFac,
          params: { nom: params.nom_entreprise, adresse: params.adresse,
            telephone: params.telephone, tva: params.tva, iban: params.iban },
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const bytes = await resp.arrayBuffer();

      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url;
      a.download = `Facture_DGEO_${ecole.nom.replace(/\s+/g,"_")}_${MOIS[facMois]}_${facAnnee}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setFacBusy(false);
    }
  };

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: C.gray400 }}>Chargement…</div>;

  return (
    <div>
      {/* Modal édition */}
      {editCircuit && (
        <Modal title={`Modifier — ${editCircuit.emoji} ${editCircuit.nom}`} onClose={() => setEditId(null)}>
          <CircuitForm init={editCircuit} cercles={cercles} conducteurs={drivers}
            onSave={handleSave} onCancel={() => setEditId(null)} saving={saving} />
        </Modal>
      )}

      {/* Modal ajout */}
      {addModal && (
        <Modal title="Ajouter un circuit" onClose={() => setAddModal(false)}>
          <CircuitForm init={{}} cercles={cercles} conducteurs={drivers}
            onSave={handleAdd} onCancel={() => setAddModal(false)} saving={saving} isNew />
        </Modal>
      )}

      {/* Modal élèves du circuit */}
      {eleveModal && (() => {
        const elevesC = eleves.filter(e => e.circuit_id === eleveModal);
        return (
          <Modal title={`Élèves — ${circuits.find(c=>c.id===eleveModal)?.nom}`} onClose={() => setEleveModal(null)}>
            {elevesC.length === 0 ? (
              <p style={{ color: C.gray400, textAlign: "center", padding: 20 }}>Aucun élève enregistré pour ce circuit.</p>
            ) : elevesC.map(el => {
              const prise = prises.find(p => p.eleve_id === el.id);
              return (
                <div key={el.id} style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.gray100}` }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.gray800 }}>
                      {el.nom_famille} {el.prenom_initiale}.
                    </div>
                    <div style={{ fontSize: 11, color: C.gray400 }}>{el.type_transport}</div>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 12,
                    color: prise ? (prise.statut === "present" ? C.green : C.red) : C.amber }}>
                    {prise ? (prise.statut === "present" ? "✓ Présent" : "✗ Absent") : "En attente"}
                  </span>
                </div>
              );
            })}
          </Modal>
        );
      })()}

      {/* Modal facturation */}
      {facModal && (
        <Modal title="Télécharger la facture DGEO" onClose={() => setFacModal(null)}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600,
              textTransform: "uppercase", marginBottom: 4 }}>Établissement</label>
            <select value={facEcoleId ?? ""} onChange={e => setFacEcoleId(e.target.value ? Number(e.target.value) : null)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8,
                border: `1px solid ${C.gray200}`, fontSize: 13 }}>
              <option value="">— Choisir un établissement —</option>
              {ecoles.map(ec => <option key={ec.id} value={ec.id}>{ec.nom}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600,
                textTransform: "uppercase", marginBottom: 4 }}>Mois</label>
              <select value={facMois} onChange={e => setFacMois(Number(e.target.value))}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.gray200}`, fontSize: 13 }}>
                {MOIS.slice(1).map((n, i) => <option key={i+1} value={i+1}>{n}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600,
                textTransform: "uppercase", marginBottom: 4 }}>Année</label>
              <select value={facAnnee} onChange={e => setFacAnnee(Number(e.target.value))}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.gray200}`, fontSize: 13 }}>
                {[2024,2025,2026,2027].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gray600,
              textTransform: "uppercase", marginBottom: 4 }}>N° de facture *</label>
            <input
              value={facNumFac}
              onChange={e => setFacNumFac(e.target.value)}
              placeholder={`${facAnnee}-${String(facMois).padStart(2,"0")}-NOM_ECOLE`}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8,
                border: `1px solid ${C.gray200}`, fontSize: 13,
                fontFamily: "monospace", boxSizing: "border-box" }}
            />
            <div style={{ fontSize: 11, color: C.gray400, marginTop: 3 }}>
              Format : AAAA-MM-NOM_ECOLE — ex : 2026-06-MERINE
            </div>
          </div>
          <Btn color={C.navy} disabled={!facEcoleId || !facNumFac.trim() || facBusy} onClick={handleDownloadFacture} full>
            <Download size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />
            {facBusy ? "Génération…" : `Télécharger — ${MOIS[facMois]} ${facAnnee}`}
          </Btn>
        </Modal>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: C.gray800, margin: 0 }}>Circuits ({circuits.length})</h2>
        <Btn onClick={() => setAddModal(true)} color={C.green}>+ Ajouter circuit</Btn>
      </div>
      <div style={{ marginBottom: 14 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher circuit…"
          style={{ padding: "9px 14px", borderRadius: 8, border: `1px solid ${C.gray200}`,
            fontSize: 13, outline: "none", width: 280 }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
        {filtered.map(c => {
          const drv = drivers.find(d => d.circuit_id === c.id && d.status !== "absent");
          const elevesC   = eleves.filter(e => e.circuit_id === c.id);
          const prisesC   = prises.filter(p => elevesC.some(e => e.id === p.eleve_id));
          const presents  = prisesC.filter(p => p.statut === "present").length;
          const absents   = prisesC.filter(p => p.statut === "absent").length;
          const hasEcoles = ecoles.length > 0;

          return (
            <Card key={c.id} style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ fontSize: 32 }}>{c.emoji}</div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: C.navy }}>{c.num}-{c.nom}</div>
                    <div style={{ fontSize: 12, color: C.gray400 }}>{(c.cercle as any)?.nom} · {c.enfants_count} enfants</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Badge color={drv ? "green" : "red"}>{drv ? "Couvert" : "Incomplet"}</Badge>
                  <Btn small onClick={() => setEditId(c.id)} color={C.navyL}>Modifier</Btn>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: elevesC.length > 0 ? 12 : 0 }}>
                <InfoBox label="Conducteur" value={drv ? `${drv.prenom} ${drv.nom}` : "Non affecté"} highlight={!drv ? C.red : undefined} />
                <InfoBox label="Véhicule" value={(drv?.vehicule as any)?.plaque || "—"} />
                <InfoBox label="Kilomètres" value={c.km_aller ? `${c.km_aller} km` : "—"} />
                <InfoBox label="N° tournée" value={c.num} />
              </div>

              {/* Statut élèves du jour */}
              {elevesC.length > 0 && (
                <div style={{ background: C.gray50, borderRadius: 10, padding: "10px 12px",
                  marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 12, color: C.gray600 }}>
                    <strong style={{ color: C.navy }}>{elevesC.length}</strong> élève{elevesC.length > 1 ? "s" : ""}
                    {presents > 0 && <span style={{ color: C.green, marginLeft: 8 }}>✓ {presents}</span>}
                    {absents > 0  && <span style={{ color: C.red,   marginLeft: 6 }}>✗ {absents}</span>}
                    {elevesC.length - presents - absents > 0 && (
                      <span style={{ color: C.amber, marginLeft: 6 }}>
                        ⏳ {elevesC.length - presents - absents}
                      </span>
                    )}
                  </div>
                  <button onClick={() => setEleveModal(c.id)}
                    style={{ background: "none", border: "none", color: C.navyL, cursor: "pointer",
                      fontSize: 12, fontWeight: 700, padding: 0 }}>
                    Voir →
                  </button>
                </div>
              )}

              {/* Bouton facturation */}
              {hasEcoles && (
                <button onClick={() => { setFacModal(c.id); setFacEcoleId(null); }}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8,
                    border: `1px solid ${C.gray200}`, background: C.white, cursor: "pointer",
                    color: C.navyL, fontWeight: 700, fontSize: 12,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Download size={13} /> Voir la facturation
                </button>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
