-- FASE 6C.2A — «PENDIENTE DE CLASIFICAR»: la base admite category = NULL (solo estructura; NINGÚN dato cambia).
--
-- Decisión de arquitectura aprobada: category IS NULL  →  la categoría financiera todavía es DESCONOCIDA («Pendiente de clasificar»).
--   * NO existe una categoría ficticia con ese nombre ni una columna classification_status: NULL es el único estado.
--   * Un gasto pendiente SIGUE SIENDO un gasto real (cuenta en totales); solo deja de atribuirse a una categoría concreta.
--   * '' (cadena vacía) es INVÁLIDO: nunca puede hacerse pasar por «pendiente» (CHECK).
--
-- Cambios:
--   expenses.category : NOT NULL           → nullable
--   receipts.category : NOT NULL DEFAULT 'Alimentación' → nullable, SIN default (un insert que omita la categoría ya no inventa «Alimentación»)
--   CHECK (category IS NULL OR btrim(category) <> '') en ambas tablas.
--
-- NO modifica ninguna fila existente. Esta subfase NO hace que ningún productor genere NULL (el banco, los webhooks y el cliente siguen
-- escribiendo exactamente las mismas categorías): solo prepara la base y los consumidores. Aborta si alguna precondición o invariante falla.
-- ROLLBACK: supabase/rollbacks/0149_category_nullable_pending_down.sql (aborta si ya existe algún NULL; nunca inventa una categoría).

do $$
declare
  v_exp_h text;
  v_rec_h text;
  v_prod_h text;
  v_prices_h text;
  v_budgets_h text;
  v_bcats_h text;
  v_types_h text;
  v_shared_h text;
  v_chains_h text;
  v_families_h text;
  v_exp_n bigint;
  v_rec_n bigint;
begin
  -- ── Precondiciones: esquema esperado ──
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'expenses' and column_name = 'category'
                 and data_type = 'text' and is_nullable = 'NO' and column_default is null) then
    raise exception '6C.2A: expenses.category no es text NOT NULL sin default (esquema inesperado)';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'receipts' and column_name = 'category'
                 and data_type = 'text' and is_nullable = 'NO' and column_default = '''Alimentación''::text') then
    raise exception '6C.2A: receipts.category no es text NOT NULL DEFAULT ''Alimentación'' (esquema inesperado)';
  end if;

  -- ── Precondiciones: 0 categorías vacías (el CHECK nuevo las rechazaría) y ninguna NULL todavía ──
  if exists (select 1 from public.expenses where btrim(category) = '') or exists (select 1 from public.receipts where btrim(category) = '') then
    raise exception '6C.2A: hay categorías vacías en expenses o receipts; se abortan los cambios';
  end if;

  -- ── Precondiciones: ningún objeto dependiente incompatible ──
  if exists (select 1 from pg_views where schemaname in ('public', 'private') and definition ~* '\m(expenses|receipts)\M') then
    raise exception '6C.2A: hay vistas que dependen de expenses/receipts';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and (qual ilike '%category%' or with_check ilike '%category%')) then
    raise exception '6C.2A: hay políticas RLS que usan category';
  end if;
  if exists (select 1 from pg_indexes where schemaname = 'public' and tablename in ('expenses', 'receipts') and indexdef ilike '%category%') then
    raise exception '6C.2A: hay índices sobre category';
  end if;
  if exists (select 1 from pg_constraint where conrelid in ('public.expenses'::regclass, 'public.receipts'::regclass) and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%category%') then
    raise exception '6C.2A: ya hay CHECKs sobre category';
  end if;
  if exists (select 1 from pg_proc p where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
             and pg_get_functiondef(p.oid) ~* '\m(expenses|receipts)\M' and pg_get_functiondef(p.oid) ilike '%category%') then
    raise exception '6C.2A: hay funciones SQL que usan category de expenses/receipts';
  end if;
  if exists (select 1 from information_schema.triggers where event_object_schema = 'public' and event_object_table in ('expenses', 'receipts')
             and action_statement ilike '%category%') then
    raise exception '6C.2A: hay triggers que usan category';
  end if;

  -- ── Huellas y recuentos ANTES ──
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)), count(*) into v_exp_h, v_exp_n from public.expenses x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)), count(*) into v_rec_h, v_rec_n from public.receipts x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_prod_h from public.products x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_prices_h from public.product_prices x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_budgets_h from public.budgets x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_bcats_h from public.budget_categories x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_types_h from public.family_food_types x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_shared_h from public.shared_product_learning x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_chains_h from public.store_chains x;
  select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) into v_families_h from public.families x;

  -- ── Cambios de estructura (ningún dato) ──
  alter table public.expenses alter column category drop not null;
  alter table public.receipts alter column category drop not null;
  alter table public.receipts alter column category drop default;
  alter table public.expenses add constraint expenses_category_not_blank check (category is null or btrim(category) <> '');
  alter table public.receipts add constraint receipts_category_not_blank check (category is null or btrim(category) <> '');

  comment on column public.expenses.category is
    'Categoría financiera del gasto. NULL = todavía desconocida («Pendiente de clasificar»): sigue siendo un gasto real y cuenta en los totales, pero no pertenece a ninguna categoría. Nunca ''''.';
  comment on column public.receipts.category is
    'Categoría financiera del ticket. NULL = todavía desconocida («Pendiente de clasificar»); el ticket sigue siendo válido. Sin default: una categoría solo existe si alguien (o una regla con evidencia) la asigna. Nunca ''''.';

  -- ── Comprobación DESPUÉS: si algo no cuadra, se revierte todo ──
  if (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.expenses x) is distinct from v_exp_h
     or (select count(*) from public.expenses) <> v_exp_n
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.receipts x) is distinct from v_rec_h
     or (select count(*) from public.receipts) <> v_rec_n
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.products x) is distinct from v_prod_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.product_prices x) is distinct from v_prices_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.budgets x) is distinct from v_budgets_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.budget_categories x) is distinct from v_bcats_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.family_food_types x) is distinct from v_types_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.shared_product_learning x) is distinct from v_shared_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.store_chains x) is distinct from v_chains_h
     or (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.families x) is distinct from v_families_h
     or exists (select 1 from public.expenses where category is null)
     or exists (select 1 from public.receipts where category is null)
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'expenses' and column_name = 'category' and is_nullable = 'YES' and column_default is null)
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'receipts' and column_name = 'category' and is_nullable = 'YES' and column_default is null) then
    raise exception '6C.2A: el resultado no coincide con lo esperado (datos distintos o esquema incorrecto): se revierte todo';
  end if;
end $$;
