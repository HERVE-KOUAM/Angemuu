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
| `006_booking_deposit_reminders.sql` | Planification du rappel d’acompte cinq minutes après la création et fonctions de prise en charge idempotente |

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
supabase functions deploy send-deposit-reminders --no-verify-jwt
supabase functions deploy download-calendar-invite --no-verify-jwt
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
| `CRON_SECRET` | secret aléatoire long partagé avec Supabase Vault | obligatoire pour protéger la fonction planifiée |
| `WHATSAPP_BUSINESS_NUMBER` | numéro WhatsApp au format international sans `+` | `237656142787` |

Après confirmation dans l’Admin, `admin-actions` envoie un courriel récapitulatif à la cliente et aux adresses Ange Muu. La réponse de l’Admin indique si les courriels ont été acceptés par Resend. Une défaillance d’email ne révoque pas la confirmation déjà enregistrée.

Le courriel de confirmation client contient un bouton qui télécharge une invitation calendrier `.ics` et joint aussi le fichier en pièce jointe. L’événement dure 7 heures, utilise le fuseau `Africa/Douala` et contient un rappel 24 heures avant. `download-calendar-invite` valide un lien signé avant de renvoyer le fichier; aucun nouveau secret n’est nécessaire. Selon le calendrier utilisé et ses règles de sécurité, l’application peut toutefois ignorer le rappel importé ou appliquer les notifications préférées par la cliente.

## 4. Activer le rappel automatique d’acompte

La migration crée une tâche pour chaque nouvelle réservation, prévue cinq minutes après sa création. Supabase Cron vérifie les tâches chaque minute : l’email arrivera donc généralement entre cinq et six minutes après la demande. Le rappel est envoyé même si le rendez-vous est à moins d’une semaine, comme demandé. En cas d’échec Resend, cinq tentatives espacées de cinq minutes sont prévues; l’envoi utilise une clé d’idempotence pour éviter les doublons.

1. Dans Supabase → **Database → Extensions**, activer `pg_cron`, `pg_net` et `supabase_vault` si ces extensions ne sont pas déjà actives.
2. Ajouter `CRON_SECRET` dans les secrets Edge Functions avec une valeur aléatoire longue (au moins 32 caractères). Ne pas la réutiliser pour un autre service.
3. Dans le SQL Editor, créer les trois secrets Vault ci-dessous, en remplaçant les valeurs indicatives. Pour l’API key, utiliser la clé secrète `sb_secret_...` du projet, pas la clé publique. `CRON_SECRET` doit être identique à celui ajouté à l’étape précédente.

```sql
select vault.create_secret('https://kskjalzggxaycfzfgspc.supabase.co', 'angemuu_project_url');
select vault.create_secret('<CLE_SECRETE_SUPABASE_sb_secret_...>', 'angemuu_edge_secret_key');
select vault.create_secret('<MEME_VALEUR_QUE_CRON_SECRET>', 'angemuu_deposit_cron_secret');
```

4. Planifier l’appel une fois par minute :

```sql
select cron.schedule(
  'angemuu-send-deposit-reminders',
  '* * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'angemuu_project_url') || '/functions/v1/send-deposit-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'angemuu_edge_secret_key'),
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'angemuu_deposit_cron_secret')
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
```

Vérifier les exécutions dans **Database → Cron Jobs** et les envois/erreurs dans les journaux de `send-deposit-reminders`. Les emails des réservations déjà existantes ne sont pas planifiés rétroactivement.

---

## 5. S'abonner aux notifications push (ntfy)

1. Installer l'application **ntfy** (iOS / Android / desktop) : https://ntfy.sh/app.
2. S'abonner au topic : `https://ntfy.sh/<NTFY_TOPIC>` (ex. `https://ntfy.sh/angemuu-reservations`).
3. Chaque nouvelle réservation enverra une notification push « Nouvelle réservation Angemuu ».

> ⚠️ Le topic `ntfy.sh` est **public** (quiconque connaît le nom peut s'abonner). Pour un usage privé, auto-hébergez ntfy ou utilisez un topic peu devinable.

---

## 6. Vérifications

- **CSP** : aucun changement nécessaire — `staticwebapp.config.json` autorise déjà `connect-src ... supabase.co` (les fonctions sont sur ce domaine).
- **Parcours complet** : soumettre le formulaire public → la réservation apparaît dans l'Admin → notification push reçue.
- **Créneau occupé** : soumettre deux fois le même créneau → le second reçoit « Ce créneau est déjà réservé ».
- **Disponibilités publiques** : le calendrier et les créneaux utilisent la RPC `get_public_booking_availability` ; aucun nom, téléphone ou email de réservation n’est accessible publiquement.
- **Jour off et quota** : les contrôles sont répétés dans la transaction serveur, même si la page est contournée ou deux demandes arrivent en même temps.
- **WhatsApp** : après enregistrement réussi, un bouton visible permet à la cliente d’ouvrir un message prérempli ; aucune ouverture automatique bloquée par le navigateur.
- **Acompte** : impossible de continuer sans cocher l’accord; l’email est obligatoire et vérifié à la fois dans le formulaire et dans `save-booking`.
- **Rappel acompte** : faire une demande de test, vérifier une tâche prévue cinq minutes après, puis confirmer l’email avec son lien WhatsApp; simuler aussi un échec Resend et vérifier la nouvelle tentative.
- **Calendrier** : confirmer une réservation et vérifier le bouton ainsi que la pièce jointe `.ics`; vérifier une durée de 7 h et un rappel `-P1D`. Tester l’ajout sur les principaux calendriers utilisés par les clientes.
- **Admin** : le filtre par statut et la pagination sont actifs.

---

## 7. Rappel des fichiers modifiés/créés

**Créés :**
- `supabase/migrations/001_init_schema.sql`
- `supabase/migrations/002_bookings_unique_slot_and_check.sql`
- `assets/js/supabase-client.js`
- `supabase/functions/save-booking/index.ts`

**Modifiés :**
- `assets/js/booking-submit.js` — états accessibles, gestion des erreurs, bouton WhatsApp après succès
- `assets/js/booking-calendar.js` et `assets/js/booking-slots.js` — disponibilité publique via RPC limitée aux dates/heures
- `supabase/functions/save-booking/index.ts` — validation serveur, RPC atomique et notifications non bloquantes
- `supabase/functions/send-deposit-reminders/index.ts` — envoi planifié et protégé des rappels d’acompte
- `supabase/functions/download-calendar-invite/index.ts` et `_shared/calendar-invite.ts` — invitation calendrier signée, durée et rappel
- `supabase/migrations/006_booking_deposit_reminders.sql` — file durable et RPC d’envoi/réessai
- `assets/js/booking-admin.js` — client déplacé, pagination/filtres
- `index.html` — charge `supabase-client.js` (plus `booking-admin.js`)
- `admin/index.html` — charge `supabase-client.js`, filtre de statut ajouté
