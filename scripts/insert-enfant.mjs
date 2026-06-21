import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Charger .env.local (sans dépendance dotenv)
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
} catch {
  // .env.local absent : on continue avec les variables d'environnement système
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Variables manquantes dans .env.local :");
  console.error("   NEXT_PUBLIC_SUPABASE_URL");
  console.error("   SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 1. Trouver le user_id du parent
const { data: usersData, error: usersErr } = await supabase.auth.admin.listUsers();
if (usersErr) { console.error("listUsers:", usersErr.message); process.exit(1); }

const parentUser = usersData.users.find(u => u.email === "parent@taxi-romontois.ch");
if (!parentUser) { console.error("Compte parent@taxi-romontois.ch introuvable"); process.exit(1); }
console.log("✅ Parent user_id :", parentUser.id);

// 2. Trouver le cercle_id de Mérine
const { data: cercles, error: cercleErr } = await supabase
  .from("cercles_scolaires").select("id, nom");
if (cercleErr) { console.error("cercles_scolaires:", cercleErr.message); process.exit(1); }

const cercle = cercles.find(c =>
  c.nom.toLowerCase().includes("mérine") || c.nom.toLowerCase().includes("merine")
);
const cercleId = cercle?.id ?? null;
console.log("cercle_id utilisé :", cercleId, cercle?.nom ?? "(aucun)");

// 3. Insérer l'enfant
const { data: enfant, error: enfantErr } = await supabase
  .from("enfants")
  .insert({
    nom:            "Martin",
    prenom:         "Léa",
    circuit_id:     "C001",
    cercle_id:      cercleId,
    parent_nom:     "Martin",
    parent_tel:     "079 111 22 33",
    adresse_mere:   "Rue des Fleurs 4, 1680 Romont",
    adresse_pere:   "Route du Lac 12, 1680 Romont",
    parent_user_id: parentUser.id,
  })
  .select()
  .single();

if (enfantErr) { console.error("INSERT enfant:", enfantErr.message); process.exit(1); }
console.log("✅ Enfant créé — id :", enfant.id, `(${enfant.prenom} ${enfant.nom})`);

// 4. Lier le profil parent
const { error: profErr } = await supabase
  .from("profiles")
  .update({ enfant_id: enfant.id })
  .eq("id", parentUser.id);

if (profErr) { console.error("UPDATE profiles:", profErr.message); process.exit(1); }
console.log("✅ Profil parent mis à jour avec enfant_id =", enfant.id);
console.log("Terminé !");
