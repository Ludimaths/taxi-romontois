import * as XLSX from "xlsx";
import type { Ecole, TourneeConfig, PriseEnCharge, Eleve } from "./types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParamEntreprise {
  nom?: string;
  adresse?: string;
  telephone?: string;
  tva?: string;
  iban?: string;
}

export interface DGEOParams {
  ecole: Ecole;
  tournees: TourneeConfig[];
  prises: PriseEnCharge[];
  eleves: Eleve[];
  mois: number;        // 1-12
  annee: number;
  numFacture: string;
  params: ParamEntreprise;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMois(m: number, a: number): string {
  const noms = ["","Janvier","Février","Mars","Avril","Mai","Juin",
    "Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  return `${noms[m]} ${a}`;
}

function joursDuMois(annee: number, mois: number): string[] {
  const jours: string[] = [];
  const d = new Date(annee, mois - 1, 1);
  while (d.getMonth() === mois - 1) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) jours.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return jours;
}

// ── Styles OOXML (rgb sans #) ─────────────────────────────────────────────────

const SN = {   // Navy — en-têtes colonnes + section
  fill: { patternType: "solid", fgColor: { rgb: "0D3B7A" } },
  font: { color: { rgb: "FFFFFF" }, bold: true, sz: 10 },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
};
const SN_TITLE = {  // Navy — grande cellule "FACTURE"
  fill: { patternType: "solid", fgColor: { rgb: "0D3B7A" } },
  font: { color: { rgb: "FFFFFF" }, bold: true, sz: 26 },
  alignment: { horizontal: "center", vertical: "center" },
};
const SN_SEC = {    // Navy — "Transports scolaires"
  fill: { patternType: "solid", fgColor: { rgb: "0D3B7A" } },
  font: { color: { rgb: "FFFFFF" }, bold: true, sz: 12 },
  alignment: { horizontal: "center", vertical: "center" },
};
const SG_L = {   // Gris — étiquette (label gras)
  fill: { patternType: "solid", fgColor: { rgb: "F1F5F9" } },
  font: { bold: true, sz: 10, color: { rgb: "475569" } },
  alignment: { vertical: "center" },
};
const SG_V = {   // Gris — valeur
  fill: { patternType: "solid", fgColor: { rgb: "F1F5F9" } },
  font: { sz: 10 },
  alignment: { vertical: "center", wrapText: true },
};
const SG_VB = {  // Gris — valeur bold (ex: numFacture)
  fill: { patternType: "solid", fgColor: { rgb: "F1F5F9" } },
  font: { bold: true, sz: 10 },
  alignment: { vertical: "center" },
};
const ST_L = {   // Total — étiquette
  fill: { patternType: "solid", fgColor: { rgb: "E2E8F0" } },
  font: { bold: true, sz: 11 },
  alignment: { vertical: "center" },
};
const ST_V = {   // Total — valeur (droite)
  fill: { patternType: "solid", fgColor: { rgb: "E2E8F0" } },
  font: { bold: true, sz: 11 },
  alignment: { horizontal: "right", vertical: "center" },
};
const STTC_L = {  // Grand total TTC — étiquette (navy)
  fill: { patternType: "solid", fgColor: { rgb: "0D3B7A" } },
  font: { color: { rgb: "FFFFFF" }, bold: true, sz: 12 },
  alignment: { vertical: "center" },
};
const STTC_V = {  // Grand total TTC — valeur (navy droite)
  fill: { patternType: "solid", fgColor: { rgb: "0D3B7A" } },
  font: { color: { rgb: "FFFFFF" }, bold: true, sz: 12 },
  alignment: { horizontal: "right", vertical: "center" },
};

// ── Onglet unique : Facture ────────────────────────────────────────────────────

function buildFactureSheet(p: DGEOParams): XLSX.WorkSheet {
  const joursOuvres  = joursDuMois(p.annee, p.mois);
  const elevesEcole  = p.eleves.filter(e => e.ecole_id === p.ecole.id && e.actif);

  const lignes = p.tournees
    .filter(t => t.ecole_id === p.ecole.id && t.actif)
    .map(t => {
      const joursTournee  = joursOuvres.filter(j => {
        const dow = new Date(j + "T00:00:00").getDay();
        return (dow === 0 ? 7 : dow) === t.jour_semaine;
      });
      const nbTournees    = joursTournee.length;
      const totalEleves   = p.eleves.filter(e => e.circuit_id === t.circuit_id && e.actif).length;
      const nbEcole       = elevesEcole.filter(e => e.circuit_id === t.circuit_id).length;
      const coutTournee   = (t.km * t.prix_km) + (t.duree_minutes / 60 * t.prix_heure);
      const coutEcole     = totalEleves > 0
        ? Math.round((coutTournee / totalEleves) * nbEcole * nbTournees * 100) / 100
        : 0;
      return {
        nom: t.nom, nbTournees, km: t.km, dureeMin: t.duree_minutes,
        coutTournee: Math.round(coutTournee * 100) / 100,
        totalEleves, nbEcole, coutEcole,
        prixKm: t.prix_km, prixHeure: t.prix_heure,
      };
    });

  const totalHT  = Math.round(lignes.reduce((s, l) => s + l.coutEcole, 0) * 100) / 100;
  const tva      = Math.round(totalHT * 0.081 * 100) / 100;
  const totalTTC = Math.round((totalHT + tva) * 100) / 100;

  const prixKmRef    = lignes[0]?.prixKm    ?? 0;
  const prixHeureRef = lignes[0]?.prixHeure ?? 0;

  const ws: XLSX.WorkSheet = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function c(row: number, col: number, v: string | number | null, s?: any, t?: XLSX.ExcelDataType) {
    const addr = XLSX.utils.encode_cell({ r: row, c: col });
    if (v === null || v === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (s) ws[addr] = { v: "", t: "s", s } as any;
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj: any = t ? { v, t } : { v };
    if (s) obj.s = s;
    ws[addr] = obj;
  }

  // ── R1 (0) : Nom entreprise (A1) + "FACTURE" (F1:H1) ──────────────────────
  c(0, 0, p.params.nom ?? "Nom de l'entreprise",
    { font: { bold: true, sz: 14, color: { rgb: "0D3B7A" } } });
  c(0, 5, "FACTURE", SN_TITLE);
  c(0, 6, null, SN_TITLE);
  c(0, 7, null, SN_TITLE);

  // ── R2 (1) : Adresse entreprise ────────────────────────────────────────────
  c(1, 0, "Adresse :",      { font: { bold: true, sz: 10, color: { rgb: "475569" } } });
  c(1, 1, p.params.adresse ?? "", { font: { sz: 10 } });

  // ── R3 (2) : Téléphone | Établissement ────────────────────────────────────
  c(2, 0, "Téléphone :",   { font: { bold: true, sz: 10, color: { rgb: "475569" } } });
  c(2, 1, p.params.telephone ?? "", { font: { sz: 10 } });
  c(2, 5, "Nom de l'établissement/structure",
    { font: { bold: true, sz: 10, color: { rgb: "475569" } } });
  c(2, 6, p.ecole.nom, { font: { sz: 10 } });

  // ── R4 (3) : N° TVA | Responsable facturation ──────────────────────────────
  c(3, 0, "N° TVA :",      { font: { bold: true, sz: 10, color: { rgb: "475569" } } });
  c(3, 1, p.params.tva ?? "", { font: { sz: 10 } });
  c(3, 5, "Nom et prénom (Resp. facturation)",
    { font: { bold: true, sz: 10, color: { rgb: "475569" } } });
  c(3, 6, p.ecole.nom_responsable_facturation ?? "", { font: { sz: 10 } });

  // ── R5 (4) : IBAN | Adresse école ──────────────────────────────────────────
  c(4, 0, "IBAN :",        { font: { bold: true, sz: 10, color: { rgb: "475569" } } });
  c(4, 1, p.params.iban ?? "", { font: { sz: 10 } });
  c(4, 5, "Adresse",       { font: { bold: true, sz: 10, color: { rgb: "475569" } } });
  c(4, 6, p.ecole.adresse ?? "", { font: { sz: 10 } });

  // ── R6 (5) : vide ──────────────────────────────────────────────────────────

  // ── R7 (6) : Établissement ─────────────────────────────────────────────────
  c(6, 0, "Établissement :", SG_L);
  c(6, 1, p.ecole.nom,       SG_V);
  c(6, 2, null,              SG_V);

  // ── R8 (7) : Structure ─────────────────────────────────────────────────────
  c(7, 0, "Structure(s) de l'établissement :", SG_L);
  c(7, 1, "",  SG_V);
  c(7, 2, null, SG_V);

  // ── R9 (8) : Facture N° ────────────────────────────────────────────────────
  c(8, 0, "Facture N° :", SG_L);
  c(8, 1, p.numFacture,   SG_VB);
  c(8, 2, null,           SG_VB);

  // ── R10 (9) : Mois / année ─────────────────────────────────────────────────
  c(9, 0, "Mois / année :",        SG_L);
  c(9, 1, fmtMois(p.mois, p.annee), SG_V);
  c(9, 2, null,                    SG_V);

  // ── R11 (10) : Lot ─────────────────────────────────────────────────────────
  c(10, 0, "Lot :",            SG_L);
  c(10, 1, p.ecole.lot ?? "", SG_V);
  c(10, 2, null,              SG_V);

  // ── R12 (11) : Prix/km ─────────────────────────────────────────────────────
  c(11, 0, "Prix/km (hors TVA) :", SG_L);
  c(11, 1, prixKmRef,              SG_V, "n");
  c(11, 2, null,                   SG_V);

  // ── R13 (12) : Prix/heure ──────────────────────────────────────────────────
  c(12, 0, "Prix/heure (hors TVA) :", SG_L);
  c(12, 1, prixHeureRef,              SG_V, "n");
  c(12, 2, null,                      SG_V);

  // ── R14 (13) : vide ────────────────────────────────────────────────────────

  // ── R15 (14) : "Transports scolaires" fusionné A15:H15 ────────────────────
  c(14, 0, "Transports scolaires", SN_SEC);
  for (let col = 1; col <= 7; col++) c(14, col, null, SN_SEC);

  // ── R16 (15) : En-têtes colonnes (navy) ────────────────────────────────────
  const COLS = [
    "Nom de la tournée",
    "Nb. de\ntournées",
    "Distance\n(km)",
    "Durée\n(min)",
    "Coût tournée\n(hors TVA)",
    "Nb. total\nélèves",
    "Nb. élèves\nécole",
    "Coût école\n(hors TVA)",
  ];
  COLS.forEach((h, i) => c(15, i, h, SN));

  // ── R17-R43 (16-42) : Lignes de données ────────────────────────────────────
  lignes.forEach((l, i) => {
    const r = 16 + i;
    c(r, 0, l.nom);
    c(r, 1, l.nbTournees,  undefined, "n");
    c(r, 2, l.km,          undefined, "n");
    c(r, 3, l.dureeMin,    undefined, "n");
    c(r, 4, l.coutTournee, undefined, "n");
    c(r, 5, l.totalEleves, undefined, "n");
    c(r, 6, l.nbEcole,     undefined, "n");
    c(r, 7, l.coutEcole,   undefined, "n");
  });

  // ── R44 (43) : Total HT ────────────────────────────────────────────────────
  c(43, 0, "Total (sans TVA)", ST_L);
  for (let col = 1; col <= 6; col++) c(43, col, null, ST_L);
  c(43, 7, totalHT, ST_V, "n");

  // ── R45 (44) : TVA 8.1% ────────────────────────────────────────────────────
  c(44, 0, "TVA 8.1%", ST_L);
  for (let col = 1; col <= 6; col++) c(44, col, null, ST_L);
  c(44, 7, tva, ST_V, "n");

  // ── R46 (45) : Total TTC ───────────────────────────────────────────────────
  c(45, 0, "Total (avec TVA)", STTC_L);
  for (let col = 1; col <= 6; col++) c(45, col, null, STTC_L);
  c(45, 7, totalTTC, STTC_V, "n");

  // ── R47 (46) : Paiement ────────────────────────────────────────────────────
  c(46, 0, "Paiement à 30 jours",
    { font: { italic: true, sz: 10, color: { rgb: "475569" } } });

  // ── Plage ──────────────────────────────────────────────────────────────────
  ws["!ref"] = XLSX.utils.encode_range({ r: 0, c: 0 }, { r: 46, c: 7 });

  // ── Fusions ────────────────────────────────────────────────────────────────
  ws["!merges"] = [
    { s: { r: 0, c: 5 }, e: { r: 0, c: 7 } },   // F1:H1  — FACTURE
    { s: { r: 1, c: 1 }, e: { r: 1, c: 2 } },   // B2:C2  — adresse entreprise
    { s: { r: 2, c: 1 }, e: { r: 2, c: 2 } },   // B3:C3  — téléphone
    { s: { r: 2, c: 6 }, e: { r: 2, c: 7 } },   // G3:H3  — nom école
    { s: { r: 3, c: 1 }, e: { r: 3, c: 2 } },   // B4:C4  — TVA
    { s: { r: 3, c: 6 }, e: { r: 3, c: 7 } },   // G4:H4  — responsable
    { s: { r: 4, c: 1 }, e: { r: 4, c: 2 } },   // B5:C5  — IBAN
    { s: { r: 4, c: 6 }, e: { r: 4, c: 7 } },   // G5:H5  — adresse école
    { s: { r: 6, c: 1 }, e: { r: 6, c: 2 } },   // B7:C7  — établissement
    { s: { r: 7, c: 1 }, e: { r: 7, c: 2 } },   // B8:C8  — structure
    { s: { r: 8, c: 1 }, e: { r: 8, c: 2 } },   // B9:C9  — facture N°
    { s: { r: 9, c: 1 }, e: { r: 9, c: 2 } },   // B10:C10 — mois
    { s: { r: 10, c: 1 }, e: { r: 10, c: 2 } },  // B11:C11 — lot
    { s: { r: 11, c: 1 }, e: { r: 11, c: 2 } },  // B12:C12 — prix/km
    { s: { r: 12, c: 1 }, e: { r: 12, c: 2 } },  // B13:C13 — prix/heure
    { s: { r: 14, c: 0 }, e: { r: 14, c: 7 } },  // A15:H15 — section
    { s: { r: 43, c: 0 }, e: { r: 43, c: 6 } },  // A44:G44 — total HT label
    { s: { r: 44, c: 0 }, e: { r: 44, c: 6 } },  // A45:G45 — TVA label
    { s: { r: 45, c: 0 }, e: { r: 45, c: 6 } },  // A46:G46 — TTC label
  ];

  // ── Largeurs colonnes ───────────────────────────────────────────────────────
  ws["!cols"] = [
    { wch: 45 }, { wch: 12 }, { wch: 13 }, { wch: 12 },
    { wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 22 },
  ];

  // ── Hauteurs lignes ─────────────────────────────────────────────────────────
  ws["!rows"] = Array.from({ length: 47 }, (_, i): XLSX.RowInfo => {
    if (i === 0) return { hpt: 36 };         // R1 : nom entreprise + FACTURE
    if (i === 14) return { hpt: 22 };        // R15: section
    if (i === 15) return { hpt: 30 };        // R16: en-têtes colonnes
    if (i >= 43 && i <= 45) return { hpt: 22 };  // totaux
    return { hpt: 16 };
  });

  return ws;
}

// ── Export principal ──────────────────────────────────────────────────────────

export function genererFactureDGEO(p: DGEOParams): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildFactureSheet(p), "Facture DGEO");
  const data = XLSX.write(wb, { type: "array", bookType: "xlsx", cellStyles: true });
  if (data instanceof ArrayBuffer) return data;
  if (data instanceof Uint8Array) return data.buffer as ArrayBuffer;
  return new Uint8Array(data as number[]).buffer as ArrayBuffer;
}
