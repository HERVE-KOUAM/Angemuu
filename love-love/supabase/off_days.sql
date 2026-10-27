-- ============================================================
-- off_days : persistance des jours off (fonctionnalité admin)
-- Exécuter ce script dans le SQL Editor du dashboard Supabase.
-- Autonome : crée la table des admins + la fonction is_admin()
-- requises par les policies RLS de off_days.
-- ============================================================

-- 1. Table des admins (alimentée uniquement depuis le dashboard)
create table if not exists public.admin_users (
    email text primary key,
    created_at timestamptz default now()
);

alter table public.admin_users enable row level security;
-- Aucune policy sur admin_users : accès refusé depuis le client.

-- 2. Fonction is_admin() : vrai si l'email du JWT est admin
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

-- 3. Table des jours off
create table if not exists public.off_days (
    id uuid primary key default gen_random_uuid(),
    off_date date not null unique,
    created_at timestamptz default now()
);

-- 4. RLS
alter table public.off_days enable row level security;

-- Lecture publique (date picker côté site public)
drop policy if exists "off_days_select_public" on public.off_days;
create policy "off_days_select_public"
    on public.off_days for select
    to anon, authenticated
    using (true);

-- Écriture réservée aux admins authentifiés
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

-- 5. Admins autorisés
insert into public.admin_users (email) values
    ('murielleangemetiegamkengne@gmail.com'),
    ('hkouamherve145@gmail.com')
on conflict (email) do nothing;
