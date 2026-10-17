-- Deshacer 0282: quita la importación de recetas de publicaciones y vuelve a las versiones de antes del detalle y de la publicación de contenido oficial.
drop function if exists public.community_import_post_recipes(uuid, text[], text, text);
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
  v_author := case when i.kind in ('tip', 'menu') then '00000000-0000-4000-8000-0000000000a2'::uuid else '00000000-0000-4000-8000-0000000000a1'::uuid end;
  v_label := case i.kind when 'tip' then 'Consejo de Pepa' when 'menu' then 'Menú semanal de Pepa' when 'poll' then 'Encuesta de Equipo PEPA' else 'Artículo de Equipo PEPA' end;
  v_kind := case i.kind when 'tip' then 'consejo' when 'menu' then 'menu' when 'poll' then 'encuesta' else 'articulo' end;
  insert into public.community_posts (id, author_id, kind, section, topic_id, title, body, is_official, official_label, official_item_id, article_sources, menu)
  values (v_post, v_author, v_kind, i.section, i.topic_id, i.title, i.body, true, v_label, i.id, case when i.kind = 'article' then i.payload end, v_menu);
  update public.community_official_items set status = 'published', published_post_id = v_post, publish_error = null where id = i.id;
  if i.kind = 'poll' then
    update public.community_polls set post_id = v_post, status = case when now() >= opens_at then 'open' else status end where item_id = i.id;
  end if;
  return v_post;
end;
$function$;
drop function if exists private.community_validate_post_recipes(jsonb);
alter table public.community_posts drop column if exists recipes;
