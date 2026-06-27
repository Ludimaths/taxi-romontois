# Rapport de test — Compte Conducteur

**Date :** 27 juin 2026  
**Compte testé :** Stéphane Auguet — stephane.auguet@taxi-romontois.ch  
**Environnement :** https://taxi-romontois.onrender.com  
**Outil :** Playwright MCP (navigateur headless)

---

## Légende

| Symbole | Signification |
|---|---|
| ✅ | Fonctionne correctement |
| ⚠️ | Comportement attendu / remarque |
| ❌ | Bug identifié |

---

## 1. Navigation

| Point testé | Statut | Détail |
|---|---|---|
| Connexion compte conducteur | ✅ | Login email + mot de passe OK |
| Modal must_change_password | ✅ | Affiché à la première connexion si `must_change_password = true` en DB |
| Drawer hamburger visible | ✅ | Bouton en haut à droite, badge rouge avec compteur |
| 7 onglets dans le drawer | ✅ | Tableau de bord, Ma fiche, Mon service, Signalements, Messages, Historique, Congés |
| Navigation entre onglets | ✅ | Chaque onglet affiche le bon contenu, drawer se ferme |
| Déconnexion accessible | ✅ | Bouton "Déconnexion" en bas du drawer |

---

## 2. Tableau de bord

| Point testé | Statut | Détail |
|---|---|---|
| Statut conducteur | ✅ | "Disponible" affiché avec badge vert |
| Circuit assigné | ✅ | "Circuit Crocodile" avec emoji |
| Véhicule assigné | ✅ | Plaque affichée si assigné |
| Nombre d'enfants du circuit | ✅ | "6 enfants" affiché |
| Service du jour | ✅ | Carte "Service aujourd'hui" avec heure début/fin/durée |
| Bouton "Je prends mon service" | ✅ | Visible, déclenche modal de confirmation |
| Bouton "Je remplace un collègue" | ✅ | Visible, déclenche formulaire remplacement |
| Bouton "Je suis absent aujourd'hui" | ✅ | Visible, déclenche modal avec motif/notes |

---

## 3. Ma fiche

| Point testé | Statut | Détail |
|---|---|---|
| Infos conducteur affichées | ✅ | Nom, prénom, téléphone, circuit, véhicule |
| Modification téléphone | ✅ | Champ éditable avec sauvegarde |
| Enfants du circuit listés | ✅ | Liste des enfants avec infos contact |

---

## 4. Mon service

| Point testé | Statut | Détail |
|---|---|---|
| Prise de service | ✅ | "Je prends mon service" → modal confirmation → log créé en DB (`service_logs`) |
| Fin de service | ✅ | "Je termine mon service" → modal confirmation → log mis à jour |
| Remplacement | ✅ | "Je remplace un collègue" → formulaire circuit + véhicule + remplacé → 2 logs créés |
| Absence avec motif | ⚠️ | Bouton disponible uniquement sans service enregistré ce jour — comportement correct |
| Alerte remplacement gestionnaire | ✅ | Alerte `type:"conducteur"` créée pour le gestionnaire |

---

## 5. Signalements

| Point testé | Statut | Détail |
|---|---|---|
| Formulaire accessible | ✅ | Onglet Signalements → formulaire visible |
| Type "Panne" | ✅ | Sélectionnable |
| Type "Voyant" | ✅ | Sélectionnable |
| Type "Accident" | ✅ | Sélectionnable |
| Type "Retard" | ✅ | Sélectionnable + testé avec envoi réel |
| Type "Dégradation" | ✅ | Sélectionnable |
| Type "Enfant" | ✅ | Sélectionnable |
| Type "Parent" | ✅ | Sélectionnable |
| Type "Autre" | ✅ | Sélectionnable |
| Niveau d'urgence | ✅ | Normal / Urgent / Critique |
| Envoi du signalement | ✅ | Incident créé en DB + alerte gestionnaire |
| Badge immédiat sur l'onglet | ✅ | Badge "1" visible sur "Signalements" dans le drawer sans rechargement |

---

## 6. Messages

| Point testé | Statut | Détail |
|---|---|---|
| Contact gestionnaire visible | ✅ | Anes Akiki pré-sélectionné automatiquement (contact le plus récent) |
| Envoi de message | ✅ | Message envoyé, visible dans la conversation |
| Realtime — réception message | ✅ | Nouveau message reçu sans rechargement |
| Badge messages non lus | ✅ | Badge incrémenté en temps réel |

---

## 7. Congés

| Point testé | Statut | Détail |
|---|---|---|
| Formulaire "Nouvelle demande" | ✅ | Bouton ouvre le formulaire |
| Champ date de début | ✅ | Date picker fonctionnel (2026-08-10 testé) |
| Champ date de fin | ✅ | Date picker fonctionnel (2026-08-22 testé) |
| Champ motif | ✅ | Select avec 5 options : Congé payé, Maladie, Formation, Personnel, Autre |
| Champ justification | ✅ | Textarea avec validation min. 10 caractères, compteur affiché |
| Bouton désactivé si incomplet | ✅ | Grisé si dates manquantes ou justification < 10 caractères |
| Bouton actif si formulaire complet | ✅ | Vert et cliquable quand tout est renseigné |
| Envoi de la demande | ✅ | Demande créée en DB (`conges_demandes`) |
| Statut "En attente" immédiat | ✅ | Carte apparaît avec badge amber "En attente" sans rechargement |
| Dates affichées correctement | ✅ | "10/08/2026 → 22/08/2026" format fr-CH |
| Annuler | ✅ | Formulaire se ferme, aucune donnée envoyée |

---

## 8. Historique

| Point testé | Statut | Détail |
|---|---|---|
| Années scolaires listées | ✅ | "2025-2026 En cours" avec compteur entrées |
| Drill-down : Année → Mois | ✅ | Clic sur année → liste des mois avec compteur (ex: "Juin 1j") |
| Drill-down : Mois → Jours | ✅ | Clic sur mois → liste des jours avec heure début/fin/durée |
| Détail d'une journée | ✅ | "sam. 27 juin — Service effectué — 17:49 → 17:49 — 0h01" |
| Signalements liés visibles | ✅ | Signalement "Retard" visible dans la journée correspondante |
| Bouton PDF mensuel | ✅ | "Télécharger ce mois PDF" présent |
| Bouton PDF annuel | ✅ | "Télécharger mon historique PDF" présent |
| Navigation retour | ✅ | "← Années scolaires" et "← Juin 2025-2026" fonctionnels |

---

## 9. Sécurité — Isolation des rôles

| Route testée | Comportement attendu | Statut | Résultat |
|---|---|---|---|
| /gestionnaire | Redirection vers /conducteur | ✅ | Redirigé vers /conducteur |
| /admin | Redirection vers /conducteur | ✅ | Redirigé vers /conducteur |
| /mecanicien | Redirection vers /conducteur | ✅ | Redirigé vers /conducteur |

---

## 10. Responsive Mobile (390×844 px — iPhone 14)

| Point testé | Statut | Détail |
|---|---|---|
| Layout dashboard | ✅ | Responsive, cards en 2 colonnes, boutons pleine largeur |
| Header avec hamburger | ✅ | Logo + bouton menu avec badge |
| Drawer avec tous les onglets | ✅ | 7 onglets visibles : Tableau de bord, Ma fiche, Mon service, Signalements (badge 1), Messages, Historique, Congés |
| Badge signalements dans drawer | ✅ | Pastille rouge "1" visible |
| Déconnexion dans drawer | ✅ | Accessible en bas du drawer |
| Formulaire congés (mobile) | ✅ | Dates/motif/justification rendus correctement |

---

## Bugs identifiés et corrigés

Aucun bug bloquant détecté pendant cette session de tests.

---

## Remarques techniques

- **Inputs de type `date` en React** : la valeur doit être injectée via `nativeInputValueSetter` (React internal setter) pour déclencher le cycle de mise à jour de l'état contrôlé. Un simple `element.value = "..."` ne suffit pas.
- **Absence le jour du service** : le bouton "Je suis absent aujourd'hui" est masqué une fois qu'un service a été enregistré — comportement voulu (cohérence des données).
- **Auto-sélection contact Messages** : le contact avec le message le plus récent est automatiquement sélectionné à l'ouverture (UX #2 implémentée).

---

## Résumé

| Catégorie | Tests | Passés | Avertissements | Échecs |
|---|---|---|---|---|
| Navigation | 6 | 6 | 0 | 0 |
| Tableau de bord | 8 | 8 | 0 | 0 |
| Ma fiche | 3 | 3 | 0 | 0 |
| Mon service | 5 | 4 | 1 | 0 |
| Signalements | 11 | 11 | 0 | 0 |
| Messages | 4 | 4 | 0 | 0 |
| Congés | 11 | 11 | 0 | 0 |
| Historique | 8 | 8 | 0 | 0 |
| Sécurité | 3 | 3 | 0 | 0 |
| Mobile 390px | 6 | 6 | 0 | 0 |
| **TOTAL** | **65** | **64** | **1** | **0** |

**Conclusion : compte conducteur pleinement fonctionnel. 64/65 points validés, 1 avertissement (comportement attendu).**
