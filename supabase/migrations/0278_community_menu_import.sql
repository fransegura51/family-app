-- COMUNIDAD PEPA — menú semanal oficial: importación a la Cocina de la familia (vista previa + importación ATÓMICA).
--
-- Qué hace: una persona con acceso completo a Comunidad elige, en una publicación oficial de tipo menú, importar la semana, un día, una comida/cena o una sola
-- receta. Las recetas se crean en la Cocina de SU familia (tablas reales `recipes` y `recipe_ingredients`) y los platos se apuntan en SU menú semanal (`menu_entries`).
--
-- Reglas (todas en la base de datos, no en la pantalla):
--  - Todo o nada: una sola transacción. Si algo falla no queda ninguna receta ni plato a medias.
--  - NUNCA pisa nada en silencio. Si la comida/cena de destino ya tiene platos: 'skip' (por defecto) la respeta y la omite; 'replace' quita SOLO los platos
--    apuntados en ese hueco del menú (nunca recetas) y solo si la persona lo eligió expresamente en la confirmación; 'append' añade los nuevos detrás.
--  - Recetas: si la familia ya tiene una con el mismo título (sin mayúsculas ni tildes) se REUTILIZA, no se duplica ('copy' crea otra aparte, a petición).
--  - Idempotente: la misma clave de importación (p_idempotency_key) devuelve lo ya hecho sin volver a crear nada (pulsaciones repetidas, reintentos de red).
--    Las claves caducan a los 7 días y son de cada familia.
--  - Solo se trabaja sobre la familia de quien llama (auth.uid()). Nunca se acepta un identificador de familia desde fuera.
--  - Nada de la lista de la compra: eso se suma y revisa en la app con el código de Compras de siempre (menuShoppingPlan.ts).
--  - La importación solo LEE el menú oficial publicado; no envía nada de la familia a Comunidad.
--
-- Dónde está el menú: `community_posts.menu` de la publicación oficial de tipo `menu` (0270). ÚNICO punto que lee ese sitio: private.community_menu_of_post().
-- Si el menú se guardase en otra parte, solo cambia esa función.

-- ---------------------------------------------------------------------------------------------
-- Registro de importaciones (y claves de idempotencia). Solo lo toca el servidor.
-- ---------------------------------------------------------------------------------------------
create table public.community_menu_imports (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 80),
  -- Para detectar que se reutiliza la misma clave con una petición DISTINTA (error del cliente): se compara la huella, nunca se mezcla.
  fingerprint text not null,
  profile_id uuid references public.profiles(id) on delete set null,
  post_id uuid references public.community_posts(id) on delete set null,
  scope text not null check (scope in ('week', 'day', 'meal', 'recipe')),
  target_start date,
  servings integer,
  on_conflict text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  unique (family_id, idempotency_key)
);
create index idx_community_menu_imports_expires on public.community_menu_imports (expires_at);
alter table public.community_menu_imports enable row level security;
revoke all on public.community_menu_imports from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Ayudas privadas
-- ---------------------------------------------------------------------------------------------

-- Texto sin mayúsculas, tildes (ni eñes) ni espacios repetidos: así se comparan los títulos de recetas (igual que la normalización de la app).
create or replace function private.community_menu_norm(p_text text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select btrim(regexp_replace(translate(lower(coalesce(p_text, '')), 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun'), '\s+', ' ', 'g'))
$$;
revoke execute on function private.community_menu_norm(text) from public, anon, authenticated;

-- Posición del día en la semana (lunes = 0 … domingo = 6); null si no es un día.
create or replace function private.community_menu_day_index(p_day text)
returns integer
language sql
immutable
security definer
set search_path = ''
as $$
  select case private.community_menu_norm(p_day)
    when 'lunes' then 0 when 'martes' then 1 when 'miercoles' then 2 when 'jueves' then 3
    when 'viernes' then 4 when 'sabado' then 5 when 'domingo' then 6 else null end
$$;
revoke execute on function private.community_menu_day_index(text) from public, anon, authenticated;

-- Nombre del día para mostrar (con tilde), por su posición.
create or replace function private.community_menu_day_name(p_index integer)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select (array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'])[p_index + 1]
$$;
revoke execute on function private.community_menu_day_name(integer) from public, anon, authenticated;

-- Cantidad escalada de una receta de `p_from` a `p_to` raciones. Mismas reglas que scaleIngredientQuantity (src/domain/recipeScaling.ts): solo se escalan
-- números simples con una unidad que se entiende (masa, volumen, unidades, cucharadas, cucharaditas); lo demás se deja EXACTAMENTE como está.
-- Devuelve {quantity, unit}. Máximo 2 decimales, con punto (así guarda PEPA los decimales).
create or replace function private.community_menu_scale(p_quantity text, p_unit text, p_from numeric, p_to numeric)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_q text := replace(btrim(coalesce(p_quantity, '')), ',', '.');
  v_u text := lower(btrim(coalesce(p_unit, '')));
  v_family text;
  v_label text;
  v_val numeric;
  v_text text;
  v_unit text;
begin
  if p_from is null or p_from <= 0 or p_to is null or p_to <= 0 or p_from = p_to or v_q !~ '^\d+(\.\d+)?$' then
    return jsonb_build_object('quantity', p_quantity, 'unit', p_unit);
  end if;
  v_val := v_q::numeric;
  if v_val <= 0 then
    return jsonb_build_object('quantity', p_quantity, 'unit', p_unit);
  end if;
  v_family := case v_u
    when 'g' then 'masa' when 'gr' then 'masa' when 'kg' then 'masa'
    when 'ml' then 'volumen' when 'cl' then 'volumen' when 'l' then 'volumen' when 'lt' then 'volumen' when 'litro' then 'volumen' when 'litros' then 'volumen'
    when 'unidad' then 'conteo' when 'unidades' then 'conteo' when 'ud' then 'conteo' when 'uds' then 'conteo'
    when 'cucharada' then 'cucharada' when 'cucharadas' then 'cucharada' when 'cda' then 'cucharada' when 'cdas' then 'cucharada'
    when 'cucharadita' then 'cucharadita' when 'cucharaditas' then 'cucharadita' when 'cdta' then 'cucharadita' when 'cdtas' then 'cucharadita'
    else null end;
  if v_family is null then
    return jsonb_build_object('quantity', p_quantity, 'unit', p_unit);
  end if;
  v_val := v_val * p_to / p_from;
  v_label := case v_u
    when 'g' then 'g' when 'gr' then 'g' when 'kg' then 'kg'
    when 'ml' then 'ml' when 'cl' then 'cl' else 'l' end;
  v_unit := case v_family
    when 'conteo' then case when v_val = 1 then 'unidad' else 'unidades' end
    when 'cucharada' then case when v_val = 1 then 'cucharada' else 'cucharadas' end
    when 'cucharadita' then case when v_val = 1 then 'cucharadita' else 'cucharaditas' end
    else v_label end;
  v_text := round(v_val, 2)::text;
  if v_text like '%.%' then
    v_text := rtrim(rtrim(v_text, '0'), '.');
  end if;
  return jsonb_build_object('quantity', v_text, 'unit', v_unit);
end;
$$;
revoke execute on function private.community_menu_scale(text, text, numeric, numeric) from public, anon, authenticated;

-- Raciones válidas de la Cocina (entre 1 y 50, de medio en medio); null si no lo son.
create or replace function private.community_menu_valid_servings(p_value jsonb)
returns numeric
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v numeric;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'number' then
    return null;
  end if;
  v := (p_value #>> '{}')::numeric;
  if v >= 1 and v <= 50 and v * 2 = floor(v * 2) then
    return v;
  end if;
  return null;
end;
$$;
revoke execute on function private.community_menu_valid_servings(jsonb) from public, anon, authenticated;

-- El menú de una publicación oficial PUBLICADA, ya comprobado: forma, límites y días. Raise 'NOT_AVAILABLE' si la publicación no existe, no está publicada o
-- no lleva menú; 'BAD_MENU' si el menú está mal formado (nunca se importa algo a medias). Solo se devuelve a quien llama desde otras funciones del servidor.
create or replace function private.community_menu_of_post(p_post uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_menu jsonb;
  v_status text;
  d jsonb;
  m jsonb;
  r jsonb;
  v_meal text;
  v_seen integer[] := '{}';
  v_idx integer;
begin
  select p.menu, p.status into v_menu, v_status
  from public.community_posts p
  where p.id = p_post and p.kind = 'menu';
  if v_menu is null or v_status is distinct from 'published' or jsonb_typeof(v_menu) <> 'object' then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if jsonb_typeof(v_menu -> 'days') is distinct from 'array' or jsonb_array_length(v_menu -> 'days') not between 1 and 7 then
    raise exception 'BAD_MENU' using errcode = 'P0001';
  end if;
  for d in select value from jsonb_array_elements(v_menu -> 'days') loop
    if jsonb_typeof(d) <> 'object' or jsonb_typeof(d -> 'day') is distinct from 'string' or jsonb_typeof(d -> 'meals') is distinct from 'object' then
      raise exception 'BAD_MENU' using errcode = 'P0001';
    end if;
    v_idx := private.community_menu_day_index(d ->> 'day');
    if v_idx is null or v_idx = any(v_seen) then
      raise exception 'BAD_MENU' using errcode = 'P0001';
    end if;
    v_seen := v_seen || v_idx;
    foreach v_meal in array array['comida', 'cena'] loop
      m := d -> 'meals' -> v_meal;
      if m is null then
        continue;
      end if;
      if jsonb_typeof(m) <> 'object' or jsonb_typeof(m -> 'recipes') is distinct from 'array' or jsonb_array_length(m -> 'recipes') not between 1 and 6 then
        raise exception 'BAD_MENU' using errcode = 'P0001';
      end if;
      for r in select value from jsonb_array_elements(m -> 'recipes') loop
        if jsonb_typeof(r) <> 'object'
           or jsonb_typeof(r -> 'title') is distinct from 'string'
           or char_length(btrim(r ->> 'title')) not between 1 and 140
           or jsonb_typeof(r -> 'ingredients') is distinct from 'array' or jsonb_array_length(r -> 'ingredients') > 80
           or jsonb_typeof(r -> 'steps') is distinct from 'array' or jsonb_array_length(r -> 'steps') > 40
           or (r ? 'tags' and jsonb_typeof(r -> 'tags') is distinct from 'array') then
          raise exception 'BAD_MENU' using errcode = 'P0001';
        end if;
        if exists (select 1 from jsonb_array_elements(r -> 'ingredients') x where jsonb_typeof(x) <> 'object' or jsonb_typeof(x -> 'name') is distinct from 'string')
           or exists (select 1 from jsonb_array_elements(r -> 'steps') x where jsonb_typeof(x) <> 'string')
           or exists (select 1 from jsonb_array_elements(coalesce(r -> 'tags', '[]'::jsonb)) x where jsonb_typeof(x) <> 'string') then
          raise exception 'BAD_MENU' using errcode = 'P0001';
        end if;
      end loop;
    end loop;
  end loop;
  return v_menu;
end;
$$;
revoke execute on function private.community_menu_of_post(uuid) from public, anon, authenticated;

-- Parte del menú que se quiere importar, como una lista de «huecos» (día + comida/cena), cada uno con sus recetas (índice 0 = plato principal; el resto,
-- acompañamientos). Valida el alcance: 'week' | 'day' (p_day) | 'meal' (p_day, p_meal) | 'recipe' (p_day, p_meal y p_idx, 0 = principal).
create or replace function private.community_menu_slots(p_menu jsonb, p_scope text, p_day text, p_meal text, p_idx integer)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_day_idx integer := private.community_menu_day_index(p_day);
  v_meal text := private.community_menu_norm(p_meal);
  v_out jsonb := '[]'::jsonb;
  d jsonb;
  v_d integer;
  v_m text;
  m jsonb;
  v_recipes jsonb;
begin
  if p_scope is null or p_scope not in ('week', 'day', 'meal', 'recipe') then
    raise exception 'BAD_SCOPE' using errcode = 'P0001';
  end if;
  if p_scope in ('day', 'meal', 'recipe') and v_day_idx is null then
    raise exception 'BAD_SCOPE' using errcode = 'P0001';
  end if;
  if p_scope in ('meal', 'recipe') and v_meal not in ('comida', 'cena') then
    raise exception 'BAD_SCOPE' using errcode = 'P0001';
  end if;
  if p_scope = 'recipe' and (p_idx is null or p_idx < 0 or p_idx > 5) then
    raise exception 'BAD_SCOPE' using errcode = 'P0001';
  end if;
  -- Siempre en el orden de la semana (lunes → domingo), comida antes que cena, aunque el menú venga desordenado.
  for d in select value from jsonb_array_elements(p_menu -> 'days') order by private.community_menu_day_index(value ->> 'day') loop
    v_d := private.community_menu_day_index(d ->> 'day');
    if p_scope <> 'week' and v_d <> v_day_idx then
      continue;
    end if;
    foreach v_m in array array['comida', 'cena'] loop
      if p_scope in ('meal', 'recipe') and v_m <> v_meal then
        continue;
      end if;
      m := d -> 'meals' -> v_m;
      if m is null then
        continue;
      end if;
      select coalesce(jsonb_agg(jsonb_build_object('idx', t.ord - 1, 'role', case when t.ord = 1 then 'principal' else 'acompanamiento' end, 'recipe', t.value) order by t.ord), '[]'::jsonb)
        into v_recipes
        from jsonb_array_elements(m -> 'recipes') with ordinality as t(value, ord)
        where p_scope <> 'recipe' or t.ord - 1 = p_idx;
      if jsonb_array_length(v_recipes) = 0 then
        continue;
      end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'day', private.community_menu_day_name(v_d), 'day_index', v_d, 'meal', v_m,
        'title', left(btrim(coalesce(m ->> 'title', '')), 140), 'side', left(btrim(coalesce(m ->> 'side', '')), 140),
        'recipes', v_recipes));
    end loop;
  end loop;
  if jsonb_array_length(v_out) = 0 then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  return v_out;
end;
$$;
revoke execute on function private.community_menu_slots(jsonb, text, text, text, integer) from public, anon, authenticated;

-- Una receta del menú lista para la Cocina: mismos arreglos que communityRecipeBridge.ts (publicRecipeToKitchenInput + createRecipe):
--  - ingredientes: las comas se ven como espacios y «1,5» pasa a «1.5»; nombre ≤ 120, cantidad y unidad ≤ 30; cantidad o unidad vacía = null; sin nombre = se quita;
--  - pasos: «1. …\n2. …» (una línea por paso, sin numeración repetida); etiquetas en minúsculas, sin repetir, ≤ 12 de ≤ 30 letras;
--  - raciones: las de la receta (o las del menú); si la familia cocina para otro número, se escalan las cantidades y se guardan sus raciones.
create or replace function private.community_menu_clean_recipe(p_recipe jsonb, p_menu_servings numeric, p_target numeric)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_from numeric := coalesce(private.community_menu_valid_servings(p_recipe -> 'servings'), p_menu_servings);
  v_ings jsonb := '[]'::jsonb;
  v_ing jsonb;
  v_scaled jsonb;
  v_name text;
  v_qty text;
  v_unit text;
  v_steps text[] := '{}';
  v_step text;
  v_tags text[] := '{}';
  v_tag text;
begin
  for v_ing in select value from jsonb_array_elements(p_recipe -> 'ingredients') loop
    v_name := left(btrim(regexp_replace(replace(coalesce(v_ing ->> 'name', ''), ',', ' '), '\s+', ' ', 'g')), 120);
    if v_name = '' then
      continue;
    end if;
    v_qty := case when jsonb_typeof(v_ing -> 'quantity') in ('string', 'number') then v_ing ->> 'quantity' else '' end;
    v_unit := case when jsonb_typeof(v_ing -> 'unit') = 'string' then v_ing ->> 'unit' else '' end;
    -- La cantidad se escala primero (ve «1,5» como 1.5) y después se limpia como en el puente.
    v_scaled := private.community_menu_scale(v_qty, v_unit, v_from, p_target);
    v_qty := left(btrim(regexp_replace(replace(regexp_replace(coalesce(v_scaled ->> 'quantity', ''), '(\d),(\d)', '\1.\2', 'g'), ',', ' '), '\s+', ' ', 'g')), 30);
    v_unit := left(btrim(regexp_replace(replace(coalesce(v_scaled ->> 'unit', ''), ',', ' '), '\s+', ' ', 'g')), 30);
    v_ings := v_ings || jsonb_build_array(jsonb_build_object('name', v_name, 'quantity', nullif(v_qty, ''), 'unit', nullif(v_unit, '')));
  end loop;
  for v_step in select value #>> '{}' from jsonb_array_elements(p_recipe -> 'steps') loop
    v_step := btrim(regexp_replace(btrim(regexp_replace(v_step, '\s*\n\s*', ' ', 'g')), '^\d+[.)]\s*', ''));
    if v_step <> '' then
      v_steps := v_steps || left(v_step, 2000);
    end if;
  end loop;
  for v_tag in select value #>> '{}' from jsonb_array_elements(coalesce(p_recipe -> 'tags', '[]'::jsonb)) loop
    v_tag := left(btrim(lower(v_tag)), 30);
    if v_tag <> '' and not v_tag = any(v_tags) and coalesce(array_length(v_tags, 1), 0) < 12 then
      v_tags := v_tags || v_tag;
    end if;
  end loop;
  return jsonb_build_object(
    'title', left(btrim(p_recipe ->> 'title'), 140),
    'notes', (select string_agg(i::text || '. ' || s, E'\n' order by i) from unnest(v_steps) with ordinality as t(s, i)),
    'tags', to_jsonb(v_tags),
    'servings', case when v_from is null then null else p_target end,
    'ingredients', v_ings);
end;
$$;
revoke execute on function private.community_menu_clean_recipe(jsonb, numeric, numeric) from public, anon, authenticated;

-- Comprobación común de los parámetros de vista previa e importación (los mismos errores en las dos).
create or replace function private.community_menu_check_args(p_scope text, p_target_start date, p_servings integer, p_on_conflict text, p_dup text)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  if p_scope is null or p_scope not in ('week', 'day', 'meal', 'recipe') then
    raise exception 'BAD_SCOPE' using errcode = 'P0001';
  end if;
  -- Los menús se colocan en una semana que empieza en lunes; una sola receta no necesita fecha.
  if p_scope <> 'recipe' and (p_target_start is null or extract(isodow from p_target_start) <> 1) then
    raise exception 'BAD_TARGET_START' using errcode = 'P0001';
  end if;
  if p_target_start is not null and (p_target_start < date '2020-01-01' or p_target_start > date '2100-01-01') then
    raise exception 'BAD_TARGET_START' using errcode = 'P0001';
  end if;
  if p_servings is null or p_servings < 1 or p_servings > 50 then
    raise exception 'BAD_SERVINGS' using errcode = 'P0001';
  end if;
  if p_on_conflict is null or p_on_conflict not in ('skip', 'replace', 'append') then
    raise exception 'BAD_CONFLICT' using errcode = 'P0001';
  end if;
  if p_dup is null or p_dup not in ('reuse', 'copy') then
    raise exception 'BAD_DUPLICATES' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function private.community_menu_check_args(text, date, integer, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Vista previa (solo lectura): fechas de destino y, para cada comida/cena, qué hay ya en el menú de la familia y qué recetas ya existen en su Cocina.
-- ---------------------------------------------------------------------------------------------
create or replace function public.community_menu_import_preview(
  p_post uuid, p_scope text, p_day text default null, p_meal text default null, p_recipe_index integer default null,
  p_target_start date default null, p_servings integer default 4, p_duplicate_recipes text default 'reuse')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_family uuid;
  v_menu jsonb;
  v_menu_servings numeric;
  v_slots jsonb;
  v_slot jsonb;
  v_item jsonb;
  v_clean jsonb;
  v_date date;
  v_existing jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_recipes jsonb;
  v_found jsonb;
  v_norm text;
  v_seen text[] := '{}';
  v_new integer := 0;
  v_known integer := 0;
  v_busy integer := 0;
begin
  perform private.community_require_reader();
  perform private.community_require_participation_access();
  select pr.family_id into v_family from public.profiles pr where pr.id = v_uid;
  if v_family is null then
    raise exception 'NO_FAMILY' using errcode = 'P0001';
  end if;
  perform private.community_menu_check_args(p_scope, p_target_start, p_servings, 'skip', p_duplicate_recipes);
  v_menu := private.community_menu_of_post(p_post);
  v_menu_servings := private.community_menu_valid_servings(v_menu -> 'servings');
  v_slots := private.community_menu_slots(v_menu, p_scope, p_day, p_meal, p_recipe_index);

  for v_slot in select value from jsonb_array_elements(v_slots) loop
    v_date := case when p_scope = 'recipe' then null else p_target_start + (v_slot ->> 'day_index')::integer end;
    -- Lo que la familia ya tiene apuntado en esa comida/cena (plato de receta o texto libre).
    if v_date is null then
      v_existing := '[]'::jsonb;
    else
      select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'label', coalesce(r.title, e.free_text, ''), 'kind', case when e.recipe_id is not null then 'receta' else 'texto' end)
                                order by e.created_at, e.id), '[]'::jsonb)
        into v_existing
        from public.menu_entries e
        left join public.recipes r on r.id = e.recipe_id and r.family_id = v_family
        where e.family_id = v_family and e.entry_date = v_date and e.meal_type = v_slot ->> 'meal';
    end if;
    if jsonb_array_length(v_existing) > 0 then
      v_busy := v_busy + 1;
    end if;
    v_recipes := '[]'::jsonb;
    for v_item in select value from jsonb_array_elements(v_slot -> 'recipes') loop
      v_clean := private.community_menu_clean_recipe(v_item -> 'recipe', v_menu_servings, p_servings);
      v_norm := private.community_menu_norm(v_clean ->> 'title');
      -- Recetas de la familia con el mismo título; «es igual» si tienen los mismos ingredientes (por nombre) y los mismos pasos.
      select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'same_content', x.same) order by x.created_at, x.id), '[]'::jsonb)
        into v_found
        from (
          select r.id, r.title, r.created_at,
                 coalesce(r.notes, '') = coalesce(v_clean ->> 'notes', '')
                 and coalesce((select array_agg(private.community_menu_norm(i.name) order by private.community_menu_norm(i.name)) from public.recipe_ingredients i where i.recipe_id = r.id), '{}')
                     = coalesce((select array_agg(private.community_menu_norm(c ->> 'name') order by private.community_menu_norm(c ->> 'name')) from jsonb_array_elements(v_clean -> 'ingredients') c), '{}') as same
          from public.recipes r
          where r.family_id = v_family and private.community_menu_norm(r.title) = v_norm
          order by r.created_at, r.id
          limit 3) x;
      if not v_norm = any(v_seen) then
        v_seen := v_seen || v_norm;
        if jsonb_array_length(v_found) > 0 and p_duplicate_recipes = 'reuse' then
          v_known := v_known + 1;
        else
          v_new := v_new + 1;
        end if;
      end if;
      v_recipes := v_recipes || jsonb_build_array(jsonb_build_object(
        'index', (v_item ->> 'idx')::integer, 'role', v_item ->> 'role', 'title', v_clean ->> 'title',
        'ingredient_count', jsonb_array_length(v_clean -> 'ingredients'),
        'existing_recipes', v_found,
        'action', case when jsonb_array_length(v_found) > 0 and p_duplicate_recipes = 'reuse' then 'reuse' else 'create' end));
    end loop;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'day', v_slot ->> 'day', 'meal', v_slot ->> 'meal', 'date', v_date, 'title', v_slot ->> 'title', 'side', v_slot ->> 'side',
      'existing', v_existing, 'recipes', v_recipes));
  end loop;

  return jsonb_build_object(
    'post_id', p_post, 'scope', p_scope, 'target_start', p_target_start,
    'target_end', case when p_target_start is null then null else p_target_start + 6 end,
    'servings', p_servings, 'menu_servings', v_menu_servings, 'duplicate_recipes', p_duplicate_recipes,
    'slots', v_rows,
    'summary', jsonb_build_object('slots', jsonb_array_length(v_rows), 'slots_busy', v_busy, 'recipes_new', v_new, 'recipes_known', v_known));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Importación ATÓMICA.
-- ---------------------------------------------------------------------------------------------
create or replace function public.community_menu_import(
  p_post uuid, p_scope text, p_day text default null, p_meal text default null, p_recipe_index integer default null,
  p_target_start date default null, p_servings integer default 4, p_on_conflict text default 'skip', p_idempotency_key text default null,
  p_duplicate_recipes text default 'reuse')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_family uuid;
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_fp text;
  v_log public.community_menu_imports%rowtype;
  v_menu jsonb;
  v_menu_servings numeric;
  v_slots jsonb;
  v_slot jsonb;
  v_item jsonb;
  v_clean jsonb;
  v_date date;
  v_busy integer;
  v_removed integer;
  v_norm text;
  v_recipe_id uuid;
  v_map jsonb := '{}'::jsonb;        -- título normalizado → id de la receta de la familia ya resuelta en ESTA importación
  v_listed jsonb := '[]'::jsonb;     -- recetas distintas de esta importación: {id, title, created}
  v_created integer := 0;
  v_reused integer := 0;
  v_slots_done integer := 0;
  v_slots_skipped integer := 0;
  v_slots_replaced integer := 0;
  v_slots_appended integer := 0;
  v_entries integer := 0;
  v_entries_removed integer := 0;
  v_skipped_list jsonb := '[]'::jsonb;
  v_result jsonb;
  v_ing jsonb;
begin
  perform private.community_require_reader();
  perform private.community_require_participation_access();
  select pr.family_id into v_family from public.profiles pr where pr.id = v_uid;
  if v_family is null then
    raise exception 'NO_FAMILY' using errcode = 'P0001';
  end if;
  if char_length(v_key) < 8 or char_length(v_key) > 80 then
    raise exception 'BAD_KEY' using errcode = 'P0001';
  end if;
  perform private.community_menu_check_args(p_scope, p_target_start, p_servings, p_on_conflict, p_duplicate_recipes);

  -- Una importación a la vez por familia: así dos pulsaciones o dos dispositivos no se pisan y el recuento de «hueco ocupado» es fiable.
  perform pg_advisory_xact_lock(hashtextextended('community_menu_import:' || v_family::text, 0));

  v_fp := md5(concat_ws('|', p_post::text, p_scope, coalesce(private.community_menu_norm(p_day), ''), coalesce(private.community_menu_norm(p_meal), ''),
                        coalesce(p_recipe_index::text, ''), coalesce(p_target_start::text, ''), p_servings::text, p_on_conflict, p_duplicate_recipes));
  delete from public.community_menu_imports x where x.family_id = v_family and x.expires_at < now();
  select * into v_log from public.community_menu_imports x where x.family_id = v_family and x.idempotency_key = v_key;
  if found then
    if v_log.fingerprint <> v_fp then
      raise exception 'KEY_REUSED' using errcode = 'P0001';
    end if;
    return v_log.result || jsonb_build_object('replayed', true);
  end if;

  v_menu := private.community_menu_of_post(p_post);
  v_menu_servings := private.community_menu_valid_servings(v_menu -> 'servings');
  v_slots := private.community_menu_slots(v_menu, p_scope, p_day, p_meal, p_recipe_index);

  for v_slot in select value from jsonb_array_elements(v_slots) loop
    v_date := case when p_scope = 'recipe' then null else p_target_start + (v_slot ->> 'day_index')::integer end;
    if v_date is not null then
      select count(*) into v_busy from public.menu_entries e where e.family_id = v_family and e.entry_date = v_date and e.meal_type = v_slot ->> 'meal';
      if v_busy > 0 and p_on_conflict = 'skip' then
        -- Se respeta lo que ya hay: este hueco no se toca y sus recetas ni siquiera se crean.
        v_slots_skipped := v_slots_skipped + 1;
        v_skipped_list := v_skipped_list || jsonb_build_array(jsonb_build_object('day', v_slot ->> 'day', 'meal', v_slot ->> 'meal', 'date', v_date));
        continue;
      end if;
      if v_busy > 0 and p_on_conflict = 'replace' then
        -- Solo se quitan los platos apuntados en ese hueco (nunca recetas, ni nada de otros días); la persona lo eligió en la confirmación.
        delete from public.menu_entries e where e.family_id = v_family and e.entry_date = v_date and e.meal_type = v_slot ->> 'meal';
        get diagnostics v_removed = row_count;
        v_entries_removed := v_entries_removed + v_removed;
        v_slots_replaced := v_slots_replaced + 1;
      elsif v_busy > 0 then
        v_slots_appended := v_slots_appended + 1;
      end if;
    end if;

    for v_item in select value from jsonb_array_elements(v_slot -> 'recipes') loop
      v_clean := private.community_menu_clean_recipe(v_item -> 'recipe', v_menu_servings, p_servings);
      v_norm := private.community_menu_norm(v_clean ->> 'title');
      v_recipe_id := null;
      if v_map ? v_norm then
        v_recipe_id := (v_map ->> v_norm)::uuid;
      else
        if p_duplicate_recipes = 'reuse' then
          select r.id into v_recipe_id from public.recipes r
            where r.family_id = v_family and private.community_menu_norm(r.title) = v_norm order by r.created_at, r.id limit 1;
        end if;
        if v_recipe_id is null then
          insert into public.recipes (family_id, title, notes, tags, servings)
          values (v_family, v_clean ->> 'title', v_clean ->> 'notes', array(select jsonb_array_elements_text(v_clean -> 'tags')), (v_clean ->> 'servings')::numeric)
          returning id into v_recipe_id;
          for v_ing in select value from jsonb_array_elements(v_clean -> 'ingredients') loop
            insert into public.recipe_ingredients (recipe_id, name, quantity, unit)
            values (v_recipe_id, v_ing ->> 'name', v_ing ->> 'quantity', v_ing ->> 'unit');
          end loop;
          v_created := v_created + 1;
          v_listed := v_listed || jsonb_build_array(jsonb_build_object('id', v_recipe_id, 'title', v_clean ->> 'title', 'created', true));
        else
          v_reused := v_reused + 1;
          v_listed := v_listed || jsonb_build_array(jsonb_build_object('id', v_recipe_id, 'title', v_clean ->> 'title', 'created', false));
        end if;
        v_map := v_map || jsonb_build_object(v_norm, v_recipe_id);
      end if;
      -- Una receta suelta solo va a la Cocina: no se apunta en el menú.
      if v_date is not null then
        -- created_at con el reloj real (no el de la transacción): así el plato principal queda SIEMPRE antes que el acompañamiento al leer el menú.
        insert into public.menu_entries (family_id, entry_date, meal_type, recipe_id, created_at) values (v_family, v_date, v_slot ->> 'meal', v_recipe_id, clock_timestamp());
        v_entries := v_entries + 1;
      end if;
    end loop;
    v_slots_done := v_slots_done + 1;
  end loop;

  v_result := jsonb_build_object(
    'ok', true, 'replayed', false, 'scope', p_scope, 'target_start', p_target_start,
    'target_end', case when p_target_start is null then null else p_target_start + 6 end,
    'servings', p_servings, 'on_conflict', p_on_conflict,
    'recipes_created', v_created, 'recipes_reused', v_reused, 'recipes', v_listed,
    'slots_imported', v_slots_done, 'slots_skipped', v_slots_skipped, 'slots_replaced', v_slots_replaced, 'slots_appended', v_slots_appended,
    'skipped', v_skipped_list, 'entries_created', v_entries, 'entries_removed', v_entries_removed);

  insert into public.community_menu_imports (family_id, idempotency_key, fingerprint, profile_id, post_id, scope, target_start, servings, on_conflict, result)
  values (v_family, v_key, v_fp, v_uid, p_post, p_scope, p_target_start, p_servings, p_on_conflict, v_result);
  return v_result;
end;
$$;

revoke all on function public.community_menu_import_preview(uuid, text, text, text, integer, date, integer, text) from public, anon;
revoke all on function public.community_menu_import(uuid, text, text, text, integer, date, integer, text, text, text) from public, anon;
grant execute on function public.community_menu_import_preview(uuid, text, text, text, integer, date, integer, text) to authenticated;
grant execute on function public.community_menu_import(uuid, text, text, text, integer, date, integer, text, text, text) to authenticated;
