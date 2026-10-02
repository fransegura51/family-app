-- RETOQUE — Calendario, dos frentes independientes en una sola migración:
--
-- 1) Preferencias PERSONALES de "Tareas completadas" (tachar / color / mover al final), mismo patrón
--    exacto que calendar_color_mode/calendar_task_order (profiles, por usuario, nunca families). Los
--    defaults preservan el comportamiento actual tal cual se veía antes de este retoque:
--      - tachar: hasta ahora SIEMPRE se tachaba una Tarea/Evento completado, sin ajuste — default true
--        reproduce exactamente eso.
--      - color: hasta ahora el color de un completado era siempre el normal (categoría/persona/neutro),
--        nunca uno especial — default null ("sin color especial") reproduce eso.
--      - mover al final: hasta ahora el orden no cambiaba al completar — default false reproduce eso.
--    Cambio 100% aditivo, no toca ninguna fila existente de calendar_color_mode/calendar_task_order.
alter table profiles add column calendar_task_strikethrough boolean not null default true;
alter table profiles add column calendar_task_done_color text;
alter table profiles add column calendar_task_move_completed boolean not null default false;

-- 2) Privacidad real (visibility='private', migración 0089) — la UI y el RLS de calendar_events ya
-- filtran bien quién puede LEER un evento/tarea privado, pero dos caminos server-side seguían avisando/
-- exponiendo igual que si fuera compartido, auditado antes de tocar nada:
--
--   a) claim_due_reminders()/claim_overdue_nags() (SECURITY DEFINER, bypasan RLS a propósito para poder
--      insertar en reminder_deliveries/overdue_nag_deliveries) notificaban a TODOS los miembros
--      asignados + TODOS los admins de la familia, sin mirar visibility — un recordatorio de un evento
--      "Solo yo" avisaba igualmente a cualquier admin. Ahora: eventos compartidos, exactamente el mismo
--      comportamiento de siempre (asignados + admins); eventos privados, SOLO el propietario
--      (created_by), nunca asignados ni admins aunque lo sean — igual que ya hace
--      export-calendar-ics/index.ts con su .neq('visibility','private').
create or replace function public.claim_due_reminders()
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
    -- Compartido: asignados + admins de la familia, exactamente como siempre.
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
    -- Privado ("Solo yo"): SOLO el propietario, nunca asignados ni admins (aunque lo sean).
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

--   b) claim_overdue_nags() — misma clase de aviso (recordatorio "se te ha pasado"), hoy sin ningún
--      llamador en el cliente (confirmado: ninguna función TS la invoca todavía), pero con el MISMO
--      fallo de privacidad ya en el esquema — se corrige igual, para no dejar una trampa lista si algún
--      día se conecta.
create or replace function public.claim_overdue_nags(p_event_ids uuid[], p_occurrence_date date, p_nag_bucket bigint)
 returns table(out_subscription_id uuid, out_endpoint text, out_p256dh text, out_auth text, out_event_id uuid, out_event_title text, out_event_start_at timestamp with time zone)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  return query
  with candidates as (
    select e.id as event_id, e.title, e.start_at, ps.id as sub_id,
           ps.endpoint as ep, ps.p256dh as p256dh_key, ps.auth as auth_key
    from calendar_events e
    join calendar_event_members cem on cem.event_id = e.id
    join family_members fm on fm.id = cem.member_id
    join push_subscriptions ps on ps.profile_id = fm.linked_profile_id
    where e.id = any(p_event_ids) and e.visibility = 'shared'
    union
    select e.id as event_id, e.title, e.start_at, ps.id as sub_id,
           ps.endpoint as ep, ps.p256dh as p256dh_key, ps.auth as auth_key
    from calendar_events e
    join profiles pr on pr.family_id = e.family_id and pr.role = 'admin'
    join push_subscriptions ps on ps.profile_id = pr.id
    where e.id = any(p_event_ids) and e.visibility = 'shared'
    union
    select e.id as event_id, e.title, e.start_at, ps.id as sub_id,
           ps.endpoint as ep, ps.p256dh as p256dh_key, ps.auth as auth_key
    from calendar_events e
    join push_subscriptions ps on ps.profile_id = e.created_by
    where e.id = any(p_event_ids) and e.visibility = 'private'
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
$function$;

--   c) Bucket de adjuntos calendar-attachments (storage.objects): la ruta de un fichero es
--      "{family_id}/{uuid}.{ext}" — no lleva el event_id, así que la única forma de saber si un fichero
--      pertenece a un evento/tarea privado es mirar calendar_events.attachment_storage_path. La política
--      de SELECT/DELETE dejaba leer/borrar cualquier fichero de la familia sin mirar eso — un adjunto de
--      un evento "Solo yo" era descargable/listable por cualquier miembro. Ahora: un fichero que NINGÚN
--      evento privado referencia sigue accesible igual que siempre (no cambia nada para adjuntos de
--      eventos compartidos, ni para ficheros huérfanos); un fichero que SÍ referencia un evento privado
--      solo es accesible para quien lo creó.
drop policy if exists "calendar attachments storage: family select" on storage.objects;
create policy "calendar attachments storage: family select" on storage.objects for select
  using (
    bucket_id = 'calendar-attachments'
    and (storage.foldername(name))[1] = private.current_family_id()::text
    and private.has_section_access('calendario')
    and (
      not exists (select 1 from calendar_events e where e.attachment_storage_path = storage.objects.name and e.visibility = 'private')
      or exists (select 1 from calendar_events e where e.attachment_storage_path = storage.objects.name and e.visibility = 'private' and e.created_by = auth.uid())
    )
  );

drop policy if exists "calendar attachments storage: family delete" on storage.objects;
create policy "calendar attachments storage: family delete" on storage.objects for delete
  using (
    bucket_id = 'calendar-attachments'
    and (storage.foldername(name))[1] = private.current_family_id()::text
    and private.has_section_access('calendario')
    and (
      not exists (select 1 from calendar_events e where e.attachment_storage_path = storage.objects.name and e.visibility = 'private')
      or exists (select 1 from calendar_events e where e.attachment_storage_path = storage.objects.name and e.visibility = 'private' and e.created_by = auth.uid())
    )
  );
