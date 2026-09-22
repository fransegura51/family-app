-- Rollback de 0154_fix_recurring_reminder_occurrences.sql: restaura claim_due_reminders() a su cuerpo
-- original (start_at/end_at fijo, sin mirar exception_dates ni recolocar ocurrencias), quita
-- occurrence_date de reminder_deliveries (con deduplicado defensivo por si ya se han acumulado varias
-- ocurrencias por reminder_id+subscription_id desde que se aplicó la migración) y quita la función
-- privada nueva.

-- Si para entonces ya hay más de una fila por (reminder_id, subscription_id) — exactamente lo que esta
-- migración permite a propósito para recordatorios recurrentes — se queda solo con la más reciente
-- antes de poder volver a la clave primaria antigua (reminder_id, subscription_id) a secas.
delete from reminder_deliveries rd
where exists (
  select 1 from reminder_deliveries newer
  where newer.reminder_id = rd.reminder_id
    and newer.subscription_id = rd.subscription_id
    and newer.occurrence_date > rd.occurrence_date
);

alter table reminder_deliveries drop constraint reminder_deliveries_pkey;
alter table reminder_deliveries drop column occurrence_date;
alter table reminder_deliveries add primary key (reminder_id, subscription_id);

create or replace function public.claim_due_reminders()
returns table(out_subscription_id uuid, out_endpoint text, out_p256dh text, out_auth text, out_event_title text, out_anchor text, out_anchor_at timestamp with time zone)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  with due_reminders as (
    select
      cer.id as reminder_id,
      e.id as event_id,
      e.family_id,
      e.title,
      cer.anchor,
      (case when cer.anchor = 'end' then e.end_at else e.start_at end) as anchor_at
    from calendar_event_reminders cer
    join calendar_events e on e.id = cer.event_id
    where (cer.anchor = 'start' or e.end_at is not null)
      and now() >= (case when cer.anchor = 'end' then e.end_at else e.start_at end) - (cer.minutes_before || ' minutes')::interval
      and now() < (case when cer.anchor = 'end' then e.end_at else e.start_at end)
  ),
  candidates as (
    select dr.reminder_id, dr.title, dr.anchor, dr.anchor_at, ps.id as sub_id, ps.endpoint as ep, ps.p256dh as p256dh_key, ps.auth as auth_key
    from due_reminders dr
    join calendar_event_members cem on cem.event_id = dr.event_id
    join family_members fm on fm.id = cem.member_id
    join push_subscriptions ps on ps.profile_id = fm.linked_profile_id
    union
    select dr.reminder_id, dr.title, dr.anchor, dr.anchor_at, ps.id as sub_id, ps.endpoint as ep, ps.p256dh as p256dh_key, ps.auth as auth_key
    from due_reminders dr
    join profiles pr on pr.family_id = dr.family_id and pr.role = 'admin'
    join push_subscriptions ps on ps.profile_id = pr.id
  ),
  claimed as (
    insert into reminder_deliveries (reminder_id, subscription_id)
    select reminder_id, sub_id from candidates
    on conflict (reminder_id, subscription_id) do nothing
    returning reminder_deliveries.reminder_id, reminder_deliveries.subscription_id
  )
  select c.sub_id, c.ep, c.p256dh_key, c.auth_key, c.title, c.anchor, c.anchor_at
  from candidates c
  join claimed cl on cl.reminder_id = c.reminder_id and cl.subscription_id = c.sub_id;
end;
$function$;

drop function if exists private.event_occurs_on_date(date, text, date[], date);
