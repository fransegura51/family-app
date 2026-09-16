-- Módulo Eventos (PEPA Events) — Fase 0: cimientos.
-- Petición real: Skill completa subida por el usuario en
-- pepa-events-skill/ (SKILL.md + references/*.md), plan aprobado en
-- C:\Users\Usuario\.claude\plans\zany-wishing-brook.md. Esta migración
-- crea el esquema COMPLETO de una vez (todas las tablas satélite, no
-- solo las de la Fase 0 de UI) para no tener que rediseñarlo cuando
-- lleguen las fases siguientes — la Skill exige explícitamente poder
-- añadir tipos de evento nuevos sin rediseño de esquema.
--
-- Un evento es una fila en `events`; los campos muy específicos de un
-- tipo (pareja, padrinos, testigos, sorpresa, años que se cumplen...)
-- van en `details jsonb` en vez de columnas sueltas por tipo, así un
-- tipo de evento nuevo el día de mañana no toca el esquema. Los campos
-- que SÍ se comparten entre varios tipos y se filtran/consultan a
-- menudo (estado de fecha, las dos ubicaciones de Comunión/Bautizo/
-- Boda) son columnas reales.
--
-- RLS: mismo patrón que el resto de la app — family_id propio en cada
-- tabla (como shopping_items, no como el pivote calendar_event_members)
-- + private.has_section_access('eventos'), sección nueva que se añade
-- sola al sistema de allowedSections ya existente sin tocar ninguna
-- función (solo hace falta añadir el nav tab en el cliente).

create table events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  type text not null check (type in ('cumpleanos', 'comunion', 'bautizo', 'celebracion', 'boda', 'personalizado')),
  subtype text,
  title text not null,
  date_status text not null default 'pendiente' check (date_status in ('pendiente', 'provisional', 'confirmada')),
  event_date date,
  event_time time,
  venue_label text,
  venue_type text,
  -- Comunión/Bautizo/Boda: dos ubicaciones posibles (ceremonia +
  -- celebración) — el resto de tipos solo usan venue_label de arriba.
  ceremony_location_label text,
  ceremony_location_latitude double precision,
  ceremony_location_longitude double precision,
  ceremony_time time,
  celebration_location_label text,
  celebration_location_latitude double precision,
  celebration_location_longitude double precision,
  theme text,
  details jsonb not null default '{}'::jsonb,
  -- Qué módulos del motor común están activos para este evento
  -- (petición real: "modules can be hidden and reactivated").
  enabled_modules text[] not null default '{}',
  status text not null default 'planificacion' check (status in ('planificacion', 'archivado')),
  tag_id uuid references tags(id) on delete set null,
  calendar_event_id uuid references calendar_events(id) on delete set null,
  rsvp_deadline date,
  -- Modo de enlace RSVP abierto (Fase 4) — token de familia/evento,
  -- igual patrón que calendar_export_tokens.
  open_rsvp_token text unique,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_events_family on events(family_id);
create index idx_events_tag on events(tag_id);
create index idx_events_calendar_event on events(calendar_event_id);

alter table events enable row level security;
create policy "events: family crud" on events for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

-- Invitados (por persona o por grupo/familia) — petición real: "Guest
-- totals are computed from the guest list; do not ask the creator for
-- an approximate guest count at event creation."
create table event_guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  display_name text not null,
  adults_count int not null default 1,
  children_count int not null default 0,
  notes text,
  -- Solo relevante en comunión/bautizo/boda (dos ubicaciones posibles).
  invite_scope text check (invite_scope in ('ambas', 'solo_ceremonia', 'solo_celebracion')),
  rsvp_status text not null default 'pendiente' check (rsvp_status in ('pendiente', 'confirmado', 'no_asiste', 'no_seguro')),
  rsvp_adults_count int,
  rsvp_children_count int,
  rsvp_note text,
  -- Enlace personalizado de RSVP (Fase 2) — se genera bajo demanda, no
  -- al crear el invitado.
  rsvp_token text unique,
  rsvp_token_active boolean not null default true,
  rsvp_responded_at timestamptz,
  table_id uuid,
  sort_order bigint not null default 0,
  created_at timestamptz not null default now()
);

create index idx_event_guests_event on event_guests(event_id);
create index idx_event_guests_family on event_guests(family_id);
create index idx_event_guests_table on event_guests(table_id);

alter table event_guests enable row level security;
create policy "event_guests: family crud" on event_guests for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

-- Preparativos/checklist — plantillas por tipo generadas al crear el
-- evento, recalculadas si cambia la fecha (source distingue lo
-- generado de lo añadido a mano, para no pisar ediciones del usuario).
create table event_tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  due_date date,
  source text not null default 'manual' check (source in ('auto', 'manual')),
  sort_order bigint not null default 0,
  created_at timestamptz not null default now()
);

create index idx_event_tasks_event on event_tasks(event_id);
create index idx_event_tasks_family on event_tasks(family_id);

alter table event_tasks enable row level security;
create policy "event_tasks: family crud" on event_tasks for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

-- Presupuesto PLANEADO por categoría — nunca toca expenses; el gasto
-- real se calcula filtrando expenses por events.tag_id (petición real
-- de la Skill: "Do not duplicate PEPA Economy transactions").
create table event_budget_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  category text not null,
  planned_amount numeric(10, 2) not null default 0,
  sort_order bigint not null default 0,
  created_at timestamptz not null default now()
);

create index idx_event_budget_items_event on event_budget_items(event_id);
create index idx_event_budget_items_family on event_budget_items(family_id);

alter table event_budget_items enable row level security;
create policy "event_budget_items: family crud" on event_budget_items for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

-- Menú — petición real: "Menu comes BEFORE shopping." `transferred`
-- marca qué líneas ya se pasaron a shopping_items (Fase 1).
create table event_menu_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  category text,
  quantity_note text,
  transferred boolean not null default false,
  sort_order bigint not null default 0,
  created_at timestamptz not null default now()
);

create index idx_event_menu_items_event on event_menu_items(event_id);
create index idx_event_menu_items_family on event_menu_items(family_id);

alter table event_menu_items enable row level security;
create policy "event_menu_items: family crud" on event_menu_items for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

-- Proveedores — registro ligero interno, sin marketplace externo.
create table event_providers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  type text,
  contact_note text,
  notes text,
  created_at timestamptz not null default now()
);

create index idx_event_providers_event on event_providers(event_id);
create index idx_event_providers_family on event_providers(family_id);

alter table event_providers enable row level security;
create policy "event_providers: family crud" on event_providers for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

-- Pagos/fianzas — petición real: "Surface upcoming unpaid balances in
-- Pending now and PEPA conclusions."
create table event_payments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  provider_id uuid references event_providers(id) on delete set null,
  concept text not null,
  total_amount numeric(10, 2) not null default 0,
  deposit_paid numeric(10, 2) not null default 0,
  due_date date,
  status text not null default 'pendiente' check (status in ('pendiente', 'parcial', 'pagado')),
  notes text,
  created_at timestamptz not null default now()
);

create index idx_event_payments_event on event_payments(event_id);
create index idx_event_payments_family on event_payments(family_id);
create index idx_event_payments_provider on event_payments(provider_id);

alter table event_payments enable row level security;
create policy "event_payments: family crud" on event_payments for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

-- Decoración — opcional, PEPA propone, la familia elige todo/algo/nada.
create table event_decoration_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  note text,
  status text not null default 'idea' check (status in ('idea', 'elegido', 'comprado')),
  price_estimate numeric(10, 2),
  transferred_to_shopping boolean not null default false,
  sort_order bigint not null default 0,
  created_at timestamptz not null default now()
);

create index idx_event_decoration_items_event on event_decoration_items(event_id);
create index idx_event_decoration_items_family on event_decoration_items(family_id);

alter table event_decoration_items enable row level security;
create policy "event_decoration_items: family crud" on event_decoration_items for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

-- Actividades/juegos — contextual, sobre todo cumpleaños sin animación
-- incluida por el local.
create table event_activities (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  description text,
  age_range text,
  duration_minutes int,
  materials_note text,
  transferred_to_shopping boolean not null default false,
  sort_order bigint not null default 0,
  created_at timestamptz not null default now()
);

create index idx_event_activities_event on event_activities(event_id);
create index idx_event_activities_family on event_activities(family_id);

alter table event_activities enable row level security;
create policy "event_activities: family crud" on event_activities for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

-- Mesas — asignación simple, sin plano 3D avanzado (excluido a
-- propósito por la Skill).
create table event_tables (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  capacity int,
  sort_order bigint not null default 0,
  created_at timestamptz not null default now()
);

create index idx_event_tables_event on event_tables(event_id);
create index idx_event_tables_family on event_tables(family_id);

alter table event_tables enable row level security;
create policy "event_tables: family crud" on event_tables for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

alter table event_guests add constraint event_guests_table_id_fkey
  foreign key (table_id) references event_tables(id) on delete set null;

-- Detalles/recuerdos para los invitados (comunión/bautizo) — por tipo
-- de artículo, con proveedor y estado.
create table event_favor_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  item_type text not null,
  quantity_needed int,
  budget numeric(10, 2),
  supplier text,
  status text not null default 'pendiente' check (status in ('pendiente', 'encargado', 'listo')),
  delivery_note text,
  created_at timestamptz not null default now()
);

create index idx_event_favor_items_event on event_favor_items(event_id);
create index idx_event_favor_items_family on event_favor_items(family_id);

alter table event_favor_items enable row level security;
create policy "event_favor_items: family crud" on event_favor_items for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

-- Detalles para personas concretas (boda: padrinos/testigos/abuelos...)
-- — por destinatario, no por tipo de artículo, campos distintos de
-- event_favor_items a propósito.
create table event_special_details (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  recipient_name text not null,
  relationship text,
  detail text,
  budget numeric(10, 2),
  status text not null default 'pendiente' check (status in ('pendiente', 'comprado', 'preparado')),
  delivery_note text,
  notes text,
  created_at timestamptz not null default now()
);

create index idx_event_special_details_event on event_special_details(event_id);
create index idx_event_special_details_family on event_special_details(family_id);

alter table event_special_details enable row level security;
create policy "event_special_details: family crud" on event_special_details for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

-- Regalos recibidos — PRIVADO, opcional, nunca expuesto en la página
-- pública de RSVP.
create table event_gifts_received (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  guest_name text not null,
  gift_description text,
  cash_amount numeric(10, 2),
  note text,
  created_at timestamptz not null default now()
);

create index idx_event_gifts_received_event on event_gifts_received(event_id);
create index idx_event_gifts_received_family on event_gifts_received(family_id);

alter table event_gifts_received enable row level security;
create policy "event_gifts_received: family crud" on event_gifts_received for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

-- Plan cronológico del día.
create table event_day_plan_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  item_time time,
  title text not null,
  note text,
  sort_order bigint not null default 0,
  created_at timestamptz not null default now()
);

create index idx_event_day_plan_items_event on event_day_plan_items(event_id);
create index idx_event_day_plan_items_family on event_day_plan_items(family_id);

alter table event_day_plan_items enable row level security;
create policy "event_day_plan_items: family crud" on event_day_plan_items for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

-- Diseño de la invitación — una fila por evento; el invite_scope de
-- cada invitado no cambia el diseño, solo qué líneas de ubicación/hora
-- se muestran al compartir para ese invitado (Fase 2/3).
create table event_invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  template_key text,
  canvas_json jsonb not null default '{}'::jsonb,
  background_image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_event_invitations_family on event_invitations(family_id);

alter table event_invitations enable row level security;
create policy "event_invitations: family crud" on event_invitations for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

-- Compras: un artículo de la lista puede pertenecer a un evento, sin
-- tocar trip_id (que representa "ir físicamente a una tienda", un
-- concepto distinto — ver plan de Eventos).
alter table shopping_items add column event_id uuid references events(id) on delete set null;
create index idx_shopping_items_event on shopping_items(event_id);

-- Bucket privado para fotos del editor de invitaciones y del evento —
-- mismo patrón que member-photos/receipts/gallery: carpeta por
-- familia, acceso solo por URL firmada.
insert into storage.buckets (id, name, public) values ('event-photos', 'event-photos', false);

create policy "event-photos storage: family select" on storage.objects for select
  using (bucket_id = 'event-photos' and (storage.foldername(name))[1] = private.current_family_id()::text);

create policy "event-photos storage: family insert" on storage.objects for insert
  with check (bucket_id = 'event-photos' and (storage.foldername(name))[1] = private.current_family_id()::text);

create policy "event-photos storage: family delete" on storage.objects for delete
  using (bucket_id = 'event-photos' and (storage.foldername(name))[1] = private.current_family_id()::text);
