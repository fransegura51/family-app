-- Bug real reportado: se borró SOLO la ocurrencia de hoy de "Robotica" (evento semanal recurrente,
-- se guarda como fecha en exception_dates, el evento en sí sigue vivo — mismo mecanismo de siempre,
-- ver deleteEventOccurrence en src/data/calendar.ts) y aun así llegó el aviso push de hoy.
--
-- Causa raíz: claim_due_reminders() calculaba la hora del aviso directamente desde el start_at/end_at
-- literal de calendar_events, sin mirar exception_dates en ningún momento (ni siquiera lo consultaba).
-- El calendario visual y las "pendientes" (send-due-reminders/index.ts, sendOverdueNags, en TS) sí
-- respetan las excepciones — solo esta ruta (avisos "empieza en N minutos") no lo hacía.
--
-- Efecto colateral descubierto de paso, más grave: como start_at es fijo (no se recalcula por
-- ocurrencia), un evento recurrente SOLO podía avisar la primera vez que pasara por la ventana de
-- aviso — nunca las siguientes semanas/años, porque now() < start_at deja de cumplirse para siempre en
-- cuanto pasa esa primera fecha. Confirmado con datos reales: "Aniversario Primer beso Paco & Jenny"
-- (FREQ=YEARLY, start_at 2019-08-08) lleva sin poder avisar desde 2019. reminder_deliveries tampoco
-- distinguía ocurrencias (PK solo reminder_id+subscription_id): aunque se arreglara lo anterior, un
-- aviso ya entregado una vez bloquearía TODAS las ocurrencias futuras de esa serie para siempre.
--
-- Arreglo, en dos partes:
--   1. private.event_occurs_on_date(...) — traducción fiel a SQL de la misma lógica que ya usan
--      domain/calendar.ts (expandOccurrences, cliente) y send-due-reminders/index.ts (occursOnDate,
--      Edge Function): respeta exception_dates, FREQ (DAILY/WEEKLY/BYDAY/MONTHLY/YEARLY), INTERVAL y
--      UNTIL. No inventa una regla nueva, es una traducción de la que ya existe y ya se prueba.
--   2. claim_due_reminders() se redefine para: (a) solo considerar "debido" un recordatorio cuya
--      ocurrencia de HOY (hora de Madrid) sea válida según event_occurs_on_date; (b) recolocar la hora
--      original del evento sobre HOY (igual que occurrenceAt() en el cliente), no usar el start_at/
--      end_at fijo; (c) reminder_deliveries gana una columna occurrence_date y su PK pasa a incluirla
--      — mismo patrón que ya usa overdue_nag_deliveries (event_id, occurrence_date, nag_bucket,
--      subscription_id) — para que cada ocurrencia de una serie recurrente pueda avisar por separado.
--
-- Rehearsed primero en una transacción revertida contra los datos reales (incluido "Robotica" y el
-- aniversario de 2019), sin cambiar ningún dato de negocio: solo functions/schema.
-- No se despliega ninguna Edge Function — send-due-reminders/index.ts sigue llamando a la misma RPC
-- con el mismo nombre y las mismas columnas de salida, no necesita ningún cambio.

create or replace function private.event_occurs_on_date(
  p_start_date date,
  p_recurrence_rule text,
  p_exception_dates date[],
  p_target_date date
) returns boolean
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_freq text;
  v_byday text[];
  v_interval int;
  v_until date;
  v_diff int;
  v_month_diff int;
begin
  if p_exception_dates is not null and p_target_date = any(p_exception_dates) then
    return false;
  end if;
  if p_recurrence_rule is null then
    return p_start_date = p_target_date;
  end if;
  if p_target_date < p_start_date then
    return false;
  end if;

  v_freq := (regexp_match(p_recurrence_rule, 'FREQ=([A-Z]+)'))[1];
  v_interval := coalesce(nullif((regexp_match(p_recurrence_rule, 'INTERVAL=([0-9]+)'))[1], '')::int, 1);
  v_until := nullif((regexp_match(p_recurrence_rule, 'UNTIL=([0-9-]+)'))[1], '')::date;
  if v_until is not null and p_target_date > v_until then
    return false;
  end if;

  if v_freq = 'WEEKLY' and p_recurrence_rule like '%BYDAY=%' then
    v_byday := string_to_array((regexp_match(p_recurrence_rule, 'BYDAY=([A-Z,]+)'))[1], ',');
    return (array['SU','MO','TU','WE','TH','FR','SA'])[extract(dow from p_target_date)::int + 1] = any(v_byday);
  end if;

  v_diff := p_target_date - p_start_date;
  if v_freq = 'DAILY' then
    return v_diff % v_interval = 0;
  elsif v_freq = 'WEEKLY' then
    return v_diff % (7 * v_interval) = 0;
  elsif v_freq = 'MONTHLY' then
    if extract(day from p_start_date) <> extract(day from p_target_date) then
      return false;
    end if;
    v_month_diff := (extract(year from p_target_date)::int * 12 + extract(month from p_target_date)::int)
                   - (extract(year from p_start_date)::int * 12 + extract(month from p_start_date)::int);
    return v_month_diff >= 0 and v_month_diff % v_interval = 0;
  elsif v_freq = 'YEARLY' then
    return extract(day from p_start_date) = extract(day from p_target_date)
       and extract(month from p_start_date) = extract(month from p_target_date);
  end if;
  return false;
end;
$$;

-- occurrence_date: en qué día se entregó ESTA ocurrencia del recordatorio — para eventos sueltos
-- (sin recurrencia) coincide siempre con la fecha propia del evento, así que el backfill no cambia
-- nada de comportamiento para ellos; para eventos recurrentes, permite que la semana/año que viene
-- vuelva a avisar en vez de quedar bloqueado para siempre por el envío de hoy.
alter table reminder_deliveries add column occurrence_date date;
update reminder_deliveries rd set occurrence_date = (
  select (e.start_at at time zone 'Europe/Madrid')::date
  from calendar_event_reminders cer join calendar_events e on e.id = cer.event_id
  where cer.id = rd.reminder_id
);
alter table reminder_deliveries alter column occurrence_date set not null;
alter table reminder_deliveries drop constraint reminder_deliveries_pkey;
alter table reminder_deliveries add primary key (reminder_id, subscription_id, occurrence_date);

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
      cer.anchor,
      cer.minutes_before,
      -- Recoloca la hora ORIGINAL (hora de Madrid) del evento sobre HOY — igual que occurrenceAt() en
      -- domain/calendar.ts — en vez de usar el start_at/end_at fijo, que solo vale para su primera
      -- ocurrencia.
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
    select reminder_id, event_id, family_id, title, anchor, anchor_at
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
    union
    select dr.reminder_id, dr.title, dr.anchor, dr.anchor_at, ps.id as sub_id, ps.endpoint as ep, ps.p256dh as p256dh_key, ps.auth as auth_key
    from due_reminders dr
    join profiles pr on pr.family_id = dr.family_id and pr.role = 'admin'
    join push_subscriptions ps on ps.profile_id = pr.id
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
