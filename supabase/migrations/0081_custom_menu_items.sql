-- Petición real: "vamos a abrir una pantalla con las tres rayas...
-- añade todas las subcarpetas que te he puesto en la foto [captura del
-- menú de la app Wallet]... con la función de añadir más si queremos,
-- o eliminar alguna" — lista de accesos libre por familia, editable
-- (crear/renombrar/borrar) desde "Organizar menú", que se muestra
-- dentro del ☰ Menú que ya existe. De momento son solo accesos/
-- carpetas (sin pantalla real detrás todavía, se construyen una a una
-- más adelante cuando se pidan) — por eso no llevan a ninguna ruta,
-- solo nombre + icono.
create table custom_menu_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  label text not null,
  icon text not null default '📌',
  sort_order bigint not null default (extract(epoch from now()) * 1000)::bigint,
  created_at timestamptz not null default now()
);

alter table custom_menu_items enable row level security;

create policy "custom_menu_items: family crud" on custom_menu_items for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

create index idx_custom_menu_items_family on custom_menu_items(family_id);
