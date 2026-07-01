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
  numFacture: string;  // saisi manuellement par le gestionnaire
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

// ── Onglet 6a — Guide de lecture (reproduction fidèle du modèle) ──────────────

function build6aSheet(): XLSX.WorkSheet {
  const aoa: (string | number | null)[][] = [
    // R1
    ["FACTURE - GUIDE DE LECTURE", null, "ANNEXE 6a"],
    // R2 (cellule fusionnée A2:C2)
    [
      "Ce guide décrit et précise les informations ainsi que les calculs attendus dans l'exemple de facture (voir onglet 6b) \"Facture - Exemple\".\n" +
      "La DGEO propose cet exemple à titre indicatif uniquement (voir REMARQUE IMPORTANTE DANS LE CAS DE L'UTILISATION D'UNE AUTRE FORME DE FACTURE ci-dessous).",
      null, null,
    ],
    // R3 — en-têtes tableau
    ["Nom du champ", "Description et informations attendues", "Exemple"],
    // R4
    [
      "Nom de la tournée",
      "Identification de la tournée.\n" +
      "Cette nomenclature est propre à votre organisation.\n\n" +
      "Elle doit garantir un caractère unique selon les éléments définis ci-dessous :\n" +
      "- un jour,\n- un moment de la journée,\n" +
      "- une série de points de prise en charge vers ou depuis un lieu de scolarisation.\n\n" +
      "Si un changement survient concernant l'absence d'un élève, sa nomenclature devra changer.\n" +
      "Par exemple :\n" +
      "- CRPS BUSSIGNY_LUNDI_RETOUR_MATIN_a (pour les tournées complètes)\n" +
      "- CRPS BUSSIGNY_LUNDI_RETOUR_MATIN_b (pour les tournées particulières modifiées, suite à l'absence d'un élève)",
      "CRPS BUSSIGNY_LUNDI_RETOUR_MATIN",
    ],
    // R5
    [
      "Nb. de tournées",
      "Cette information indique le nombre de fois que la tournée a été réalisée de manière identique durant la période de facturation (mois).\n\n" +
      "Dans l'exemple ci-contre, la tournée du lundi retour matin s'est réalisée quatre fois au cours du mois correspondant à la facturation.",
      4,
    ],
    // R6
    [
      "Distance\n(kilomètres)",
      "Nombre total de kilomètres de la tournée.\n\n" +
      "Cette distance représente le nombre de kilomètres entre le premier lieu de prise en charge et le lieu de destination.",
      25,
    ],
    // R7
    [
      "Durée \n(heures)",
      "Durée de la tournée exprimée en heures.\n\n" +
      "Elle correspond à la somme des 2 éléments suivants :\n" +
      "  - Le nombre de minutes entre le premier lieu de prise en charge et l'arrivée au lieu de destination ;\n" +
      "  - Le nombre de minutes par prise en charge (comprise entre 1 et 5 mn au maximum par élève en transport standard, " +
      "et entre 1 et 10 mn au maximum par élève en transport équipé).",
      30,
    ],
    // R8
    [
      "Coût de la tournée (hors TVA)\n",
      "Le coût est calculé de la façon suivante :\n\n" +
      "(Distance (kilomètres)    x   le prix/km (hors TVA))\n+ \n" +
      "((Durée (minutes) / 60)    x   le prix/heure (hors TVA))",
      112.5,
    ],
    // R9
    [
      "Nb.total d'élève(s)",
      "Nombre total d'élèves présents dans le véhicule.",
      3,
    ],
    // R10
    [
      "Nb.d'élève(s)\nde votre établissement/structure ",
      "Nombre total d'élèves correspondants à l'établissement/la structure concerné.e par la facture. " +
      "Dans l'exemple proposé, deux élèves sur trois correspondent à l'établissement/la structure concerné.e par la facture.\n\n" +
      "Ainsi le coût de la tournée pour l'établissement/structure concerné.e.s est ajusté.",
      2,
    ],
    // R11
    [
      "Coût de la tournée pour votre établissement/structure\n(hors TVA)",
      "Cette information indique le montant facturé à l'établissement/structure pour une tournée donnée. " +
      "La somme de ces montants correspond au montant hors TVA de la prestation de service de votre entreprise pour l'établissement/structure concerné.e.\n\n" +
      "(Coût de la tournée (hors TVA)    /    Nb.total d'élève(s))\n" +
      "x Nb.d'élève(s) de votre établissement /structure\nx Nb. de tournées ",
      300,
    ],
    // R12 — vide
    [null, null, null],
    // R13 — REMARQUE (fusionnée A13:C13)
    ["REMARQUE IMPORTANTE DANS LE CAS DE L'UTILISATION D'UNE AUTRE FORME DE FACTURE", null, null],
    // R14 — (fusionnée A14:C14)
    [
      "La DGEO propose à titre indicatif un fichier d'exemple de facture (onglet 6b Facture - Exemple).\n" +
      "Il permet à l'entreprise de transport de dresser la facture mensuelle regroupant toutes les tournées de chaque établissement/structure.",
      null, null,
    ],
    // R15 — vide
    [null, null, null],
    // R16 — (fusionnée A16:C16)
    ["Dans tous les cas, la facture de l'ETR doit impérativement comporter l'intégralité des données suivantes :", null, null],
    // R17 — vide
    [null, null, null],
    // R18
    ["Informations de l'entreprise de transport", null, null],
    // R19
    ["Adresse :", null, null],
    // R20
    ["Téléphone :", null, null],
    // R21
    ["N° TVA :", null, null],
    // R22
    ["IBAN :", null, null],
    // R23 — vide
    [null, null, null],
    // R24
    ["Facture N° :", null, null],
    // R25
    ["Mois / année :", null, null],
    // R26
    ["Lot :", null, null],
    // R27
    ["Prix/km (hors TVA):", null, null],
    // R28
    ["Prix/heure (hors TVA) :", null, null],
    // R29 — vide
    [null, null, null],
    // R30
    ["Informations en lien avec l'établissement/structure facturé.e", null, null],
    // R31
    ["Nom de l'établissement/structure :            ", null, null],
    // R32
    ["Nom et prénom de la personne responsable de la facturation :         ", null, null],
    // R33
    ["Adresse :   ", null, null],
    // R34 — vide
    [null, null, null],
    // R35
    ["Informations en lien avec les tournées opérées pour l'établissement/structure concerné.e", null, null],
    // R36
    ["Nom de la tournée :        ", null, null],
    // R37
    ["Nb. de tournées :", null, null],
    // R38
    ["Distance (kilomètres) :", null, null],
    // R39
    ["Durée (minutes) :", null, null],
    // R40
    ["Coût de la tournée (hors TVA) :", null, null],
    // R41
    ["Nb. total d'élève(s) :", null, null],
    // R42
    ["Nb. d'élève(s) de votre établissement/structure :", null, null],
    // R43
    ["Coût de la tournée pour votre établissement/structure (hors TVA) :", null, null],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Fusions identiques au modèle
  ws["!merges"] = [
    { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },   // A2:C2
    { s: { r: 12, c: 0 }, e: { r: 12, c: 2 } },  // A13:C13
    { s: { r: 13, c: 0 }, e: { r: 13, c: 2 } },  // A14:C14
    { s: { r: 15, c: 0 }, e: { r: 15, c: 2 } },  // A16:C16
  ];

  ws["!cols"] = [{ wch: 45 }, { wch: 80 }, { wch: 14 }];
  return ws;
}

// ── Onglet 6b — Facture (reproduction fidèle du modèle) ──────────────────────

function build6bSheet(p: DGEOParams): XLSX.WorkSheet {
  const joursOuvres = joursDuMois(p.annee, p.mois);
  const elevesEcole = p.eleves.filter(e => e.ecole_id === p.ecole.id && e.actif);

  // Tournées actives de cette école avec calcul
  const lignes = p.tournees
    .filter(t => t.ecole_id === p.ecole.id && t.actif)
    .map(t => {
      const joursTournee = joursOuvres.filter(j => {
        const dow = new Date(j + "T00:00:00").getDay();
        return (dow === 0 ? 7 : dow) === t.jour_semaine;
      });
      const nbTournees  = joursTournee.length;
      const totalEleves = p.eleves.filter(e => e.circuit_id === t.circuit_id && e.actif).length;
      const nbEcole     = elevesEcole.filter(e => e.circuit_id === t.circuit_id).length;
      // Coût tournée HT = (km × prix/km) + (durée_min / 60 × prix/heure)
      const coutTournee = (t.km * t.prix_km) + (t.duree_minutes / 60 * t.prix_heure);
      // Part école = (coût tournée / nb total élèves) × nb élèves école × nb tournées
      const coutEcole   = totalEleves > 0
        ? Math.round((coutTournee / totalEleves) * nbEcole * nbTournees * 100) / 100
        : 0;
      return {
        nom:         t.nom,
        nbTournees,
        km:          t.km,
        dureeMin:    t.duree_minutes,
        coutTournee: Math.round(coutTournee * 100) / 100,
        totalEleves,
        nbEcole,
        coutEcole,
        prixKm:      t.prix_km,
        prixHeure:   t.prix_heure,
      };
    });

  // Total HT
  const totalHT  = Math.round(lignes.reduce((s, l) => s + l.coutEcole, 0) * 100) / 100;
  const tva      = Math.round(totalHT * 0.081 * 100) / 100;
  const totalTTC = Math.round((totalHT + tva) * 100) / 100;

  // Prix référence pour header (première tournée)
  const prixKmRef    = lignes[0]?.prixKm    ?? 0;
  const prixHeureRef = lignes[0]?.prixHeure ?? 0;

  // ── Construction de la feuille ligne par ligne ────────────────────────────
  // On utilise un tableau éparse : cellules posées manuellement

  const ws: XLSX.WorkSheet = {};

  function cell(r: number, c: number, v: string | number | null, t?: XLSX.ExcelDataType) {
    if (v === null || v === undefined) return;
    const addr = XLSX.utils.encode_cell({ r, c });
    ws[addr] = t ? { v, t } : { v };
  }

  // R1 — Nom entreprise + ANNEXE 6b
  cell(0, 0, (p.params.nom ?? "Nom ou logo de l'entreprise") +
    "                                                                                       ");
  cell(0, 7, "ANNEXE 6b");

  // R2 — Adresse entreprise
  cell(1, 0, "Adresse :");
  cell(1, 1, p.params.adresse ?? "");

  // R3 — Téléphone | Nom établissement
  cell(2, 0, "Téléphone :");
  cell(2, 1, p.params.telephone ?? "");
  cell(2, 5, "Nom de l'établissement/structure");
  cell(2, 6, p.ecole.nom);

  // R4 — N° TVA | Responsable facturation
  cell(3, 0, "N° TVA :");
  cell(3, 1, p.params.tva ?? "");
  cell(3, 5, "Nom et prénom (Resp.facturation)");
  cell(3, 6, p.ecole.nom_responsable_facturation ?? "");

  // R5 — IBAN | Adresse établissement
  cell(4, 0, "IBAN:");
  cell(4, 1, p.params.iban ?? "");
  cell(4, 5, "Adresse");
  cell(4, 6, p.ecole.adresse ?? "");

  // R6 — vide

  // R7 — Etablissement
  cell(6, 0, "Etablissement :");
  cell(6, 1, p.ecole.nom);

  // R8 — Structure(s)
  cell(7, 0, "Structure(s) de l'établissement :");

  // R9 — Facture N°
  cell(8, 0, "Facture N° :");
  cell(8, 1, p.numFacture);

  // R10 — Mois / année
  cell(9, 0, "Mois / année :");
  cell(9, 1, fmtMois(p.mois, p.annee));

  // R11 — Lot
  cell(10, 0, "Lot :");
  cell(10, 1, p.ecole.lot ?? "");

  // R12 — Prix/km
  cell(11, 0, "Prix/km (hors TVA) :");
  cell(11, 1, prixKmRef, "n");

  // R13 — Prix/heure
  cell(12, 0, "Prix/heure (hors TVA) :");
  cell(12, 1, prixHeureRef, "n");

  // R14 — vide

  // R15 — "Transports scolaires" (fusionné A15:H15)
  cell(14, 0, "Transports scolaires");

  // R16 — En-têtes colonnes
  cell(15, 0, "Nom de la tournée");
  cell(15, 1, "Nb.de tournées");
  cell(15, 2, "Distance\n(kilomètres)");
  cell(15, 3, "Durée \n(minutes)");
  cell(15, 4, "Coût de la tournée\n(hors TVA)\n");
  cell(15, 5, "Nb.total d'élève(s)");
  cell(15, 6, "Nb.d'élève(s)\nde votre établissement/\nstructure");
  cell(15, 7, "Coût de la tournée pour votre établissement/\nstructure (hors TVA)");

  // R17+ — Lignes de données (max 27 lignes, row index 16 à 42)
  lignes.forEach((l, i) => {
    const r = 16 + i;
    cell(r, 0, l.nom);
    cell(r, 1, l.nbTournees, "n");
    cell(r, 2, l.km, "n");
    cell(r, 3, l.dureeMin, "n");
    cell(r, 4, l.coutTournee, "n");
    cell(r, 5, l.totalEleves, "n");
    cell(r, 6, l.nbEcole, "n");
    cell(r, 7, l.coutEcole, "n");
  });

  // Lignes vides jusqu'à R43 (row index 42) — espace réservé comme le modèle

  // R44 — Total HT (row index 43)
  cell(43, 0, "Total (sans TVA)");
  cell(43, 7, totalHT, "n");

  // R45 — TVA (row index 44)
  cell(44, 0, "TVA ");
  cell(44, 4, 0.081, "n");  // cellule E45 = 0.081 (affiché 8.1%)
  cell(44, 7, tva, "n");

  // R46 — Total TTC (row index 45)
  cell(45, 0, "Total (avec TVA)");
  cell(45, 7, totalTTC, "n");

  // R47 — Paiement (row index 46)
  cell(46, 0, "Paiement à 30 jours");

  // Plage de la feuille
  ws["!ref"] = XLSX.utils.encode_range({ r: 0, c: 0 }, { r: 46, c: 7 });

  // Fusions identiques au modèle
  ws["!merges"] = [
    { s: { r: 1, c: 1 }, e: { r: 1, c: 2 } },   // B2:C2  — adresse
    { s: { r: 2, c: 1 }, e: { r: 2, c: 2 } },   // B3:C3  — téléphone
    { s: { r: 3, c: 1 }, e: { r: 3, c: 2 } },   // B4:C4  — TVA
    { s: { r: 4, c: 1 }, e: { r: 4, c: 2 } },   // B5:C5  — IBAN
    { s: { r: 6, c: 1 }, e: { r: 6, c: 2 } },   // B7:C7  — établissement
    { s: { r: 8, c: 1 }, e: { r: 8, c: 2 } },   // B9:C9  — facture N°
    { s: { r: 9, c: 1 }, e: { r: 9, c: 2 } },   // B10:C10 — mois
    { s: { r: 10, c: 1 }, e: { r: 10, c: 2 } },  // B11:C11 — lot
    { s: { r: 11, c: 1 }, e: { r: 11, c: 2 } },  // B12:C12 — prix/km
    { s: { r: 12, c: 1 }, e: { r: 12, c: 2 } },  // B13:C13 — prix/heure
    { s: { r: 14, c: 0 }, e: { r: 14, c: 7 } },  // A15:H15 — "Transports scolaires"
  ];

  // Largeurs colonnes (8 colonnes A-H)
  ws["!cols"] = [
    { wch: 45 },  // A — Nom tournée
    { wch: 12 },  // B — Nb tournées
    { wch: 13 },  // C — Distance
    { wch: 12 },  // D — Durée
    { wch: 20 },  // E — Coût tournée HT
    { wch: 12 },  // F — Nb total élèves
    { wch: 16 },  // G — Nb élèves école
    { wch: 22 },  // H — Coût école HT
  ];

  return ws;
}

// ── Export principal ──────────────────────────────────────────────────────────

export function genererFactureDGEO(p: DGEOParams): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, build6aSheet(), "6a) Facture - Guide de lecture");
  XLSX.utils.book_append_sheet(wb, build6bSheet(p), " 6b) Facture - Exemple");

  const data = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  if (data instanceof ArrayBuffer) return data;
  if (data instanceof Uint8Array) return data.buffer as ArrayBuffer;
  return new Uint8Array(data as number[]).buffer as ArrayBuffer;
}
