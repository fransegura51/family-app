-- COMUNIDAD PEPA — avisos de Comunidad (CMN-107/108, CMN-144), interruptor de lanzamiento y ajustes de avisos de Comunidad por persona.
--
-- Avisos PERSONALES (los define cada persona, NO se les aplica el horario de sugerencias): conversaciones que sigue voluntariamente, comentarios en sus
-- publicaciones y respuestas directas a sus comentarios. Se AGRUPAN: no hay un aviso por comentario.
--   · Cuenta los comentarios aún NO vistos (no los que ya vio) y no repite respuestas.
--   · Tras un aviso, el siguiente puede llegar 1 hora después si la persona abrió el aviso; si no lo abrió, al menos 2 horas después del anterior.
--   · Varias conversaciones → UN solo aviso agrupado («18 comentarios nuevos en 3 conversaciones») que lleva a un desglose por conversación con contadores;
--     abrir el desglose no marca nada como leído; entrar en una conversación abre sus comentarios nuevos; al volver quedan las demás.
--   · Cada persona puede elegir «a cualquier hora» o una franja horaria propia (en su zona horaria). Fuera de la franja los comentarios esperan y se
--     agrupan en un solo aviso cuando vuelve a estar dentro.
-- Avisos generales (sugerencias de Pepa y recomendaciones de Comunidad): solo de 08:00 a 21:00 en la zona horaria de la persona, con una cadencia de ~48 h
-- configurable; fuera de franja NO se acumulan para soltarlos de golpe a las 08:00 (se vuelve a calcular cuando toca).
-- Seguir a personas: modo «inteligente» (por defecto: dentro de la cadencia general), «cada publicación» (opt-in) o desactivado.

-- ---------------------------------------------------------------------------------------------
-- Interruptor de lanzamiento: hasta que un administrador lo active, solo los administradores pueden participar (probar) y la app oculta Comunidad al resto.
-- ---------------------------------------------------------------------------------------------
insert into public.community_settings (key, value, description)
values ('launch_enabled', '0', '1 = Comunidad abierta a todos los usuarios registrados; 0 = solo los administradores (pruebas antes del lanzamiento).')
on conflict (key) do nothing;

-- Decisión de seguridad por defecto (no está en la especificación; se puede cambiar): participar (publicar, comentar, valorar…) solo con cuentas de adultos
-- (rol admin o adult). Las cuentas de invitado o de menor pueden LEER pero no publicar: la especificación prohíbe mostrar datos de menores y Comunidad es pública.
insert into public.community_settings (key, value, description)
values ('participants_adults_only', '1', '1 = solo cuentas de adultos (admin/adult) pueden participar; 0 = también invitados y menores con cuenta.')
on conflict (key) do nothing;

create or replace function private.community_launched()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (s.value #>> '{}')::integer from public.community_settings s where s.key = 'launch_enabled'), 0) = 1
$$;
revoke execute on function private.community_launched() from public, anon, authenticated;

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
  if not private.community_launched() and not private.community_is_admin() then
    raise exception 'NOT_LAUNCHED' using errcode = 'P0001';
  end if;
  if private.community_setting_int('participants_adults_only', 1) = 1
     and not exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.role in ('admin', 'adult')) then
    raise exception 'ADULT_REQUIRED' using errcode = 'P0001';
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

-- Estado para la app: ¿se enseña Comunidad a esta persona?
create or replace function public.community_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('launched', private.community_launched(), 'visible', private.community_launched() or private.community_is_admin(), 'is_admin', private.community_is_admin())
$$;
revoke all on function public.community_status() from public, anon;
grant execute on function public.community_status() to authenticated;

create or replace function public.community_admin_set_launch(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  update public.community_settings set value = to_jsonb(case when p_enabled then 1 else 0 end), updated_at = now() where key = 'launch_enabled';
  perform private.community_log(case when p_enabled then 'launch' else 'unlaunch' end, 'setting', null, 'launch_enabled');
end;
$$;
revoke all on function public.community_admin_set_launch(boolean) from public, anon;
grant execute on function public.community_admin_set_launch(boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Ajustes de avisos de Comunidad por persona (las columnas de la franja ya existen desde 0260).
-- ---------------------------------------------------------------------------------------------
alter table public.user_notification_prefs add column community_suggestions_enabled boolean not null default true;
alter table public.user_notification_prefs add column community_suggestion_every_hours integer not null default 48 check (community_suggestion_every_hours between 6 and 720);

create or replace function private.community_local_time(p_user uuid)
returns time
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone coalesce((select np.timezone from public.user_notification_prefs np where np.profile_id = p_user), 'Europe/Madrid'))::time
$$;
revoke execute on function private.community_local_time(uuid) from public, anon, authenticated;

-- ¿Dentro de la franja de avisos PERSONALES de esa persona? (admite franjas que cruzan la medianoche)
create or replace function private.community_in_personal_window(p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  np public.user_notification_prefs%rowtype;
  v_t time := private.community_local_time(p_user);
begin
  select * into np from public.user_notification_prefs x where x.profile_id = p_user;
  if not found or np.personal_community_mode = 'any' then
    return true;
  end if;
  if np.personal_window_start <= np.personal_window_end then
    return v_t >= np.personal_window_start and v_t < np.personal_window_end;
  end if;
  return v_t >= np.personal_window_start or v_t < np.personal_window_end;
end;
$$;
revoke execute on function private.community_in_personal_window(uuid) from public, anon, authenticated;

-- Franja de los avisos GENERALES de Pepa y de Comunidad: 08:00-21:00 en la zona horaria de la persona.
create or replace function private.community_in_general_window(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.community_local_time(p_user) >= time '08:00' and private.community_local_time(p_user) < time '21:00'
$$;
revoke execute on function private.community_in_general_window(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Comentarios nuevos pendientes de avisar (se agrupan en el trabajo programado).
-- ---------------------------------------------------------------------------------------------
create table public.community_notification_events (
  id bigserial primary key,
  profile_id uuid not null references public.community_profiles(id) on delete cascade,
  post_id uuid not null references public.community_posts(id) on delete cascade,
  comment_id uuid not null references public.community_comments(id) on delete cascade,
  source text not null check (source in ('reply', 'own_post', 'followed')),
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  unique (profile_id, comment_id)
);
create index idx_community_notification_events_pending on public.community_notification_events (profile_id) where notified_at is null;
alter table public.community_notification_events enable row level security;
revoke all on public.community_notification_events from anon, authenticated;

-- Datos PRIVADOS ligados a un perfil seudónimo (no son contenido público): borradores (y sus fotos), búsquedas, visitas, progreso de lectura, temas favoritos,
-- avisos pendientes, guardados, seguimientos y bloqueos. Se borran al eliminar la cuenta y al «borrar todo lo mío».
create or replace function private.community_purge_private_data(p_cp uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.community_queue_media_deletion(array(select jsonb_array_elements_text(d.photos) from public.community_drafts d where d.profile_id = p_cp));
  delete from public.community_drafts where profile_id = p_cp;
  delete from public.community_search_history where profile_id = p_cp;
  delete from public.community_post_visits where profile_id = p_cp;
  delete from public.community_comment_seen where profile_id = p_cp;
  delete from public.community_favorite_topics where profile_id = p_cp;
  delete from public.community_notification_events where profile_id = p_cp;
  delete from public.community_conversation_follows where profile_id = p_cp;
  delete from public.community_saves where profile_id = p_cp;
  delete from public.community_user_follows where follower_id = p_cp;
  delete from public.community_blocks where blocker_id = p_cp;
end;
$$;
revoke execute on function private.community_purge_private_data(uuid) from public, anon, authenticated;

create table public.community_notice_state (
  profile_id uuid primary key references public.community_profiles(id) on delete cascade,
  last_notice_at timestamptz,
  last_notice_id uuid,
  last_suggestion_at timestamptz
);
alter table public.community_notice_state enable row level security;
revoke all on public.community_notice_state from anon, authenticated;

create or replace function private.community_comment_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.community_posts%rowtype;
  v_reply_author uuid;
  r record;
begin
  if new.status <> 'published' then
    return null;
  end if;
  select * into v_post from public.community_posts p where p.id = new.post_id;
  if not found or v_post.status <> 'published' then
    return null;
  end if;
  if new.reply_to_id is not null then
    select c.author_id into v_reply_author from public.community_comments c where c.id = new.reply_to_id;
  end if;
  -- Un solo evento por persona y comentario, con prioridad: respuesta directa > mi publicación > conversación seguida.
  for r in
    select x.profile_id, min(x.pri) as pri, (array_agg(x.source order by x.pri))[1] as source from (
      select v_reply_author as profile_id, 1 as pri, 'reply' as source where v_reply_author is not null
      union all select v_post.author_id, 2, 'own_post'
      union all select f.profile_id, 3, 'followed' from public.community_conversation_follows f where f.post_id = new.post_id
    ) x
    where x.profile_id is not null and x.profile_id <> new.author_id
      and exists (select 1 from public.community_profiles cp where cp.id = x.profile_id and cp.user_id is not null and cp.deleted_at is null and not cp.is_official)
      and not exists (select 1 from public.community_blocks b where (b.blocker_id = x.profile_id and b.blocked_id = new.author_id) or (b.blocker_id = new.author_id and b.blocked_id = x.profile_id))
    group by x.profile_id
  loop
    insert into public.community_notification_events (profile_id, post_id, comment_id, source) values (r.profile_id, new.post_id, new.id, r.source) on conflict do nothing;
  end loop;
  return null;
end;
$$;
revoke execute on function private.community_comment_events() from public, anon, authenticated;
create trigger community_comments_events after insert on public.community_comments for each row execute function private.community_comment_events();

-- Trabajo programado (cada 5 min): un aviso AGRUPADO por persona cuando toca según sus reglas.
create or replace function private.community_run_notices()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_user uuid;
  v_state public.community_notice_state%rowtype;
  v_opened boolean;
  v_wait interval;
  v_total integer;
  v_posts integer;
  v_first_post uuid;
  v_first_comment uuid;
  v_title text;
  v_breakdown jsonb;
  v_url text;
  v_id uuid;
  v_sent integer := 0;
begin
  for r in select distinct e.profile_id from public.community_notification_events e where e.notified_at is null loop
    begin
      select cp.user_id into v_user from public.community_profiles cp where cp.id = r.profile_id;
      continue when v_user is null;
      continue when not private.community_in_personal_window(v_user);
      select * into v_state from public.community_notice_state s where s.profile_id = r.profile_id;
      if found and v_state.last_notice_at is not null then
        select exists (select 1 from public.user_notifications n where n.id = v_state.last_notice_id and n.read_at is not null) into v_opened;
        v_wait := case when v_opened then interval '1 hour' else interval '2 hours' end;
        continue when now() < v_state.last_notice_at + v_wait;
      end if;

      -- Solo comentarios que SIGUEN sin verse y siguen publicados.
      select jsonb_agg(jsonb_build_object('post_id', g.post_id, 'title', g.title, 'count', g.n, 'first_comment_id', g.first_comment) order by g.last_at desc),
             coalesce(sum(g.n), 0)::integer, count(*)::integer
      into v_breakdown, v_total, v_posts
      from (
        select e.post_id, p.title, count(*)::integer as n, (array_agg(e.comment_id order by c.created_at))[1] as first_comment, max(c.created_at) as last_at
        from public.community_notification_events e
        join public.community_comments c on c.id = e.comment_id and c.status = 'published'
        join public.community_posts p on p.id = e.post_id and p.status = 'published'
        where e.profile_id = r.profile_id and e.notified_at is null
          and not exists (select 1 from public.community_comment_seen s where s.profile_id = r.profile_id and s.comment_id = e.comment_id)
        group by e.post_id, p.title
      ) g;

      update public.community_notification_events set notified_at = now() where profile_id = r.profile_id and notified_at is null;
      continue when coalesce(v_total, 0) = 0;

      if v_posts = 1 then
        v_first_post := (v_breakdown -> 0 ->> 'post_id')::uuid;
        v_first_comment := (v_breakdown -> 0 ->> 'first_comment_id')::uuid;
        v_title := case when v_total = 1 then 'Un comentario nuevo en «' || left(v_breakdown -> 0 ->> 'title', 60) || '»'
                        else v_total || ' comentarios nuevos en «' || left(v_breakdown -> 0 ->> 'title', 60) || '»' end;
        v_url := '/comunidad/p/' || v_first_post || '?nuevos=1&c=' || v_first_comment;
      else
        v_title := v_total || ' comentarios nuevos en ' || v_posts || ' conversaciones';
        v_url := '/comunidad/novedades';
      end if;
      v_id := private.notify_user(v_user, 'personal', 'community_digest', v_title, 'Toca para verlos', v_url, 'community-digest', 'digest:' || r.profile_id || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint, true,
                                  jsonb_build_object('breakdown', v_breakdown, 'total', v_total));
      insert into public.community_notice_state (profile_id, last_notice_at, last_notice_id) values (r.profile_id, now(), v_id)
      on conflict (profile_id) do update set last_notice_at = now(), last_notice_id = excluded.last_notice_id;
      v_sent := v_sent + 1;
    exception when others then
      raise warning 'community_run_notices (%): %', r.profile_id, sqlerrm;
    end;
  end loop;
  delete from public.community_notification_events where notified_at < now() - interval '3 days';
  return v_sent;
end;
$$;
revoke execute on function private.community_run_notices() from public, anon, authenticated;

-- Desglose por conversación (lo que enseña el aviso agrupado): comentarios sin ver en mis publicaciones, conversaciones que sigo y respuestas a mis comentarios.
-- Se calcula en vivo: abrirlo no marca nada como visto.
create or replace function public.community_news_breakdown()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_cp();
begin
  if not private.community_launched() and not private.community_is_admin() then
    raise exception 'NOT_LAUNCHED' using errcode = 'P0001';
  end if;
  if v_cp is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('post_id', g.post_id, 'title', g.title, 'count', g.n, 'first_comment_id', g.first_comment) order by g.last_at desc)
    from (
      select p.id as post_id, p.title, count(*)::integer as n, (array_agg(c.id order by c.created_at))[1] as first_comment, max(c.created_at) as last_at
      from public.community_comments c join public.community_posts p on p.id = c.post_id and p.status = 'published'
      where c.status = 'published' and c.author_id <> v_cp
        and not exists (select 1 from public.community_comment_seen s where s.profile_id = v_cp and s.comment_id = c.id)
        and not exists (select 1 from public.community_blocks b where (b.blocker_id = v_cp and b.blocked_id = c.author_id) or (b.blocker_id = c.author_id and b.blocked_id = v_cp))
        and (p.author_id = v_cp
             or exists (select 1 from public.community_conversation_follows f where f.profile_id = v_cp and f.post_id = p.id)
             or exists (select 1 from public.community_comments mine where mine.id = c.reply_to_id and mine.author_id = v_cp))
        and c.created_at > now() - interval '30 days'
      group by p.id, p.title
    ) g
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.community_news_breakdown() from public, anon;
grant execute on function public.community_news_breakdown() to authenticated;

-- Seguir a personas: aviso «cada publicación» al momento (opt-in); el modo «inteligente» entra en las sugerencias.
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
           where f.followed_id = new.author_id and f.notify_mode = 'every' and cp.user_id is not null
             and not exists (select 1 from public.community_blocks b where b.blocker_id = new.author_id and b.blocked_id = f.follower_id) loop
    perform private.notify_user(r.user_id, 'other', 'community_followed_post',
      (select cp2.alias from public.community_profiles cp2 where cp2.id = new.author_id) || ' ha publicado', new.title, '/comunidad/p/' || new.id, null, 'follow-every:' || new.id, true);
  end loop;
  return null;
end;
$$;
revoke execute on function private.community_followed_post() from public, anon, authenticated;
create trigger community_posts_followed after insert on public.community_posts for each row execute function private.community_followed_post();

-- Sugerencias generales (cada ~48 h por persona, solo 08:00-21:00 de su zona horaria). Primero lo nuevo de personas seguidas en modo «inteligente»; si no,
-- lo mejor para ella entre lo que aún no ha abierto. Nunca se acumulan avisos retenidos fuera de franja.
create or replace function private.community_run_suggestions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_post public.community_posts%rowtype;
  v_every integer;
  v_sent integer := 0;
begin
  for r in
    select cp.id as cp_id, cp.user_id, coalesce(np.community_suggestion_every_hours, 48) as every_h, ns.last_suggestion_at
    from public.community_profiles cp
    left join public.user_notification_prefs np on np.profile_id = cp.user_id
    left join public.community_notice_state ns on ns.profile_id = cp.id
    where cp.user_id is not null and cp.deleted_at is null and not cp.is_official and cp.rules_accepted_at is not null
      and coalesce(np.community_suggestions_enabled, true)
      and (ns.last_suggestion_at is null or ns.last_suggestion_at < now() - make_interval(hours => coalesce(np.community_suggestion_every_hours, 48)))
  loop
    begin
      continue when not private.community_in_general_window(r.user_id);
      continue when private.community_ban_state(r.cp_id) <> 'ok';
      v_post := null;
      select p.* into v_post from public.community_posts p join public.community_user_follows f on f.followed_id = p.author_id and f.follower_id = r.cp_id and f.notify_mode = 'smart'
      where p.status = 'published' and p.created_at > coalesce(r.last_suggestion_at, now() - interval '7 days')
        and not exists (select 1 from public.community_post_visits v where v.profile_id = r.cp_id and v.post_id = p.id)
      order by p.created_at desc limit 1;
      if v_post.id is null then
        select p.* into v_post from public.community_posts p
        where p.status = 'published' and p.author_id <> r.cp_id and p.created_at > now() - interval '14 days'
          and not exists (select 1 from public.community_post_visits v where v.profile_id = r.cp_id and v.post_id = p.id)
          and not exists (select 1 from public.community_blocks b where b.blocker_id = r.cp_id and b.blocked_id = p.author_id)
        order by (p.like_count + p.comment_count * 2 + p.save_count * 2
                  + case when exists (select 1 from public.community_favorite_topics ft where ft.profile_id = r.cp_id and ft.topic_id = p.topic_id) then 6 else 0 end) desc,
                 p.created_at desc
        limit 1;
      end if;
      continue when v_post.id is null;
      perform private.notify_user(r.user_id, 'other', 'community_suggestion', 'Para ti en Comunidad', v_post.title, '/comunidad/p/' || v_post.id, null, 'suggest:' || v_post.id, true);
      insert into public.community_notice_state (profile_id, last_suggestion_at) values (r.cp_id, now())
      on conflict (profile_id) do update set last_suggestion_at = now();
      v_sent := v_sent + 1;
    exception when others then
      raise warning 'community_run_suggestions (%): %', r.cp_id, sqlerrm;
    end;
  end loop;
  return v_sent;
end;
$$;
revoke execute on function private.community_run_suggestions() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'community-run-notices') then
    perform cron.unschedule('community-run-notices');
  end if;
  perform cron.schedule('community-run-notices', '*/5 * * * *', 'select private.community_run_notices()');
  if exists (select 1 from cron.job where jobname = 'community-run-suggestions') then
    perform cron.unschedule('community-run-suggestions');
  end if;
  perform cron.schedule('community-run-suggestions', '17,47 * * * *', 'select private.community_run_suggestions()');
end $$;
