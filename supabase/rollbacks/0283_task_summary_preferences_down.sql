-- Deshacer 0283: vuelve al resumen único de 0280 (hoy + atrasadas juntos, con daily_summary_*) y quita las preferencias nuevas.
-- Los avisos ya enviados no se tocan.
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
  v_today_json jsonb;
  v_over_json jsonb;
  v_payload jsonb;
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
        select p.id, p.title, p.occ_date,
               coalesce((select array_agg(fm.name order by fm.name) from public.calendar_event_members cem join public.family_members fm on fm.id = cem.member_id
                         where cem.event_id = p.id), '{}'::text[]) as assigned
        from pending p
        where exists (select 1 from private.event_notification_recipients(p.id, true) x where x.profile_id = r.profile_id)
      )
      select
        count(*) filter (where occ_date = v_date),
        count(*) filter (where occ_date < v_date),
        coalesce((array_agg(title order by title) filter (where occ_date = v_date))[1:3], '{}'),
        coalesce((array_agg(title || ' (' || to_char(occ_date, 'DD/MM') || ')' order by occ_date desc, title) filter (where occ_date < v_date))[1:3], '{}'),
        coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', left(title, 200), 'date', to_char(occ_date, 'YYYY-MM-DD'), 'assigned', to_jsonb(assigned)) order by title)
                 filter (where occ_date = v_date), '[]'::jsonb),
        coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', left(title, 200), 'date', to_char(occ_date, 'YYYY-MM-DD'), 'assigned', to_jsonb(assigned)) order by occ_date desc, title)
                 filter (where occ_date < v_date), '[]'::jsonb)
      into v_today_n, v_over_n, v_today_list, v_over_list, v_today_json, v_over_json
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

      v_payload := jsonb_build_object(
        'version', 1,
        'date', v_date,
        'today', jsonb_build_object('count', v_today_n, 'tasks', (select coalesce(jsonb_agg(t.x order by t.i), '[]'::jsonb) from jsonb_array_elements(v_today_json) with ordinality t(x, i) where t.i <= 100)),
        'overdue', jsonb_build_object('count', v_over_n, 'tasks', (select coalesce(jsonb_agg(t.x order by t.i), '[]'::jsonb) from jsonb_array_elements(v_over_json) with ordinality t(x, i) where t.i <= 100))
      );
      perform private.notify_user(r.profile_id, 'personal', 'task_daily_summary', v_title, v_body, '/calendario?fecha=' || v_date::text || '&tareas=1', null, 'daily:' || v_date::text, true, v_payload);
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

delete from public.daily_task_summary_deliveries where kind <> 'today';
alter table public.daily_task_summary_deliveries drop constraint daily_task_summary_deliveries_pkey;
alter table public.daily_task_summary_deliveries drop column kind;
alter table public.daily_task_summary_deliveries add primary key (profile_id, local_date);

alter table public.user_notification_prefs
  drop column task_today_enabled,
  drop column task_today_time,
  drop column task_overdue_enabled,
  drop column task_overdue_time;
