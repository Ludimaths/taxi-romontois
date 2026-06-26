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
