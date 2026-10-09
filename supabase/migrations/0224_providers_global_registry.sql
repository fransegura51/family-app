-- PEPA Eventos — prompt maestro, Parte A: registro GLOBAL de proveedores (toda la familia, sin depender
-- de entrar en un evento concreto) — petición real: "un proveedor descartado para una boda puede volver a
-- ser útil para un cumpleaños o una comunión".
--
-- Decisión explícita del usuario tras preguntarle (dos opciones posibles, eligió esta): tabla nueva +
-- vínculos, NUNCA tocar el significado de las FK que ya apuntan a event_providers
-- (event_payments/event_task_groups/event_task_group_resolutions/event_task_group_offers/
-- event_decision_providers .provider_id siguen significando EXACTAMENTE lo mismo que hoy). event_providers
-- gana una referencia NUEVA al proveedor global (global_provider_id) sin perder su propio id ni ninguna
-- de sus relaciones existentes.
--
-- providers_global: ficha por familia (nunca por evento) — mismos campos que ya tiene event_providers
-- (migración 0222) para no perder nada al migrar.
create table providers_global (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null check (char_length(name) <= 160),
  type text null,
  contact_person text null,
  phone text null,
  email text null,
  website text null,
  address text null,
  notes text null,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_providers_global_family on providers_global(family_id);

alter table providers_global enable row level security;
create policy "providers_global: family crud" on providers_global for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

-- event_provider_links: qué proveedores globales están vinculados a qué evento, y si están "de interés"
-- o "descartados" PARA ESE EVENTO EN CONCRETO — nunca afecta a otros eventos ni al registro global, y
-- "descartado" siempre se puede deshacer (nunca borra el vínculo).
create table event_provider_links (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  global_provider_id uuid not null references providers_global(id) on delete cascade,
  status text not null default 'interesado' check (status in ('interesado', 'descartado')),
  created_at timestamptz not null default now(),
  unique (event_id, global_provider_id)
);

create index idx_event_provider_links_event on event_provider_links(event_id);
create index idx_event_provider_links_provider on event_provider_links(global_provider_id);

alter table event_provider_links enable row level security;
create policy "event_provider_links: family crud" on event_provider_links for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('eventos')
    and exists (select 1 from events e where e.id = event_id and e.family_id = private.current_family_id())
    and exists (select 1 from providers_global p where p.id = global_provider_id and p.family_id = private.current_family_id())
  );

-- Puente NO DESTRUCTIVO (petición explícita: "añade una referencia nueva al proveedor global y conserva
-- la antigua hasta migrar y verificar todas las relaciones"). Las 5 FK que ya apuntan a event_providers
-- (ver auditoría) no se tocan.
alter table event_providers add column global_provider_id uuid null references providers_global(id) on delete set null;

-- Backfill SEGURO: una fila global NUEVA por cada event_providers ya existente (7 filas reales en
-- producción) — NUNCA se fusionan dos proveedores por coincidencia de nombre. Columna temporal
-- source_event_provider_id para emparejar 1:1 sin ambigüedad (algunos proveedores reales comparten
-- created_at exacto, por alta en lote) — se borra al final de este mismo bloque.
alter table providers_global add column source_event_provider_id uuid null;

insert into providers_global (family_id, name, type, contact_person, phone, email, website, address, notes, archived, created_at, source_event_provider_id)
select family_id, name, type, contact_person, phone, email, website, address, notes, archived, created_at, id
from event_providers;

update event_providers ep
set global_provider_id = pg.id
from providers_global pg
where pg.source_event_provider_id = ep.id;

alter table providers_global drop column source_event_provider_id;

-- Cada proveedor de evento ya existente aparece en ese evento como "interesado" por defecto (ninguno se
-- marca "descartado" solo porque la familia nunca haya tocado ese dato — eso hay que decirlo a mano).
insert into event_provider_links (event_id, family_id, global_provider_id, status, created_at)
select ep.event_id, ep.family_id, ep.global_provider_id, 'interesado', ep.created_at
from event_providers ep
where ep.global_provider_id is not null;
