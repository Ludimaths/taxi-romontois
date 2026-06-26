# Checkpoint Final — Taxi Romontois
Date : 26 juin 2026

## Score global : 8.5/10

Plateforme fonctionnelle, build propre, sécurité des routes API correcte, Realtime cohérent sur tous les comptes. Les points restants sont du polish (fichiers volumineux, composants shadcn non utilisés) et des fonctionnalités roadmap non encore implémentées (agents IA, rapport auto à minuit).

---

## ✅ Ce qui fonctionne bien

- **Build de production propre** : `npm run build` compile les 32 routes sans erreur TypeScript.
- **Realtime cohérent** sur tous les comptes (gestionnaire, conducteur, mécanicien, admin, layout) — chaque page abonne les bonnes tables, `fetchAll`/`load`/`fetchCounts` en `useCallback`, cleanup `removeChannel`.
- **Sécurité des routes API** : toutes les routes mutantes (`export`, `import`, `set-password`, `create-account`, `link-account`) protégées par `requireRole(...)`. La route publique `vehicule/[token]` fait bien le lookup par `qr_token` (non devinable), pas par `id`.
- **Aucune clé API en clair** dans le code source (seuls des placeholders pédagogiques `sbp_xxx` / `eyJ...` dans CLAUDE.md et scripts).
- **Upload photos validé** : `validatePhotos()` appelé sur le `onChange` des deux inputs file du mécanicien, avant tout stockage (type + taille + nombre).
- **Inline styles** respectés partout dans l'applicatif ; Tailwind confiné à la landing `hero-195.tsx`.
- **Helpers dates centralisés** dans `lib/constants.ts` (`isoToday`, `fmtTime`, `fmtDateTime`, `fmtDate`).
- **Organisation messages** : groupement par jour avec séparateurs ("Aujourd'hui"/"Hier"/date), jours précédents repliés, dashboard limité à 3 items + bouton "Voir tout".

---

## ⚠️ Points à surveiller

- **Fichiers volumineux** (voir liste plus bas) : `mecanicien/page.tsx` (~1200 lignes) et `admin/page.tsx` (~1145 lignes) mélangent plusieurs onglets dans un seul fichier. Fonctionnel mais difficile à maintenir — candidat à un découpage en sous-composants (comme `conducteur/tabs/`).
- **Alertes conducteur** : canal Realtime séparé `cond-alertes-${condId}` filtré sur `event:"INSERT"` + `driver_id`. Choix délibéré et documenté (RLS sur FK integer), mais un **UPDATE** d'alerte (ex : marquage lu côté gestionnaire) ne rafraîchit pas en direct chez le conducteur. Impact mineur.
- **console.log serveur** dans les routes `create-account`, `link-account`, `set-password` : conservés volontairement car ce sont des logs d'audit d'invitation côté serveur (non exposés au client), pas du debug de dev.
- **Composants shadcn non référencés** : `ui/input.tsx`, `ui/label.tsx`, `ui/tracing-beam.tsx` ne sont importés nulle part. Non supprimés par prudence (règle audit : ne supprimer qu'à 100 % de certitude).

---

## ❌ Ce qui nécessite correction

Aucune correction bloquante restante après cet audit. Les corrections effectuées (voir dernière section) couvrent les manques Realtime et l'organisation des messages.

Reste optionnel / dette technique :
- `app/(protected)/mecanicien/page.tsx` — découper en sous-composants par onglet.
- `app/(protected)/admin/page.tsx` — idem.
- `components/ui/tracing-beam.tsx` — supprimable (mort) après confirmation qu'aucune feature future ne le prévoit.

---

## Realtime — état par compte

| Compte | Canal | Tables abonnées | Manque corrigé |
|---|---|---|---|
| Dashboard gestionnaire | `gest-rt` | incidents, conducteurs, vehicules, alertes, absences_enfants, absences_conducteurs, **service_logs**, **conges_demandes** | + service_logs, + conges_demandes |
| Incidents gest. | `gest-incidents-rt` | incidents, alertes | — (conforme) |
| Alertes gest. | `gest-alertes-rt` | alertes | — |
| Réparations gest. | `gest-rep-rt` | reparations, vehicules, alertes | — |
| Conducteur | `cond-rt` + `cond-alertes-${id}` | absences_enfants, incidents, service_logs, conges_demandes + alertes (canal filtré) | — (toutes tables couvertes) |
| Mécanicien | `meca-rt` | reparations, vehicules, alertes | — |
| Admin | `admin-rt` | conducteurs, vehicules, incidents, reparations, absences_conducteurs, conges_demandes | — |
| Layout (badges) | `layout-counts` | incidents, alertes, reparations | — |

---

## Fichiers > 400 lignes

| Lignes | Fichier |
|---|---|
| 1199 | app/(protected)/mecanicien/page.tsx |
| ~1145 | app/(protected)/admin/page.tsx |
| 952 | app/(protected)/gestionnaire/conducteurs/page.tsx |
| ~810 | app/(protected)/gestionnaire/page.tsx |
| 481 | app/(protected)/gestionnaire/vehicules/page.tsx |
| 479 | app/(protected)/parent/page.tsx |
| 466 | app/(protected)/conducteur/page.tsx |
| 433 | app/(protected)/gestionnaire/imprevus/page.tsx |
| 430 | app/(protected)/gestionnaire/parents/page.tsx |

(Lignes admin/gestionnaire augmentées de quelques lignes par l'ajout des groupements de messages.)

---

## Sécurité

| Check | Résultat |
|---|---|
| Routes API protégées par `requireRole()` | OK — export, import, set-password, create-account, link-account |
| Route publique `vehicule/[token]` | OK — lookup par `qr_token` (non devinable), pas par `id` |
| Clés en clair (`sbp_`, `eyJ`, `sk_`) dans le code | Aucune — seuls placeholders pédagogiques |
| `validatePhotos()` avant upload (mécanicien) | OK — appelé sur les 2 inputs file (type/taille/nombre) |
| Try/catch vides | Aucun trouvé |
| RLS alertes (conducteur own / mécanicien transmis_meca / staff all) | Conforme, non modifié |

---

## Recommandations avant présentation

1. Tester manuellement les 4 flux de messages groupés (conducteur, mécanicien, admin) avec des données sur plusieurs jours pour valider le repli/dépli.
2. Vérifier le rendu mobile du dashboard gestionnaire avec les boutons "Voir tout" (panels absents + absences enfants).
3. Préparer un jeu de données de démo propre (la roadmap prévoit le nettoyage des données de simulation APRÈS tests).
4. S'assurer que les variables `.env.local` (SUPABASE_*) sont bien configurées sur Render.

## Recommandations pour la suite

1. Découper `mecanicien/page.tsx` et `admin/page.tsx` en sous-composants par onglet (modèle `conducteur/tabs/`).
2. Implémenter les agents IA selon `docs/AGENTS_ROADMAP.md` (commencer par le rapport journalier auto à minuit — faible risque).
3. Supprimer les composants UI morts une fois la stratégie visuelle 2026 figée.
4. Étendre le canal Realtime alertes conducteur à `event:"*"` si le besoin d'UPDATE temps réel apparaît.

---

## Ce qui a été corrigé pendant cet audit

1. **Realtime dashboard gestionnaire** : ajout des abonnements `service_logs` et `conges_demandes` au canal `gest-rt`.
2. **Dashboard gestionnaire — panels** : limite à 3 items + bouton "Voir tout" pour les conducteurs absents ; limite à 3 + bouton "Voir les X absences" pour les absences enfants (était slice 6).
3. **Messages conducteur** (`conducteur/tabs/Messages.tsx`) : groupement par jour avec séparateurs ("Aujourd'hui"/"Hier"/date), tri récent→ancien, jour courant ouvert, jours précédents repliés avec bouton "Voir les X messages".
4. **Messages mécanicien** (`msgDecisions`) : même groupement par jour, jour courant ouvert par défaut.
5. **Messages admin** (`adminMsgs`) : même groupement par jour, jour courant ouvert par défaut.
6. **Qualité code** : suppression du helper local `isoToday` dupliqué dans `gestionnaire/incidents/page.tsx` → import depuis `lib/constants.ts`.
7. **Qualité code** : suppression de 6 `console.log` de debug `[doReceptionner]`/`[doReceptionnerDirect]` dans `mecanicien/page.tsx` (les `console.error` conservés).
8. **Documentation** : CLAUDE.md mis à jour (sidebar 9 → 12 onglets, ajout des tables `conges_demandes` et `messages_internes`).
9. **Documentation** : création de `docs/ARCHITECTURE.md` et `docs/AGENTS_ROADMAP.md`.
