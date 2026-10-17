-- COMUNIDAD PEPA — recetas estructuradas dentro de una publicación de cocina: cada una se importa SOLA a «La cocina de Pepa» de la familia.
--
-- Problema: un consejo o artículo puede traer varias recetas o variantes dentro del texto («Tortilla francesa: mucho más que huevo batido», con siete ideas). El texto
-- libre NO se convierte en receta automáticamente (sería inventar cantidades y pasos): las recetas las escribe la edición con sus datos reales, UNA vez, y la base de datos
-- las valida. Mismo contrato que las recetas del menú semanal (private.community_validate_menu_recipe: título, raciones, ingredientes con cantidad/unidad, pasos…) más una
-- `key` estable por receta (minúsculas, números y guiones) para poder pedir «esta» receta. Cantidad desconocida = texto vacío (nunca un número inventado).
--
--  · community_posts.recipes (jsonb, nulo salvo en estas publicaciones): array de 1 a 12 recetas. Entra al publicar desde `payload.recipes` del contenido oficial.
--  · El detalle de la publicación (community_get_post) devuelve `variants` con ellas, para enseñarlas y elegir cuáles importar.
--  · community_import_post_recipes(post, keys[], clave_de_importación): importa las recetas elegidas A LA COCINA DE QUIEN LLAMA (nunca se acepta un id de familia),
--    todo o nada, idempotente (misma clave = mismo resultado, sin duplicar) y reutilizando una receta de la familia con el mismo título (o creando otra aparte si se pide).
--    Reutiliza la limpieza y la normalización de la importación del menú (private.community_menu_clean_recipe) y su registro de importaciones.
--  · NO modifica la publicación ni nada de otras familias, y no añade nada a la lista de la compra (eso se hace luego con la receta ya en Cocina).
-- Deshacer: supabase/rollbacks/0282_community_post_recipes_down.sql.

alter table public.community_posts add column recipes jsonb;

-- Texto de error (para quien edita) o null si las recetas son válidas.
create or replace function private.community_validate_post_recipes(p jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  r jsonb;
  v_keys text[] := '{}';
  v_key text;
  v_err text;
begin
  if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p) not between 1 and 12 then
    return 'las recetas deben ser una lista de 1 a 12';
  end if;
  for r in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(r) is distinct from 'object' then
      return 'una receta no tiene el formato esperado';
    end if;
    v_key := r ->> 'key';
    if jsonb_typeof(r -> 'key') is distinct from 'string' or v_key !~ '^[a-z0-9][a-z0-9-]{0,39}$' then
      return 'cada receta necesita una clave (minúsculas, números y guiones, hasta 40)';
    end if;
    if v_key = any (v_keys) then
      return 'la clave «' || v_key || '» está repetida';
    end if;
    v_keys := v_keys || v_key;
    -- Una receta de verdad: no se admiten «elementos sencillos» (fruta, tostada…) en estas publicaciones.
    if coalesce(r ->> 'simple', 'false') = 'true' then
      return 'la receta «' || v_key || '» no puede ser un elemento sencillo';
    end if;
    v_err := private.community_validate_menu_recipe(r);
    if v_err is not null then
      return v_err;
    end if;
  end loop;
  return null;
end;
$$;
revoke execute on function private.community_validate_post_recipes(jsonb) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION private.community_post_detail(p community_posts, p_viewer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_card jsonb := private.community_card(p, p_viewer);
  v_photos jsonb;
  v_recipe jsonb;
  v_me_rating integer;
  v_me_review text;
  v_me_review_hidden boolean := false;
  v_imported boolean := false;
  v_family uuid;
begin
  if (v_card ->> 'blocked_by_me')::boolean is true then
    return v_card;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('path', ph.storage_path, 'position', ph.position) order by ph.position), '[]'::jsonb)
  into v_photos from public.community_post_photos ph where ph.post_id = p.id;
  if p.recipe_id is not null then
    if p_viewer is not null then
      select r.stars, r.review, r.status = 'hidden' into v_me_rating, v_me_review, v_me_review_hidden from public.community_recipe_ratings r where r.recipe_id = p.recipe_id and r.profile_id = p_viewer;
      v_me_review_hidden := coalesce(v_me_review_hidden, false);
      select pr.family_id into v_family from public.profiles pr where pr.id = (select auth.uid());
      v_imported := v_family is not null and exists (select 1 from public.community_recipe_imports i where i.recipe_id = p.recipe_id and i.family_id = v_family);
    end if;
    select jsonb_build_object(
      'id', r.id, 'title', r.title, 'servings', r.servings, 'ingredients', r.ingredients, 'steps', r.steps, 'tags', to_jsonb(r.tags),
      'version', r.version, 'updated_at', r.updated_at, 'my_rating', v_me_rating, 'my_review', v_me_review, 'my_review_hidden', v_me_review_hidden, 'imported_by_my_family', v_imported)
    into v_recipe from public.community_recipes r where r.id = p.recipe_id;
  end if;
  return v_card || jsonb_build_object(
    'body', p.body,
    'photos', v_photos,
    'recipe', v_recipe,
    'article_sources', p.article_sources,
    -- Menú semanal oficial: los datos estructurados SOLO salen aquí (detalle, con acceso de lectura) y la semana aparte para pintarla sin recorrer el menú.
    'menu', p.menu,
    -- Recetas estructuradas de una publicación de cocina (0282): cada una se puede importar sola a la Cocina de la familia.
    'variants', p.recipes,
    'menu_week', case when p.menu ->> 'week_start' is not null then jsonb_build_object('start', p.menu ->> 'week_start', 'end', p.menu ->> 'week_end') end,
    'is_mine', p_viewer is not null and p.author_id = p_viewer,
    'following_conversation', p_viewer is not null and exists (select 1 from public.community_conversation_follows f where f.post_id = p.id and f.profile_id = p_viewer),
    'following_author', p_viewer is not null and exists (select 1 from public.community_user_follows f where f.follower_id = p_viewer and f.followed_id = p.author_id)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.community_publish_item(p_item uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  i public.community_official_items%rowtype;
  v_author uuid;
  v_label text;
  v_kind text;
  v_post uuid := gen_random_uuid();
  v_menu jsonb;
  v_recipes jsonb;
  v_err text;
begin
  select * into i from public.community_official_items x where x.id = p_item for update;
  if not found or i.status <> 'approved' or i.published_post_id is not null then
    return null;
  end if;
  if i.kind = 'menu' then
    v_err := private.community_validate_menu_item(i.payload);
    if v_err is not null then
      raise exception 'MENU_INVALID' using errcode = 'P0001', detail = v_err;
    end if;
    v_menu := i.payload -> 'menu';
    if i.payload ->> 'schedule' = 'saturday' then
      if i.menu_week_start is null then
        raise exception 'MENU_INVALID' using errcode = 'P0001', detail = 'El menú semanal no tiene semana asignada.';
      end if;
      v_menu := v_menu || jsonb_build_object('week_start', to_char(i.menu_week_start, 'YYYY-MM-DD'), 'week_end', to_char(i.menu_week_start + 6, 'YYYY-MM-DD'));
    end if;
  end if;
  -- Recetas estructuradas (solo en consejos y artículos): se validan al publicar; si algo no vale, NO se publica (nunca recetas a medias).
  if i.kind in ('tip', 'article') and i.payload ? 'recipes' and jsonb_typeof(i.payload -> 'recipes') <> 'null' then
    v_err := private.community_validate_post_recipes(i.payload -> 'recipes');
    if v_err is not null then
      raise exception 'RECIPES_INVALID' using errcode = 'P0001', detail = v_err;
    end if;
    v_recipes := i.payload -> 'recipes';
  end if;
  v_author := case when i.kind in ('tip', 'menu') then '00000000-0000-4000-8000-0000000000a2'::uuid else '00000000-0000-4000-8000-0000000000a1'::uuid end;
  v_label := case i.kind when 'tip' then 'Consejo de Pepa' when 'menu' then 'Menú semanal de Pepa' when 'poll' then 'Encuesta de Equipo PEPA' else 'Artículo de Equipo PEPA' end;
  v_kind := case i.kind when 'tip' then 'consejo' when 'menu' then 'menu' when 'poll' then 'encuesta' else 'articulo' end;
  insert into public.community_posts (id, author_id, kind, section, topic_id, title, body, is_official, official_label, official_item_id, article_sources, menu, recipes)
  values (v_post, v_author, v_kind, i.section, i.topic_id, i.title, i.body, true, v_label, i.id, case when i.kind = 'article' then i.payload end, v_menu, v_recipes);
  update public.community_official_items set status = 'published', published_post_id = v_post, publish_error = null where id = i.id;
  if i.kind = 'poll' then
    update public.community_polls set post_id = v_post, status = case when now() >= opens_at then 'open' else status end where item_id = i.id;
  end if;
  return v_post;
end;
$function$;

-- Importar recetas de una publicación a la Cocina de la familia de quien llama (todo o nada, idempotente).
-- Errores (códigos para la app): BAD_KEY (clave de importación), BAD_DUPLICATES, NO_FAMILY, NOT_AVAILABLE (publicación sin esas recetas o no publicada), KEY_REUSED
-- (la misma clave con otra petición) y los de acceso (AUTH_REQUIRED, NOT_LAUNCHED, COMMUNITY_ACCESS_DENIED, PARTICIPATION_NOT_ALLOWED).
create or replace function public.community_import_post_recipes(p_post uuid, p_keys text[], p_idempotency_key text, p_duplicate_recipes text default 'reuse')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_family uuid;
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_keys text[];
  v_post public.community_posts%rowtype;
  v_fp text;
  v_log public.community_menu_imports%rowtype;
  v_variant jsonb;
  v_clean jsonb;
  v_norm text;
  v_recipe_id uuid;
  v_ing jsonb;
  v_map jsonb := '{}'::jsonb;
  v_listed jsonb := '[]'::jsonb;
  v_created integer := 0;
  v_reused integer := 0;
  v_result jsonb;
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
  if p_duplicate_recipes is null or p_duplicate_recipes not in ('reuse', 'copy') then
    raise exception 'BAD_DUPLICATES' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(k order by k), '{}') into v_keys from (select distinct k from unnest(coalesce(p_keys, '{}')) k where k is not null) s;
  if cardinality(v_keys) not between 1 and 12 then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  -- Una importación a la vez por familia (el mismo bloqueo que la del menú): dos pulsaciones o dos móviles no se pisan.
  perform pg_advisory_xact_lock(hashtextextended('community_menu_import:' || v_family::text, 0));

  v_fp := md5(concat_ws('|', 'post-recipes', p_post::text, array_to_string(v_keys, ','), p_duplicate_recipes));
  delete from public.community_menu_imports x where x.family_id = v_family and x.expires_at < now();
  select * into v_log from public.community_menu_imports x where x.family_id = v_family and x.idempotency_key = v_key;
  if found then
    if v_log.fingerprint <> v_fp then
      raise exception 'KEY_REUSED' using errcode = 'P0001';
    end if;
    return v_log.result || jsonb_build_object('replayed', true);
  end if;

  select * into v_post from public.community_posts p where p.id = p_post and p.status = 'published' and p.recipes is not null;
  if not found or private.community_validate_post_recipes(v_post.recipes) is not null then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  -- En el orden en que están en la publicación (no en el que llegaron las claves).
  for v_variant in select value from jsonb_array_elements(v_post.recipes) where (value ->> 'key') = any (v_keys) loop
    v_clean := private.community_menu_clean_recipe(v_variant, null, (v_variant ->> 'servings')::numeric);
    v_norm := private.community_menu_norm(v_clean ->> 'title');
    v_recipe_id := null;
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
      v_listed := v_listed || jsonb_build_array(jsonb_build_object('id', v_recipe_id, 'key', v_variant ->> 'key', 'title', v_clean ->> 'title', 'created', true));
    else
      v_reused := v_reused + 1;
      v_listed := v_listed || jsonb_build_array(jsonb_build_object('id', v_recipe_id, 'key', v_variant ->> 'key', 'title', v_clean ->> 'title', 'created', false));
    end if;
  end loop;
  if jsonb_array_length(v_listed) <> cardinality(v_keys) then
    -- Alguna clave pedida no existe en la publicación: no se importa nada a medias (se deshace todo).
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  v_result := jsonb_build_object('ok', true, 'replayed', false, 'post_id', p_post, 'recipes', v_listed, 'recipes_created', v_created, 'recipes_reused', v_reused);
  insert into public.community_menu_imports (family_id, idempotency_key, fingerprint, profile_id, post_id, scope, target_start, servings, on_conflict, result)
  values (v_family, v_key, v_fp, v_uid, p_post, 'recipe', null, null, 'skip', v_result);
  return v_result;
end;
$$;
revoke all on function public.community_import_post_recipes(uuid, text[], text, text) from public, anon;
grant execute on function public.community_import_post_recipes(uuid, text[], text, text) to authenticated;
