/**
 * Taxi Romontois — Exécution automatique des migrations SQL
 * via l'API Management Supabase (sans passer par le SQL Editor)
 *
 * Prérequis : ajouter dans .env.local :
 *   SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxxxxxx
 *
 * Obtenir le token :
 *   https://supabase.com/dashboard/account/tokens → "Generate new token"
 */

import { readFileSync } from "fs";
import { resolve } from "path";

/* ── Charger .env.local ── */
try {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq > 0) {
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  }
} catch {}

const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ACCESS_TOKEN   = process.env.SUPABASE_ACCESS_TOKEN;

if (!SUPABASE_URL) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL manquant dans .env.local");
  process.exit(1);
}
if (!ACCESS_TOKEN) {
  console.error("❌ SUPABASE_ACCESS_TOKEN manquant dans .env.local\n");
  console.error("   1. Aller sur : https://supabase.com/dashboard/account/tokens");
  console.error('   2. Cliquer "Generate new token" → copier le token (commence par sbp_)');
  console.error("   3. Ajouter dans .env.local :");
  console.error("      SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n");
  process.exit(1);
}

/* ── Config ── */
const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
const API_URL    = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

/* ── Exécuter une requête SQL via l'API Management ── */
async function sql(label, query) {
  process.stdout.write(`  ${label}... `);
  const res = await fetch(API_URL, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${ACCESS_TOKEN}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({ query }),
  });

  let data;
  try { data = await res.json(); } catch { data = {}; }

  if (!res.ok) {
    const msg = data?.message || data?.error || JSON.stringify(data);
    console.log(`❌\n    HTTP ${res.status}: ${msg}`);
    return false;
  }
  if (data?.error) {
    console.log(`❌\n    ${data.error}`);
    return false;
  }
  console.log("✅");
  return true;
}

/* ══════════════════════════════════════════════════════════════
   MIGRATION
   ══════════════════════════════════════════════════════════════ */
console.log("\n🔧 Migration — Workflow mécanicien Taxi Romontois");
console.log(`   Projet : ${projectRef}\n`);

let ok = true;

/* 1. Étendre l'enum vehicle_state ───────────────────────────── */
console.log("── 1. Enum vehicle_state : nouvelles valeurs ──");
for (const val of ["en_service","receptionne","en_attente_piece","en_reparation","repare"]) {
  ok &= await sql(
    `+ '${val}'`,
    `ALTER TYPE vehicle_state ADD VALUE IF NOT EXISTS '${val}'`
  );
}

/* 2. Migrer les états véhicules ─────────────────────────────── */
console.log("\n── 2. Migration états véhicules ──");
ok &= await sql("bon → en_service",    `UPDATE vehicules SET etat = 'en_service'    WHERE etat = 'bon'`);
ok &= await sql("atelier → en_reparation", `UPDATE vehicules SET etat = 'en_reparation' WHERE etat = 'atelier'`);

/* 3. Nouvelles colonnes dans reparations ────────────────────── */
console.log("\n── 3. Nouvelles colonnes — table reparations ──");
const cols = [
  ["date_reception",               "DATE"],
  ["km_reception",                 "INTEGER"],
  ["piece_nom",                    "TEXT"],
  ["piece_fournisseur",            "TEXT"],
  ["date_commande_piece",          "DATE"],
  ["date_reception_piece_estimee", "DATE"],
  ["date_reception_piece_reelle",  "DATE"],
  ["date_debut_reparation",        "DATE"],
  ["type_intervention",            "TEXT"],
  ["nom_garage",                   "TEXT"],
  ["cout_estime",                  "NUMERIC(10,2)"],
  ["date_fin_reparation",          "DATE"],
  ["km_sortie",                    "INTEGER"],
  ["commentaire_mecanicien",       "TEXT"],
  ["date_remise_circulation",      "DATE"],
];
for (const [col, type] of cols) {
  ok &= await sql(`+ ${col}`, `ALTER TABLE reparations ADD COLUMN IF NOT EXISTS ${col} ${type}`);
}

/* 4. Colonne notes dans vehicules ───────────────────────────── */
console.log("\n── 4. Colonne notes — table vehicules ──");
ok &= await sql("+ notes", `ALTER TABLE vehicules ADD COLUMN IF NOT EXISTS notes TEXT`);

/* 5. Étendre l'enum repair_status avec les nouvelles valeurs ── */
console.log("\n── 5. Enum repair_status : nouvelles valeurs ──");
for (const val of ["receptionne","en_reparation","remis_en_circulation","annulee"]) {
  ok &= await sql(`+ '${val}'`, `ALTER TYPE repair_status ADD VALUE IF NOT EXISTS '${val}'`);
}

/* 6. Migrer les statuts de réparation ───────────────────────── */
// Cast ::text dans le WHERE pour comparer sans risque d'enum invalide
console.log("\n── 6. Migration statuts réparations ──");
ok &= await sql("signalee/en_attente_validation → receptionne",
  `UPDATE reparations SET statut = 'receptionne' WHERE statut::text IN ('signalee','en_attente_validation')`);
ok &= await sql("en_cours → en_reparation",
  `UPDATE reparations SET statut = 'en_reparation' WHERE statut::text = 'en_cours'`);
ok &= await sql("termine → remis_en_circulation",
  `UPDATE reparations SET statut = 'remis_en_circulation' WHERE statut::text = 'termine'`);
ok &= await sql("refusee → annulee",
  `UPDATE reparations SET statut = 'annulee' WHERE statut::text = 'refusee'`);

/* 7. Vérification ───────────────────────────────────────────── */
console.log("\n── 7. Vérification ──");
// Afficher aussi les valeurs de repair_status
const rsCheck = await fetch(API_URL, {
  method: "POST",
  headers: { "Authorization": `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: `SELECT unnest(enum_range(NULL::repair_status))::text AS valeur` }),
});
if (rsCheck.ok) {
  const vals = await rsCheck.json();
  const list = vals.map(r => r.valeur).join(", ");
  console.log(`  repair_status enum : ${list}`);
}

const vCheck = await fetch(API_URL, {
  method: "POST",
  headers: { "Authorization": `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: `SELECT unnest(enum_range(NULL::vehicle_state))::text AS valeur` }),
});
if (vCheck.ok) {
  const vals = await vCheck.json();
  const list = vals.map(r => r.valeur).join(", ");
  console.log(`  vehicle_state enum : ${list}`);
}

const cCheck = await fetch(API_URL, {
  method: "POST",
  headers: { "Authorization": `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: `SELECT column_name FROM information_schema.columns WHERE table_name = 'reparations' AND column_name IN ('date_reception','km_sortie','commentaire_mecanicien','date_remise_circulation') ORDER BY column_name` }),
});
if (cCheck.ok) {
  const cols2 = await cCheck.json();
  const found = cols2.map(r => r.column_name).join(", ");
  console.log(`  Colonnes vérifiées : ${found}`);
}

/* ── Résultat final ── */
console.log(ok
  ? "\n✅ Migration terminée avec succès !\n"
  : "\n⚠️  Migration terminée avec des erreurs (voir ci-dessus)\n"
);
