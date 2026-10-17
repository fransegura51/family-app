-- Avisos de tareas: DOS resúmenes independientes por persona (tareas de hoy y tareas atrasadas), cada uno con su interruptor y su hora.
--
-- Hasta ahora había UN solo resumen diario (0262/0280) con las dos cosas juntas, a la hora de `daily_summary_time` (08:00 por defecto). Ahora:
--   · «Avisarme de las tareas de hoy»   → task_today_enabled / task_today_time     (por defecto activado, 08:00).
--   · «Avisarme de las tareas atrasadas» → task_overdue_enabled / task_overdue_time (por defecto activado, 09:00).
-- Son preferencias de CADA persona (user_notification_prefs, en el servidor: valen en todos sus dispositivos) y se calculan en SU zona horaria (timezone). Sin fila de ajustes
-- se usan los valores por defecto. Las personas que ya habían elegido hora/activación para el resumen conservan esa elección para «hoy» (y para «atrasadas» su activación,
-- a las 09:00); las columnas antiguas (daily_summary_*) se dejan como están, sin usar.
--
-- Qué NO cambia: quién recibe cada tarea (private.event_notification_recipients, permisos y visibilidad de tareas familiares y personales), el cálculo de pendientes y
-- atrasadas por OCURRENCIA (las repetitivas generan una ocurrencia independiente cada día), la ventana de envío (desde la hora elegida hasta 60 minutos después: un retraso o el
-- cambio de hora no pierden el aviso y cambiar la hora a una anterior a «ahora» no dispara uno fuera de ventana), el enlace, el push, el listado completo en el aviso (0280)
-- ni los recordatorios individuales de tareas y eventos. Estas opciones SOLO gobiernan los resúmenes diarios.
-- Sin duplicados: una entrega única por persona, día local y tipo (daily_task_summary_deliveries) + la clave de deduplicación del aviso; un reinicio, un reintento o un
-- cambio de hora no repiten el resumen del mismo tipo el mismo día. Las entregas ya registradas hoy cuentan para los DOS tipos (el resumen antiguo ya llevaba ambas
-- cosas): el día de la puesta en marcha nadie recibe dos veces lo mismo.
-- Un resumen vacío no se envía. El aviso de hoy usa la categoría task_daily_summary (como antes) y el de atrasadas task_overdue_summary.
-- Deshacer: supabase/rollbacks/0283_task_summary_preferences_down.sql.

alter table public.user_notification_prefs
  add column task_today_enabled boolean not null default true,
  add column task_today_time time not null default '08:00',
  add column task_overdue_enabled boolean not null default true,
  add column task_overdue_time time not null default '09:00';

-- Quien ya había elegido algo para el resumen diario lo conserva.
update public.user_notification_prefs
set task_today_enabled = daily_summary_enabled, task_today_time = daily_summary_time, task_overdue_enabled = daily_summary_enabled;

-- Entregas: una por persona, día local y TIPO.
alter table public.daily_task_summary_deliveries add column kind text not null default 'today' check (kind in ('today', 'overdue'));
alter table public.daily_task_summary_deliveries drop constraint daily_task_summary_deliveries_pkey;
alter table public.daily_task_summary_deliveries add primary key (profile_id, local_date, kind);
-- El resumen antiguo ya incluía las dos cosas: lo registrado hoy cuenta también como «atrasadas» ya enviadas.
insert into public.daily_task_summary_deliveries (profile_id, local_date, kind, sent_at)
select profile_id, local_date, 'overdue', sent_at from public.daily_task_summary_deliveries where kind = 'today'
on conflict do nothing;

create or replace function private.run_daily_task_summaries_at(p_now timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_kind text;
  v_on boolean;
  v_time time;
  v_local timestamp;
  v_date date;
  v_ins integer;
  v_sent integer := 0;
  v_n integer;
  v_list text[];
  v_json jsonb;
  v_title text;
  v_body text;
  v_payload jsonb;
  v_group jsonb;
begin
  for r in
    select p.id as profile_id, p.family_id,
           coalesce(np.timezone, 'Europe/Madrid') as tz,
           coalesce(np.task_today_enabled, true) as today_on,
           coalesce(np.task_today_time, time '08:00') as today_tm,
           coalesce(np.task_overdue_enabled, true) as over_on,
           coalesce(np.task_overdue_time, time '09:00') as over_tm
    from public.profiles p
    left join public.user_notification_prefs np on np.profile_id = p.id
    where (coalesce(np.task_today_enabled, true) or coalesce(np.task_overdue_enabled, true))
      and (p.allowed_sections is null or 'calendario' = any(p.allowed_sections))
  loop
    v_local := (p_now at time zone r.tz);
    v_date := v_local::date;
    foreach v_kind in array array['today', 'overdue'] loop
      begin
        v_on := case when v_kind = 'today' then r.today_on else r.over_on end;
        v_time := case when v_kind = 'today' then r.today_tm else r.over_tm end;
        continue when not v_on;
        -- Solo dentro de la ventana [hora elegida, hora elegida + 60 min] del día local de esta persona.
        continue when (v_local - (v_date + v_time)) not between interval '0 minutes' and interval '60 minutes';

        insert into public.daily_task_summary_deliveries (profile_id, local_date, kind) values (r.profile_id, v_date, v_kind) on conflict do nothing;
        get diagnostics v_ins = row_count;
        continue when v_ins = 0;

        with cand as (
          select e.id, e.title, e.recurrence_rule, e.exception_dates, (e.start_at at time zone 'Europe/Madrid')::date as start_date
          from public.calendar_events e
          where e.family_id = r.family_id and e.kind = 'task'
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
          select p.id, p.title, p.occ_date,
                 coalesce((select array_agg(fm.name order by fm.name) from public.calendar_event_members cem join public.family_members fm on fm.id = cem.member_id
                           where cem.event_id = p.id), '{}'::text[]) as assigned
          from pending p
          where exists (select 1 from private.event_notification_recipients(p.id, true) x where x.profile_id = r.profile_id)
            and case when v_kind = 'today' then p.occ_date = v_date else p.occ_date < v_date end
        )
        select
          count(*),
          coalesce((array_agg(case when v_kind = 'today' then title else title || ' (' || to_char(occ_date, 'DD/MM') || ')' end order by occ_date desc, title))[1:3], '{}'),
          coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', left(title, 200), 'date', to_char(occ_date, 'YYYY-MM-DD'), 'assigned', to_jsonb(assigned)) order by occ_date desc, title), '[]'::jsonb)
        into v_n, v_list, v_json
        from mine;

        -- Sin tareas, no se envía un aviso vacío.
        continue when coalesce(v_n, 0) = 0;

        v_title := case when v_kind = 'today' then 'Tareas pendientes de hoy' else 'Tareas atrasadas' end;
        v_body := (case when v_kind = 'today' then 'Hoy (' else 'Atrasadas (' end) || v_n || '): ' || array_to_string(v_list, ', ') || case when v_n > 3 then ' y ' || (v_n - 3) || ' más' else '' end;
        -- Listado completo en el aviso (hasta 100; el contador real va aparte), igual que en 0280. El otro grupo va vacío para que la app lea el mismo formato.
        v_group := jsonb_build_object('count', v_n, 'tasks', (select coalesce(jsonb_agg(t.x order by t.i), '[]'::jsonb) from jsonb_array_elements(v_json) with ordinality t(x, i) where t.i <= 100));
        v_payload := jsonb_build_object(
          'version', 1,
          'kind', v_kind,
          'date', v_date,
          'today', case when v_kind = 'today' then v_group else jsonb_build_object('count', 0, 'tasks', '[]'::jsonb) end,
          'overdue', case when v_kind = 'overdue' then v_group else jsonb_build_object('count', 0, 'tasks', '[]'::jsonb) end
        );
        perform private.notify_user(r.profile_id, 'personal', case when v_kind = 'today' then 'task_daily_summary' else 'task_overdue_summary' end, v_title, v_body,
                                    '/calendario?fecha=' || v_date::text || '&tareas=1', null, 'task-' || v_kind || ':' || v_date::text, true, v_payload);
        v_sent := v_sent + 1;
      exception when others then
        raise warning 'run_daily_task_summaries (%, %): %', r.profile_id, v_kind, sqlerrm;
      end;
    end loop;
  end loop;

  delete from public.daily_task_summary_deliveries where local_date < (p_now at time zone 'UTC')::date - 3;
  return v_sent;
end;
$$;
revoke execute on function private.run_daily_task_summaries_at(timestamptz) from public, anon, authenticated;
