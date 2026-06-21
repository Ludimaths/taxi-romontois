/**
 * Taxi Romontois — Création automatique de tous les comptes
 * Usage : node scripts/create-all-accounts.mjs
 * Output : scripts/comptes-taxi-romontois.html  (à imprimer → PDF)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Variables manquantes dans .env.local");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/* ══════════════════════════════════════════════════════════════
   ▼▼▼  CONFIGURER ICI LES COMPTES MANUELS  ▼▼▼
   ══════════════════════════════════════════════════════════════ */
const COMPTES_MANUELS = [
  {
    // ← Remplacer par le prénom/nom réel de l'administrateur (vous)
    prenom: "Alban",
    nom:    "Wachowiak",
    email:  "admin@taxi-romontois.ch",
    role:   "admin",
  },
  {
    // ← Remplacer par le prénom/nom réel du gestionnaire (votre frère)
    prenom: "Anes",
    nom:    "Akiki",
    email:  "gestionnaire@taxi-romontois.ch",
    role:   "gestionnaire",
  },
  {
    // ← Remplacer par le prénom/nom réel du mécanicien
    prenom: "Rachid",
    nom:    "Mehni",
    email:  "mecanicien@taxi-romontois.ch",
    role:   "mecanicien",
  },
];
/* ══════════════════════════════════════════════════════════════ */

/* ── Helpers ── */
function removeAccents(str) {
  return String(str)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")  // diacritiques: é→e, è→e, ç→c…
    .replace(/[''`]/g,  "")            // apostrophes
    .replace(/[\s\-_]/g, ".")          // espaces et tirets → point
    .replace(/[^a-zA-Z0-9.]/g, "")    // autres chars non-alphanumériques
    .replace(/\.{2,}/g, ".")           // double points → un seul
    .replace(/^\.+|\.+$/g, "")        // trim points
    .toLowerCase();
}

function makeEmail(prenom, nom) {
  return `${removeAccents(prenom)}.${removeAccents(nom)}@taxi-romontois.ch`;
}

function makePassword() {
  const lower   = "abcdefghjkmnpqrstuvwxyz";
  const upper   = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const digits  = "23456789";
  const special = "!@#%*";
  const pool    = lower + upper + digits + special;
  // Au moins 1 de chaque catégorie
  let pw = [
    lower  [Math.floor(Math.random() * lower.length)],
    upper  [Math.floor(Math.random() * upper.length)],
    digits [Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];
  for (let i = 4; i < 10; i++) {
    pw.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  // Mélange aléatoire
  for (let i = pw.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pw[i], pw[j]] = [pw[j], pw[i]];
  }
  return pw.join("");
}

/* ── Créer un compte Supabase ── */
async function createUser({ email, prenom, nom, role, conducteur_id = null }) {
  const password = makePassword();

  // Vérifier si l'email existe déjà
  const { data: existing } = await supabase.auth.admin.listUsers();
  const exists = existing?.users?.find(u => u.email === email);

  if (exists) {
    // Mettre à jour le profil si conducteur_id manque
    const { data: prof } = await supabase.from("profiles").select("conducteur_id").eq("id", exists.id).single();
    if (conducteur_id && !prof?.conducteur_id) {
      await supabase.from("profiles").update({ conducteur_id }).eq("id", exists.id);
    }
    return { email, prenom, nom, role, password: "—", status: "exists", user_id: exists.id };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { prenom, nom, role },
  });

  if (error) {
    return { email, prenom, nom, role, password: "—", status: "error", error: error.message };
  }

  await supabase.from("profiles").upsert({
    id:      data.user.id,
    role,
    nom,
    prenom,
    ...(conducteur_id ? { conducteur_id } : {}),
  }, { onConflict: "id" });

  return { email, prenom, nom, role, password, status: "created", user_id: data.user.id };
}

/* ── Générer HTML imprimable ── */
function esc(s) {
  return String(s ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

const ROLE_LABELS = {
  conducteur:   "🚌 Conducteur",
  gestionnaire: "👔 Gestionnaire",
  admin:        "⚙️ Admin",
  mecanicien:   "🔧 Mécanicien",
};
const ROLE_COLORS = {
  conducteur: "#0D3B7A", gestionnaire: "#7C3AED", admin: "#DC2626", mecanicien: "#059669",
};

function generateHTML(accounts) {
  const date = new Date().toLocaleDateString("fr-CH", {
    day: "numeric", month: "long", year: "numeric",
  });

  // Groupes
  const manuel = accounts.filter(a => a.role !== "conducteur");
  const conds  = accounts.filter(a => a.role === "conducteur");

  const renderRows = (list) => list.map((a, i) => `
    <tr style="background:${i%2===0?"#fff":"#F8FAFC"}">
      <td style="font-weight:700">${esc(a.nom.toUpperCase())}</td>
      <td>${esc(a.prenom)}</td>
      <td style="font-family:monospace;font-size:12px;color:#0D3B7A">${esc(a.email)}</td>
      <td style="font-family:'Courier New',monospace;font-weight:800;letter-spacing:1px;
          background:#EFF6FF;color:#1E3A5F;padding:6px 10px;border-radius:4px">
        ${a.status === "exists" ? '<em style="color:#94A3B8;font-weight:400">Compte existant</em>' : esc(a.password)}
      </td>
      <td style="color:${ROLE_COLORS[a.role]??'#333'};font-weight:700">${ROLE_LABELS[a.role]??a.role}</td>
      <td style="font-size:12px;font-weight:700;color:${
        a.status==="created"?"#16A34A":a.status==="exists"?"#D97706":"#DC2626"
      }">
        ${a.status==="created"?"✅ Créé":a.status==="exists"?"⚠ Existant":"❌ Erreur"}
      </td>
    </tr>
  `).join("");

  const created = accounts.filter(a=>a.status==="created").length;
  const existed = accounts.filter(a=>a.status==="exists").length;
  const errors  = accounts.filter(a=>a.status==="error").length;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Comptes Taxi Romontois — ${date}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:Arial,Helvetica,sans-serif; font-size:13px; color:#1E293B; background:#F1F5F9; }
  .page { max-width:1100px; margin:0 auto; background:#fff; padding:32px; }

  header { display:flex; align-items:center; justify-content:space-between;
    border-bottom:3px solid #0D3B7A; padding-bottom:20px; margin-bottom:28px; }
  header h1 { font-size:22px; font-weight:900; color:#0D3B7A; }
  header p  { font-size:12px; color:#64748B; margin-top:5px; }
  .header-right { text-align:right; font-size:12px; color:#64748B; line-height:1.7; }
  .header-right strong { font-size:16px; color:#DC2626; display:block; }

  .alert { background:#FEF2F2; border:2px solid #FECACA; border-radius:10px;
    padding:14px 18px; margin-bottom:24px; color:#DC2626; }
  .alert strong { display:block; font-size:14px; font-weight:800; margin-bottom:4px; }
  .alert span { font-size:13px; color:#1E293B; font-weight:700; }

  h2 { font-size:15px; font-weight:800; color:#0D3B7A; margin:28px 0 12px;
    padding-bottom:6px; border-bottom:1px solid #E2E8F0; }
  h2:first-of-type { margin-top:0; }

  table { width:100%; border-collapse:collapse; border-radius:10px; overflow:hidden;
    box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:12px; }
  thead tr { background:#0D3B7A; }
  thead th { padding:11px 14px; color:#fff; text-align:left; font-size:11px;
    text-transform:uppercase; letter-spacing:.5px; font-weight:700; }
  tbody td { padding:10px 14px; border-bottom:1px solid #E2E8F0;
    vertical-align:middle; font-size:13px; }

  .summary { display:flex; gap:14px; margin-top:24px; }
  .sum-box { flex:1; border-radius:10px; padding:16px; text-align:center; border:1px solid #E2E8F0; }
  .sum-box .val { font-size:30px; font-weight:900; }
  .sum-box .lbl { font-size:11px; color:#64748B; margin-top:3px; }

  footer { margin-top:28px; padding-top:14px; border-top:1px solid #E2E8F0;
    font-size:11px; color:#94A3B8; text-align:center; }

  @media print {
    body { background:#fff; font-size:11px; }
    .page { padding:12px; box-shadow:none; max-width:100%; }
    h2 { margin:18px 0 8px; }
    .no-print { display:none; }
    thead tr { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .alert  { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .sum-box{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    table { page-break-inside:auto; }
    tr    { page-break-inside:avoid; }
    @page { size:A4 landscape; margin:12mm; }
  }
</style>
</head>
<body>
<div class="page">

  <header>
    <div>
      <h1>🚌 Taxi Romontois — Accès plateforme</h1>
      <p>Généré le ${date} · Document confidentiel</p>
    </div>
    <div class="header-right">
      <strong>🔐 CONFIDENTIEL</strong>
      À distribuer individuellement<br>
      Ne pas envoyer par e-mail<br>
      <span style="font-family:monospace;font-size:11px;color:#0D3B7A">
        https://taxi-romontois.onrender.com/login
      </span>
    </div>
  </header>

  <div class="alert">
    <strong>⚠ Document confidentiel — À lire avant distribution</strong>
    Ces identifiants sont personnels et à usage unique. Chaque utilisateur doit changer son mot de passe
    dès la première connexion. En cas de perte, contacter l'administrateur.
    <br><span>URL de connexion : https://taxi-romontois.onrender.com/login</span>
  </div>

  <h2>👔 Comptes Administration & Encadrement</h2>
  <table>
    <thead>
      <tr>
        <th>Nom</th><th>Prénom</th><th>E-mail</th>
        <th>Mot de passe initial</th><th>Rôle</th><th>Statut</th>
      </tr>
    </thead>
    <tbody>${renderRows(manuel)}</tbody>
  </table>

  <h2>🚌 Comptes Conducteurs (${conds.length})</h2>
  <table>
    <thead>
      <tr>
        <th>Nom</th><th>Prénom</th><th>E-mail</th>
        <th>Mot de passe initial</th><th>Rôle</th><th>Statut</th>
      </tr>
    </thead>
    <tbody>${renderRows(conds)}</tbody>
  </table>

  <div class="summary">
    <div class="sum-box" style="background:#EFF6FF;border-color:#BFDBFE">
      <div class="val" style="color:#0D3B7A">${created}</div>
      <div class="lbl">Comptes créés</div>
    </div>
    <div class="sum-box" style="background:#FFFBEB;border-color:#FDE68A">
      <div class="val" style="color:#D97706">${existed}</div>
      <div class="lbl">Déjà existants</div>
    </div>
    ${errors > 0 ? `<div class="sum-box" style="background:#FEF2F2;border-color:#FECACA">
      <div class="val" style="color:#DC2626">${errors}</div>
      <div class="lbl">Erreurs</div>
    </div>` : ""}
    <div class="sum-box" style="background:#DCFCE7;border-color:#86EFAC">
      <div class="val" style="color:#16A34A">${accounts.length}</div>
      <div class="lbl">Total comptes</div>
    </div>
  </div>

  <div class="no-print" style="margin-top:24px;text-align:center">
    <button onclick="window.print()"
      style="padding:14px 32px;background:#0D3B7A;color:#fff;border:none;
        border-radius:10px;font-size:16px;font-weight:700;cursor:pointer">
      🖨 Imprimer / Enregistrer en PDF
    </button>
    <p style="margin-top:10px;font-size:12px;color:#64748B">
      Ctrl+P → Enregistrer en PDF → Format A4 paysage
    </p>
  </div>

  <footer>
    Taxi Romontois · Plateforme de gestion transport scolaire
    · Généré le ${date} · Total : ${accounts.length} comptes
  </footer>
</div>
</body>
</html>`;
}

/* ── MAIN ── */
console.log("🚌 Taxi Romontois — Création des comptes\n");
console.log("══════════════════════════════════════════\n");

const allAccounts = [];

// 1. Comptes manuels
console.log("── Comptes admin / gestionnaire / mécanicien ──");
for (const c of COMPTES_MANUELS) {
  process.stdout.write(`  ${c.prenom} ${c.nom} (${c.role}) → ${c.email} ... `);
  const result = await createUser(c);
  allAccounts.push(result);
  if (result.status === "created") console.log(`✅  mdp: ${result.password}`);
  else if (result.status === "exists") console.log("⚠  compte existant");
  else console.log(`❌  ${result.error}`);
}

// 2. Conducteurs depuis la DB
console.log("\n── Conducteurs ──");
const { data: conducteurs, error: condErr } = await supabase
  .from("conducteurs").select("id, nom, prenom").order("nom");
if (condErr) { console.error("❌ Erreur:", condErr.message); process.exit(1); }
console.log(`   ${conducteurs.length} conducteurs trouvés\n`);

for (const c of conducteurs) {
  const email = makeEmail(c.prenom, c.nom);
  process.stdout.write(`  ${c.prenom} ${c.nom} → ${email} ... `);
  const result = await createUser({ email, prenom: c.prenom, nom: c.nom, role: "conducteur", conducteur_id: c.id });
  allAccounts.push(result);
  if (result.status === "created") console.log(`✅  mdp: ${result.password}`);
  else if (result.status === "exists") console.log("⚠  existant");
  else console.log(`❌  ${result.error}`);
}

// 3. Résumé
const created = allAccounts.filter(a => a.status === "created").length;
const existed = allAccounts.filter(a => a.status === "exists").length;
const errors  = allAccounts.filter(a => a.status === "error").length;

console.log("\n══════════════════════════════════════════");
console.log(`✅ ${created} comptes créés`);
console.log(`⚠  ${existed} comptes déjà existants`);
if (errors > 0) console.log(`❌ ${errors} erreurs`);

// 4. Générer HTML
const html = generateHTML(allAccounts);
const outputPath = resolve(process.cwd(), "scripts", "comptes-taxi-romontois.html");
writeFileSync(outputPath, html, "utf8");

console.log(`\n📄 Fichier généré : scripts/comptes-taxi-romontois.html`);
console.log("   → Ouvrir dans le navigateur");
console.log("   → Ctrl+P → Enregistrer en PDF (format A4 paysage)");
console.log("\nTerminé !");

