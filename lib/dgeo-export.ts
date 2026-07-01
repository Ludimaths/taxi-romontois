import * as XLSX from "xlsx";
import type { Ecole, TourneeConfig, PriseEnCharge, Eleve } from "./types";

interface ParamEntreprise {
  nom?: string;
  adresse?: string;
  telephone?: string;
  tva?: string;
  iban?: string;
}

interface LigneTournee {
  nom: string;
  nbTournees: number;
  km: number;
  dureeMin: number;
  prixKm: number;
  prixHeure: number;
  totalEleves: number;
  elevesEcole: number;
}

export interface DGEOParams {
  ecole: Ecole;
  tournees: TourneeConfig[];
  prises: PriseEnCharge[];
  eleves: Eleve[];
  mois: number;   // 1-12
  annee: number;
  params: ParamEntreprise;
}

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
    if (dow !== 0 && dow !== 6) {
      jours.push(d.toISOString().slice(0, 10));
    }
    d.setDate(d.getDate() + 1);
  }
  return jours;
}

function sanitizeNomEcole(nom: string): string {
  return nom
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function buildNumFacture(annee: number, mois: number, nomEcole: string): string {
  const mm = String(mois).padStart(2, "0");
  return `${annee}-${mm}-${sanitizeNomEcole(nomEcole)}`;
}

function buildGuideSheet(): XLSX.WorkSheet {
  const rows: (string | number)[][] = [
    ["ANNEXE 6a — FACTURE : GUIDE DE LECTURE", "", "", ""],
    ["", "", "", ""],
    ["Ce document explique comment lire la facture mensuelle de transport scolaire (Annexe 6b).", "", "", ""],
    ["", "", "", ""],
    ["STRUCTURE DE LA FACTURE", "", "", ""],
    ["", "", "", ""],
    ["Section", "Contenu", "Remarques", ""],
    ["En-tête prestataire", "Nom, adresse, téléphone, N° TVA, IBAN", "Informations Taxi Romontois SA", ""],
    ["En-tête établissement", "Nom de l'école, adresse, responsable facturation, email", "Coordonnées de l'établissement bénéficiaire", ""],
    ["Infos facture", "N° facture, mois concerné, lot", "Format N° : AAAA-MM-NOM_ECOLE", ""],
    ["", "", "", ""],
    ["DÉTAIL DES COLONNES (Annexe 6b)", "", "", ""],
    ["", "", "", ""],
    ["Colonne", "Description", "", ""],
    ["Nom tournée", "Nom de la tournée (circuit + sens)", "", ""],
    ["Nb tournées", "Nombre de jours réels de service sur le mois", "", ""],
    ["Distance km", "Kilométrage par tournée (aller ou retour)", "", ""],
    ["Durée (min)", "Durée totale de la tournée en minutes", "", ""],
    ["Prix/km", "Tarif contractuel au kilomètre (CHF)", "", ""],
    ["Prix/heure", "Tarif contractuel horaire (CHF)", "", ""],
    ["Élèves total véhicule", "Nombre total d'élèves dans le véhicule (toutes écoles)", "", ""],
    ["Élèves école", "Nombre d'élèves de cet établissement dans le véhicule", "", ""],
    ["Coût école HT (CHF)", "Part du coût imputable à l'établissement, hors taxe", "", ""],
    ["", "", "", ""],
    ["CALCUL DU COÛT", "", "", ""],
    ["", "", "", ""],
    ["Formule", "Coût tournée HT = (km × prix/km) + (durée_min / 60 × prix/heure)", "", ""],
    ["", "Part école = (coût tournée HT / nb total élèves) × nb élèves école × nb tournées", "", ""],
    ["", "", "", ""],
    ["TAXES", "", "", ""],
    ["", "", "", ""],
    ["TVA", "8.1% fixe (taux suisse en vigueur)", "", ""],
    ["Total TTC", "Total HT + TVA", "", ""],
    ["", "", "", ""],
    ["PAIEMENT", "", "", ""],
    ["", "", "", ""],
    ["Délai", "30 jours dès réception de la facture", "", ""],
    ["IBAN", "Voir en-tête prestataire", "", ""],
    ["", "", "", ""],
    ["Taxi Romontois SA — document généré automatiquement", "", "", ""],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 35 }, { wch: 65 }, { wch: 45 }, { wch: 10 }];
  return ws;
}

export function genererFactureDGEO(p: DGEOParams): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  // ── Onglet 1 : Guide de lecture ─────────────────────────────
  XLSX.utils.book_append_sheet(wb, buildGuideSheet(), "6a) Facture - Guide de lecture");

  // ── Onglet 2 : Données facture ───────────────────────────────
  const joursOuvres = joursDuMois(p.annee, p.mois);

  const elevesEcole = p.eleves.filter(e => e.ecole_id === p.ecole.id && e.actif);
  const elevesEcoleIds = new Set(elevesEcole.map(e => e.id));

  const prisesEcole = p.prises.filter(pc => {
    const [a, m] = pc.date.split("-").map(Number);
    return a === p.annee && m === p.mois && elevesEcoleIds.has(pc.eleve_id);
  });
  // prisesEcole used in future for per-day breakdown
  void prisesEcole;

  const lignes: LigneTournee[] = p.tournees
    .filter(t => t.ecole_id === p.ecole.id && t.actif)
    .map(t => {
      const joursTournee = joursOuvres.filter(j => {
        const dow = new Date(j + "T00:00:00").getDay();
        const dowISO = dow === 0 ? 7 : dow;
        return dowISO === t.jour_semaine;
      });
      const nbTournees = joursTournee.length;
      const totalEleves = p.eleves.filter(e => e.circuit_id === t.circuit_id && e.actif).length;
      return {
        nom: t.nom,
        nbTournees,
        km: t.km,
        dureeMin: t.duree_minutes,
        prixKm: t.prix_km,
        prixHeure: t.prix_heure,
        totalEleves,
        elevesEcole: elevesEcole.filter(e => e.circuit_id === t.circuit_id).length,
      };
    });

  const numFacture = buildNumFacture(p.annee, p.mois, p.ecole.nom);
  const rows: (string | number)[][] = [];

  // En-tête entreprise
  rows.push(["TAXI ROMONTOIS SA", "", "", "", "", "", "", "", ""]);
  rows.push([p.params.adresse ?? "", "", "", "", "", "", "", "", ""]);
  rows.push([`Tél : ${p.params.telephone ?? ""}  |  TVA : ${p.params.tva ?? ""}  |  IBAN : ${p.params.iban ?? ""}`,
    "", "", "", "", "", "", "", ""]);
  rows.push(["", "", "", "", "", "", "", "", ""]);

  // En-tête école — utilise les champs directs de ecole
  rows.push([`Établissement : ${p.ecole.nom}`, "", "", "", "", "", "", "", ""]);
  rows.push([`Adresse : ${p.ecole.adresse ?? ""}`, "", "", "", "", "", "", "", ""]);
  rows.push([`Responsable facturation : ${p.ecole.nom_responsable_facturation ?? ""}`, "", "", "", "", "", "", "", ""]);
  rows.push([`Email : ${p.ecole.email ?? ""}`, "", "", "", "", "", "", "", ""]);
  if (p.ecole.telephone) rows.push([`Tél : ${p.ecole.telephone}`, "", "", "", "", "", "", "", ""]);
  if (p.ecole.numero_tva) rows.push([`N° TVA : ${p.ecole.numero_tva}`, "", "", "", "", "", "", "", ""]);
  if (p.ecole.iban) rows.push([`IBAN : ${p.ecole.iban}`, "", "", "", "", "", "", "", ""]);
  rows.push(["", "", "", "", "", "", "", "", ""]);

  // Infos facture
  rows.push([`N° facture : ${numFacture}`, "", `Mois : ${fmtMois(p.mois, p.annee)}`, "", `Lot : ${p.ecole.lot ?? ""}`, "", "", "", ""]);
  rows.push(["", "", "", "", "", "", "", "", ""]);

  // En-têtes tableau
  rows.push([
    "Nom tournée",
    "Nb tournées",
    "Distance km",
    "Durée (min)",
    "Prix/km",
    "Prix/heure",
    "Élèves total véhicule",
    "Élèves école",
    "Coût école HT (CHF)",
  ]);

  let totalHT = 0;
  for (const l of lignes) {
    const coutTourneeHT = (l.km * l.prixKm) + (l.dureeMin / 60 * l.prixHeure);
    const partEcole = l.totalEleves > 0
      ? (coutTourneeHT / l.totalEleves) * l.elevesEcole * l.nbTournees
      : 0;
    totalHT += partEcole;
    rows.push([
      l.nom, l.nbTournees, l.km, l.dureeMin, l.prixKm, l.prixHeure,
      l.totalEleves, l.elevesEcole, Math.round(partEcole * 100) / 100,
    ]);
  }

  rows.push(["", "", "", "", "", "", "", "", ""]);
  const tva = Math.round(totalHT * 0.081 * 100) / 100;
  const totalTTC = Math.round((totalHT + tva) * 100) / 100;
  rows.push(["", "", "", "", "", "", "", "Total HT (CHF)", Math.round(totalHT * 100) / 100]);
  rows.push(["", "", "", "", "", "", "", "TVA 8.1% (CHF)", tva]);
  rows.push(["", "", "", "", "", "", "", "Total TTC (CHF)", totalTTC]);
  rows.push(["", "", "", "", "", "", "", "", ""]);
  rows.push(["Paiement à 30 jours dès réception de la facture.", "", "", "", "", "", "", "", ""]);

  const ws2 = XLSX.utils.aoa_to_sheet(rows);
  ws2["!cols"] = [
    { wch: 40 }, { wch: 12 }, { wch: 13 }, { wch: 12 },
    { wch: 10 }, { wch: 11 }, { wch: 22 }, { wch: 14 }, { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, "6b) Facture - Exemple");

  const data = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  if (data instanceof ArrayBuffer) return data;
  if (data instanceof Uint8Array) return data.buffer as ArrayBuffer;
  return new Uint8Array(data as number[]).buffer as ArrayBuffer;
}
