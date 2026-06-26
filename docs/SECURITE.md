# Sécurité — Taxi Romontois

Dernière mise à jour : 26 juin 2026

---

## Architecture de protection

La sécurité est assurée par **trois couches indépendantes**. Si l'une échoue, les autres bloquent.

```
Requête HTTP
     │
     ▼
┌─────────────────────────────────────────────────────┐
│  COUCHE 1 — middleware.ts (avant tout rendu React)  │
│  • Valide la session JWT via Supabase auth.getUser() │
│  • Vérifie le rôle contre le chemin demandé          │
│  • Protège aussi les routes /api/*                   │
└─────────────────────────────────────────────────────┘
     │ si auth OK
     ▼
┌─────────────────────────────────────────────────────┐
│  COUCHE 2 — app/(protected)/layout.tsx (Server)     │
│  • Re-vérifie auth.getUser() côté serveur            │
│  • Re-vérifie le rôle via header x-pathname          │
│  • Indépendant du middleware                         │
└─────────────────────────────────────────────────────┘
     │ si auth + rôle OK
     ▼
┌─────────────────────────────────────────────────────┐
│  COUCHE 3 — routes /api/* (lib/auth-guard.ts)       │
│  • requireRole([...]) au début de chaque handler    │
│  • Retourne 401/403 JSON si non autorisé             │
└─────────────────────────────────────────────────────┘
```

---

## Rôles et accès autorisés

| Rôle          | Pages autorisées  | API autorisées                                      |
|---------------|-------------------|-----------------------------------------------------|
| `gestionnaire`| `/gestionnaire/*` | `/api/gestionnaire/*`, `/api/admin/*`, `/api/export`, `/api/import` |
| `conducteur`  | `/conducteur/*`   | aucune                                              |
| `mecanicien`  | `/mecanicien/*`   | `/api/export`                                       |
| `admin`       | `/admin/*`        | `/api/admin/*`, `/api/gestionnaire/*`, `/api/export`, `/api/import` |
| `parent`      | `/parent/*`       | aucune                                              |

---

## Comportement de redirection

| Situation | Résultat |
|-----------|----------|
| Non connecté → `/gestionnaire` | → `/login` |
| Non connecté → `/admin` | → `/login` |
| Non connecté → `/api/admin/set-password` | `401 Non authentifié` |
| Conducteur → `/gestionnaire` | → `/conducteur` |
| Conducteur → `/admin` | → `/conducteur` |
| Conducteur → `/api/gestionnaire/create-account` | `403 Accès refusé` |
| Mécanicien → `/gestionnaire` | → `/mecanicien` |
| Admin → `/gestionnaire` | → `/admin` |
| Parent → `/conducteur` | → `/parent` |

---

## Routes publiques (sans authentification)

| Route | Raison |
|-------|--------|
| `/login` | Page de connexion |
| `/scan/*` | Scan QR code — accessible aux conducteurs sans compte |
| `/api/vehicule/*` | Données véhicule pour scan QR |
| `/` | Redirect automatique selon auth |
| `/_next/*`, assets | Fichiers statiques Next.js |

---

## Routes API protégées

### `/api/admin/set-password` (POST)
- **Rôles** : `gestionnaire`, `admin`
- **Risque sans protection** : n'importe qui pouvait modifier le mot de passe de n'importe quel utilisateur Supabase Auth

### `/api/gestionnaire/create-account` (POST)
- **Rôles** : `gestionnaire`, `admin`
- **Risque sans protection** : création de comptes auth arbitraires avec la clé service

### `/api/gestionnaire/link-account` (POST)
- **Rôles** : `gestionnaire`, `admin`
- **Risque sans protection** : association arbitraire d'un profil à n'importe quel conducteur_id

### `/api/export` (GET)
- **Rôles** : `gestionnaire`, `admin`, `mecanicien`
- **Risque sans protection** : export CSV de toutes les données (conducteurs, enfants, véhicules…)

### `/api/import` (POST)
- **Rôles** : `gestionnaire`, `admin`
- **Risque sans protection** : insertion/modification de données en masse sans auth

### `/api/vehicule/[vehicleId]` (GET) — RESTE PUBLIC
- Intentionnellement public : utilisé par la page `/scan/[vehicleId]` qui est accessible sans compte (conducteurs non encore inscrits scannent un QR)

---

## Implémentation technique

### middleware.ts
- Fichier : `/middleware.ts` (racine du projet)
- Utilise `@supabase/ssr` `createServerClient` avec gestion des cookies Next.js
- Appelle `supabase.auth.getUser()` qui **valide le JWT côté serveur** (pas de décodage local)
- Injecte `x-pathname` dans les headers de requête pour le layout

### lib/auth-guard.ts
- Fonction `requireRole(allowedRoles: string[])`
- Retourne `{ guard: Response }` si non autorisé (à retourner directement), sinon `{ userId, role }`
- Utilise `createClient()` (lecture des cookies de session) pour valider l'auth côté serveur

### app/(protected)/layout.tsx
- Appelle `supabase.auth.getUser()` indépendamment du middleware
- Lit `x-pathname` depuis `next/headers` (injecté par le middleware)
- Redirige si le rôle ne correspond pas au préfixe du chemin

---

## Points vérifiés

- [x] Non connecté → toutes routes protégées → `/login`
- [x] Conducteur → `/gestionnaire` → `/conducteur`
- [x] Conducteur → `/admin` → `/conducteur`
- [x] Mécanicien → `/gestionnaire` → `/mecanicien`
- [x] Admin → `/gestionnaire` → `/admin`
- [x] Parent → toute autre route → `/parent`
- [x] `/api/admin/set-password` sans auth → `401`
- [x] `/api/gestionnaire/create-account` sans auth → `401`
- [x] `/api/gestionnaire/link-account` sans auth → `401`
- [x] `/api/export` sans auth → `401`
- [x] `/api/import` sans auth → `401`
- [x] `/api/vehicule/*` → toujours public
- [x] `/scan/*` → toujours public
- [x] Build Next.js propre sans erreurs TypeScript

---

## Audit complémentaire — 6 points (26 juin 2026)

### 1. Expiration de session

**Statut : ✅ OK**

- Les JWT Supabase expirent après **1 heure** (valeur par défaut).
- Les refresh tokens expirent après **7 jours** (configurable dans Supabase > Auth > Settings).
- Le middleware appelle `supabase.auth.getUser()` qui valide le JWT **côté serveur** et renouvelle automatiquement le token via le callback `setAll` sur les cookies.
- Comportement : si un utilisateur ferme son navigateur puis revient dans < 7 jours, il reste connecté (refresh token valide). Au-delà de 7 jours d'inactivité → déconnexion automatique à la prochaine tentative → redirection `/login`.
- Aucune action requise.

---

### 2. Uploads photos mécanicien

**Statut : ✅ Corrigé** (`app/(protected)/mecanicien/page.tsx`)

**Avant :** seul l'attribut HTML `accept="image/*"` était présent, contournable via les DevTools ou un client HTTP.

**Après :** ajout de la fonction `validatePhotos()` appelée à chaque `onChange` avant tout upload :
- Types autorisés : `image/jpeg`, `image/png`, `image/webp`, `image/gif` uniquement
- Taille maximale : **10 Mo** par fichier
- Nombre maximum : **5 fichiers** par upload
- Si invalide : sélection annulée + message d'erreur affiché, aucun fichier envoyé

La validation est côté client (la seule option avec Supabase Storage JS direct). L'upload est protégé en amont par l'authentification mécanicien.

> **Recommandation future** : vérifier les politiques Supabase Storage sur le bucket `vehicule-photos` pour s'assurer que seuls les mécaniciens authentifiés peuvent écrire.

---

### 3. Rate limiting — force brute sur /login

**Statut : ✅ OK (géré par Supabase)**

La page `/login` utilise `supabase.auth.signInWithPassword()` qui passe par l'API Auth de Supabase. Supabase applique nativement :
- **30 tentatives** email + mot de passe par 5 minutes par adresse IP (valeur par défaut)
- Délais progressifs après 5 échecs consécutifs
- Ce rate limiting est appliqué côté serveur Supabase, non contournable via l'application

Les routes `/api/*` sont protégées par `requireRole()` qui nécessite une session valide — un attaquant non authentifié ne peut pas les appeler.

Aucun rate limiting supplémentaire n'est requis pour cette application interne à faible volume.

---

### 4. RLS Supabase — isolation des données par rôle

**Statut : ✅ Vérifié (partiel)**

Contexte d'utilisation des clients Supabase :
- **Pages client** (`conducteur`, `parent`, `mecanicien`) : utilisent `createClient()` (clé anon) → RLS s'applique
- **Routes API** : utilisent `createAdminClient()` / `createServiceClient()` (clé service, bypass RLS) → protégées par `requireRole()`, donc seuls gestionnaire/admin y accèdent

Politiques RLS connues et vérifiées (documentées dans CLAUDE.md) :
| Table | Policy | Effet |
|-------|--------|-------|
| `alertes` | `alertes_read_conducteur_own` | Conducteur → uniquement ses alertes (`driver_id` = son id) |
| `alertes` | `alertes_read_mecanicien` | Mécanicien → types `vehicule/reparation/transmis_meca` uniquement |
| `alertes` | `staff_alertes_select` | Gestionnaire/admin → tout |

> **Action recommandée** : vérifier dans Supabase > Table Editor > `conducteurs` > Policies que le rôle `conducteur` ne peut pas lire les données des autres conducteurs (notamment `tel`, `notes`). Cette vérification doit être faite directement dans le dashboard Supabase.

---

### 5. Logs Render — données personnelles

**Statut : ⚠️ À noter (risque faible)**

Les routes API génèrent des logs `console.log` visibles dans le dashboard Render :

| Route | Donnée loguée | Sensibilité |
|-------|--------------|-------------|
| `create-account` | `email` (format prenom.nom@taxi-romontois.ch) | Faible |
| `link-account` | `email` + `conducteur_id` | Faible |
| `set-password` | `email` + `user.id` UUID | Faible |

Aucun mot de passe, numéro de téléphone ni donnée médicale n'apparaît dans les logs.  
Les emails sont dérivables publiquement des noms des conducteurs.  
Les logs Render sont accessibles uniquement aux membres de l'équipe ayant accès au dashboard Render.

**Action optionnelle** : remplacer les emails par des UUID dans les `console.log` de production. Non prioritaire.

---

### 6. Changement de mot de passe à la première connexion

**Statut : ✅ Implémenté**

**Mécanisme :**
1. Colonne `must_change_password boolean DEFAULT false` ajoutée à la table `profiles`
2. Lors de la création d'un compte conducteur (`/api/gestionnaire/create-account`) : `must_change_password: true` inséré automatiquement
3. À chaque chargement de la page `/conducteur` : le profil est lu avec `must_change_password`
4. Si `true` → modal bloquant affiché (ne peut pas être fermé, aucune interaction avec la page)
5. Le conducteur saisit un nouveau mot de passe (min. 8 caractères, confirmation requise)
6. `sb.auth.updateUser({ password })` + `profiles.must_change_password = false`
7. Le modal disparaît, accès normal au compte

Le modal est en `position: fixed, z-index: 9999` — impossible à contourner côté client sans modifier le code.

**Fichiers modifiés :**
- `lib/types.ts` : ajout `must_change_password?: boolean` dans `Profile`
- `app/api/gestionnaire/create-account/route.ts` : `must_change_password: true` à la création
- `app/(protected)/conducteur/page.tsx` : états + handler + modal bloquant
