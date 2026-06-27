# Rapport Viabilité Code — Taxi Romontois v2
Date : 27 juin 2026 | Analyse statique + tests Playwright

---

## 1. Fonctions qui font plus d'une chose

### `fetchAll` dans `gestionnaire/page.tsx` (879 lignes)
```typescript
const fetchAll = useCallback(async () => {
  // Récupère 8 tables (conducteurs, vehicules, circuits, enfants,
  // absences_enfants, incidents, alertes, reparations)
  // Calcule les métriques (absentsNonRemplaces, circuitsNonCouverts…)
  // Met à jour 8 états distincts
}, [sb]);
```
**Problème** : une seule fonction fait le chargement de données + calcul métier + mise à jour UI.
**Conséquence** : impossible d'invalider uniquement les alertes sans recharger les 7 autres tables.

### `handleCreateAccount` / `handleLinkAccount` dans conducteurs (1057 lignes)
Ces fonctions font simultanément : appel API → génération password → mise à jour 4 états → appel fetchHistory. La logique de génération de mot de passe est dans le composant UI alors qu'elle devrait être dans l'API (et l'est déjà partiellement).

### `handleAccepterConge` / `handleRefuserConge` / `handleTransmettreConge`
Même structure répétée 3 fois : UPDATE `conges_demandes` → INSERT `alertes` → re-fetch. Pattern valide mais dupliqué — une fonction `updateConge(id, statut, payload)` réduirait les répétitions.

### Handlers d'assignation dans `gestionnaire/page.tsx`
`handleAssign` fait : validation → INSERT 2 service_logs → UPDATE conducteur → INSERT alerte → UPDATE absence. Cinq opérations Supabase séquentielles sans transaction — si l'une échoue après les premières, l'état DB est partiellement mis à jour.

---

## 2. Composants > 300 lignes à découper

| Fichier | Lignes | Découpage recommandé |
|---------|--------|---------------------|
| `mecanicien/page.tsx` | **1 408** | `AtelierVehicule` + `WorkflowReparation` + `HistoriqueReparations` + `AlertesMecanicien` |
| `admin/page.tsx` | **1 385** | `AdminDashboard` + `AdminConducteurs` + `AdminVehicules` + `AdminBudget` |
| `gestionnaire/conducteurs/page.tsx` | **1 057** | `DriverList` + `DriverDetail` + `DriverForm` + `AccesConducteur` + `CongesSection` |
| `gestionnaire/page.tsx` | **879** | `DashboardStats` + `PanelAbsences` + `PanelIncidents` + `AssignModal` + `ChildAbsModal` |
| `parent/page.tsx` | **537** | `ParentEnfants` + `ParentContactGestionnaire` |
| `gestionnaire/vehicules/page.tsx` | **519** | `VehiculeList` + `VehiculeDetail` + `VehiculeForm` |
| `MessagerieBox.tsx` | **477** | Acceptable — composant auto-contenu, une seule responsabilité |

**Seuil critique** : tout composant > 500 lignes devient difficile à tester unitairement et à maintenir. Les 4 premiers de la liste (mecanicien, admin, conducteurs gestionnaire, dashboard) sont des candidats immédiats au découpage.

---

## 3. Types TypeScript — état actuel

### Types bien couverts ✅
```typescript
Role | DriverStatus | VehicleState | IncidentStatus | AlertSeverity | RepairStatus
Conducteur | Vehicule | Circuit | Incident | Alerte | Reparation
Profile | AbsenceEnfant | AbsenceConducteur | ServiceLog | CongesDemande
```

### Types manquants ou insuffisants ⚠️

**`Message` (messages_internes)** — non défini dans `lib/types.ts`. Chaque composant l'utilise avec `any` ou un type local anonyme :
```typescript
// Actuellement dans MessagerieBox.tsx :
const [messages, setMessages] = useState<unknown[]>([]);
// Devrait être :
interface MessageInterne { id: number; expediteur_id: string; ... }
```

**`Incident.type` et `Alerte.type` sont `string`** au lieu d'union littéraux :
```typescript
// Actuel :
type: string; // peut être n'importe quoi
// Devrait être :
type IncidentType = "panne"|"voyant"|"accident"|"retard"|"degradation"|"enfant"|"parent"|"autre";
type AlerteType = "conducteur"|"vehicule"|"reparation"|"transmis_meca"|"remplacement"|"imprévu"|"rapport_admin";
```

**`Parent`** — interface utilisée dans `gestionnaire/parents/page.tsx` mais définie localement, pas dans `lib/types.ts`.

**`Parametres`** — table mentionnée dans la roadmap (seuil budget admin) mais aucun type défini.

**Interfaces locales dupliquées** — `ServiceLog` est défini dans `conducteurs/page.tsx` et dans `lib/types.ts` avec des champs différents. Risque de divergence.

---

## 4. Appels Supabase dupliqués

### Requêtes redondantes entre pages

| Table | Pages qui la rechargent indépendamment | Occurrences |
|-------|----------------------------------------|-------------|
| `conducteurs SELECT *` | gestionnaire, rapport, imprevus, incidents, vehicules, circuits, admin, conducteur | 8 |
| `vehicules SELECT *` | gestionnaire, vehicules, conducteurs, rapport, admin | 5 |
| `circuits SELECT *` | gestionnaire, vehicules, conducteurs, rapport, circuits, export | 6 |

Chaque page crée son propre `fetchAll` + son propre canal Realtime → **36 souscriptions Realtime** pour 11 fichiers. En production avec 10 onglets ouverts simultanément, cela représente 360 canaux WebSocket actifs côté client — Supabase limite à 200 canaux simultanés par connexion.

### Pattern `fetchAll` répété
```typescript
// Copié-collé dans 10 fichiers avec variations mineures :
const fetchAll = useCallback(async () => {
  const [a, b, c] = await Promise.all([...]);
  setA(a.data ?? []);
  setB(b.data ?? []);
}, [sb]);

useEffect(() => { fetchAll(); }, [fetchAll]);
```

---

## 5. Capacité à accueillir tracking enfants et agents IA

### Fondations existantes favorables ✅

**Tables déjà en place** :
- `enfants` avec `circuit_id`, `parent_user_id` → géolocalisation par circuit possible
- `absences_enfants` avec `transmitted_to_driver`, `read_by_driver` → workflow de communication déjà structuré
- `alertes` générique avec `driver_id`, `vehicle_id` → extensible sans modification de schéma (ajouter un type `enfant_pris_en_charge`)
- `profiles` avec `role: parent` et `enfant_id` → les parents sont dans le système

**Architecture Realtime** : le pattern `postgres_changes` est déjà uniforme sur toutes les pages. Ajouter une table `prises_en_charge` et l'inclure dans les souscriptions existantes ne nécessite pas de refactoring.

**API Routes Next.js** : toutes les opérations sensibles passent déjà par `/api/` avec `requireRole()`. Les agents IA s'intégreraient comme routes supplémentaires sans changer l'architecture.

### Points de vigilance pour la v2 ⚠️

**Tracking arrêt par arrêt** : nécessitera une table `prises_en_charge (id, enfant_id, conducteur_id, date, heure, arret, statut)` — pas encore créée. Le frontend conducteur devra gérer une liste d'arrêts en temps réel, ce qui ajoutera une complexité significative à `conducteur/page.tsx` (déjà 586 lignes).

**Agents IA (optimisation circuits, réaffectation)** : nécessiteront des Edge Functions Supabase ou des API Routes avec appels LLM. L'architecture App Router le supporte nativement. Le risque est la latence (agents IA = réponse en 2–5 secondes) vs les attentes Realtime actuelles (< 1 seconde).

**Pas de couche de cache partagée** : le pattern `fetchAll` par page signifie que les agents IA qui mettent à jour des données déclencheront autant de rechargements complets que de pages ouvertes. Sans React Query ou SWR, il sera difficile d'invalider sélectivement des données.

**`Promise.all` sans transaction** : les opérations multi-tables (remplacement = 2 service_logs + 1 alerte + 1 update conducteur) ne sont pas transactionnelles. Pour la v2 avec tracking enfants, un échec partiel pourrait laisser un enfant marqué "pris en charge" sans log de service correspondant. Recommandé : passer par des fonctions PostgreSQL (RPC Supabase) pour les opérations atomiques.

---

## Recommandations prioritaires avant v2

| Priorité | Action | Effort | Impact |
|----------|--------|--------|--------|
| 1 | Ajouter `Message`, `Parent`, `Parametres`, union types `IncidentType`/`AlerteType` dans `lib/types.ts` | Faible | Fiabilité TypeScript |
| 2 | Découper `mecanicien/page.tsx` et `admin/page.tsx` en sous-composants (> 1000 lignes) | Moyen | Maintenabilité |
| 3 | Centraliser les requêtes courantes (conducteurs, vehicules, circuits) dans des hooks partagés | Moyen | Réduction duplication |
| 4 | Créer des RPC Supabase pour les opérations multi-tables (remplacement, prise en charge) | Moyen | Cohérence données |
| 5 | Créer la table `prises_en_charge` pour le tracking enfants | Faible | Débloque tracking v2 |

---

## Conclusion

Le code est **viable pour une v2** sans refactoring majeur. L'architecture — App Router, Realtime Supabase, RLS, API Routes — est correcte et extensible. Les problèmes identifiés (fichiers monolithiques, types manquants, requêtes dupliquées) sont des dettes techniques ordinaires qui n'empêchent pas d'ajouter de nouvelles fonctionnalités, mais qui ralentissent le développement si elles s'accumulent. Les agents IA et le tracking enfants peuvent être intégrés dans la structure actuelle avec l'ajout d'une table et de quelques Edge Functions.
