-- Avisos de llegada/salida: que lleguen SIEMPRE, con el nombre que se le ha puesto al lugar, y que se pueda comprobar qué pasó con cada uno.
--
-- Petición real: «el aviso de salió de casa, llegó al colegio, llegó al supermercado: esa parte hay que pulirla muy bien».
--
-- Lo que se encontró al revisar todo el recorrido (migración 0186 + función send-family-push):
--  1. El envío era «a ciegas»: la base de datos le pedía a la función del servidor el aviso con pg_net y no volvía a mirar si había llegado. Con un
--     tiempo agotado (DNS lento, función arrancando en frío: pg_net daba 5 s por defecto) el aviso se perdía sin dejar rastro y sin reintento.
--     → location_alert_outbox («buzón»): cada aviso se apunta ANTES de enviarse; un trabajo de pg_cron (cada minuto) comprueba la respuesta y
--       reenvía los que fallaron (hasta 4 intentos en 30 min). Queda además el historial de qué se avisó y cómo acabó (status_code, last_error).
--  2. El aviso decía el NOMBRE del lugar (muchas veces una dirección: «Av. Rafael Alberti, 30, 03369 Rafal…») y no el nombre que se le puso
--     en «categoría» («Cole Eric»). → se usa la categoría si existe.
--  3. Modo prueba (secreto «location_alert_test_mode» = on en el Vault): el aviso también le llega a quien se mueve (si no, quien prueba con su
--     móvil nunca ve su propio aviso, que es lo normal en producción: «quien se ha movido no necesita que le avisen de sí mismo»).
--  4. pg_net daba solo 5 s a la función del servidor; ahora 15 s.

-- ---------------------------------------------------------------------------------------------
-- Buzón de avisos. RLS activo SIN políticas: solo lo tocan las funciones SECURITY DEFINER de abajo.
-- ---------------------------------------------------------------------------------------------
create table public.location_alert_outbox (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  -- Quien se movió (para el historial) y a quién NO se avisa (null en modo prueba).
  member_id uuid,
  exclude_member_id uuid,
  title text not null,
  body text not null,
  url text not null default '/ubicacion',
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  request_id bigint,
  status_code integer,
  last_error text,
  delivered boolean not null default false
);

alter table public.location_alert_outbox enable row level security;
revoke all on public.location_alert_outbox from anon, authenticated;

create index idx_location_alert_outbox_pending on public.location_alert_outbox (created_at) where not delivered;
create index idx_location_alert_outbox_family on public.location_alert_outbox (family_id, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- Un intento de envío de un aviso del buzón.
-- ---------------------------------------------------------------------------------------------
create or replace function private.dispatch_location_alert(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.location_alert_outbox%rowtype;
  v_request bigint;
begin
  select * into a from public.location_alert_outbox where id = p_id;
  if not found or a.delivered then
    return;
  end if;

  v_request := net.http_post(
    url := 'https://objhgjgrinbhyzscjlbw.supabase.co/functions/v1/send-family-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select public.get_app_secret('cron_shared_secret'))
    ),
    body := jsonb_build_object(
      'family_id', a.family_id,
      'exclude_member_id', a.exclude_member_id,
      'title', a.title,
      'body', a.body,
      'url', a.url
    ),
    timeout_milliseconds := 15000
  );

  update public.location_alert_outbox
  set attempts = attempts + 1, last_attempt_at = now(), request_id = v_request
  where id = p_id;
end;
$$;

revoke execute on function private.dispatch_location_alert(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Misma firma de siempre (la llama evaluate_location_rules): ahora apunta el aviso en el buzón y lo envía.
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
declare
  v_id uuid;
  v_exclude uuid := p_exclude_member_id;
begin
  -- Modo prueba (ver la cabecera): también se avisa a quien se ha movido.
  if coalesce((select public.get_app_secret('location_alert_test_mode')), '') = 'on' then
    v_exclude := null;
  end if;

  insert into public.location_alert_outbox (family_id, member_id, exclude_member_id, title, body, url)
  values (p_family_id, p_exclude_member_id, v_exclude, p_title, p_body, coalesce(p_url, '/ubicacion'))
  returning id into v_id;

  perform private.dispatch_location_alert(v_id);
end;
$$;

revoke execute on function private.send_family_push(uuid, uuid, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Reintentos: cada minuto se mira la respuesta de los avisos aún no entregados de los últimos 30 minutos.
--  · respuesta 2xx → entregado.
--  · respuesta con error (o sin código: tiempo agotado) → se anota el motivo y se reenvía (hasta 4 intentos).
--  · sin respuesta tras 2 minutos → se reenvía.
-- Los avisos de más de 30 minutos ya no se reenvían (un «Paco ha llegado» de hace una hora no sirve); se conservan 3 días como historial.
-- ---------------------------------------------------------------------------------------------
create or replace function private.retry_location_alerts()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
  r record;
begin
  for a in
    select * from public.location_alert_outbox
    where not delivered
      and last_attempt_at is not null
      and created_at > now() - interval '30 minutes'
    order by created_at
    limit 50
  loop
    select h.status_code, h.error_msg into r from net._http_response h where h.id = a.request_id;
    if found then
      if r.status_code between 200 and 299 then
        update public.location_alert_outbox set delivered = true, status_code = r.status_code, last_error = null where id = a.id;
      else
        update public.location_alert_outbox
        set status_code = r.status_code, last_error = left(coalesce(r.error_msg, 'respuesta ' || coalesce(r.status_code::text, 'sin código')), 300)
        where id = a.id;
        if a.attempts < 4 then
          perform private.dispatch_location_alert(a.id);
        end if;
      end if;
    elsif a.last_attempt_at < now() - interval '2 minutes' and a.attempts < 4 then
      update public.location_alert_outbox set last_error = 'sin respuesta' where id = a.id;
      perform private.dispatch_location_alert(a.id);
    end if;
  end loop;

  delete from public.location_alert_outbox where created_at < now() - interval '3 days';
exception when others then
  raise warning 'retry_location_alerts: %', sqlerrm;
end;
$$;

revoke execute on function private.retry_location_alerts() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'retry-location-alerts') then
    perform cron.unschedule('retry-location-alerts');
  end if;
  perform cron.schedule('retry-location-alerts', '* * * * *', 'select private.retry_location_alerts()');
end $$;

-- ---------------------------------------------------------------------------------------------
-- evaluate_location_rules: igual que en 0186, salvo que {lugar} es el nombre que se le puso al lugar (categoría) si lo hay.
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
             coalesce(nullif(btrim(lp.category), ''), lp.name) as place_name,
             lp.latitude as place_lat, lp.longitude as place_lon, lp.radius_m
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
