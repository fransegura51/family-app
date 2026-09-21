-- FASE 6A — LÍNEAS QUE NO SON PRODUCTOS (PARKING de Mercadona).
--
-- 1. is_non_product_line(tienda, texto): gemela SQL de classifyTicketLine (src/domain/ticketLines.ts). Regla única y verificada con datos
--    reales: cadena mercadona + texto normalizado 'parking'. NO es global: PARKING de otro comercio es un producto salvo evidencia.
-- 2. Trigger en product_prices como REFUERZO en la propia base de datos: si alguna vía (cliente, webhook, importador futuro) intentara
--    guardar una línea no-producto, la fila se descarta en silencio (no falla el ticket). La protección principal está antes, en cada
--    camino (recordProductPurchase y mercadona-ticket-webhook), y evita incluso crear el producto.
-- 3. non_product_line_archive: copia íntegra (product + precios) de lo que se limpia, para poder RESTAURAR el histórico.
-- 4. Limpieza del PARKING histórico (1 producto, 8 precios a 0,00 €): solo si las precondiciones se cumplen y el dinero antes/después es
--    idéntico; si algo no cuadra, la migración entera falla y no se toca nada.
--
-- NO toca shared_product_learning (PARKING no es una clase ni una ambigüedad: Mercadona + PARKING sigue dando not_found), ni receipts,
-- ni expenses, ni budgets, ni catálogo, ni clases, ni alias de cadenas.
-- ROLLBACK: supabase/rollbacks/0145_non_product_lines_down.sql (restaura las filas desde el archivo).

-- ─── 1. Decisión en SQL (gemela de TypeScript) ───
create or replace function public.is_non_product_line(p_store text, p_text text)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select c.status = 'resolved' and c.chain_key = 'mercadona' and public.product_text_key(p_text) = 'parking'
     from public.resolve_store_chain(p_store) c),
    false)
$$;

revoke all on function public.is_non_product_line(text, text) from public, anon;
grant execute on function public.is_non_product_line(text, text) to authenticated, service_role;

-- ─── 2. Refuerzo: una línea no-producto nunca llega a product_prices ───
create or replace function public.product_prices_skip_non_product()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_name text;
begin
  select p.display_name into v_name from public.products p where p.id = new.product_id;
  if public.is_non_product_line(new.store, v_name) then
    return null; -- se descarta la fila sin error
  end if;
  return new;
end;
$$;

create trigger product_prices_skip_non_product
  before insert on public.product_prices
  for each row execute function public.product_prices_skip_non_product();

-- ─── 3. Archivo reversible (no expuesto a los usuarios) ───
create table public.non_product_line_archive (
  id bigint generated always as identity primary key,
  archived_at timestamptz not null default now(),
  rule text not null,
  reason text not null,
  product jsonb not null,
  prices jsonb not null
);
comment on table public.non_product_line_archive is
  'Copia de las filas de products/product_prices retiradas por ser líneas que no son productos. Permite restaurarlas (ver rollback 0145).';
alter table public.non_product_line_archive enable row level security;
revoke all on public.non_product_line_archive from public, anon, authenticated;

-- ─── 4. Limpieza del histórico (con precondiciones y comprobación económica; si algo no cuadra, todo se revierte) ───
do $$
declare
  v_ids uuid[];
  v_n_prices integer;
  v_receipt_ids uuid[];
  v_products_before integer;
  v_prices_before integer;
  v_importe_before numeric;
  v_receipts_before numeric;
  v_expenses_before numeric;
  v_per_receipt_before jsonb;
  v_per_receipt_after jsonb;
begin
  -- Productos cuyas líneas de precio son TODAS líneas no-producto según la regla (y que tienen al menos una)
  select array_agg(p.id) into v_ids
  from public.products p
  where public.product_text_key(p.display_name) = 'parking'
    and exists (select 1 from public.product_prices pp where pp.product_id = p.id)
    and not exists (select 1 from public.product_prices pp where pp.product_id = p.id and not public.is_non_product_line(pp.store, p.display_name));

  if v_ids is null or cardinality(v_ids) <> 1 then
    raise exception 'limpieza PARKING: se esperaba exactamente 1 producto y hay %', coalesce(cardinality(v_ids), 0);
  end if;

  select count(*), array_agg(distinct pp.receipt_id) into v_n_prices, v_receipt_ids
  from public.product_prices pp where pp.product_id = any (v_ids);
  if v_n_prices <> 8 then
    raise exception 'limpieza PARKING: se esperaban 8 líneas de precio y hay %', v_n_prices;
  end if;
  -- todas a 0,00 €, cantidad 1, con ticket, y cada ticket tiene además otras líneas de producto
  if exists (select 1 from public.product_prices pp where pp.product_id = any (v_ids) and (pp.price <> 0 or coalesce(pp.quantity, '1') <> '1' or pp.receipt_id is null)) then
    raise exception 'limpieza PARKING: hay líneas con importe distinto de 0, cantidad distinta de 1 o sin ticket';
  end if;
  if exists (
    select 1 from unnest(v_receipt_ids) r(id)
    where not exists (select 1 from public.product_prices pp where pp.receipt_id = r.id and pp.product_id <> all (v_ids))
  ) then
    raise exception 'limpieza PARKING: algún ticket quedaría sin más líneas de producto';
  end if;

  -- Totales ANTES
  select count(*) into v_products_before from public.products;
  select count(*), coalesce(sum(price * coalesce(nullif(quantity, '')::numeric, 1)), 0) into v_prices_before, v_importe_before from public.product_prices;
  select coalesce(sum(total_amount), 0) into v_receipts_before from public.receipts;
  select coalesce(sum(amount), 0) into v_expenses_before from public.expenses;
  select jsonb_object_agg(r.id::text, r.importe) into v_per_receipt_before
  from (select pp.receipt_id id, round(sum(pp.price * coalesce(nullif(pp.quantity, '')::numeric, 1)), 2) importe
        from public.product_prices pp where pp.receipt_id = any (v_receipt_ids) group by pp.receipt_id) r;

  -- Archivo íntegro (producto + precios) para poder restaurar
  insert into public.non_product_line_archive (rule, reason, product, prices)
  select 'mercadona.parking',
         'Línea informativa del aparcamiento de Mercadona (siempre 1 ud. a 0,00 €): no es un producto.',
         to_jsonb(p),
         (select jsonb_agg(to_jsonb(pp) order by pp.recorded_date, pp.id) from public.product_prices pp where pp.product_id = p.id)
  from public.products p where p.id = any (v_ids);

  -- La única FK que apunta a products es product_prices (ON DELETE CASCADE): se van el producto y sus 8 precios
  delete from public.products where id = any (v_ids);

  -- Comprobación DESPUÉS: el dinero es exactamente el mismo
  select jsonb_object_agg(r.id::text, r.importe) into v_per_receipt_after
  from (select pp.receipt_id id, round(sum(pp.price * coalesce(nullif(pp.quantity, '')::numeric, 1)), 2) importe
        from public.product_prices pp where pp.receipt_id = any (v_receipt_ids) group by pp.receipt_id) r;

  if (select count(*) from public.products) <> v_products_before - 1
     or (select count(*) from public.product_prices) <> v_prices_before - 8
     or (select coalesce(sum(price * coalesce(nullif(quantity, '')::numeric, 1)), 0) from public.product_prices) <> v_importe_before
     or (select coalesce(sum(total_amount), 0) from public.receipts) <> v_receipts_before
     or (select coalesce(sum(amount), 0) from public.expenses) <> v_expenses_before
     or v_per_receipt_after is distinct from v_per_receipt_before
     or exists (select 1 from public.products where id = any (v_ids))
     or (select count(*) from public.non_product_line_archive) <> 1 then
    raise exception 'limpieza PARKING: el resultado no coincide con lo esperado (recuentos o importes distintos): se revierte todo';
  end if;
end $$;
