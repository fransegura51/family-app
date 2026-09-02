-- Tiendas conocidas de la familia, para que Pepa reconozca el nombre de
-- la tienda al apuntar en la compra por voz sin depender de heurísticas
-- (petición real: "créame una lista de supermercados que yo te voy a
-- decir, y que los reconozca"). Editable desde la app, no fija en el
-- código — otra familia con otras tiendas podría querer una lista
-- distinta ("si vendo la aplicación y otra persona tiene Carbo Bravo,
-- que pueda cambiarlo").
create table shopping_stores (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table shopping_stores enable row level security;

create policy "shopping_stores: family crud" on shopping_stores for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

-- Evita duplicados por mayúsculas/tildes distintas de la misma tienda
-- dentro de una familia (p. ej. "Mercadona" y "mercadona" a la vez).
create unique index idx_shopping_stores_family_name on shopping_stores(family_id, lower(name));

-- Siembra las tiendas que ya se han pedido para la familia actual, para
-- no tener que darlas de alta a mano una por una desde la app.
insert into shopping_stores (family_id, name)
select f.id, s.name
from families f
cross join (values ('Mercadona'), ('Aldi'), ('Líder'), ('Superdumbo'), ('Chino'), ('Hipervel')) as s(name)
on conflict do nothing;
