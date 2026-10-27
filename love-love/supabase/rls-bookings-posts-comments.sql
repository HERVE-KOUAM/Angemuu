-- ============================================================
-- RLS : sécurisation des tables bookings, posts, comments
-- À exécuter dans le SQL Editor du dashboard Supabase.
-- Dépend des éléments du script off_days.sql (admin_users,
-- fonction is_admin()) — l'exécuter après off_days.sql.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Fonction RPC publique : un créneau (date + heure) est-il pris ?
--    security definer + revoke = le client ne voit QUE ce booléen,
--    jamais les données des réservations.
-- ------------------------------------------------------------------
create or replace function public.is_slot_taken(p_date text, p_time text)
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.bookings
        where date = p_date
          and time = p_time
          and status in ('pending', 'confirmed')
    );
$$;

revoke all on function public.is_slot_taken(text, text) from public;
grant execute on function public.is_slot_taken(text, text) to anon, authenticated;

-- ------------------------------------------------------------------
-- 2. Table bookings
-- ------------------------------------------------------------------
alter table public.bookings enable row level security;

-- INSERT public : un client réserve sans compte
drop policy if exists "bookings_insert_public" on public.bookings;
create policy "bookings_insert_public"
    on public.bookings for insert
    to anon, authenticated
    with check (true);

-- SELECT réservé aux admins (les clients ne voient jamais les données)
drop policy if exists "bookings_select_admin" on public.bookings;
create policy "bookings_select_admin"
    on public.bookings for select
    to authenticated
    using (public.is_admin());

-- UPDATE réservé aux admins (statut confirm / canceled)
drop policy if exists "bookings_update_admin" on public.bookings;
create policy "bookings_update_admin"
    on public.bookings for update
    to authenticated
    using (public.is_admin());

-- DELETE réservé aux admins
drop policy if exists "bookings_delete_admin" on public.bookings;
create policy "bookings_delete_admin"
    on public.bookings for delete
    to authenticated
    using (public.is_admin());

-- ------------------------------------------------------------------
-- 3. Table posts
-- ------------------------------------------------------------------
alter table public.posts enable row level security;

-- SELECT publique : le blog est lisible par tous
drop policy if exists "posts_select_public" on public.posts;
create policy "posts_select_public"
    on public.posts for select
    to anon, authenticated
    using (true);

-- Écriture réservée aux admins
drop policy if exists "posts_insert_admin" on public.posts;
create policy "posts_insert_admin"
    on public.posts for insert
    to authenticated
    with check (public.is_admin());

drop policy if exists "posts_update_admin" on public.posts;
create policy "posts_update_admin"
    on public.posts for update
    to authenticated
    using (public.is_admin());

drop policy if exists "posts_delete_admin" on public.posts;
create policy "posts_delete_admin"
    on public.posts for delete
    to authenticated
    using (public.is_admin());

-- ------------------------------------------------------------------
-- 4. Table comments
-- ------------------------------------------------------------------
alter table public.comments enable row level security;

-- SELECT publique : tout le monde lit les commentaires
drop policy if exists "comments_select_public" on public.comments;
create policy "comments_select_public"
    on public.comments for select
    to anon, authenticated
    using (true);

-- INSERT public : un visiteur commente sans compte
drop policy if exists "comments_insert_public" on public.comments;
create policy "comments_insert_public"
    on public.comments for insert
    to anon, authenticated
    with check (true);

-- DELETE réservé aux admins (modération)
drop policy if exists "comments_delete_admin" on public.comments;
create policy "comments_delete_admin"
    on public.comments for delete
    to authenticated
    using (public.is_admin());
