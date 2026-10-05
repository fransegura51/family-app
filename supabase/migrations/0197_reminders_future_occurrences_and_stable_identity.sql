-- Recordatorios de Calendario: cierre del sistema tras la auditoría de notificaciones duplicadas/antiguas.
--
-- Causas reales (comprobadas con datos de producción, evento «Reunión Padres Cole Eric» 5-oct-2026 16:30):
--   1. claim_due_reminders() solo miraba ocurrencias cuya fecha (Madrid) fuera HOY. Un recordatorio «1 día antes»
--      (1440 min) de un evento de mañana a las 16:30 no era «debido» hoy a las 16:30, así que no se enviaba hasta
--      que la ocurrencia pasaba a ser de «hoy», es decir, a las 00:00 del día del evento (entrega real a las
--      22:00 UTC = 00:00 Madrid). Ahora se evalúan también las ocurrencias de los próximos días, hasta cubrir
--      cualquier intervalo admitido (minutos, horas, días, semanas, meses, años), y el aviso sale en
--      anchor_at - minutes_before.
--   2. La entrega se identificaba solo por (reminder_id, subscription_id, occurrence_date). Si el usuario cambiaba
--      la HORA de un evento el mismo día, el aviso nuevo quedaba bloqueado por el ya enviado; y como la app
--      reescribe los recordatorios al editar (con ids nuevos), un cambio que no tocaba nada podía reenviar.
--      reminder_deliveries pasa a recordar el INSTANTE concreto al que se avisó (anchor_at): un aviso ya
--      entregado para esa ocurrencia, ese recordatorio y esa hora no se repite; si el horario cambia de verdad
--      (otra fecha u hora), es un aviso legítimamente nuevo.
--   3. La función devolvía solo la hora en UTC (out_anchor_at) y la Edge Function la formateaba sin zona horaria
--      (Deno corre en UTC): un evento a las 16:30 de verano decía «14:30». Ahora la base devuelve también la
--      fecha y la hora locales de Madrid ya calculadas (to_char sobre at time zone 'Europe/Madrid'), más el
--      desfase de días y si el evento es de «todo el día», para que el texto no dependa de la zona del servidor
--      ni invente una hora.
--
-- Qué NO cambia: Europe/Madrid como zona de referencia, a quién se avisa (miembros del evento + admins; privados
-- solo a quien los creó), la ventana «now() >= aviso and now() < anchor_at», la hora a la que se avisa de los
-- eventos de todo el día (sigue siendo la de su start_at interno), las ocurrencias recurrentes/excepciones
-- (private.event_occurs_on_date) ni la RPC pública (sigue siendo SECURITY DEFINER y solo ejecutable por service_role).
--
-- «1 día antes» = 1440 minutos de reloj, igual que hasta ahora (el valor se guarda en minutos y el cliente
-- también calcula con milisegundos): la hora local base de la ocurrencia se calcula en Madrid (sin desfases de
-- UTC) y el intervalo se resta como tiempo transcurrido. En las dos noches de cambio de hora al año eso puede
-- dar una hora local distinta de la del evento (p. ej. 17:30 en vez de 16:30).
--
-- Retrocompatibilidad en el despliegue: la función conserva sus 7 primeras columnas de salida con el mismo
-- significado, así que la Edge Function antigua sigue funcionando hasta que se despliegue la nueva.

alter table public.reminder_deliveries add column anchor_at timestamptz;

-- Backfill con exactamente la misma fórmula que usa la función: hora local de Madrid de start_at colocada sobre la
-- fecha de la ocurrencia (más la duración si el recordatorio cuenta desde el final).
update public.reminder_deliveries rd
set anchor_at = (
  select case
           when cer.anchor = 'end' and e.end_at is not null then
             ((rd.occurrence_date + (e.start_at at time zone 'Europe/Madrid')::time) at time zone 'Europe/Madrid') + (e.end_at - e.start_at)
           else
             (rd.occurrence_date + (e.start_at at time zone 'Europe/Madrid')::time) at time zone 'Europe/Madrid'
         end
  from public.calendar_event_reminders cer
  join public.calendar_events e on e.id = cer.event_id
  where cer.id = rd.reminder_id
);

alter table public.reminder_deliveries alter column anchor_at set not null;
alter table public.reminder_deliveries drop constraint reminder_deliveries_pkey;
alter table public.reminder_deliveries add primary key (reminder_id, subscription_id, occurrence_date, anchor_at);

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
  out_day_offset integer
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
  candidates as (
    select dr.reminder_id, dr.event_id, dr.title, dr.all_day, dr.anchor, dr.minutes_before, dr.occ_date, dr.anchor_at,
           ps.id as sub_id, ps.endpoint as ep, ps.p256dh as p256dh_key, ps.auth as auth_key
    from due_reminders dr
    join calendar_event_members cem on cem.event_id = dr.event_id
    join family_members fm on fm.id = cem.member_id
    join push_subscriptions ps on ps.profile_id = fm.linked_profile_id
    where dr.visibility = 'shared'
    union
    select dr.reminder_id, dr.event_id, dr.title, dr.all_day, dr.anchor, dr.minutes_before, dr.occ_date, dr.anchor_at,
           ps.id, ps.endpoint, ps.p256dh, ps.auth
    from due_reminders dr
    join profiles pr on pr.family_id = dr.family_id and pr.role = 'admin'
    join push_subscriptions ps on ps.profile_id = pr.id
    where dr.visibility = 'shared'
    union
    select dr.reminder_id, dr.event_id, dr.title, dr.all_day, dr.anchor, dr.minutes_before, dr.occ_date, dr.anchor_at,
           ps.id, ps.endpoint, ps.p256dh, ps.auth
    from due_reminders dr
    join push_subscriptions ps on ps.profile_id = dr.created_by
    where dr.visibility = 'private'
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
    ((c.anchor_at at time zone 'Europe/Madrid')::date - v_today)
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
