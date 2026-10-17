-- Deshacer 0284: vuelve a la regla de 0277 (15-17 con permisos de la familia), al seguimiento sin cuentas oficiales, a las etiquetas del menú al importar y quita las propuestas
-- de temas. Las propuestas ya enviadas se pierden (tabla borrada); los borradores editoriales ya creados se conservan en community_official_items.

drop function if exists public.community_admin_dismiss_topic_proposals(text);
drop function if exists public.community_admin_topic_proposals_to_draft(text, text);
drop function if exists public.community_admin_group_topic_proposals(uuid[], text);
drop function if exists public.community_admin_list_topic_proposals(text);
drop function if exists public.community_propose_topic(text, text);
drop table if exists public.community_topic_proposals;

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
  for v_tag in select value #>> '{}' from jsonb_array_elements(coalesce(p_recipe -> 'tags', '[]'::jsonb)) loop
    v_tag := left(btrim(lower(v_tag)), 30);
    if v_tag <> '' and not v_tag = any(v_tags) and coalesce(array_length(v_tags, 1), 0) < 12 then
      v_tags := v_tags || v_tag;
    end if;
  end loop;
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
    'tags', to_jsonb(v_tags),
    'servings', case when v_from is null then null else p_target end,
    'ingredients', v_ings);
end;
$$;

create or replace function private.community_followed_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if new.status <> 'published' or new.is_official then
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
    'following', v_viewer is not null and exists (select 1 from public.community_user_follows f where f.follower_id = v_viewer and f.followed_id = cp.id),
    'is_me', v_viewer is not null and v_viewer = cp.id,
    'can_interact', v_viewer is not null and not private.community_blocked_either(v_viewer, cp.id)
  );
end;
$$;
-- La versión anterior de community_list_following era SQL puro (sin comprobación de acceso y sin la marca de cuenta oficial).
drop function if exists public.community_list_following();
create or replace function public.community_list_following()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', cp.id, 'alias', case when cp.deleted_at is not null then 'Usuario eliminado' else cp.alias end,
                                              'avatar_emoji', cp.avatar_emoji, 'notify_mode', f.notify_mode) order by f.created_at desc), '[]'::jsonb)
  from public.community_user_follows f join public.community_profiles cp on cp.id = f.followed_id
  where f.follower_id = private.community_cp() and cp.deleted_at is null
$$;
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
  if p_cp = v_cp or private.community_blocked_either(v_cp, p_cp)
     or not exists (select 1 from public.community_profiles x where x.id = p_cp and x.deleted_at is null and not x.is_official) then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  insert into public.community_user_follows (follower_id, followed_id, notify_mode) values (v_cp, p_cp, p_mode)
  on conflict (follower_id, followed_id) do update set notify_mode = excluded.notify_mode;
end;
$$;

create or replace function private.community_access_level(p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_age integer;
  v_perm public.community_minor_permissions%rowtype;
begin
  select pr.role into v_role from public.profiles pr where pr.id = p_user;
  if v_role is null then
    return 'none';
  end if;
  v_age := private.community_age_years(p_user);
  if v_age is null then
    -- Sin fecha de nacimiento: titulares (admin/adult) como adultos, salvo que su ficha sea de niño/bebé; el resto, sin acceso hasta tener fecha.
    if v_role in ('admin', 'adult')
       and not exists (select 1 from public.family_members fm where fm.linked_profile_id = p_user and fm.member_type in ('child', 'baby')) then
      return 'participate';
    end if;
    return 'none';
  end if;
  if v_age >= 18 then
    return 'participate';
  end if;
  if v_age < 15 then
    return 'none';
  end if;
  select * into v_perm from public.community_minor_permissions m where m.profile_id = p_user;
  if not found or not v_perm.can_read then
    return 'none';
  end if;
  return case when v_perm.can_participate then 'participate' else 'read' end;
end;
$$;
create or replace function private.community_access_reason(p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_level text := private.community_access_level(p_user);
  v_age integer := private.community_age_years(p_user);
begin
  if v_level = 'participate' then
    return null;
  elsif v_level = 'read' then
    return 'read_only';
  elsif v_age is null then
    return 'age_unknown';
  elsif v_age < 15 then
    return 'under_15';
  end if;
  return 'not_authorized';
end;
$$;
create or replace function private.community_user_is_adult(p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_age integer := private.community_age_years(p_user);
  v_role text;
begin
  if v_age is not null then
    return v_age >= 18;
  end if;
  select pr.role into v_role from public.profiles pr where pr.id = p_user;
  return coalesce(v_role, 'guest') in ('admin', 'adult')
         and not exists (select 1 from public.family_members fm where fm.linked_profile_id = p_user and fm.member_type in ('child', 'baby'));
end;
$$;
create or replace function public.community_list_minor_permissions()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_family uuid := private.community_family_admin();
begin
  return coalesce((
    select jsonb_agg(x.item order by x.name)
    from (
      select coalesce(fm.name, pr.display_name) as name,
             jsonb_build_object(
               'profile_id', pr.id,
               'name', coalesce(fm.name, pr.display_name),
               'age', private.community_age_years(pr.id),
               'status', case when private.community_age_years(pr.id) is null then 'needs_birthdate'
                              when private.community_age_years(pr.id) < 15 then 'under_15'
                              else 'configurable' end,
               'can_read', coalesce(m.can_read, false),
               'can_participate', coalesce(m.can_participate, false),
               'updated_at', m.updated_at) as item
      from public.profiles pr
      left join public.family_members fm on fm.linked_profile_id = pr.id
      left join public.community_minor_permissions m on m.profile_id = pr.id
      where pr.family_id = v_family and pr.id <> (select auth.uid())
        and (private.community_age_years(pr.id) < 18
             or (private.community_age_years(pr.id) is null
                 and (pr.role in ('child', 'guest') or fm.member_type in ('child', 'baby'))))
    ) x
  ), '[]'::jsonb);
end;
$$;

create or replace function public.community_set_minor_permission(p_profile uuid, p_can_read boolean, p_can_participate boolean, p_guardian_declared boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid := private.community_family_admin();
  v_age integer;
  v_read boolean := coalesce(p_can_read, false);
  v_part boolean := coalesce(p_can_participate, false);
  v_prev public.community_minor_permissions%rowtype;
begin
  if p_profile is null or p_profile = (select auth.uid())
     or not exists (select 1 from public.profiles pr where pr.id = p_profile and pr.family_id = v_family) then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  v_age := private.community_age_years(p_profile);
  if v_age is null or v_age < 15 or v_age >= 18 then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  -- Participar exige poder leer.
  if v_part then
    v_read := true;
  end if;
  -- Al ACTIVAR un permiso (leer o participar) quien autoriza declara que es madre, padre o tutor legal de esa persona (la autorización de la administración
  -- familiar no sustituye por sí sola a la de quien ejerce la patria potestad). Quitar permisos no exige declaración.
  select * into v_prev from public.community_minor_permissions m where m.profile_id = p_profile;
  if ((v_read and not coalesce(v_prev.can_read, false)) or (v_part and not coalesce(v_prev.can_participate, false))) and not coalesce(p_guardian_declared, false) then
    raise exception 'GUARDIAN_DECLARATION_REQUIRED' using errcode = 'P0001';
  end if;
  insert into public.community_minor_permissions (profile_id, can_read, can_participate, updated_by, updated_at)
  values (p_profile, v_read, v_part, (select auth.uid()), now())
  on conflict (profile_id) do update set can_read = excluded.can_read, can_participate = excluded.can_participate, updated_by = excluded.updated_by, updated_at = now();
  insert into public.community_minor_permission_log (profile_id, actor_id, can_read, can_participate, guardian_declared)
  values (p_profile, (select auth.uid()), v_read, v_part, coalesce(p_guardian_declared, false));
  return jsonb_build_object('profile_id', p_profile, 'can_read', v_read, 'can_participate', v_part);
end;
$$;

revoke all on function public.community_list_minor_permissions() from public, anon;
revoke all on function public.community_set_minor_permission(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.community_list_minor_permissions() to authenticated;
grant execute on function public.community_set_minor_permission(uuid, boolean, boolean, boolean) to authenticated;
revoke all on function public.community_list_following() from public, anon;
grant execute on function public.community_list_following() to authenticated;
