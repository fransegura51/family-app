-- Skill de Pepa (documento maestro): base de datos para subcategorías,
-- etiquetas y origen del movimiento. Todo lo demás (donuts, "Ver X
-- registros", Debo/Necesito/Quiero, Resumen, Conclusiones...) se
-- calcula en el cliente a partir de esto, sin tocar más tablas.

-- Subcategorías: un segundo nivel dentro de budget_categories, en vez
-- de una tabla aparte — una categoría con parent_id es una
-- subcategoría de la que apunta parent_id (dos niveles, tal como pide
-- el documento: "Donut principal por categorías. Al seleccionar una
-- categoría, segundo donut con subcategorías").
alter table budget_categories add column parent_id uuid references budget_categories(id) on delete cascade;
create index idx_budget_categories_parent on budget_categories(parent_id);

-- Etiquetas: "¿Cómo quiero agrupar yo este gasto?", independientes de
-- categoría — el usuario las crea libremente (Eric, Vacaciones...).
create table tags (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  color text not null default '#4C6EF5',
  sort_order bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (family_id, name)
);

alter table tags enable row level security;

create policy "tags: family crud" on tags for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

-- Una etiqueta por movimiento en esta versión base (punto 12 del
-- documento) — así cada movimiento pertenece a un único grupo en la
-- estadística por etiquetas, sin repartos ambiguos.
alter table expenses add column tag_id uuid references tags(id) on delete set null;
create index idx_expenses_tag on expenses(tag_id);

-- Origen del movimiento: Manual / Ticket / Banco / Ticket + Banco
-- (punto 22) — de momento solo "manual" y "ticket" tienen datos reales
-- (el banco todavía no está conectado); se deja el campo listo para
-- cuando llegue, sin inventar datos de banco que no existen.
alter table expenses add column source text not null default 'manual'
  check (source in ('manual', 'ticket', 'banco', 'ticket_banco'));

-- Los gastos que ya vienen de un ticket (tienen receipt_id apuntando a
-- ellos via product_prices, o vinieron de uploadReceipt) se marcan como
-- tal retroactivamente, a partir de los recibos que ya existen.
update expenses e set source = 'ticket'
where exists (select 1 from receipts r where r.expense_id = e.id);
