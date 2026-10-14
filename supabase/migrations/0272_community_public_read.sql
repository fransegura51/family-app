-- COMUNIDAD PEPA — lectura PÚBLICA sin sesión (enlaces compartidos, vistas previas de WhatsApp, Google).
--
-- Reglas: los visitantes pueden LEER publicaciones y comentarios públicos, pero no interactuar. Solo se devuelve lo publicado y visible; todo lo oculto,
-- eliminado o restringido responde null (la página pública debe contestar 404/410 y NO indexarse). Nunca sale nada privado: ni nombre real, ni familia, ni
-- identificadores internos de personas (el visitante solo ve alias y avatar), ni quién ha dado me gusta o guardado, ni a quién bloquea nadie.
-- Hasta el lanzamiento (community_settings.launch_enabled = 1) NO se sirve nada público.

create or replace function public.community_public_get_post(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.community_posts%rowtype;
  a public.community_profiles%rowtype;
  v_photos jsonb;
  v_recipe jsonb;
begin
  if not private.community_launched() then
    return null;
  end if;
  select * into p from public.community_posts x where x.id = p_id and x.status = 'published';
  if not found then
    return null;
  end if;
  select * into a from public.community_profiles x where x.id = p.author_id;
  select coalesce(jsonb_agg(jsonb_build_object('path', ph.storage_path, 'position', ph.position) order by ph.position), '[]'::jsonb)
  into v_photos from public.community_post_photos ph where ph.post_id = p.id;
  if p.recipe_id is not null then
    select jsonb_build_object('title', r.title, 'servings', r.servings, 'ingredients', r.ingredients, 'steps', r.steps, 'tags', to_jsonb(r.tags), 'version', r.version,
      'avg_rating', (select round(avg(x.stars)::numeric, 2) from public.community_recipe_ratings x where x.recipe_id = r.id),
      'rating_count', (select count(*) from public.community_recipe_ratings x where x.recipe_id = r.id))
    into v_recipe from public.community_recipes r where r.id = p.recipe_id;
  end if;
  return jsonb_build_object(
    'id', p.id, 'kind', p.kind, 'section', p.section, 'topic_id', p.topic_id,
    'topic_label', (select t.label from public.community_topics t where t.id = p.topic_id),
    'title', p.title, 'body', p.body, 'excerpt', private.community_plain_excerpt(p.body),
    'author_alias', case when a.deleted_at is not null then 'Usuario eliminado' else a.alias end,
    'author_avatar', case when a.deleted_at is not null then null else a.avatar_emoji end,
    'author_is_official', a.is_official, 'author_deleted', a.deleted_at is not null,
    'is_official', p.is_official, 'official_label', p.official_label, 'article_sources', p.article_sources,
    'photos', v_photos, 'recipe', v_recipe,
    'like_count', p.like_count, 'comment_count', p.comment_count,
    'created_at', p.created_at, 'edited_at', p.edited_at, 'last_activity_at', p.last_activity_at);
end;
$$;

-- Comentarios públicos (raíces con sus respuestas). Los eliminados/ocultos no salen; si tienen respuestas queda un aviso neutro sin contenido.
create or replace function public.community_public_get_comments(p_post uuid, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if not private.community_launched() or not exists (select 1 from public.community_posts p where p.id = p_post and p.status = 'published') then
    return null;
  end if;
  return coalesce((
    select jsonb_agg(x.j order by x.created_at)
    from (
      select c.created_at,
        (case when c.status = 'published' then
           jsonb_build_object('id', c.id, 'body', c.body, 'photo_path', c.photo_path, 'created_at', c.created_at, 'edited_at', c.edited_at, 'like_count', c.like_count,
             'author_alias', case when a.deleted_at is not null then 'Usuario eliminado' else a.alias end,
             'author_avatar', case when a.deleted_at is not null then null else a.avatar_emoji end, 'author_is_official', a.is_official)
         else jsonb_build_object('id', c.id, 'removed', true, 'created_at', c.created_at) end)
        || jsonb_build_object('replies', coalesce((
             select jsonb_agg(jsonb_build_object('id', r.id, 'body', r.body, 'photo_path', r.photo_path, 'created_at', r.created_at, 'like_count', r.like_count,
               'author_alias', case when ra.deleted_at is not null then 'Usuario eliminado' else ra.alias end,
               'author_avatar', case when ra.deleted_at is not null then null else ra.avatar_emoji end, 'author_is_official', ra.is_official) order by r.created_at)
             from public.community_comments r join public.community_profiles ra on ra.id = r.author_id where r.parent_id = c.id and r.status = 'published'), '[]'::jsonb)) as j
      from public.community_comments c join public.community_profiles a on a.id = c.author_id
      where c.post_id = p_post and c.parent_id is null
        and (c.status = 'published' or exists (select 1 from public.community_comments r where r.parent_id = c.id and r.status = 'published'))
      order by c.created_at limit v_limit
    ) x
  ), '[]'::jsonb);
end;
$$;

-- Listado para el mapa del sitio y la portada pública (solo identificador, título y fecha).
create or replace function public.community_public_sitemap(p_limit integer default 1000, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.community_launched() then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'kind', p.kind, 'updated_at', coalesce(p.edited_at, p.created_at), 'last_activity_at', p.last_activity_at) order by p.created_at desc)
    from (select * from public.community_posts x where x.status = 'published' order by x.created_at desc
          limit least(greatest(coalesce(p_limit, 1000), 1), 5000) offset greatest(coalesce(p_offset, 0), 0)) p
  ), '[]'::jsonb);
end;
$$;

create or replace function public.community_public_recent(p_section text default null, p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.community_launched() then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'section', p.section,
      'topic_label', (select t.label from public.community_topics t where t.id = p.topic_id), 'title', p.title, 'excerpt', private.community_plain_excerpt(p.body),
      'author_alias', case when a.deleted_at is not null then 'Usuario eliminado' else a.alias end, 'created_at', p.created_at,
      'thumb_path', (select ph.storage_path from public.community_post_photos ph where ph.post_id = p.id order by ph.position limit 1)) order by p.created_at desc)
    from (select * from public.community_posts x where x.status = 'published' and (p_section is null or x.section = p_section) order by x.created_at desc
          limit least(greatest(coalesce(p_limit, 20), 1), 50)) p
    join public.community_profiles a on a.id = p.author_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.community_public_get_post(uuid) from public;
revoke all on function public.community_public_get_comments(uuid, integer) from public;
revoke all on function public.community_public_sitemap(integer, integer) from public;
revoke all on function public.community_public_recent(text, integer) from public;
grant execute on function public.community_public_get_post(uuid) to anon, authenticated;
grant execute on function public.community_public_get_comments(uuid, integer) to anon, authenticated;
grant execute on function public.community_public_sitemap(integer, integer) to anon, authenticated;
grant execute on function public.community_public_recent(text, integer) to anon, authenticated;
