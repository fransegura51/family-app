-- FASE 6B — LIMPIEZA DE CATEGORÍAS HISTÓRICAS DE FAMILIA HEPBURN: Gasolinera → Combustible, Taller retirada.
--
-- Es una limpieza de datos históricos de UNA familia; NO crea reglas de clasificación por comercio (Repsol != Combustible: el ticket de Repsol
-- es una bombona de butano). El catálogo base (Fase 1) no se toca: ya tiene «Combustible» y «Mantenimiento y reparaciones» y sigue sin
-- «Gasolinera» ni «Taller».
--
-- HACE (solo en Familia Hepburn, tras comprobar TODAS las precondiciones):
--   1. Los 2 gastos bancarios de la categoría personal «Gasolinera» (FOOTWORK-EL BADEN y E S THADER-MURCIA, 50 € cada uno) pasan a la
--      categoría estándar «Combustible». Solo cambia expenses.category (nada más del movimiento).
--   2. Se retira la categoría personal «Taller», que no tiene ninguna referencia.
-- NO HACE (a propósito, se reporta para decisión):
--   * No toca el ticket de Repsol (44 €, bombona de butano) que tiene la categoría de ticket «Gasolinera» pero cuyo gasto enlazado es
--     «Suministros»: pasarlo a Combustible sería Repsol → Combustible. Por eso la fila «Gasolinera» se CONSERVA hasta decidir ese ticket.
--   * No toca Familia Demo: sus categorías Gasolinera/Taller son copias heredadas de la plantilla y «Gasolinera» está en uso por 11 gastos
--     ficticios. Ni «1» ni «prueba» las tienen.
--
-- Reversible: cada fila cambiada o retirada se copia antes a category_migration_log; el rollback la restaura.
-- ROLLBACK: supabase/rollbacks/0146_retire_taller_migrate_gasolinera_down.sql

create table public.category_migration_log (
  id bigint generated always as identity primary key,
  phase text not null,
  entity text not null check (entity in ('expense', 'budget_category')),
  entity_id uuid not null,
  before jsonb not null,
  after jsonb,
  created_at timestamptz not null default now()
);
comment on table public.category_migration_log is
  'Copia de las filas cambiadas o retiradas por migraciones de categorías financieras (Fase 6B), para poder restaurarlas.';
alter table public.category_migration_log enable row level security;
revoke all on public.category_migration_log from public, anon, authenticated;

do $$
declare
  c_family constant uuid := '011429a4-4fd8-4341-9c04-ec6b2f585196';
  v_transporte uuid;
  v_gas public.budget_categories;
  v_taller public.budget_categories;
  v_comb public.budget_categories;
  v_mant public.budget_categories;
  v_gas_ids uuid[];
  v_b jsonb;
  v_exp_n integer;
  v_exp_sum numeric;
  v_exp_norcat_h text;
  v_exp_others_h text;
  v_rec_h text;
  v_budgets_h text;
  v_cats_others_h text;
  v_cats_without_taller_h text;
  v_activity integer;
  v_comb_n integer;
  v_comb_sum numeric;
begin
  if not exists (select 1 from public.families where id = c_family and name = 'Familia Hepburn') then
    raise exception '6B: no existe la familia esperada';
  end if;

  -- ── Categorías: una sola de cada, con las propiedades esperadas ──
  select id into v_transporte from public.budget_categories
    where family_id = c_family and name = 'Transporte y vehículo' and catalog_key = 'g.transporte_vehiculo' and parent_id is null and budget_group = 'generales';
  if v_transporte is null then raise exception '6B: falta la categoría estándar Transporte y vehículo'; end if;

  if (select count(*) from public.budget_categories where family_id = c_family and name = 'Gasolinera') <> 1
     or (select count(*) from public.budget_categories where family_id = c_family and name = 'Taller') <> 1
     or (select count(*) from public.budget_categories where family_id = c_family and name = 'Combustible') <> 1
     or (select count(*) from public.budget_categories where family_id = c_family and name = 'Mantenimiento y reparaciones') <> 1 then
    raise exception '6B: alguna de las categorías Gasolinera / Taller / Combustible / Mantenimiento y reparaciones no es única';
  end if;
  select * into v_gas from public.budget_categories where family_id = c_family and name = 'Gasolinera';
  select * into v_taller from public.budget_categories where family_id = c_family and name = 'Taller';
  select * into v_comb from public.budget_categories where family_id = c_family and name = 'Combustible';
  select * into v_mant from public.budget_categories where family_id = c_family and name = 'Mantenimiento y reparaciones';

  if v_gas.catalog_key is not null or v_gas.parent_id is distinct from v_transporte or v_gas.budget_group <> 'generales'
     or v_taller.catalog_key is not null or v_taller.parent_id is distinct from v_transporte or v_taller.budget_group <> 'generales' then
    raise exception '6B: Gasolinera / Taller no son las categorías personales históricas esperadas';
  end if;
  if v_comb.catalog_key is distinct from 'g.transporte_vehiculo.combustible' or v_comb.parent_id is distinct from v_transporte or v_comb.budget_group <> 'generales'
     or v_mant.catalog_key is distinct from 'g.transporte_vehiculo.mantenimiento_reparaciones' or v_mant.parent_id is distinct from v_transporte or v_mant.budget_group <> 'generales' then
    raise exception '6B: las categorías destino no son las estándar esperadas';
  end if;
  if (select count(*) from public.catalog_categories where key in ('g.transporte_vehiculo.combustible', 'g.transporte_vehiculo.mantenimiento_reparaciones') and status = 'approved') <> 2
     or exists (select 1 from public.catalog_categories where public.catalog_norm_name(name) in ('gasolinera', 'taller')) then
    raise exception '6B: el catálogo base no es el esperado (debe tener Combustible y Mantenimiento y reparaciones, y no Gasolinera ni Taller)';
  end if;
  if exists (select 1 from public.budget_categories where parent_id in (v_gas.id, v_taller.id)) then
    raise exception '6B: Gasolinera o Taller tienen subcategorías';
  end if;

  -- ── Referencias por texto: exactamente lo esperado, si no se aborta ──
  select array_agg(e.id order by e.expense_date) into v_gas_ids
  from public.expenses e where e.family_id = c_family and e.category = 'Gasolinera';
  if coalesce(cardinality(v_gas_ids), 0) <> 2
     or (select sum(amount) from public.expenses where id = any (v_gas_ids)) <> 100
     or exists (select 1 from public.expenses where id = any (v_gas_ids) and (store not in ('FOOTWORK-EL BADEN', 'E S THADER-MURCIA') or source <> 'banco' or is_income))
     or exists (select 1 from public.receipts where expense_id = any (v_gas_ids)) then
    raise exception '6B: los gastos de Gasolinera no son los 2 movimientos bancarios esperados (FOOTWORK-EL BADEN y E S THADER-MURCIA, 100 € en total)';
  end if;
  if (select count(*) from public.receipts where family_id = c_family and category = 'Gasolinera') <> 1
     or not exists (select 1 from public.receipts where family_id = c_family and category = 'Gasolinera' and store = 'Repsol') then
    raise exception '6B: el ticket con categoría Gasolinera no es el esperado (Repsol)';
  end if;
  if exists (select 1 from public.expenses where family_id = c_family and category = 'Taller')
     or exists (select 1 from public.receipts where family_id = c_family and category = 'Taller')
     or exists (select 1 from public.budgets where category in ('Gasolinera', 'Taller'))
     or exists (select 1 from public.event_budget_items where family_id = c_family and category in ('Gasolinera', 'Taller'))
     or exists (select 1 from public.contacts where family_id = c_family and category in ('Gasolinera', 'Taller'))
     or exists (select 1 from public.inventory_items where family_id = c_family and category in ('Gasolinera', 'Taller'))
     or exists (select 1 from public.member_documents where family_id = c_family and category in ('Gasolinera', 'Taller'))
     or exists (select 1 from public.event_menu_items where family_id = c_family and category in ('Gasolinera', 'Taller')) then
    raise exception '6B: hay referencias inesperadas a Gasolinera o Taller (Taller debe estar sin uso; ningún presupuesto debe usarlas)';
  end if;

  -- ── Totales ANTES ──
  select count(*), sum(amount) into v_exp_n, v_exp_sum from public.expenses;
  select md5(string_agg((to_jsonb(x) - 'category')::text, ',' order by (to_jsonb(x) - 'category')::text)) into v_exp_norcat_h from public.expenses x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_exp_others_h from public.expenses x where x.family_id <> c_family;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_rec_h from public.receipts x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_budgets_h from public.budgets x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_cats_others_h from public.budget_categories x where x.family_id <> c_family;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_cats_without_taller_h from public.budget_categories x where x.id <> v_taller.id;
  select count(*) into v_activity from public.activity_log;
  select count(*), coalesce(sum(amount), 0) into v_comb_n, v_comb_sum from public.expenses where family_id = c_family and category = 'Combustible';

  -- ── 1. Gasolinera → Combustible (solo la categoría de los 2 gastos; el registro de actividad se suspende dentro de esta transacción) ──
  insert into public.category_migration_log (phase, entity, entity_id, before, after)
  select '6B', 'expense', e.id, to_jsonb(e), to_jsonb(e) || jsonb_build_object('category', 'Combustible')
  from public.expenses e where e.id = any (v_gas_ids);

  alter table public.expenses disable trigger trg_log_expenses;
  update public.expenses set category = 'Combustible' where id = any (v_gas_ids);
  alter table public.expenses enable trigger trg_log_expenses;

  -- ── 2. Taller (sin uso) se retira ──
  insert into public.category_migration_log (phase, entity, entity_id, before, after)
  values ('6B', 'budget_category', v_taller.id, to_jsonb(v_taller), null);
  delete from public.budget_categories where id = v_taller.id;

  -- ── Comprobación DESPUÉS: si algo no cuadra, se revierte todo ──
  if (select count(*) from public.expenses) <> v_exp_n
     or (select sum(amount) from public.expenses) <> v_exp_sum
     or (select md5(string_agg((to_jsonb(x) - 'category')::text, ',' order by (to_jsonb(x) - 'category')::text)) from public.expenses x) is distinct from v_exp_norcat_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.expenses x where x.family_id <> c_family) is distinct from v_exp_others_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.receipts x) is distinct from v_rec_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.budgets x) is distinct from v_budgets_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.budget_categories x where x.family_id <> c_family) is distinct from v_cats_others_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.budget_categories x) is distinct from v_cats_without_taller_h
     or (select count(*) from public.activity_log) <> v_activity
     or (select count(*) from public.expenses where family_id = c_family and category = 'Combustible') <> v_comb_n + 2
     or (select sum(amount) from public.expenses where family_id = c_family and category = 'Combustible') <> v_comb_sum + 100
     or exists (select 1 from public.expenses where family_id = c_family and category = 'Gasolinera')
     or exists (select 1 from public.budget_categories where id = v_taller.id)
     or (select count(*) from public.budget_categories where family_id = c_family and name = 'Combustible') <> 1
     or (select count(*) from public.budget_categories where family_id = c_family and name = 'Mantenimiento y reparaciones') <> 1
     or (select count(*) from public.budget_categories where family_id = c_family and name = 'Gasolinera') <> 1
     or not exists (select 1 from public.receipts where family_id = c_family and category = 'Gasolinera' and store = 'Repsol') then
    raise exception '6B: el resultado no coincide con lo esperado (importes, recuentos o datos ajenos distintos): se revierte todo';
  end if;
end $$;
