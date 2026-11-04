# DÉPLOIEMENT — ANGEMUU (migrations + Edge Function)

Ce document décrit les étapes à exécuter **une seule fois** pour activer les nouvelles fonctionnalités :
1. Versionner le schéma (migrations).
2. Déployer la Edge Function `save-booking` (validation + notification ntfy).
3. S'abonner aux notifications push.

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
| `002_bookings_unique_slot_and_check.sql` | Contrainte UNIQUE partielle (anti doublon) + CHECK horaires |

```bash
supabase db push
```

> **Si la contrainte UNIQUE échoue** : des doublons actifs existent déjà. Nettoyez-les d'abord (voir la note en fin de `002_...sql`), puis relancez.

---

## 3. Déployer la Edge Function

```bash
supabase functions deploy save-booking --no-verify-jwt
```

- `--no-verify-jwt` : la fonction est appelable par le site public (client anon).
- La fonction valide les données (zod), insère la réservation (les RLS s'appliquent) et notifie l'admin via ntfy.

### Variable d'environnement

Dans le dashboard Supabase → **Edge Functions** → `save-booking` → **Secrets** :

| Clé | Valeur | Défaut |
|---|---|---|
| `NTFY_TOPIC` | topic ntfy (ex. `angemuu-reservations`) | `angemuu-reservations` |

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
- **Admin** : le filtre par statut et la pagination sont actifs.

---

## 6. Rappel des fichiers modifiés/créés

**Créés :**
- `supabase/migrations/001_init_schema.sql`
- `supabase/migrations/002_bookings_unique_slot_and_check.sql`
- `assets/js/supabase-client.js`
- `supabase/functions/save-booking/index.ts`

**Modifiés :**
- `assets/js/booking-submit.js` — appel Edge Function + date picker public
- `assets/js/booking-admin.js` — client déplacé, pagination/filtres
- `index.html` — charge `supabase-client.js` (plus `booking-admin.js`)
- `admin/index.html` — charge `supabase-client.js`, filtre de statut ajouté