-- Avisos de llegada/salida y de hora diaria calculados en el SERVIDOR, no en el móvil de quien mira.
--
-- Petición real: "Los avisos de Paco ha llegado a casa, Paco ha salido del trabajo... están llegando
-- mucho después. Quiero que lleguen cuando Paco se mueva o cuando Jennifer se mueva, cuando alguno de
-- los familiares se mueva. No solo en esto, en todos los componentes."
--
-- Causa real: AutomationWatcher (cliente) evaluaba las reglas en el navegador de quien tuviera la app
-- abierta, cada 30 s, y avisaba con una notificación local. Con la app cerrada o en segundo plano (lo
-- normal en un móvil) no se evaluaba NADA: el aviso salía solo cuando alguien volvía a abrir la app,
-- mucho después de que Paco hubiera llegado. Y el estado "¿estaba cerca?" vivía en localStorage de cada
-- dispositivo, así que ni siquiera se compartía entre móviles.
--
-- Ahora: al guardarse la posición de alguien (member_locations) la propia base de datos comprueba sus
-- reglas de llegada/salida EN ESE INSTANTE y, solo si de verdad hay un cambio, pide a la Edge Function
-- send-family-push que mande el Web Push. Sin llamadas extra por cada posición (los cálculos son SQL
-- puro dentro de la base de datos); la Edge Function solo se invoca cuando hay un aviso que mandar.

-- ---------------------------------------------------------------------------------------------
-- Estado compartido (antes: localStorage de cada móvil). RLS activo SIN políticas: nadie lo lee ni lo
-- escribe por la API normal, solo las funciones SECURITY DEFINER de abajo.
-- ---------------------------------------------------------------------------------------------
create table automation_rule_member_state (
  rule_id uuid not null references automation_rules(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  near boolean not null,
  updated_at timestamptz not null default now(),
  primary key (rule_id, member_id)
);

create index idx_automation_rule_member_state_member on automation_rule_member_state(member_id);

alter table automation_rule_member_state enable row level security;

create table automation_rule_daily_state (
  rule_id uuid primary key references automation_rules(id) on delete cascade,
  last_fired_on date not null
);

alter table automation_rule_daily_state enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Distancia en metros entre dos puntos — misma fórmula (haversine, R = 6.371.000 m) que
-- distanceMeters en src/domain/geo.ts, para que cliente y servidor opinen igual.
-- ---------------------------------------------------------------------------------------------
create or replace function private.distance_m(
  lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision
)
returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 2 * 6371000 * asin(least(1.0, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
  )))
$$;

revoke execute on function private.distance_m(double precision, double precision, double precision, double precision) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Pide a la Edge Function send-family-push que mande un Web Push a los dispositivos de la familia.
-- La autenticación es el mismo secreto compartido (Vault) que ya usa el cron de recordatorios.
-- p_exclude_member_id: quien se ha movido no necesita que le avisen de sí mismo (como Google Maps).
-- ---------------------------------------------------------------------------------------------
create or replace function private.send_family_push(
  p_family_id uuid,
  p_exclude_member_id uuid,
  p_title text,
  p_body text,
  p_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := 'https://objhgjgrinbhyzscjlbw.supabase.co/functions/v1/send-family-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select public.get_app_secret('cron_shared_secret'))
    ),
    body := jsonb_build_object(
      'family_id', p_family_id,
      'exclude_member_id', p_exclude_member_id,
      'title', p_title,
      'body', p_body,
      'url', p_url
    )
  );
end;
$$;

revoke execute on function private.send_family_push(uuid, uuid, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Llegada/salida: se evalúa al guardar la posición de alguien.
--
-- Cada consulta filtra por la familia de la fila que se acaba de guardar (new.family_id), sin
-- excepción — esta función corre como SECURITY DEFINER (sin RLS), así que ese filtro es la única
-- barrera entre familias.
--
-- Primera observación de una regla+persona: solo se anota el estado, no avisa (antes, al arrancar el
-- móvil, se asumía "lejos" y cualquiera que ya estuviera en casa disparaba un "ha llegado" falso).
-- Histéresis: para considerar que alguien SE HA IDO tiene que alejarse un poco más del radio (25 % +
-- 20 m) que el que hace falta para considerar que HA LLEGADO — el GPS de interior baila decenas de
-- metros y sin esto un mismo trayecto podía dar varios "llegó/se fue" seguidos en el borde del radio.
--
-- Todo va dentro de un bloque con EXCEPTION: un fallo aquí NUNCA debe impedir que se guarde la
-- ubicación (es lo más importante de la pantalla Ubicación), solo se queda sin aviso esa vez.
-- ---------------------------------------------------------------------------------------------
create or replace function private.evaluate_location_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_dist double precision;
  v_prev boolean;
  v_near boolean;
  v_member_name text;
begin
  begin
    for r in
      select ar.id, ar.name, ar.trigger_type, ar.message,
             lp.name as place_name, lp.latitude as place_lat, lp.longitude as place_lon, lp.radius_m
      from public.automation_rules ar
      join public.location_places lp on lp.id = ar.place_id and lp.family_id = ar.family_id
      where ar.family_id = new.family_id
        and ar.active
        and (ar.muted_until is null or ar.muted_until <= now())
        and ar.trigger_type in ('llegada', 'salida')
        and (ar.member_id is null or ar.member_id = new.member_id)
    loop
      v_dist := private.distance_m(new.latitude, new.longitude, r.place_lat, r.place_lon);

      select s.near into v_prev
      from public.automation_rule_member_state s
      where s.rule_id = r.id and s.member_id = new.member_id;

      if v_prev is null then
        insert into public.automation_rule_member_state (rule_id, member_id, near)
        values (r.id, new.member_id, v_dist <= r.radius_m)
        on conflict (rule_id, member_id) do nothing;
        continue;
      end if;

      if v_prev then
        v_near := v_dist <= (r.radius_m * 1.25 + 20);
      else
        v_near := v_dist <= r.radius_m;
      end if;

      if v_near = v_prev then
        continue;
      end if;

      update public.automation_rule_member_state
      set near = v_near, updated_at = now()
      where rule_id = r.id and member_id = new.member_id;

      if (r.trigger_type = 'llegada' and v_near) or (r.trigger_type = 'salida' and not v_near) then
        select fm.name into v_member_name
        from public.family_members fm
        where fm.id = new.member_id and fm.family_id = new.family_id;

        perform private.send_family_push(
          new.family_id,
          new.member_id,
          replace(replace(r.name, '{miembro}', coalesce(v_member_name, 'Alguien')), '{lugar}', r.place_name),
          replace(replace(r.message, '{miembro}', coalesce(v_member_name, 'Alguien')), '{lugar}', r.place_name),
          '/ubicacion'
        );
      end if;
    end loop;
  exception when others then
    raise warning 'evaluate_location_rules: %', sqlerrm;
  end;

  return new;
end;
$$;

revoke execute on function private.evaluate_location_rules() from public, anon, authenticated;

create trigger trg_evaluate_location_rules
  after insert or update of latitude, longitude on member_locations
  for each row execute function private.evaluate_location_rules();

-- ---------------------------------------------------------------------------------------------
-- Hora diaria ("Recordar la mochila a las 8:00"): antes solo se avisaba si alguien abría la app
-- pasada esa hora. Ahora lo mira el servidor cada minuto (pg_cron) y avisa dentro de los 30 minutos
-- siguientes a la hora fijada, una vez al día por regla. La hora es la de España peninsular
-- (Europe/Madrid) — cuando haya familias de otras zonas habrá que guardar la zona por familia.
-- ---------------------------------------------------------------------------------------------
create or replace function private.fire_daily_automations()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_local timestamp := (now() at time zone 'Europe/Madrid');
begin
  for r in
    select ar.id, ar.family_id, ar.name, ar.message
    from public.automation_rules ar
    where ar.active
      and ar.trigger_type = 'hora_diaria'
      and ar.time_of_day is not null
      and (ar.muted_until is null or ar.muted_until <= now())
      and (v_local::date + ar.time_of_day) <= v_local
      and v_local < (v_local::date + ar.time_of_day) + interval '30 minutes'
  loop
    insert into public.automation_rule_daily_state (rule_id, last_fired_on)
    values (r.id, v_local::date)
    on conflict (rule_id) do update set last_fired_on = excluded.last_fired_on
    where public.automation_rule_daily_state.last_fired_on < excluded.last_fired_on;

    if found then
      perform private.send_family_push(r.family_id, null, r.name, r.message, '/');
    end if;
  end loop;
end;
$$;

revoke execute on function private.fire_daily_automations() from public, anon, authenticated;

select cron.schedule(
  'fire-daily-automations',
  '* * * * *',
  $$ select private.fire_daily_automations(); $$
);
