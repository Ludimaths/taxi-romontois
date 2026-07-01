"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";
import { Card, Btn, SectionTitle } from "@/components/ui";
import type { Ecole, Eleve } from "@/lib/types";
import { Plus, School, Users, Map } from "lucide-react";

interface EcoleWithStats extends Ecole {
  nbEleves: number;
  nbCircuits: number;
}

interface AddForm {
  nom: string;
  adresse: string;
  nom_responsable_facturation: string;
  email: string;
  telephone: string;
  numero_tva: string;
  iban: string;
  lot: string;
}

const EMPTY_FORM: AddForm = {
  nom: "", adresse: "", nom_responsable_facturation: "",
  email: "", telephone: "", numero_tva: "", iban: "", lot: "",
};

export default function EtablissementsPage() {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();

  const [ecoles, setEcoles] = useState<EcoleWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<AddForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [{ data: ecolesData }, { data: elevesData }] = await Promise.all([
      sb.from("ecoles").select("*").order("nom"),
      sb.from("eleves").select("id,ecole_id,circuit_id,actif").eq("actif", true),
    ]);

    const eleves: Pick<Eleve, "id" | "ecole_id" | "circuit_id" | "actif">[] = elevesData ?? [];

    const list: EcoleWithStats[] = (ecolesData ?? []).map((e: Ecole) => {
      const mine = eleves.filter(el => el.ecole_id === e.id);
      const circuits = new Set(mine.map(el => el.circuit_id).filter(Boolean));
      return { ...e, nbEleves: mine.length, nbCircuits: circuits.size };
    });
    setEcoles(list);
    setLoading(false);
  }, [sb]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    if (!form.nom.trim()) { setError("Le nom est obligatoire."); return; }
    setSaving(true);
    setError("");
    const { error: err } = await sb.from("ecoles").insert({
      nom: form.nom.trim(),
      adresse: form.adresse.trim() || null,
      nom_responsable_facturation: form.nom_responsable_facturation.trim() || null,
      email: form.email.trim() || null,
      telephone: form.telephone.trim() || null,
      numero_tva: form.numero_tva.trim() || null,
      iban: form.iban.trim() || null,
      lot: form.lot.trim() || null,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setShowAdd(false);
    setForm(EMPTY_FORM);
    load();
  }

  if (loading) return (
    <div style={{ padding: 40, color: C.gray600 }}>Chargement…</div>
  );

  return (
    <div style={{ padding: "32px 28px", maxWidth: 960, margin: "0 auto" }}>
      <SectionTitle
        title="Établissements scolaires"
        action="+ Ajouter"
        onAction={() => setShowAdd(true)}
      />

      {ecoles.length === 0 && !showAdd && (
        <div style={{ padding: 48, textAlign: "center", color: C.gray400, background: C.gray50,
          borderRadius: 12, marginTop: 24 }}>
          <School size={48} color={C.gray200} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 15 }}>Aucun établissement enregistré.</div>
          <div style={{ marginTop: 16 }}>
            <Btn onClick={() => setShowAdd(true)}>
              <Plus size={14} /> Ajouter un établissement
            </Btn>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 16, marginTop: 24 }}>
        {ecoles.map(e => (
          <Card key={e.id} onClick={() => router.push(`/gestionnaire/etablissements/${e.id}`)}
            style={{ cursor: "pointer", padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: C.skyL,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <School size={22} color={C.navyL} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: C.gray800,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.nom}
                </div>
                {e.lot && (
                  <div style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>Lot {e.lot}</div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.gray600, fontSize: 13 }}>
                <Users size={14} /> <strong>{e.nbEleves}</strong> élève{e.nbEleves !== 1 ? "s" : ""}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.gray600, fontSize: 13 }}>
                <Map size={14} /> <strong>{e.nbCircuits}</strong> circuit{e.nbCircuits !== 1 ? "s" : ""}
              </div>
            </div>

            {e.adresse && (
              <div style={{ fontSize: 12, color: C.gray400, marginBottom: 12,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {e.adresse}
              </div>
            )}

            <div style={{ fontSize:13, fontWeight:700, color:C.navyL, marginTop:4 }}>
              Voir le détail →
            </div>
          </Card>
        ))}
      </div>

      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowAdd(false)}>
          <div style={{ background: C.white, borderRadius: 16, padding: "28px 30px",
            width: "100%", maxWidth: 540, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 18, color: C.gray800, marginBottom: 20 }}>
              Nouvel établissement
            </div>

            {[
              { key: "nom",                        label: "Nom *",                       placeholder: "Ex : Mérine" },
              { key: "adresse",                    label: "Adresse",                     placeholder: "Rue, NPA, ville" },
              { key: "nom_responsable_facturation",label: "Responsable facturation",     placeholder: "Prénom Nom" },
              { key: "email",                      label: "Email",                       placeholder: "facturation@ecole.ch" },
              { key: "telephone",                  label: "Téléphone",                   placeholder: "+41 XX XXX XX XX" },
              { key: "numero_tva",                 label: "N° TVA",                      placeholder: "CHE-XXX.XXX.XXX TVA" },
              { key: "iban",                       label: "IBAN",                        placeholder: "CH XX XXXX XXXX XXXX XXXX X" },
              { key: "lot",                        label: "Lot (contrat)",               placeholder: "Ex : A" },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, color: C.gray600, fontWeight: 600,
                  display: "block", marginBottom: 4 }}>{f.label}</label>
                <input
                  value={(form as unknown as Record<string,string>)[f.key]}
                  onChange={ev => setForm(prev => ({ ...prev, [f.key]: ev.target.value }))}
                  placeholder={f.placeholder}
                  style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.gray200}`,
                    borderRadius: 8, fontSize: 14, boxSizing: "border-box", outline: "none" }}
                />
              </div>
            ))}

            {error && (
              <div style={{ background: C.redL, color: C.red, borderRadius: 8,
                padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
              <Btn outline onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); setError(""); }}>
                Annuler
              </Btn>
              <Btn color="navy" disabled={saving} onClick={handleAdd}>
                {saving ? "Enregistrement…" : "Créer l'établissement"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
