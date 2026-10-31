-- Avisos (NOT-01..04, 30/10/2026): vista del panel por persona, repetición de tareas atrasadas, destinatarios separados para tareas y eventos y aviso agrupado de
-- movimientos importados del banco.
--
--  · NOT-01  user_notification_prefs.notification_view_mode ('personal' = lo de siempre: Personales / Otras; 'areas' = agrupado por área) y personal_categories (qué tipos de
--            aviso cuentan como «personales» en la vista por prioridad; null = los que el servidor ya marcaba personales). Por PERSONA: valen en todos sus dispositivos.
--            Quien ya existe queda en 'personal' (no cambia nada hasta que lo elija).
--  · NOT-02  user_notification_prefs.overdue_repeat_hours (null = no repetir; 1, 2, 3, 6 o 24 h). Repite el aviso de TAREAS ATRASADAS (el que ya existe, a la hora elegida) cada N horas
--            mientras siga habiendo tareas atrasadas sin hacer. Se calcula en la base (sin consultas extra desde la app), en la zona horaria de la persona:
--            · solo si el aviso de atrasadas está activado y el de hoy ya salió (la primera notificación del día sigue siendo la de siempre);
--            · horas de silencio: nada antes de la hora del aviso de atrasadas ni desde las 21:00;
--            · sin avalancha al terminar el silencio: se reclama UNA repetición por intervalo (la referencia es la última enviada, no «las que faltaban»);
--            · se cancela sola al no quedar tareas atrasadas (completadas, borradas o ya no válidas) y al apagar el ajuste;
--            · sin duplicados entre dispositivos: es UN aviso por persona y repetición (clave anti-repeticiones + reclamo atómico en overdue_repeat_state);
--            · quien no lo ha activado (todos, al migrar) no recibe nada nuevo.
--  · NOT-03  families.event_notify_mode: destinatarios de los EVENTOS separados de los de las TAREAS (families.task_notify_mode). Valores por defecto cuando nadie ha elegido:
--            tareas = solo asignados, eventos = toda la familia activa. Quien ya había elegido un modo único lo conserva para las dos cosas (event_notify_mode se copia de task_notify_mode).
--            Se respeta «Aviso a toda la familia» de cada elemento, los elementos privados y la excepción de los menores sin cuenta (avisan a los adultos con cuenta).
--  · NOT-04  notify_bank_import(): UN aviso por lote de movimientos importados («Has recibido 1 ingreso y 3 cargos nuevos») en lugar de uno por movimiento. Solo service_role.
--            Reprocesar el mismo lote no duplica (clave anti-repeticiones del lote). user_notification_prefs.bank_import_enabled (por defecto sí) permite apagarlo.
-- Deshacer: supabase/rollbacks/0360_notifications_modes_repeat_bankimport_down.sql.

-- ---------------------------------------------------------------------------------------------
-- Preferencias nuevas por persona.
-- ---------------------------------------------------------------------------------------------
alter table public.user_notification_prefs
  add column notification_view_mode text not null default 'personal' check (notification_view_mode in ('areas', 'personal')),
  add column personal_categories text[] check (personal_categories is null or cardinality(personal_categories) <= 60),
  add column overdue_repeat_hours smallint check (overdue_repeat_hours is null or overdue_repeat_hours in (1, 2, 3, 6, 24)),
  add column bank_import_enabled boolean not null default true;

-- Estado de la repetición (una fila por persona). RLS activo SIN políticas: solo lo toca la función de abajo.
create table public.overdue_repeat_state (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  last_sent_at timestamptz not null,
  local_date date not null,
  repeat_count integer not null default 1
);
alter table public.overdue_repeat_state enable row level security;
revoke all on public.overdue_repeat_state from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- NOT-03: destinatarios separados para tareas y eventos.
-- ---------------------------------------------------------------------------------------------
alter table public.families add column event_notify_mode text check (event_notify_mode in ('all', 'assigned'));
-- Quien ya había elegido un modo único lo conserva para los eventos (no cambia nada de lo que ya recibía).
update public.families set event_notify_mode = task_notify_mode where task_notify_mode is not null;

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
  select ev.family_id, ev.kind, ev.visibility, ev.created_by, ev.notify_family into e from public.calendar_events ev where ev.id = p_event_id;
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

  -- Modo de ESTE tipo de elemento. Sin elegir: tareas → solo asignados; eventos → toda la familia.
  select case when e.kind = 'task' then coalesce(f.task_notify_mode, 'assigned') else coalesce(f.event_notify_mode, 'all') end
    into v_mode from public.families f where f.id = e.family_id;

  -- Todas las cuentas de la familia con acceso al calendario (modo «toda la familia», o «Aviso a toda la familia» marcado en ese elemento).
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
    return query select p.id from public.profiles p where p.family_id = e.family_id and p.role in ('admin', 'adult')
      and (p.allowed_sections is null or 'calendario' = any(p.allowed_sections));
  end if;
end;
$$;
revoke execute on function private.event_notification_recipients(uuid, boolean) from public, anon, authenticated;
grant execute on function private.event_notification_recipients(uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------------------------
-- NOT-02: repetición del aviso de tareas atrasadas.
-- ---------------------------------------------------------------------------------------------
create or replace function private.run_overdue_repeats_at(p_now timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_local timestamp;
  v_date date;
  v_ref timestamptz;
  v_state_ref timestamptz;
  v_n integer;
  v_list text[];
  v_json jsonb;
  v_group jsonb;
  v_payload jsonb;
  v_cnt integer;
  v_sent integer := 0;
  c_quiet_from constant time := '21:00';
begin
  for r in
    select p.id as profile_id, p.family_id,
           coalesce(np.timezone, 'Europe/Madrid') as tz,
           np.overdue_repeat_hours as hrs,
           coalesce(np.task_overdue_time, time '09:00') as start_tm
    from public.profiles p
    join public.user_notification_prefs np on np.profile_id = p.id
    where np.overdue_repeat_hours is not null and np.task_overdue_enabled
      and (p.allowed_sections is null or 'calendario' = any(p.allowed_sections))
  loop
    begin
      v_local := (p_now at time zone r.tz);
      v_date := v_local::date;
      -- Horas de silencio: nada antes de la hora del aviso de atrasadas ni desde las 21:00 (hora local de la persona).
      continue when v_local::time < r.start_tm or v_local::time >= c_quiet_from;
      -- La primera del día es el aviso de siempre: hasta que no haya salido, no se repite nada.
      select d.sent_at into v_ref from public.daily_task_summary_deliveries d where d.profile_id = r.profile_id and d.local_date = v_date and d.kind = 'overdue';
      continue when v_ref is null;
      select s.last_sent_at into v_state_ref from public.overdue_repeat_state s where s.profile_id = r.profile_id and s.local_date = v_date;
      if v_state_ref is not null and v_state_ref > v_ref then
        v_ref := v_state_ref;
      end if;
      -- Referencia = la última enviada (no las que «faltaban»): tras el silencio sale UNA, no una avalancha.
      continue when p_now < v_ref + make_interval(hours => r.hrs);

      with cand as (
        select e.id, e.title, e.recurrence_rule, e.exception_dates, (e.start_at at time zone 'Europe/Madrid')::date as start_date
        from public.calendar_events e
        where e.family_id = r.family_id and e.kind = 'task'
          and (e.recurrence_rule is not null or (e.start_at at time zone 'Europe/Madrid')::date < v_date)
      ),
      occ as (
        select c.id, c.title, c.start_date as occ_date from cand c where c.recurrence_rule is null
        union all
        select c.id, c.title, g::date
        from cand c
        cross join lateral generate_series((v_date - 365)::timestamp, (v_date - 1)::timestamp, interval '1 day') g
        where c.recurrence_rule is not null
          and private.event_occurs_on_date(c.start_date, c.recurrence_rule, c.exception_dates, g::date)
      ),
      pending as (
        select o.id, o.title, o.occ_date
        from occ o
        where not exists (select 1 from public.calendar_event_completions cc where cc.event_id = o.id and cc.occurrence_date = o.occ_date)
      ),
      mine as (
        select p.id, p.title, p.occ_date,
               coalesce((select array_agg(fm.name order by fm.name) from public.calendar_event_members cem join public.family_members fm on fm.id = cem.member_id
                         where cem.event_id = p.id), '{}'::text[]) as assigned
        from pending p
        where p.occ_date < v_date
          and exists (select 1 from private.event_notification_recipients(p.id, true) x where x.profile_id = r.profile_id)
      )
      select
        count(*),
        coalesce((array_agg(title || ' (' || to_char(occ_date, 'DD/MM') || ')' order by occ_date desc, title))[1:3], '{}'),
        coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', left(title, 200), 'date', to_char(occ_date, 'YYYY-MM-DD'), 'assigned', to_jsonb(assigned)) order by occ_date desc, title), '[]'::jsonb)
      into v_n, v_list, v_json
      from mine;

      -- Ya no queda nada atrasado (completadas, borradas o ya no válidas): se cancela la repetición.
      if coalesce(v_n, 0) = 0 then
        delete from public.overdue_repeat_state where profile_id = r.profile_id;
        continue;
      end if;

      -- Reclamo atómico: dos ejecuciones a la vez (o un reintento) no pueden enviar la misma repetición.
      v_cnt := null;
      insert into public.overdue_repeat_state as s (profile_id, last_sent_at, local_date, repeat_count)
      values (r.profile_id, p_now, v_date, 1)
      on conflict (profile_id) do update
        set last_sent_at = excluded.last_sent_at,
            repeat_count = case when s.local_date = excluded.local_date then s.repeat_count + 1 else 1 end,
            local_date = excluded.local_date
        where s.local_date <> excluded.local_date or s.last_sent_at <= p_now - make_interval(hours => r.hrs)
      returning s.repeat_count into v_cnt;
      continue when v_cnt is null;

      v_group := jsonb_build_object('count', v_n, 'tasks', (select coalesce(jsonb_agg(t.x order by t.i), '[]'::jsonb) from jsonb_array_elements(v_json) with ordinality t(x, i) where t.i <= 100));
      v_payload := jsonb_build_object('version', 1, 'kind', 'overdue', 'date', v_date, 'repeat', v_cnt,
                                      'today', jsonb_build_object('count', 0, 'tasks', '[]'::jsonb), 'overdue', v_group);
      perform private.notify_user(r.profile_id, 'personal', 'task_overdue_summary', 'Tareas atrasadas (recordatorio)',
                                  'Atrasadas (' || v_n || '): ' || array_to_string(v_list, ', ') || case when v_n > 3 then ' y ' || (v_n - 3) || ' más' else '' end,
                                  '/calendario?fecha=' || v_date::text || '&tareas=1', null, 'task-overdue-repeat:' || v_date::text || ':' || v_cnt, true, v_payload);
      v_sent := v_sent + 1;
    exception when others then
      raise warning 'run_overdue_repeats (%): %', r.profile_id, sqlerrm;
    end;
  end loop;

  -- Estado de días anteriores sin tareas ni ajustes ya no hace falta.
  delete from public.overdue_repeat_state where local_date < (p_now at time zone 'UTC')::date - 3;
  return v_sent;
end;
$$;
revoke execute on function private.run_overdue_repeats_at(timestamptz) from public, anon, authenticated;

-- El trabajo programado de siempre (cada 5 minutos) también lanza las repeticiones; un fallo ahí nunca estropea los resúmenes.
create or replace function private.run_daily_task_summaries()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sent integer;
begin
  v_sent := private.run_daily_task_summaries_at(now());
  begin
    perform private.run_overdue_repeats_at(now());
  exception when others then
    raise warning 'run_overdue_repeats: %', sqlerrm;
  end;
  return v_sent;
end;
$$;
revoke execute on function private.run_daily_task_summaries() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- NOT-04: aviso agrupado de movimientos importados del banco.
-- Destinatarios: el titular de la cuenta (con cuenta de PEPA y acceso a Economía); si la cuenta es común (sin titular), los adultos con cuenta y acceso a Economía.
-- El lote se identifica con p_batch (huella de los movimientos nuevos): reprocesarlo no duplica el aviso.
-- ---------------------------------------------------------------------------------------------
create or replace function public.notify_bank_import(
  p_account_id uuid,
  p_batch text,
  p_credits integer,
  p_debits integer,
  p_expense_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_owner uuid;
  v_owner_profile uuid;
  r record;
  v_parts text[] := '{}';
  v_body text;
  v_total integer := coalesce(p_credits, 0) + coalesce(p_debits, 0);
  v_sent integer := 0;
  v_id uuid;
begin
  if v_total <= 0 or p_batch is null or char_length(p_batch) > 100 then
    return 0;
  end if;
  select bc.family_id, ba.owner_member_id into v_family, v_owner
  from public.bank_accounts ba join public.bank_connections bc on bc.id = ba.connection_id
  where ba.id = p_account_id;
  if not found then
    return 0;
  end if;
  if v_owner is not null then
    select fm.linked_profile_id into v_owner_profile from public.family_members fm where fm.id = v_owner;
  end if;

  if coalesce(p_credits, 0) > 0 then v_parts := v_parts || (p_credits || case when p_credits = 1 then ' ingreso' else ' ingresos' end); end if;
  if coalesce(p_debits, 0) > 0 then v_parts := v_parts || (p_debits || case when p_debits = 1 then ' cargo' else ' cargos' end); end if;
  v_body := 'Has recibido ' || array_to_string(v_parts, ' y ') || case when v_total = 1 then ' nuevo' else ' nuevos' end;

  for r in
    select p.id as profile_id
    from public.profiles p
    left join public.user_notification_prefs np on np.profile_id = p.id
    where p.family_id = v_family
      and p.role in ('admin', 'adult')
      and (p.allowed_sections is null or 'dinero' = any(p.allowed_sections))
      and coalesce(np.bank_import_enabled, true)
      and (v_owner is null or p.id = v_owner_profile)
  loop
    v_id := private.notify_user(
      r.profile_id, 'other', 'bank_import', 'Movimientos nuevos del banco', v_body, '/dinero?importados=1', 'bank-import',
      'bankimport:' || p_account_id || ':' || p_batch, true,
      jsonb_build_object('version', 1, 'credits', coalesce(p_credits, 0), 'debits', coalesce(p_debits, 0), 'expense_ids', to_jsonb(coalesce(p_expense_ids[1:200], '{}'::uuid[]))));
    if v_id is not null then v_sent := v_sent + 1; end if;
  end loop;
  return v_sent;
end;
$$;
revoke all on function public.notify_bank_import(uuid, text, integer, integer, uuid[]) from public, anon, authenticated;
grant execute on function public.notify_bank_import(uuid, text, integer, integer, uuid[]) to service_role;
