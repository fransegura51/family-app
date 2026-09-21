-- FASE 5 — RESOLUTOR REAL DE CLASIFICACIÓN: base de datos.
--
-- 1. products.class_confirmed_at (nullable): distingue una decisión EXPLÍCITA de la familia de una clasificación automática antigua.
--      class_confirmed_at IS NOT NULL → products.category es una decisión explícita de esa familia (LA FAMILIA MANDA).
--      class_confirmed_at IS NULL     → products.category histórico NO tiene autoridad manual por sí mismo.
--    No hace falta un class_source: con esta sola columna la semántica es completa (manual = confirmada; todo lo demás se resuelve
--    dinámicamente) y un segundo campo podría contradecirla.
-- 2. Trigger: si la categoría queda vacía, la confirmación se borra (no puede haber "decisión explícita" sin clase). Así el botón
--    "Automático" (category = null) sigue funcionando también desde un cliente antiguo sin dar error.
-- 3. resolve_shared_product_classes: versión por lote de resolve_shared_product_class (Fase 4), para no hacer una llamada por producto.
-- 4. Backfill CONSERVADOR: se marca como confirmada SOLO la clasificación humana de la que hay evidencia (ver abajo). Lo dudoso
--    queda NULL (se resuelve dinámicamente). No se borra ni se modifica ninguna categoría.
--
-- ROLLBACK: supabase/rollbacks/0144_product_class_confirmed_down.sql

alter table public.products add column class_confirmed_at timestamptz null;

comment on column public.products.class_confirmed_at is
  'NOT NULL = products.category es una decisión explícita de la familia (manual). NULL = la clase se resuelve dinámicamente (compartida, reglas, respaldo). Nunca lo escribe una clasificación automática.';

create or replace function public.products_class_confirmed_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if nullif(btrim(new.category), '') is null then
    new.class_confirmed_at := null;
  end if;
  return new;
end;
$$;

create trigger products_class_confirmed_guard
  before insert or update of category, class_confirmed_at on public.products
  for each row execute function public.products_class_confirmed_guard();

-- ─── Resolución compartida por lote (máx. 500 pares por llamada). Solo recibe tienda + texto comercial ───
create or replace function public.resolve_shared_product_classes(p_items jsonb)
returns table (idx integer, status text, chain_key text, text_key text, food_type_key text, source text, reason text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'resolve_shared_product_classes: se esperaba un array de {store, text}';
  end if;
  if jsonb_array_length(p_items) > 500 then
    raise exception 'resolve_shared_product_classes: máximo 500 elementos por llamada';
  end if;
  return query
    select (t.ord - 1)::integer, r.status, r.chain_key, r.text_key, r.food_type_key, r.source, r.reason
    from jsonb_array_elements(p_items) with ordinality as t(item, ord)
    cross join lateral public.resolve_shared_product_class(t.item ->> 'store', t.item ->> 'text') r;
end;
$$;

revoke all on function public.resolve_shared_product_classes(jsonb) from public, anon;
grant execute on function public.resolve_shared_product_classes(jsonb) to authenticated, service_role;

-- ─── Backfill conservador de class_confirmed_at (solo Familia Hepburn: única familia real con decisiones humanas) ───
-- La marca de tiempo es la del backfill, no la de la decisión original (que no se conoce).
--   A. Inventario de la Fase 0 aprobado: el producto tiene una sola tienda, de una cadena aprendible, y su clase guardada es
--      exactamente la clase aprobada (revisada por la administración) para (cadena, texto).                           → 171
--   B. Fuera de ese inventario, clases de NO alimentación con al menos un precio: ningún proceso automático escribe jamás una clase
--      de no alimentación (no existe clasificador para ellas), así que solo puede ser una elección humana.            →  13
--   C. Refinamiento manual de bebida (café de Amazon: la guía automática diría «Bebidas», no «Bebidas no alcohólicas»). →   1
-- Quedan NULL por duda: PARKING (línea estructural, no es un producto), SUP.BEBIDA FRÍA (texto ambiguo) y VENTA (sin precios ni
-- origen). No se marca nada solo porque coincida con el clasificador por reglas.
with fam as (
  select id from public.families where id = '011429a4-4fd8-4341-9c04-ec6b2f585196'::uuid and name = 'Familia Hepburn'
),
prod as (
  select p.id, p.display_name, p.normalized_name, p.category,
         (select array_agg(distinct pp.store) from public.product_prices pp where pp.product_id = p.id) stores,
         (select count(*) from public.product_prices pp where pp.product_id = p.id) n_prices
  from public.products p
  where p.family_id = (select id from fam) and nullif(btrim(p.category), '') is not null
),
a as (
  select pr.id from prod pr
  join lateral (select * from public.resolve_store_chain(pr.stores[1])) c on cardinality(pr.stores) = 1
  join public.shared_product_learning l
    on l.chain_key = c.chain_key and l.text_key = public.product_text_key(pr.display_name) and l.status = 'approved'
  join public.family_food_types ft
    on ft.family_id = (select id from fam) and ft.catalog_key = l.food_type_key and ft.name = pr.category
  where c.status = 'resolved'
),
b as (
  select pr.id from prod pr
  join public.family_food_types ft on ft.family_id = (select id from fam) and ft.name = pr.category and ft.kind = 'no_alimentos'
  where pr.n_prices > 0 and pr.normalized_name <> 'parking' and pr.id not in (select id from a)
),
c as (
  select pr.id from prod pr
  where pr.display_name like 'NESCAF%Dolce Gusto%' and pr.category = 'Bebidas no alcohólicas'
    and pr.id not in (select id from a) and pr.id not in (select id from b)
),
evidence as (
  select id from a union select id from b union select id from c
)
update public.products p
set class_confirmed_at = now()
from evidence e
where p.id = e.id and p.class_confirmed_at is null;

-- Comprobación: si el backfill no es exactamente el aprobado, la migración entera falla.
do $$
declare
  v_confirmed integer;
  v_other_families integer;
  v_null_doubtful integer;
begin
  select count(*) into v_confirmed from public.products where class_confirmed_at is not null;
  select count(*) into v_other_families from public.products
    where class_confirmed_at is not null and family_id <> '011429a4-4fd8-4341-9c04-ec6b2f585196'::uuid;
  select count(*) into v_null_doubtful from public.products
    where family_id = '011429a4-4fd8-4341-9c04-ec6b2f585196'::uuid and class_confirmed_at is null
      and normalized_name in ('parking', 'sup.bebida fría', 'venta') and nullif(btrim(category), '') is not null;
  if v_confirmed <> 185 or v_other_families <> 0 or v_null_doubtful <> 3 then
    raise exception 'backfill class_confirmed_at incorrecto: confirmadas %, de otras familias %, dudosas en NULL %', v_confirmed, v_other_families, v_null_doubtful;
  end if;
end $$;
