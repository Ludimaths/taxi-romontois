"use client";
import { useState } from "react";
import * as XLSX from "xlsx";
import { C } from "@/lib/constants";
import { Btn, Modal } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import type { Circuit, Eleve } from "@/lib/types";

// ── Import Excel (format standard type "Jupiter" : feuilles "Semaine" + "Élèves") ──
// Chaque fichier = UN circuit. Prévisualisation avant écriture, puis upsert.

interface ParsedEleve {
  num: string;
  nom_famille: string;
  prenom_initiale: string;
  adresse: string;
  heure_ramassage: string;
  heure_depose: string;
  nom_mere: string;
  tel_mere: string;
  nom_pere: string;
  tel_pere: string;
  remarques: string;
  _match?: Eleve | null;   // élève existant correspondant
}
interface Parsed {
  circuitNom: string;
  km: number | null;
  eleves: ParsedEleve[];
  fileName: string;
}

const norm = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// "07:14" | number Excel | "7h14" -> "07h14"
function fmtHeure(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "number") {
    const mins = Math.round(v * 24 * 60);
    const h = Math.floor(mins / 60), m = mins % 60;
    return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const m = s.match(/(\d{1,2})\s*[:hH]\s*(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}h${m[2]}` : s;
}

// "Delgado Quintas 078 920 12 34" -> { nom:"Delgado Quintas", tel:"078 920 12 34" }
function splitContact(v: unknown): { nom: string; tel: string } {
  const s = String(v ?? "").trim();
  if (!s || s === "-" || s === "- -") return { nom: "", tel: "" };
  const telMatch = s.match(/(\+?\d[\d\s./]{6,}\d)/);
  const tel = telMatch ? telMatch[1].replace(/\s+/g, " ").trim() : "";
  const nom = (tel ? s.replace(tel, "") : s).replace(/[·|]/g, " ").replace(/\s+/g, " ").trim();
  return { nom, tel };
}

// "Stann Donovan Renfer" -> prénom = tout sauf dernier mot, nom = dernier mot
function splitNom(full: string): { prenom: string; nom: string } {
  const parts = String(full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { prenom: "", nom: "" };
  if (parts.length === 1) return { prenom: "", nom: parts[0] };
  return { prenom: parts.slice(0, -1).join(" "), nom: parts[parts.length - 1] };
}

function rowsOf(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
}
function findHeader(rows: unknown[][], needles: string[]): { idx: number; cols: Record<string, number> } | null {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i].map(norm);
    if (needles.every(n => r.some(c => c.includes(n)))) {
      const cols: Record<string, number> = {};
      r.forEach((c, j) => { cols[c] = j; });
      return { idx: i, cols };
    }
  }
  return null;
}
function col(cols: Record<string, number>, ...names: string[]): number {
  for (const n of names) {
    const key = Object.keys(cols).find(k => k.includes(norm(n)));
    if (key !== undefined) return cols[key];
  }
  return -1;
}

function parseWorkbook(wb: XLSX.WorkBook, fileName: string, existing: Eleve[]): Parsed {
  // Circuit : depuis le nom de feuille "Semaine"/animal, sinon depuis une cellule "Circuit X", sinon le nom de fichier
  let circuitNom = "";
  let km: number | null = null;

  const semSheet = wb.SheetNames.find(n => norm(n).includes("semaine")) || wb.SheetNames[0];
  const semRows = rowsOf(wb.Sheets[semSheet]);
  for (const r of semRows) {
    for (const cell of r) {
      const s = String(cell ?? "");
      const m = s.match(/circuit\s+([A-Za-zÀ-ÿ'\- ]+)/i);
      if (m && !circuitNom) circuitNom = m[1].split(/[—\-·]/)[0].trim();
      const k = s.match(/([\d.,]+)\s*km\s*\/?\s*jour/i);
      if (k && km == null) km = parseFloat(k[1].replace(",", "."));
    }
  }
  if (!circuitNom) {
    const fn = fileName.replace(/\.xlsx?$/i, "").replace(/circuit/i, "").replace(/[_\-]/g, " ").trim();
    circuitNom = fn || semSheet;
  }

  // Feuille "Semaine" : MATIN (ramassage) puis APRÈS-MIDI (dépose)
  const semH = findHeader(semRows, ["eleve", "adresse"]);
  const eleves: Record<string, ParsedEleve> = {};
  if (semH) {
    const cN = col(semH.cols, "n°", "no", "num");
    const cE = col(semH.cols, "eleve");
    const cA = col(semH.cols, "adresse");
    const cL = col(semH.cols, "lundi");   // 1er jour = heure du matin (ramassage)
    // ── MATIN : on s'arrête au 1er marqueur (arrivée / après-midi / 2e en-tête / ligne vide) ──
    for (let i = semH.idx + 1; i < semRows.length; i++) {
      const r = semRows[i];
      const name = String(r[cE] ?? "").trim();
      const nn = norm(name);
      if (!name) { if (Object.keys(eleves).length) break; else continue; }
      if (/arriv|depose|midi|apres|depart/.test(nn) || nn === "eleve" || nn === "n°") break;
      const { prenom, nom } = splitNom(name);
      const num = String(r[cN] ?? "").trim();
      const key = num || nn;
      eleves[key] = {
        num, nom_famille: nom, prenom_initiale: prenom,
        adresse: String(r[cA] ?? "").trim(),
        heure_ramassage: cL >= 0 ? fmtHeure(r[cL]) : "",
        heure_depose: "", nom_mere: "", tel_mere: "", nom_pere: "", tel_pere: "", remarques: "",
      };
    }
    // ── APRÈS-MIDI : 2e en-tête après le matin → heure de dépose (par n°) ──
    const after = findHeader(semRows.slice(semH.idx + 1), ["eleve"]);
    if (after) {
      const aIdx = semH.idx + 1 + after.idx;
      const acN = col(after.cols, "n°", "no", "num");
      const acE = col(after.cols, "eleve");
      const acL = col(after.cols, "lundi");
      for (let i = aIdx + 1; i < semRows.length; i++) {
        const r = semRows[i];
        const name = String(r[acE] ?? "").trim();
        if (!name || /arriv|depart|midi/i.test(norm(name))) continue;
        const key = String(r[acN] ?? "").trim() || norm(name);
        if (eleves[key] && acL >= 0) eleves[key].heure_depose = fmtHeure(r[acL]);
      }
    }
  }

  // Feuille "Élèves" : contacts + remarques (+ dépose si présente)
  const elSheet = wb.SheetNames.find(n => norm(n).includes("eleve"));
  if (elSheet) {
    const elRows = rowsOf(wb.Sheets[elSheet]);
    const elH = findHeader(elRows, ["eleve"]);
    if (elH) {
      const cN = col(elH.cols, "n°", "no", "num");
      const cE = col(elH.cols, "eleve");
      const cA = col(elH.cols, "adresse");
      const cM = col(elH.cols, "contact mere", "mere", "mère");
      const cP = col(elH.cols, "contact pere", "pere", "père");
      const cR = col(elH.cols, "remarque");
      for (let i = elH.idx + 1; i < elRows.length; i++) {
        const r = elRows[i];
        const name = String(r[cE] ?? "").trim();
        if (!name) continue;
        const num = String(r[cN] ?? "").trim();
        const key = num || norm(name);
        const { prenom, nom } = splitNom(name);
        const mere = splitContact(cM >= 0 ? r[cM] : "");
        const pere = splitContact(cP >= 0 ? r[cP] : "");
        const base = eleves[key] || {
          num, nom_famille: nom, prenom_initiale: prenom, adresse: "", heure_ramassage: "",
          heure_depose: "", nom_mere: "", tel_mere: "", nom_pere: "", tel_pere: "", remarques: "",
        };
        base.adresse = base.adresse || (cA >= 0 ? String(r[cA] ?? "").trim() : "");
        base.nom_mere = mere.nom; base.tel_mere = mere.tel;
        base.nom_pere = pere.nom; base.tel_pere = pere.tel;
        base.remarques = cR >= 0 ? String(r[cR] ?? "").trim() : "";
        eleves[key] = base;
      }
    }
  }

  // Correspondance avec l'existant (par nom+prénom normalisés)
  const list = Object.values(eleves);
  list.forEach(pe => {
    pe._match = existing.find(e =>
      norm(e.nom_famille) === norm(pe.nom_famille) &&
      norm(e.prenom_initiale).split(" ")[0] === norm(pe.prenom_initiale).split(" ")[0]) || null;
  });
  return { circuitNom, km, eleves: list, fileName };
}

export function ImportExcelModal({ ecoleId, ecoleNom, circuits, eleves, onClose, onDone }:
  { ecoleId: number; ecoleNom: string; circuits: Circuit[]; eleves: Eleve[]; onClose: () => void; onDone: () => void }) {
  const sb = createClient();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string>("");

  async function onFile(file: File) {
    setErr(""); setDone("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const p = parseWorkbook(wb, file.name, eleves);
      if (!p.eleves.length) { setErr("Aucun élève détecté. Vérifie que le fichier a une feuille « Semaine » (avec Élève/Adresse) et/ou « Élèves »."); return; }
      setParsed(p);
    } catch (e) {
      setErr("Lecture impossible : " + (e as Error).message);
    }
  }

  const existingCircuit = parsed
    ? circuits.find(c => norm(c.nom) === norm(parsed.circuitNom))
    : null;

  async function doImport() {
    if (!parsed) return;
    setBusy(true); setErr("");

    // 1) Circuit : existant (même établissement) ou création
    let circuitId = existingCircuit?.id ?? "";
    if (!circuitId) {
      circuitId = (norm(parsed.circuitNom).toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 14) || "CIRCUIT") + "-" + String(Date.now()).slice(-4);
      const { error } = await sb.from("circuits").insert({
        id: circuitId, nom: parsed.circuitNom, emoji: "🚌", num: "",
        km_aller: parsed.km ?? 0, ecole_id: ecoleId, enfants_count: parsed.eleves.length,
      });
      if (error) { setErr("Circuit : " + error.message); setBusy(false); return; }
    } else if (parsed.km != null) {
      await sb.from("circuits").update({ km_aller: parsed.km }).eq("id", circuitId);
    }

    // 2) Élèves : upsert (update si correspondance, sinon insert)
    let created = 0, updated = 0;
    for (const pe of parsed.eleves) {
      const payload = {
        nom_famille: pe.nom_famille, prenom_initiale: pe.prenom_initiale,
        adresse: pe.adresse || null, circuit_id: circuitId, ecole_id: ecoleId,
        heure_ramassage: pe.heure_ramassage || null, heure_depose: pe.heure_depose || null,
        nom_mere: pe.nom_mere || null, tel_mere: pe.tel_mere || null,
        nom_pere: pe.nom_pere || null, tel_pere: pe.tel_pere || null,
        remarques: pe.remarques || null,
      };
      if (pe._match) {
        await sb.from("eleves").update(payload).eq("id", pe._match.id);
        updated++;
      } else {
        await sb.from("eleves").insert({ ...payload, type_transport: "standard", actif: true });
        created++;
      }
    }
    setBusy(false);
    setDone(`Import terminé : circuit « ${parsed.circuitNom} » · ${created} élève(s) créé(s), ${updated} mis à jour.`);
    onDone();
  }

  return (
    <Modal title="Importer un fichier Excel (un circuit)" onClose={onClose} wide>
      {!parsed ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 13, color: C.gray, lineHeight: 1.5 }}>
            Dépose un fichier Excel d'un circuit (feuilles « Semaine » et « Élèves »). Il sera importé dans <b>{ecoleNom}</b>.
            Une prévisualisation s'affiche avant tout enregistrement.
          </div>
          <label style={{ border: `2px dashed ${C.gray200}`, borderRadius: 12, padding: "28px 16px",
            textAlign: "center", cursor: "pointer", color: C.navy, fontWeight: 700, fontSize: 14, background: C.gray50 }}>
            📄 Choisir un fichier .xlsx
            <input type="file" accept=".xlsx,.xls" style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
          </label>
          {err && <div style={{ background: C.redL, color: C.red, borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>{err}</div>}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: "#EFF6FF", border: "1px solid #cfe0fb", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#0f2f66" }}>
            Circuit détecté : <b>{parsed.circuitNom}</b>{parsed.km != null ? ` · ${parsed.km} km` : ""} —{" "}
            {existingCircuit ? "circuit existant, sera mis à jour" : "nouveau circuit, sera créé"}. {parsed.eleves.length} élève(s).
          </div>
          <div style={{ maxHeight: 340, overflow: "auto", border: `1px solid ${C.gray200}`, borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead><tr style={{ background: C.gray50, position: "sticky", top: 0 }}>
                {["Élève", "Ramassage", "Adresse", "Mère", "Père", "Remarques", ""].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: C.gray600, fontWeight: 700, borderBottom: `1px solid ${C.gray200}` }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {parsed.eleves.map((pe, i) => (
                  <tr key={i} style={{ background: i % 2 ? C.gray50 : C.white }}>
                    <td style={{ padding: "7px 10px", fontWeight: 700 }}>{pe.prenom_initiale} {pe.nom_famille}</td>
                    <td style={{ padding: "7px 10px" }}>{pe.heure_ramassage || "—"}</td>
                    <td style={{ padding: "7px 10px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pe.adresse || "—"}</td>
                    <td style={{ padding: "7px 10px" }}>{pe.tel_mere || pe.nom_mere || "—"}</td>
                    <td style={{ padding: "7px 10px" }}>{pe.tel_pere || pe.nom_pere || "—"}</td>
                    <td style={{ padding: "7px 10px", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pe.remarques || "—"}</td>
                    <td style={{ padding: "7px 10px" }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: pe._match ? C.amber : C.green }}>
                        {pe._match ? "MAJ" : "Nouveau"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {err && <div style={{ background: C.redL, color: C.red, borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>{err}</div>}
          {done && <div style={{ background: C.greenL, color: C.greenD, borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 700 }}>{done}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            {!done && <Btn outline onClick={() => setParsed(null)}>Changer de fichier</Btn>}
            {done ? (
              <Btn color="navy" onClick={onClose}>Fermer</Btn>
            ) : (
              <Btn color="navy" disabled={busy} onClick={doImport}>{busy ? "Import en cours…" : "Confirmer l'import"}</Btn>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
