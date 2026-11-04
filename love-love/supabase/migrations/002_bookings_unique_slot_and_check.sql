-- ============================================================
-- 002_bookings_unique_slot_and_check.sql
-- Fiabilise les créneaux de réservation :
--  1) Contrainte UNIQUE partielle (date, time) sur les statuts actifs
--     -> élimine la course critique « check-then-act » (double réservation).
--  2) Contrainte CHECK sur les horaires d'ouverture.
-- À appliquer via : supabase db push  (ou SQL Editor du dashboard)
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Anti double réservation : un seul créneau actif par (date, time)
-- ------------------------------------------------------------------
-- Deux réservations en statut 'pending' ou 'confirmed' ne peuvent pas
-- occuper le même créneau. Les réservations 'canceled' ne bloquent pas.
create unique index if not exists bookings_slot_unique
    on public.bookings (date, time)
    where status in ('pending', 'confirmed');

-- ------------------------------------------------------------------
-- 2. Horaires d'ouverture (ajustez selon vos plages réelles)
-- ------------------------------------------------------------------
alter table public.bookings
    drop constraint if exists bookings_time_check;

alter table public.bookings
    add constraint bookings_time_check
    check (time between '08:00' and '19:00');

-- ------------------------------------------------------------------
-- NOTE : si l'ajout de la contrainte UNIQUE échoue, c'est qu'il existe
-- déjà des doublons actifs. Nettoyez-les d'abord, par exemple :
--
--   delete from public.bookings a
--   using public.bookings b
--   where a.id > b.id
--     and a.date = b.date
--     and a.time = b.time
--     and a.status in ('pending','confirmed')
--     and b.status in ('pending','confirmed');
-- ------------------------------------------------------------------