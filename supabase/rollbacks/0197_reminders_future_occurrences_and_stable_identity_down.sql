-- Rollback de 0197_reminders_future_occurrences_and_stable_identity.sql: restaura claim_due_reminders() a su
-- cuerpo de 0154/0187 (solo ocurrencias de HOY, 7 columnas de salida) y quita anchor_at de reminder_deliveries
-- (con deduplicado defensivo por si ya hay varias entregas por reminder+suscripción+fecha con distinta hora).

delete from reminder_deliveries rd
where exists (
  select 1 from reminder_deliveries newer
  where newer.reminder_id = rd.reminder_id
    and newer.subscription_id = rd.subscription_id
    and newer.occurrence_date = rd.occurrence_date
    and newer.anchor_at > rd.anchor_at
);

alter table reminder_deliveries drop constraint reminder_deliveries_pkey;
alter table reminder_deliveries drop column anchor_at;
alter table reminder_deliveries add primary key (reminder_id, subscription_id, occurrence_date);

drop function if exists public.claim_due_reminders();

create function public.claim_due_reminders()
returns table(out_subscription_id uuid, out_endpoint text, out_p256dh text, out_auth text, out_event_title text, out_anchor text, out_anchor_at timestamp with time zone)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_today date := (now() at time zone 'Europe/Madrid')::date;
begin
  return query
  with occurrence as (
    select
      cer.id as reminder_id,
      e.id as event_id,
      e.family_id,
      e.title,
      e.visibility,
      e.created_by,
      cer.anchor,
      cer.minutes_before,
      case
        when cer.anchor = 'end' and e.end_at is not null then
          (v_today + (e.start_at at time zone 'Europe/Madrid')::time) at time zone 'Europe/Madrid' + (e.end_at - e.start_at)
        else
          (v_today + (e.start_at at time zone 'Europe/Madrid')::time) at time zone 'Europe/Madrid'
      end as anchor_at
    from calendar_event_reminders cer
    join calendar_events e on e.id = cer.event_id
    where (cer.anchor = 'start' or e.end_at is not null)
      and private.event_occurs_on_date((e.start_at at time zone 'Europe/Madrid')::date, e.recurrence_rule, e.exception_dates, v_today)
  ),
  due_reminders as (
    select reminder_id, event_id, family_id, title, visibility, created_by, anchor, anchor_at
    from occurrence
    where now() >= anchor_at - (minutes_before || ' minutes')::interval
      and now() < anchor_at
  ),
  candidates as (
    select dr.reminder_id, dr.title, dr.anchor, dr.anchor_at, ps.id as sub_id, ps.endpoint as ep, ps.p256dh as p256dh_key, ps.auth as auth_key
    from due_reminders dr
    join calendar_event_members cem on cem.event_id = dr.event_id
    join family_members fm on fm.id = cem.member_id
    join push_subscriptions ps on ps.profile_id = fm.linked_profile_id
    where dr.visibility = 'shared'
    union
    select dr.reminder_id, dr.title, dr.anchor, dr.anchor_at, ps.id as sub_id, ps.endpoint as ep, ps.p256dh as p256dh_key, ps.auth as auth_key
    from due_reminders dr
    join profiles pr on pr.family_id = dr.family_id and pr.role = 'admin'
    join push_subscriptions ps on ps.profile_id = pr.id
    where dr.visibility = 'shared'
    union
    select dr.reminder_id, dr.title, dr.anchor, dr.anchor_at, ps.id as sub_id, ps.endpoint as ep, ps.p256dh as p256dh_key, ps.auth as auth_key
    from due_reminders dr
    join push_subscriptions ps on ps.profile_id = dr.created_by
    where dr.visibility = 'private'
  ),
  claimed as (
    insert into reminder_deliveries (reminder_id, subscription_id, occurrence_date)
    select c.reminder_id, c.sub_id, v_today from candidates c
    on conflict (reminder_id, subscription_id, occurrence_date) do nothing
    returning reminder_deliveries.reminder_id, reminder_deliveries.subscription_id
  )
  select c.sub_id, c.ep, c.p256dh_key, c.auth_key, c.title, c.anchor, c.anchor_at
  from candidates c
  join claimed cl on cl.reminder_id = c.reminder_id and cl.subscription_id = c.sub_id;
end;
$function$;

revoke all on function public.claim_due_reminders() from public, anon, authenticated;
grant execute on function public.claim_due_reminders() to service_role;
