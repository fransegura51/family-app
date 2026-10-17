-- Comunidad: «✓ Leído» / «Actualizada» por persona, orden «No leídas primero» y filtro por VARIOS temas a la vez.
--
-- Leído: tabla nueva `community_post_reads` (una fila por CUENTA y publicación, escrita SOLO al abrir el detalle con community_get_post, nunca al aparecer en una lista, y sin
-- permisos para nadie: solo las funciones del servidor la tocan). Va por cuenta (no por alias) para que también cuente a quien todavía no ha elegido alias: el alias se pide
-- al participar, pero leer no lo exige. Se parte de las aperturas reales ya guardadas en `community_post_visits`; nada más se marca en masa.
-- Actualizada: la publicación guarda `content_rev`, un contador que sube SOLO cuando cambia su contenido de verdad (título, texto sin contar espacios, recetas, menú, receta
-- enlazada o fuentes). Me gusta, comentarios, contadores o la fecha de edición NO lo tocan. La lectura guarda `seen_rev` (la versión que se leyó): si la publicación avanzó, la
-- tarjeta enseña «Actualizada» hasta que se vuelva a abrir. Cada tarjeta lleva `read_state` ('read' | 'updated' | null) calculado solo para quien mira (auth.uid()): nadie puede
-- preguntar por el historial de otra persona (la tabla no tiene permisos ni política). Si la cuenta se borra, sus lecturas se borran con ella.
-- Orden nuevo «no_leidas»: primero lo que la persona no ha abierto o ha cambiado desde que lo abrió, luego lo leído; dentro de cada grupo, de más reciente a más antiguo.
-- Temas: `community_list_posts` admite `p_topics text[]` (varios temas, lógica O). `p_topic` (uno solo) sigue funcionando.
-- Deshacer: supabase/rollbacks/0287_community_read_state_multi_topic_down.sql.

alter table public.community_posts add column if not exists content_rev integer not null default 0;

create table if not exists public.community_post_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid not null references public.community_posts (id) on delete cascade,
  seen_rev integer not null default 0,
  read_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
alter table public.community_post_reads enable row level security;
revoke all on public.community_post_reads from anon, authenticated;
create index if not exists community_post_reads_post_idx on public.community_post_reads (post_id);

-- Las aperturas reales que ya había (de quienes tienen perfil de Comunidad) pasan a la tabla nueva con la versión actual de cada publicación.
insert into public.community_post_reads (user_id, post_id, seen_rev, read_at)
select cp.user_id, v.post_id, p.content_rev, v.last_visit_at
from public.community_post_visits v
join public.community_profiles cp on cp.id = v.profile_id
join public.community_posts p on p.id = v.post_id
where cp.user_id is not null
on conflict do nothing;

create or replace function private.community_posts_bump_rev()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.title is distinct from old.title
     or regexp_replace(lower(btrim(coalesce(new.body, ''))), '\s+', ' ', 'g') is distinct from regexp_replace(lower(btrim(coalesce(old.body, ''))), '\s+', ' ', 'g')
     or new.recipes is distinct from old.recipes
     or new.menu is distinct from old.menu
     or new.recipe_id is distinct from old.recipe_id
     or new.article_sources is distinct from old.article_sources then
    new.content_rev := old.content_rev + 1;
  end if;
  return new;
end;
$$;
revoke all on function private.community_posts_bump_rev() from public, anon, authenticated;

drop trigger if exists community_posts_bump_rev on public.community_posts;
create trigger community_posts_bump_rev
  before update on public.community_posts
  for each row execute function private.community_posts_bump_rev();

-- Tarjeta: igual que antes + `read_state` (solo para quien mira).
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
  v_read text := null;
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
    -- Importaciones de OTRAS familias (la de la propia autora no cuenta).
    select count(*)::integer into v_imports from public.community_recipe_imports i where i.recipe_id = p.recipe_id
      and i.family_id is distinct from (select pr.family_id from public.community_profiles acp join public.profiles pr on pr.id = acp.user_id where acp.id = p.author_id);
  end if;
  select case when r.seen_rev >= p.content_rev then 'read' else 'updated' end into v_read
  from public.community_post_reads r where r.user_id = (select auth.uid()) and r.post_id = p.id;
  return jsonb_build_object(
    'id', p.id,
    'kind', p.kind,
    'anecdote_type', p.anecdote_type,
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
    'read_state', v_read,
    'can_interact', not v_blocked_me
  );
end;
$$;
revoke execute on function private.community_card(public.community_posts, uuid) from public, anon, authenticated;

-- Abrir el detalle = leído (con la versión que se está leyendo).
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
  perform private.community_require_reader();
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
  -- Lectura por cuenta (también sin alias).
  if (select auth.uid()) is not null then
    insert into public.community_post_reads (user_id, post_id, seen_rev) values ((select auth.uid()), p.id, p.content_rev)
    on conflict (user_id, post_id) do update set seen_rev = excluded.seen_rev, read_at = now();
  end if;
  return private.community_post_detail(p, v_viewer);
end;
$$;

-- Listado: p_topics (varios temas, O) y orden «no_leidas».
drop function if exists public.community_list_posts(text, text, text, text, integer, integer, text, uuid, boolean, boolean);

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
  p_following boolean default false,
  p_topics text[] default null
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
  perform private.community_require_reader();
  if p_order not in ('recientes', 'comentados', 'valoradas', 'sin_respuesta', 'para_mi', 'no_leidas') then
    p_order := 'recientes';
  end if;
  if p_topics is not null and cardinality(p_topics) = 0 then
    p_topics := null;
  end if;
  if p_query is not null and btrim(p_query) <> '' then
    -- Cada palabra se busca como PREFIJO («tort» encuentra «tortilla»), igual que el autocompletado; si no queda ninguna palabra útil, búsqueda web normal.
    select to_tsquery('spanish'::regconfig, string_agg(s.w || ':*', ' & ')) into v_tsq
    from (select regexp_replace(lower(x), '[^a-z0-9áéíóúüñ]', '', 'g') as w from unnest(string_to_array(btrim(p_query), ' ')) x) s
    where s.w <> '';
    if v_tsq is null then
      v_tsq := websearch_to_tsquery('spanish'::regconfig, p_query);
    end if;
  end if;

  select coalesce(jsonb_agg(private.community_card(q.p, v_viewer) order by q.rn), '[]'::jsonb) into v_result
  from (
    select p, row_number() over (order by
        -- «No leídas primero»: lo no abierto o cambiado desde que se abrió (0) antes que lo leído (1).
        case when p_order = 'no_leidas' and not exists (
              select 1 from public.community_post_reads r where r.user_id = (select auth.uid()) and r.post_id = p.id and r.seen_rev >= p.content_rev) then 0 else 1 end,
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
        case when p_order in ('recientes', 'sin_respuesta', 'no_leidas') then p.created_at end desc,
        p.created_at desc, p.id) as rn
    from public.community_posts p
    where p.status = 'published'
      and (p_section is null or p.section = p_section)
      and (p_topic is null or p.topic_id = p_topic)
      and (p_topics is null or p.topic_id = any (p_topics))
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

revoke all on function public.community_list_posts(text, text, text, text, integer, integer, text, uuid, boolean, boolean, text[]) from public, anon;
grant execute on function public.community_list_posts(text, text, text, text, integer, integer, text, uuid, boolean, boolean, text[]) to authenticated;
