-- Sincronización de verdad, cada hora, del calendario de la app HACIA
-- Google Calendar (Android/iPhone) — a diferencia de la exportación por
-- URL (migración 0045), que Google/Apple solo miran cuando ELLOS
-- quieren. Con la API de Google Calendar (gratis, sin necesitar
-- facturación) y un permiso OAuth de escritura, es la propia app quien
-- empuja los cambios en el cron de cada hora, así que el "cada hora" sí
-- se puede cumplir de verdad. El refresh_token nunca se expone por API
-- — igual que el resto de secretos de esta app, solo lo lee el
-- service_role desde las Edge Functions.

create table google_calendar_credentials (
  family_id uuid primary key references families(id) on delete cascade,
  refresh_token text not null,
  google_calendar_id text,
  connected_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_sync_error text
);

alter table google_calendar_credentials enable row level security;
-- Sin políticas: nadie accede vía API directamente, ni siquiera el
-- propio admin — para eso está get_google_calendar_status() más abajo,
-- que solo devuelve si está conectado, nunca el token.

-- Qué evento de la app corresponde a qué evento YA CREADO en Google
-- Calendar — sin esto, cada sincronización horaria duplicaría todo en
-- vez de actualizar lo que ya existe.
create table calendar_event_google_sync (
  event_id uuid primary key references calendar_events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  google_event_id text not null,
  updated_at timestamptz not null default now()
);

alter table calendar_event_google_sync enable row level security;

create index idx_google_sync_family on calendar_event_google_sync(family_id);

-- Estado de conexión visible para el admin en la app — nunca el token.
create or replace function public.get_google_calendar_status()
returns table(connected boolean, last_synced_at timestamptz, last_sync_error text)
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

  return query
  select true, g.last_synced_at, g.last_sync_error
  from google_calendar_credentials g
  where g.family_id = v_family_id;

  if not found then
    return query select false, null::timestamptz, null::text;
  end if;
end;
$function$;

revoke all on function public.get_google_calendar_status() from public, anon;
grant execute on function public.get_google_calendar_status() to authenticated;

-- Desconectar: solo admin, borra el token — la próxima sincronización
-- horaria ya no encontrará credenciales para esa familia y no hará nada.
create or replace function public.disconnect_google_calendar()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_family_id uuid := private.current_family_id();
begin
  if v_family_id is null or private.current_role_in_family() <> 'admin' then
    raise exception 'Solo el administrador puede desconectar';
  end if;
  delete from google_calendar_credentials where family_id = v_family_id;
end;
$function$;

revoke all on function public.disconnect_google_calendar() from public, anon;
grant execute on function public.disconnect_google_calendar() to authenticated;
