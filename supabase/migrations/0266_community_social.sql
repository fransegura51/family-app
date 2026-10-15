-- COMUNIDAD PEPA — comentarios, reacciones, guardados, seguimientos, bloqueos, temas favoritos, borradores, búsquedas recientes, progreso de lectura y perfil público.
-- Misma regla que 0265: todo pasa por funciones SECURITY DEFINER; nada de las tablas es accesible directamente.

-- ---------------------------------------------------------------------------------------------
-- Contadores de las publicaciones (se mantienen con disparadores; las listas no cuentan filas en cada consulta).
-- ---------------------------------------------------------------------------------------------
create or replace function private.community_counters_comments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post uuid := coalesce(new.post_id, old.post_id);
begin
  update public.community_posts p
  set comment_count = (select count(*) from public.community_comments c where c.post_id = v_post and c.status = 'published'),
      last_activity_at = case when tg_op = 'INSERT' then now() else p.last_activity_at end
  where p.id = v_post;
  return null;
end;
$$;
revoke execute on function private.community_counters_comments() from public, anon, authenticated;
create trigger community_comments_counters after insert or update of status or delete on public.community_comments
  for each row execute function private.community_counters_comments();

create or replace function private.community_counters_post_likes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.community_posts p
  set like_count = (select count(*) from public.community_post_likes l where l.post_id = coalesce(new.post_id, old.post_id))
  where p.id = coalesce(new.post_id, old.post_id);
  return null;
end;
$$;
revoke execute on function private.community_counters_post_likes() from public, anon, authenticated;
create trigger community_post_likes_counters after insert or delete on public.community_post_likes
  for each row execute function private.community_counters_post_likes();

create or replace function private.community_counters_comment_likes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.community_comments c
  set like_count = (select count(*) from public.community_comment_likes l where l.comment_id = coalesce(new.comment_id, old.comment_id))
  where c.id = coalesce(new.comment_id, old.comment_id);
  return null;
end;
$$;
revoke execute on function private.community_counters_comment_likes() from public, anon, authenticated;
create trigger community_comment_likes_counters after insert or delete on public.community_comment_likes
  for each row execute function private.community_counters_comment_likes();

create or replace function private.community_counters_saves()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.community_posts p
  set save_count = (select count(*) from public.community_saves s where s.post_id = coalesce(new.post_id, old.post_id))
  where p.id = coalesce(new.post_id, old.post_id);
  return null;
end;
$$;
revoke execute on function private.community_counters_saves() from public, anon, authenticated;
create trigger community_saves_counters after insert or delete on public.community_saves
  for each row execute function private.community_counters_saves();

-- ---------------------------------------------------------------------------------------------
-- Fotos: bucket PRIVADO. Nadie puede abrir una foto por su dirección de Supabase: la lectura la autorizan las políticas de 0277 (solo fotos de contenido
-- PUBLICADO, o las propias, o a la administración) y las páginas públicas y las vistas previas las sirve el Worker de Cloudflare (ruta /c/img) con la
-- clave anónima, de modo que una publicación o comentario ocultado por moderación deja de servir su foto (y los enlaces antiguos también) en cuanto caduca
-- la caché de unos minutos. Nombres imposibles de adivinar (carpeta = id del perfil público + uuid), solo imágenes de hasta 3 MB, y solo se puede subir/borrar
-- dentro de la propia carpeta. Al borrar una publicación o foto, el archivo físico se borra con la cola community_media_deletions.
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-media', 'community-media', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

grant execute on function private.community_cp() to authenticated;

-- Quien está expulsado no puede subir fotos (puede borrar las suyas).
create or replace function private.community_can_upload()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.community_cp() is not null and private.community_ban_state(private.community_cp()) = 'ok'
$$;
revoke execute on function private.community_can_upload() from public, anon;
grant execute on function private.community_can_upload() to authenticated;

create policy "community media: insert own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'community-media' and (storage.foldername(name))[1] = (select private.community_cp()::text) and (select private.community_can_upload()));
create policy "community media: delete own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'community-media' and (storage.foldername(name))[1] = (select private.community_cp()::text));

-- ---------------------------------------------------------------------------------------------
-- Comentarios.
-- ---------------------------------------------------------------------------------------------
create or replace function public.community_add_comment(p_post uuid, p_body text, p_photo text default null, p_reply_to uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_require_participant();
  v_post public.community_posts%rowtype;
  v_body text;
  v_parent uuid;
  v_target public.community_comments%rowtype;
  v_id uuid;
begin
  perform private.community_rate_check(v_cp, 'comment');
  select * into v_post from public.community_posts p where p.id = p_post;
  if not found or v_post.status <> 'published' or private.community_blocked_either(v_cp, v_post.author_id) then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  v_body := private.community_clean_text(p_body, 2000, false);
  if v_body = '' and p_photo is null then
    raise exception 'TEXT_REQUIRED' using errcode = 'P0001';
  end if;
  if p_photo is not null then
    perform private.community_check_photo_paths(v_cp, array[p_photo]);
  end if;
  if p_reply_to is not null then
    select * into v_target from public.community_comments c where c.id = p_reply_to and c.post_id = p_post;
    if not found or v_target.status <> 'published' or private.community_blocked_either(v_cp, v_target.author_id) then
      raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
    end if;
    -- Un solo nivel visual: responder a una respuesta cuelga del comentario raíz.
    v_parent := coalesce(v_target.parent_id, v_target.id);
  end if;
  insert into public.community_comments (post_id, author_id, parent_id, reply_to_id, body, photo_path)
  values (p_post, v_cp, v_parent, p_reply_to, v_body, p_photo)
  returning id into v_id;
  -- Quien escribe ya ha «visto» su propio comentario.
  insert into public.community_comment_seen (profile_id, comment_id) values (v_cp, v_id) on conflict do nothing;
  return v_id;
end;
$$;

create or replace function public.community_edit_comment(p_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_require_participant();
  v_body text := private.community_clean_text(p_body, 2000, false);
  c public.community_comments%rowtype;
begin
  select * into c from public.community_comments x where x.id = p_id for update;
  if not found or c.author_id <> v_cp or c.status <> 'published' then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if v_body = '' and c.photo_path is null then
    raise exception 'TEXT_REQUIRED' using errcode = 'P0001';
  end if;
  update public.community_comments set body = v_body, edited_at = now() where id = p_id;
end;
$$;

create or replace function public.community_delete_comment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_cp();
  c public.community_comments%rowtype;
begin
  if v_cp is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  select * into c from public.community_comments x where x.id = p_id for update;
  if not found or c.author_id <> v_cp then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if c.photo_path is not null then
    perform private.community_queue_media_deletion(array[c.photo_path]);
  end if;
  update public.community_comments set status = 'deleted', body = '', photo_path = null where id = p_id;
  delete from public.community_post_summaries where post_id = c.post_id;
end;
$$;

-- Un comentario en jsonb (aplica bloqueos: la capa neutra no lleva contenido).
create or replace function private.community_comment_json(c public.community_comments, p_viewer uuid)
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
  v_reply_alias text;
begin
  select * into a from public.community_profiles x where x.id = c.author_id;
  if p_viewer is not null then
    v_blocked_by_me := exists (select 1 from public.community_blocks b where b.blocker_id = p_viewer and b.blocked_id = c.author_id);
    v_blocked_me := exists (select 1 from public.community_blocks b where b.blocker_id = c.author_id and b.blocked_id = p_viewer);
  end if;
  if v_blocked_by_me then
    return jsonb_build_object('id', c.id, 'blocked_by_me', true, 'author_id', c.author_id, 'created_at', c.created_at);
  end if;
  if c.reply_to_id is not null then
    -- Si la persona a quien responde está bloqueada por quien mira, no se enseña su alias (capa neutra).
    select case when ra.deleted_at is not null then 'Usuario eliminado'
                when p_viewer is not null and exists (select 1 from public.community_blocks b where b.blocker_id = p_viewer and b.blocked_id = ra.id) then null
                else ra.alias end into v_reply_alias
    from public.community_comments rc join public.community_profiles ra on ra.id = rc.author_id where rc.id = c.reply_to_id;
  end if;
  return jsonb_build_object(
    'id', c.id,
    'parent_id', c.parent_id,
    'reply_to_id', c.reply_to_id,
    'reply_to_alias', v_reply_alias,
    'status', c.status,
    'author_id', c.author_id,
    'author_alias', case when a.deleted_at is not null then 'Usuario eliminado' else a.alias end,
    'author_avatar', case when a.deleted_at is not null then null else a.avatar_emoji end,
    'author_is_official', a.is_official,
    'author_deleted', a.deleted_at is not null,
    'body', c.body,
    'photo_path', c.photo_path,
    'created_at', c.created_at,
    'edited_at', c.edited_at,
    'like_count', c.like_count,
    'liked_by_me', p_viewer is not null and exists (select 1 from public.community_comment_likes l where l.comment_id = c.id and l.profile_id = p_viewer),
    'mine', p_viewer is not null and c.author_id = p_viewer,
    'is_new', p_viewer is not null and c.author_id <> p_viewer
      and not exists (select 1 from public.community_comment_seen s where s.comment_id = c.id and s.profile_id = p_viewer),
    'can_interact', not v_blocked_me
  );
end;
$$;
revoke execute on function private.community_comment_json(public.community_comments, uuid) from public, anon, authenticated;

-- Comentarios de una publicación: raíces paginadas (con sus respuestas dentro, un solo nivel). Orden: antiguos (por defecto), recientes, utiles.
-- Un comentario eliminado u oculto solo se enseña (como aviso neutro) si tiene respuestas, para no romper la conversación.
create or replace function public.community_list_comments(p_post uuid, p_order text default 'antiguos', p_limit integer default 30, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := private.community_cp();
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_status text;
  v_roots jsonb;
  v_total integer;
  v_new integer := 0;
begin
  perform private.community_require_reader();
  select p.status into v_status from public.community_posts p where p.id = p_post;
  if v_status is distinct from 'published' then
    return null;
  end if;
  if p_order not in ('antiguos', 'recientes', 'utiles') then
    p_order := 'antiguos';
  end if;

  select count(*)::integer into v_total from public.community_comments c
  where c.post_id = p_post and c.parent_id is null
    and (c.status = 'published' or exists (select 1 from public.community_comments r where r.parent_id = c.id and r.status = 'published'));

  if v_viewer is not null then
    select count(*)::integer into v_new from public.community_comments c
    where c.post_id = p_post and c.status = 'published' and c.author_id <> v_viewer
      and not exists (select 1 from public.community_comment_seen s where s.comment_id = c.id and s.profile_id = v_viewer);
  end if;

  select coalesce(jsonb_agg(x.j order by x.rn), '[]'::jsonb) into v_roots
  from (
    select row_number() over (order by
             case when p_order = 'utiles' then c.like_count end desc nulls last,
             case when p_order = 'recientes' then c.created_at end desc nulls last,
             c.created_at asc, c.id) as rn,
           case when c.status = 'published' then private.community_comment_json(c, v_viewer)
                else jsonb_build_object('id', c.id, 'status', 'removed', 'created_at', c.created_at) end
           || jsonb_build_object(
                'reply_count', (select count(*) from public.community_comments r where r.parent_id = c.id and r.status = 'published'),
                'new_reply_count', case when v_viewer is null then 0 else (select count(*) from public.community_comments r
                    where r.parent_id = c.id and r.status = 'published' and r.author_id <> v_viewer
                      and not exists (select 1 from public.community_comment_seen s where s.comment_id = r.id and s.profile_id = v_viewer)) end,
                'replies', coalesce((select jsonb_agg(private.community_comment_json(r, v_viewer) order by r.created_at, r.id)
                                     from public.community_comments r where r.parent_id = c.id and r.status = 'published'), '[]'::jsonb)
              ) as j
    from public.community_comments c
    where c.post_id = p_post and c.parent_id is null
      and (c.status = 'published' or exists (select 1 from public.community_comments r where r.parent_id = c.id and r.status = 'published'))
    order by rn
    limit v_limit offset v_offset
  ) x;

  return jsonb_build_object('comments', v_roots, 'total_roots', v_total, 'new_count', v_new);
end;
$$;

-- Marca comentarios como vistos (lo llama la app solo tras exposición razonable en pantalla; no al abrir la publicación).
create or replace function public.community_mark_comments_seen(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_cp();
  v_n integer;
begin
  perform private.community_require_reader();
  if v_cp is null or p_ids is null then
    return 0;
  end if;
  insert into public.community_comment_seen (profile_id, comment_id)
  select v_cp, c.id from public.community_comments c where c.id = any (p_ids[1:200]) and c.status = 'published'
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Reacciones, guardados, seguimientos y bloqueos.
-- ---------------------------------------------------------------------------------------------
create or replace function public.community_toggle_like(p_type text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_require_participant();
  v_author uuid;
  v_liked boolean;
  v_count integer;
begin
  if p_type = 'post' then
    select p.author_id into v_author from public.community_posts p where p.id = p_id and p.status = 'published';
    if v_author is null or private.community_blocked_either(v_cp, v_author) then
      raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
    end if;
    delete from public.community_post_likes where post_id = p_id and profile_id = v_cp;
    v_liked := not found;
    if v_liked then
      insert into public.community_post_likes (post_id, profile_id) values (p_id, v_cp);
    end if;
    select p.like_count into v_count from public.community_posts p where p.id = p_id;
  elsif p_type = 'comment' then
    select c.author_id into v_author from public.community_comments c join public.community_posts p on p.id = c.post_id
    where c.id = p_id and c.status = 'published' and p.status = 'published';
    if v_author is null or private.community_blocked_either(v_cp, v_author) then
      raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
    end if;
    delete from public.community_comment_likes where comment_id = p_id and profile_id = v_cp;
    v_liked := not found;
    if v_liked then
      insert into public.community_comment_likes (comment_id, profile_id) values (p_id, v_cp);
    end if;
    select c.like_count into v_count from public.community_comments c where c.id = p_id;
  else
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  return jsonb_build_object('liked', v_liked, 'like_count', v_count);
end;
$$;

create or replace function public.community_toggle_save(p_post uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_require_participant();
  v_saved boolean;
begin
  if not exists (select 1 from public.community_posts p where p.id = p_post and p.status = 'published') then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  delete from public.community_saves where post_id = p_post and profile_id = v_cp;
  v_saved := not found;
  if v_saved then
    insert into public.community_saves (post_id, profile_id) values (p_post, v_cp);
  end if;
  return jsonb_build_object('saved', v_saved, 'save_count', (select p.save_count from public.community_posts p where p.id = p_post));
end;
$$;

create or replace function public.community_toggle_follow_conversation(p_post uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_require_participant();
  v_following boolean;
begin
  if not exists (select 1 from public.community_posts p where p.id = p_post and p.status = 'published') then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  delete from public.community_conversation_follows where post_id = p_post and profile_id = v_cp;
  v_following := not found;
  if v_following then
    insert into public.community_conversation_follows (post_id, profile_id) values (p_post, v_cp);
  end if;
  return v_following;
end;
$$;

-- Seguir a una persona (por su id público estable, sin revelar nada de su familia). mode: smart (por defecto) | every | off.
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

create or replace function public.community_unfollow_user(p_cp uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_cp();
begin
  if v_cp is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  delete from public.community_user_follows where follower_id = v_cp and followed_id = p_cp;
end;
$$;

-- Bloquear: sin avisar a la otra persona. Se cortan los seguimientos en los dos sentidos y la persona bloqueada deja de poder interactuar con lo del
-- bloqueador (las funciones de interacción responden NOT_AVAILABLE sin dar el motivo).
create or replace function public.community_block(p_cp uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_cp();
begin
  perform private.community_require_participation_access();
  if v_cp is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if p_cp = v_cp or not exists (select 1 from public.community_profiles x where x.id = p_cp and not x.is_official) then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  insert into public.community_blocks (blocker_id, blocked_id) values (v_cp, p_cp) on conflict do nothing;
  delete from public.community_user_follows where (follower_id = v_cp and followed_id = p_cp) or (follower_id = p_cp and followed_id = v_cp);
end;
$$;

create or replace function public.community_unblock(p_cp uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_cp();
begin
  if v_cp is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  delete from public.community_blocks where blocker_id = v_cp and blocked_id = p_cp;
end;
$$;

create or replace function public.community_list_blocks()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', cp.id, 'alias', case when cp.deleted_at is not null then 'Usuario eliminado' else cp.alias end,
                                              'avatar_emoji', cp.avatar_emoji) order by b.created_at desc), '[]'::jsonb)
  from public.community_blocks b join public.community_profiles cp on cp.id = b.blocked_id
  where b.blocker_id = private.community_cp()
$$;

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

create or replace function public.community_set_favorite_topics(p_topics text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_cp();
begin
  perform private.community_require_participation_access();
  if v_cp is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  delete from public.community_favorite_topics where profile_id = v_cp;
  insert into public.community_favorite_topics (profile_id, topic_id)
  select v_cp, t.id from public.community_topics t where t.id = any (coalesce(p_topics, '{}'));
end;
$$;

create or replace function public.community_get_favorite_topics()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(f.topic_id), '{}') from public.community_favorite_topics f where f.profile_id = private.community_cp()
$$;

-- ---------------------------------------------------------------------------------------------
-- Perfil público (solo alias, avatar, publicaciones, recetas y valoraciones; nada de la familia; los seguidores NO se enseñan como ranking).
-- ---------------------------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------------------------
-- Borradores: solo el guardado MANUAL asegura la conservación (30 días desde el último guardado manual).
-- ---------------------------------------------------------------------------------------------
-- p_anecdote_type: subtipo opcional de una Anécdota (graciosa | bonita | emotiva); null = sin subtipo.
create or replace function public.community_save_draft(
  p_id uuid,
  p_kind text,
  p_section text,
  p_topic text,
  p_title text,
  p_body text,
  p_photos jsonb default '[]'::jsonb,
  p_recipe jsonb default null,
  p_anecdote_type text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_require_participant();
  v_id uuid;
  v_paths text[];
begin
  if p_kind not in ('receta', 'pregunta', 'consejo', 'anecdota') or (p_section is not null and p_section not in ('recetas', 'hogar')) then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  if p_anecdote_type is not null and (p_kind <> 'anecdota' or p_anecdote_type not in ('graciosa', 'bonita', 'emotiva')) then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  if p_topic is not null and not exists (select 1 from public.community_topics t where t.id = p_topic and (p_section is null or t.section = p_section)) then
    raise exception 'TOPIC_SECTION_MISMATCH' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(x), '{}') into v_paths from jsonb_array_elements_text(coalesce(p_photos, '[]'::jsonb)) x;
  perform private.community_check_photo_paths(v_cp, v_paths);
  if char_length(coalesce(p_title, '')) > 140 or char_length(coalesce(p_body, '')) > 10000 or octet_length(coalesce(p_recipe::text, '')) > 50000 then
    raise exception 'TEXT_TOO_LONG' using errcode = 'P0001';
  end if;
  -- Tope de borradores por persona (evita llenar la base de datos).
  if p_id is null and (select count(*) from public.community_drafts d where d.profile_id = v_cp) >= 20 then
    raise exception 'RATE_LIMIT' using errcode = 'P0001';
  end if;
  if p_id is not null then
    -- Las fotos que se quitan del borrador y no usa ninguna publicación se encolan para borrar del almacenamiento.
    perform private.community_queue_media_deletion(array(
      select x from public.community_drafts d, jsonb_array_elements_text(d.photos) x
      where d.id = p_id and d.profile_id = v_cp and not (x = any (v_paths))
        and not exists (select 1 from public.community_post_photos ph where ph.storage_path = x)));
    update public.community_drafts
    set kind = p_kind, section = p_section, topic_id = p_topic, title = coalesce(p_title, ''), body = coalesce(p_body, ''),
        photos = coalesce(p_photos, '[]'::jsonb), recipe = p_recipe, anecdote_type = p_anecdote_type, saved_at = now()
    where id = p_id and profile_id = v_cp
    returning id into v_id;
    if v_id is null then
      raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
    end if;
  else
    insert into public.community_drafts (profile_id, kind, section, topic_id, title, body, photos, recipe, anecdote_type)
    values (v_cp, p_kind, p_section, p_topic, coalesce(p_title, ''), coalesce(p_body, ''), coalesce(p_photos, '[]'::jsonb), p_recipe, p_anecdote_type)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.community_list_drafts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'kind', d.kind, 'title', d.title, 'saved_at', d.saved_at,
    'days_left', greatest(0, ceil(extract(epoch from (d.saved_at + make_interval(days => private.community_setting_int('draft_days', 30)) - now())) / 86400.0))::integer
  ) order by d.saved_at desc), '[]'::jsonb)
  from public.community_drafts d
  where d.profile_id = private.community_cp()
    and d.saved_at > now() - make_interval(days => private.community_setting_int('draft_days', 30))
$$;

create or replace function public.community_get_draft(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', d.id, 'kind', d.kind, 'section', d.section, 'topic_id', d.topic_id, 'title', d.title, 'body', d.body,
                            'photos', d.photos, 'recipe', d.recipe, 'anecdote_type', d.anecdote_type, 'saved_at', d.saved_at,
                            'days_left', greatest(0, ceil(extract(epoch from (d.saved_at + make_interval(days => private.community_setting_int('draft_days', 30)) - now())) / 86400.0))::integer)
  from public.community_drafts d
  where d.id = p_id and d.profile_id = private.community_cp()
    and d.saved_at > now() - make_interval(days => private.community_setting_int('draft_days', 30))
$$;

-- Descartar un borrador (la app pide confirmación): sus fotos se borran si no las usa nada más.
create or replace function public.community_delete_draft(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_cp();
  v_paths text[];
begin
  if v_cp is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(x), '{}') into v_paths from public.community_drafts d, jsonb_array_elements_text(d.photos) x where d.id = p_id and d.profile_id = v_cp;
  delete from public.community_drafts where id = p_id and profile_id = v_cp;
  perform private.community_queue_media_deletion(array(
    select x from unnest(v_paths) x
    where not exists (select 1 from public.community_post_photos ph where ph.storage_path = x)
  ));
end;
$$;

-- Caducidad: a los 30 días del último guardado manual se borran el borrador y sus fotos (las que no estén en una publicación).
create or replace function private.purge_expired_community_drafts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer := private.community_setting_int('draft_days', 30);
  v_paths text[];
  v_n integer;
begin
  select coalesce(array_agg(x), '{}') into v_paths
  from public.community_drafts d, jsonb_array_elements_text(d.photos) x
  where d.saved_at <= now() - make_interval(days => v_days);
  perform private.community_queue_media_deletion(array(
    select x from unnest(v_paths) x where not exists (select 1 from public.community_post_photos ph where ph.storage_path = x)
  ));
  delete from public.community_drafts where saved_at <= now() - make_interval(days => v_days);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function private.purge_expired_community_drafts() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Búsquedas recientes (privadas, con sus filtros y orden; nunca visibles en el perfil público).
-- ---------------------------------------------------------------------------------------------
create or replace function public.community_record_search(p_query text, p_filters jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_cp();
  v_q text := btrim(coalesce(p_query, ''));
  v_keep integer := private.community_setting_int('search_history_size', 10);
begin
  perform private.community_require_reader();
  if v_cp is null or char_length(v_q) = 0 then
    return;
  end if;
  v_q := left(v_q, 120);
  if octet_length(coalesce(p_filters, '{}'::jsonb)::text) > 2000 then
    return;
  end if;
  delete from public.community_search_history where profile_id = v_cp and lower(query) = lower(v_q) and filters = coalesce(p_filters, '{}'::jsonb);
  insert into public.community_search_history (profile_id, query, filters) values (v_cp, v_q, coalesce(p_filters, '{}'::jsonb));
  delete from public.community_search_history h
  where h.profile_id = v_cp and h.id not in (
    select x.id from public.community_search_history x where x.profile_id = v_cp order by x.created_at desc, x.id limit v_keep);
end;
$$;

create or replace function public.community_list_searches()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'query', h.query, 'filters', h.filters, 'created_at', h.created_at) order by h.created_at desc), '[]'::jsonb)
  from public.community_search_history h where h.profile_id = private.community_cp()
$$;

create or replace function public.community_clear_searches()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.community_search_history where profile_id = private.community_cp()
$$;

-- ---------------------------------------------------------------------------------------------
-- Permisos: solo con sesión.
-- ---------------------------------------------------------------------------------------------
revoke all on function public.community_add_comment(uuid, text, text, uuid) from public, anon;
revoke all on function public.community_edit_comment(uuid, text) from public, anon;
revoke all on function public.community_delete_comment(uuid) from public, anon;
revoke all on function public.community_list_comments(uuid, text, integer, integer) from public, anon;
revoke all on function public.community_mark_comments_seen(uuid[]) from public, anon;
revoke all on function public.community_toggle_like(text, uuid) from public, anon;
revoke all on function public.community_toggle_save(uuid) from public, anon;
revoke all on function public.community_toggle_follow_conversation(uuid) from public, anon;
revoke all on function public.community_follow_user(uuid, text) from public, anon;
revoke all on function public.community_unfollow_user(uuid) from public, anon;
revoke all on function public.community_block(uuid) from public, anon;
revoke all on function public.community_unblock(uuid) from public, anon;
revoke all on function public.community_list_blocks() from public, anon;
revoke all on function public.community_list_following() from public, anon;
revoke all on function public.community_set_favorite_topics(text[]) from public, anon;
revoke all on function public.community_get_favorite_topics() from public, anon;
revoke all on function public.community_get_public_profile(uuid) from public, anon;
revoke all on function public.community_save_draft(uuid, text, text, text, text, text, jsonb, jsonb, text) from public, anon;
revoke all on function public.community_list_drafts() from public, anon;
revoke all on function public.community_get_draft(uuid) from public, anon;
revoke all on function public.community_delete_draft(uuid) from public, anon;
revoke all on function public.community_record_search(text, jsonb) from public, anon;
revoke all on function public.community_list_searches() from public, anon;
revoke all on function public.community_clear_searches() from public, anon;
grant execute on function public.community_add_comment(uuid, text, text, uuid) to authenticated;
grant execute on function public.community_edit_comment(uuid, text) to authenticated;
grant execute on function public.community_delete_comment(uuid) to authenticated;
grant execute on function public.community_list_comments(uuid, text, integer, integer) to authenticated;
grant execute on function public.community_mark_comments_seen(uuid[]) to authenticated;
grant execute on function public.community_toggle_like(text, uuid) to authenticated;
grant execute on function public.community_toggle_save(uuid) to authenticated;
grant execute on function public.community_toggle_follow_conversation(uuid) to authenticated;
grant execute on function public.community_follow_user(uuid, text) to authenticated;
grant execute on function public.community_unfollow_user(uuid) to authenticated;
grant execute on function public.community_block(uuid) to authenticated;
grant execute on function public.community_unblock(uuid) to authenticated;
grant execute on function public.community_list_blocks() to authenticated;
grant execute on function public.community_list_following() to authenticated;
grant execute on function public.community_set_favorite_topics(text[]) to authenticated;
grant execute on function public.community_get_favorite_topics() to authenticated;
grant execute on function public.community_get_public_profile(uuid) to authenticated;
grant execute on function public.community_save_draft(uuid, text, text, text, text, text, jsonb, jsonb, text) to authenticated;
grant execute on function public.community_list_drafts() to authenticated;
grant execute on function public.community_get_draft(uuid) to authenticated;
grant execute on function public.community_delete_draft(uuid) to authenticated;
grant execute on function public.community_record_search(text, jsonb) to authenticated;
grant execute on function public.community_list_searches() to authenticated;
grant execute on function public.community_clear_searches() to authenticated;

-- Limpieza diaria de borradores caducados.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'community-purge-drafts') then
    perform cron.unschedule('community-purge-drafts');
  end if;
  perform cron.schedule('community-purge-drafts', '25 3 * * *', 'select private.purge_expired_community_drafts()');
end $$;
