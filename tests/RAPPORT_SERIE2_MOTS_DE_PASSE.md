# Rapport Série 2 — Système Mots de Passe Conducteurs
Date : 27 juin 2026

---

## Résumé exécutif

**Bug critique découvert et corrigé** : La colonne `photo_url` n'existait pas dans la table `profiles`, causant une erreur 400 sur chaque appel `fetchHistory`. La valeur `profile` était toujours `null`, ce qui masquait le statut "Compte actif" pour tous les conducteurs déjà liés.

**Correction appliquée** (commit `5648cf6`) :
- Suppression de `photo_url` du SELECT profiles dans `fetchHistory`
- Remplacement de `.single()` par `.maybeSingle()`
- Suppression de la fonction `handlePhotoUpload` (référençait une colonne inexistante)
- Suppression de l'interface `photo_url` dans le type `profile`

---

## CAS 1 — Aucun compte Auth existant

**Conducteur testé** : Nouveau TestCas1 (conducteur de test créé puis supprimé)

| Critère | Résultat |
|---------|---------|
| UI affiche "Aucun compte lié" (amber) | ✅ |
| Bouton vert "Créer le compte + mot de passe" visible | ✅ |
| Email auto-généré : `nouveau.testcas1@taxi-romontois.ch` | ✅ |
| Mot de passe 12 caractères crypto affiché une seule fois | ✅ `gquHB#hgM5Eu` |
| Bouton "Copier" présent | ✅ |
| Avertissement amber "Notez ce mot de passe..." | ✅ |
| 0 erreurs console | ✅ |

**Flux** : `create-account` API → `auth.admin.createUser()` → INSERT profile avec `must_change_password: true`

---

## CAS 2 — Compte Auth existant, non lié au profil conducteur

**Conducteur testé** : Stéphane Auguet (`stephane.auguet@taxi-romontois.ch`)

| Critère | Résultat |
|---------|---------|
| UI affiche "Aucun compte lié" (amber) | ✅ |
| Clic "Créer le compte" → message "Un compte existe déjà, cliquez sur Lier" | ✅ |
| Bouton "Lier le compte existant" apparaît | ✅ |
| Clic "Lier le compte existant" → profile lié en DB | ✅ (confirmé Cas 3) |
| Mot de passe mis à jour via `link-account` API | ✅ |
| 0 erreurs console | ✅ |

**Flux** : `create-account` retourne 500 "User already registered" → client affiche erreur + bouton Lier → `link-account` API → `listUsers()` + UPDATE/INSERT profil + `auth.admin.updateUserById()` password

---

## CAS 3 — Compte déjà lié

**Conducteur testé** : Stéphane Auguet (après liaison Cas 2), José Barcia, Omar Benhalima, Olivier Bettex

| Critère | Résultat |
|---------|---------|
| Badge vert "Compte actif" visible | ✅ |
| Email du conducteur affiché en monospace | ✅ `stephane.auguet@taxi-romontois.ch` |
| Bouton "Générer un mot de passe" (navy) | ✅ |
| Clic → mot de passe 12 caractères affiché | ✅ `xUm#pafjETkT` |
| Bouton "Copier" présent | ✅ |
| Avertissement amber "Notez ce mot de passe..." | ✅ |
| `must_change_password: true` mis à jour en DB | ✅ (via `set-password` API) |
| 0 erreurs console | ✅ |

**Flux** : `set-password` API → `auth.admin.updateUserById()` + UPDATE profiles `must_change_password: true`

---

## CAS 4 — Première connexion conducteur (must_change_password = true)

**Conducteur testé** : Stéphane Auguet (`stephane.auguet@taxi-romontois.ch`)
**Mot de passe généré** : `xUm#pafjETkT`

| Critère | Résultat |
|---------|---------|
| Connexion réussie avec mot de passe généré | ✅ |
| Redirection vers `/conducteur` | ✅ |
| Modal bloquant "Changement de mot de passe requis" affiché | ✅ |
| Dashboard en arrière-plan visible mais inaccessible | ✅ |
| Validation : mot de passe < 8 caractères refusé | ✅ (minimum 8 requis) |
| Validation : confirmation différente refusée | ✅ |
| Nouveau mot de passe saisi : `Romontois2026!` | ✅ |
| Clic "Confirmer le mot de passe" → `sb.auth.updateUser()` | ✅ |
| `must_change_password: false` mis à jour en DB | ✅ |
| Modal fermée → dashboard conducteur accessible | ✅ |
| 0 erreurs console | ✅ |

---

## Corrections apportées pendant les tests

### 1. `photo_url` colonne inexistante (commit `5648cf6`)
- **Symptôme** : 400 sur `profiles?select=id,role,photo_url` → `profile` toujours null → "Aucun compte lié" même pour les conducteurs liés
- **Fix** : Suppression de `photo_url` du SELECT, passage à `maybeSingle()`
- **Impact** : Cas 3 maintenant fonctionnel (affiche "Compte actif")

### 2. RLS `messages_internes` (commit `d78c97f`, Série 1)
- Déjà corrigé en Série 1

---

## Architecture des APIs mot de passe

```
Cas 1 : /api/gestionnaire/create-account
  → auth.admin.createUser({ email, password, email_confirm: true })
  → profiles INSERT { conducteur_id, must_change_password: true }

Cas 2 : /api/gestionnaire/link-account
  → auth.admin.listUsers() → find by email
  → profiles UPDATE { conducteur_id, must_change_password: true }
  → auth.admin.updateUserById({ password })

Cas 3 : /api/admin/set-password
  → auth.admin.updateUserById({ password })
  → profiles UPDATE { must_change_password: true }

Cas 4 (client) : sb.auth.updateUser({ password })
  → profiles UPDATE { must_change_password: false }
```

---

## Conclusion

- **Cas 1** ✅ — Création compte + mot de passe en une action
- **Cas 2** ✅ — Liaison compte existant + mot de passe en une action
- **Cas 3** ✅ — Affichage "Compte actif" + réinitialisation mot de passe
- **Cas 4** ✅ — Modal bloquant première connexion → changement forcé → accès accordé
- **0 erreurs console** sur toutes les opérations après correction `photo_url`
