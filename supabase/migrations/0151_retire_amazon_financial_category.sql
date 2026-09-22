-- FASE 6C.2D (cierre) — Amazon deja de ser una categoría FINANCIERA: se retira la categoría personal «Amazon» de Familia Hepburn.
--
-- Amazon es una tienda (products/product_prices.store, receipts/expenses.store), nunca una categoría financiera: desde esta fase el
-- webhook ya no la escribe (deja category = NULL, «Pendiente de clasificar», ver amazon-order-webhook/index.ts) y no queda ninguna
-- referencia real a esa categoría. Se retira ÚNICAMENTE la fila exacta de Familia Hepburn, por id, con todas las precondiciones
-- verificadas (familia, nombre, tienda estándar Otros como padre, personal — no del catálogo, sin hijas, 0 referencias en expenses,
-- receipts, budgets y event_budget_items). Aborta si algo no coincide. NO toca Familia Demo (mismo nombre, decisión propia y separada)
-- ni ninguna otra familia, ni el histórico ya cerrado en fases anteriores (café, camisetas, el ticket de «Regalos y compras varias»).
-- ROLLBACK: supabase/rollbacks/0151_retire_amazon_financial_category_down.sql (restaura la fila EXACTA: mismo id, sin generar uno nuevo).

create table public.amazon_category_retirement_log (
  id bigint generated always as identity primary key,
  family_id uuid not null,
  before jsonb not null,
  created_at timestamptz not null default now()
);
comment on table public.amazon_category_retirement_log is
  'Copia de la categoría financiera personal «Amazon» retirada de Familia Hepburn (Fase 6C.2D), para poder restaurarla exactamente.';
alter table public.amazon_category_retirement_log enable row level security;
revoke all on public.amazon_category_retirement_log from public, anon, authenticated;

do $$
declare
  c_family constant uuid := '011429a4-4fd8-4341-9c04-ec6b2f585196';
  c_id constant uuid := '01c117c1-c867-4180-b0ad-887de57a3501';
  v_row public.budget_categories;
  v_otros uuid;
begin
  if not exists (select 1 from public.families where id = c_family and name = 'Familia Hepburn') then
    raise exception '6C.2D: no existe la familia esperada';
  end if;

  select id into v_otros from public.budget_categories where family_id = c_family and name = 'Otros' and catalog_key = 'g.otros' and parent_id is null;
  if v_otros is null then raise exception '6C.2D: falta la categoría estándar «Otros» de Hepburn'; end if;

  select * into v_row from public.budget_categories where id = c_id;
  if v_row.id is null or v_row.family_id is distinct from c_family or v_row.name is distinct from 'Amazon'
     or v_row.parent_id is distinct from v_otros or v_row.catalog_key is not null or v_row.budget_group <> 'generales' then
    raise exception '6C.2D: la categoría Amazon de Hepburn no es exactamente la esperada (id, familia, nombre, padre Otros, personal)';
  end if;
  if (select count(*) from public.budget_categories where family_id = c_family and name = 'Amazon') <> 1 then
    raise exception '6C.2D: «Amazon» no es única en Hepburn';
  end if;
  if exists (select 1 from public.budget_categories where parent_id = c_id) then
    raise exception '6C.2D: la categoría Amazon tiene subcategorías';
  end if;
  if exists (select 1 from public.expenses where family_id = c_family and category = 'Amazon')
     or exists (select 1 from public.receipts where family_id = c_family and category = 'Amazon')
     or exists (select 1 from public.budgets where family_id = c_family and category = 'Amazon')
     or exists (select 1 from public.event_budget_items where family_id = c_family and category = 'Amazon') then
    raise exception '6C.2D: quedan referencias reales a la categoría Amazon en Hepburn';
  end if;

  insert into public.amazon_category_retirement_log (family_id, before) values (c_family, to_jsonb(v_row));
  delete from public.budget_categories where id = c_id;

  if exists (select 1 from public.budget_categories where family_id = c_family and name = 'Amazon')
     or (select count(*) from public.amazon_category_retirement_log where family_id = c_family) <> 1
     or not exists (select 1 from public.budget_categories where family_id = c_family and name = 'Otros' and catalog_key = 'g.otros')
     or not exists (select 1 from public.families where id = (select family_id from public.families where name = 'Familia Demo') and name = 'Familia Demo') then
    raise exception '6C.2D: el resultado no coincide con lo esperado: se revierte todo';
  end if;
  -- Familia Demo conserva su propia categoría «Amazon» intacta (decisión separada, no se toca).
  if not exists (select 1 from public.budget_categories where family_id = (select id from public.families where name = 'Familia Demo') and name = 'Amazon') then
    raise exception '6C.2D: Familia Demo no debía cambiar y ya no tiene su categoría Amazon: se revierte todo';
  end if;
end $$;
