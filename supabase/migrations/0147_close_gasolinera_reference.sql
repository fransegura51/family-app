-- FASE 6B (cierre) — el ticket de la bombona pasa a Suministros y se retira la categoría personal Gasolinera de Familia Hepburn.
--
-- Decisión explícita de la administración: el ticket de 44 € es una bombona de butano y su gasto financiero vinculado ya está en
-- «Suministros». Se cambia ÚNICAMENTE la categoría de ESE ticket concreto (por su id), por su contenido conocido y por la categoría de su
-- gasto enlazado; NO por el comercio: no existe ninguna regla Repsol → Suministros ni Repsol → Combustible.
-- Después, sin referencias restantes, se retira «Gasolinera» de Hepburn.
--
-- NO toca: el producto Bombona, sus precios, importe, tienda, fecha, archivo, gasto vinculado, Familia Demo, catálogo, create_family,
-- la regla bancaria preexistente ni ninguna otra categoría. Aborta si cualquier precondición o invariante no se cumple.
-- ROLLBACK: supabase/rollbacks/0147_close_gasolinera_reference_down.sql (y el rollback completo de la 6B: 0146_..._down.sql).

alter table public.category_migration_log drop constraint category_migration_log_entity_check;
alter table public.category_migration_log
  add constraint category_migration_log_entity_check check (entity in ('expense', 'receipt', 'budget_category'));

do $$
declare
  c_family constant uuid := '011429a4-4fd8-4341-9c04-ec6b2f585196';
  c_receipt constant uuid := '889adc91-4b72-43fa-99ba-3225d2f6bb8a';
  c_expense constant uuid := '68b08ebb-2943-4cd2-82cf-350f65420a83';
  v_transporte uuid;
  v_gas public.budget_categories;
  v_sum public.budget_categories;
  v_receipt public.receipts;
  v_exp_h text;
  v_prod_h text;
  v_prices_h text;
  v_budgets_h text;
  v_rec_norcat_h text;
  v_cats_others_h text;
  v_cats_without_gas_h text;
  v_exp_others_h text;
  v_rec_n integer;
  v_rec_sum numeric;
  v_exp_n integer;
  v_exp_sum numeric;
  v_activity integer;
  v_sum_receipts integer;
begin
  if not exists (select 1 from public.families where id = c_family and name = 'Familia Hepburn') then
    raise exception '6B cierre: no existe la familia esperada';
  end if;

  -- ── Categorías ──
  select id into v_transporte from public.budget_categories
    where family_id = c_family and name = 'Transporte y vehículo' and catalog_key = 'g.transporte_vehiculo' and parent_id is null and budget_group = 'generales';
  if v_transporte is null then raise exception '6B cierre: falta la categoría estándar Transporte y vehículo'; end if;
  if (select count(*) from public.budget_categories where family_id = c_family and name = 'Gasolinera') <> 1
     or (select count(*) from public.budget_categories where family_id = c_family and name = 'Suministros') <> 1
     or (select count(*) from public.budget_categories where family_id = c_family and name = 'Combustible') <> 1 then
    raise exception '6B cierre: Gasolinera / Suministros / Combustible no son únicas';
  end if;
  select * into v_gas from public.budget_categories where family_id = c_family and name = 'Gasolinera';
  select * into v_sum from public.budget_categories where family_id = c_family and name = 'Suministros';
  if v_gas.catalog_key is not null or v_gas.parent_id is distinct from v_transporte or v_gas.budget_group <> 'generales' then
    raise exception '6B cierre: Gasolinera no es la categoría personal histórica esperada';
  end if;
  if v_sum.catalog_key is distinct from 'g.vivienda_hogar.suministros' or v_sum.budget_group <> 'generales' then
    raise exception '6B cierre: Suministros no es la categoría estándar esperada';
  end if;
  if exists (select 1 from public.budget_categories where parent_id = v_gas.id) then
    raise exception '6B cierre: Gasolinera tiene subcategorías';
  end if;

  -- ── El ticket concreto: contenido conocido y gasto vinculado en Suministros ──
  select * into v_receipt from public.receipts where id = c_receipt and family_id = c_family;
  if v_receipt.id is null or v_receipt.category is distinct from 'Gasolinera' or v_receipt.store is distinct from 'Repsol'
     or v_receipt.total_amount <> 44 or v_receipt.expense_id is distinct from c_expense then
    raise exception '6B cierre: el ticket no es el esperado (Repsol, 44 €, categoría Gasolinera, con su gasto vinculado)';
  end if;
  if not exists (select 1 from public.expenses where id = c_expense and family_id = c_family and category = 'Suministros' and amount = 44) then
    raise exception '6B cierre: el gasto vinculado del ticket no está en Suministros por 44 €';
  end if;
  if (select count(*) from public.product_prices where receipt_id = c_receipt) <> 1
     or not exists (select 1 from public.product_prices pp join public.products p on p.id = pp.product_id
                    where pp.receipt_id = c_receipt and p.display_name = 'Bombona' and pp.price = 44) then
    raise exception '6B cierre: el contenido del ticket no es la bombona conocida (1 línea, Bombona, 44 €)';
  end if;

  -- ── Nada más referencia Gasolinera: ese es el único ticket ──
  if (select count(*) from public.receipts where family_id = c_family and category = 'Gasolinera') <> 1
     or exists (select 1 from public.expenses where family_id = c_family and category = 'Gasolinera')
     or exists (select 1 from public.budgets where category = 'Gasolinera')
     or exists (select 1 from public.event_budget_items where family_id = c_family and category = 'Gasolinera')
     or exists (select 1 from public.contacts where family_id = c_family and category = 'Gasolinera')
     or exists (select 1 from public.inventory_items where family_id = c_family and category = 'Gasolinera')
     or exists (select 1 from public.member_documents where family_id = c_family and category = 'Gasolinera')
     or exists (select 1 from public.event_menu_items where family_id = c_family and category = 'Gasolinera') then
    raise exception '6B cierre: quedan referencias a Gasolinera distintas del ticket esperado';
  end if;

  -- ── Totales y huellas ANTES ──
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_exp_h from public.expenses x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_exp_others_h from public.expenses x where x.family_id <> c_family;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_prod_h from public.products x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_prices_h from public.product_prices x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_budgets_h from public.budgets x;
  select md5(string_agg((to_jsonb(x) - 'category')::text, ',' order by (to_jsonb(x) - 'category')::text)) into v_rec_norcat_h from public.receipts x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_cats_others_h from public.budget_categories x where x.family_id <> c_family;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_cats_without_gas_h from public.budget_categories x where x.id <> v_gas.id;
  select count(*), sum(total_amount) into v_rec_n, v_rec_sum from public.receipts;
  select count(*), sum(amount) into v_exp_n, v_exp_sum from public.expenses;
  select count(*) into v_activity from public.activity_log;
  select count(*) into v_sum_receipts from public.receipts where family_id = c_family and category = 'Suministros';

  -- ── 1. Solo la categoría de ESE ticket (por id) ──
  insert into public.category_migration_log (phase, entity, entity_id, before, after)
  values ('6B-cierre', 'receipt', c_receipt, to_jsonb(v_receipt), to_jsonb(v_receipt) || jsonb_build_object('category', 'Suministros'));
  update public.receipts set category = 'Suministros' where id = c_receipt;

  -- ── 2. Se retira la categoría personal Gasolinera (sin referencias) ──
  insert into public.category_migration_log (phase, entity, entity_id, before, after)
  values ('6B-cierre', 'budget_category', v_gas.id, to_jsonb(v_gas), null);
  delete from public.budget_categories where id = v_gas.id;

  -- ── Comprobación DESPUÉS: si algo no cuadra, se revierte todo ──
  if (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.expenses x) is distinct from v_exp_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.expenses x where x.family_id <> c_family) is distinct from v_exp_others_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.products x) is distinct from v_prod_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.product_prices x) is distinct from v_prices_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.budgets x) is distinct from v_budgets_h
     or (select md5(string_agg((to_jsonb(x) - 'category')::text, ',' order by (to_jsonb(x) - 'category')::text)) from public.receipts x) is distinct from v_rec_norcat_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.budget_categories x where x.family_id <> c_family) is distinct from v_cats_others_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.budget_categories x) is distinct from v_cats_without_gas_h
     or (select count(*) from public.receipts) <> v_rec_n
     or (select sum(total_amount) from public.receipts) <> v_rec_sum
     or (select count(*) from public.expenses) <> v_exp_n
     or (select sum(amount) from public.expenses) <> v_exp_sum
     or (select count(*) from public.activity_log) <> v_activity
     or (select category from public.receipts where id = c_receipt) is distinct from 'Suministros'
     or (select count(*) from public.receipts where family_id = c_family and category = 'Suministros') <> v_sum_receipts + 1
     or exists (select 1 from public.receipts where family_id = c_family and category = 'Gasolinera')
     or exists (select 1 from public.budget_categories where family_id = c_family and name in ('Gasolinera', 'Taller'))
     or (select count(*) from public.budget_categories where family_id = c_family and name in ('Combustible', 'Suministros', 'Mantenimiento y reparaciones')) <> 3 then
    raise exception '6B cierre: el resultado no coincide con lo esperado (importes o datos ajenos distintos): se revierte todo';
  end if;
end $$;
