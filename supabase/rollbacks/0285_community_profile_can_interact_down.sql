-- Deshacer 0285: vuelve a la versión de 0284 (can_interact falso sin alias).
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
