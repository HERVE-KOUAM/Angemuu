-- Schedule one deposit reminder five minutes after each new booking.
-- Delivery is performed by the send-deposit-reminders Edge Function.

create table if not exists public.booking_deposit_reminders (
    id uuid primary key default gen_random_uuid(),
    booking_id bigint not null unique references public.bookings(id) on delete cascade,
    scheduled_for timestamptz not null,
    status text not null default 'pending'
        check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
    attempts integer not null default 0 check (attempts >= 0),
    claimed_at timestamptz,
    sent_at timestamptz,
    last_error text,
    created_at timestamptz not null default now()
);

create index if not exists booking_deposit_reminders_due_idx
    on public.booking_deposit_reminders (scheduled_for)
    where status in ('pending', 'processing');

alter table public.booking_deposit_reminders enable row level security;
revoke all on public.booking_deposit_reminders from public, anon, authenticated;
grant all on public.booking_deposit_reminders to service_role;

create or replace function public.schedule_booking_deposit_reminder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.booking_deposit_reminders (booking_id, scheduled_for)
    values (new.id, coalesce(new.created_at, now()) + interval '5 minutes')
    on conflict (booking_id) do nothing;
    return new;
end;
$$;

drop trigger if exists booking_deposit_reminder_after_insert on public.bookings;
create trigger booking_deposit_reminder_after_insert
    after insert on public.bookings
    for each row execute function public.schedule_booking_deposit_reminder();

create or replace function public.claim_due_booking_deposit_reminders(p_limit integer default 20)
returns table (
    reminder_id uuid,
    booking_id bigint,
    client_name text,
    email text,
    booking_date date,
    booking_time time,
    service text,
    booking_status text,
    attempt_count integer
)
language sql
security definer
set search_path = public
as $$
    with due as (
        select r.id
        from public.booking_deposit_reminders as r
        where (r.status = 'pending' and r.scheduled_for <= now())
           or (r.status = 'processing' and r.claimed_at < now() - interval '10 minutes')
        order by r.scheduled_for
        limit least(greatest(coalesce(p_limit, 20), 1), 100)
        for update skip locked
    ), claimed as (
        update public.booking_deposit_reminders as r
        set status = 'processing', claimed_at = now(), attempts = r.attempts + 1
        from due
        where r.id = due.id
        returning r.id, r.booking_id, r.attempts
    )
    select c.id, b.id, b.client_name, b.email, b.date, b.time, b.service, b.status, c.attempts
    from claimed as c
    join public.bookings as b on b.id = c.booking_id;
$$;

revoke all on function public.claim_due_booking_deposit_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_booking_deposit_reminders(integer) to service_role;

create or replace function public.finish_booking_deposit_reminder(
    p_reminder_id uuid,
    p_result text,
    p_error text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    reminder public.booking_deposit_reminders%rowtype;
    final_status text;
begin
    if p_result not in ('sent', 'failed', 'skipped') then
        raise exception 'Invalid reminder result';
    end if;

    select * into reminder
    from public.booking_deposit_reminders
    where id = p_reminder_id
    for update;

    if not found then
        return 'missing';
    end if;

    if p_result = 'failed' and reminder.attempts < 5 then
        final_status := 'pending';
        update public.booking_deposit_reminders
        set status = final_status,
            scheduled_for = now() + interval '5 minutes',
            claimed_at = null,
            last_error = left(coalesce(p_error, 'email_send_failed'), 1000)
        where id = p_reminder_id;
    else
        final_status := p_result;
        update public.booking_deposit_reminders
        set status = final_status,
            sent_at = case when final_status = 'sent' then now() else sent_at end,
            claimed_at = null,
            last_error = case when final_status = 'failed' then left(coalesce(p_error, 'email_send_failed'), 1000) else null end
        where id = p_reminder_id;
    end if;

    return final_status;
end;
$$;

revoke all on function public.finish_booking_deposit_reminder(uuid, text, text) from public, anon, authenticated;
grant execute on function public.finish_booking_deposit_reminder(uuid, text, text) to service_role;
