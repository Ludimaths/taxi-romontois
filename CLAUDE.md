@AGENTS.md

# Taxi Romontois — Contexte projet complet

## Vue d'ensemble

Application de gestion de transport scolaire pour **Taxi Romontois** (Fribourg, Suisse). Gère les conducteurs, véhicules, circuits, enfants, incidents, absences et remplacements. Interface multi-rôle avec tableau de bord temps réel.

---

## Stack technique

| Outil | Version |
|---|---|
| Next.js | **16.2.9** (App Router — voir AGENTS.md, breaking changes) |
| React | 19.2.4 |
| TypeScript | 5.x |
| Supabase JS | 2.108.x (`@supabase/ssr` 0.12.x) |
| Tailwind CSS | 4.x (installé mais **non utilisé** dans les composants rédigés) |

Le projet utilise **exclusivement des inline styles** (`style={{...}}`), jamais de classes Tailwind dans les composants. Ne pas introduire de classes CSS externes.

---

## Supabase — Credentials
`​`​`
SUPABASE_URL=voir .env.local
SUPABASE_ANON_KEY=voir .env.local
SUPABASE_SERVICE_KEY=voir .env.local
ACCESS_TOKEN=voir .env.local
`​`​`

---
## Structure des fichiers

```
app/
  page.tsx                          → Redirect login ou rôle
  login/page.tsx                    → Connexion
  (protected)/
    layout.tsx                      → Vérifie auth + charge profil (server)
    ProtectedLayoutClient.tsx       → Sidebar desktop + header mobile
    gestionnaire/
      page.tsx                      → Dashboard (6 métriques + panels urgents)
      rapport/page.tsx              → Rapport journalier/semaine/mois
      imprevus/page.tsx             → Envoi d'imprévus ciblés
      conducteurs/page.tsx
      vehicules/page.tsx
      circuits/page.tsx
      incidents/page.tsx
      alertes/page.tsx
      export/page.tsx
    conducteur/
      page.tsx                      → Tableau de bord conducteur (6 tabs)
      vehicules/page.tsx            → Fiche véhicule QR
    mecanicien/page.tsx             → Atelier & flotte
    admin/
      page.tsx / conducteurs / vehicules / qrcodes / export
    parent/page.tsx
  scan/[vehicleId]/page.tsx         → Scan QR véhicule

components/
  Sidebar.tsx                       → Sidebar desktop gestionnaire (12 onglets)
  ui/index.tsx                      → Composants UI partagés

lib/
  types.ts                          → Tous les types TypeScript
  constants.ts                      → C couleurs, circuits, véhicules, helpers
  supabase/client.ts                → createClient() browser
  supabase/server.ts                → createClient() server
```

---

## Rôles et routing

| Rôle | Page principale | Sidebar |
|---|---|---|
| `gestionnaire` | `/gestionnaire` | Oui — 12 onglets |
| `conducteur` | `/conducteur` | Non — header mobile |
| `mecanicien` | `/mecanicien` | Non |
| `admin` | `/admin` | Oui |
| `parent` | `/parent` | Non |

Le rôle vient de `profiles.role`. Après login, `ProtectedLayoutClient` reçoit le profil en prop.

---

## Sidebar gestionnaire (12 onglets exacts, dans cet ordre)

```typescript
{ path: "/gestionnaire",             label: "Tableau de bord",   icon: "🏠" },
{ path: "/gestionnaire/rapport",     label: "Rapport journalier",icon: "📋" },
{ path: "/gestionnaire/imprevus",    label: "Imprévus",          icon: "⚡" },
{ path: "/gestionnaire/conducteurs", label: "Conducteurs",       icon: "👤" },
{ path: "/gestionnaire/vehicules",   label: "Véhicules",         icon: "🚌" },
{ path: "/gestionnaire/circuits",    label: "Circuits",          icon: "🛣️" },
{ path: "/gestionnaire/parents",     label: "Parents",           icon: "👪" },
{ path: "/gestionnaire/incidents",   label: "Incidents",         icon: "🚨" },
{ path: "/gestionnaire/alertes",     label: "Alertes",           icon: "🔔" },
{ path: "/gestionnaire/reparations", label: "Réparations",       icon: "🔧" },
{ path: "/gestionnaire/export",      label: "Exports",           icon: "📊" },
{ path: "/gestionnaire/messages",    label: "Messages",          icon: "💬" },
```

---

## Tables Supabase

### `profiles`
- `id` uuid (FK auth.users) — `role` — `nom` — `prenom` — `tel` — `conducteur_id` int — `enfant_id` int — `civilite` (mere/pere)

### `conducteurs`
- `id` int — `nom` / `prenom` — `tel` — `affectation` — `cercle_id` — `circuit_id` text — `vehicule_id` text — `photo_initials` — `permis` / `permis_exp` — `tachygraphe` bool — `status` — `absence_motif` — `notes`

**DriverStatus** : `en_service | disponible | absent | en_attente | termine`

### `vehicules`
- `id` text (ex: "FR-80058") — `plaque` — `marque` / `modele` — `places` / `places_handi` — `etat` — `circuit_id` — `conducteur_id` — `ct_date` / `assurance_date` — `km` — `qr_token` uuid

**IMPORTANT — etat en DB** : `"bon"` / `"atelier"` / `"attention"` (pas les valeurs du type TS `VehicleState`). Toujours caster : `(v.etat as string) === "bon"`.

### `circuits`
- `id` text (ex: "C007") — `nom` — `emoji` — `num` — `cercle_id` — `enfants_count` — `km_aller`

### `cercles_scolaires`
- `id` int — `nom`

### `enfants`
- `id` int — `nom` / `prenom` — `circuit_id` — `cercle_id` — `parent_nom` / `parent_tel` — `adresse_mere` / `adresse_pere` — `parent_user_id`

### `absences_enfants`
- `id` — `enfant_id` — `circuit_id` — `date_absence` — `reason` — `reported_by` — `reported_at` — `read_by_gestionnaire` bool — `transmitted_to_driver` bool — `read_by_driver` bool

### `absences_conducteurs`
- `id` — `conducteur_id` — `remplacant_id` — `circuit_id` — `date_absence` — `motif` — `status` (non_couvert / couvert) — `created_at`

### `service_logs`
- `id` — `conducteur_id` — `vehicule_id` — `circuit_id` — `date_service` date — `heure_debut` time — `heure_fin` time — `status` — `is_replacement` bool — `replacement_name` text — `notes`

**Workflow remplacement — 2 entrées créées simultanément :**
- Absent : `conducteur_id:absentId`, `status:"absent"`, `notes:"Absent — Remplacé par Prénom Nom"`
- Remplaçant : `conducteur_id:replacerId`, `is_replacement:true`, `replacement_name:"Prénom Nom absent"`, `status:"en_service"`

### `incidents`
- `id` — `type` (panne / voyant / accident / retard / degradation / enfant / parent / autre) — `vehicule_id` — `conducteur_id` — `circuit_id` — `description` — `status` (en_attente / en_cours / resolu) — `response` — `reported_at` — `resolved_at`

### `alertes`
- `id` — `type` — `severity` (normale / haute / critique) — `message` — `read` bool — `read_at` — `driver_id` int (FK conducteurs) — `vehicle_id` text — `created_at`

**Types d'alertes :**

| Type | Destinataire | Usage |
|---|---|---|
| `conducteur` | gestionnaire/admin | Prise/fin service, absence signalée |
| `vehicule` | gestionnaire/admin | Problème véhicule |
| `reparation` | gestionnaire/admin | Suivi réparation |
| `transmis_meca` | **mécanicien** | Incident ou imprévu transmis depuis gestionnaire |
| `rapport_admin` | admin | Rapports |
| `remplacement` | **conducteur** (`driver_id`) | Notification au remplaçant désigné |
| `imprévu` | conducteur/staff | Envoyé depuis onglet Imprévus |

### `reparations`
Workflow statuts : `receptionne → en_attente_validation → en_attente_piece → en_reparation → repare → remis_en_circulation`

### `conges_demandes`
- `id` — `conducteur_id` — `date_debut` — `date_fin` — `motif` — `justification` — `statut` — `note_gestionnaire` — `motif_refus` — `created_at` — `updated_at`

Demandes de congé conducteur (onglet Congés). Validées/refusées par le gestionnaire et l'admin.

### `messages_internes`
- `id` — `expediteur_id` — `expediteur_nom` — `expediteur_role` — `destinataire_role` — `message` — `lu` — `created_at`

Messagerie directe entre rôles (composant `MessagerieBox`). Présente dans les onglets Messages de chaque rôle.

---

## RLS Supabase (vérifié, correct, ne pas modifier)

- `alertes_read_conducteur_own` : conducteur lit ses propres alertes (`driver_id` match)
- `alertes_read_mecanicien` : mécanicien lit types `vehicule / reparation / validation_requise / remise_circulation / transmis_meca`
- `staff_alertes_select` : gestionnaire / mécanicien / admin lisent tout

Le lien gestionnaire → mécanicien via `transmis_meca` est **déjà couvert**. Rien à changer en DB.

---

## Pattern Realtime Supabase

```typescript
useEffect(() => {
  fetchAll();
  const ch = sb.channel("nom-unique-par-page")
    .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, fetchAll)
    .on("postgres_changes", { event: "*", schema: "public", table: "alertes" }, fetchAll)
    .on("postgres_changes", { event: "*", schema: "public", table: "conducteurs" }, fetchAll)
    .on("postgres_changes", { event: "*", schema: "public", table: "vehicules" }, fetchAll)
    .on("postgres_changes", { event: "*", schema: "public", table: "absences_enfants" }, fetchAll)
    .on("postgres_changes", { event: "*", schema: "public", table: "absences_conducteurs" }, fetchAll)
    .subscribe();
  return () => { sb.removeChannel(ch); };
}, [fetchAll, sb]);
```

`fetchAll` doit être wrappé dans `useCallback` pour éviter les re-souscriptions infinies.

---

## Constantes couleurs (`C` de `lib/constants.ts`)

```
C.navy    = "#0D3B7A"   C.navyL   = "#1565C0"
C.sky     = "#42A5F5"   C.skyL    = "#E3F2FD"
C.green   = "#16A34A"   C.greenL  = "#DCFCE7"
C.red     = "#DC2626"   C.redL    = "#FEE2E2"
C.amber   = "#D97706"   C.amberL  = "#FEF3C7"
C.gray50  = "#F8FAFC"   C.gray100 = "#F1F5F9"
C.gray200 = "#E2E8F0"   C.gray400 = "#94A3B8"
C.gray600 = "#475569"   C.gray800 = "#1E293B"
C.white   = "#FFFFFF"
```

---

## Composants UI (`@/components/ui`)

| Composant | Props clés |
|---|---|
| `Badge` | `color: "green"\|"red"\|"blue"\|"amber"\|"gray"\|"purple"\|"navy"` |
| `Avatar` | `initials, size?=36, color?` |
| `Card` | `style?, onClick?` |
| `InfoBox` | `label, value?, highlight?, full?` |
| `Btn` | `color?, disabled?, full?, outline?, small?` |
| `Modal` | `title, onClose, wide?` (max-width 780 ou 620) |
| `SectionTitle` | `title, action?, onAction?` |
| `TabBar` | `tabs, active, onChange` |
| `Stat` | `label, value, sub?, icon, color, onClick?` |

---

## Fonctions utilitaires

Dans `lib/constants.ts` :
```typescript
statusColor(s)  // → "green"|"red"|"amber"|"blue"|"gray"
statusLabel(s)  // → texte français
todayStr()      // → "lundi 23 juin 2026" (fr-FR)
nowStr()        // → "14:30"
```

Helpers locaux standards définis dans chaque page :
```typescript
const isoToday = () => new Date().toISOString().slice(0, 10);
const fmtTime  = (d: string) => new Date(d).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
const fmtDT    = (d: string) => new Date(d).toLocaleString("fr-CH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
```

---

## Fonctionnalités implémentées

### Gestionnaire — Dashboard (`/gestionnaire`)
- 6 métriques cliquables → sous-pages (Véhicules, Conducteurs, Absents, Incidents, Alertes, Circuits)
- Panels urgents : incidents ouverts, conducteurs absents, circuits non couverts, absences enfants
- Realtime 6 tables
- `AssignModal` : désigne remplaçant → 2 service_logs + alerte `remplacement` (driver_id)
- `ChildAbsModal` : transmission absence enfant au conducteur
- `IncidentActionModal` : traitement + actions rapides + lien mécanicien (`transmis_meca`)

### Gestionnaire — Rapport (`/gestionnaire/rapport`)
- Filtre Jour / Semaine / Mois
- **Section "Remplacements du jour"** (mode Jour uniquement) : absent ↔ remplaçant ↔ circuit + horodatage
- Requête `absences_conducteurs` avec joins FK nommées : `conducteur:conducteurs!conducteur_id(prenom,nom)`

### Gestionnaire — Imprévus (`/gestionnaire/imprevus`)
- 6 types : Absence / École / Parent / Véhicule / Météo / Autre
- Modèles de message par type (modèle parent pré-rempli)
- Recherche destinataires : conducteurs + profiles (mécanicien/admin/gestionnaire)
- Mécanicien → alerte `transmis_meca` au lieu de `imprévu`
- Historique envois avec suivi En attente / Lu par destinataire

### Conducteur (`/conducteur`)
- 6 tabs : dashboard / fiche / service / signalements / messages / historique
- Alertes `type:"remplacement"` : carte ambrée + bouton **"J'ai pris connaissance"**
- Banner prioritaire sur dashboard si remplacement non confirmé
- Signalements → incidents + alertes gestionnaire
- Historique par année scolaire → mois → jours

### Mécanicien (`/mecanicien`)
- Lit alertes `transmis_meca` + types réparation
- Workflow réparations

---

## PowerShell — encodage UTF-8 (règle absolue)

Les `.tsx` sont **UTF-8 sans BOM**. PowerShell 5.1 (Windows) lit par défaut en UTF-16, ce qui corrompt les emojis et caractères accentués.

**Lire :**
```powershell
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
```

**Écrire :**
```powershell
$utf8NoBOM = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($path, $content, $utf8NoBOM)
```

**Ne jamais utiliser** `Get-Content` / `Set-Content` / `Out-File` sur des fichiers `.tsx`.

---

## Données de référence

**54 circuits** (C001–C054), nommés avec animaux/objets + emoji. Définis dans `CIRCUITS_DATA` (`lib/constants.ts`).

**24 véhicules** (plaques FR et VD) : Mercedes Vito/Sprinter, Seat Alhambra, VW Transporter/Crafter, Fiat Ducato, Citroën Jumpy, Opel Movano, Beulas Mythos (49 places). Définis dans `VEHICLES_DATA`.

**16 cercles scolaires** : Mérine, AISMLE, CESL, Siviriez, Cugy-ASISE, Saint Prex-ASISE, Verdeil-Yverdon, Verdeil-Payerne, Perceval, Carré d'As, Lucens, Espérance, TEM, Clos Fleury, Cheiry-Surpierre, Romont.

**Compte gestionnaire** : `gestionnaire@taxi-romontois.ch` — prénom: Anes, nom: Akiki

---

## Règles de travail

1. **Fichiers déjà dans le bon dossier** — le dossier de travail est `C:\Users\amany\Documents\GitHub\taxi-romontois`. Inutile de copier ailleurs.
2. Édition chirurgicale (`Edit`) plutôt que réécriture complète quand possible.
3. Vérifier la taille du fichier après écriture : `(Get-Item $path).Length`.
4. Inline styles uniquement — pas de classes Tailwind dans les composants.
5. Jointures Supabase avec FK multiples sur la même table : utiliser l'alias avec le nom de colonne FK : `conducteur:conducteurs!conducteur_id(prenom,nom)`.
6. Toujours filtrer les incidents actifs avec `.neq("status","resolu")` (pas `.eq("status","en_attente")`).

---

## ROADMAP TAXI ROMONTOIS — Version complète

Mise à jour : 23 juin 2026

---

### PHASE 1 — Finir et stabiliser

#### 1. Fix en cours (Claude Code est dessus)

- [x] Badges notifications sidebar (incidentsCount + alertesCount) via Realtime Supabase
- [x] Stabilisation shadcn + globals.css + layout.tsx

#### 2. Compte Mécanicien

- [ ] Fiche réception véhicule (infos véhicule, description, photos téléversables, date/heure)
- [ ] Statuts réparation progressifs : Réceptionné → Réparation en cours → En attente de pièces → En attente de validation admin (si montant > seuil) → Véhicule prêt → En service → clôture
- [ ] Saisie montant réparation
- [ ] Si montant > seuil → notification admin pour validation
- [ ] Vue budget total réparations (mécanicien + gestionnaire + admin)
- [ ] Historique réparations visible gestionnaire et admin

#### 3. Compte Admin

- [ ] Tableau de bord global : conducteurs actifs, véhicules en service/réparation, montant total réparations, incidents ouverts, alertes en attente validation budget
- [ ] Seuil validation budget réparations (configurable par l'admin)
- [ ] Rapports journaliers / hebdomadaires automatiques
- [ ] Vue consolidée tous comptes (conducteurs, véhicules, circuits, incidents)
- [ ] Statistiques mensuelles : accidents, retards, remplacements, réparations + coûts, classement par mois → détail par jour au clic

#### 4. Onglet Parents

- [ ] Fiche parent complète : nom/prénom, téléphone(s)/email, enfant(s) avec classe/école/circuit/adresse, notes, statut compte, photo conducteur visible par le parent
- [ ] Saisie manuelle par le gestionnaire
- [ ] Communication parent ↔ gestionnaire

#### 5. Génération mots de passe conducteurs

- [ ] Le gestionnaire génère les mots de passe depuis la fiche conducteur
- [ ] Distribution manuelle un par un
- [ ] Réinitialisation mot de passe si oublié
- [ ] Activation / désactivation compte conducteur

#### 6. Fiche Conducteur — améliorations

- [ ] Historique remplacements (date, qui remplacé, motif)
- [ ] Historique trajets par année → mois → jour
- [ ] Clarifier statut "en service" : Disponible / En trajet / Absent / En congé
- [ ] Synchronisation gestionnaire ↔ fiche conducteur pour les remplacements

#### 7. Véhicules — clarification statuts

- [ ] Statuts clarifiés : En service / En trajet / En réparation / En attente contrôle technique / Hors service
- [ ] Lien avec fiche réparation mécanicien

#### 8. Incidents — organisation

- [ ] Classement par catégorie : conducteur / véhicule / parent / enfant
- [ ] Statuts : En cours / Résolu
- [ ] Affichage : incidents du jour en premier, puis historique par année → mois → jour
- [ ] Lien avec fiche réparation si véhicule concerné

#### 9. Alertes — coordination

- [ ] Alertes automatiques : tachymètre non à jour, permis expiré/manquant, contrôle technique dépassé, assurance expirée
- [ ] Coordonner avec ce qui existe déjà dans le code, compléter si manquant

#### 10. Imprévus — destinataires

- [ ] Sélection destinataire par rôle (pas saisie manuelle) : parents (recherche par nom enfant/circuit), conducteurs, mécanicien, administrateur
- [ ] Fiche imprévu complète avec actions à mener

#### 11. Rapport journalier automatique

- [ ] Génération automatique à minuit (bascule J → J+1)
- [ ] Export Excel structuré : circuits réalisés, conducteurs présents/absents/remplacés, incidents du jour, alertes, réparations, graphiques récapitulatifs
- [ ] Couleurs, mise en forme professionnelle, classé par catégories

#### 12. Exports

- [ ] Sélection par rubrique : rapport journalier, imprévus, conducteurs, véhicules, circuits, incidents, réparations
- [ ] Sélection période : aujourd'hui / cette semaine / ce mois / période personnalisée
- [ ] Téléchargement PDF ou Excel

#### 13. Tableau de bord gestionnaire — optimisation visuelle

- [ ] Conducteurs absents du jour bien mis en avant
- [ ] Stat cards modernisées (shadcn + Lucide)
- [ ] Vision immédiate dès ouverture
- [ ] Remplacer emojis par icônes Lucide

---

### PHASE 2 — Tests et visuel

#### 14. Tests avec vrais conducteurs

- [ ] Générer mots de passe pour les comptes existants
- [ ] Activer les comptes
- [ ] Tester tous les flux avec de vrais utilisateurs
- [ ] Valider que toute la logique fonctionne

#### 15. Nettoyage données simulation

> ⚠️ À faire APRÈS validation des tests

**Garder :** conducteurs (réels), véhicules (réels), circuits (54 réels), comptes parents (à créer)

**Supprimer :** absences simulées, incidents fictifs, alertes de test, remplacements fictifs, réparations fictives

#### 16. Modernisation visuelle complète

- [ ] Remplacer tous les emojis par icônes Lucide
- [ ] Stat cards redesignées avec shadcn/ui
- [ ] Animations Magic UI sur les éléments clés
- [ ] Sidebar affinée
- [ ] Style global 2026 — épuré, professionnel, vibrant

#### 17. PowerPoint de présentation

- [ ] Présentation de la plateforme
- [ ] Fonctionnalités par compte (gestionnaire, conducteur, mécanicien, admin, parent)
- [ ] Captures d'écran
- [ ] Vision future (agents IA, optimisation circuits, suivi enfants)

---

### POUR PLUS TARD — À proposer au patron

**Agents IA**
- Agent suivi prise en charge enfants par conducteur (validation arrêt par arrêt)
- Notifications parents en temps réel ("votre enfant a été récupéré")
- Notification si enfant non récupéré → gestionnaire + parent
- Agent localisation estimée conducteur (basé adresses + heure départ, s'appuie sur Maps)
- Agent optimisation circuits (meilleur trajet selon adresses)
- Réaffectation automatique enfants si conducteur absent
- Notification parent "conducteur remplaçant = X + photo"

**Architecture communications entre rôles**

```
         ADMIN
           |
    ───────────────
    |              |
GESTIONNAIRE  MÉCANICIEN
    |              |
CONDUCTEURS   (réparations,
    |          montants,
PARENTS        validation)
```

- Mécanicien → Gestionnaire : statuts réparation
- Mécanicien → Admin : validation budget si > seuil
- Conducteur → Gestionnaire : signalements, absences
- Gestionnaire → Conducteur : remplacements, alertes
- Gestionnaire → Parent : notifications
- Parent → Gestionnaire : messages
- Admin : vision globale + validation budget

---

### Ordre de travail recommandé pour Claude Code

1. Fix sidebar notifications ✅
2. Compte mécanicien complet
3. Compte admin
4. Onglet parents
5. Génération mots de passe
6. Fiche conducteur (historique + statuts)
7. Statuts véhicules
8. Incidents (classement + statuts)
9. Alertes (coordination)
10. Imprévus (destinataires par rôle)
11. Rapport journalier automatique
12. Exports
13. Optimisation tableau de bord gestionnaire
14. Tests
15. Nettoyage données
16. Visuel
17. PowerPoint


---

## Règle absolue — Sécurité des clés API

- Ne JAMAIS écrire un token, clé API, ou credential en clair dans une commande PowerShell ou bash
- Toujours lire les valeurs depuis .env.local avec les variables d'environnement
- Exemple CORRECT : $token = $env:SUPABASE_ACCESS_TOKEN
- Exemple INTERDIT : $token = "sbp_xxxxxxxxxxxx"
- Cette règle s'applique à TOUTES les commandes, sans exception
- Si une clé apparaît en clair dans le chat → la régénérer immédiatement dans Supabase

## Règle absolue — Avant de créer un fichier ou une route

- Toujours vérifier si un fichier ou une route similaire existe déjà
- Ne jamais créer de doublon
- Commande de vérification : Get-ChildItem -Recurse | Where-Object { $_.Name -like "*nom*" }

## Règle absolue — Variables d'environnement

Les variables sensibles sont dans .env.local UNIQUEMENT :
- SUPABASE_URL
- SUPABASE_ANON_KEY  
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_ACCESS_TOKEN

Ne jamais les mettre dans le code, dans le chat, ou dans les commandes en clair.

