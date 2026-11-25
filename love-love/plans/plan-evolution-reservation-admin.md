# Plan d’évolution — réservation et espace Admin Ange Muu

**Statut :** phase 1 préparée dans le dépôt ; migration et fonction à déployer avant validation en ligne  
**Objectif :** fiabiliser les réservations et rendre le parcours client et l’espace Admin plus clairs, tout en gardant le site statique et Supabase.

**Schéma confirmé par la capture Supabase :** `bookings.id` est `int8`, `date` et `time` sont actuellement `text`. Les migrations sont alignées sur l’identifiant entier ; la migration 005 convertit `date` et `time` vers leurs types PostgreSQL natifs avant de créer les fonctions de disponibilité.

## Principes

- Garder le site HTML/CSS/JavaScript actuel, Supabase, Azure Static Web Apps et Resend déjà présents.
- Concevoir le site et les courriels pour plusieurs langues. Ne pas coder l’expérience comme francophone uniquement ; centraliser les libellés pour pouvoir ajouter les langues retenues.
- Enregistrer la réservation dans la base avant de proposer une conversation WhatsApp. Une réservation en attente n’est pas présentée comme confirmée.
- Le bouton WhatsApp est une action claire après succès, jamais une condition pour que la réservation existe.
- Garder l’envoi des courriels côté serveur. Ne placer aucun secret d’API dans le navigateur.
- Utiliser Docker pour un environnement local reproductible, sans exposer l’environnement de développement sur Internet.
- Ajouter des dépendances seulement quand elles résolvent un besoin précis.

## Phase 1 — Fiabiliser la réservation

**Travail prévu**

- Corriger les erreurs du formulaire et afficher des messages compréhensibles au lieu d’alertes techniques.
- Éviter le blocage de la fenêtre WhatsApp par le navigateur : afficher un bouton WhatsApp après l’enregistrement réussi, avec un message prérempli et le récapitulatif.
- Vérifier les réponses et erreurs réseau de l’Edge Function ; empêcher un message de succès trompeur si aucune réservation n’a été enregistrée.
- Appliquer les règles de disponibilité côté serveur : dates passées, jours off, créneaux de 05:00 à 19:00, au moins 6 heures entre deux rendez-vous et maximum actuel de deux rendez-vous par jour.
- Rendre atomiques les règles de capacité, afin que deux demandes simultanées ne dépassent pas les limites.
- Empêcher les soumissions répétées et préserver les données saisies lorsqu’une erreur récupérable survient.

**Résultat attendu :** la cliente sait si sa demande est enregistrée, peut contacter le salon avec un geste explicite, et la disponibilité reste correcte même si elle contourne l’interface.

## Phase 2 — Refaire le parcours client en étapes

**Étapes proposées**

1. Choisir le service ou le type de coiffure.
2. Ajouter une photo d’inspiration ou un lien (facultatif).
3. Choisir une date et un créneau disponible.
4. Saisir ses coordonnées et le lieu.
5. Vérifier le récapitulatif et envoyer la demande.

**Travail prévu**

- Ajouter une progression visuelle, des boutons précédent/suivant et une validation par étape.
- Rendre le parcours utilisable au clavier et sur mobile, avec des libellés et erreurs accessibles.
- Permettre l’aperçu et le retrait d’une photo avant envoi ; limiter formats et taille.
- Enregistrer l’image dans Supabase Storage avec accès contrôlé. Garder le lien comme option sans téléverser l’image.
- Après enregistrement, montrer le statut « demande envoyée / en attente », le récapitulatif et le bouton « Continuer sur WhatsApp ».
- Exiger une adresse email valide et présenter l’étape d’acompte avant l’envoi final : expliquer que la cliente doit contacter Ange Muu sur WhatsApp, recueillir son accord explicite, puis permettre de continuer.
- Planifier un rappel email stylisé cinq minutes après chaque réservation, avec un bouton WhatsApp prérempli. Utiliser Supabase Cron, une file durable et des tentatives idempotentes; envoyer aussi si le rendez-vous est à moins d’une semaine, selon la décision de la cliente.

**Résultat attendu :** un formulaire court, guidé et rassurant, adapté aux clientes qui ne savent pas quoi écrire dans WhatsApp.

## Phase 3 — Rendre l’espace Admin efficace

**Travail prévu**

- Revoir la hiérarchie visuelle : prochaines réservations en premier, statuts lisibles, détails importants visibles sans ouvrir plusieurs zones.
- Rendre les tris prévisibles (date/heure, date de création, nom) et les filtres combinables (statut, période, service), avec pagination et remise à zéro simple.
- Montrer les résultats du filtre, les états vides, le chargement et les erreurs.
- Remplacer l’impression que « confirmer ne fait rien » par un état de traitement puis un résultat explicite : confirmation enregistrée, courriel en cours/envoyé ou à réessayer.
- Désactiver les boutons pendant une action et empêcher une double confirmation.
- Afficher la photo ou le lien d’inspiration avec la réservation.

**Résultat attendu :** la personne qui gère le salon sait quelle action a réussi et retrouve rapidement une réservation.

## Phase 4 — Courriels transactionnels élégants et fiables

**Courriels prévus**

- À la demande : accusé de réception à la cliente et notification à la boîte de réception Ange Muu.
- À la confirmation par l’Admin : beau courriel minimaliste à la cliente et notification à l’adresse de gestion du salon.
- Prévoir ensuite refus, annulation et modification selon la décision métier.

**Travail prévu**

- Créer des modèles HTML responsives et cohérents avec la marque, avec des traductions par langue : logo/nom, typographie lisible, récapitulatif, statut, bouton de contact.
- Envoyer le courriel de confirmation seulement après l’enregistrement réussi du statut `confirmed`.
- Enregistrer les événements à traiter et les erreurs d’envoi ; permettre une nouvelle tentative sans confirmer deux fois ni envoyer des doublons.
- Contrôler la réponse de Resend au lieu de considérer l’envoi réussi parce que la requête a été tentée.
- Vérifier les liens du courriel : la page `modification.html` référencée actuellement doit être créée ou son lien retiré jusqu’à ce qu’elle existe.

**Résultat attendu :** des messages professionnels pour la cliente et Ange Muu, avec un état traçable si le fournisseur email échoue.

## Phase 5 — Utiliser Docker pour le développement local

**Socle proposé**

- Installer Docker Desktop et utiliser le [Supabase CLI](https://github.com/supabase/cli) pour démarrer localement Postgres, Auth, Storage et les Edge Functions.
- Versionner les changements de base dans `supabase/migrations/` et préparer des données de démonstration sans données de vraies clientes.
- Utiliser l’instance locale Mailpit fournie par l’environnement Supabase pour prévisualiser les courriels sans les envoyer à de vraies boîtes.
- Documenter quelques commandes simples pour démarrer/arrêter le projet, réinitialiser la base locale, voir les courriels et consulter les journaux.
- T’accompagner progressivement dans Docker : comprendre image, conteneur, port, volume et variable d’environnement ; démarrer/arrêter la pile Supabase avec le CLI ; inspecter les conteneurs et leurs journaux avec Docker. Le CLI pilote sa propre pile locale, donc on évitera de gérer ces conteneurs à la main ou d’ajouter un `compose.yaml` redondant.
- Garder les secrets locaux dans des fichiers ignorés par Git ; fournir uniquement un `.env.example` sans valeurs secrètes.
- Ne pas auto-héberger Supabase ou n8n en production par défaut : cela ajouterait la maintenance, la sauvegarde et la sécurité à gérer.

**Résultat attendu :** l’application peut être développée et vérifiée dans un environnement local reproductible, sans risquer les données de production.

## Phase 6 — Vérification et mise en ligne

- Vérifier les cas usuels et les erreurs : créneau déjà pris, jour off, quota journalier, erreur réseau, clic répété, email manquant ou envoi email indisponible.
- Vérifier le parcours sur téléphone et ordinateur, ainsi que l’aperçu des courriels.
- Appliquer les migrations et déployer les fonctions après revue de leur cible et des secrets nécessaires.
- Faire une réservation de bout en bout en environnement de test, puis une vérification contrôlée en production.
- Vérifier que la boîte de réception Ange Muu reçoit les courriels et que le bouton WhatsApp ouvre le bon destinataire et le bon texte.

## Outils examinés sur GitHub

| Outil | Usage dans le projet | Licence / coût et décision |
|---|---|---|
| [Supabase CLI](https://github.com/supabase/cli) | Développement local, migrations, Edge Functions ; s’appuie sur Docker pour la pile locale. | Dépôt MIT. Recommandé ; le service Supabase hébergé reste un service distinct potentiellement payant selon le plan. |
| [Mailpit](https://github.com/axllent/mailpit) | Capturer et prévisualiser les courriels pendant le développement, sans les envoyer. | MIT, open source et local. Recommandé pour le développement ; ne remplace pas un fournisseur email en production. |
| [React Email](https://github.com/resend/react-email) | Construire des modèles email réutilisables si le projet adopte un petit processus de build pour les emails. | MIT et fonctionne avec différents fournisseurs. Optionnel : le site n’a pas actuellement de build, donc un modèle HTML simple peut suffire au départ. |
| [n8n](https://github.com/n8n-io/n8n) | Automatisations visuelles et intégrations externes, si elles deviennent nécessaires. | Le dépôt indique une licence Sustainable Use / fair-code, et non une licence open source OSI. Auto-hébergement gratuit sous certaines conditions, mais maintenance à prévoir. Pas nécessaire pour les notifications actuelles. |

Les outils libres ne rendent pas automatiquement gratuits l’hébergement du site, l’envoi de courriels ou l’API WhatsApp. La plateforme WhatsApp Business offre l’API Cloud officielle et ses tarifs sont à vérifier avant activation. Un message WhatsApp client automatique demande aussi une configuration Business appropriée et les consentements requis. Pour le parcours actuel, le bouton WhatsApp prérempli reste l’option sans intégration API et sans dépendre de l’envoi automatique.

## Ordre recommandé

1. Phase 1 : corriger les erreurs de réservation et sécuriser les règles.
2. Phase 3 et Phase 4 : rendre la confirmation Admin fiable et déclencher les courriels correctement.
3. Phase 2 : construire le parcours client guidé une fois le fonctionnement serveur stable.
4. Phase 5 : mettre en place l’environnement Docker local et la prévisualisation email pour soutenir les changements.
5. Phase 6 : valider le parcours complet avant chaque mise en ligne.

Les phases pourront être ajustées ensemble avant de commencer leur implémentation.
