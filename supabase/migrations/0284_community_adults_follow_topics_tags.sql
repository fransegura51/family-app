-- COMUNIDAD PEPA — decisiones de cierre (17/10/2026): solo personas adultas, seguir a Pepa y a otras personas, importaciones sin etiquetas automáticas y propuestas de temas.
--
-- 1) SOLO PERSONAS DE 18 AÑOS O MÁS. Sustituye la regla de 0277 (15-17 con permisos de la familia): ahora quien no tenga 18 años cumplidos NO accede a nada de Comunidad
--    (leer, publicar, comentar, seguir…). La edad sale de la fecha de nacimiento de la ficha de familia enlazada a la cuenta (family_members.birth_date); SIN fecha fiable no
--    hay acceso (antes los titulares admin/adulto entraban sin fecha). Todas las funciones de lectura/escritura pasan por private.community_access_level, así que el servidor lo
--    aplica en cada llamada. Se retiran las funciones de permisos parentales (la tabla de permisos y su registro se conservan, sin uso, como historial).
-- 2) SEGUIR a Pepa y a otras personas. Se permite seguir las cuentas oficiales (Pepa, Equipo PEPA); el perfil público devuelve el NÚMERO de seguidores y nada más (quién sigue a
--    quién nunca sale: la tabla no se puede leer y ninguna función devuelve seguidores); seguir no avisa a la persona seguida. Quien sigue a una cuenta en modo «cada
--    publicación» recibe aviso también de sus publicaciones OFICIALES. «Mis seguidos»: community_list_following (ahora también con la marca de cuenta oficial).
-- 3) IMPORTAR sin etiquetas automáticas: private.community_menu_clean_recipe ya no devuelve etiquetas (los ingredientes y los datos de la ficha del menú NO se convierten en
--    etiquetas de Recetas). Las etiquetas manuales de las personas no se tocan.
-- 4) PROPÓN UN TEMA: community_topic_proposals (privada) + funciones para proponer (personas adultas) y para revisar/agrupar/convertir en borrador editorial (administración).
--    NADA se publica solo: un tema convertido en borrador entra en las propuestas oficiales (community_official_items, estado «proposed») y sigue necesitando la aprobación
--    humana de siempre.
-- Deshacer: supabase/rollbacks/0284_community_adults_follow_topics_tags_down.sql.

-- ---------------------------------------------------------------------------------------------
-- 1) Solo adultos
-- ---------------------------------------------------------------------------------------------
create or replace function private.community_access_level(p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_age integer;
begin
  if not exists (select 1 from public.profiles pr where pr.id = p_user) then
    return 'none';
  end if;
  v_age := private.community_age_years(p_user);
  -- Sin fecha de nacimiento fiable (null) o con menos de 18 años: sin acceso.
  if v_age is not null and v_age >= 18 then
    return 'participate';
  end if;
  return 'none';
end;
$$;
revoke execute on function private.community_access_level(uuid) from public, anon, authenticated;

-- Motivo por el que no hay acceso (para explicarlo en pantalla): 'under_18' | 'age_unknown' | null.
create or replace function private.community_access_reason(p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_age integer := private.community_age_years(p_user);
begin
  if v_age is null then
    return 'age_unknown';
  elsif v_age < 18 then
    return 'under_18';
  end if;
  return null;
end;
$$;
revoke execute on function private.community_access_reason(uuid) from public, anon, authenticated;

-- ¿Es adulta (edad conocida >= 18)? Para la IA, las páginas públicas y las fotos. Sin edad = no.
create or replace function private.community_user_is_adult(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.community_age_years(p_user) >= 18, false)
$$;
revoke execute on function private.community_user_is_adult(uuid) from public, anon, authenticated;

drop function if exists public.community_list_minor_permissions();
drop function if exists public.community_set_minor_permission(uuid, boolean, boolean, boolean);

-- ---------------------------------------------------------------------------------------------
-- 2) Seguir a Pepa y a otras personas
-- ---------------------------------------------------------------------------------------------
create or replace function public.community_follow_user(p_cp uuid, p_mode text default 'smart')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_require_participant();
begin
  if p_mode not in ('smart', 'every', 'off') then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  -- Se puede seguir a cualquier persona o cuenta oficial (Pepa, Equipo PEPA) que exista y no esté bloqueada en ningún sentido; a una misma no. No se avisa a la seguida.
  if p_cp = v_cp or private.community_blocked_either(v_cp, p_cp)
     or not exists (select 1 from public.community_profiles x where x.id = p_cp and x.deleted_at is null) then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  insert into public.community_user_follows (follower_id, followed_id, notify_mode) values (v_cp, p_cp, p_mode)
  on conflict (follower_id, followed_id) do update set notify_mode = excluded.notify_mode;
end;
$$;

create or replace function public.community_list_following()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.community_require_reader();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', cp.id, 'alias', case when cp.deleted_at is not null then 'Usuario eliminado' else cp.alias end,
                                        'avatar_emoji', cp.avatar_emoji, 'is_official', cp.is_official, 'notify_mode', f.notify_mode) order by f.created_at desc)
    from public.community_user_follows f join public.community_profiles cp on cp.id = f.followed_id
    where f.follower_id = private.community_cp() and cp.deleted_at is null
  ), '[]'::jsonb);
end;
$$;

-- Perfil público: añade el NÚMERO de seguidores (nunca quiénes son).
create or replace function public.community_get_public_profile(p_cp uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := private.community_cp();
  cp public.community_profiles%rowtype;
begin
  perform private.community_require_reader();
  select * into cp from public.community_profiles x where x.id = p_cp;
  if not found or cp.deleted_at is not null then
    return null;
  end if;
  if v_viewer is not null and exists (select 1 from public.community_blocks b where b.blocker_id = v_viewer and b.blocked_id = p_cp) then
    return jsonb_build_object('id', cp.id, 'blocked_by_me', true);
  end if;
  return jsonb_build_object(
    'id', cp.id,
    'alias', cp.alias,
    'avatar_emoji', cp.avatar_emoji,
    'is_official', cp.is_official,
    'member_since', cp.created_at,
    'post_count', (select count(*) from public.community_posts p where p.author_id = cp.id and p.status = 'published' and p.kind <> 'receta'),
    'recipe_count', (select count(*) from public.community_posts p where p.author_id = cp.id and p.status = 'published' and p.kind = 'receta'),
    'rating_count', (select count(*) from public.community_recipe_ratings r where r.profile_id = cp.id),
    'follower_count', (select count(*) from public.community_user_follows f where f.followed_id = cp.id),
    'following', v_viewer is not null and exists (select 1 from public.community_user_follows f where f.follower_id = v_viewer and f.followed_id = cp.id),
    'is_me', v_viewer is not null and v_viewer = cp.id,
    'can_interact', v_viewer is not null and not private.community_blocked_either(v_viewer, cp.id)
  );
end;
$$;

-- Aviso «cada publicación»: ahora también de las publicaciones oficiales de las cuentas seguidas (Pepa, Equipo PEPA).
create or replace function private.community_followed_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if new.status <> 'published' then
    return null;
  end if;
  for r in select f.follower_id, cp.user_id from public.community_user_follows f join public.community_profiles cp on cp.id = f.follower_id
           where f.followed_id = new.author_id and f.notify_mode = 'every' and cp.user_id is not null and private.community_access_level(cp.user_id) <> 'none'
             and not exists (select 1 from public.community_blocks b where b.blocker_id = new.author_id and b.blocked_id = f.follower_id) loop
    perform private.notify_user(r.user_id, 'other', 'community_followed_post',
      (select cp2.alias from public.community_profiles cp2 where cp2.id = new.author_id) || ' ha publicado', new.title, '/comunidad/p/' || new.id, null, 'follow-every:' || new.id, true);
  end loop;
  return null;
end;
$$;
revoke execute on function private.community_followed_post() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3) Importar recetas sin crear etiquetas automáticas
-- ---------------------------------------------------------------------------------------------
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
  v_simple boolean := coalesce(p_recipe ->> 'simple', 'false') = 'true';
  v_steps_text text;
  v_time text;
  v_tip text;
  v_freeze text;
  v_note text;
  v_a numeric;
  v_b numeric;
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
  for v_step in select value #>> '{}' from jsonb_array_elements(case when jsonb_typeof(p_recipe -> 'steps') = 'array' then p_recipe -> 'steps' else '[]'::jsonb end) loop
    v_step := btrim(regexp_replace(btrim(regexp_replace(v_step, '\s*\n\s*', ' ', 'g')), '^\d+[.)]\s*', ''));
    if v_step <> '' then
      v_steps := v_steps || left(v_step, 2000);
    end if;
  end loop;
  -- Los INGREDIENTES (y los datos de la ficha del menú: día, comida, tipo de plato…) NO se convierten en etiquetas: las etiquetas de Recetas son solo las que pone la persona.

  v_steps_text := (select string_agg(i::text || '. ' || s, E'\n' order by i) from unnest(v_steps) with ordinality as t(s, i));
  -- Tiempo de trabajo y tiempo total (solo si el dato es válido: enteros, total >= trabajo activo).
  if jsonb_typeof(p_recipe -> 'time') = 'object' and jsonb_typeof(p_recipe -> 'time' -> 'active') = 'number' and jsonb_typeof(p_recipe -> 'time' -> 'total') = 'number' then
    v_a := round((p_recipe -> 'time' ->> 'active')::numeric);
    v_b := round((p_recipe -> 'time' ->> 'total')::numeric);
    if v_a between 1 and 600 and v_b between 1 and 1440 and v_b >= v_a then
      v_time := 'Tiempo de trabajo: ' || v_a::bigint || ' min · Tiempo total: ' || v_b::bigint || ' min';
    end if;
  end if;
  -- Truco de Pepa.
  if jsonb_typeof(p_recipe -> 'tip') = 'string' then
    v_tip := left(btrim(regexp_replace(p_recipe ->> 'tip', '\s+', ' ', 'g')), 400);
    v_tip := case when v_tip = '' then null else 'Truco de Pepa: ' || v_tip end;
  end if;
  -- Congelación: solo si la receta se marca como ideal.
  if jsonb_typeof(p_recipe -> 'freeze') = 'object' and p_recipe -> 'freeze' -> 'ideal' = 'true'::jsonb then
    v_note := case when jsonb_typeof(p_recipe -> 'freeze' -> 'note') = 'string' then left(btrim(regexp_replace(p_recipe -> 'freeze' ->> 'note', '\s+', ' ', 'g')), 300) else '' end;
    v_freeze := '❄️ Ideal para cocinar de más y congelar.' || case when v_note <> '' then ' ' || v_note else '' end;
  end if;
  return jsonb_build_object(
    'title', left(btrim(p_recipe ->> 'title'), 140),
    'simple', v_simple,
    'notes', nullif(concat_ws(E'\n\n', nullif(v_time, ''), nullif(v_steps_text, ''), nullif(v_tip, ''), nullif(v_freeze, '')), ''),
    'tags', '[]'::jsonb,
    'servings', case when v_from is null then null else p_target end,
    'ingredients', v_ings);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 4) Propón un tema
-- ---------------------------------------------------------------------------------------------
create table public.community_topic_proposals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.community_profiles(id) on delete cascade,
  topic_id text not null references public.community_topics(id),
  text text not null check (char_length(btrim(text)) between 8 and 200),
  -- Texto normalizado (sin tildes ni mayúsculas): las propuestas iguales caen en el mismo grupo. La administración puede juntar a mano otras parecidas (group_key distinto).
  norm_key text not null,
  group_key text not null,
  group_label text,
  status text not null default 'new' check (status in ('new', 'drafted', 'dismissed')),
  created_at timestamptz not null default now(),
  handled_by uuid,
  handled_at timestamptz,
  item_id uuid references public.community_official_items(id) on delete set null
);
create index idx_community_topic_proposals_group on public.community_topic_proposals (group_key);
create index idx_community_topic_proposals_profile on public.community_topic_proposals (profile_id, created_at desc);
alter table public.community_topic_proposals enable row level security;
revoke all on public.community_topic_proposals from anon, authenticated;

-- Proponer un tema (personas adultas con alias): categoría + texto corto. Máximo 5 al día; repetir la misma propuesta no la duplica.
create or replace function public.community_propose_topic(p_topic text, p_text text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid;
  v_text text;
  v_norm text;
  v_id uuid;
begin
  perform private.community_require_reader();
  perform private.community_require_participation_access();
  v_cp := private.community_require_participant();
  if not exists (select 1 from public.community_topics t where t.id = p_topic) then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  v_text := private.community_clean_text(p_text, 200, true);
  if char_length(v_text) < 8 then
    raise exception 'TEXT_REQUIRED' using errcode = 'P0001';
  end if;
  v_norm := regexp_replace(private.community_menu_norm(v_text), '[^a-z0-9 ]', '', 'g');
  v_norm := btrim(regexp_replace(v_norm, '\s+', ' ', 'g'));
  select id into v_id from public.community_topic_proposals x where x.profile_id = v_cp and x.norm_key = v_norm and x.status = 'new';
  if v_id is not null then
    return v_id;
  end if;
  if (select count(*) from public.community_topic_proposals x where x.profile_id = v_cp and x.created_at > now() - interval '1 day') >= 5 then
    raise exception 'RATE_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.community_topic_proposals (profile_id, topic_id, text, norm_key, group_key)
  values (v_cp, p_topic, v_text, v_norm, v_norm)
  returning id into v_id;
  return v_id;
end;
$$;

-- Administración: propuestas agrupadas (los temas más pedidos primero). NO se enseña quién propone: solo cuántas personas distintas.
create or replace function public.community_admin_list_topic_proposals(p_status text default 'new')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  if p_status not in ('new', 'drafted', 'dismissed') then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(g.item order by g.people desc, g.last_at desc)
    from (
      select count(distinct x.profile_id) as people, max(x.created_at) as last_at,
             jsonb_build_object(
               'group_key', x.group_key,
               'label', coalesce(max(x.group_label), (array_agg(x.text order by x.created_at))[1]),
               'topic_id', (array_agg(x.topic_id order by x.created_at))[1],
               'topic_label', (select t.label from public.community_topics t where t.id = (array_agg(x.topic_id order by x.created_at))[1]),
               'people', count(distinct x.profile_id),
               'proposals', count(*),
               'first_at', min(x.created_at),
               'last_at', max(x.created_at),
               'texts', (select coalesce(jsonb_agg(d.text), '[]'::jsonb) from (select distinct y.text from public.community_topic_proposals y where y.group_key = x.group_key and y.status = p_status limit 6) d),
               'ids', jsonb_agg(x.id),
               'item_id', max(x.item_id::text)) as item
      from public.community_topic_proposals x
      where x.status = p_status
      group by x.group_key
      order by count(distinct x.profile_id) desc, max(x.created_at) desc
      limit 200
    ) g
  ), '[]'::jsonb);
end;
$$;

-- Juntar a mano propuestas parecidas en un mismo grupo (con un nombre). Solo propuestas nuevas.
create or replace function public.community_admin_group_topic_proposals(p_ids uuid[], p_label text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_n integer;
begin
  perform private.community_require_admin();
  if p_ids is null or cardinality(p_ids) < 2 then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  v_key := 'm:' || (select min(x.id::text) from public.community_topic_proposals x where x.id = any (p_ids) and x.status = 'new');
  if v_key is null or v_key = 'm:' then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  update public.community_topic_proposals set group_key = v_key, group_label = nullif(left(btrim(coalesce(p_label, '')), 140), '')
  where id = any (p_ids) and status = 'new';
  get diagnostics v_n = row_count;
  perform private.community_log('topic_proposals_grouped', 'topic_proposal', null, null, jsonb_build_object('count', v_n));
  return v_n;
end;
$$;

-- Convertir un grupo en BORRADOR editorial: entra en las propuestas oficiales (estado «proposed») para que la administración lo redacte, añada fuentes y lo apruebe como
-- cualquier otro artículo. No se publica nada.
create or replace function public.community_admin_topic_proposals_to_draft(p_group_key text, p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_topic text;
  v_section text;
  v_title text := left(btrim(coalesce(p_title, '')), 140);
  v_people integer;
  v_texts text;
  v_item uuid;
begin
  perform private.community_require_admin();
  if char_length(v_title) < 3 then
    raise exception 'TEXT_REQUIRED' using errcode = 'P0001';
  end if;
  select (array_agg(x.topic_id order by x.created_at))[1], count(distinct x.profile_id) into v_topic, v_people
  from public.community_topic_proposals x where x.group_key = p_group_key and x.status = 'new';
  if v_topic is null then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  select t.section into v_section from public.community_topics t where t.id = v_topic;
  select string_agg('- ' || d.text, E'\n') into v_texts from (select distinct y.text from public.community_topic_proposals y where y.group_key = p_group_key and y.status = 'new' limit 10) d;
  insert into public.community_official_items (kind, section, topic_id, title, body, payload, batch_week, status, proposed_by)
  values ('article', v_section, v_topic, v_title,
          'BORRADOR a partir de un tema propuesto por ' || v_people || (case when v_people = 1 then ' familia' else ' familias' end) || E':\n' || coalesce(v_texts, ''),
          '{}'::jsonb, date_trunc('week', now())::date, 'proposed', 'Temas propuestos por las familias')
  returning id into v_item;
  update public.community_topic_proposals set status = 'drafted', handled_by = (select auth.uid()), handled_at = now(), item_id = v_item
  where group_key = p_group_key and status = 'new';
  perform private.community_log('topic_proposals_drafted', 'official_item', v_item, v_title);
  return v_item;
end;
$$;

create or replace function public.community_admin_dismiss_topic_proposals(p_group_key text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  perform private.community_require_admin();
  update public.community_topic_proposals set status = 'dismissed', handled_by = (select auth.uid()), handled_at = now() where group_key = p_group_key and status = 'new';
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  perform private.community_log('topic_proposals_dismissed', 'topic_proposal', null, p_group_key);
  return v_n;
end;
$$;

revoke all on function public.community_follow_user(uuid, text) from public, anon;
revoke all on function public.community_list_following() from public, anon;
revoke all on function public.community_get_public_profile(uuid) from public, anon;
revoke all on function public.community_propose_topic(text, text) from public, anon;
revoke all on function public.community_admin_list_topic_proposals(text) from public, anon;
revoke all on function public.community_admin_group_topic_proposals(uuid[], text) from public, anon;
revoke all on function public.community_admin_topic_proposals_to_draft(text, text) from public, anon;
revoke all on function public.community_admin_dismiss_topic_proposals(text) from public, anon;
grant execute on function public.community_follow_user(uuid, text) to authenticated;
grant execute on function public.community_list_following() to authenticated;
grant execute on function public.community_get_public_profile(uuid) to authenticated;
grant execute on function public.community_propose_topic(text, text) to authenticated;
grant execute on function public.community_admin_list_topic_proposals(text) to authenticated;
grant execute on function public.community_admin_group_topic_proposals(uuid[], text) to authenticated;
grant execute on function public.community_admin_topic_proposals_to_draft(text, text) to authenticated;
grant execute on function public.community_admin_dismiss_topic_proposals(text) to authenticated;
