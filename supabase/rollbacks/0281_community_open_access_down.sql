-- Deshacer 0281: vuelve a las funciones de antes (lectura pública e IA ligadas solo a `launch_enabled`) y quita los dos interruptores nuevos.
CREATE OR REPLACE FUNCTION public.community_public_get_post(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  p public.community_posts%rowtype;
  a public.community_profiles%rowtype;
  v_photos jsonb;
  v_recipe jsonb;
begin
  if not private.community_launched() then
    return null;
  end if;
  -- Lo que publican personas menores de edad NO tiene página pública (ni se indexa en buscadores): solo se lee dentro de la app.
  select * into p from public.community_posts x where x.id = p_id and x.status = 'published' and not x.ai_excluded;
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
$function$;

CREATE OR REPLACE FUNCTION public.community_public_get_comments(p_post uuid, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if not private.community_launched() or not exists (select 1 from public.community_posts p where p.id = p_post and p.status = 'published' and not p.ai_excluded) then
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
             from public.community_comments r join public.community_profiles ra on ra.id = r.author_id where r.parent_id = c.id and r.status = 'published' and not r.ai_excluded), '[]'::jsonb)) as j
      from public.community_comments c join public.community_profiles a on a.id = c.author_id
      where c.post_id = p_post and c.parent_id is null and not c.ai_excluded
        and (c.status = 'published' or exists (select 1 from public.community_comments r where r.parent_id = c.id and r.status = 'published' and not r.ai_excluded))
      order by c.created_at limit v_limit
    ) x
  ), '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.community_public_sitemap(p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.community_launched() then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'kind', p.kind, 'updated_at', coalesce(p.edited_at, p.created_at), 'last_activity_at', p.last_activity_at) order by p.created_at desc)
    from (select * from public.community_posts x where x.status = 'published' and not x.ai_excluded order by x.created_at desc
          limit least(greatest(coalesce(p_limit, 1000), 1), 5000) offset greatest(coalesce(p_offset, 0), 0)) p
  ), '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.community_public_get_poll(p_post uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  p public.community_polls%rowtype;
begin
  -- Como el resto de la lectura pública (0272): con Comunidad sin lanzar no se enseña nada a visitantes sin sesión.
  if not private.community_launched() then
    return null;
  end if;
  select pl.* into p from public.community_polls pl join public.community_posts po on po.id = pl.post_id where pl.post_id = p_post and po.status = 'published';
  if not found then
    return null;
  end if;
  if not (p.status = 'closed' or now() >= p.closes_at) then
    return jsonb_build_object('id', p.id, 'post_id', p.post_id, 'question', p.question, 'options', p.options, 'opens_at', p.opens_at, 'closes_at', p.closes_at,
                              'status', 'open', 'results_visible', false, 'final', false);
  end if;
  return private.community_poll_json(p, null);
end;
$function$;

CREATE OR REPLACE FUNCTION private.community_can_view_photo(p_path text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return private.community_launched() and private.community_photo_visible(p_path, true);
  end if;
  if private.community_is_admin() then
    return true;
  end if;
  if not private.community_launched() then
    return false;
  end if;
  if private.community_access_level(v_uid) = 'none' then
    return false;
  end if;
  return split_part(p_path, '/', 1) = coalesce(private.community_cp()::text, '-') or private.community_photo_visible(p_path);
end;
$function$;

CREATE OR REPLACE FUNCTION public.community_service_ai_allowed()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.community_launched()
     and (private.community_setting_int('ai_daily_cap', 300) = 0
          or coalesce((select sum(u.calls) from public.community_ai_usage u where u.day = (now() at time zone 'Europe/Madrid')::date), 0) < private.community_setting_int('ai_daily_cap', 300))
$function$;

CREATE OR REPLACE FUNCTION public.community_visitor_report(p_type text, p_id uuid, p_reason text, p_detail text DEFAULT NULL::text, p_contact text DEFAULT NULL::text, p_client_hash text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_detail text;
  v_contact text;
  v_hash text := left(nullif(btrim(coalesce(p_client_hash, '')), ''), 128);
  v_source text := case when (select auth.uid()) is null then 'visitor' else 'reader' end;
  v_published boolean := false;
  v_cap_hour integer;
  v_cap_day integer;
begin
  if p_type is null or p_type not in ('post', 'comment', 'review') or p_id is null
     or p_reason is null or p_reason not in ('spam', 'acoso', 'violencia', 'sexual', 'ilegal', 'datos_privados', 'enganoso', 'otro') then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  -- Antes del lanzamiento no hay nada público: la respuesta es la misma que para un contenido que no existe.
  if not private.community_launched() then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  -- Tope barato antes de limpiar el texto (un anónimo podría mandar textos enormes).
  if char_length(coalesce(p_detail, '')) > 4000 or char_length(coalesce(p_contact, '')) > 800 then
    raise exception 'TEXT_TOO_LONG' using errcode = 'P0001';
  end if;
  v_detail := nullif(private.community_clean_text(coalesce(p_detail, ''), 1000, false), '');
  v_contact := nullif(private.community_clean_text(coalesce(p_contact, ''), 200, false), '');

  if p_type = 'post' then
    v_published := exists (select 1 from public.community_posts p where p.id = p_id and p.status = 'published');
  elsif p_type = 'comment' then
    v_published := exists (select 1 from public.community_comments c join public.community_posts p on p.id = c.post_id
                           where c.id = p_id and c.status = 'published' and p.status = 'published');
  else
    v_published := exists (select 1 from public.community_recipe_ratings x join public.community_posts p on p.recipe_id = x.recipe_id and p.status = 'published'
                           where x.id = p_id and x.status = 'published' and nullif(btrim(coalesce(x.review, '')), '') is not null);
  end if;
  if not v_published then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  -- Los topes se comprueban dentro de un bloqueo para que dos avisos simultáneos no se los salten.
  perform pg_advisory_xact_lock(hashtext('community_visitor_report'));
  -- Misma huella + mismo contenido + mismo motivo en 24 h: ya está avisado (sin error).
  if v_hash is not null and exists (select 1 from public.community_visitor_reports v
       where v.client_hash = v_hash and v.target_type = p_type and v.target_id = p_id and v.reason = p_reason and v.created_at > now() - interval '24 hours') then
    return jsonb_build_object('ok', true, 'already_reported', true);
  end if;
  if v_hash is not null and (select count(*) from public.community_visitor_reports v where v.client_hash = v_hash and v.created_at > now() - interval '1 day') >= 5 then
    raise exception 'RATE_LIMIT' using errcode = 'P0001';
  end if;
  -- Ya hay 5 avisos abiertos sobre este contenido en el último día: la administración lo va a ver igualmente.
  if (select count(*) from public.community_visitor_reports v
      where v.target_type = p_type and v.target_id = p_id and v.status = 'open' and v.created_at > now() - interval '1 day') >= 5 then
    return jsonb_build_object('ok', true, 'already_reported', true);
  end if;
  -- Topes globales: frenan una avalancha aunque cambie de huella a cada aviso (la huella la manda el cliente y no es de fiar: con claves aleatorias se
  -- salta el tope por huella). Para que UNA sola fuente no agote todo el cupo y deje sin sitio a los avisos legítimos, el cupo se REPARTE por origen:
  --   · Anónimos (sin sesión): 40 por hora y 200 al día. De ellos, los que llegan SIN huella (llamada directa a la API, sin pasar por el Worker): 10 por hora
  --     y 50 al día.
  --   · Lectores con sesión (cuenta de PEPA sin alias o con permiso de solo lectura): 30 por hora y 150 al día, aparte de los anónimos.
  --   · Total (techo absoluto): 60 por hora y 300 al día. Como 40 < 60 y 200 < 300, quedan SIEMPRE 20 por hora y 100 al día reservados a lectores con sesión
  --     aunque los anónimos agoten su cupo.
  -- Pasado el tope no se guarda nada y la persona ve «vuelve a intentarlo más tarde»; la administración NO se satura. En Cloudflare se recomienda además un límite
  -- por IP sobre /c/report (ver DESPLIEGUE_Y_PRUEBAS.md), que es lo único que distingue de verdad a un atacante de otro.
  if (select count(*) from public.community_visitor_reports v where v.created_at > now() - interval '1 hour') >= 60
     or (select count(*) from public.community_visitor_reports v where v.created_at > now() - interval '1 day') >= 300 then
    raise exception 'RATE_LIMIT' using errcode = 'P0001';
  end if;
  -- (Los topes se calculan antes: un CASE con THEN dentro de la condición de un IF confunde al intérprete de PL/pgSQL.)
  v_cap_hour := case when v_source = 'reader' then 30 else 40 end;
  v_cap_day := case when v_source = 'reader' then 150 else 200 end;
  if (select count(*) from public.community_visitor_reports v where v.source = v_source and v.created_at > now() - interval '1 hour') >= v_cap_hour
     or (select count(*) from public.community_visitor_reports v where v.source = v_source and v.created_at > now() - interval '1 day') >= v_cap_day then
    raise exception 'RATE_LIMIT' using errcode = 'P0001';
  end if;
  if v_hash is null and v_source = 'visitor'
     and ((select count(*) from public.community_visitor_reports v where v.source = 'visitor' and v.client_hash is null and v.created_at > now() - interval '1 hour') >= 10
          or (select count(*) from public.community_visitor_reports v where v.source = 'visitor' and v.client_hash is null and v.created_at > now() - interval '1 day') >= 50) then
    raise exception 'RATE_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.community_visitor_reports (target_type, target_id, reason, detail, contact, source, client_hash)
  values (p_type, p_id, p_reason, v_detail, v_contact, v_source, v_hash);
  perform private.community_notify_admins('Aviso de un visitante en Comunidad', 'Un visitante ha avisado de un contenido. Revísalo en el Centro de Mando.', '/comunidad/admin',
    'visitor:' || p_type || ':' || p_id || ':' || to_char(now(), 'YYYY-MM-DD'));
  return jsonb_build_object('ok', true);
end;
$function$;

drop function if exists private.community_public_enabled();
delete from public.community_settings where key in ('public_read_enabled', 'ai_enabled');
