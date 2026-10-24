-- Avisos de cumpleaños: cada día, a las 09:00 (hora local de cada persona; Europe/Madrid si no ha elegido zona), un solo aviso con los cumpleaños de HOY y de MAÑANA
-- de las fichas de la familia y de los contactos con fecha de nacimiento. Sin cumpleaños no se envía nada. Una entrega por persona y día (clave de deduplicación del aviso),
-- ventana de 60 minutos desde las 09:00 como en los resúmenes de tareas (0283): un retraso del servidor no pierde el aviso y no se repite.
-- El 29 de febrero se celebra el 28 de febrero en los años no bisiestos. Categoría `birthday_reminder`, bucket 'personal', enlace /cumpleanos. Aditiva: solo funciones nuevas
-- y una tarea programada. Deshacer: supabase/rollbacks/0315_birthday_reminders_down.sql.

create or replace function private.birthday_on(p_birth date, p_day date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_birth is not null and (
    (extract(month from p_birth) = extract(month from p_day) and extract(day from p_birth) = extract(day from p_day))
    or (extract(month from p_birth) = 2 and extract(day from p_birth) = 29
        and extract(month from p_day) = 2 and extract(day from p_day) = 28
        and (extract(year from p_day)::int % 4 <> 0 or (extract(year from p_day)::int % 100 = 0 and extract(year from p_day)::int % 400 <> 0)))
  )
$$;
revoke execute on function private.birthday_on(date, date) from public, anon, authenticated;

create or replace function private.run_birthday_reminders_at(p_now timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_local timestamp;
  v_date date;
  v_today text;
  v_tomorrow text;
  v_body text;
  v_sent integer := 0;
begin
  for r in
    select p.id as profile_id, p.family_id, coalesce(np.timezone, 'Europe/Madrid') as tz
    from public.profiles p
    left join public.user_notification_prefs np on np.profile_id = p.id
    where p.family_id is not null
  loop
    begin
      v_local := (p_now at time zone r.tz);
      v_date := v_local::date;
      continue when (v_local - (v_date + time '09:00')) not between interval '0 minutes' and interval '60 minutes';

      with people as (
        select m.name, m.birth_date from public.family_members m where m.family_id = r.family_id and m.birth_date is not null
        union all
        select c.name, c.birth_date from public.contacts c where c.family_id = r.family_id and c.birth_date is not null
      )
      select
        string_agg(name || case when extract(year from v_date) - extract(year from birth_date) > 0
                                then ' (' || (extract(year from v_date)::int - extract(year from birth_date)::int) || ' años)' else '' end, ', ' order by name)
          filter (where private.birthday_on(birth_date, v_date)),
        string_agg(name || case when extract(year from v_date + 1) - extract(year from birth_date) > 0
                                then ' (' || (extract(year from (v_date + 1))::int - extract(year from birth_date)::int) || ' años)' else '' end, ', ' order by name)
          filter (where private.birthday_on(birth_date, v_date + 1))
      into v_today, v_tomorrow
      from people;

      continue when v_today is null and v_tomorrow is null;
      v_body := concat_ws('. ', case when v_today is not null then 'Hoy: ' || v_today end, case when v_tomorrow is not null then 'Mañana: ' || v_tomorrow end);
      perform private.notify_user(r.profile_id, 'personal', 'birthday_reminder', '🎂 Cumpleaños', v_body, '/cumpleanos', null, 'birthday:' || v_date::text, true,
                                  jsonb_build_object('version', 1, 'date', v_date));
      v_sent := v_sent + 1;
    exception when others then
      raise warning 'run_birthday_reminders (%): %', r.profile_id, sqlerrm;
    end;
  end loop;
  return v_sent;
end;
$$;
revoke execute on function private.run_birthday_reminders_at(timestamptz) from public, anon, authenticated;

create or replace function private.run_birthday_reminders()
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.run_birthday_reminders_at(now());
$$;
revoke execute on function private.run_birthday_reminders() from public, anon, authenticated;
grant execute on function private.run_birthday_reminders() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'birthday-reminders') then
    perform cron.unschedule('birthday-reminders');
  end if;
  perform cron.schedule('birthday-reminders', '*/5 * * * *', 'select private.run_birthday_reminders()');
end $$;
