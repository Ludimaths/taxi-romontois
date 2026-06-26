# Architecture — Taxi Romontois

Application de gestion de transport scolaire (Fribourg, Suisse). Multi-rôle, temps réel, basée sur Supabase.

---

## 1. Stack technique

| Couche | Outil | Version | Rôle |
|---|---|---|---|
| Framework | Next.js | 16.2.9 (App Router) | Routing, SSR, API routes |
| UI | React | 19.2.4 | Composants |
| Langage | TypeScript | 5.x | Typage strict |
| Backend / DB | Supabase (Postgres) | JS 2.108.x | Données, Auth, Realtime, Storage |
| Auth SSR | @supabase/ssr | 0.12.x | Cookies / session côté serveur |
| Styles | Inline styles (`style={{...}}`) | — | **Aucune classe Tailwind dans les composants applicatifs** |
| Tailwind CSS | 4.x | installé | Utilisé uniquement dans la landing publique (`hero-195.tsx`) |
| Icônes | lucide-react | — | Icônes (remplacent progressivement les emojis) |

Hébergement : Render (le build `npm run build` doit être propre, les erreurs TS font échouer le déploiement).

---

## 2. Structure des dossiers (ligne par ligne)

```
app/
  layout.tsx                          Root layout (html/body, fonts, cn de lib/utils)
  page.tsx                            Landing publique → <Hero195/>
  login/page.tsx                      Page de connexion (email + mot de passe)
  auth/callback/route.ts              Échange code OAuth/magic-link → session
  scan/[token]/page.tsx               Page publique de scan QR véhicule (par qr_token)

  (protected)/                        Groupe de routes protégées (auth requise)
    layout.tsx                        Server Component : vérifie auth + charge le profil
    ProtectedLayoutClient.tsx         Client : sidebar desktop + header mobile + badges Realtime
    gestionnaire/
      page.tsx                        Dashboard (métriques cliquables + panels urgents)
      rapport/page.tsx                Rapport journalier / semaine / mois
      imprevus/page.tsx               Envoi d'imprévus ciblés par rôle
      conducteurs/page.tsx            Liste + fiches conducteurs, génération mots de passe
      vehicules/page.tsx              Flotte
      circuits/page.tsx               54 circuits
      parents/page.tsx                Fiches parents + enfants
      incidents/page.tsx              Incidents (catégorie, statuts, historique)
      alertes/page.tsx                Alertes système
      reparations/page.tsx            Suivi réparations (vue gestionnaire)
      export/page.tsx                 Exports PDF/Excel par rubrique
      messages/page.tsx               Messagerie directe gestionnaire
    conducteur/
      page.tsx                        Tableau de bord conducteur (orchestre les tabs)
      tabs/                           Dashboard / Fiche / Service / Signalements / Messages / Historique / Conges
      tabs/shared.tsx                 Types et constantes partagés entre tabs (SIGN_TYPES…)
      vehicules/page.tsx              Fiche véhicule (vue conducteur)
    mecanicien/page.tsx               Atelier : alertes / atelier / prêts / historique / messages
    admin/
      page.tsx                        Dashboard / stats / validation budget / historique / messages
      conducteurs|vehicules|qrcodes|export/page.tsx
    parent/page.tsx                   Espace parent

  api/
    vehicule/[token]/route.ts         Publique — lookup véhicule par qr_token (admin client)
    export/route.ts                   requireRole(gestionnaire/admin/mecanicien)
    import/route.ts                   requireRole(gestionnaire/admin)
    admin/set-password/route.ts       requireRole(gestionnaire/admin) — invitation / reset
    gestionnaire/create-account/route.ts  requireRole — crée le compte Auth d'un conducteur
    gestionnaire/link-account/route.ts    requireRole — lie un compte Auth existant

components/
  Sidebar.tsx                         Sidebar desktop (NAV_ITEMS par rôle, badges)
  MessagerieBox.tsx                   Messagerie directe réutilisable (messages_internes)
  ui/index.tsx                        Composants UI applicatifs (Badge, Avatar, Card, Btn, Modal…)
  ui/hero-195.tsx                     Landing publique (seul fichier autorisé en classes Tailwind)
  ui/{button,card,tabs,border-beam}.tsx  Dépendances de hero-195
  ui/{input,label,tracing-beam}.tsx   Composants shadcn générés — actuellement non référencés

lib/
  types.ts                            Tous les types TS (Role, Conducteur, Vehicule, Alerte…)
  constants.ts                        Couleurs C, CIRCUITS_DATA, VEHICLES_DATA, helpers dates
  utils.ts                            cn() (clsx + tailwind-merge) — pour hero-195 et root layout
  supabase/client.ts                  createClient() navigateur
  supabase/server.ts                  createClient() serveur + createAdminClient() (service role)
  auth-guard.ts                       requireRole(allowedRoles) pour les routes API

docs/
  ARCHITECTURE.md                     Ce fichier
  AGENTS_ROADMAP.md                   Architecture prévue des agents IA
  SECURITE.md                         Notes sécurité
  CHECKPOINT_FINAL.md                 Rapport d'audit
```

---

## 3. Flux de données entre les rôles

```
                          ┌─────────────┐
                          │    ADMIN    │  validation budget, stats globales
                          └──────┬──────┘
                       ┌─────────┴─────────┐
                       │                   │
                ┌──────┴──────┐     ┌──────┴──────┐
                │ GESTIONNAIRE│◄───►│  MÉCANICIEN │  réparations, montants
                └──────┬──────┘     └─────────────┘
                       │
                ┌──────┴──────┐
                │ CONDUCTEURS │  signalements, absences, congés
                └──────┬──────┘
                       │
                ┌──────┴──────┐
                │   PARENTS   │  absences enfants, messages
                └─────────────┘
```

Canaux de communication (table `alertes` sauf mention) :

| De → Vers | Mécanisme |
|---|---|
| Gestionnaire → Conducteur | alerte `remplacement` (driver_id), `imprévu` |
| Gestionnaire → Mécanicien | alerte `transmis_meca` |
| Conducteur → Gestionnaire | `incidents` + alerte `conducteur` |
| Conducteur → Gestionnaire | `conges_demandes` (validation) |
| Mécanicien → Gestionnaire/Admin | `reparations` + alertes |
| Mécanicien → Admin | alerte validation budget (> seuil) |
| Parent → Gestionnaire | `absences_enfants`, messages |
| Tout rôle ↔ Tout rôle autorisé | `messages_internes` (MessagerieBox) |

Toutes les pages se synchronisent via **Supabase Realtime** : chaque page ouvre un canal nommé unique et s'abonne aux `postgres_changes` des tables pertinentes, déclenchant un re-fetch (`fetchAll`/`load` wrappé en `useCallback`).

---

## 4. Tables Supabase et relations

```
auth.users ──1:1── profiles ──┐
                              ├─ profiles.conducteur_id ─► conducteurs.id
                              └─ profiles.enfant_id      ─► enfants.id

cercles_scolaires ─1:N─ circuits ─1:N─ enfants
cercles_scolaires ─1:N─ conducteurs
circuits ─1:1/0─ vehicules ─0:1─ conducteurs

absences_enfants     ─► enfants, circuits
absences_conducteurs ─► conducteurs (conducteur_id, remplacant_id), circuits
service_logs         ─► conducteurs, vehicules, circuits
incidents            ─► vehicules, conducteurs, circuits
alertes              ─► conducteurs (driver_id), vehicules (vehicle_id)
reparations          ─► vehicules
conges_demandes      ─► conducteurs
messages_internes    ─► expediteur_id (profiles), destinataire_role
```

Jointures FK multiples sur la même table : aliaser avec le nom de colonne FK, ex.
`conducteur:conducteurs!conducteur_id(prenom,nom)` et `remplacant:conducteurs!remplacant_id(prenom,nom)`.

RLS : `alertes` filtrées par rôle/destinataire (conducteur lit ses `driver_id`, mécanicien lit `transmis_meca`, staff lit tout). Ne pas modifier sans revue.

---

## 5. Comment ajouter un nouveau rôle

1. **Type** : ajouter la valeur au type `Role` dans `lib/types.ts`.
2. **Navigation** : ajouter une entrée dans `NAV_ITEMS` (`components/Sidebar.tsx`) — ou laisser vide pour un header mobile seul.
3. **Routing** : créer `app/(protected)/<role>/page.tsx`. Le `layout.tsx` serveur charge déjà `profiles.role` et le passe à `ProtectedLayoutClient`.
4. **Redirection post-login** : ajouter le cas dans la logique de redirection (`app/page.tsx` / login) qui route selon `profiles.role`.
5. **RLS** : créer les policies Supabase pour les tables que ce rôle doit lire/écrire.
6. **Realtime** : dans la page du rôle, ouvrir un canal nommé unique et s'abonner aux tables pertinentes (pattern `useCallback` + `removeChannel` au cleanup).

---

## 6. Comment ajouter une nouvelle fonctionnalité

1. **Vérifier l'absence de doublon** : `Get-ChildItem -Recurse | Where-Object { $_.Name -like "*nom*" }`.
2. **Types** : déclarer/étendre les types dans `lib/types.ts`.
3. **Table Supabase** : créer la table + RLS si besoin de persistance.
4. **Page / composant** : inline styles uniquement, couleurs depuis `C` (`lib/constants.ts`), composants UI depuis `@/components/ui`.
5. **Helpers dates** : réutiliser `isoToday`, `fmtTime`, `fmtDateTime`, `fmtDate` de `lib/constants.ts` (ne pas redéfinir localement).
6. **Realtime** : abonner les tables concernées dans la page, `fetchAll` en `useCallback`.
7. **Route API** (si mutation serveur/service role) : protéger avec `requireRole([...])` de `lib/auth-guard.ts`.
8. **Incidents actifs** : filtrer avec `.neq("status","resolu")`.
9. **Encodage** : éditer les `.tsx` en UTF-8 sans BOM (PowerShell : `[System.IO.File]::WriteAllText` avec `UTF8Encoding $false`).
10. **Build** : `npm run build` doit passer avant tout push.
```
