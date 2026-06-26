# Roadmap Agents IA — Taxi Romontois

Architecture prévue des agents intelligents. Chaque agent décrit : tables Supabase nécessaires, routes API à créer, triggers/webhooks à activer, logique métier.

Principe général : les agents sont des **fonctions serveur** (Next.js API routes ou Supabase Edge Functions) déclenchées soit par webhook Supabase (`postgres_changes`), soit par cron (`pg_cron` / Render cron), soit à la demande. Ils écrivent dans les tables existantes (`alertes`, `service_logs`…) et de nouvelles tables dédiées.

---

## 1. Agent suivi enfants (validation arrêt par arrêt)

**But** : suivre la prise en charge de chaque enfant à chaque arrêt d'un circuit en temps réel.

**Tables Supabase nécessaires**
- `arrets` : `id`, `circuit_id`, `ordre`, `nom`, `adresse`, `lat`, `lng`, `heure_prevue`.
- `enfants_arrets` : `enfant_id`, `arret_id` (rattache un enfant à son arrêt).
- `prises_en_charge` : `id`, `service_log_id`, `enfant_id`, `arret_id`, `date_service`, `statut` (`attendu`/`pris`/`absent`/`non_pris`), `horodatage`, `conducteur_id`.

**Routes API**
- `POST /api/agent/prise-en-charge` : le conducteur valide un enfant (pris / absent) → upsert `prises_en_charge`.
- `GET /api/agent/circuit-state/[circuitId]` : état temps réel d'un circuit (qui reste à prendre).

**Triggers / webhooks**
- Trigger Postgres sur `prises_en_charge` INSERT/UPDATE → notifie le parent (voir agent 2).
- Cron : à `heure_prevue + delta`, si un enfant attendu n'est ni `pris` ni `absent` → alerte (voir agent 2).

**Logique métier**
- Au démarrage d'un `service_log`, générer les `prises_en_charge` `attendu` pour les enfants du circuit (hors absents du jour dans `absences_enfants`).
- Validation séquentielle par ordre d'arrêt côté UI conducteur.

---

## 2. Agent notifications parents en temps réel

**But** : informer le parent ("votre enfant a été récupéré") et alerter en cas d'anomalie ("enfant non récupéré").

**Tables Supabase nécessaires**
- `notifications_parents` : `id`, `parent_user_id`, `enfant_id`, `type` (`pris`/`depose`/`non_pris`/`retard`), `message`, `lu`, `created_at`.
- (optionnel) `push_tokens` : `user_id`, `token`, `platform` pour push mobile/web.

**Routes API**
- `POST /api/agent/notify-parent` : crée une notification + déclenche push.
- Webhook receiver pour les changements de `prises_en_charge`.

**Triggers / webhooks**
- Webhook Supabase sur `prises_en_charge` (statut `pris`/`depose`) → `notify-parent`.
- Cron de surveillance : enfant `attendu` dépassé → notification `non_pris` au parent + alerte gestionnaire (`alertes`).

**Logique métier**
- Mapping `enfant_id → parent_user_id` via `enfants.parent_user_id`.
- Réutilise Realtime : la page `parent/page.tsx` s'abonne à `notifications_parents`.

---

## 3. Agent optimisation circuits

**But** : proposer le meilleur ordre d'arrêts selon les adresses (et le trafic).

**Tables Supabase nécessaires**
- `arrets` (voir agent 1) avec `lat`/`lng` géocodés.
- `circuits_optimisations` : `id`, `circuit_id`, `ordre_propose` (jsonb), `distance_km`, `duree_min`, `created_at`, `applique` bool.

**Routes API**
- `POST /api/agent/optimize-circuit/[circuitId]` : appelle un service de routing (Google Maps Directions / OSRM), calcule l'ordre optimal, écrit `circuits_optimisations`.
- `POST /api/agent/apply-optimisation/[id]` : applique l'ordre proposé (met à jour `arrets.ordre`).

**Triggers / webhooks**
- Déclenchement à la demande (bouton gestionnaire) ou cron hebdomadaire.
- Géocodage : sur INSERT/UPDATE d'`arrets.adresse` sans coordonnées → job de géocodage.

**Logique métier**
- Problème du voyageur de commerce contraint (point de départ = dépôt). Pour N petit (< 25 arrêts), résolution exacte ou heuristique (nearest-neighbour + 2-opt).
- Clé Maps lue depuis `.env.local`, jamais en clair.

---

## 4. Agent rapport journalier automatique

**But** : générer chaque nuit le rapport du jour (circuits réalisés, présences, incidents, alertes, réparations) en Excel/PDF.

**Tables Supabase nécessaires**
- `rapports_journaliers` : `id`, `date`, `payload` (jsonb agrégé), `fichier_url`, `genere_at`.
- Lit : `service_logs`, `absences_conducteurs`, `absences_enfants`, `incidents`, `alertes`, `reparations`.

**Routes API**
- `POST /api/agent/rapport-journalier` : agrège les données d'une date, génère le fichier, le stocke dans Supabase Storage, écrit `rapports_journaliers`.

**Triggers / webhooks**
- Cron à minuit (bascule J → J+1) via `pg_cron` ou Render cron appelant la route.

**Logique métier**
- Agrégation par circuit / conducteur / catégorie.
- Réutilise la logique existante de `gestionnaire/rapport/page.tsx` et `app/api/export/route.ts`.
- Mise en forme professionnelle (couleurs, en-têtes, totaux).

---

## 5. Agent réaffectation conducteurs absents

**But** : proposer automatiquement un remplaçant quand un conducteur est marqué absent.

**Tables Supabase nécessaires**
- Lit : `conducteurs` (status, dispo), `absences_conducteurs`, `circuits`, `service_logs`.
- `reaffectations_propositions` : `id`, `absence_id`, `circuit_id`, `remplacant_propose_id`, `score`, `statut` (`propose`/`accepte`/`refuse`), `created_at`.

**Routes API**
- `POST /api/agent/propose-remplacant` : pour une absence, classe les conducteurs disponibles et propose le meilleur.
- `POST /api/agent/confirm-remplacant/[propositionId]` : applique (crée les 2 `service_logs` + alerte `remplacement` driver_id, comme le `handleAssign` actuel du dashboard).

**Triggers / webhooks**
- Webhook Supabase sur `conducteurs.status = "absent"` ou INSERT `absences_conducteurs` (status `non_couvert`) → `propose-remplacant`.

**Logique métier**
- Scoring des candidats : statut `disponible`/`en_attente`, proximité géographique (cercle/circuit), véhicule compatible (places, places_handi), permis valide (`permis_exp`), tachygraphe à jour.
- Notifie le gestionnaire avec la proposition ; confirmation humaine avant application (garder l'humain dans la boucle pour la v1).

---

## Considérations transverses

- **Sécurité** : toutes les routes `/api/agent/*` protégées par `requireRole(...)` sauf celles déclenchées par webhook signé (vérifier la signature Supabase).
- **Idempotence** : les agents déclenchés par webhook doivent être idempotents (clé naturelle, upsert).
- **Observabilité** : journaliser les décisions des agents dans une table `agent_logs` (`agent`, `input`, `output`, `created_at`).
- **Humain dans la boucle** : pour les v1, les agents *proposent*, le gestionnaire *valide* (réaffectation, optimisation). L'automatisation totale viendra après validation terrain.
- **Clés API** (Maps, push) : toujours dans `.env.local`, jamais en clair.
