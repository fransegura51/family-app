-- Resumen diario de tareas: UN aviso al día por persona con sus tareas pendientes de hoy y las atrasadas de días anteriores.
--
-- Reglas aprobadas (PEPA-NOT-01 a 05):
--  · Activado por defecto, a las 08:00 de la hora de CADA persona (user_notification_prefs.timezone y daily_summary_time; sin fila = Europe/Madrid y 08:00).
--  · Una sola notificación agrupada al día, con dos grupos diferenciados (hoy / atrasadas). No incluye tareas completadas. Si no hay pendientes, no se envía.
--  · Es un aviso PERSONAL (no depende de la franja de sugerencias de Pepa).
--  · Una tarea asignada DESPUÉS del resumen no repite el resumen: recibe su aviso de asignación y, si sigue pendiente, aparecerá al día siguiente.
--  · Las tareas repetitivas generan ocurrencias independientes: completar la del lunes no completa las siguientes. Si la del lunes 19 queda pendiente,
--    aparece como atrasada desde el martes 20 y cada día posterior hasta completarse o eliminarse; la del lunes siguiente se muestra aparte.
--  · Jamás se avisa al creador por marcar una tarea como hecha (no hay ningún trigger sobre calendar_event_completions).
--
-- Decisiones técnicas (documentadas, no son reglas de producto):
--  · Ventana de envío: desde la hora elegida hasta 60 minutos después (el trabajo corre cada 5 minutos). Así un retraso o el «salto» de hora de primavera no
--    pierden el aviso, y cambiar la hora a una anterior a «ahora» no dispara un aviso inmediato fuera de ventana. Con el cambio de hora de otoño (la misma
--    hora local ocurre dos veces) solo se envía una vez: delivery única por persona y fecha local.
--  · Las ocurrencias de una serie se miran hasta 365 días atrás; una tarea suelta sin completar se considera atrasada sin límite.
--  · Las fechas de las tareas son fechas de calendario (Europe/Madrid, como el resto del calendario); «hoy» es la fecha local de la persona.
--  · El cálculo vive en private.run_daily_task_summaries_at(p_now): recibe «qué hora es» como parámetro para poder PROBARLO en un día de cambio de hora
--    (INC-19) sin esperar al domingo. private.run_daily_task_summaries() (la que llama pg_cron) solo la llama con now(): el comportamiento real no cambia.
--  · Enlace del aviso (INC-14): /calendario?fecha=<hoy de la persona>&tareas=1 → Calendario abre ese día y baja al bloque «Tareas».
--  · Destinatarios: private.event_notification_recipients(tarea, true) (0261): en el modo sin elegir (null) del ajuste familiar, solo las personas asignadas.

create table public.daily_task_summary_deliveries (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  local_date date not null,
  sent_at timestamptz not null default now(),
  primary key (profile_id, local_date)
);
alter table public.daily_task_summary_deliveries enable row level security;
revoke all on public.daily_task_summary_deliveries from anon, authenticated;

create or replace function private.run_daily_task_summaries_at(p_now timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_local timestamp;
  v_date date;
  v_ins integer;
  v_sent integer := 0;
  v_today_n integer;
  v_over_n integer;
  v_today_list text[];
  v_over_list text[];
  v_title text;
  v_body text;
  v_family uuid;
begin
  for r in
    select p.id as profile_id, p.family_id,
           coalesce(np.timezone, 'Europe/Madrid') as tz,
           coalesce(np.daily_summary_time, time '08:00') as tm
    from public.profiles p
    left join public.user_notification_prefs np on np.profile_id = p.id
    where coalesce(np.daily_summary_enabled, true)
      and (p.allowed_sections is null or 'calendario' = any(p.allowed_sections))
  loop
    begin
      v_local := (p_now at time zone r.tz);
      v_date := v_local::date;
      -- Solo dentro de la ventana [hora elegida, hora elegida + 60 min] del día local de esta persona.
      continue when (v_local - (v_date + r.tm)) not between interval '0 minutes' and interval '60 minutes';

      insert into public.daily_task_summary_deliveries (profile_id, local_date) values (r.profile_id, v_date) on conflict do nothing;
      get diagnostics v_ins = row_count;
      continue when v_ins = 0;

      v_family := r.family_id;

      with cand as (
        select e.id, e.title, e.recurrence_rule, e.exception_dates, (e.start_at at time zone 'Europe/Madrid')::date as start_date
        from public.calendar_events e
        where e.family_id = v_family and e.kind = 'task'
          and (e.recurrence_rule is not null or (e.start_at at time zone 'Europe/Madrid')::date <= v_date)
      ),
      occ as (
        select c.id, c.title, c.start_date as occ_date
        from cand c
        where c.recurrence_rule is null
        union all
        select c.id, c.title, g::date
        from cand c
        cross join lateral generate_series((v_date - 365)::timestamp, v_date::timestamp, interval '1 day') g
        where c.recurrence_rule is not null
          and private.event_occurs_on_date(c.start_date, c.recurrence_rule, c.exception_dates, g::date)
      ),
      pending as (
        select o.id, o.title, o.occ_date
        from occ o
        where not exists (
          select 1 from public.calendar_event_completions cc where cc.event_id = o.id and cc.occurrence_date = o.occ_date
        )
      ),
      mine as (
        select p.* from pending p
        where exists (select 1 from private.event_notification_recipients(p.id, true) x where x.profile_id = r.profile_id)
      )
      select
        count(*) filter (where occ_date = v_date),
        count(*) filter (where occ_date < v_date),
        coalesce((array_agg(title order by title) filter (where occ_date = v_date))[1:3], '{}'),
        coalesce((array_agg(title || ' (' || to_char(occ_date, 'DD/MM') || ')' order by occ_date desc, title) filter (where occ_date < v_date))[1:3], '{}')
      into v_today_n, v_over_n, v_today_list, v_over_list
      from mine;

      if coalesce(v_today_n, 0) = 0 and coalesce(v_over_n, 0) = 0 then
        continue;
      end if;

      v_title := case
        when v_over_n = 0 then 'Tareas pendientes de hoy'
        when v_today_n = 0 then 'Tareas atrasadas'
        else 'Tareas pendientes y atrasadas'
      end;
      v_body := concat_ws(E'\n',
        case when v_today_n > 0 then
          'Hoy (' || v_today_n || '): ' || array_to_string(v_today_list, ', ') || case when v_today_n > 3 then ' y ' || (v_today_n - 3) || ' más' else '' end
        end,
        case when v_over_n > 0 then
          'Atrasadas (' || v_over_n || '): ' || array_to_string(v_over_list, ', ') || case when v_over_n > 3 then ' y ' || (v_over_n - 3) || ' más' else '' end
        end
      );

      perform private.notify_user(r.profile_id, 'personal', 'task_daily_summary', v_title, v_body, '/calendario?fecha=' || v_date::text || '&tareas=1', null, 'daily:' || v_date::text, true);
      v_sent := v_sent + 1;
    exception when others then
      raise warning 'run_daily_task_summaries (%): %', r.profile_id, sqlerrm;
    end;
  end loop;

  delete from public.daily_task_summary_deliveries where local_date < (p_now at time zone 'UTC')::date - 3;
  return v_sent;
end;
$$;
revoke execute on function private.run_daily_task_summaries_at(timestamptz) from public, anon, authenticated;

-- La que programa pg_cron: la hora real de ahora.
create or replace function private.run_daily_task_summaries()
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.run_daily_task_summaries_at(now());
$$;
revoke execute on function private.run_daily_task_summaries() from public, anon, authenticated;
grant execute on function private.run_daily_task_summaries() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'daily-task-summaries') then
    perform cron.unschedule('daily-task-summaries');
  end if;
  perform cron.schedule('daily-task-summaries', '*/5 * * * *', 'select private.run_daily_task_summaries()');
end $$;
