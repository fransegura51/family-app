-- Enlazar calendarios externos (Google Calendar, Outlook, Apple/iPhone,
-- Android...) vía su URL de iCal (.ics) — un formato estándar que todos
-- exportan igual, así que una sola integración vale para cualquier
-- proveedor. Se guardan aparte de calendar_events (no se mezclan con la
-- voz/recordatorios nativos) y se sincronizan bajo demanda desde una
-- función de servidor, porque el navegador no puede leer la mayoría de
-- estas URLs directamente (CORS).

create table external_calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid references family_members(id) on delete set null,
  name text not null,
  ics_url text not null,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now()
);

alter table external_calendar_feeds enable row level security;

create policy "external_calendar_feeds: family crud" on external_calendar_feeds for all
  using (family_id = private.current_family_id())
  with check (
    family_id = private.current_family_id()
    and (member_id is null or private.member_in_current_family(member_id))
  );

create table external_calendar_events (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references external_calendar_feeds(id) on delete cascade,
  uid text not null,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null default false,
  created_at timestamptz not null default now(),
  unique (feed_id, uid, start_at)
);

alter table external_calendar_events enable row level security;

-- La sincronización descarga el .ics vía una función de servidor (solo
-- para saltar CORS) pero lo PARSEA en el cliente, así que el propio
-- cliente autenticado necesita poder insertar/borrar estos eventos, no
-- solo leerlos.
create policy "external_calendar_events: family crud" on external_calendar_events for all
  using (exists (
    select 1 from external_calendar_feeds f
    where f.id = feed_id and f.family_id = private.current_family_id()
  ))
  with check (exists (
    select 1 from external_calendar_feeds f
    where f.id = feed_id and f.family_id = private.current_family_id()
  ));

create index idx_external_calendar_events_feed on external_calendar_events(feed_id);
create index idx_external_calendar_feeds_family on external_calendar_feeds(family_id);
