-- Public availability without exposing customer details, plus atomic booking creation.

-- The deployed schema uses text for date/time, while the application relies on
-- typed SQL dates/times. Keep the existing int8 booking ID and normalize only
-- the two scheduling columns.
drop index if exists public.bookings_slot_unique;
drop policy if exists "bookings_insert_public" on public.bookings;
alter table public.bookings drop constraint if exists bookings_time_check;

  alter table public.bookings
      alter column date type date using nullif(trim(date::text), '')::date,
      alter column time type time using nullif(trim(time::text), '')::time;

alter table public.bookings
    add constraint bookings_time_check
    check (time between time '05:00' and time '19:00');

create unique index if not exists bookings_slot_unique
    on public.bookings (date, time)
    where status in ('pending', 'confirmed');

-- Keep booking event storage available even when the legacy modification
-- migration has not yet been applied to this database.
create table if not exists public.outbox_events (
    id uuid primary key default gen_random_uuid(),
    event_type text not null,
    payload jsonb,
    status text not null default 'pending',
    attempts integer not null default 0,
    created_at timestamptz default now(),
    sent_at timestamptz
);

alter table public.outbox_events enable row level security;

create or replace function public.get_public_booking_availability(
    p_start_date date,
    p_end_date date
)
returns table (booking_date date, booking_time time)
language sql
security definer
set search_path = public
as $$
    select b.date, b.time
    from public.bookings as b
    where b.date between p_start_date and p_end_date
      and b.status in ('pending', 'confirmed')
    order by b.date, b.time;
$$;

revoke all on function public.get_public_booking_availability(date, date) from public;
grant execute on function public.get_public_booking_availability(date, date) to anon, authenticated, service_role;

create or replace function public.create_booking_atomic(
    p_client_name text,
    p_phone text,
    p_email text,
    p_date date,
    p_time time,
    p_service text,
    p_location text,
    p_comment text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    active_count integer;
    new_booking public.bookings%rowtype;
begin
    -- Serialize all capacity checks for a date, so simultaneous requests cannot
    -- both pass the daily limit or the six-hour spacing rule.
    perform pg_advisory_xact_lock(90214, hashtext(p_date::text));

    if p_date < current_date then
        return jsonb_build_object('ok', false, 'error', 'date_in_past');
    end if;

    if exists (select 1 from public.off_days as d where d.off_date = p_date) then
        return jsonb_build_object('ok', false, 'error', 'date_unavailable');
    end if;

    if p_time < time '05:00' or p_time > time '19:00' or extract(minute from p_time) <> 0 or extract(second from p_time) <> 0 then
        return jsonb_build_object('ok', false, 'error', 'invalid_time');
    end if;

    select count(*) into active_count
    from public.bookings as b
    where b.date = p_date
      and b.status in ('pending', 'confirmed');

    if active_count >= 2 then
        return jsonb_build_object('ok', false, 'error', 'day_full');
    end if;

    if exists (
        select 1
        from public.bookings as b
        where b.date = p_date
          and b.status in ('pending', 'confirmed')
          and b.time = p_time
    ) then
        return jsonb_build_object('ok', false, 'error', 'slot_taken');
    end if;

    if exists (
        select 1
        from public.bookings as b
        where b.date = p_date
          and b.status in ('pending', 'confirmed')
          and abs(extract(epoch from (p_time - b.time))) < 6 * 60 * 60
    ) then
        return jsonb_build_object('ok', false, 'error', 'slot_blocked');
    end if;

    insert into public.bookings (
        client_name, phone, email, date, time, service, location, comment, status
    ) values (
        p_client_name, p_phone, p_email, p_date, p_time, p_service, p_location, p_comment, 'pending'
    ) returning * into new_booking;

    -- Store the notification event in the same transaction as the booking.
    insert into public.outbox_events (event_type, payload, status)
    values (
        'booking.created',
        jsonb_build_object(
            'booking_id', new_booking.id,
            'client_name', new_booking.client_name,
            'email', new_booking.email,
            'date', new_booking.date,
            'time', new_booking.time,
            'service', new_booking.service
        ),
        'pending'
    );

    return jsonb_build_object('ok', true, 'booking', to_jsonb(new_booking));
end;
$$;

revoke all on function public.create_booking_atomic(text, text, text, date, time, text, text, text) from public;
revoke all on function public.create_booking_atomic(text, text, text, date, time, text, text, text) from anon, authenticated;
grant execute on function public.create_booking_atomic(text, text, text, date, time, text, text, text) to service_role;
