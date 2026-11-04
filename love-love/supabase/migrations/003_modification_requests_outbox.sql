-- ============================================================
-- 003_modification_requests_outbox.sql
-- Ajoute :
--  1) modification_requests : demandes de modification (sans compte)
--  2) outbox_events : outbox transactionnelle pour les événements n8n
-- À appliquer via : supabase db push
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Table modification_requests
-- ------------------------------------------------------------------
create table if not exists public.modification_requests (
    id uuid primary key default gen_random_uuid(),
    booking_id uuid not null references public.bookings(id) on delete cascade,
    new_date date not null,
    new_time time not null,
    justification text,
    status text not null default 'pending',
    created_at timestamptz default now(),
    resolved_at timestamptz
);

alter table public.modification_requests enable row level security;

-- INSERT public : le client demande une modification (via Edge Function)
drop policy if exists "modification_requests_insert_public" on public.modification_requests;
create policy "modification_requests_insert_public"
    on public.modification_requests for insert
    to anon, authenticated
    with check (true);

-- SELECT réservé aux admins
drop policy if exists "modification_requests_select_admin" on public.modification_requests;
create policy "modification_requests_select_admin"
    on public.modification_requests for select
    to authenticated
    using (public.is_admin());

-- UPDATE réservé aux admins (accepter / refuser)
drop policy if exists "modification_requests_update_admin" on public.modification_requests;
create policy "modification_requests_update_admin"
    on public.modification_requests for update
    to authenticated
    using (public.is_admin());

-- ------------------------------------------------------------------
-- 2. Table outbox_events (outbox transactionnelle)
-- ------------------------------------------------------------------
create table if not exists public.outbox_events (
    id uuid primary key default gen_random_uuid(),
    event_type text not null,
    payload jsonb,
    status text not null default 'pending',
    attempts int not null default 0,
    created_at timestamptz default now(),
    sent_at timestamptz
);

alter table public.outbox_events enable row level security;
-- Aucune policy : accès refusé depuis le client.
-- Uniquement accessible via service_role (fonctions internes / relais).