-- Rediseño del ticket: cada ticket lleva su propia categoría (para
-- poder reclasificar pedidos de Amazon que no son de Alimentación —
-- pañales, ropa...) y opcionalmente quién hizo la compra.
alter table receipts add column category text not null default 'Alimentación';
alter table receipts add column purchased_by_member_id uuid references family_members(id) on delete set null;

-- Los tickets que ya existían: si tienen un gasto real enlazado, su
-- categoría real ya estaba ahí (Alimentación para tickets normales,
-- Amazon para los pedidos de Amazon) — se copia para no perderla.
update receipts r set category = e.category from expenses e where r.expense_id = e.id;

create index idx_receipts_purchased_by on receipts(purchased_by_member_id);
