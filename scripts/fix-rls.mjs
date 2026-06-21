/**
 * Taxi Romontois — Diagnostic et correction RLS mécanicien
 * 1. Vérifie/corrige le profil mecanicien@taxi-romontois.ch
 * 2. Crée la fonction helper get_user_role()
 * 3. Active RLS et crée les policies pour tous les rôles
 * 4. Ajoute en_attente_validation à l'enum repair_status
 */

import { createClient } from "@supabase/supabase-js";
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

const URL_SB       = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!URL_SB || !SERVICE_KEY || !ACCESS_TOKEN) {
  console.error("❌ Variables manquantes dans .env.local"); process.exit(1);
}

const sb = createClient(URL_SB, SERVICE_KEY, { auth: { autoRefreshToken:false, persistSession:false } });
const projectRef = new URL(URL_SB).hostname.split(".")[0];
const MGMT = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

async function sql(label, query) {
  process.stdout.write(`  ${label}... `);
  const res = await fetch(MGMT, {
    method:"POST",
    headers:{ "Authorization":`Bearer ${ACCESS_TOKEN}`, "Content-Type":"application/json" },
    body: JSON.stringify({ query }),
  });
  let data; try { data = await res.json(); } catch { data = {}; }
  if (!res.ok || data?.error) {
    console.log(`❌\n    ${data?.message||data?.error||res.status}`);
    return false;
  }
  console.log("✅");
  return data;
}

console.log("\n🔍 Diagnostic + correction RLS mécanicien\n");

/* ══ 1. Vérifier et corriger le profil mécanicien ══════════════ */
console.log("── 1. Profil mecanicien@taxi-romontois.ch ──");

const { data: users } = await sb.auth.admin.listUsers({ perPage: 1000 });
const mecUser = users?.users?.find(u => u.email === "mecanicien@taxi-romontois.ch");

if (!mecUser) {
  console.log("  ❌ Utilisateur auth introuvable");
} else {
  console.log(`  Auth ID : ${mecUser.id}`);
  const { data: profile } = await sb.from("profiles").select("*").eq("id", mecUser.id).single();
  if (!profile) {
    console.log("  ⚠ Profil manquant → création...");
    const { error } = await sb.from("profiles").insert({
      id: mecUser.id, role: "mecanicien", nom: "Mehni", prenom: "Rachid"
    });
    console.log(error ? `  ❌ ${error.message}` : "  ✅ Profil créé");
  } else {
    console.log(`  Rôle actuel : ${profile.role}`);
    if (profile.role !== "mecanicien") {
      const { error } = await sb.from("profiles").update({ role: "mecanicien" }).eq("id", mecUser.id);
      console.log(error ? `  ❌ ${error.message}` : "  ✅ Rôle corrigé → mecanicien");
    } else {
      console.log("  ✅ Rôle correct");
    }
  }
}

/* ══ 2. Ajouter en_attente_validation à repair_status ══════════ */
console.log("\n── 2. Enum repair_status ──");
await sql("+ 'en_attente_validation'",
  `ALTER TYPE repair_status ADD VALUE IF NOT EXISTS 'en_attente_validation'`);

/* ══ 3. Fonction helper get_user_role() ════════════════════════ */
console.log("\n── 3. Fonction get_user_role() ──");
await sql("CREATE OR REPLACE", `
  CREATE OR REPLACE FUNCTION public.get_user_role()
  RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER AS $$
    SELECT COALESCE(role::text, '') FROM public.profiles WHERE id = auth.uid()
  $$
`);

/* ══ 4. RLS policies ════════════════════════════════════════════ */
console.log("\n── 4. RLS policies ──");

const tables = ["vehicules","reparations","alertes","incidents","conducteurs","circuits","profiles"];
for (const t of tables) {
  await sql(`ENABLE RLS ${t}`, `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
}

// Policies vehicules
await sql("vehicules SELECT staff",     `DROP POLICY IF EXISTS "staff_vehicules_select" ON vehicules`);
await sql("vehicules SELECT → create",  `
  CREATE POLICY "staff_vehicules_select" ON vehicules FOR SELECT USING (
    get_user_role() IN ('mecanicien','gestionnaire','admin','conducteur')
  )
`);
await sql("vehicules UPDATE staff",     `DROP POLICY IF EXISTS "staff_vehicules_update" ON vehicules`);
await sql("vehicules UPDATE → create",  `
  CREATE POLICY "staff_vehicules_update" ON vehicules FOR UPDATE USING (
    get_user_role() IN ('mecanicien','gestionnaire','admin')
  )
`);

// Policies reparations
for (const [name, op, clause] of [
  ["staff_reparations_select", "SELECT", "USING (get_user_role() IN ('mecanicien','gestionnaire','admin'))"],
  ["staff_reparations_insert", "INSERT", "WITH CHECK (get_user_role() IN ('mecanicien','gestionnaire','admin'))"],
  ["staff_reparations_update", "UPDATE", "USING (get_user_role() IN ('mecanicien','gestionnaire','admin'))"],
]) {
  await sql(`DROP ${name}`, `DROP POLICY IF EXISTS "${name}" ON reparations`);
  await sql(`CREATE ${name}`, `CREATE POLICY "${name}" ON reparations FOR ${op} ${clause}`);
}

// Policies alertes
for (const [name, op, clause] of [
  ["staff_alertes_select", "SELECT", "USING (get_user_role() IN ('mecanicien','gestionnaire','admin'))"],
  ["staff_alertes_insert", "INSERT", "WITH CHECK (get_user_role() IN ('mecanicien','gestionnaire','admin','conducteur'))"],
  ["staff_alertes_update", "UPDATE", "USING (get_user_role() IN ('mecanicien','gestionnaire','admin'))"],
]) {
  await sql(`DROP ${name}`, `DROP POLICY IF EXISTS "${name}" ON alertes`);
  await sql(`CREATE ${name}`, `CREATE POLICY "${name}" ON alertes FOR ${op} ${clause}`);
}

// Policies incidents
for (const [name, op, clause] of [
  ["staff_incidents_select", "SELECT", "USING (get_user_role() IN ('mecanicien','gestionnaire','admin','conducteur'))"],
  ["staff_incidents_insert", "INSERT", "WITH CHECK (get_user_role() IN ('mecanicien','gestionnaire','admin','conducteur'))"],
  ["staff_incidents_update", "UPDATE", "USING (get_user_role() IN ('gestionnaire','admin'))"],
]) {
  await sql(`DROP ${name}`, `DROP POLICY IF EXISTS "${name}" ON incidents`);
  await sql(`CREATE ${name}`, `CREATE POLICY "${name}" ON incidents FOR ${op} ${clause}`);
}

// Policies conducteurs et circuits (lecture pour tous les staff)
for (const table of ["conducteurs","circuits"]) {
  await sql(`DROP staff_${table}_select`, `DROP POLICY IF EXISTS "staff_${table}_select" ON ${table}`);
  await sql(`CREATE staff_${table}_select`, `
    CREATE POLICY "staff_${table}_select" ON ${table} FOR SELECT USING (
      get_user_role() IN ('mecanicien','gestionnaire','admin','conducteur','parent')
    )
  `);
}

// Profiles : chaque user lit son propre profil + staff voit tous
await sql("DROP profiles_own",  `DROP POLICY IF EXISTS "profiles_own_select" ON profiles`);
await sql("CREATE profiles_own",`
  CREATE POLICY "profiles_own_select" ON profiles FOR SELECT USING (
    auth.uid() = id OR get_user_role() IN ('gestionnaire','admin')
  )
`);
await sql("DROP profiles_upd",  `DROP POLICY IF EXISTS "profiles_own_update" ON profiles`);
await sql("CREATE profiles_upd",`
  CREATE POLICY "profiles_own_update" ON profiles FOR UPDATE USING (
    auth.uid() = id OR get_user_role() IN ('gestionnaire','admin')
  )
`);

/* ══ 5. Vérification finale ════════════════════════════════════ */
console.log("\n── 5. Vérification ──");

const pols = await fetch(MGMT, {
  method:"POST",
  headers:{ "Authorization":`Bearer ${ACCESS_TOKEN}`, "Content-Type":"application/json" },
  body: JSON.stringify({ query: `
    SELECT tablename, policyname, cmd
    FROM pg_policies
    WHERE tablename IN ('vehicules','reparations','alertes','incidents')
    ORDER BY tablename, cmd
  `}),
});
if (pols.ok) {
  const rows = await pols.json();
  const byTable = {};
  for (const r of rows) {
    if (!byTable[r.tablename]) byTable[r.tablename] = [];
    byTable[r.tablename].push(`${r.cmd}`);
  }
  for (const [t, cmds] of Object.entries(byTable)) {
    console.log(`  ${t}: ${cmds.join(", ")}`);
  }
}

const enumCheck = await fetch(MGMT, {
  method:"POST",
  headers:{ "Authorization":`Bearer ${ACCESS_TOKEN}`, "Content-Type":"application/json" },
  body: JSON.stringify({ query:`SELECT unnest(enum_range(NULL::repair_status))::text AS v`}),
});
if (enumCheck.ok) {
  const vals = await enumCheck.json();
  console.log(`  repair_status: ${vals.map(r => r.v).join(", ")}`);
}

console.log("\n✅ Correction RLS terminée !\n");
