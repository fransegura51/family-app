-- Quién recibe los avisos de eventos y tareas: ajuste familiar «todos / solo asignados», casilla «Aviso a toda la familia» y aviso de asignación.
--
-- Estado anterior (comprobado en la auditoría): en un evento o tarea COMPARTIDOS recibían el aviso los miembros asignados (con cuenta) y TODOS los
-- administradores de la familia; en uno PRIVADO, solo quien lo creó; una persona sin cuenta no recibe nada. No había ajuste alguno.
--
-- Qué hace esta migración (todo ADITIVO; la conducta actual no cambia hasta que un administrador elige un modo):
--  · families.task_notify_mode: null = como hasta ahora (asignados + administradores); 'all' = todas las cuentas activas de la familia
--    con acceso al calendario; 'assigned' = solo las personas asignadas (los administradores NO asignados dejan de recibirlos).
--    Excepción obligatoria en 'assigned': si lo asignado es un MENOR SIN CUENTA (family_members.linked_profile_id vacío y tipo child/baby), recibirán el
--    aviso todos los adultos con cuenta (rol admin o adult) de esa familia. Puede haber varios administradores por familia: se respeta.
--  · calendar_events.notify_family: casilla «Aviso a toda la familia» (solo tiene efecto en el modo 'assigned'; por defecto desmarcada).
--  · private.event_notification_recipients(evento): UNA sola función con la regla, usada por los recordatorios, el aviso de asignación y el
--    resumen diario, para que nunca difieran.
--  · public.claim_due_reminders(): mismo cuerpo que en 0197 salvo los destinatarios (ahora vía esa función) y una columna nueva al final
--    (out_profile_id: la persona destinataria, para anotar el aviso en su historial). Las 15 primeras columnas no cambian, así que la función de
--    servidor actual sigue funcionando sin redesplegar.
--  · Aviso de asignación: al asignar una TAREA compartida a otra persona (trigger sobre calendar_event_members) esa persona recibe un aviso
--    personal «te han asignado una tarea», sin esperar a su vencimiento. Quien asigna no recibe aviso de lo que él mismo asigna. Un menor sin
--    cuenta asignado avisa a los adultos con cuenta (misma excepción). Editar la tarea no repite el aviso (notification_dedupe).

alter table public.families add column task_notify_mode text check (task_notify_mode in ('all', 'assigned'));
alter table public.calendar_events add column notify_family boolean not null default false;

-- ---------------------------------------------------------------------------------------------
-- Regla única de destinatarios. p_for_summary = true: el resumen diario es un digest y no debe llenar de tareas ajenas a los administradores
-- de una familia que no ha elegido modo: con modo null solo cuentan las personas asignadas.
-- ---------------------------------------------------------------------------------------------
create or replace function private.event_notification_recipients(p_event_id uuid, p_for_summary boolean default false)
returns table(profile_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e record;
  v_mode text;
  v_minor boolean;
begin
  select ev.family_id, ev.visibility, ev.created_by, ev.notify_family into e from public.calendar_events ev where ev.id = p_event_id;
  if not found then
    return;
  end if;

  -- Privado: solo quien lo creó (igual que antes).
  if e.visibility = 'private' then
    if e.created_by is not null then
      return query select e.created_by;
    end if;
    return;
  end if;

  select f.task_notify_mode into v_mode from public.families f where f.id = e.family_id;

  -- Todas las cuentas de la familia con acceso al calendario.
  if v_mode = 'all' or (v_mode = 'assigned' and e.notify_family) then
    return query
      select p.id from public.profiles p
      where p.family_id = e.family_id and (p.allowed_sections is null or 'calendario' = any(p.allowed_sections));
    return;
  end if;

  -- Personas asignadas con cuenta.
  return query
    select fm.linked_profile_id
    from public.calendar_event_members cem
    join public.family_members fm on fm.id = cem.member_id
    where cem.event_id = p_event_id and fm.family_id = e.family_id and fm.linked_profile_id is not null;

  -- EXCEPCIÓN OBLIGATORIA (en todos los modos y también en el resumen diario): si hay una persona menor SIN cuenta asignada, se avisa a todos los
  -- adultos de la familia con cuenta (administradores y adultos).
  select exists (
    select 1 from public.calendar_event_members cem
    join public.family_members fm on fm.id = cem.member_id
    where cem.event_id = p_event_id and fm.family_id = e.family_id and fm.linked_profile_id is null and fm.member_type in ('child', 'baby')
  ) into v_minor;
  if v_minor then
    -- Solo cuentas con acceso al calendario (ven el título de la tarea).
    return query select p.id from public.profiles p where p.family_id = e.family_id and p.role in ('admin', 'adult')
      and (p.allowed_sections is null or 'calendario' = any(p.allowed_sections));
  end if;

  if v_mode is null then
    -- Sin modo elegido: como hasta ahora, además los administradores (salvo en el resumen diario).
    if not p_for_summary then
      return query select p.id from public.profiles p where p.family_id = e.family_id and p.role = 'admin';
    end if;
    return;
  end if;

end;
$$;
revoke execute on function private.event_notification_recipients(uuid, boolean) from public, anon, authenticated;
grant execute on function private.event_notification_recipients(uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Recordatorios: misma lógica de 0197 con los destinatarios de arriba.
-- ---------------------------------------------------------------------------------------------
drop function if exists public.claim_due_reminders();

create function public.claim_due_reminders()
returns table(
  out_subscription_id uuid,
  out_endpoint text,
  out_p256dh text,
  out_auth text,
  out_event_title text,
  out_anchor text,
  out_anchor_at timestamp with time zone,
  out_event_id uuid,
  out_reminder_id uuid,
  out_minutes_before integer,
  out_occurrence_date date,
  out_all_day boolean,
  out_local_date date,
  out_local_time text,
  out_day_offset integer,
  out_profile_id uuid
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_today date := (now() at time zone 'Europe/Madrid')::date;
begin
  return query
  with base as (
    select
      cer.id as reminder_id,
      e.id as event_id,
      e.family_id,
      e.title,
      e.visibility,
      e.created_by,
      e.all_day,
      e.recurrence_rule,
      e.exception_dates,
      e.start_at,
      e.end_at,
      cer.anchor,
      cer.minutes_before,
      (e.start_at at time zone 'Europe/Madrid')::date as start_date,
      (e.start_at at time zone 'Europe/Madrid')::time as start_time
    from calendar_event_reminders cer
    join calendar_events e on e.id = cer.event_id
    where (cer.anchor = 'start' or e.end_at is not null)
      -- Poda barata: un evento que empieza mucho después del alcance del recordatorio no puede ser debido aún, y
      -- uno suelto ya terminado hace más de dos días tampoco. Las series (recurrentes) no se acotan por abajo.
      and e.start_at < now() + (cer.minutes_before || ' minutes')::interval + interval '2 days'
      and (e.recurrence_rule is not null or coalesce(e.end_at, e.start_at) > now() - interval '2 days')
  ),
  occurrence as (
    select
      b.*,
      d.occ_date,
      case
        when b.anchor = 'end' and b.end_at is not null then
          ((d.occ_date + b.start_time) at time zone 'Europe/Madrid') + (b.end_at - b.start_at)
        else
          (d.occ_date + b.start_time) at time zone 'Europe/Madrid'
      end as anchor_at
    from base b
    cross join lateral (
      -- Evento suelto: su única ocurrencia es su propia fecha. Serie: desde ayer (un aviso «desde el final» de
      -- algo que acaba pasada la medianoche) hasta cubrir el alcance del recordatorio (+2 días de margen).
      select case when b.recurrence_rule is null then b.start_date else v_today - 1 + g.i end as occ_date
      from generate_series(0, case when b.recurrence_rule is null then 0 else ceil(b.minutes_before / 1440.0)::int + 2 end) as g(i)
    ) d
    where private.event_occurs_on_date(b.start_date, b.recurrence_rule, b.exception_dates, d.occ_date)
  ),
  due_reminders as (
    select reminder_id, event_id, family_id, title, visibility, created_by, all_day, anchor, minutes_before, occ_date, anchor_at
    from occurrence
    where now() >= anchor_at - (minutes_before || ' minutes')::interval
      and now() < anchor_at
  ),
  -- Destinatarios: private.event_notification_recipients decide a QUIÉN se avisa de cada evento o tarea según el modo de la familia
  -- (families.task_notify_mode). Con el modo sin elegir (null) da exactamente lo de siempre: asignados + administradores; los privados,
  -- solo quien los creó.
  candidates as (
    select distinct dr.reminder_id, dr.event_id, dr.title, dr.all_day, dr.anchor, dr.minutes_before, dr.occ_date, dr.anchor_at,
           ps.id as sub_id, ps.endpoint as ep, ps.p256dh as p256dh_key, ps.auth as auth_key, rc.profile_id as recipient_profile_id
    from due_reminders dr
    cross join lateral private.event_notification_recipients(dr.event_id) rc
    join push_subscriptions ps on ps.profile_id = rc.profile_id
  ),
  claimed as (
    insert into reminder_deliveries (reminder_id, subscription_id, occurrence_date, anchor_at)
    select c.reminder_id, c.sub_id, c.occ_date, c.anchor_at from candidates c
    on conflict (reminder_id, subscription_id, occurrence_date, anchor_at) do nothing
    returning reminder_deliveries.reminder_id, reminder_deliveries.subscription_id,
              reminder_deliveries.occurrence_date, reminder_deliveries.anchor_at
  )
  select
    c.sub_id, c.ep, c.p256dh_key, c.auth_key, c.title, c.anchor, c.anchor_at,
    c.event_id, c.reminder_id, c.minutes_before, c.occ_date, c.all_day,
    (c.anchor_at at time zone 'Europe/Madrid')::date,
    to_char(c.anchor_at at time zone 'Europe/Madrid', 'HH24:MI'),
    ((c.anchor_at at time zone 'Europe/Madrid')::date - v_today),
    c.recipient_profile_id
  from candidates c
  join claimed cl
    on cl.reminder_id = c.reminder_id
   and cl.subscription_id = c.sub_id
   and cl.occurrence_date = c.occ_date
   and cl.anchor_at = c.anchor_at;
end;
$function$;

-- Una función nueva nace con los permisos por defecto de Supabase (anon/authenticated pueden ejecutarla):
-- se deja exactamente como estaba la anterior, solo service_role (la Edge Function send-due-reminders).
revoke all on function public.claim_due_reminders() from public, anon, authenticated;
grant execute on function public.claim_due_reminders() to service_role;

-- ---------------------------------------------------------------------------------------------
-- Aviso de asignación de tareas.
-- ---------------------------------------------------------------------------------------------
create or replace function private.notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
  m record;
  v_actor uuid := auth.uid();
  r record;
begin
  select ev.family_id, ev.kind, ev.title, ev.visibility into e from public.calendar_events ev where ev.id = new.event_id;
  if not found or e.kind <> 'task' or e.visibility = 'private' then
    return new;
  end if;

  select fm.linked_profile_id, fm.member_type, fm.name into m
  from public.family_members fm where fm.id = new.member_id and fm.family_id = e.family_id;
  if not found then
    return new;
  end if;

  if m.linked_profile_id is not null then
    if m.linked_profile_id is distinct from v_actor then
      perform private.notify_user(m.linked_profile_id, 'personal', 'task_assigned', 'Te han asignado una tarea', e.title, '/calendario',
        null, 'assign:' || new.event_id || ':' || m.linked_profile_id, true);
    end if;
  elsif m.member_type in ('child', 'baby') then
    -- Menor sin cuenta: lo reciben los adultos con cuenta (menos quien asigna).
    for r in select p.id from public.profiles p where p.family_id = e.family_id and p.role in ('admin', 'adult') and p.id is distinct from v_actor
             and (p.allowed_sections is null or 'calendario' = any(p.allowed_sections)) loop
      perform private.notify_user(r.id, 'personal', 'task_assigned', 'Tarea asignada a ' || coalesce(m.name, 'un menor'), e.title, '/calendario',
        null, 'assign:' || new.event_id || ':' || new.member_id || ':' || r.id, true);
    end loop;
  end if;
  return new;
exception when others then
  -- Un fallo al avisar nunca debe impedir asignar la tarea.
  raise warning 'notify_task_assignment: %', sqlerrm;
  return new;
end;
$$;
revoke execute on function private.notify_task_assignment() from public, anon, authenticated;

create trigger calendar_event_members_notify_assignment
  after insert on public.calendar_event_members
  for each row execute function private.notify_task_assignment();
