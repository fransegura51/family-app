-- COMUNIDAD PEPA — núcleo de datos: perfiles públicos con alias, temas, publicaciones, fotos, comentarios, reacciones, guardados, seguimientos, bloqueos,
-- denuncias, avisos y expulsiones, historial de administración, borradores, búsquedas, lectura, recetas públicas y su cola de borrado de fotos.
--
-- Diseño de seguridad (lo más importante de esta migración):
--  · NINGUNA tabla de Comunidad es accesible directamente desde la app (RLS activo y sin políticas; se revoca todo a anon/authenticated). Todo el acceso pasa por
--    funciones SECURITY DEFINER (migraciones 0265 en adelante) que aplican las reglas: alias obligatorio para participar, expulsiones, bloqueos, límites de
--    uso y qué se enseña de cada publicación.
--  · Los datos de las familias (tablas privadas) NO se tocan ni se leen aquí: la identidad pública es una tabla propia (community_profiles) que NO guarda el
--    nombre real, ni la familia, ni el correo. Se enlaza solo con el identificador de la cuenta (auth.users) y se desenlaza al borrar la cuenta.
--  · Borrar la cuenta (0256) pone user_id a null por la clave foránea ON DELETE SET NULL y un trigger anula alias y avatar: lo publicado queda como
--    «Usuario eliminado», sin perfil accesible ni identidad pública.
--
-- Esta migración solo CREA cosas nuevas: no cambia ninguna tabla ni función existente.

-- ---------------------------------------------------------------------------------------------
-- Parámetros ajustables (los administradores de Comunidad los pueden leer; solo el servidor los cambia en esta fase).
-- ---------------------------------------------------------------------------------------------
create table public.community_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);
alter table public.community_settings enable row level security;
revoke all on public.community_settings from anon, authenticated;

insert into public.community_settings (key, value, description) values
  ('summary_comment_threshold', '15', 'Con este número de comentarios o más se muestra el resumen de Pepa y la conversación empieza plegada (COM-140).'),
  ('summary_refresh_every', '10', 'Comentarios nuevos que hacen falta para actualizar el resumen de Pepa (COM-143).'),
  ('pepa_unanswered_hours', '6', 'Horas sin respuesta humana tras las que Pepa puede responder sola.'),
  ('pepa_max_per_hour', '3', 'Intervenciones no solicitadas de Pepa por hora móvil; la cuarta avisa a los administradores.'),
  ('report_autohide_distinct_reporters', '3', 'Denunciantes distintos con motivo dañino que ocultan provisionalmente un contenido hasta que lo revise un administrador.'),
  ('rate_posts_per_hour', '10', 'Publicaciones por persona y hora.'),
  ('rate_comments_per_10min', '30', 'Comentarios por persona cada 10 minutos.'),
  ('rate_reports_per_day', '20', 'Denuncias por persona y día.'),
  ('draft_days', '30', 'Días que se conserva un borrador guardado a mano.'),
  ('first_ban_days', '30', 'Duración de la primera expulsión (a la tercera advertencia).'),
  ('max_photos_per_post', '5', 'Fotos por publicación.'),
  ('max_links_per_post', '10', 'Enlaces por publicación o comentario.'),
  ('search_history_size', '10', 'Búsquedas recientes que se guardan por persona.'),
  ('admin_log_retention_years', '5', 'Años que se conserva el historial de acciones de administración (retención técnica; no se edita ni se borra desde la app).');

-- ---------------------------------------------------------------------------------------------
-- Temas (catálogo fijo). «Anécdotas» NO es un tema ni una sección: es un tipo de publicación.
-- ---------------------------------------------------------------------------------------------
create table public.community_topics (
  id text primary key,
  section text not null check (section in ('recetas', 'hogar')),
  label text not null,
  sort_order integer not null
);
alter table public.community_topics enable row level security;
revoke all on public.community_topics from anon, authenticated;

insert into public.community_topics (id, section, label, sort_order) values
  ('platos-principales', 'recetas', 'Platos principales', 1),
  ('entrantes-aperitivos-tapas', 'recetas', 'Entrantes, aperitivos y tapas', 2),
  ('recetas-faciles', 'recetas', 'Recetas fáciles', 3),
  ('postres-dulces', 'recetas', 'Postres y dulces', 4),
  ('cocina-saludable', 'recetas', 'Cocina saludable', 5),
  ('menus-planificacion', 'recetas', 'Menús y planificación', 6),
  ('trucos-de-cocina', 'recetas', 'Trucos de cocina', 7),
  ('aprovechamiento-alimentos', 'recetas', 'Aprovechamiento de alimentos', 8),
  ('ahorro-economia', 'hogar', 'Ahorro y economía', 1),
  ('organizacion-familiar', 'hogar', 'Organización familiar', 2),
  ('crianza-educacion', 'hogar', 'Crianza y educación', 3),
  ('limpieza-hogar', 'hogar', 'Limpieza y hogar', 4),
  ('actividades-familia', 'hogar', 'Actividades en familia', 5),
  ('manualidades-decoracion', 'hogar', 'Manualidades y decoración', 6);

-- ---------------------------------------------------------------------------------------------
-- Identidad pública. NO contiene el nombre real, la familia ni el correo.
-- ---------------------------------------------------------------------------------------------
create table public.community_profiles (
  id uuid primary key default gen_random_uuid(),
  -- null cuando la cuenta se borra (ON DELETE SET NULL) o para las identidades oficiales.
  user_id uuid unique references auth.users(id) on delete set null,
  alias text,
  alias_key text generated always as (lower(alias)) stored,
  avatar_emoji text check (avatar_emoji is null or char_length(avatar_emoji) <= 16),
  is_official boolean not null default false,
  rules_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  alias_changed_at timestamptz,
  deleted_at timestamptz,
  constraint community_alias_format check (alias is null or alias ~ '^[A-Za-zÀ-ÿ0-9_. -]{3,24}$')
);
create unique index idx_community_profiles_alias_key on public.community_profiles (alias_key) where alias is not null;
alter table public.community_profiles enable row level security;
revoke all on public.community_profiles from anon, authenticated;

-- Identidades oficiales marcadas (no son usuarios falsos: no tienen cuenta ni actividad social).
insert into public.community_profiles (id, alias, is_official, avatar_emoji, rules_accepted_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'Equipo PEPA', true, '🏡', now()),
  ('00000000-0000-4000-8000-0000000000a2', 'Pepa', true, '👵', now());

-- Al desligar la cuenta (borrado): sin alias, sin avatar y marcado como eliminado. Lo publicado queda como «Usuario eliminado».
create or replace function private.community_profile_on_unlink()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.user_id is not null and new.user_id is null and not new.is_official then
    new.alias := null;
    new.avatar_emoji := null;
    new.deleted_at := coalesce(new.deleted_at, now());
  end if;
  return new;
end;
$$;
revoke execute on function private.community_profile_on_unlink() from public, anon, authenticated;
create trigger community_profiles_on_unlink before update of user_id on public.community_profiles
  for each row execute function private.community_profile_on_unlink();

-- ---------------------------------------------------------------------------------------------
-- Recetas públicas (copia INDEPENDIENTE de la receta privada de una familia: nunca guarda el id de la receta privada).
-- ---------------------------------------------------------------------------------------------
create table public.community_recipes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.community_profiles(id),
  title text not null check (char_length(btrim(title)) between 3 and 140),
  servings numeric(4, 1),
  ingredients jsonb not null default '[]'::jsonb check (jsonb_typeof(ingredients) = 'array' and jsonb_array_length(ingredients) <= 80),
  steps text not null default '' check (char_length(steps) <= 10000),
  tags text[] not null default '{}' check (cardinality(tags) <= 12),
  photo_path text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.community_recipes enable row level security;
revoke all on public.community_recipes from anon, authenticated;

create table public.community_recipe_versions (
  recipe_id uuid not null references public.community_recipes(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  primary key (recipe_id, version)
);
alter table public.community_recipe_versions enable row level security;
revoke all on public.community_recipe_versions from anon, authenticated;

create table public.community_recipe_ratings (
  recipe_id uuid not null references public.community_recipes(id) on delete cascade,
  profile_id uuid not null references public.community_profiles(id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  review text check (review is null or char_length(review) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (recipe_id, profile_id)
);
alter table public.community_recipe_ratings enable row level security;
revoke all on public.community_recipe_ratings from anon, authenticated;

-- Una importación por familia y receta (para contar FAMILIAS distintas y evitar repeticiones artificiales).
create table public.community_recipe_imports (
  recipe_id uuid not null references public.community_recipes(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  imported_by uuid references public.profiles(id) on delete set null,
  imported_version integer not null,
  imported_at timestamptz not null default now(),
  primary key (recipe_id, family_id)
);
alter table public.community_recipe_imports enable row level security;
revoke all on public.community_recipe_imports from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Publicaciones.
-- ---------------------------------------------------------------------------------------------
create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.community_profiles(id),
  kind text not null check (kind in ('receta', 'pregunta', 'consejo', 'anecdota')),
  section text not null check (section in ('recetas', 'hogar')),
  topic_id text not null references public.community_topics(id),
  title text not null check (char_length(btrim(title)) between 3 and 140),
  body text not null default '' check (char_length(body) <= 10000),
  recipe_id uuid references public.community_recipes(id),
  status text not null default 'published' check (status in ('published', 'hidden', 'deleted')),
  hidden_reason text,
  hidden_at timestamptz,
  hidden_by uuid,
  -- Contenido oficial (Equipo PEPA / Pepa). Etiqueta visible: «Artículo de Equipo PEPA», etc.
  is_official boolean not null default false,
  official_label text,
  official_item_id uuid,
  article_sources jsonb,
  featured_at timestamptz,
  featured_removed_at timestamptz,
  like_count integer not null default 0,
  comment_count integer not null default 0,
  save_count integer not null default 0,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  last_activity_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('spanish'::regconfig, coalesce(title, '') || ' ' || coalesce(body, ''))) stored,
  constraint community_posts_recipe_only_in_recipes check (kind <> 'receta' or (section = 'recetas' and recipe_id is not null))
);
create index idx_community_posts_feed on public.community_posts (section, topic_id, created_at desc) where status = 'published';
create index idx_community_posts_recent on public.community_posts (created_at desc) where status = 'published';
create index idx_community_posts_activity on public.community_posts (last_activity_at desc) where status = 'published';
create index idx_community_posts_author on public.community_posts (author_id, created_at desc);
create index idx_community_posts_search on public.community_posts using gin (search);
alter table public.community_posts enable row level security;
revoke all on public.community_posts from anon, authenticated;

create or replace function private.community_posts_check_topic()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.community_topics t where t.id = new.topic_id and t.section = new.section) then
    raise exception 'TOPIC_SECTION_MISMATCH' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function private.community_posts_check_topic() from public, anon, authenticated;
create trigger community_posts_check_topic before insert or update of topic_id, section on public.community_posts
  for each row execute function private.community_posts_check_topic();

create table public.community_post_photos (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  storage_path text not null unique,
  position integer not null check (position between 1 and 5),
  unique (post_id, position)
);
alter table public.community_post_photos enable row level security;
revoke all on public.community_post_photos from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Comentarios: un solo nivel de respuestas (parent_id siempre apunta a un comentario raíz; reply_to_id guarda a quién se contesta).
-- ---------------------------------------------------------------------------------------------
create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references public.community_profiles(id),
  parent_id uuid references public.community_comments(id),
  reply_to_id uuid references public.community_comments(id),
  body text not null default '' check (char_length(body) <= 2000),
  photo_path text,
  status text not null default 'published' check (status in ('published', 'hidden', 'deleted')),
  hidden_reason text,
  hidden_at timestamptz,
  hidden_by uuid,
  like_count integer not null default 0,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index idx_community_comments_post on public.community_comments (post_id, created_at);
create index idx_community_comments_parent on public.community_comments (parent_id) where parent_id is not null;
create index idx_community_comments_author on public.community_comments (author_id, created_at desc);
alter table public.community_comments enable row level security;
revoke all on public.community_comments from anon, authenticated;

create or replace function private.community_comments_one_level()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent_parent uuid;
  v_parent_post uuid;
begin
  if new.parent_id is not null then
    select c.parent_id, c.post_id into v_parent_parent, v_parent_post from public.community_comments c where c.id = new.parent_id;
    if not found or v_parent_parent is not null or v_parent_post <> new.post_id then
      raise exception 'REPLY_LEVEL' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.community_comments_one_level() from public, anon, authenticated;
create trigger community_comments_one_level before insert on public.community_comments
  for each row execute function private.community_comments_one_level();

-- ---------------------------------------------------------------------------------------------
-- Reacciones, guardados y seguimientos.
-- ---------------------------------------------------------------------------------------------
create table public.community_post_likes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  profile_id uuid not null references public.community_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);
create table public.community_comment_likes (
  comment_id uuid not null references public.community_comments(id) on delete cascade,
  profile_id uuid not null references public.community_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, profile_id)
);
create table public.community_saves (
  profile_id uuid not null references public.community_profiles(id) on delete cascade,
  post_id uuid not null references public.community_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, post_id)
);
create table public.community_user_follows (
  follower_id uuid not null references public.community_profiles(id) on delete cascade,
  followed_id uuid not null references public.community_profiles(id) on delete cascade,
  notify_mode text not null default 'smart' check (notify_mode in ('smart', 'every', 'off')),
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);
create table public.community_conversation_follows (
  profile_id uuid not null references public.community_profiles(id) on delete cascade,
  post_id uuid not null references public.community_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, post_id)
);
create table public.community_blocks (
  blocker_id uuid not null references public.community_profiles(id) on delete cascade,
  blocked_id uuid not null references public.community_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index idx_community_blocks_blocked on public.community_blocks (blocked_id);
create index idx_community_saves_post on public.community_saves (post_id);
create index idx_community_user_follows_followed on public.community_user_follows (followed_id);
create index idx_community_post_likes_profile on public.community_post_likes (profile_id);

alter table public.community_post_likes enable row level security;
alter table public.community_comment_likes enable row level security;
alter table public.community_saves enable row level security;
alter table public.community_user_follows enable row level security;
alter table public.community_conversation_follows enable row level security;
alter table public.community_blocks enable row level security;
revoke all on public.community_post_likes, public.community_comment_likes, public.community_saves, public.community_user_follows,
  public.community_conversation_follows, public.community_blocks from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Moderación: denuncias, advertencias, expulsiones y historial de administración.
-- ---------------------------------------------------------------------------------------------
create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.community_profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment', 'user')),
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'acoso', 'violencia', 'sexual', 'ilegal', 'datos_privados', 'enganoso', 'otro')),
  detail text check (detail is null or char_length(detail) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolution text check (resolution is null or resolution in ('sin_accion', 'oculto', 'advertencia', 'expulsion', 'otro')),
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
create index idx_community_reports_target on public.community_reports (target_type, target_id);
create index idx_community_reports_open on public.community_reports (created_at) where status = 'open';
alter table public.community_reports enable row level security;
revoke all on public.community_reports from anon, authenticated;

create table public.community_warnings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.community_profiles(id) on delete cascade,
  reason text not null,
  report_id uuid references public.community_reports(id) on delete set null,
  target_type text,
  target_id uuid,
  issued_by uuid not null,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text
);
create index idx_community_warnings_profile on public.community_warnings (profile_id) where revoked_at is null;
alter table public.community_warnings enable row level security;
revoke all on public.community_warnings from anon, authenticated;

create table public.community_bans (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.community_profiles(id) on delete cascade,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  reason text not null,
  created_by uuid not null,
  -- Tras cumplirse el plazo, la persona pide la readmisión y la resuelve la administración.
  readmission_status text not null default 'none' check (readmission_status in ('none', 'requested', 'approved', 'rejected')),
  readmission_requested_at timestamptz,
  readmission_note text,
  readmission_resolved_by uuid,
  readmission_resolved_at timestamptz,
  lifted_at timestamptz,
  lifted_by uuid,
  lift_reason text
);
create index idx_community_bans_profile on public.community_bans (profile_id, starts_at desc);
alter table public.community_bans enable row level security;
revoke all on public.community_bans from anon, authenticated;

-- Historial de acciones de administración: NO editable ni borrable (ni siquiera por quien tenga acceso a la tabla): lo impide un trigger.
-- La única excepción es la retención técnica programada (private.purge_community_admin_log), que borra entradas de más de N años.
create table public.community_admin_log (
  id bigserial primary key,
  actor_id uuid not null,
  action text not null check (char_length(action) between 1 and 80),
  target_type text,
  target_id uuid,
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_community_admin_log_created on public.community_admin_log (created_at desc);
alter table public.community_admin_log enable row level security;
revoke all on public.community_admin_log from anon, authenticated;

create or replace function private.community_admin_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_setting('app.allow_admin_log_purge', true) = 'on' then
    return old;
  end if;
  raise exception 'El historial de administración no se puede editar ni borrar' using errcode = '42501';
end;
$$;
revoke execute on function private.community_admin_log_immutable() from public, anon, authenticated;
create trigger community_admin_log_no_update before update or delete on public.community_admin_log
  for each row execute function private.community_admin_log_immutable();

create or replace function private.purge_community_admin_log()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_years integer;
begin
  select coalesce((s.value #>> '{}')::integer, 5) into v_years from public.community_settings s where s.key = 'admin_log_retention_years';
  perform set_config('app.allow_admin_log_purge', 'on', true);
  delete from public.community_admin_log where created_at < now() - make_interval(years => coalesce(v_years, 5));
  perform set_config('app.allow_admin_log_purge', 'off', true);
end;
$$;
revoke execute on function private.purge_community_admin_log() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Borradores (30 días desde el último guardado MANUAL), búsquedas recientes y progreso de lectura.
-- ---------------------------------------------------------------------------------------------
create table public.community_drafts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.community_profiles(id) on delete cascade,
  kind text not null check (kind in ('receta', 'pregunta', 'consejo', 'anecdota')),
  section text check (section is null or section in ('recetas', 'hogar')),
  topic_id text references public.community_topics(id),
  title text not null default '' check (char_length(title) <= 140),
  body text not null default '' check (char_length(body) <= 10000),
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 5),
  recipe jsonb,
  -- Último guardado MANUAL: de aquí salen los 30 días.
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index idx_community_drafts_profile on public.community_drafts (profile_id, saved_at desc);
create index idx_community_drafts_expiry on public.community_drafts (saved_at);
alter table public.community_drafts enable row level security;
revoke all on public.community_drafts from anon, authenticated;

create table public.community_search_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.community_profiles(id) on delete cascade,
  query text not null check (char_length(query) between 1 and 120),
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_community_search_history_profile on public.community_search_history (profile_id, created_at desc);
alter table public.community_search_history enable row level security;
revoke all on public.community_search_history from anon, authenticated;

-- Progreso privado de lectura: comentarios que la persona ha visto de verdad (la app lo marca solo tras exposición razonable en pantalla).
create table public.community_comment_seen (
  profile_id uuid not null references public.community_profiles(id) on delete cascade,
  comment_id uuid not null references public.community_comments(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (profile_id, comment_id)
);
alter table public.community_comment_seen enable row level security;
revoke all on public.community_comment_seen from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Cola de borrado de fotos (el borrado físico lo hace la función de servidor community-maintenance con la API de Storage: borrar filas de
-- storage.objects por SQL deja el archivo en el almacenamiento).
-- ---------------------------------------------------------------------------------------------
create table public.community_media_deletions (
  id uuid primary key default gen_random_uuid(),
  bucket text not null default 'community-media',
  path text not null,
  requested_at timestamptz not null default now(),
  done_at timestamptz
);
create index idx_community_media_deletions_pending on public.community_media_deletions (requested_at) where done_at is null;
alter table public.community_media_deletions enable row level security;
revoke all on public.community_media_deletions from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Solicitudes de eliminación de contenido (derecho de supresión): las revisa la administración y quedan registradas.
-- ---------------------------------------------------------------------------------------------
create table public.community_removal_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.community_profiles(id) on delete set null,
  requester_contact text check (requester_contact is null or char_length(requester_contact) <= 200),
  scope text not null check (scope in ('all_my_content', 'specific')),
  target_type text check (target_type is null or target_type in ('post', 'comment')),
  target_id uuid,
  detail text check (detail is null or char_length(detail) <= 2000),
  status text not null default 'open' check (status in ('open', 'done', 'rejected')),
  handled_by uuid,
  handled_at timestamptz,
  handled_note text,
  created_at timestamptz not null default now()
);
alter table public.community_removal_requests enable row level security;
revoke all on public.community_removal_requests from anon, authenticated;
