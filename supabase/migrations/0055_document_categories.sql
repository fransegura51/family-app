-- Categorías de Documentos como lista editable (antes fijas en el
-- código: Privada/Educación/Casa/Familia) — petición real: "poder
-- añadir más categorías, las que queramos". Carpetas vacías persisten
-- igual que shopping_stores (0041), para que una categoría recién
-- creada aparezca aunque no tenga ningún documento todavía.
create table document_categories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table document_categories enable row level security;

create policy "document_categories: family crud" on document_categories for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

create unique index idx_document_categories_family_name on document_categories(family_id, lower(name));

insert into document_categories (family_id, name)
select f.id, c.name
from families f
cross join (values ('Privada'), ('Educación'), ('Casa'), ('Familia')) as c(name)
on conflict do nothing;
