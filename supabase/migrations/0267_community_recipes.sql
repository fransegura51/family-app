-- COMUNIDAD PEPA — recetas: valoraciones, importación a la Cocina privada de otra familia y actualización voluntaria.
--
-- Reglas: publicar una receta crea una copia PÚBLICA independiente (0265, con el consentimiento explícito de quien publica en la pantalla); importarla crea
-- en la familia que importa una copia editable PROPIA (la crea la app con el código de Cocina de siempre) y aquí solo se registra que esa familia la importó,
-- sin dar jamás acceso a la receta privada original ni a datos de ninguna familia. Cambiar la receta pública no toca las copias ya importadas: la familia ve
-- «hay una versión nueva», compara y actualiza si quiere.

alter table public.community_recipe_imports add column private_recipe_id uuid references public.recipes(id) on delete set null;

-- Valorar con estrellas y reseña (una valoración por persona y receta; se puede cambiar).
create or replace function public.community_rate_recipe(p_recipe uuid, p_stars integer, p_review text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_require_participant();
  v_author uuid;
  v_review text := nullif(private.community_clean_text(coalesce(p_review, ''), 1000, false), '');
begin
  if p_stars is null or p_stars not between 1 and 5 then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  select p.author_id into v_author from public.community_posts p where p.recipe_id = p_recipe and p.status = 'published';
  -- Nadie valora su propia receta (inflaría su media); tampoco si la bloqueó o lo bloqueó.
  if v_author is null or v_author = v_cp or private.community_blocked_either(v_cp, v_author) then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  insert into public.community_recipe_ratings (recipe_id, profile_id, stars, review) values (p_recipe, v_cp, p_stars, v_review)
  on conflict (recipe_id, profile_id) do update set stars = excluded.stars, review = excluded.review, updated_at = now();
  return jsonb_build_object(
    'avg_rating', (select round(avg(r.stars)::numeric, 2) from public.community_recipe_ratings r where r.recipe_id = p_recipe),
    'rating_count', (select count(*) from public.community_recipe_ratings r where r.recipe_id = p_recipe));
end;
$$;

create or replace function public.community_list_recipe_reviews(p_recipe uuid, p_limit integer default 20, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := private.community_cp();
begin
  perform private.community_require_reader();
  if not exists (select 1 from public.community_posts p where p.recipe_id = p_recipe and p.status = 'published') then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(case
        when v_viewer is not null and exists (select 1 from public.community_blocks b where b.blocker_id = v_viewer and b.blocked_id = r.profile_id)
          then jsonb_build_object('author_id', r.profile_id, 'blocked_by_me', true)
        else jsonb_build_object('id', r.id, 'author_id', r.profile_id, 'author_alias', case when cp.deleted_at is not null then 'Usuario eliminado' else cp.alias end,
                                'author_avatar', cp.avatar_emoji, 'stars', r.stars, 'review', r.review, 'created_at', r.created_at, 'mine', v_viewer = r.profile_id)
      end order by r.updated_at desc)
    -- Una reseña ocultada por la administración no sale (su voto de estrellas sigue contando en la media de la receta).
    from (select * from public.community_recipe_ratings x where x.recipe_id = p_recipe and x.status = 'published' order by x.updated_at desc
          limit least(greatest(coalesce(p_limit, 20), 1), 50) offset greatest(coalesce(p_offset, 0), 0)) r
    join public.community_profiles cp on cp.id = r.profile_id
  ), '[]'::jsonb);
end;
$$;

-- La app ya creó la copia privada en la Cocina de la familia (con el código de siempre); aquí se registra la importación: UNA por familia y receta
-- (así se cuentan familias distintas y no repeticiones) y se guarda cuál es SU copia para poder avisar de versiones nuevas.
create or replace function public.community_record_import(p_recipe uuid, p_private_recipe uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_profile public.profiles%rowtype;
  v_version integer;
begin
  perform private.community_require_participation_access();
  select * into v_profile from public.profiles p where p.id = (select auth.uid());
  if not found then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  v_family := v_profile.family_id;
  -- La copia debe ser de ESTA familia (no se puede registrar la receta privada de otra).
  if not exists (select 1 from public.recipes r where r.id = p_private_recipe and r.family_id = v_family) then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  select r.version into v_version from public.community_recipes r join public.community_posts p on p.recipe_id = r.id
  where r.id = p_recipe and p.status = 'published';
  if v_version is null then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  insert into public.community_recipe_imports (recipe_id, family_id, imported_by, imported_version, private_recipe_id)
  values (p_recipe, v_family, v_profile.id, v_version, p_private_recipe)
  on conflict (recipe_id, family_id) do update
    set private_recipe_id = excluded.private_recipe_id, imported_version = excluded.imported_version, imported_at = now(), imported_by = excluded.imported_by;
  return jsonb_build_object('imported_version', v_version,
    'import_count', (select count(*) from public.community_recipe_imports i where i.recipe_id = p_recipe));
end;
$$;

-- ¿La receta pública que importó mi familia tiene una versión nueva? Devuelve las dos versiones para que la app las compare.
create or replace function public.community_get_recipe_update(p_private_recipe uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  i public.community_recipe_imports%rowtype;
  v_current public.community_recipes%rowtype;
  v_status text;
begin
  perform private.community_require_reader();
  select pr.family_id into v_family from public.profiles pr where pr.id = (select auth.uid());
  if v_family is null then
    return null;
  end if;
  select * into i from public.community_recipe_imports x where x.private_recipe_id = p_private_recipe and x.family_id = v_family;
  if not found then
    return null;
  end if;
  select p.status into v_status from public.community_posts p where p.recipe_id = i.recipe_id;
  select * into v_current from public.community_recipes r where r.id = i.recipe_id;
  if v_status is distinct from 'published' then
    return jsonb_build_object('has_update', false, 'available', false);
  end if;
  return jsonb_build_object(
    'available', true,
    'has_update', v_current.version > i.imported_version,
    'imported_version', i.imported_version,
    'current_version', v_current.version,
    'imported', (select v.snapshot from public.community_recipe_versions v where v.recipe_id = i.recipe_id and v.version = i.imported_version),
    'current', (select v.snapshot from public.community_recipe_versions v where v.recipe_id = i.recipe_id and v.version = v_current.version),
    'post_id', (select p.id from public.community_posts p where p.recipe_id = i.recipe_id));
end;
$$;

-- La familia ha decidido actualizar (la app ya cambió su copia privada): se anota la versión.
create or replace function public.community_mark_recipe_updated(p_private_recipe uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
begin
  perform private.community_require_participation_access();
  select pr.family_id into v_family from public.profiles pr where pr.id = (select auth.uid());
  update public.community_recipe_imports i
  set imported_version = (select r.version from public.community_recipes r where r.id = i.recipe_id), imported_at = now()
  where i.private_recipe_id = p_private_recipe and i.family_id = v_family;
end;
$$;

revoke all on function public.community_rate_recipe(uuid, integer, text) from public, anon;
revoke all on function public.community_list_recipe_reviews(uuid, integer, integer) from public, anon;
revoke all on function public.community_record_import(uuid, uuid) from public, anon;
revoke all on function public.community_get_recipe_update(uuid) from public, anon;
revoke all on function public.community_mark_recipe_updated(uuid) from public, anon;
grant execute on function public.community_rate_recipe(uuid, integer, text) to authenticated;
grant execute on function public.community_list_recipe_reviews(uuid, integer, integer) to authenticated;
grant execute on function public.community_record_import(uuid, uuid) to authenticated;
grant execute on function public.community_get_recipe_update(uuid) to authenticated;
grant execute on function public.community_mark_recipe_updated(uuid) to authenticated;
