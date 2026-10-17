-- Perfil público: «can_interact» ya NO es falso para quien todavía no tiene alias.
--
-- Error real (17/10/2026, probado en un Android): en el perfil de Pepa no salía el botón «Seguir». `can_interact` se calculaba como «tengo perfil en Comunidad Y no hay bloqueo»:
-- una persona adulta que aún no ha elegido su alias (el alias se pide justo al primer «Seguir», «Publicar», comentar…) recibía `false` y la pantalla escondía el botón, así que
-- nunca llegaba a pedirse el alias. Ahora solo es falso si hay un BLOQUEO entre las dos personas; sin perfil propio se puede pulsar y el alias se pide en ese momento.
-- Deshacer: supabase/rollbacks/0285_community_profile_can_interact_down.sql.
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
    'can_interact', not (v_viewer is not null and private.community_blocked_either(v_viewer, cp.id))
  );
end;
$$;
