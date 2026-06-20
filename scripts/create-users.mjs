/**
 * Script de création des utilisateurs de test Taxi Romontois
 * Usage: node scripts/create-users.mjs SERVICE_ROLE_KEY
 *
 * Remplacez SERVICE_ROLE_KEY par votre clé service_role Supabase
 */

const SUPABASE_URL = "https://nkzabpwuvcwilbyznvix.supabase.co";
const SERVICE_ROLE_KEY = process.argv[2] || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY || SERVICE_ROLE_KEY === "REMPLACER_PAR_SERVICE_ROLE_KEY") {
  console.error("❌ Fournissez la service_role key : node scripts/create-users.mjs eyJhbGci...");
  process.exit(1);
}

const headers = {
  "apikey": SERVICE_ROLE_KEY,
  "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

const USERS = [
  {
    email: "gestionnaire@taxi-romontois.ch",
    password: "Romont2024!",
    role: "gestionnaire",
    nom: "Dupont",
    prenom: "Jean",
    description: "Gestionnaire principal"
  },
  {
    email: "admin@taxi-romontois.ch",
    password: "Romont2024!",
    role: "admin",
    nom: "Admin",
    prenom: "Super",
    description: "Administrateur"
  },
  {
    email: "conducteur@taxi-romontois.ch",
    password: "Romont2024!",
    role: "conducteur",
    nom: "Aebischer",
    prenom: "Yvan",
    description: "Conducteur - Circuit Hélico"
  },
  {
    email: "mecanicien@taxi-romontois.ch",
    password: "Romont2024!",
    role: "mecanicien",
    nom: "Atelier",
    prenom: "Marc",
    description: "Mécanicien"
  },
  {
    email: "parent@taxi-romontois.ch",
    password: "Romont2024!",
    role: "parent",
    nom: "Martin",
    prenom: "Sophie",
    description: "Parent - Enfant Léa Martin"
  },
];

async function createUser(u) {
  // 1. Créer l'utilisateur auth
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email: u.email,
      password: u.password,
      email_confirm: true, // confirmer immédiatement sans email
      user_metadata: {
        role: u.role,
        nom: u.nom,
        prenom: u.prenom,
      },
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    if (data.message?.includes("already been registered")) {
      console.log(`⚠️  ${u.email} — déjà existant, on met à jour le profil`);
      // Récupérer l'id de l'utilisateur existant
      const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${u.email}`, { headers });
      const listData = await listRes.json();
      const existingUser = listData.users?.[0];
      if (existingUser) {
        await updateProfile(existingUser.id, u);
      }
      return;
    }
    throw new Error(`Erreur création ${u.email}: ${JSON.stringify(data)}`);
  }

  const userId = data.id;
  console.log(`✅ Utilisateur créé: ${u.email} (${u.description}) — ID: ${userId}`);

  // 2. Mettre à jour le profil avec le conducteur_id si applicable
  await updateProfile(userId, u);
}

async function updateProfile(userId, u) {
  // Chercher le conducteur_id correspondant si rôle conducteur
  let conducteur_id = null;
  if (u.role === "conducteur") {
    const searchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/conducteurs?nom=eq.${encodeURIComponent(u.nom)}&prenom=eq.${encodeURIComponent(u.prenom)}&select=id`,
      { headers }
    );
    const conducteurs = await searchRes.json();
    conducteur_id = conducteurs[0]?.id ?? null;
  }

  // Chercher l'enfant_id si rôle parent
  let enfant_id = null;
  if (u.role === "parent") {
    const searchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/enfants?parent_nom=eq.${encodeURIComponent(u.nom + " " + u.prenom)}&select=id`,
      { headers: { ...headers, "Prefer": "return=representation" } }
    );
    const enfants = await searchRes.json();
    enfant_id = enfants[0]?.id ?? null;
  }

  // Upsert le profil
  const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: "POST",
    headers: { ...headers, "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: userId,
      role: u.role,
      nom: u.nom,
      prenom: u.prenom,
      conducteur_id,
      enfant_id,
    }),
  });

  if (profileRes.ok) {
    console.log(`   📋 Profil mis à jour — rôle: ${u.role}${conducteur_id ? ` | conducteur_id: ${conducteur_id}` : ""}`);
  } else {
    const err = await profileRes.text();
    console.log(`   ⚠️  Profil — ${err.substring(0, 100)}`);
  }

  // Si conducteur, lier le user_id dans la table conducteurs
  if (u.role === "conducteur" && conducteur_id) {
    await fetch(`${SUPABASE_URL}/rest/v1/conducteurs?id=eq.${conducteur_id}`, {
      method: "PATCH",
      headers: { ...headers, "Prefer": "return=minimal" },
      body: JSON.stringify({ user_id: userId }),
    });
    console.log(`   🚌 conducteurs.user_id mis à jour`);
  }
}

async function main() {
  console.log("🚌 Taxi Romontois — Création des utilisateurs de test\n");
  console.log(`URL: ${SUPABASE_URL}`);
  console.log(`Clé: ${SERVICE_ROLE_KEY.substring(0, 30)}...\n`);

  for (const u of USERS) {
    try {
      await createUser(u);
    } catch (e) {
      console.error(`❌ Erreur pour ${u.email}:`, e.message);
    }
  }

  console.log("\n✅ Terminé ! Comptes de test :");
  console.log("━".repeat(60));
  USERS.forEach(u => {
    console.log(`${u.role.padEnd(14)} │ ${u.email.padEnd(38)} │ Romont2024!`);
  });
  console.log("━".repeat(60));
  console.log("\n👉 Ouvrez http://localhost:3000 et connectez-vous !");
}

main().catch(console.error);
