-- FASE 3 — CADENAS COMERCIALES (aditivo y aislado).
--
-- Infraestructura para reconocer de forma estable a qué CADENA comercial pertenece un ticket a partir del nombre de tienda /
-- origen que ya guardan receipts, product_prices, expenses (banco) y shopping_*. Ejemplo: "MERCADONA ALMORADI-ALMORADI" -> mercadona.
--
-- PRINCIPIO FUNDAMENTAL: una cadena NUNCA determina la categoría ni la clase de un producto (Repsol != Combustible, Mercadona !=
-- Alimentación, Amazon != Otros). La cadena solo da contexto para interpretar el texto comercial del ticket. Por eso estas tablas
-- no tienen ninguna columna de categoría o clase.
--
-- Reglas de resolución (resolve_store_chain):
--   * nombre normalizado (catalog_norm_name: sin tildes, minúsculas, signos como espacio) contra alias explícitos;
--   * alias 'exact' = el nombre normalizado ES el alias; 'word_prefix' = el nombre empieza por el alias como PALABRA(S) completas
--     (solo donde el banco añade la localidad: "mercadona callosa del seg almajal cami"); nunca subcadenas ("cofidis amazon" no es Amazon);
--   * si no hay alias, o los alias apuntan a más de una cadena, o hay caracteres fuera de latín: NO RESUELVE (nunca adivina).
--
-- No toca products, product_prices, receipts, expenses, budgets, familias, catálogo ni clasificaciones.
-- ROLLBACK: supabase/rollbacks/0142_store_chains_down.sql

-- ─── Cadenas ───
create table public.store_chains (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  name text not null check (length(btrim(name)) between 2 and 80),
  kind text not null check (kind in ('supermarket', 'marketplace', 'fuel_retail', 'local_shop')),
  -- true = sus tickets pueden alimentar (en fases posteriores) el aprendizaje compartido de clases de producto.
  learnable boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- una cadena retirada no participa en ningún aprendizaje
  constraint store_chains_inactive_not_learnable check (status = 'active' or not learnable)
);

comment on table public.store_chains is
  'Cadenas comerciales reconocibles. La clave (key) es estable e independiente del nombre visible. Una cadena NUNCA implica categoría ni clase de producto.';

create or replace function public.store_chains_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger store_chains_touch_updated_at
  before update on public.store_chains
  for each row execute function public.store_chains_touch_updated_at();

-- ─── Alias explícitos (variantes reales del nombre de tienda) ───
create table public.store_chain_aliases (
  id bigint generated always as identity primary key,
  chain_key text not null references public.store_chains (key) on update cascade on delete restrict,
  -- ya normalizado con catalog_norm_name (lo garantiza el check) y con al menos 4 caracteres
  alias_norm text not null check (alias_norm = public.catalog_norm_name(alias_norm) and length(alias_norm) >= 4),
  match_mode text not null check (match_mode in ('exact', 'word_prefix')),
  -- de dónde sale: valor real auditado que justifica el alias
  evidence text not null check (length(btrim(evidence)) > 0),
  created_at timestamptz not null default now(),
  -- un alias apunta a UNA sola cadena
  constraint store_chain_aliases_alias_uidx unique (alias_norm)
);

create index store_chain_aliases_chain_idx on public.store_chain_aliases (chain_key);

comment on table public.store_chain_aliases is
  'Variantes reales auditadas del nombre de tienda. exact = igualdad; word_prefix = empieza por palabras completas (sufijo de localidad del banco). Sin subcadenas.';

-- ─── Semilla inicial: solo valores presentes en los datos reales auditados ───
insert into public.store_chains (key, name, kind, learnable, notes) values
  ('mercadona', 'Mercadona', 'supermarket', true, null),
  ('hiperber', 'Hiperber', 'supermarket', true, null),
  ('charter', 'Charter', 'supermarket', true,
   'Supermercado del Grupo Consum, pero cadena PROPIA: su clave nunca se funde con consum.'),
  ('consum', 'Consum', 'supermarket', false,
   'Registrada por el banco (SUPERMERCADO CONSUM); sin tickets con productos en los datos, no participa en el aprendizaje.'),
  ('aldi', 'Aldi', 'supermarket', false, 'Sin tickets con productos en los datos: no participa en el aprendizaje.'),
  ('lidl', 'Lidl', 'supermarket', false, 'Solo aparece como tienda elegida en una lista: no participa en el aprendizaje.'),
  ('repsol', 'Repsol', 'fuel_retail', false,
   'Venta mixta (combustible y otros): NO implica Combustible; el único ticket real fue una bombona de butano.'),
  ('amazon', 'Amazon', 'marketplace', false, 'Mercado con productos de todo tipo: sin aprendizaje compartido.'),
  ('macro_asia', 'Macro Asia', 'local_shop', false, 'Tienda local: sin aprendizaje compartido.'),
  ('es_poligono_las_maromas', 'E.S. Polígono Las Maromas', 'fuel_retail', false,
   'Estación de servicio local: sin aprendizaje compartido por ahora.');

insert into public.store_chain_aliases (chain_key, alias_norm, match_mode, evidence) values
  ('mercadona', 'mercadona', 'word_prefix', 'tickets "Mercadona"; banco "MERCADONA ALMORADI-ALMORADI", "MERCADONA CALLOSA DEL SEG-ALMAJAL (CAMI"'),
  ('hiperber', 'hiperber', 'word_prefix', 'tickets "Hiperber"; banco "HIPERBER DISTRIBUCION Y L-RAFAL"'),
  ('charter', 'charter', 'exact', 'ticket "Charter"'),
  ('consum', 'supermercado consum', 'word_prefix', 'banco "SUPERMERCADO CONSUM RAFAL-RAFAL"'),
  ('aldi', 'aldi', 'word_prefix', 'lista "Aldi"; banco "ALDI CALLOSA-CALLOSA DE SE"'),
  ('lidl', 'lidl', 'exact', 'tienda "Lidl" de una lista'),
  ('repsol', 'repsol', 'exact', 'ticket "Repsol"'),
  ('amazon', 'amazon', 'exact', 'tickets "Amazon" y "Amazon " (espacio final)'),
  ('amazon', 'www amazon', 'word_prefix', 'banco "WWW.AMAZON-LUXEMBOURG", "WWW.AMAZON* 7V62L4X05-LUXEMBOURG"'),
  ('macro_asia', 'macro asia', 'exact', 'ticket "MACRO ASIA"'),
  ('macro_asia', 'makro asia', 'word_prefix', 'banco "MAKRO ASIA-ALMORADI"'),
  ('es_poligono_las_maromas', 'e s poligono las maromas', 'word_prefix',
   'ticket "E.S. POLIGONO LAS MAROMAS"; banco "E.S. POLIGONO LAS MAROMAS-ALMORADI"');

-- ─── Resolución: nombre de tienda -> cadena, o SIN RESOLVER ───
-- Devuelve siempre una fila. status = 'resolved' (chain_key y learnable rellenos) o 'unresolved' (reason: empty,
-- unsupported_characters, unknown, ambiguous).
create or replace function public.resolve_store_chain(p_store text)
returns table (status text, chain_key text, learnable boolean, reason text)
language plpgsql
stable
set search_path = public
as $$
declare
  v_norm text;
  v_keys text[];
begin
  if p_store is null or btrim(p_store) = '' then
    return query select 'unresolved'::text, null::text, null::boolean, 'empty'::text;
    return;
  end if;
  -- Solo texto latino (con signos generales): con otros alfabetos no se adivina nada.
  if p_store ~ '[^-ɏ -⁯]' then
    return query select 'unresolved'::text, null::text, null::boolean, 'unsupported_characters'::text;
    return;
  end if;
  v_norm := public.catalog_norm_name(p_store);
  if v_norm = '' then
    return query select 'unresolved'::text, null::text, null::boolean, 'empty'::text;
    return;
  end if;

  select array_agg(distinct c.key order by c.key) into v_keys
  from public.store_chain_aliases a
  join public.store_chains c on c.key = a.chain_key
  where c.status = 'active'
    and (a.alias_norm = v_norm
         or (a.match_mode = 'word_prefix' and left(v_norm, length(a.alias_norm) + 1) = a.alias_norm || ' '));

  if v_keys is null then
    return query select 'unresolved'::text, null::text, null::boolean, 'unknown'::text;
  elsif cardinality(v_keys) > 1 then
    return query select 'unresolved'::text, null::text, null::boolean, 'ambiguous'::text;
  else
    return query select 'resolved'::text, c.key, c.learnable, null::text from public.store_chains c where c.key = v_keys[1];
  end if;
end;
$$;

-- ─── Seguridad: los usuarios solo LEEN y resuelven; crear/cambiar cadenas y alias es de migraciones / service_role ───
alter table public.store_chains enable row level security;
alter table public.store_chain_aliases enable row level security;

create policy "store_chains: leer" on public.store_chains for select to authenticated using (true);
create policy "store_chain_aliases: leer" on public.store_chain_aliases for select to authenticated using (true);

revoke all on public.store_chains, public.store_chain_aliases from public, anon, authenticated;
grant select on public.store_chains, public.store_chain_aliases to authenticated;

revoke all on function public.resolve_store_chain(text) from public, anon;
grant execute on function public.resolve_store_chain(text) to authenticated, service_role;
