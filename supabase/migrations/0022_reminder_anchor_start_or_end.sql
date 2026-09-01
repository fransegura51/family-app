-- Un recordatorio puede contar hacia atrás desde que EMPIEZA el evento
-- (por defecto, como hasta ahora) o desde que TERMINA — "que a las seis
-- y media me recuerde que tengo que recogerlo" cuenta desde el final,
-- no desde el principio.
alter table calendar_event_reminders add column anchor text not null default 'start' check (anchor in ('start', 'end'));

drop function public.claim_due_reminders();

create function public.claim_due_reminders()
returns table (
  out_subscription_id uuid,
  out_endpoint text,
  out_p256dh text,
  out_auth text,
  out_event_title text,
  out_anchor text,
  out_anchor_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select
      cer.id as reminder_id,
      e.id as event_id,
      e.title,
      cer.anchor,
      (case when cer.anchor = 'end' then e.end_at else e.start_at end) as anchor_at,
      ps.id as sub_id,
      ps.endpoint as ep, ps.p256dh as p256dh_key, ps.auth as auth_key
    from calendar_event_reminders cer
    join calendar_events e on e.id = cer.event_id
    join calendar_event_members cem on cem.event_id = e.id
    join family_members fm on fm.id = cem.member_id
    join push_subscriptions ps on ps.profile_id = fm.linked_profile_id
    where (cer.anchor = 'start' or e.end_at is not null)
      and now() >= (case when cer.anchor = 'end' then e.end_at else e.start_at end) - (cer.minutes_before || ' minutes')::interval
      and now() < (case when cer.anchor = 'end' then e.end_at else e.start_at end)
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
$$;

revoke all on function public.claim_due_reminders() from public, anon, authenticated;
grant execute on function public.claim_due_reminders() to service_role, postgres;
