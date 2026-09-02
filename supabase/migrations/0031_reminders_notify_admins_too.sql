-- Bug real reportado: "no me ha llegado ningún recordatorio". La
-- mayoría de sus eventos están asignados solo a Eric o Paco, que no
-- tienen ninguna suscripción push propia (Eric no tiene cuenta; Paco
-- nunca activó las notificaciones) — así que claim_due_reminders() no
-- encontraba a NADIE a quien avisar, ni siquiera al admin que gestiona
-- la agenda de todos. Ahora, además de a quien esté asignado el
-- evento, se avisa siempre también al/a los administradores de la
-- familia (con suscripción activa), que es quien de verdad necesita
-- enterarse de "el cole está cerrado" o "hay que sacar la basura"
-- aunque el evento sea de otro miembro.
create or replace function public.claim_due_reminders()
returns table(out_subscription_id uuid, out_endpoint text, out_p256dh text, out_auth text, out_event_title text, out_anchor text, out_anchor_at timestamptz)
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
    -- Miembros a los que está asignado el evento
    select dr.reminder_id, dr.title, dr.anchor, dr.anchor_at, ps.id as sub_id, ps.endpoint as ep, ps.p256dh as p256dh_key, ps.auth as auth_key
    from due_reminders dr
    join calendar_event_members cem on cem.event_id = dr.event_id
    join family_members fm on fm.id = cem.member_id
    join push_subscriptions ps on ps.profile_id = fm.linked_profile_id
    union
    -- Administradores de la familia, siempre
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
