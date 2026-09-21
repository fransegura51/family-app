-- FASE 6C — AMAZON, CATEGORÍA FINANCIERA Y FOOD/NON_FOOD (datos históricos de Familia Hepburn).
--
-- PRINCIPIO: la tienda NO es el tipo de producto. Amazon solo indica DÓNDE se compró; la CLASE dice QUÉ es y su `kind` (alimentación /
-- no alimentos) manda. Ninguna de las tres correcciones usa la tienda como criterio: se identifican por id y por evidencia.
--
--   1. Las 10 contradicciones: productos con clase CONFIRMADA por la familia cuya clase del catálogo es de «no alimentos» pero con
--      non_food = false. Criterio: class_confirmed_at NOT NULL + clase existente + kind = 'no_alimentos' + non_food = false (sin mirar la
--      tienda). Se comprueba que el conjunto es EXACTAMENTE el auditado; si no, aborta. → non_food = true (coherente con su clase).
--   2. Las 2 camisetas personalizadas de La Tostadora (pedido Amazon 402-9067482-7147522, comprado como regalo): decisión humana
--      explícita de Familia Hepburn → clase «Ropa y calzado» (other.ropa_calzado), confirmada, non_food = true. Que fueran un regalo
--      NO crea una clase de producto: eso es la categoría financiera del gasto (ya «Regalos y compras varias»).
--   3. El ticket 02c189b8… (categoría literal «Amazon») pasa a «Regalos y compras varias», la categoría de su gasto vinculado.
--      Por id y con precondiciones; NO existe ninguna regla Amazon → categoría.
--
-- NO toca: el café NESCAFÉ (sigue siendo alimentación), gastos, importes, precios, presupuestos, categorías financieras (Amazon se
-- conserva: el webhook aún la escribe), clases, catálogo, cadenas, aprendizaje compartido, Familia Demo ni otras familias.
-- Aborta si cualquier precondición o invariante no se cumple. Reversible: copia previa en food_kind_migration_log.
-- ROLLBACK: supabase/rollbacks/0148_amazon_food_kind_cleanup_down.sql

create table public.food_kind_migration_log (
  id bigint generated always as identity primary key,
  phase text not null,
  entity text not null check (entity in ('product', 'receipt')),
  entity_id uuid not null,
  before jsonb not null,
  after jsonb not null,
  created_at timestamptz not null default now()
);
comment on table public.food_kind_migration_log is
  'Copia de las filas cambiadas por la Fase 6C (non_food, clase confirmada de dos camisetas y categoría de un ticket), para poder restaurarlas.';
alter table public.food_kind_migration_log enable row level security;
revoke all on public.food_kind_migration_log from public, anon, authenticated;

do $$
declare
  c_family constant uuid := '011429a4-4fd8-4341-9c04-ec6b2f585196';
  c_receipt constant uuid := '02c189b8-35a0-4502-91e9-0947d68004ff';
  c_expense constant uuid := '7b671c5c-2c2f-4e93-a8f6-566ee3a12c12';
  c_cafe constant uuid := 'fe839dfd-29e5-4150-8e60-9d322df1c05b';
  c_shirt_a constant uuid := '816a749d-0a3a-4c27-b6df-2b5ebdddfeaa';
  c_shirt_b constant uuid := '48419037-bc7c-46bb-a1fa-90e74fb7bc3c';
  c_contradictions constant uuid[] := array[
    '014dd0c8-2468-4994-aaf9-36511a5faa7d', '2976a1e7-49a6-4daa-a9bd-017ed250d549', '46eddaf6-1aed-44e1-8daf-d8a52563a8f9',
    '55bc35ea-632d-40e1-b599-89fa48858d1c', '70b3eee7-3f77-429e-9e6a-c40944853870', '87a52372-20ea-4449-95e6-37ae798f6da3',
    '8e7e99ce-69a5-4403-ad61-5e4dd6ea26ac', '936cccb8-268b-4d0a-b85a-438bdd2c1da7', 'b9dbf94d-4bd3-4329-8fe4-6dcd0dc92a49',
    'f44120ff-3e37-4ff0-a221-d1809cd95cd8'];
  v_found uuid[];
  v_ropa public.family_food_types;
  v_receipt public.receipts;
  v_cafe_h text;
  v_exp_h text;
  v_prices_h text;
  v_budgets_h text;
  v_bcats_h text;
  v_types_h text;
  v_shared_h text;
  v_chains_h text;
  v_aliases_h text;
  v_families_h text;
  v_prod_rest_h text;
  v_rec_rest_h text;
  v_prod_others_h text;
  v_nonfood_n integer;
  v_confirmed_n integer;
  v_rec_sum numeric;
  v_exp_sum numeric;
  v_prices_sum numeric;
begin
  if not exists (select 1 from public.families where id = c_family and name = 'Familia Hepburn') then
    raise exception '6C: no existe la familia esperada';
  end if;

  -- ── El café: caso de control (alimentación confirmada, no puede entrar en ningún cambio) ──
  if not exists (
    select 1 from public.products p join public.family_food_types ft on ft.family_id = p.family_id and ft.name = p.category
    where p.id = c_cafe and p.family_id = c_family and p.category = 'Bebidas no alcohólicas' and p.class_confirmed_at is not null
      and p.non_food = false and ft.kind = 'alimentacion' and ft.catalog_key = 'food.bebidas_no_alcoholicas'
  ) or not exists (select 1 from public.product_prices where product_id = c_cafe and store = 'Amazon') then
    raise exception '6C: el café NESCAFÉ no está como se auditó (Amazon, Bebidas no alcohólicas confirmada, alimentación, non_food = false)';
  end if;

  -- ── 1. Las contradicciones: el conjunto por evidencia (clase confirmada + kind no_alimentos + non_food false) debe ser el auditado ──
  select array_agg(p.id order by p.id) into v_found
  from public.products p join public.family_food_types ft on ft.family_id = p.family_id and ft.name = p.category
  where p.class_confirmed_at is not null and ft.kind = 'no_alimentos' and p.non_food = false;
  if v_found is distinct from (select array_agg(x order by x) from unnest(c_contradictions) x) then
    raise exception '6C: el conjunto de contradicciones no coincide con la auditoría (10 productos de Familia Hepburn)';
  end if;
  if (select count(*) from public.products where id = any (c_contradictions) and family_id = c_family) <> 10 then
    raise exception '6C: las contradicciones no son todas de Familia Hepburn';
  end if;

  -- ── 2. Las dos camisetas: mismo pedido, mismo ticket, importes que suman el total; y la clase existe ──
  select * into v_ropa from public.family_food_types
    where family_id = c_family and catalog_key = 'other.ropa_calzado' and kind = 'no_alimentos' and name = 'Ropa y calzado';
  if v_ropa.id is null or (select count(*) from public.family_food_types where family_id = c_family and catalog_key = 'other.ropa_calzado') <> 1 then
    raise exception '6C: falta (o no es única) la clase «Ropa y calzado» (other.ropa_calzado)';
  end if;
  select * into v_receipt from public.receipts where id = c_receipt and family_id = c_family;
  if v_receipt.id is null or v_receipt.category is distinct from 'Amazon' or v_receipt.store is distinct from 'Amazon'
     or v_receipt.total_amount <> 49.98 or v_receipt.expense_id is distinct from c_expense
     or v_receipt.notes is distinct from 'Pedido 402-9067482-7147522' then
    raise exception '6C: el ticket no es el esperado (Amazon, pedido 402-9067482-7147522, 49,98 €, categoría Amazon, con su gasto vinculado)';
  end if;
  if (select count(*) from public.product_prices where receipt_id = c_receipt) <> 2
     or (select sum(price * quantity::numeric) from public.product_prices where receipt_id = c_receipt) <> 49.98
     or exists (select 1 from public.product_prices where receipt_id = c_receipt and (price <> 24.99 or store is distinct from 'Amazon' or product_id not in (c_shirt_a, c_shirt_b))) then
    raise exception '6C: las líneas del ticket no son las dos camisetas conocidas (2 × 24,99 € en Amazon)';
  end if;
  if (select count(*) from public.products where id in (c_shirt_a, c_shirt_b) and family_id = c_family
        and nullif(btrim(category), '') is null and class_confirmed_at is null and non_food = false
        and (normalized_name = 'pendiente' or normalized_name like 'latostadora camiseta oversize personalizada%')) <> 2
     or (select count(*) from public.products where id in (c_shirt_a, c_shirt_b) and normalized_name = 'pendiente') <> 1 then
    raise exception '6C: los dos productos de las camisetas no están como se auditó (sin clase, sin confirmar, non_food = false)';
  end if;
  if not exists (select 1 from public.expenses where id = c_expense and family_id = c_family and category = 'Regalos y compras varias'
                 and amount = 49.98 and product_classification = 'Ropa y calzado') then
    raise exception '6C: el gasto vinculado no está en «Regalos y compras varias» por 49,98 € con clase «Ropa y calzado»';
  end if;
  if (select count(*) from public.budget_categories where family_id = c_family and name = 'Regalos y compras varias'
        and catalog_key = 'g.compras_familia.regalos_compras_varias') <> 1 then
    raise exception '6C: «Regalos y compras varias» no es una categoría estándar única';
  end if;
  if (select count(*) from public.receipts where family_id = c_family and category = 'Amazon') <> 1
     or exists (select 1 from public.expenses where family_id = c_family and category = 'Amazon') then
    raise exception '6C: la categoría Amazon tiene más referencias que el ticket esperado';
  end if;

  -- ── Huellas y totales ANTES ──
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_cafe_h from public.products x where x.id = c_cafe;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_exp_h from public.expenses x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_prices_h from public.product_prices x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_budgets_h from public.budgets x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_bcats_h from public.budget_categories x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_types_h from public.family_food_types x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_shared_h from public.shared_product_learning x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_chains_h from public.store_chains x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_aliases_h from public.store_chain_aliases x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_families_h from public.families x;
  select md5(string_agg((to_jsonb(x) - 'non_food' - 'category' - 'class_confirmed_at')::text, ',' order by (to_jsonb(x) - 'non_food' - 'category' - 'class_confirmed_at')::text))
    into v_prod_rest_h from public.products x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_prod_others_h
    from public.products x where x.id <> all (c_contradictions || array[c_shirt_a, c_shirt_b]);
  select md5(string_agg((to_jsonb(x) - 'category')::text, ',' order by (to_jsonb(x) - 'category')::text)) into v_rec_rest_h from public.receipts x;
  select count(*) into v_nonfood_n from public.products where non_food;
  select count(*) into v_confirmed_n from public.products where class_confirmed_at is not null;
  select sum(total_amount) into v_rec_sum from public.receipts;
  select sum(amount) into v_exp_sum from public.expenses;
  select sum(price) into v_prices_sum from public.product_prices;

  -- ── Copia previa (reversibilidad) y cambios ──
  insert into public.food_kind_migration_log (phase, entity, entity_id, before, after)
  select '6C', 'product', p.id, to_jsonb(p), to_jsonb(p) || jsonb_build_object('non_food', true)
  from public.products p where p.id = any (c_contradictions);
  update public.products set non_food = true where id = any (c_contradictions);

  insert into public.food_kind_migration_log (phase, entity, entity_id, before, after)
  select '6C', 'product', p.id, to_jsonb(p),
         to_jsonb(p) || jsonb_build_object('category', v_ropa.name, 'class_confirmed_at', now(), 'non_food', true)
  from public.products p where p.id in (c_shirt_a, c_shirt_b);
  update public.products set category = 'Ropa y calzado', class_confirmed_at = now(), non_food = true where id in (c_shirt_a, c_shirt_b);

  insert into public.food_kind_migration_log (phase, entity, entity_id, before, after)
  values ('6C', 'receipt', c_receipt, to_jsonb(v_receipt), to_jsonb(v_receipt) || jsonb_build_object('category', 'Regalos y compras varias'));
  update public.receipts set category = 'Regalos y compras varias' where id = c_receipt;

  -- ── Comprobación DESPUÉS: si algo no cuadra, se revierte todo ──
  if (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.products x where x.id = c_cafe) is distinct from v_cafe_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.expenses x) is distinct from v_exp_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.product_prices x) is distinct from v_prices_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.budgets x) is distinct from v_budgets_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.budget_categories x) is distinct from v_bcats_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.family_food_types x) is distinct from v_types_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.shared_product_learning x) is distinct from v_shared_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.store_chains x) is distinct from v_chains_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.store_chain_aliases x) is distinct from v_aliases_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.families x) is distinct from v_families_h
     or (select md5(string_agg((to_jsonb(x) - 'non_food' - 'category' - 'class_confirmed_at')::text, ',' order by (to_jsonb(x) - 'non_food' - 'category' - 'class_confirmed_at')::text)) from public.products x) is distinct from v_prod_rest_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.products x where x.id <> all (c_contradictions || array[c_shirt_a, c_shirt_b])) is distinct from v_prod_others_h
     or (select md5(string_agg((to_jsonb(x) - 'category')::text, ',' order by (to_jsonb(x) - 'category')::text)) from public.receipts x) is distinct from v_rec_rest_h
     or (select count(*) from public.products where non_food) <> v_nonfood_n + 12
     or (select count(*) from public.products where class_confirmed_at is not null) <> v_confirmed_n + 2
     or (select sum(total_amount) from public.receipts) <> v_rec_sum
     or (select sum(amount) from public.expenses) <> v_exp_sum
     or (select sum(price) from public.product_prices) <> v_prices_sum
     or (select category from public.receipts where id = c_receipt) is distinct from 'Regalos y compras varias'
     or exists (select 1 from public.receipts where family_id = c_family and category = 'Amazon')
     or (select count(*) from public.products p join public.family_food_types ft on ft.family_id = p.family_id and ft.name = p.category
         where p.class_confirmed_at is not null and ft.kind = 'no_alimentos' and p.non_food = false) <> 0
     or (select count(*) from public.products p join public.family_food_types ft on ft.family_id = p.family_id and ft.name = p.category
         where p.id in (c_shirt_a, c_shirt_b) and ft.kind = 'no_alimentos' and ft.catalog_key = 'other.ropa_calzado' and p.class_confirmed_at is not null and p.non_food) <> 2 then
    raise exception '6C: el resultado no coincide con lo esperado (importes, café o datos ajenos distintos): se revierte todo';
  end if;
end $$;
