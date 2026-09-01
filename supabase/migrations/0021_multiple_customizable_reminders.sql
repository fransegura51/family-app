-- Varios recordatorios personalizables por evento (antes solo uno fijo:
-- 10 min/30 min/1 hora/1 día). Cada evento puede tener N filas aquí,
-- cada una con su propio "minutos antes" — incluye ahora semana/mes/año
-- y cualquier valor personalizado, siempre expresado en minutos.
create table calendar_event_reminders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references calendar_events(id) on delete cascade,
  minutes_before int not null check (minutes_before > 0),
  created_at timestamptz not null default now()
);

alter table calendar_event_reminders enable row level security;

create policy "calendar_event_reminders: family crud" on calendar_event_reminders for all
  using (exists (select 1 from calendar_events e where e.id = event_id and e.family_id = private.current_family_id()))
  with check (exists (select 1 from calendar_events e where e.id = event_id and e.family_id = private.current_family_id()));

-- Migra los recordatorios existentes (un valor por evento) a la tabla nueva.
insert into calendar_event_reminders (event_id, minutes_before)
select id, reminder_minutes from calendar_events where reminder_minutes is not null;

-- reminder_deliveries pasa a llevar la cuenta por RECORDATORIO, no por
-- evento — con varios recordatorios por evento, cada uno dispara en un
-- momento distinto y necesita su propio registro de "ya enviado".
alter table reminder_deliveries add column reminder_id uuid references calendar_event_reminders(id) on delete cascade;

update reminder_deliveries rd
set reminder_id = cer.id
from calendar_event_reminders cer
where cer.event_id = rd.event_id;

delete from reminder_deliveries where reminder_id is null;
alter table reminder_deliveries alter column reminder_id set not null;
alter table reminder_deliveries drop constraint reminder_deliveries_pkey;
alter table reminder_deliveries drop column event_id;
alter table reminder_deliveries add primary key (reminder_id, subscription_id);

alter table calendar_events drop column reminder_minutes;

create or replace function public.claim_due_reminders()
returns table (
  out_subscription_id uuid,
  out_endpoint text,
  out_p256dh text,
  out_auth text,
  out_event_title text,
  out_event_start_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select cer.id as reminder_id, e.id as event_id, e.title, e.start_at, ps.id as sub_id,
           ps.endpoint as ep, ps.p256dh as p256dh_key, ps.auth as auth_key
    from calendar_event_reminders cer
    join calendar_events e on e.id = cer.event_id
    join calendar_event_members cem on cem.event_id = e.id
    join family_members fm on fm.id = cem.member_id
    join push_subscriptions ps on ps.profile_id = fm.linked_profile_id
    where now() >= e.start_at - (cer.minutes_before || ' minutes')::interval
      and now() < e.start_at
  ),
  claimed as (
    insert into reminder_deliveries (reminder_id, subscription_id)
    select reminder_id, sub_id from candidates
    on conflict (reminder_id, subscription_id) do nothing
    returning reminder_deliveries.reminder_id, reminder_deliveries.subscription_id
  )
  select c.sub_id, c.ep, c.p256dh_key, c.auth_key, c.title, c.start_at
  from candidates c
  join claimed cl on cl.reminder_id = c.reminder_id and cl.subscription_id = c.sub_id;
end;
$$;

revoke all on function public.claim_due_reminders() from public, anon, authenticated;
grant execute on function public.claim_due_reminders() to service_role, postgres;
