# DÉPLOIEMENT — ANGEMUU (migrations + Edge Function)

Ce document décrit les étapes nécessaires pour activer le flux de réservation :
1. Appliquer les migrations versionnées.
2. Déployer les Edge Functions qui gèrent la réservation et les actions Admin.
3. S'abonner aux notifications push (optionnel).

---

## 1. Prérequis

- CLI Supabase installée : `npm install -g supabase` (ou `npx supabase`).
- Être connecté : `supabase login`.
- Lier le projet : `supabase link --project-ref kskjalzggxaycfzfgspc`.

---

## 2. Appliquer les migrations

Les fichiers sont dans `supabase/migrations/` :

| Fichier | Contenu |
|---|---|
| `001_init_schema.sql` | Schéma complet (tables, fonctions RPC, policies RLS) — idempotent |
| `002_bookings_unique_slot_and_check.sql` | Contrainte UNIQUE partielle (anti doublon) + horaires 05:00–19:00 |
| `003_modification_requests_outbox.sql` | Demandes de modification et table outbox |
| `004_blog_cms.sql` | Champs CMS et policies du blog |
| `005_public_booking_availability.sql` | Conversion de `bookings.date/time` text en DATE/TIME, retrait de l’insertion publique directe, outbox et insertion atomique avec intervalle minimal de 6h |

```bash
supabase db push
```

> **Si la contrainte UNIQUE échoue** : des doublons actifs existent déjà. Nettoyez-les d'abord (voir la note en fin de `002_...sql`), puis relancez.

> **Avant l’application en production** : vérifiez le projet lié et l’état des migrations. La version de `save-booking` du dépôt dépend des deux RPC ajoutées dans `005_public_booking_availability.sql`.
>
> Si la conversion de `bookings.date/time` échoue, certaines anciennes valeurs ne sont pas des dates/heures valides. Corrigez ces lignes avant de relancer la migration. La colonne `bookings.id` int8 existante est conservée. Si l’ajout de `bookings_time_check` échoue, identifiez les réservations avant 05:00 ou après 19:00 et décidez de leur traitement avant de relancer.

---

## 3. Déployer les Edge Functions

```bash
supabase functions deploy save-booking --no-verify-jwt
supabase functions deploy admin-actions --no-verify-jwt
supabase functions deploy request-modification --no-verify-jwt
```

- `--no-verify-jwt` : la fonction est appelable par le site public (client anon) et valide elle-même les données.
- L’insertion utilise `create_booking_atomic`, avec la clé `service_role` côté serveur : vérification du créneau, du quota et des jours off, puis écriture de la réservation et de l’événement outbox dans une transaction.
- Les notifications email, WhatsApp admin et ntfy partent en arrière-plan ; elles ne bloquent pas l’accusé de réception de la réservation.

### Variable d'environnement

Dans le dashboard Supabase → **Edge Functions** → **Secrets** (secrets du projet) :

| Clé | Valeur | Défaut |
|---|---|---|
| `NTFY_TOPIC` | topic ntfy (ex. `angemuu-reservations`) | `angemuu-reservations` |
| `SUPABASE_SERVICE_ROLE_KEY` | clé secrète de service du projet Supabase | fournie par Supabase ; obligatoire pour `create_booking_atomic` |
| `RESEND_API_KEY` | clé API Resend | nécessaire aux courriels de demande et de confirmation |
| `RESEND_FROM` | expéditeur validé chez Resend, ex. `Ange Muu <contact@angemuu.net>` | valeur par défaut : `Angemuu <contact@angemuu.net>` |
| `ADMIN_EMAILS` | adresses de gestion séparées par des virgules | deux adresses Ange Muu sont prévues par défaut dans les fonctions |

Après confirmation dans l’Admin, `admin-actions` envoie un courriel récapitulatif à la cliente (si son adresse est renseignée) et aux adresses Ange Muu. La réponse de l’Admin indique si les courriels ont été acceptés par Resend. Une défaillance d’email ne révoque pas la confirmation déjà enregistrée.

---

## 4. S'abonner aux notifications push (ntfy)

1. Installer l'application **ntfy** (iOS / Android / desktop) : https://ntfy.sh/app.
2. S'abonner au topic : `https://ntfy.sh/<NTFY_TOPIC>` (ex. `https://ntfy.sh/angemuu-reservations`).
3. Chaque nouvelle réservation enverra une notification push « Nouvelle réservation Angemuu ».

> ⚠️ Le topic `ntfy.sh` est **public** (quiconque connaît le nom peut s'abonner). Pour un usage privé, auto-hébergez ntfy ou utilisez un topic peu devinable.

---

## 5. Vérifications

- **CSP** : aucun changement nécessaire — `staticwebapp.config.json` autorise déjà `connect-src ... supabase.co` (les fonctions sont sur ce domaine).
- **Parcours complet** : soumettre le formulaire public → la réservation apparaît dans l'Admin → notification push reçue.
- **Créneau occupé** : soumettre deux fois le même créneau → le second reçoit « Ce créneau est déjà réservé ».
- **Disponibilités publiques** : le calendrier et les créneaux utilisent la RPC `get_public_booking_availability` ; aucun nom, téléphone ou email de réservation n’est accessible publiquement.
- **Jour off et quota** : les contrôles sont répétés dans la transaction serveur, même si la page est contournée ou deux demandes arrivent en même temps.
- **WhatsApp** : après enregistrement réussi, un bouton visible permet à la cliente d’ouvrir un message prérempli ; aucune ouverture automatique bloquée par le navigateur.
- **Admin** : le filtre par statut et la pagination sont actifs.

---

## 6. Rappel des fichiers modifiés/créés

**Créés :**
- `supabase/migrations/001_init_schema.sql`
- `supabase/migrations/002_bookings_unique_slot_and_check.sql`
- `assets/js/supabase-client.js`
- `supabase/functions/save-booking/index.ts`

**Modifiés :**
- `assets/js/booking-submit.js` — états accessibles, gestion des erreurs, bouton WhatsApp après succès
- `assets/js/booking-calendar.js` et `assets/js/booking-slots.js` — disponibilité publique via RPC limitée aux dates/heures
- `supabase/functions/save-booking/index.ts` — validation serveur, RPC atomique et notifications non bloquantes
- `assets/js/booking-admin.js` — client déplacé, pagination/filtres
- `index.html` — charge `supabase-client.js` (plus `booking-admin.js`)
- `admin/index.html` — charge `supabase-client.js`, filtre de statut ajouté
