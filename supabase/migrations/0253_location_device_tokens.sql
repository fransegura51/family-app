-- Ubicación con la app nativa CERRADA (petición real, 13/10/2026: «lo que queremos es que mande la ubicación cuando esté totalmente cerrada»).
--
-- Con la app deslizada, el WebView (y con él JavaScript y la sesión de Supabase) desaparece, pero el servicio nativo de ubicación de Android puede
-- seguir vivo. Ese servicio no tiene sesión de usuario, así que usa una LLAVE PROPIA DEL MÓVIL:
--   · es una cadena aleatoria de 64 caracteres (unos 244 bits) que solo sirve para UNA cosa: mandar la posición de UNA persona;
--   · en la base solo se guarda su huella (sha256), nunca la llave; se muestra una única vez al crearla;
--   · se revoca al desactivar «Compartir ubicación», al cerrar sesión y al crear otra nueva para la misma persona (un móvil nativo por persona).
-- Quien tenga esa llave no puede leer nada, ni escribir nada que no sea la ubicación de esa persona, y solo mientras ella tenga activado compartir.
--
-- report_device_location es la ÚNICA función que llama la app con la clave pública (anon): hace lo mismo que la app abierta (última posición en
-- member_locations + punto del rastro cada 5 min o 30 m) en UNA sola llamada, sin función de servidor intermedia.

create table public.location_device_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  member_id uuid not null references public.family_members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index location_device_tokens_member_idx on public.location_device_tokens (member_id) where revoked_at is null;

alter table public.location_device_tokens enable row level security;
revoke all on public.location_device_tokens from anon, authenticated;
-- Sin políticas: solo las funciones de abajo (SECURITY DEFINER) tocan esta tabla.

-- Crea la llave para la persona p_member_id (que tiene que ser la vinculada a la cuenta que llama: nadie puede pedir la llave de otro miembro de la
-- familia) y anula las anteriores de esa persona. Devuelve la llave: es la única vez que existe en claro.
create or replace function public.create_location_device_token(p_member_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_token text;
begin
  select fm.family_id into v_family
  from public.family_members fm
  where fm.id = p_member_id and fm.linked_profile_id = auth.uid();
  if v_family is null then
    raise exception 'no_member' using errcode = '42501';
  end if;

  update public.location_device_tokens set revoked_at = now() where member_id = p_member_id and revoked_at is null;
  -- Las llaves anuladas hace más de un día ya no hacen falta: no se acumulan.
  delete from public.location_device_tokens where member_id = p_member_id and revoked_at < now() - interval '1 day';

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.location_device_tokens (token_hash, member_id, family_id)
  values (encode(sha256(convert_to(v_token, 'utf8')), 'hex'), p_member_id, v_family);
  return v_token;
end;
$$;
revoke execute on function public.create_location_device_token(uuid) from public, anon;
grant execute on function public.create_location_device_token(uuid) to authenticated;

-- Anula las llaves de la persona de la cuenta que llama (al dejar de compartir o cerrar sesión).
create or replace function public.revoke_location_device_tokens()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.location_device_tokens t
  set revoked_at = now()
  where t.revoked_at is null
    and t.member_id in (select fm.id from public.family_members fm where fm.linked_profile_id = auth.uid());
$$;
revoke execute on function public.revoke_location_device_tokens() from public, anon;
grant execute on function public.revoke_location_device_tokens() to authenticated;

-- La app nativa cerrada manda aquí cada posición. Devuelve 'ok', 'off' (esa persona ya no comparte: la app debe pararse), 'revoked' (llave anulada o
-- desconocida: la app debe pararse) o 'invalid' (coordenadas imposibles). Siempre el mismo tipo de respuesta para llave mala: no dice si existió.
create or replace function public.report_device_location(
  p_token text,
  p_latitude double precision,
  p_longitude double precision,
  p_recorded_at timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tok public.location_device_tokens%rowtype;
  v_at timestamptz;
  v_last_live timestamptz;
  v_hist_lat double precision;
  v_hist_lng double precision;
  v_hist_at timestamptz;
  v_dist double precision;
begin
  if p_token is null or length(p_token) <> 64 then
    return 'revoked';
  end if;
  select * into v_tok
  from public.location_device_tokens t
  where t.token_hash = encode(sha256(convert_to(p_token, 'utf8')), 'hex') and t.revoked_at is null;
  if not found then
    return 'revoked';
  end if;

  if p_latitude is null or p_longitude is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    return 'invalid';
  end if;

  -- Solo mientras esa persona tenga activado «Compartir ubicación».
  if not exists (select 1 from public.location_sharing_consent c where c.member_id = v_tok.member_id and c.enabled) then
    return 'off';
  end if;

  -- La hora la pone el móvil, pero no se fía: solo se acepta si es de los últimos 10 minutos y no del futuro.
  v_at := coalesce(p_recorded_at, now());
  if v_at < now() - interval '10 minutes' or v_at > now() + interval '1 minute' then
    v_at := now();
  end if;

  -- Mismo suelo que la app abierta (10 s entre guardados): si ya hay una posición de hace menos de 8 s, esta se descarta.
  select l.recorded_at into v_last_live from public.member_locations l where l.member_id = v_tok.member_id;
  if v_last_live is not null and v_last_live > now() - interval '8 seconds' then
    return 'ok';
  end if;

  insert into public.member_locations as l (member_id, family_id, latitude, longitude, recorded_at)
  values (v_tok.member_id, v_tok.family_id, p_latitude, p_longitude, v_at)
  on conflict (member_id) do update
    set family_id = excluded.family_id, latitude = excluded.latitude, longitude = excluded.longitude, recorded_at = excluded.recorded_at;

  -- Punto del rastro: igual que la app abierta (services/locationSharing.ts, shouldRecordHistoryPoint): cada 5 min como mucho si está quieta, o al
  -- moverse 30 m o más (con 10 s de margen entre puntos).
  select h.latitude, h.longitude, h.recorded_at into v_hist_lat, v_hist_lng, v_hist_at
  from public.member_location_history h
  where h.member_id = v_tok.member_id
  order by h.recorded_at desc
  limit 1;
  if v_hist_at is null or v_at - v_hist_at >= interval '5 minutes' then
    insert into public.member_location_history (member_id, family_id, latitude, longitude, recorded_at)
    values (v_tok.member_id, v_tok.family_id, p_latitude, p_longitude, v_at);
  elsif v_at - v_hist_at >= interval '10 seconds' then
    v_dist := 2 * 6371000 * asin(sqrt(
      power(sin(radians(p_latitude - v_hist_lat) / 2), 2)
      + cos(radians(v_hist_lat)) * cos(radians(p_latitude)) * power(sin(radians(p_longitude - v_hist_lng) / 2), 2)
    ));
    if v_dist >= 30 then
      insert into public.member_location_history (member_id, family_id, latitude, longitude, recorded_at)
      values (v_tok.member_id, v_tok.family_id, p_latitude, p_longitude, v_at);
    end if;
  end if;

  update public.location_device_tokens t set last_used_at = now()
  where t.id = v_tok.id and (t.last_used_at is null or t.last_used_at < now() - interval '10 minutes');

  return 'ok';
end;
$$;
revoke execute on function public.report_device_location(text, double precision, double precision, timestamptz) from public;
grant execute on function public.report_device_location(text, double precision, double precision, timestamptz) to anon, authenticated;
