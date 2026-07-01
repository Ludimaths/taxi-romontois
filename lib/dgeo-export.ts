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
  numFacture: string;
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
    // Exclure week-end
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      jours.push(d.toISOString().slice(0, 10));
    }
    d.setDate(d.getDate() + 1);
  }
  return jours;
}

export function genererFactureDGEO(p: DGEOParams): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const joursOuvres = joursDuMois(p.annee, p.mois);

  // Élèves de cette école
  const elevesEcole = p.eleves.filter(e => e.ecole_id === p.ecole.id && e.actif);
  const elevesEcoleIds = new Set(elevesEcole.map(e => e.id));

  // Prises en charge du mois pour cette école
  const prisesEcole = p.prises.filter(pc => {
    const [a, m] = pc.date.split("-").map(Number);
    return a === p.annee && m === p.mois && elevesEcoleIds.has(pc.eleve_id);
  });

  // Lignes tournées pour cette école
  const lignes: LigneTournee[] = p.tournees
    .filter(t => t.ecole_id === p.ecole.id && t.actif)
    .map(t => {
      // Jours correspondant à ce jour de la semaine dans le mois (1=lun…7=dim)
      const joursTournee = joursOuvres.filter(j => {
        const dow = new Date(j + "T00:00:00").getDay();
        const dowISO = dow === 0 ? 7 : dow;
        return dowISO === t.jour_semaine;
      });
      const nbTournees = joursTournee.length;

      // Compter les élèves totaux du circuit ce jour (toutes écoles)
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

  // Calculs
  const rows: (string | number)[][] = [];

  // ── En-tête entreprise ──────────────────────────────────────
  rows.push(["TAXI ROMONTOIS SA", "", "", "", "", "", "", "", ""]);
  rows.push([p.params.adresse ?? "", "", "", "", "", "", "", "", ""]);
  rows.push([`Tél : ${p.params.telephone ?? ""}  |  TVA : ${p.params.tva ?? ""}  |  IBAN : ${p.params.iban ?? ""}`,
    "", "", "", "", "", "", "", ""]);
  rows.push(["", "", "", "", "", "", "", "", ""]);

  // ── En-tête école ───────────────────────────────────────────
  rows.push([`Établissement : ${p.ecole.nom}`, "", "", "", "", "", "", "", ""]);
  rows.push([`Adresse : ${p.ecole.adresse ?? ""}`, "", "", "", "", "", "", "", ""]);
  rows.push([`Responsable facturation : ${p.ecole.nom_responsable_facturation ?? ""}`, "", "", "", "", "", "", "", ""]);
  rows.push([`Email : ${p.ecole.email ?? ""}`, "", "", "", "", "", "", "", ""]);
  rows.push(["", "", "", "", "", "", "", "", ""]);

  // ── Infos facture ───────────────────────────────────────────
  rows.push([`N° facture : ${p.numFacture}`, "", `Mois : ${fmtMois(p.mois, p.annee)}`, "", `Lot : ${p.ecole.lot ?? ""}`, "", "", "", ""]);
  rows.push(["", "", "", "", "", "", "", "", ""]);

  // ── En-têtes tableau ────────────────────────────────────────
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
      l.nom,
      l.nbTournees,
      l.km,
      l.dureeMin,
      l.prixKm,
      l.prixHeure,
      l.totalEleves,
      l.elevesEcole,
      Math.round(partEcole * 100) / 100,
    ]);
  }

  rows.push(["", "", "", "", "", "", "", "", ""]);

  // ── Totaux ──────────────────────────────────────────────────
  const tva = Math.round(totalHT * 0.081 * 100) / 100;
  const totalTTC = Math.round((totalHT + tva) * 100) / 100;

  rows.push(["", "", "", "", "", "", "", "Total HT (CHF)", Math.round(totalHT * 100) / 100]);
  rows.push(["", "", "", "", "", "", "", "TVA 8.1% (CHF)", tva]);
  rows.push(["", "", "", "", "", "", "", "Total TTC (CHF)", totalTTC]);
  rows.push(["", "", "", "", "", "", "", "", ""]);
  rows.push(["Paiement à 30 jours dès réception de la facture.", "", "", "", "", "", "", "", ""]);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Largeurs colonnes
  ws["!cols"] = [
    { wch: 40 }, { wch: 12 }, { wch: 13 }, { wch: 12 },
    { wch: 10 }, { wch: 11 }, { wch: 22 }, { wch: 14 }, { wch: 18 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Annexe 6b");
  const data = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  if (data instanceof ArrayBuffer) return data;
  if (data instanceof Uint8Array) return data.buffer as ArrayBuffer;
  return new Uint8Array(data as number[]).buffer as ArrayBuffer;
}
