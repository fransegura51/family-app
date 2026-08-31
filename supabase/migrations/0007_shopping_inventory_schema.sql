-- Fase 3 (Skills 06/07/08/12): lista de la compra persistente, compras
-- programadas y control de inventario. La normalización de producto,
-- OCR de tickets e historial de precios (Skills 09-11) quedan para la
-- Fase 4 — aquí un item de la lista es todavía texto libre.

create table shopping_trips (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  scheduled_date date,
  store text,
  budget numeric(10,2),
  actual_amount numeric(10,2),
  status text not null default 'planificada' check (status in ('planificada', 'completada')),
  created_at timestamptz not null default now()
);

create table shopping_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  trip_id uuid references shopping_trips(id) on delete set null,
  name text not null,
  quantity text,
  unit text,
  priority text not null default 'normal' check (priority in ('alta', 'normal', 'baja')),
  status text not null default 'pendiente' check (status in ('pendiente', 'comprado', 'omitido', 'trasladado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  category text not null check (category in ('frigorifico', 'congelador', 'despensa', 'limpieza', 'higiene', 'bebe', 'otros')),
  quantity text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table shopping_trips enable row level security;
alter table shopping_items enable row level security;
alter table inventory_items enable row level security;

create policy "shopping_trips: family crud" on shopping_trips for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

create policy "shopping_items: family crud" on shopping_items for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

create policy "inventory_items: family crud" on inventory_items for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

create index idx_shopping_trips_family on shopping_trips(family_id);
create index idx_shopping_items_family on shopping_items(family_id);
create index idx_shopping_items_trip on shopping_items(trip_id);
create index idx_inventory_items_family on inventory_items(family_id);
