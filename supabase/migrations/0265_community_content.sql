-- COMUNIDAD PEPA — funciones de acceso (alias, publicaciones, listados y detalle). Todas SECURITY DEFINER con search_path vacío: son la ÚNICA puerta a las tablas
-- de Comunidad (0264), y aplican aquí las reglas: alias y reglas aceptadas para participar, expulsiones, bloqueos, límites de uso y qué se enseña.
--
-- Errores: se lanzan como excepciones con un CÓDIGO en el mensaje (ALIAS_REQUIRED, BANNED, RATE_LIMIT, NOT_AVAILABLE…) que la app traduce a frases claras.
-- Lo que ve cada persona:
--   · Una publicación oculta o eliminada NO se devuelve a nadie (salvo un aviso mínimo a su autor) y no es accesible por enlace público.
--   · Si la persona ha bloqueado al autor, recibe solo una «capa neutra» (sin título, texto ni fotos reales) con el id para poder desbloquear.
--   · Si el autor la ha bloqueado a ella, ve la publicación (es pública) pero las funciones de interacción responden NOT_AVAILABLE, sin explicar el motivo.

-- ---------------------------------------------------------------------------------------------
-- Ayudas internas.
-- ---------------------------------------------------------------------------------------------
create or replace function private.community_setting_int(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (s.value #>> '{}')::integer from public.community_settings s where s.key = p_key), p_default)
$$;
revoke execute on function private.community_setting_int(text, integer) from public, anon, authenticated;

-- Perfil público de quien llama (o null si aún no tiene alias).
create or replace function private.community_cp()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cp.id from public.community_profiles cp where cp.user_id = (select auth.uid()) and cp.deleted_at is null
$$;
revoke execute on function private.community_cp() from public, anon, authenticated;

-- Administradores de Comunidad = los dos dueños de la app (profiles.is_app_owner); permisos idénticos, sin jerarquía.
create or replace function private.community_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_app_owner)
$$;
revoke execute on function private.community_is_admin() from public, anon, authenticated;

-- 'ok' | 'banned' (expulsión en curso) | 'readmission' (plazo cumplido: falta pedir/obtener la readmisión).
create or replace function private.community_ban_state(p_cp uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case when now() < b.ends_at then 'banned' else 'readmission' end
    from public.community_bans b
    where b.profile_id = p_cp and b.lifted_at is null and b.readmission_status <> 'approved'
    order by b.starts_at desc
    limit 1
  ), 'ok')
$$;
revoke execute on function private.community_ban_state(uuid) from public, anon, authenticated;

-- Para participar: sesión, alias con reglas aceptadas y no estar expulsado. Devuelve el id del perfil público.
create or replace function private.community_require_participant()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cp uuid;
  v_accepted timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  select cp.id, cp.rules_accepted_at into v_cp, v_accepted from public.community_profiles cp where cp.user_id = (select auth.uid()) and cp.deleted_at is null;
  if v_cp is null or v_accepted is null then
    raise exception 'ALIAS_REQUIRED' using errcode = 'P0001';
  end if;
  if private.community_ban_state(v_cp) <> 'ok' then
    raise exception 'BANNED' using errcode = 'P0001';
  end if;
  return v_cp;
end;
$$;
revoke execute on function private.community_require_participant() from public, anon, authenticated;

-- ¿Hay un bloqueo en cualquier sentido entre a y b?
create or replace function private.community_blocked_either(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.community_blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a)
  )
$$;
revoke execute on function private.community_blocked_either(uuid, uuid) from public, anon, authenticated;

-- Texto de publicación/comentario: sin caracteres de control, longitud, sin código ejecutable, enlaces solo http(s), sin direcciones IP, sin dominios
-- bloqueados y con tope de enlaces. Devuelve el texto limpio.
create table public.community_blocked_domains (
  domain text primary key check (domain = lower(domain)),
  reason text,
  created_at timestamptz not null default now()
);
alter table public.community_blocked_domains enable row level security;
revoke all on public.community_blocked_domains from anon, authenticated;

create or replace function private.community_clean_text(p_text text, p_max integer, p_required boolean default true)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_text text;
  v_url text;
  v_host text;
  v_links integer := 0;
begin
  v_text := regexp_replace(coalesce(p_text, ''), '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g');
  v_text := btrim(replace(v_text, E'\r\n', E'\n'));
  if p_required and char_length(v_text) = 0 then
    raise exception 'TEXT_REQUIRED' using errcode = 'P0001';
  end if;
  if char_length(v_text) > p_max then
    raise exception 'TEXT_TOO_LONG' using errcode = 'P0001';
  end if;
  -- Código ejecutable o marcado peligroso.
  if v_text ~* '<\s*(script|iframe|object|embed|style|link|meta|form)\y' or v_text ~* 'javascript\s*:' or v_text ~* 'data\s*:\s*text/html'
     or v_text ~* '\yon[a-z]{3,}\s*=\s*["'']' then
    raise exception 'UNSAFE_CONTENT' using errcode = 'P0001';
  end if;
  for v_url in select (regexp_matches(v_text, '(?:https?|ftp|file)://[^\s)>\]]+', 'gi'))[1] loop
    v_links := v_links + 1;
    if v_url !~* '^https?://' then
      raise exception 'UNSAFE_LINK' using errcode = 'P0001';
    end if;
    v_host := lower(substring(v_url from '^https?://([^/:?#]+)'));
    if v_host is null or v_host ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' or v_host !~ '\.' then
      raise exception 'UNSAFE_LINK' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.community_blocked_domains d where v_host = d.domain or v_host like '%.' || d.domain) then
      raise exception 'BLOCKED_LINK' using errcode = 'P0001';
    end if;
  end loop;
  if v_links > private.community_setting_int('max_links_per_post', 10) then
    raise exception 'TOO_MANY_LINKS' using errcode = 'P0001';
  end if;
  return v_text;
end;
$$;
revoke execute on function private.community_clean_text(text, integer, boolean) from public, anon, authenticated;

-- Fotos de una publicación o comentario: solo de la carpeta de la propia persona y que existan de verdad en el almacenamiento.
create or replace function private.community_check_photo_paths(p_cp uuid, p_paths text[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  if coalesce(cardinality(p_paths), 0) > private.community_setting_int('max_photos_per_post', 5) then
    raise exception 'TOO_MANY_PHOTOS' using errcode = 'P0001';
  end if;
  foreach v_path in array coalesce(p_paths, '{}') loop
    if v_path is null or split_part(v_path, '/', 1) <> p_cp::text or v_path ~ '\.\.' or char_length(v_path) > 200 then
      raise exception 'BAD_PHOTO' using errcode = 'P0001';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'community-media' and o.name = v_path) then
      raise exception 'BAD_PHOTO' using errcode = 'P0001';
    end if;
  end loop;
  if (select count(distinct x) from unnest(coalesce(p_paths, '{}')) x) <> coalesce(cardinality(p_paths), 0) then
    raise exception 'BAD_PHOTO' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function private.community_check_photo_paths(uuid, text[]) from public, anon, authenticated;

-- Encola el borrado físico de fotos que ya no se usan.
create or replace function private.community_queue_media_deletion(p_paths text[])
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.community_media_deletions (path)
  select distinct x from unnest(coalesce(p_paths, '{}')) x where x is not null
$$;
revoke execute on function private.community_queue_media_deletion(text[]) from public, anon, authenticated;

create or replace function private.community_plain_excerpt(p_body text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(btrim(regexp_replace(regexp_replace(coalesce(p_body, ''), '\[([^\]]*)\]\([^)]*\)', '\1', 'g'), '[*_`#>]+', '', 'g')), 240)
$$;
revoke execute on function private.community_plain_excerpt(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Alias y perfil propio.
-- ---------------------------------------------------------------------------------------------
create or replace function public.community_get_my_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cp record;
  v_state text;
  v_ban record;
begin
  if (select auth.uid()) is null then
    return null;
  end if;
  select * into cp from public.community_profiles p where p.user_id = (select auth.uid()) and p.deleted_at is null;
  if not found then
    return jsonb_build_object('has_profile', false);
  end if;
  v_state := private.community_ban_state(cp.id);
  select * into v_ban from public.community_bans b where b.profile_id = cp.id and b.lifted_at is null and b.readmission_status <> 'approved' order by b.starts_at desc limit 1;
  return jsonb_build_object(
    'has_profile', true,
    'id', cp.id,
    'alias', cp.alias,
    'avatar_emoji', cp.avatar_emoji,
    'rules_accepted', cp.rules_accepted_at is not null,
    'ban_state', v_state,
    'ban_ends_at', case when v_state = 'banned' then v_ban.ends_at end,
    'readmission_status', case when v_state <> 'ok' then v_ban.readmission_status end,
    'is_admin', private.community_is_admin()
  );
end;
$$;

create or replace function public.community_set_alias(p_alias text, p_avatar_emoji text default null, p_accept_rules boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alias text := btrim(coalesce(p_alias, ''));
  v_emoji text := nullif(btrim(coalesce(p_avatar_emoji, '')), '');
  v_existing public.community_profiles%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  -- Mismas puertas que para participar (interruptor de lanzamiento y solo adultos; ver 0271): ni siquiera se crea el alias si no se puede participar.
  if not private.community_launched() and not private.community_is_admin() then
    raise exception 'NOT_LAUNCHED' using errcode = 'P0001';
  end if;
  if private.community_setting_int('participants_adults_only', 1) = 1
     and not exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.role in ('admin', 'adult')) then
    raise exception 'ADULT_REQUIRED' using errcode = 'P0001';
  end if;
  if v_alias !~ '^[A-Za-zÀ-ÿ0-9_. -]{3,24}$' then
    raise exception 'ALIAS_INVALID' using errcode = 'P0001';
  end if;
  -- Nada que suplante a Pepa, al equipo o a la administración.
  if lower(v_alias) ~ '(pepa|equipo|admin|moderad|soporte|oficial)' then
    raise exception 'ALIAS_RESERVED' using errcode = 'P0001';
  end if;
  select * into v_existing from public.community_profiles p where p.user_id = (select auth.uid());
  if not found then
    if not p_accept_rules then
      raise exception 'RULES_REQUIRED' using errcode = 'P0001';
    end if;
    begin
      insert into public.community_profiles (user_id, alias, avatar_emoji, rules_accepted_at, alias_changed_at)
      values ((select auth.uid()), v_alias, v_emoji, now(), now())
      returning * into v_existing;
    exception when unique_violation then
      raise exception 'ALIAS_TAKEN' using errcode = 'P0001';
    end;
  else
    if v_existing.deleted_at is not null then
      raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
    end if;
    if v_existing.rules_accepted_at is null and not p_accept_rules then
      raise exception 'RULES_REQUIRED' using errcode = 'P0001';
    end if;
    begin
      update public.community_profiles
      set alias = v_alias, avatar_emoji = v_emoji,
          rules_accepted_at = coalesce(rules_accepted_at, case when p_accept_rules then now() end),
          alias_changed_at = case when alias is distinct from v_alias then now() else alias_changed_at end
      where id = v_existing.id
      returning * into v_existing;
    exception when unique_violation then
      raise exception 'ALIAS_TAKEN' using errcode = 'P0001';
    end;
  end if;
  return public.community_get_my_profile();
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Catálogo de temas (lo puede leer cualquiera, también quien aún no tiene cuenta).
-- ---------------------------------------------------------------------------------------------
create or replace function public.community_list_topics()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'section', t.section, 'label', t.label) order by t.section desc, t.sort_order), '[]'::jsonb)
  from public.community_topics t
$$;

-- ---------------------------------------------------------------------------------------------
-- Crear, editar y borrar publicaciones.
-- ---------------------------------------------------------------------------------------------
create or replace function private.community_rate_check(p_cp uuid, p_kind text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_kind = 'post' and (select count(*) from public.community_posts x where x.author_id = p_cp and x.created_at > now() - interval '1 hour')
     >= private.community_setting_int('rate_posts_per_hour', 10) then
    raise exception 'RATE_LIMIT' using errcode = 'P0001';
  end if;
  if p_kind = 'comment' and (select count(*) from public.community_comments x where x.author_id = p_cp and x.created_at > now() - interval '10 minutes')
     >= private.community_setting_int('rate_comments_per_10min', 30) then
    raise exception 'RATE_LIMIT' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function private.community_rate_check(uuid, text) from public, anon, authenticated;

-- Valida y normaliza la receta pública (copia independiente: nunca lleva el id de la receta privada).
create or replace function private.community_clean_recipe(p_recipe jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ing jsonb;
  v_item jsonb;
  v_clean jsonb := '[]'::jsonb;
  v_steps text;
  v_tags text[];
begin
  if p_recipe is null or jsonb_typeof(p_recipe) <> 'object' then
    raise exception 'RECIPE_REQUIRED' using errcode = 'P0001';
  end if;
  v_ing := coalesce(p_recipe -> 'ingredients', '[]'::jsonb);
  if jsonb_typeof(v_ing) <> 'array' or jsonb_array_length(v_ing) = 0 or jsonb_array_length(v_ing) > 80 then
    raise exception 'RECIPE_INGREDIENTS' using errcode = 'P0001';
  end if;
  for v_item in select * from jsonb_array_elements(v_ing) loop
    if jsonb_typeof(v_item) <> 'object' or char_length(btrim(coalesce(v_item ->> 'name', ''))) = 0 or char_length(v_item ->> 'name') > 120 then
      raise exception 'RECIPE_INGREDIENTS' using errcode = 'P0001';
    end if;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object(
      'name', btrim(v_item ->> 'name'),
      'quantity', left(btrim(coalesce(v_item ->> 'quantity', '')), 30),
      'unit', left(btrim(coalesce(v_item ->> 'unit', '')), 30)
    ));
  end loop;
  v_steps := private.community_clean_text(coalesce(p_recipe ->> 'steps', ''), 10000, false);
  select coalesce(array_agg(distinct left(lower(btrim(t)), 30)) filter (where btrim(t) <> ''), '{}')
  into v_tags from jsonb_array_elements_text(coalesce(p_recipe -> 'tags', '[]'::jsonb)) t;
  return jsonb_build_object(
    'servings', case when (p_recipe ->> 'servings') ~ '^[0-9]{1,3}(\.[0-9])?$' then (p_recipe ->> 'servings')::numeric else null end,
    'ingredients', v_clean,
    'steps', v_steps,
    'tags', to_jsonb(v_tags[1:12])
  );
end;
$$;
revoke execute on function private.community_clean_recipe(jsonb) from public, anon, authenticated;

create or replace function public.community_create_post(
  p_kind text,
  p_section text,
  p_topic text,
  p_title text,
  p_body text,
  p_photos text[] default '{}',
  p_recipe jsonb default null,
  p_from_draft uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_require_participant();
  v_title text;
  v_body text;
  v_id uuid := gen_random_uuid();
  v_recipe_id uuid;
  v_recipe jsonb;
  v_i integer;
begin
  if p_kind not in ('receta', 'pregunta', 'consejo', 'anecdota') or p_section not in ('recetas', 'hogar') then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  if p_kind = 'receta' and p_section <> 'recetas' then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  perform private.community_rate_check(v_cp, 'post');
  v_title := private.community_clean_text(p_title, 140);
  if char_length(v_title) < 3 then
    raise exception 'TEXT_REQUIRED' using errcode = 'P0001';
  end if;
  v_body := private.community_clean_text(p_body, 10000, p_kind <> 'receta');
  perform private.community_check_photo_paths(v_cp, p_photos);

  if p_kind = 'receta' then
    v_recipe := private.community_clean_recipe(p_recipe);
    insert into public.community_recipes (author_id, title, servings, ingredients, steps, tags, photo_path)
    values (v_cp, v_title, (v_recipe ->> 'servings')::numeric, v_recipe -> 'ingredients', v_recipe ->> 'steps',
            coalesce(array(select jsonb_array_elements_text(v_recipe -> 'tags')), '{}'), p_photos[1])
    returning id into v_recipe_id;
    insert into public.community_recipe_versions (recipe_id, version, snapshot)
    values (v_recipe_id, 1, jsonb_build_object('title', v_title) || v_recipe);
  end if;

  insert into public.community_posts (id, author_id, kind, section, topic_id, title, body, recipe_id)
  values (v_id, v_cp, p_kind, p_section, p_topic, v_title, v_body, v_recipe_id);

  for v_i in 1 .. coalesce(cardinality(p_photos), 0) loop
    insert into public.community_post_photos (post_id, storage_path, position) values (v_id, p_photos[v_i], v_i);
  end loop;

  if p_from_draft is not null then
    delete from public.community_drafts d where d.id = p_from_draft and d.profile_id = v_cp;
  end if;
  return v_id;
end;
$$;

create or replace function public.community_update_post(
  p_id uuid,
  p_topic text,
  p_title text,
  p_body text,
  p_photos text[] default '{}',
  p_recipe jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_require_participant();
  v_post public.community_posts%rowtype;
  v_title text;
  v_body text;
  v_old text[];
  v_recipe jsonb;
  v_version integer;
  v_i integer;
begin
  select * into v_post from public.community_posts p where p.id = p_id for update;
  if not found or v_post.author_id <> v_cp or v_post.status = 'deleted' then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  v_title := private.community_clean_text(p_title, 140);
  if char_length(v_title) < 3 then
    raise exception 'TEXT_REQUIRED' using errcode = 'P0001';
  end if;
  v_body := private.community_clean_text(p_body, 10000, v_post.kind <> 'receta');
  perform private.community_check_photo_paths(v_cp, p_photos);

  select coalesce(array_agg(storage_path), '{}') into v_old from public.community_post_photos where post_id = p_id;
  delete from public.community_post_photos where post_id = p_id;
  for v_i in 1 .. coalesce(cardinality(p_photos), 0) loop
    insert into public.community_post_photos (post_id, storage_path, position) values (p_id, p_photos[v_i], v_i);
  end loop;
  perform private.community_queue_media_deletion(array(select x from unnest(v_old) x where not (x = any (coalesce(p_photos, '{}')))));

  if v_post.kind = 'receta' then
    v_recipe := private.community_clean_recipe(p_recipe);
    update public.community_recipes
    set title = v_title, servings = (v_recipe ->> 'servings')::numeric, ingredients = v_recipe -> 'ingredients', steps = v_recipe ->> 'steps',
        tags = coalesce(array(select jsonb_array_elements_text(v_recipe -> 'tags')), '{}'), photo_path = p_photos[1],
        version = version + 1, updated_at = now()
    where id = v_post.recipe_id
    returning version into v_version;
    insert into public.community_recipe_versions (recipe_id, version, snapshot)
    values (v_post.recipe_id, v_version, jsonb_build_object('title', v_title) || v_recipe);
  end if;

  -- El tema solo puede cambiar dentro de la misma sección.
  update public.community_posts set topic_id = p_topic, title = v_title, body = v_body, edited_at = now() where id = p_id;
end;
$$;

create or replace function public.community_delete_post(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_cp();
  v_post public.community_posts%rowtype;
  v_paths text[];
begin
  if v_cp is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  select * into v_post from public.community_posts p where p.id = p_id for update;
  if not found or v_post.author_id <> v_cp then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(storage_path), '{}') into v_paths from public.community_post_photos where post_id = p_id;
  perform private.community_queue_media_deletion(v_paths);
  delete from public.community_post_photos where post_id = p_id;
  update public.community_posts set status = 'deleted', title = 'Publicación eliminada', body = '', hidden_reason = null where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Tarjeta de publicación (listados): jsonb con lo mínimo que enseña una tarjeta. Aplica los bloqueos.
-- ---------------------------------------------------------------------------------------------
create or replace function private.community_card(p public.community_posts, p_viewer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.community_profiles%rowtype;
  v_blocked_by_me boolean := false;
  v_blocked_me boolean := false;
  v_thumb text;
  v_rating numeric;
  v_rating_n integer := 0;
  v_imports integer := 0;
begin
  select * into a from public.community_profiles x where x.id = p.author_id;
  if p_viewer is not null then
    v_blocked_by_me := exists (select 1 from public.community_blocks b where b.blocker_id = p_viewer and b.blocked_id = p.author_id);
    v_blocked_me := exists (select 1 from public.community_blocks b where b.blocker_id = p.author_id and b.blocked_id = p_viewer);
  end if;
  -- Capa neutra: el contenido real NO sale del servidor.
  if v_blocked_by_me then
    return jsonb_build_object('id', p.id, 'blocked_by_me', true, 'author_id', p.author_id);
  end if;
  select ph.storage_path into v_thumb from public.community_post_photos ph where ph.post_id = p.id order by ph.position limit 1;
  if p.recipe_id is not null then
    select round(avg(r.stars)::numeric, 2), count(*)::integer into v_rating, v_rating_n from public.community_recipe_ratings r where r.recipe_id = p.recipe_id;
    select count(*)::integer into v_imports from public.community_recipe_imports i where i.recipe_id = p.recipe_id;
  end if;
  return jsonb_build_object(
    'id', p.id,
    'kind', p.kind,
    'section', p.section,
    'topic_id', p.topic_id,
    'topic_label', (select t.label from public.community_topics t where t.id = p.topic_id),
    'title', p.title,
    'excerpt', private.community_plain_excerpt(p.body),
    'author_id', p.author_id,
    'author_alias', case when a.deleted_at is not null then 'Usuario eliminado' else a.alias end,
    'author_avatar', case when a.deleted_at is not null then null else a.avatar_emoji end,
    'author_is_official', a.is_official,
    'author_deleted', a.deleted_at is not null,
    'is_official', p.is_official,
    'official_label', p.official_label,
    'featured', p.featured_at is not null and p.featured_removed_at is null,
    'thumb_path', v_thumb,
    'like_count', p.like_count,
    'comment_count', p.comment_count,
    'save_count', p.save_count,
    'avg_rating', v_rating,
    'rating_count', v_rating_n,
    'import_count', v_imports,
    'created_at', p.created_at,
    'edited_at', p.edited_at,
    'last_activity_at', p.last_activity_at,
    'unanswered', p.kind = 'pregunta' and not exists (
      select 1 from public.community_comments c join public.community_profiles ca on ca.id = c.author_id
      where c.post_id = p.id and c.status = 'published' and c.author_id <> p.author_id and not ca.is_official),
    'liked_by_me', p_viewer is not null and exists (select 1 from public.community_post_likes l where l.post_id = p.id and l.profile_id = p_viewer),
    'saved_by_me', p_viewer is not null and exists (select 1 from public.community_saves s where s.post_id = p.id and s.profile_id = p_viewer),
    'can_interact', not v_blocked_me
  );
end;
$$;
revoke execute on function private.community_card(public.community_posts, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Listados. Orden: recientes (por defecto), comentados, valoradas (recetas), sin_respuesta (preguntas sin respuesta HUMANA), para_mi.
-- ---------------------------------------------------------------------------------------------
create or replace function public.community_list_posts(
  p_section text default null,
  p_topic text default null,
  p_kind text default null,
  p_order text default 'recientes',
  p_limit integer default 20,
  p_offset integer default 0,
  p_query text default null,
  p_author uuid default null,
  p_saved boolean default false,
  p_following boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := private.community_cp();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_tsq tsquery;
  v_result jsonb;
begin
  if p_order not in ('recientes', 'comentados', 'valoradas', 'sin_respuesta', 'para_mi') then
    p_order := 'recientes';
  end if;
  if p_query is not null and btrim(p_query) <> '' then
    v_tsq := websearch_to_tsquery('spanish'::regconfig, p_query);
  end if;

  select coalesce(jsonb_agg(private.community_card(q.p, v_viewer) order by q.rn), '[]'::jsonb) into v_result
  from (
    select p, row_number() over (order by
        case p_order
          when 'comentados' then p.comment_count::numeric
          when 'valoradas' then coalesce((select (sum(r.stars) + 4.0 * 3) / (count(*) + 3) from public.community_recipe_ratings r where r.recipe_id = p.recipe_id), 0)
          when 'para_mi' then
            -- Algoritmo técnico: seguidos y temas favoritos suben; lo ya abierto baja; algo de calidad; la novedad manda.
            (case when v_viewer is not null and exists (select 1 from public.community_user_follows f where f.follower_id = v_viewer and f.followed_id = p.author_id and f.notify_mode <> 'off') then 5 else 0 end)
            + (case when v_viewer is not null and exists (select 1 from public.community_favorite_topics ft where ft.profile_id = v_viewer and ft.topic_id = p.topic_id) then 3 else 0 end)
            + least(ln(1 + p.like_count + p.comment_count * 2 + p.save_count), 4)
            - (case when v_viewer is not null and exists (select 1 from public.community_post_visits v where v.profile_id = v_viewer and v.post_id = p.id) then 6 else 0 end)
            - extract(epoch from (now() - p.created_at)) / 86400.0 * 0.5
          else 0 end desc,
        case when p_order = 'recientes' or p_order = 'sin_respuesta' then p.created_at end desc,
        p.created_at desc, p.id) as rn
    from public.community_posts p
    where p.status = 'published'
      and (p_section is null or p.section = p_section)
      and (p_topic is null or p.topic_id = p_topic)
      and (p_kind is null or p.kind = p_kind)
      and (p_author is null or p.author_id = p_author)
      and (v_tsq is null or p.search @@ v_tsq)
      and (not p_saved or (v_viewer is not null and exists (select 1 from public.community_saves s where s.post_id = p.id and s.profile_id = v_viewer)))
      and (not p_following or (v_viewer is not null and exists (select 1 from public.community_user_follows f where f.follower_id = v_viewer and f.followed_id = p.author_id)))
      and (p_order <> 'valoradas' or p.kind = 'receta')
      and (p_order <> 'sin_respuesta' or (p.kind = 'pregunta' and not exists (
            select 1 from public.community_comments c join public.community_profiles ca on ca.id = c.author_id
            where c.post_id = p.id and c.status = 'published' and c.author_id <> p.author_id and not ca.is_official)))
    order by rn
    limit v_limit offset v_offset
  ) q;
  return v_result;
end;
$$;

-- Tres publicaciones parecidas (sin impedir publicar ni obligar a leerlas).
create or replace function public.community_similar_posts(p_title text, p_kind text default null, p_section text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := private.community_cp();
  v_tsq tsquery;
begin
  if p_title is null or char_length(btrim(p_title)) < 4 then
    return '[]'::jsonb;
  end if;
  v_tsq := websearch_to_tsquery('spanish'::regconfig, p_title);
  if v_tsq is null or numnode(v_tsq) = 0 then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(private.community_card(q.p, v_viewer) order by q.score desc)
    from (
      select p, ts_rank(p.search, v_tsq) as score
      from public.community_posts p
      where p.status = 'published' and p.search @@ v_tsq
        and (p_kind is null or p.kind = p_kind or p_kind = 'receta')
        and (p_section is null or p.section = p_section)
      order by score desc, p.created_at desc
      limit 3
    ) q
  ), '[]'::jsonb);
end;
$$;

-- Autocompletado sobre resultados REALES (títulos publicados y temas).
create or replace function public.community_search_suggest(p_prefix text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_prefix text := btrim(coalesce(p_prefix, ''));
  v_like text;
begin
  if char_length(v_prefix) < 2 then
    return '[]'::jsonb;
  end if;
  v_like := '%' || replace(replace(lower(v_prefix), '%', ''), '_', '') || '%';
  return coalesce((
    select jsonb_agg(x.item order by x.rank, x.label)
    from (
      select * from (
        select 0 as rank, t.label as label, jsonb_build_object('type', 'topic', 'id', t.id, 'section', t.section, 'label', t.label) as item
        from public.community_topics t where lower(t.label) like v_like
        union all
        select 1 as rank, p.title, jsonb_build_object('type', 'post', 'id', p.id, 'label', p.title, 'kind', p.kind)
        from public.community_posts p where p.status = 'published' and lower(p.title) like v_like
        order by 1, 2
        limit 8
      ) s
    ) x
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Detalle de una publicación (para quien tiene sesión). Registra la visita (para «Para mí»).
-- ---------------------------------------------------------------------------------------------
create table public.community_favorite_topics (
  profile_id uuid not null references public.community_profiles(id) on delete cascade,
  topic_id text not null references public.community_topics(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, topic_id)
);
alter table public.community_favorite_topics enable row level security;
revoke all on public.community_favorite_topics from anon, authenticated;

create table public.community_post_visits (
  profile_id uuid not null references public.community_profiles(id) on delete cascade,
  post_id uuid not null references public.community_posts(id) on delete cascade,
  last_visit_at timestamptz not null default now(),
  primary key (profile_id, post_id)
);
alter table public.community_post_visits enable row level security;
revoke all on public.community_post_visits from anon, authenticated;

create or replace function private.community_post_detail(p public.community_posts, p_viewer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_card jsonb := private.community_card(p, p_viewer);
  v_photos jsonb;
  v_recipe jsonb;
  v_me_rating integer;
  v_me_review text;
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
      select r.stars, r.review into v_me_rating, v_me_review from public.community_recipe_ratings r where r.recipe_id = p.recipe_id and r.profile_id = p_viewer;
      select pr.family_id into v_family from public.profiles pr where pr.id = (select auth.uid());
      v_imported := v_family is not null and exists (select 1 from public.community_recipe_imports i where i.recipe_id = p.recipe_id and i.family_id = v_family);
    end if;
    select jsonb_build_object(
      'id', r.id, 'title', r.title, 'servings', r.servings, 'ingredients', r.ingredients, 'steps', r.steps, 'tags', to_jsonb(r.tags),
      'version', r.version, 'updated_at', r.updated_at, 'my_rating', v_me_rating, 'my_review', v_me_review, 'imported_by_my_family', v_imported)
    into v_recipe from public.community_recipes r where r.id = p.recipe_id;
  end if;
  return v_card || jsonb_build_object(
    'body', p.body,
    'photos', v_photos,
    'recipe', v_recipe,
    'article_sources', p.article_sources,
    'is_mine', p_viewer is not null and p.author_id = p_viewer,
    'following_conversation', p_viewer is not null and exists (select 1 from public.community_conversation_follows f where f.post_id = p.id and f.profile_id = p_viewer),
    'following_author', p_viewer is not null and exists (select 1 from public.community_user_follows f where f.follower_id = p_viewer and f.followed_id = p.author_id)
  );
end;
$$;
revoke execute on function private.community_post_detail(public.community_posts, uuid) from public, anon, authenticated;

create or replace function public.community_get_post(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := private.community_cp();
  p public.community_posts%rowtype;
begin
  select * into p from public.community_posts x where x.id = p_id;
  if not found or p.status = 'deleted' then
    return null;
  end if;
  if p.status = 'hidden' then
    -- Su autor ve un aviso mínimo (sin contenido); los demás, nada.
    if v_viewer is not null and v_viewer = p.author_id then
      return jsonb_build_object('id', p.id, 'status', 'hidden', 'is_mine', true, 'title', p.title);
    end if;
    return null;
  end if;
  if v_viewer is not null then
    insert into public.community_post_visits (profile_id, post_id) values (v_viewer, p.id)
    on conflict (profile_id, post_id) do update set last_visit_at = now();
  end if;
  return private.community_post_detail(p, v_viewer);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Permisos: las funciones públicas las puede llamar quien tenga sesión; el catálogo de temas y la lectura de una publicación también los visitantes (más
-- adelante, 0272, se añade la lectura pública sin sesión con su propia función).
-- ---------------------------------------------------------------------------------------------
revoke all on function public.community_get_my_profile() from public, anon;
revoke all on function public.community_set_alias(text, text, boolean) from public, anon;
revoke all on function public.community_list_topics() from public;
revoke all on function public.community_create_post(text, text, text, text, text, text[], jsonb, uuid) from public, anon;
revoke all on function public.community_update_post(uuid, text, text, text, text[], jsonb) from public, anon;
revoke all on function public.community_delete_post(uuid) from public, anon;
revoke all on function public.community_list_posts(text, text, text, text, integer, integer, text, uuid, boolean, boolean) from public, anon;
revoke all on function public.community_similar_posts(text, text, text) from public, anon;
revoke all on function public.community_search_suggest(text) from public, anon;
revoke all on function public.community_get_post(uuid) from public, anon;
grant execute on function public.community_get_my_profile() to authenticated;
grant execute on function public.community_set_alias(text, text, boolean) to authenticated;
grant execute on function public.community_list_topics() to anon, authenticated;
grant execute on function public.community_create_post(text, text, text, text, text, text[], jsonb, uuid) to authenticated;
grant execute on function public.community_update_post(uuid, text, text, text, text[], jsonb) to authenticated;
grant execute on function public.community_delete_post(uuid) to authenticated;
grant execute on function public.community_list_posts(text, text, text, text, integer, integer, text, uuid, boolean, boolean) to authenticated;
grant execute on function public.community_similar_posts(text, text, text) to authenticated;
grant execute on function public.community_search_suggest(text) to authenticated;
grant execute on function public.community_get_post(uuid) to authenticated;
