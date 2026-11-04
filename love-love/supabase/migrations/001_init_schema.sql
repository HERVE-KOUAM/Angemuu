-- ============================================================
-- 001_init_schema.sql
-- Schéma initial d'Angemuu (tables, fonctions RPC, policies RLS).
-- Idempotent : peut être appliqué sur une base existante.
-- À appliquer via : supabase db push  (ou SQL Editor du dashboard)
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Table des admins (alimentée uniquement depuis le dashboard)
-- ------------------------------------------------------------------
create table if not exists public.admin_users (
    email text primary key,
    created_at timestamptz default now()
);

alter table public.admin_users enable row level security;
-- Aucune policy sur admin_users : accès refusé depuis le client.

-- ------------------------------------------------------------------
-- 2. Fonction is_admin() : vrai si l'email du JWT est admin
-- ------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.admin_users
        where email = (auth.jwt() ->> 'email')
          and (auth.jwt() ->> 'email') is not null
    );
$$;

-- ------------------------------------------------------------------
-- 3. Table des jours off
-- ------------------------------------------------------------------
create table if not exists public.off_days (
    id uuid primary key default gen_random_uuid(),
    off_date date not null unique,
    created_at timestamptz default now()
);

alter table public.off_days enable row level security;

drop policy if exists "off_days_select_public" on public.off_days;
create policy "off_days_select_public"
    on public.off_days for select
    to anon, authenticated
    using (true);

drop policy if exists "off_days_insert_admin" on public.off_days;
create policy "off_days_insert_admin"
    on public.off_days for insert
    to authenticated
    with check (public.is_admin());

drop policy if exists "off_days_update_admin" on public.off_days;
create policy "off_days_update_admin"
    on public.off_days for update
    to authenticated
    using (public.is_admin());

drop policy if exists "off_days_delete_admin" on public.off_days;
create policy "off_days_delete_admin"
    on public.off_days for delete
    to authenticated
    using (public.is_admin());

-- ------------------------------------------------------------------
-- 4. Table bookings (réservations)
-- ------------------------------------------------------------------
create table if not exists public.bookings (
    id uuid primary key default gen_random_uuid(),
    client_name text not null,
    phone text not null,
    email text,
    date date not null,
    time time not null,
    service text not null,
    location text default 'Chez Ange Muu',
    status text not null default 'pending',
    comment text,
    created_at timestamptz default now()
);

-- Colonnes éventuellement manquantes sur une table existante
alter table public.bookings add column if not exists comment text;

alter table public.bookings enable row level security;

-- INSERT public : un client réserve sans compte
drop policy if exists "bookings_insert_public" on public.bookings;
create policy "bookings_insert_public"
    on public.bookings for insert
    to anon, authenticated
    with check (true);

-- SELECT réservé aux admins
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
-- 5. Fonction RPC publique : un créneau (date + heure) est-il pris ?
-- ------------------------------------------------------------------
-- create or replace function public.is_slot_taken(p_date text, p_time text)
-- returns boolean
-- language sql
-- security definer
-- set search_path = public
-- as $$
--     select exists (
--         select 1
--         from public.bookings
--         where date = p_date
--           and time = p_time
--           and status in ('pending', 'confirmed')
--     );
-- $$;

-- revoke all on function public.is_slot_taken(text, text) from public;
-- grant execute on function public.is_slot_taken(text, text) to anon, authenticated;

-- ------------------------------------------------------------------
-- 6. Table posts (blog)
-- ------------------------------------------------------------------
create table if not exists public.posts (
    id bigint generated by default as identity primary key,
    title text not null,
    slug text not null unique,
    content text,
    status text not null default 'draft',
    created_at timestamptz default now()
);

alter table public.posts enable row level security;

drop policy if exists "posts_select_public" on public.posts;
create policy "posts_select_public"
    on public.posts for select
    to anon, authenticated
    using (true);

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
-- 7. Table comments
-- ------------------------------------------------------------------
create table if not exists public.comments (
    id bigint generated by default as identity primary key,
    post_id bigint references public.posts(id) on delete cascade,
    author text,
    content text,
    created_at timestamptz default now()
);

alter table public.comments enable row level security;

drop policy if exists "comments_select_public" on public.comments;
create policy "comments_select_public"
    on public.comments for select
    to anon, authenticated
    using (true);

drop policy if exists "comments_insert_public" on public.comments;
create policy "comments_insert_public"
    on public.comments for insert
    to anon, authenticated
    with check (true);

drop policy if exists "comments_delete_admin" on public.comments;
create policy "comments_delete_admin"
    on public.comments for delete
    to authenticated
    using (public.is_admin());

-- ------------------------------------------------------------------
-- 8. Admins autorisés
-- ------------------------------------------------------------------
insert into public.admin_users (email) values
    ('murielleangemetiegamkengne@gmail.com'),
    ('hkouamherve145@gmail.com')
on conflict (email) do nothing;