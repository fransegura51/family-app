-- Clasificaciones de alimento (Verdura, Fruta, Carne...) editables por
-- familia, para el desplegable de cada producto en Historial de
-- precios y el dónut "por tipo de alimento" de Estadística compras —
-- petición real: "clasificación editable en un desplegable... botón
-- de engranaje con el cual se abre una ventana con las
-- clasificaciones... y un campo para crear nueva clase". Empieza
-- vacía por familia; la app la siembra con las 11 clases de fábrica
-- (domain/foodTypes.ts) la primera vez que se abre, igual que ya hace
-- con las categorías de Presupuesto Generales.
create table family_food_types (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  icon text not null default '🍽️',
  created_at timestamptz not null default now()
);

alter table family_food_types enable row level security;

create policy "family_food_types: family crud" on family_food_types for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

-- Evita duplicados por mayúsculas/tildes distintas de la misma clase
-- dentro de una familia.
create unique index idx_family_food_types_family_name on family_food_types(family_id, lower(name));
