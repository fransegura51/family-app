-- Avisos de "todavía pendiente" (evento de hoy, hora ya pasada, sin
-- marcar hecho) también por Web Push, no solo mientras la app está
-- abierta (ReminderWatcher.checkOverdueUndone) — petición real:
-- "necesitamos que las notificaciones se reciban, aunque la aplicación
-- esté cerrada". Se repiten cada NAG_BUCKET_MINUTES mientras el evento
-- siga sin marcarse, igual que en el cliente; el "bucket" (ventana de
-- tiempo) es lo que evita reenviar el mismo aviso una y otra vez cada
-- minuto que pasa el cron.

create table overdue_nag_deliveries (
  event_id uuid not null references calendar_events(id) on delete cascade,
  occurrence_date date not null,
  nag_bucket bigint not null,
  subscription_id uuid not null references push_subscriptions(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (event_id, occurrence_date, nag_bucket, subscription_id)
);

alter table overdue_nag_deliveries enable row level security;

-- Reclama atómicamente, para un lote de eventos ya calculados como
-- "hoy, pasados de hora y sin marcar hecho" (esa parte, con recurrencia
-- incluida, se calcula en la Edge Function reutilizando la misma lógica
-- de domain/calendar.ts — no es razonable reimplementar RRULE en SQL),
-- a quién avisar: los miembros asignados al evento y, siempre, los
-- administradores de la familia (mismo criterio que claim_due_reminders).
create or replace function public.claim_overdue_nags(
  p_event_ids uuid[],
  p_occurrence_date date,
  p_nag_bucket bigint
)
returns table (
  out_subscription_id uuid,
  out_endpoint text,
  out_p256dh text,
  out_auth text,
  out_event_id uuid,
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
    select e.id as event_id, e.title, e.start_at, ps.id as sub_id,
           ps.endpoint as ep, ps.p256dh as p256dh_key, ps.auth as auth_key
    from calendar_events e
    join calendar_event_members cem on cem.event_id = e.id
    join family_members fm on fm.id = cem.member_id
    join push_subscriptions ps on ps.profile_id = fm.linked_profile_id
    where e.id = any(p_event_ids)
    union
    select e.id as event_id, e.title, e.start_at, ps.id as sub_id,
           ps.endpoint as ep, ps.p256dh as p256dh_key, ps.auth as auth_key
    from calendar_events e
    join profiles pr on pr.family_id = e.family_id and pr.role = 'admin'
    join push_subscriptions ps on ps.profile_id = pr.id
    where e.id = any(p_event_ids)
  ),
  claimed as (
    insert into overdue_nag_deliveries (event_id, occurrence_date, nag_bucket, subscription_id)
    select event_id, p_occurrence_date, p_nag_bucket, sub_id from candidates
    on conflict (event_id, occurrence_date, nag_bucket, subscription_id) do nothing
    returning overdue_nag_deliveries.event_id, overdue_nag_deliveries.subscription_id
  )
  select c.sub_id, c.ep, c.p256dh_key, c.auth_key, c.event_id, c.title, c.start_at
  from candidates c
  join claimed cl on cl.event_id = c.event_id and cl.subscription_id = c.sub_id;
end;
$$;

revoke all on function public.claim_overdue_nags(uuid[], date, bigint) from public, anon, authenticated;
grant execute on function public.claim_overdue_nags(uuid[], date, bigint) to service_role, postgres;

create index idx_overdue_nag_deliveries_event on overdue_nag_deliveries(event_id);
