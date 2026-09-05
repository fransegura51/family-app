-- Categorías de presupuesto con icono, en vez de escribir el nombre
-- suelto cada vez — petición real: "en la pestaña de presupuestos que
-- se puedan crear categorías, algo como lo de la foto" (captura de
-- referencia: Salario, Comestibles, Entretenimiento, Vivienda... cada
-- una con su icono). Mismo patrón que document_categories.
create table budget_categories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  icon text not null default '💰'
);

alter table budget_categories enable row level security;

create policy "budget_categories: family crud" on budget_categories for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());
