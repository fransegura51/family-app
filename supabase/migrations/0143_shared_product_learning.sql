-- FASE 4 — APRENDIZAJE COMPARTIDO PEPA (infraestructura + primera siembra aprobada; SIN conectar a la app).
--
-- Conocimiento compartido e independiente de las familias:  CADENA (store_chains) + TEXT_KEY  →  CLASE de producto (clave del catálogo).
-- NO es una plantilla de productos: no copia products, product_prices, receipts ni nada de ninguna familia, y no guarda ningún
-- dato personal (ni familia, usuario, precio, fecha, cantidad, ticket, movimiento bancario o localidad).
--
-- En esta fase el aprendizaje existe y se puede consultar/probar (resolve_shared_product_class), pero NADA de la app lo usa todavía:
-- ni products, ni tickets, ni la clasificación automática, ni la interfaz (Fase 5).
--
-- Reglas:
--   * identidad = UNIQUE (chain_key, text_key): una sola fila por clave, sin herencia entre cadenas (Charter != Consum);
--   * estados: approved (devuelve clase) | ambiguous (sabemos que es ambiguo: NUNCA devuelve clase) | retired (no devuelve) | pending;
--   * solo las cadenas learnable pueden tener aprendizaje aprobado; una cadena nunca determina la clase por sí sola;
--   * las tablas NO están expuestas a los usuarios: solo se consulta por la RPC segura; las escrituras son de migraciones / service_role.
--
-- ROLLBACK: supabase/rollbacks/0143_shared_product_learning_down.sql

-- ─── Normalización del texto comercial (gemela SQL de productTextKey en src/domain/productText.ts) ───
-- NFKC + NFD, sin marcas combinadas, minúsculas, todo lo que no sea letra o dígito pasa a un espacio, sin bordes.
create or replace function public.product_text_key(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select btrim(regexp_replace(
    lower(regexp_replace(normalize(normalize(p_text, nfkc), nfd), '[̀-ͯ]+', '', 'g')),
    '[^[:alnum:]]+', ' ', 'g'))
$$;

-- ─── Validación de privacidad del texto comercial (gemela SQL de checkCommercialText; sin IA) ───
-- Devuelve la lista de problemas (vacía = texto aceptable). No detecta nombres propios: por eso solo se siembra un conjunto revisado.
create or replace function public.check_commercial_text(p_text text)
returns text[]
language plpgsql
immutable
parallel safe
set search_path = public
as $$
declare
  v_issues text[] := '{}';
  v_key text;
  v_match text[];
begin
  if p_text is null or p_text ~ '^\s*$' then
    return array['empty'];
  end if;
  if p_text ~ '[\r\n]' then v_issues := array_append(v_issues, 'multiline'); end if;
  if length(p_text) > 60 then v_issues := array_append(v_issues, 'too_long'); end if;
  if p_text ~ '[[:alnum:]._%+-]+@[[:alnum:]-]+(\.[[:alnum:]-]+)+' then v_issues := array_append(v_issues, 'email'); end if;
  if p_text ~* '\y(https?://|www\.)\S+'
     or p_text ~* '\y[a-z0-9-]{2,}\.(com|es|net|org|eu|info|io|co|app|me|cat|shop|online|store)\y' then
    v_issues := array_append(v_issues, 'url');
  end if;
  if p_text ~* '\y[a-z]{2}\d{2}([ -]?[a-z0-9]{4}){3,}([ -]?[a-z0-9]{1,4})?\y' then v_issues := array_append(v_issues, 'iban'); end if;
  for v_match in select regexp_matches(p_text, '\d+(?:[ .-]\d+)*', 'g') loop
    if length(regexp_replace(v_match[1], '\D', '', 'g')) > 8 then
      v_issues := array_append(v_issues, 'long_number');
      exit;
    end if;
  end loop;
  v_key := public.product_text_key(p_text);
  if v_key !~ '[[:alpha:]]' then
    v_issues := array_append(v_issues, 'no_letters');
  elsif length(replace(v_key, ' ', '')) < 2 then
    v_issues := array_append(v_issues, 'too_short');
  end if;
  if coalesce(cardinality(string_to_array(v_key, ' ')), 0) > 8 then v_issues := array_append(v_issues, 'too_many_words'); end if;
  return v_issues;
end;
$$;

-- ─── Lotes / versiones de siembra (trazabilidad sin datos personales) ───
create table public.shared_learning_batches (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{2,39}$'),
  -- versión del catálogo (clases) contra la que se validó el lote
  catalog_version integer not null references public.catalog_release (version),
  process text not null check (length(btrim(process)) > 0),
  -- rol o proceso, nunca una persona: solo un identificador tipo slug
  approved_by text not null check (approved_by ~ '^[a-z][a-z0-9_]*$'),
  approved_at timestamptz not null,
  notes text,
  created_at timestamptz not null default now()
);

-- ─── Aprendizaje compartido ───
create table public.shared_product_learning (
  id uuid primary key default gen_random_uuid(),
  chain_key text not null references public.store_chains (key) on update cascade on delete restrict,
  text_key text not null,
  -- clave estable de la clase (nunca el nombre visible). NULL cuando es ambiguo.
  food_type_key text references public.catalog_food_types (key) on update cascade on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'approved', 'ambiguous', 'retired')),
  batch_key text not null references public.shared_learning_batches (key) on update cascade on delete restrict,
  approved_by text check (approved_by ~ '^[a-z][a-z0-9_]*$'),
  approved_at timestamptz,
  retired_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shared_product_learning_key_uidx unique (chain_key, text_key),
  -- respaldo en base de datos de la normalización y de la privacidad: solo palabras en minúscula, sin signos ni secuencias largas
  constraint shared_product_learning_text_key_format check (
    text_key ~ '^[[:alnum:]]+( [[:alnum:]]+)*$'
    and text_key = lower(text_key)
    and length(text_key) between 2 and 60
    and text_key !~ '\d( ?\d){8}'
  ),
  -- coherencia de estados: approved = con clase y aprobación; ambiguous = SIN clase (nunca puede devolver una)
  constraint shared_product_learning_status_coherence check (
    (status = 'approved' and food_type_key is not null and approved_by is not null and approved_at is not null)
    or (status = 'ambiguous' and food_type_key is null)
    or status in ('pending', 'retired')
  )
);

create index shared_product_learning_batch_idx on public.shared_product_learning (batch_key);
create index shared_product_learning_food_type_idx on public.shared_product_learning (food_type_key);

comment on table public.shared_product_learning is
  'Aprendizaje compartido PEPA: (cadena, text_key) -> clase del catálogo. Sin datos de familias. Solo devuelve clase con status=approved. Consulta solo por resolve_shared_product_class.';

create or replace function public.shared_product_learning_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_chain public.store_chains;
  v_issues text[];
begin
  new.updated_at := now();
  if new.status = 'retired' and new.retired_at is null then
    new.retired_at := now();
  end if;
  if new.status = 'approved' then
    select * into v_chain from public.store_chains sc where sc.key = new.chain_key;
    if v_chain.status is distinct from 'active' or v_chain.learnable is distinct from true then
      raise exception 'shared_product_learning: la cadena % no es aprendible, no admite aprendizaje aprobado', new.chain_key;
    end if;
    if not exists (select 1 from public.catalog_food_types ft where ft.key = new.food_type_key and ft.status = 'approved') then
      raise exception 'shared_product_learning: la clase % no está aprobada en el catálogo', new.food_type_key;
    end if;
    v_issues := public.check_commercial_text(new.text_key);
    if cardinality(v_issues) > 0 then
      raise exception 'shared_product_learning: la clave "%" no pasa la validación de privacidad (%)', new.text_key, array_to_string(v_issues, ', ');
    end if;
  end if;
  return new;
end;
$$;

create trigger shared_product_learning_guard
  before insert or update on public.shared_product_learning
  for each row execute function public.shared_product_learning_guard();

-- ─── Resolución compartida: (tienda, texto comercial) -> clase, o el motivo por el que no hay ───
-- status: matched | not_found | ambiguous | invalid | chain_unresolved | chain_not_learnable
-- food_type_key SOLO con matched (fila approved y clase aún aprobada). text_key solo cuando el texto es seguro.
-- security definer: el usuario no lee las tablas; solo obtiene la respuesta de esta función.
create or replace function public.resolve_shared_product_class(p_store text, p_text text)
returns table (status text, chain_key text, text_key text, food_type_key text, source text, reason text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_chain record;
  v_issues text[];
  v_key text;
  v_row record;
begin
  -- 1. cadena (Fase 3)
  select * into v_chain from public.resolve_store_chain(p_store);
  if v_chain.status <> 'resolved' then
    return query select 'chain_unresolved'::text, null::text, null::text, null::text, null::text, v_chain.reason;
    return;
  end if;
  -- 2. la cadena debe ser aprendible
  if not v_chain.learnable then
    return query select 'chain_not_learnable'::text, v_chain.chain_key, null::text, null::text, null::text, null::text;
    return;
  end if;
  -- 3-4. texto: solo latino, y con la validación de privacidad
  if p_text is not null and p_text ~ '[^-ɏ -⁯]' then
    return query select 'invalid'::text, v_chain.chain_key, null::text, null::text, null::text, 'unsupported_characters'::text;
    return;
  end if;
  v_issues := public.check_commercial_text(p_text);
  if cardinality(v_issues) > 0 then
    return query select 'invalid'::text, v_chain.chain_key, null::text, null::text, null::text, array_to_string(v_issues, ',');
    return;
  end if;
  v_key := public.product_text_key(p_text);
  -- 5. búsqueda exacta (cadena, text_key)
  select l.status as l_status, l.food_type_key as l_food_type into v_row
  from public.shared_product_learning l
  where l.chain_key = v_chain.chain_key and l.text_key = v_key;

  if not found or v_row.l_status not in ('approved', 'ambiguous') then
    return query select 'not_found'::text, v_chain.chain_key, v_key, null::text, null::text, null::text;
  elsif v_row.l_status = 'ambiguous' then
    return query select 'ambiguous'::text, v_chain.chain_key, v_key, null::text, null::text, null::text;
  elsif not exists (select 1 from public.catalog_food_types ft where ft.key = v_row.l_food_type and ft.status = 'approved') then
    return query select 'not_found'::text, v_chain.chain_key, v_key, null::text, null::text, 'class_retired'::text;
  else
    return query select 'matched'::text, v_chain.chain_key, v_key, v_row.l_food_type, 'shared'::text, null::text;
  end if;
end;
$$;

-- ─── Seguridad: tablas NO expuestas (RLS activa, sin políticas y sin permisos); consulta solo por la RPC ───
alter table public.shared_learning_batches enable row level security;
alter table public.shared_product_learning enable row level security;
revoke all on public.shared_learning_batches, public.shared_product_learning from public, anon, authenticated;

revoke all on function public.product_text_key(text) from public, anon;
grant execute on function public.product_text_key(text) to authenticated, service_role;
revoke all on function public.check_commercial_text(text) from public, anon;
grant execute on function public.check_commercial_text(text) to authenticated, service_role;
revoke all on function public.resolve_shared_product_class(text, text) from public, anon;
grant execute on function public.resolve_shared_product_class(text, text) to authenticated, service_role;

-- ─── Primera siembra: lote pepa_seed_v1 (169 claves aprobadas + 1 ambigua explícita) ───
insert into public.shared_learning_batches (key, catalog_version, process, approved_by, approved_at, notes) values
  ('pepa_seed_v1', 1,
   'Inventario de la Fase 0 revisado y aprobado por la administración de PEPA (2026-09-21); revalidado en la Fase 4 con resolve_store_chain, la normalización text_key y la validación de privacidad de la Fase 3 y las claves del catálogo v1.',
   'pepa_admin', now(),
   '169 claves aprobadas (Mercadona 133, Hiperber 29, Charter 7) y 1 ambigua explícita. PARKING (línea estructural, no es un producto) no se guarda.');

insert into public.shared_product_learning (chain_key, text_key, food_type_key, status, batch_key, approved_by, approved_at) values
  ('mercadona', '10 s jardin c facil', 'other.limpieza_hogar', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', '100 integral', 'food.panaderia_bolleria', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', '20 b grandes c facil', 'other.limpieza_hogar', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'a rellenas anchoa p3', 'food.despensa', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'acei rellen anchoa', 'food.despensa', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'aceite virgen', 'food.despensa', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'aceituna r anchoa p3', 'food.despensa', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'ajo granulado', 'food.condimentos_hierbas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'albahaca', 'food.condimentos_hierbas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'alino', 'food.condimentos_hierbas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'alistado med', 'food.pescado_marisco', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'arreglo pelado', 'food.pescado_marisco', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'azucaritos blancos', 'food.condimentos_hierbas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'banderillas dulces', 'food.verdura_hortalizas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'berenjena', 'food.verdura_hortalizas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'bizcocho choco s g', 'food.panaderia_bolleria', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'bolsa plastico', 'other.otros', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'bolsas zip 1l', 'other.utensilios_cocina', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'bomba carrillada vac', 'food.congelados_helados', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'bombon triple choco', 'food.congelados_helados', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'c 0 0 tostada p 6', 'food.bebidas_no_alcoholicas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'c tostado ahumado', 'food.snacks_dulces', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'canelon clasico', 'food.despensa', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'caramelo salado', 'food.congelados_helados', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'cargador precision6', 'other.cuidado_personal', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'cerv pack 12', 'food.bebidas_alcoholicas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'cocktail rodeo', 'food.snacks_dulces', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'cola zero', 'food.bebidas_no_alcoholicas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'cola zero frio', 'food.bebidas_no_alcoholicas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'cono caramelo nueces', 'food.congelados_helados', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'cono nata fresa', 'food.congelados_helados', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'cristales multiusos', 'other.limpieza_hogar', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'croissant cacao', 'food.panaderia_bolleria', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'crunchy chicken', 'food.carne', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'crunchy picante', 'food.carne', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'dano fresa platano', 'food.lacteos_huevos', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'delicias mar', 'food.pescado_marisco', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'deo invisible mujer', 'other.cuidado_personal', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'detergente polvo byc', 'other.limpieza_hogar', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'ens iv estaciones', 'food.verdura_hortalizas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'esp corto medio', 'food.verdura_hortalizas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'flan de huevo', 'food.lacteos_huevos', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'frambuesa', 'food.fruta', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'fregona resis duplo', 'other.limpieza_hogar', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'friegasuelos spa', 'other.limpieza_hogar', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'garfitos sabor queso', 'food.snacks_dulces', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'gel limpiador bano', 'other.limpieza_hogar', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'gel t recuerdos', 'other.cuidado_personal', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'gel wc perfumado', 'other.limpieza_hogar', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'guacamole 500 gr', 'food.otros_alimentos', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'heineken p 6', 'food.bebidas_alcoholicas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'helado capuccino', 'food.congelados_helados', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'helices vegetales', 'food.despensa', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'hielo cubito 2kg', 'food.congelados_helados', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'huevo choco sorpresa', 'food.snacks_dulces', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'jabon manos avena', 'other.cuidado_personal', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'jabon manos neutral', 'other.cuidado_personal', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'ketchup zero', 'food.otros_alimentos', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'lasana precocida', 'food.despensa', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'lavavajillas fresh', 'other.limpieza_hogar', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'lavavajillas ultra', 'other.limpieza_hogar', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'leche semi p 6', 'food.lacteos_huevos', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'limpiador tuberias', 'other.limpieza_hogar', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'lote 3 bayetas micro', 'other.limpieza_hogar', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'magd pepitas choco', 'food.panaderia_bolleria', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'manz roja dulce', 'food.fruta', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'marina alta', 'food.bebidas_alcoholicas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'mayonesa hellmann s', 'food.otros_alimentos', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'menta chocolate', 'food.congelados_helados', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'mermelada frambuesa', 'food.despensa', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'mezcla 4 quesos', 'food.lacteos_huevos', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'mini bocados', 'food.panaderia_bolleria', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'mini emp pisto p6', 'food.panaderia_bolleria', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'mini saladas', 'food.panaderia_bolleria', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'minibombon almendrad', 'food.congelados_helados', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'minibombon nocciola', 'food.congelados_helados', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'mostaza clasica', 'food.otros_alimentos', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'mosto tinto', 'food.bebidas_no_alcoholicas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'naranja zero', 'food.bebidas_no_alcoholicas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'naranja zero p 8', 'food.bebidas_no_alcoholicas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'neval 330ml', 'food.bebidas_no_alcoholicas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'p pav red sal bipa', 'food.carne', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'panec 100 integral', 'food.panaderia_bolleria', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'panuelo locion', 'other.cuidado_personal', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'papel higienico 4 ca', 'other.cuidado_personal', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'papel vegetal 30h', 'other.utensilios_cocina', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'patata 5 kg', 'food.verdura_hortalizas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'pech empanada s g', 'food.carne', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'pepinillo ag grande', 'food.despensa', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'pepinillo pequeno', 'food.despensa', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'pepinillos ag peq', 'food.despensa', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'pepino', 'food.verdura_hortalizas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'picos campero', 'food.panaderia_bolleria', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'pincho pepperoni', 'food.carne', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'porcion light', 'food.lacteos_huevos', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'prot natilla vaini', 'food.lacteos_huevos', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'prot pud caramelo', 'food.lacteos_huevos', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'proteinas fresa', 'food.lacteos_huevos', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'proteinas mousse ch', 'food.lacteos_huevos', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'pulguitas 6 unids', 'food.panaderia_bolleria', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'q semi cortado', 'food.lacteos_huevos', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'queso gouda lonchas', 'food.lacteos_huevos', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'queso rallado polvo', 'food.lacteos_huevos', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'recambio liquido ins', 'other.limpieza_hogar', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'rega pica mix', 'food.snacks_dulces', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'rega red mix', 'food.snacks_dulces', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'relleno fajitas', 'food.carne', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'reserva lonchas', 'food.carne', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'rollo hogar doble', 'other.limpieza_hogar', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'roti de pollo', 'food.carne', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'sal lavavajillas', 'other.limpieza_hogar', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'salami pack 4', 'food.carne', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'salchicha bratwurst', 'food.carne', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'salchichon 4pack', 'food.carne', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'salsa albahaca', 'food.condimentos_hierbas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'salsa ligera', 'food.otros_alimentos', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'salteado verd asada', 'food.verdura_hortalizas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'sarta picante', 'food.carne', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'solomillo pollo s g', 'food.carne', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'suavizante floral', 'other.limpieza_hogar', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 't 100 integrales', 'food.panaderia_bolleria', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 't cherry pera negro', 'food.verdura_hortalizas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'tiburon', 'food.despensa', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'tinto verano lim 0 0', 'food.bebidas_no_alcoholicas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'tinto verano s alc', 'food.bebidas_no_alcoholicas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'tomate frito', 'food.despensa', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'tomate frito brick', 'food.despensa', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'torrezno bbq', 'food.snacks_dulces', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'tortilla pat c ceb', 'food.otros_alimentos', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'tubos fresa', 'food.snacks_dulces', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'vela cifra 0', 'other.utensilios_cocina', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'vela cifra 4', 'other.utensilios_cocina', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('mercadona', 'vermouth reserva', 'food.bebidas_alcoholicas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'aceituna alteza g', 'food.despensa', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'banderilla dulce', 'food.verdura_hortalizas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'bolsa cm a 48x60', 'other.otros', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'burger meat calab', 'food.carne', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'burger meat espec', 'food.carne', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'burger meat mixta', 'food.carne', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'burger meat tern', 'food.carne', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'cerveza estrella', 'food.bebidas_alcoholicas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'cerveza heineken', 'food.bebidas_alcoholicas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'cerveza mahou tos', 'food.bebidas_no_alcoholicas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'cookie white rsp', 'food.panaderia_bolleria', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'croissant bombon', 'food.panaderia_bolleria', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'dots sugar pack 2', 'food.panaderia_bolleria', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'imperial pozo cla', 'food.carne', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'jamon cocido horn', 'food.carne', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'mini caracola cho', 'food.panaderia_bolleria', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'mini empan bac qu', 'food.panaderia_bolleria', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'mini empan pisto', 'food.panaderia_bolleria', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'napolitana bombon', 'food.panaderia_bolleria', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'panuelos selex fa', 'other.cuidado_personal', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'patatas ruffles j', 'food.snacks_dulces', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'pelotas burguer m', 'food.carne', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'quesadilla pollo', 'food.otros_alimentos', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'refres coca cola', 'food.bebidas_no_alcoholicas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'refres fanta zero', 'food.bebidas_no_alcoholicas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'rollos naranjitos', 'food.panaderia_bolleria', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'snack bonfrit coc', 'food.snacks_dulces', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'snacks bugles 3 d', 'food.snacks_dulces', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('hiperber', 'vino con un par 7', 'food.bebidas_alcoholicas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('charter', '3d s queso bacon 85', 'food.snacks_dulces', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('charter', 'bolsa compra recicl', 'other.otros', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('charter', 'cerveza mahou 1l', 'food.bebidas_alcoholicas', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('charter', 'coct jumpers 100g', 'food.snacks_dulces', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('charter', 'lay s gourmet 170g', 'food.snacks_dulces', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('charter', 'ruffles jamon 150 g', 'food.snacks_dulces', 'approved', 'pepa_seed_v1', 'pepa_admin', now()),
  ('charter', 's miguel 0 0 s alc', 'food.bebidas_no_alcoholicas', 'approved', 'pepa_seed_v1', 'pepa_admin', now())
;

-- Ambigua conocida: el mismo texto de Charter es una cerveza de 1 L con alcohol y una lata de 0,33 sin alcohol en un mismo ticket.
-- Se recuerda para que PEPA sepa que ya la conocemos y NO adivine: nunca devuelve clase.
insert into public.shared_product_learning (chain_key, text_key, food_type_key, status, batch_key, notes) values
  ('charter', 'sup bebida fria', null, 'ambiguous', 'pepa_seed_v1',
   'Mismo texto = cerveza 1 L con alcohol y lata 0,33 sin alcohol en un mismo ticket: no se puede decidir por el texto.');

-- Comprobación: si la siembra no es exactamente la aprobada, la migración entera falla.
do $$
declare
  v_total integer;
  v_m integer;
  v_h integer;
  v_c integer;
  v_other integer;
begin
  select count(*) into v_total from public.shared_product_learning where batch_key = 'pepa_seed_v1' and status = 'approved';
  select count(*) into v_m from public.shared_product_learning where batch_key = 'pepa_seed_v1' and status = 'approved' and chain_key = 'mercadona';
  select count(*) into v_h from public.shared_product_learning where batch_key = 'pepa_seed_v1' and status = 'approved' and chain_key = 'hiperber';
  select count(*) into v_c from public.shared_product_learning where batch_key = 'pepa_seed_v1' and status = 'approved' and chain_key = 'charter';
  select count(*) into v_other from public.shared_product_learning where status = 'approved' and chain_key not in ('mercadona', 'hiperber', 'charter');
  if v_total <> 169 or v_m <> 133 or v_h <> 29 or v_c <> 7 or v_other <> 0 then
    raise exception 'siembra pepa_seed_v1 incorrecta: total %, mercadona %, hiperber %, charter %, otras cadenas %', v_total, v_m, v_h, v_c, v_other;
  end if;
end $$;
