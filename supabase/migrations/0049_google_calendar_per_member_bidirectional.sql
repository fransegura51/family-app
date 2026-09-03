-- Rediseño: la conexión con Google es POR MIEMBRO, no por familia —
-- petición real: "eso lo ha puesto Paco en el calendario de Google de
-- Paco, cuando llegue a la app se ponga del color de Paco". Cada
-- miembro conecta SU PROPIA cuenta de Google; lo que apunte en SU
-- calendario principal de Google entra en la app como un evento normal
-- (calendar_events), asignado a ese miembro — así ya funciona con todo
-- lo que ya existe sin tocarlo: Pepa lo ve y lo dice, sale con el color
-- del miembro, se puede marcar "hecho" o borrar una ocurrencia igual
-- que cualquier otro evento. Las tablas de la migración 0047 estaban
-- vacías (la función todavía no tenía credenciales de nadie) así que se
-- pueden sustituir sin migrar datos.

drop table if exists calendar_event_google_sync;
drop table if exists google_calendar_credentials;

create table google_calendar_credentials (
  member_id uuid primary key references family_members(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  refresh_token text not null,
  google_calendar_id text, -- calendario secundario "Family App" (destino de lo que la app empuja)
  connected_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_sync_error text
);

alter table google_calendar_credentials enable row level security;
-- Sin políticas: nadie accede vía API directamente — get_google_calendar_status()
-- y disconnect_google_calendar() son las únicas puertas, y nunca devuelven el token.

-- Evento de la app -> su copia en el calendario "Family App" de CADA
-- miembro conectado (puede haber varios miembros conectados a la vez,
-- cada uno con su propia copia en su propia cuenta de Google).
create table calendar_event_google_sync (
  event_id uuid not null references calendar_events(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  google_event_id text not null,
  updated_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

alter table calendar_event_google_sync enable row level security;
create index idx_google_sync_member on calendar_event_google_sync(member_id);

-- Evento del calendario PRINCIPAL de Google de un miembro -> el evento
-- que se creó en calendar_events al importarlo.
create table google_calendar_imported_events (
  member_id uuid not null references family_members(id) on delete cascade,
  google_event_id text not null,
  event_id uuid not null references calendar_events(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (member_id, google_event_id)
);

alter table google_calendar_imported_events enable row level security;
create index idx_google_imported_event on google_calendar_imported_events(event_id);

-- Qué eventos vienen importados de Google y de quién — para que la
-- sincronización de salida no le devuelva a ESE MISMO miembro (en su
-- calendario "Family App") algo que ya tiene en su calendario
-- principal (evitaría verlo duplicado); a otros miembros conectados sí
-- se les sigue mandando, para que lo vean en el suyo.
alter table calendar_events add column google_source_member_id uuid references family_members(id) on delete set null;

-- Estado de conexión de MI PROPIA cuenta (la del que llama) — nunca el token.
create or replace function public.get_google_calendar_status()
returns table(connected boolean, last_synced_at timestamptz, last_sync_error text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_member_id uuid;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  select id into v_member_id from family_members where linked_profile_id = v_user_id;
  if v_member_id is null then
    return query select false, null::timestamptz, null::text;
    return;
  end if;

  return query
  select true, g.last_synced_at, g.last_sync_error
  from google_calendar_credentials g
  where g.member_id = v_member_id;

  if not found then
    return query select false, null::timestamptz, null::text;
  end if;
end;
$function$;

revoke all on function public.get_google_calendar_status() from public, anon;
grant execute on function public.get_google_calendar_status() to authenticated;

-- Desconectar MI PROPIA cuenta — cada uno gestiona la suya, no hace
-- falta ser admin (es su propio permiso de Google el que se retira).
create or replace function public.disconnect_google_calendar()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;
  delete from google_calendar_credentials
  where member_id = (select id from family_members where linked_profile_id = v_user_id);
end;
$function$;

revoke all on function public.disconnect_google_calendar() from public, anon;
grant execute on function public.disconnect_google_calendar() to authenticated;
