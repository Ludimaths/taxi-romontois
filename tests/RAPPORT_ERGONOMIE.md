# Rapport Ergonomie & UX — Taxi Romontois
Date : 27 juin 2026 | Base : tests Playwright en session

---

## 1. Parcours avec plus de 3 clics pour une action simple

### Messagerie — envoyer un message (5 clics)
```
Sidebar "Messages" → choisir un rôle (menu) → faire défiler la liste
→ cliquer sur le destinataire → saisir le texte → cliquer "Envoyer"
```
Problème : la liste de destinataires est plate et non filtrée. Si on veut envoyer à un conducteur spécifique parmi 53, il faut défilement + clic de sélection avant même d'écrire.

### Fiche conducteur — accéder aux congés en attente (4 clics)
```
Sidebar "Conducteurs" → cliquer le conducteur → onglet "Congés"
→ voir les demandes → valider/refuser
```
La bannière ambrée "X demande(s) en attente" aide (elle raccourcit à 1 clic), mais uniquement quand l'onglet Congés est la destination. Pour d'autres onglets (Absences, Remplacements), pas de raccourci.

### Générer un mot de passe conducteur (3 clics — limite)
```
Sidebar "Conducteurs" → cliquer le conducteur → bouton "Générer un mot de passe"
```
Acceptable, mais si le gestionnaire cherche le conducteur par nom, il faut d'abord utiliser la recherche → 4 clics.

### Rapport journalier — changer de période (3–4 clics)
```
Sidebar "Rapport" → cliquer "Semaine" ou "Mois"
→ les données s'affichent → revenir à "Jour" pour retrouver les remplacements
```
Le filtre Jour/Semaine/Mois est bien placé. La friction vient du fait que certaines sections (ex: "Remplacements du jour") n'existent que sur le mode Jour — pas de message d'avertissement si on bascule.

---

## 2. Informations importantes nécessitant trop de scroll

### Dashboard gestionnaire — urgences sous le fold
Le dashboard charge **6 stat-cards** en premier (Véhicules, Conducteurs, Absents, Incidents, Alertes, Circuits). Les panels critiques — conducteurs absents non remplacés, incidents ouverts — arrivent **en dessous**, nécessitant de faire défiler sur tout écran < 900px de hauteur.

**Impact** : un gestionnaire qui ouvre l'app le matin peut manquer une urgence si la page ne défile pas.

### Fiche conducteur — ACCÈS CONDUCTEUR bas dans le panneau gauche
La section ACCÈS CONDUCTEUR (création mot de passe) est en bas de la carte gauche. Sur une fiche avec beaucoup d'infos véhicule/circuit/permis, il faut défiler pour la voir.

### MessagerieBox — historique des messages
Dans la boîte de messagerie, les messages récents sont en bas (ordre chronologique). Sur une conversation longue, le défilement automatique vers le bas n'est pas garanti — les anciens messages occupent l'écran au chargement.

---

## 3. Messages d'erreur — état actuel

| Contexte | Message | Qualité |
|----------|---------|---------|
| Compte déjà existant (create-account) | "Un compte existe déjà avec cet email — cliquez sur 'Lier le compte existant'" | ✅ Clair, actionnable |
| Compte non trouvé (link-account) | "Aucun compte Auth trouvé pour X. Créez d'abord le compte." | ✅ Clair |
| Mot de passe trop court (Cas 4) | "Minimum 8 caractères" | ✅ Clair |
| Mots de passe différents (Cas 4) | "Les mots de passe ne correspondent pas" | ✅ Clair |
| Confirmation suppression conducteur | Dialog natif `confirm()` du navigateur | ⚠️ Non stylisé, rupture visuelle |
| Erreurs réseau Supabase | Rarement affichées à l'utilisateur — silencieuses | ❌ L'UI reste dans l'état précédent sans feedback |
| Formulaire vide (DriverForm) | Bouton Enregistrer désactivé si nom/prénom vides | ✅ Preventif, pas d'erreur à afficher |
| Connexion échouée (login) | Message Supabase brut en anglais possible | ⚠️ Dépend du message d'erreur Supabase |

---

## 4. Observations UX complémentaires

### Ce qui fonctionne bien
- **Badges realtime** sur incidents et alertes dans la sidebar — feedback immédiat
- **Modal bloquant mot de passe** (Cas 4) — sécurité sans friction excessive
- **Tabs** sur la fiche conducteur — organisation claire des 6 sections
- **Password affiché une seule fois** avec bouton Copier — UX sécurisée et claire
- **Recherche conducteur** avec filtre par statut en temps réel

### Frictions observées
- Sur mobile (conducteur), le menu hamburger est en haut à droite mais le drawer s'ouvre à droite — peu intuitif pour les utilisateurs qui attendent un menu de gauche
- La liste de 53 conducteurs sur gestionnaire n'a pas de tri autre qu'alphabétique — pas de tri par statut ou cercle scolaire
- Les badges "Incomplet" sur les conducteurs n'indiquent pas ce qui manque — l'utilisateur doit ouvrir la fiche pour le savoir

---

## 5. Top 5 améliorations ergonomiques prioritaires

### Priorité 1 — Panels urgences en haut du dashboard
**Problème** : conducteurs absents non remplacés et incidents critiques sont sous le fold.
**Solution** : afficher d'abord une bande "Urgences du jour" (si non vide), puis les stat-cards.
**Gain** : le gestionnaire voit immédiatement les problèmes à traiter au chargement.

### Priorité 2 — Recherche dans la MessageriBox
**Problème** : trouver un conducteur parmi 53 nécessite de défiler dans une liste plate.
**Solution** : ajouter un champ `<input type="search">` au-dessus de la liste des destinataires, filtrant en temps réel.
**Gain** : envoyer un message passe de 5 clics à 3 clics.

### Priorité 3 — Modale de confirmation stylisée (remplacer `confirm()`)
**Problème** : le dialog natif du navigateur casse l'identité visuelle et bloque le thread JS.
**Solution** : utiliser le composant `Modal` existant avec un bouton rouge "Supprimer" et affichage du nom de l'élément.
**Gain** : cohérence visuelle + possibilité d'ajouter des détails sur ce qui sera supprimé.

### Priorité 4 — Indicateur de non-lu sur "Messages" et "Congés" dans la sidebar
**Problème** : les messages non lus et congés en attente ne sont pas signalés dans la sidebar — l'utilisateur doit naviguer pour le découvrir.
**Solution** : étendre le système de badges existant (incidents, alertes) aux messages non lus et demandes de congés en attente, en utilisant le même Realtime.
**Gain** : réduction des actions manquées, même structure technique déjà en place.

### Priorité 5 — Tooltip sur "Incomplet" expliquant ce qui manque
**Problème** : le badge "Incomplet" sur les conducteurs ne dit pas ce qui manque (circuit ? véhicule ? permis ?).
**Solution** : au survol du badge (ou en petite ligne sous le nom), lister les champs manquants : "Manque : circuit, permis".
**Gain** : le gestionnaire peut identifier et corriger les lacunes directement depuis la liste, sans ouvrir chaque fiche.

---

## Conclusion

L'ergonomie générale est **fonctionnelle et cohérente** pour un outil de gestion interne. Les parcours principaux (prendre service, signaler absence, gérer incident) sont bien optimisés en 2–3 clics. Les 5 améliorations ci-dessus réduiraient la friction quotidienne du gestionnaire et amélioreraient la réactivité aux urgences.
