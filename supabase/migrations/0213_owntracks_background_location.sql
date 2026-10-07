-- Ubicación con la app cerrada: puente con OwnTracks (app gratuita para iPhone/Android que SÍ lee el GPS en segundo plano).
--
-- Causa de fondo (comprobada con datos de producción): la web instalada de PEPA solo manda la posición mientras la app
-- está abierta en primer plano; con el móvil bloqueado no llega nada, así que los avisos de llegada/salida (que el
-- servidor calcula al guardarse una posición, migración 0186) salían horas tarde, cuando la persona volvía a abrir la
-- app. Una web no puede leer el GPS en segundo plano; una app nativa sí.
--
-- Esta migración deja que OwnTracks (HTTP mode: POST con usuario y contraseña) guarde la posición de UN miembro en la
-- misma tabla de siempre (member_locations). Así se reutiliza todo lo que ya existe: el disparador de reglas de
-- llegada/salida (trg_evaluate_location_rules), el mapa y el rastro del día.
--
-- Seguridad:
--   * Un código largo (244 bits) POR MIEMBRO. En la base solo se guarda su huella sha256, nunca el código; se enseña una
--     sola vez al generarlo. Regenerarlo invalida el anterior; se puede revocar.
--   * Solo lo genera quien es ese miembro o un admin de SU familia, y solo si el miembro tiene el consentimiento de
--     ubicación activado. El consentimiento se vuelve a comprobar en CADA posición recibida: si se desactiva, el
--     servidor deja de guardar aunque el móvil siga enviando.
--   * La función que guarda posiciones solo la puede ejecutar service_role (la Edge Function owntracks-ingest).
--   * Tabla con RLS activo y SIN políticas: nadie la lee ni escribe por la API normal, solo las funciones SECURITY
--     DEFINER de abajo, que filtran siempre por el miembro/familia concretos.
--   * Se descartan posiciones con mala precisión (> 150 m: el GPS de interior baila y daría llegadas/salidas falsas),
--     de fecha futura y las más antiguas que la ya guardada (un envío retrasado nunca pisa una posición más nueva).
--
-- No cambia: la web instalada sigue guardando su posición como antes; las reglas, el mapa y los permisos de las demás
-- tablas no se tocan.

create table public.member_location_tokens (
  member_id uuid primary key references public.family_members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.member_location_tokens enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Generar (o regenerar) el código de un miembro. Devuelve el código en claro UNA vez.
-- ---------------------------------------------------------------------------------------------
create or replace function public.create_member_location_token(p_member_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_family_id uuid := private.current_family_id();
  v_token text;
begin
  if v_family_id is null then
    raise exception 'No autenticado';
  end if;

  if not exists (select 1 from public.family_members fm where fm.id = p_member_id and fm.family_id = v_family_id) then
    raise exception 'Miembro no encontrado';
  end if;

  if not (coalesce(private.current_member_id() = p_member_id, false) or coalesce(private.current_role_in_family() = 'admin', false)) then
    raise exception 'No tienes permiso para esto';
  end if;

  if not exists (
    select 1 from public.location_sharing_consent c
    where c.member_id = p_member_id and c.family_id = v_family_id and c.enabled
  ) then
    raise exception 'Activa antes el consentimiento de ubicación de esta persona';
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.member_location_tokens (member_id, family_id, token_hash)
  values (p_member_id, v_family_id, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'))
  on conflict (member_id) do update
    set token_hash = excluded.token_hash, created_at = now(), last_used_at = null;

  return v_token;
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- Revocar el código de un miembro (el móvil deja de poder enviar al instante).
-- ---------------------------------------------------------------------------------------------
create or replace function public.revoke_member_location_token(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_family_id uuid := private.current_family_id();
begin
  if v_family_id is null then
    raise exception 'No autenticado';
  end if;

  if not (coalesce(private.current_member_id() = p_member_id, false) or coalesce(private.current_role_in_family() = 'admin', false)) then
    raise exception 'No tienes permiso para esto';
  end if;

  delete from public.member_location_tokens t where t.member_id = p_member_id and t.family_id = v_family_id;
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- Estado (sin el código): para enseñar «conectado, último dato hace X» en la pantalla. Solo de la propia familia.
-- ---------------------------------------------------------------------------------------------
create or replace function public.list_member_location_token_status()
returns table(member_id uuid, created_at timestamptz, last_used_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select t.member_id, t.created_at, t.last_used_at
  from public.member_location_tokens t
  where t.family_id = private.current_family_id()
$function$;

-- ---------------------------------------------------------------------------------------------
-- Guardar una posición recibida de OwnTracks. SOLO service_role (la Edge Function).
-- Devuelve un texto con el resultado ('ok' | 'unauthorized' | 'no_consent' | 'inaccurate' | 'invalid' | 'stale').
-- ---------------------------------------------------------------------------------------------
create or replace function public.ingest_member_location(
  p_member_id uuid,
  p_token text,
  p_lat double precision,
  p_lon double precision,
  p_tst timestamptz,
  p_acc double precision
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_family_id uuid;
  v_hash text;
  v_at timestamptz;
  v_last record;
begin
  select t.family_id, t.token_hash into v_family_id, v_hash
  from public.member_location_tokens t
  where t.member_id = p_member_id;

  if v_hash is null or p_token is null or v_hash <> encode(sha256(convert_to(p_token, 'UTF8')), 'hex') then
    return 'unauthorized';
  end if;

  if not exists (
    select 1 from public.location_sharing_consent c
    where c.member_id = p_member_id and c.family_id = v_family_id and c.enabled
  ) then
    return 'no_consent';
  end if;

  if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 then
    return 'invalid';
  end if;

  if p_acc is not null and p_acc > 150 then
    return 'inaccurate';
  end if;

  v_at := coalesce(p_tst, now());
  if v_at > now() + interval '5 minutes' then
    v_at := now();
  end if;

  insert into public.member_locations (member_id, family_id, latitude, longitude, recorded_at)
  values (p_member_id, v_family_id, p_lat, p_lon, v_at)
  on conflict (member_id) do update
    set latitude = excluded.latitude, longitude = excluded.longitude, recorded_at = excluded.recorded_at
    where public.member_locations.recorded_at < excluded.recorded_at;

  -- Si no se ha tocado la fila (posición más antigua que la guardada) no es un error del móvil, solo está desfasada.
  if not found then
    update public.member_location_tokens set last_used_at = now() where member_id = p_member_id;
    return 'stale';
  end if;

  -- Rastro del día: mismo criterio que la app (un punto nuevo solo si se ha movido >= 30 m o han pasado >= 5 min).
  select h.latitude, h.longitude, h.recorded_at into v_last
  from public.member_location_history h
  where h.member_id = p_member_id
  order by h.recorded_at desc
  limit 1;

  if v_last.recorded_at is null
     or v_at - v_last.recorded_at >= interval '5 minutes'
     or private.distance_m(v_last.latitude, v_last.longitude, p_lat, p_lon) >= 30 then
    insert into public.member_location_history (family_id, member_id, latitude, longitude, recorded_at)
    values (v_family_id, p_member_id, p_lat, p_lon, v_at);
  end if;

  update public.member_location_tokens set last_used_at = now() where member_id = p_member_id;
  return 'ok';
end;
$function$;

-- Permisos (las funciones nuevas nacen con los permisos por defecto de Supabase: se cierran explícitamente).
revoke all on function public.create_member_location_token(uuid) from public, anon, authenticated;
grant execute on function public.create_member_location_token(uuid) to authenticated;

revoke all on function public.revoke_member_location_token(uuid) from public, anon, authenticated;
grant execute on function public.revoke_member_location_token(uuid) to authenticated;

revoke all on function public.list_member_location_token_status() from public, anon, authenticated;
grant execute on function public.list_member_location_token_status() to authenticated;

revoke all on function public.ingest_member_location(uuid, text, double precision, double precision, timestamptz, double precision) from public, anon, authenticated;
grant execute on function public.ingest_member_location(uuid, text, double precision, double precision, timestamptz, double precision) to service_role;
