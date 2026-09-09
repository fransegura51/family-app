-- Petición real: "que se me quede un historial de las recetas que he
-- buscado antes, es decir si pincho sobre título que me salgan todas
-- las que he buscado y conforme vaya escribiendo se me vaya
-- autocompletando" — historial por familia (no por persona) de los
-- títulos escritos en el buscador de recetas, para autocompletar el
-- campo Título con un <datalist> (mismo patrón que las sugerencias de
-- producto en Compras).
create table recipe_search_history (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  query text not null,
  searched_at timestamptz not null default now()
);

alter table recipe_search_history enable row level security;

create policy "recipe_search_history: family crud" on recipe_search_history for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

create index idx_recipe_search_history_family on recipe_search_history(family_id, searched_at desc);
