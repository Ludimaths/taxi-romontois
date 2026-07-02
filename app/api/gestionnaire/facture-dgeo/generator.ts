/**
 * Génère la facture DGEO avec ExcelJS (Node.js pur — pas de Python).
 * Couleurs navy/gris, bordures medium/thin, ANNEXE 5b, structure du modèle officiel.
 */
import { Workbook } from "exceljs";
import type { Worksheet, Fill, Font, Alignment, Borders, Border } from "exceljs";

// ── Types input ───────────────────────────────────────────────────────────────

export interface FactureInput {
  ecole: {
    id: number;
    nom: string;
    lot?: string | null;
    adresse?: string | null;
    nom_responsable_facturation?: string | null;
  };
  tournees: {
    id: number;
    ecole_id: number;
    circuit_id: string;
    actif: boolean;
    nom: string;
    jour_semaine: number; // 1=lun … 7=dim
    km: number;
    duree_minutes: number;
    prix_km: number;
    prix_heure: number;
  }[];
  prises: { id: number; tournee_id: number; date: string }[];
  eleves: { id: number; ecole_id: number; circuit_id: string; actif: boolean }[];
  mois: number;    // 1-12
  annee: number;
  numFacture: string;
  params: {
    nom?: string;
    adresse?: string;
    telephone?: string;
    tva?: string;
    iban?: string;
  };
}

// ── Constantes couleurs (ARGB) ────────────────────────────────────────────────

const NAVY  = "FF0D3B7A";
const GRAY  = "FFE2E8F0";
const WHITE = "FFFFFFFF";

const NAVY_FILL: Fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
const GRAY_FILL: Fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRAY } };

// ── Polices ───────────────────────────────────────────────────────────────────

const fTitle:     Partial<Font> = { bold: true, size: 18 };
const fAnnexe:    Partial<Font> = { bold: true, size: 14 };
const fSection:   Partial<Font> = { bold: true, size: 14, color: { argb: WHITE } };
const fHeader:    Partial<Font> = { bold: true, size: 11, color: { argb: WHITE } };
const fLblBold:   Partial<Font> = { bold: true, size: 11 };
const fLbl:       Partial<Font> = { size: 11 };
const fData:      Partial<Font> = { size: 11 };
const fDataBold:  Partial<Font> = { bold: true, size: 11 };
const fTotalGray: Partial<Font> = { bold: true, size: 12 };
const fTva:       Partial<Font> = { size: 12 };
const fTotalNavy: Partial<Font> = { bold: true, size: 12, color: { argb: WHITE } };
const fPayment:   Partial<Font> = { size: 14 };

// ── Alignements ───────────────────────────────────────────────────────────────

const aCtr:  Partial<Alignment> = { horizontal: "center", vertical: "middle", wrapText: true };
const aCtrN: Partial<Alignment> = { horizontal: "center", vertical: "middle" };
const aLeft: Partial<Alignment> = { horizontal: "left",   vertical: "middle" };
const aRight: Partial<Alignment> = { horizontal: "right", vertical: "middle" };
const aV:    Partial<Alignment> = { vertical: "middle" };
const aVW:   Partial<Alignment> = { vertical: "middle", wrapText: true };

// ── Bordures ──────────────────────────────────────────────────────────────────

function bs(med: boolean): Partial<Border> { return { style: med ? "medium" : "thin" }; }

function bdr(
  l = false, r = false, t = false, b = false,
): Partial<Borders> {
  return { left: bs(l), right: bs(r), top: bs(t), bottom: bs(b) };
}

const BTHIN = bdr();  // thin all sides

// ── Helper cellule ────────────────────────────────────────────────────────────

interface CellOpts {
  value?: string | number | null;
  font?: Partial<Font>;
  fill?: Fill;
  border?: Partial<Borders>;
  alignment?: Partial<Alignment>;
  numFmt?: string;
}

function cell(ws: Worksheet, row: number, col: number, o: CellOpts = {}): void {
  const c = ws.getRow(row).getCell(col);
  if (o.value    !== undefined) c.value     = o.value;
  if (o.font)                   c.font      = o.font      as Font;
  if (o.fill)                   c.fill      = o.fill;
  if (o.border)                 c.border    = o.border    as Borders;
  if (o.alignment)              c.alignment = o.alignment as Alignment;
  if (o.numFmt)                 c.numFmt    = o.numFmt;
}

// ── Calcul ────────────────────────────────────────────────────────────────────

function joursDuMois(annee: number, mois: number): Date[] {
  const jours: Date[] = [];
  const d = new Date(annee, mois - 1, 1);
  while (d.getMonth() === mois - 1) {
    if (d.getDay() !== 0 && d.getDay() !== 6) jours.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return jours;
}

// ── Générateur principal ──────────────────────────────────────────────────────

const MOIS = ["","Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function genererFactureDGEO(input: FactureInput): Promise<any> {
  const { ecole, tournees, eleves, mois, annee, numFacture, params } = input;

  // Calcul des lignes
  const joursOuvres  = joursDuMois(annee, mois);
  const tourneesFilt = tournees.filter(t => t.actif && t.ecole_id === ecole.id);

  const lignes = tourneesFilt.map(t => {
    const dow = (d: Date) => d.getDay() === 0 ? 7 : d.getDay();
    const nbTournees  = joursOuvres.filter(d => dow(d) === t.jour_semaine).length;
    const allActifs   = eleves.filter(e => e.circuit_id === t.circuit_id && e.actif);
    const ecoleActifs = allActifs.filter(e => e.ecole_id === ecole.id);
    const totalEl     = allActifs.length;
    const nbEcole     = ecoleActifs.length;
    const coutTournee = t.km * t.prix_km + (t.duree_minutes / 60) * t.prix_heure;
    const coutEcole   = totalEl > 0
      ? Math.round((coutTournee / totalEl) * nbEcole * nbTournees * 100) / 100
      : 0;
    return {
      nom: t.nom, nbTournees, km: t.km, dureeMin: t.duree_minutes,
      coutTournee: Math.round(coutTournee * 100) / 100,
      totalEleves: totalEl, nbEcole, coutEcole,
    };
  });

  const totalHT  = Math.round(lignes.reduce((s, l) => s + l.coutEcole, 0) * 100) / 100;
  const tva      = Math.round(totalHT * 0.081 * 100) / 100;
  const totalTTC = Math.round((totalHT + tva) * 100) / 100;
  const prixKm    = tourneesFilt[0]?.prix_km    ?? 0;
  const prixHeure = tourneesFilt[0]?.prix_heure ?? 0;

  // Workbook
  const wb = new Workbook();
  const ws = wb.addWorksheet(" 6b) Facture - Exemple");

  // Largeurs colonnes (modèle officiel)
  ws.columns = [
    { width: 44.26 }, { width: 13.59 }, { width: 10.76 }, { width: 10.76 },
    { width: 12.51 }, { width: 12.51 }, { width: 16.54 }, { width: 22.06 },
  ];

  // Hauteurs lignes (modèle officiel)
  ws.getRow(1).height = 18.75;
  for (let r = 2; r <= 13; r++) ws.getRow(r).height = 20.25;
  ws.getRow(14).height = 7.5;
  ws.getRow(15).height = 19.5;
  ws.getRow(16).height = 66.95;
  for (let r = 17; r <= 43; r++) ws.getRow(r).height = 15.0;
  ws.getRow(44).height = 20.1;
  ws.getRow(45).height = 20.1;
  ws.getRow(46).height = 15.75;
  ws.getRow(47).height = 18.0;

  // ── R1 : Nom entreprise + ANNEXE 5b ─────────────────────────────────────────
  const nomEnt = params.nom ?? "Nom ou logo de l'entreprise";
  cell(ws, 1, 1, { value: " " + nomEnt,  font: fTitle,  alignment: aV });
  cell(ws, 1, 8, { value: "ANNEXE 5b",   font: fAnnexe, alignment: aRight });

  // ── R2-R5 : Infos entreprise ──────────────────────────────────────────────────
  cell(ws, 2, 1, { value: "Adresse :",   font: fLblBold, alignment: aV });
  cell(ws, 2, 2, { value: params.adresse   ?? "", font: fLbl, alignment: aV });
  cell(ws, 3, 1, { value: "Téléphone :", font: fLblBold, alignment: aV });
  cell(ws, 3, 2, { value: params.telephone ?? "", font: fLbl, alignment: aV });
  cell(ws, 4, 1, { value: "N° TVA :",    font: fLblBold, alignment: aV });
  cell(ws, 4, 2, { value: params.tva      ?? "", font: fLbl, alignment: aV });
  cell(ws, 5, 1, { value: "IBAN:",        font: fLblBold, alignment: aV });
  cell(ws, 5, 2, { value: params.iban     ?? "", font: fLbl, alignment: aV });

  // ── R3-R5 : Infos école (droite) ─────────────────────────────────────────────
  cell(ws, 3, 6, { value: "Nom de l'établissement/structure",  font: fLblBold, alignment: aVW });
  cell(ws, 3, 7, { value: ecole.nom,                           font: fLbl,     alignment: aV });
  cell(ws, 4, 6, { value: "Nom et prénom (Resp. facturation)", font: fLblBold, alignment: aVW });
  cell(ws, 4, 7, { value: ecole.nom_responsable_facturation ?? "", font: fLbl, alignment: aV });
  cell(ws, 5, 6, { value: "Adresse",                          font: fLblBold, alignment: aV });
  cell(ws, 5, 7, { value: ecole.adresse ?? "",                 font: fLbl,     alignment: aV });

  // ── R7-R13 : Infos facture ────────────────────────────────────────────────────
  cell(ws, 7,  1, { value: "Établissement :",                   font: fLblBold, alignment: aV });
  cell(ws, 7,  2, { value: ecole.nom,                           font: fLbl,     alignment: aV });
  cell(ws, 8,  1, { value: "Structure(s) de l'établissement :", font: fLblBold, alignment: aV });
  cell(ws, 8,  2, { value: "",                                  font: fLbl,     alignment: aV });
  cell(ws, 9,  1, { value: "Facture N° :",                      font: fLblBold,  alignment: aV });
  cell(ws, 9,  2, { value: numFacture,                          font: fDataBold, alignment: aV });
  cell(ws, 10, 1, { value: "Mois / année :",                    font: fLbl,      alignment: aV });
  cell(ws, 10, 2, { value: `${MOIS[mois]} ${annee}`,            font: fLbl,      alignment: aV });
  cell(ws, 11, 1, { value: "Lot :",                             font: fLbl,      alignment: aV });
  cell(ws, 11, 2, { value: ecole.lot ?? "",                     font: fLbl,      alignment: aV });
  cell(ws, 12, 1, { value: "Prix/km (hors TVA) :",              font: fLbl,      alignment: aV });
  cell(ws, 12, 2, { value: prixKm,   font: fLbl, alignment: aRight, numFmt: "0.00" });
  cell(ws, 13, 1, { value: "Prix/heure (hors TVA) :",           font: fLbl,      alignment: aV });
  cell(ws, 13, 2, { value: prixHeure, font: fLbl, alignment: aRight, numFmt: "0.00" });

  // ── Fusions ───────────────────────────────────────────────────────────────────
  for (const rng of [
    "B2:C2","B3:C3","G3:H3","B4:C4","G4:H4","B5:C5","G5:H5",
    "B7:C7","B8:C8","B9:C9","B10:C10","B11:C11","B12:C12","B13:C13",
    "A15:H15",
  ]) ws.mergeCells(rng);

  // ── R15 : Transports scolaires (navy, bordures medium) ───────────────────────
  // Pour une fusion, border s'applique à la cellule top-left
  cell(ws, 15, 1, {
    value:     "Transports scolaires",
    font:      fSection,
    fill:      NAVY_FILL,
    border:    bdr(true, true, true, true),
    alignment: aCtr,
  });

  // ── R16 : En-têtes colonnes (navy) ───────────────────────────────────────────
  const h16 = [
    "Nom de la tournée", "Nb. de\ntournées", "Distance\n(km)", "Durée\n(min)",
    "Coût tournée\n(hors TVA)", "Nb. total\nélèves", "Nb. élèves\nécole", "Coût école\n(hors TVA)",
  ];
  h16.forEach((h, i) => {
    cell(ws, 16, i + 1, {
      value:     h,
      font:      fHeader,
      fill:      NAVY_FILL,
      border:    bdr(i === 0, i === 7),
      alignment: aCtr,
    });
  });

  // ── R17-R43 : Données ─────────────────────────────────────────────────────────
  lignes.forEach((l, i) => {
    const r = 17 + i;
    cell(ws, r, 1, { value: l.nom,           font: fData,     border: bdr(true),       alignment: aLeft });
    cell(ws, r, 2, { value: l.nbTournees,    font: fData,     border: BTHIN,            alignment: aCtrN, numFmt: "0" });
    cell(ws, r, 3, { value: l.km,            font: fData,     border: BTHIN,            alignment: aCtrN, numFmt: "0.00" });
    cell(ws, r, 4, { value: l.dureeMin,      font: fData,     border: BTHIN,            alignment: aCtrN, numFmt: "0" });
    cell(ws, r, 5, { value: l.coutTournee,   font: fData,     border: BTHIN,            alignment: aCtrN, numFmt: "0.00" });
    cell(ws, r, 6, { value: l.totalEleves,   font: fData,     border: BTHIN,            alignment: aCtrN, numFmt: "0" });
    cell(ws, r, 7, { value: l.nbEcole,       font: fData,     border: BTHIN,            alignment: aCtrN, numFmt: "0" });
    cell(ws, r, 8, { value: l.coutEcole,     font: fDataBold, border: bdr(false, true), alignment: aCtrN, numFmt: "0.00" });
  });

  // Lignes vides avec bordures jusqu'à R43
  for (let r = 17 + lignes.length; r <= 43; r++) {
    cell(ws, r, 1, { border: bdr(true) });
    for (let c = 2; c <= 7; c++) cell(ws, r, c, { border: BTHIN });
    cell(ws, r, 8, { border: bdr(false, true) });
  }

  // ── R44 : Total HT (gris) ─────────────────────────────────────────────────────
  cell(ws, 44, 1, { value: "Total (sans TVA)", font: fTotalGray, fill: GRAY_FILL, border: bdr(true),       alignment: aLeft });
  for (let c = 2; c <= 7; c++) cell(ws, 44, c, { fill: GRAY_FILL, border: BTHIN });
  cell(ws, 44, 8, { value: totalHT, font: fTotalGray, fill: GRAY_FILL, border: bdr(false, true), alignment: aCtrN, numFmt: "0.00" });

  // ── R45 : TVA 8.1% (gris) ─────────────────────────────────────────────────────
  cell(ws, 45, 1, { value: "TVA 8.1%", font: fTva, fill: GRAY_FILL, border: bdr(true),       alignment: aLeft });
  for (let c = 2; c <= 7; c++) cell(ws, 45, c, { fill: GRAY_FILL, border: BTHIN });
  cell(ws, 45, 8, { value: tva, font: fTva, fill: GRAY_FILL, border: bdr(false, true), alignment: aCtrN, numFmt: "0.00" });

  // ── R46 : Total TTC (navy) ───────────────────────────────────────────────────
  cell(ws, 46, 1, { value: "Total (avec TVA)", font: fTotalNavy, fill: NAVY_FILL, border: bdr(true, false, false, true), alignment: aLeft });
  for (let c = 2; c <= 7; c++) cell(ws, 46, c, { fill: NAVY_FILL, border: bdr(false, false, false, true) });
  cell(ws, 46, 8, { value: totalTTC, font: fTotalNavy, fill: NAVY_FILL, border: bdr(false, true, false, true), alignment: aCtrN, numFmt: "0.00" });

  // ── R47 : Paiement ───────────────────────────────────────────────────────────
  cell(ws, 47, 1, { value: "Paiement à 30 jours", font: fPayment, alignment: aV });

  return wb.xlsx.writeBuffer();
}
