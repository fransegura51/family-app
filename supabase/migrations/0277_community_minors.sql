-- COMUNIDAD PEPA — acceso de menores (regla aprobada por la dueña el 15/10/2026; sustituye a la antigua regla «solo adultos»).
--
--   · Menores de 15 años: NO acceden a Comunidad (ni leer, ni publicar, ni comentar, ni participar de ninguna forma).
--   · De 15 a 17 años: solo si la persona administradora de la familia lo autoriza, con DOS permisos independientes por persona (ambos desactivados por defecto):
--       1) «Permitir leer Comunidad»: consultar publicaciones y conversaciones, sin publicar ni interactuar.
--       2) «Permitir participar en Comunidad»: publicar, comentar, valorar recetas, guardar, seguir conversaciones, bloquear, etc. EXIGE también poder leer.
--   · Desde 18 años: acceso normal (alias, reglas, moderación).
--
-- Cómo se calcula la edad («datos reales»): fecha de nacimiento de la ficha de familia enlazada a la cuenta (family_members.birth_date, linked_profile_id).
--   · Sin fecha de nacimiento: una cuenta titular (rol admin/adult) se considera adulta (la familia la dio de alta como tal); una cuenta de rol child/guest, o enlazada a una
--     ficha de niño/bebé, NO tiene acceso hasta que se añada su fecha de nacimiento.
--   · La fecha es declarada por la familia (no se verifica con documentos): es una limitación conocida, documentada en docs/comunidad.
--   · Esta regla NO depende de la futura categoría «Joven» ni cambia las categorías Bebé/Niño/Adulto.
--
-- La seguridad NO depende de ocultar botones: TODAS las funciones de lectura llaman a private.community_require_reader() y TODAS las de escritura a
-- private.community_require_participant(), que recalculan el acceso en cada llamada. Revocar un permiso corta, por tanto, las sesiones ya abiertas.
-- Errores: COMMUNITY_ACCESS_DENIED (sin acceso) y PARTICIPATION_NOT_ALLOWED (solo lectura).
--
-- Deshacer: supabase/rollbacks/0277_community_minors_down.sql (las funciones de 0265-0276 que llaman a estas se deshacen con el resto de Comunidad).

create table public.community_minor_permissions (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  can_read boolean not null default false,
  can_participate boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  check (not can_participate or can_read)
);
alter table public.community_minor_permissions enable row level security;
revoke all on public.community_minor_permissions from anon, authenticated;

-- Registro de quién autorizó o revocó, cuándo y qué (se borra con la cuenta de la persona menor).
create table public.community_minor_permission_log (
  id bigserial primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid,
  can_read boolean not null,
  can_participate boolean not null,
  -- Declaración de quien autoriza: «soy madre/padre/tutor legal de esta persona» (obligatoria al ACTIVAR un permiso).
  guardian_declared boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_community_minor_permission_log_profile on public.community_minor_permission_log (profile_id, created_at desc);
alter table public.community_minor_permission_log enable row level security;
revoke all on public.community_minor_permission_log from anon, authenticated;

-- Contenido de personas no adultas: marcado al crearse y nunca enviado a la IA ni publicado en páginas públicas (ver el final de este archivo).
alter table public.community_posts add column ai_excluded boolean not null default false;
alter table public.community_comments add column ai_excluded boolean not null default false;

-- Declaración de mayoría de edad (solo cuando la edad no consta en la ficha de familia): cuándo la hizo la persona al crear su alias.
alter table public.community_profiles add column adult_declared_at timestamptz;

-- Edad en años de la persona (null = no se puede saber).
create or replace function private.community_age_years(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when fm.birth_date > current_date then null else extract(year from age(current_date, fm.birth_date))::integer end
  from public.family_members fm
  where fm.linked_profile_id = p_user and fm.birth_date is not null
  order by fm.created_at
  limit 1
$$;
revoke execute on function private.community_age_years(uuid) from public, anon, authenticated;

-- Nivel de acceso de una cuenta: 'none' | 'read' | 'participate'.
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
revoke execute on function private.community_access_level(uuid) from public, anon, authenticated;

-- Motivo por el que no hay acceso completo (para explicarlo en pantalla): 'under_15' | 'age_unknown' | 'not_authorized' | 'read_only' | null.
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
revoke execute on function private.community_access_reason(uuid) from public, anon, authenticated;

-- Para leer: Comunidad lanzada (o ser administrador) y acceso de lectura como mínimo.
create or replace function private.community_require_reader()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_level text;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if not private.community_launched() and not private.community_is_admin() then
    raise exception 'NOT_LAUNCHED' using errcode = 'P0001';
  end if;
  v_level := private.community_access_level((select auth.uid()));
  if v_level = 'none' then
    raise exception 'COMMUNITY_ACCESS_DENIED' using errcode = 'P0001';
  end if;
  return v_level;
end;
$$;
revoke execute on function private.community_require_reader() from public, anon, authenticated;

-- Para participar (publicar, comentar, valorar, guardar, seguir, bloquear, denunciar con alias…): acceso completo.
create or replace function private.community_require_participation_access()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_level text := private.community_access_level((select auth.uid()));
begin
  if v_level = 'none' then
    raise exception 'COMMUNITY_ACCESS_DENIED' using errcode = 'P0001';
  elsif v_level = 'read' then
    raise exception 'PARTICIPATION_NOT_ALLOWED' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function private.community_require_participation_access() from public, anon, authenticated;

-- ¿Es adulta a efectos de la IA y de las páginas públicas? Edad conocida >= 18; sin edad: titulares admin/adult cuya ficha no sea de niño/bebé.
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
revoke execute on function private.community_user_is_adult(uuid) from public, anon, authenticated;

-- Subir fotos: acceso completo y no estar expulsado (política de Storage de 0266, sustituida).
create or replace function private.community_can_upload()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.community_cp() is not null
     and private.community_ban_state(private.community_cp()) = 'ok'
     and private.community_access_level((select auth.uid())) = 'participate'
     and private.community_user_is_adult((select auth.uid()))
$$;
revoke execute on function private.community_can_upload() from public, anon;
grant execute on function private.community_can_upload() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Estado para la app (sustituye al de 0271): añade el acceso de la persona.
-- ---------------------------------------------------------------------------------------------
create or replace function public.community_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'launched', private.community_launched(),
    'visible', (private.community_launched() or private.community_is_admin()) and private.community_access_level((select auth.uid())) <> 'none',
    'is_admin', private.community_is_admin(),
    'access', private.community_access_level((select auth.uid())),
    'access_reason', private.community_access_reason((select auth.uid())))
$$;
revoke all on function public.community_status() from public, anon;
grant execute on function public.community_status() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Permisos de Comunidad de las personas de 15 a 17 años (los gestiona la persona administradora de la familia).
-- ---------------------------------------------------------------------------------------------
create or replace function private.community_family_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_family uuid;
begin
  select pr.family_id into v_family from public.profiles pr where pr.id = (select auth.uid()) and pr.role = 'admin';
  if v_family is null then
    raise exception 'NOT_ADMIN' using errcode = 'P0001';
  end if;
  return v_family;
end;
$$;
revoke execute on function private.community_family_admin() from public, anon, authenticated;

-- Personas de la familia con cuenta que NO son adultas (o cuya edad no se conoce) y sus permisos. status:
--   'configurable' (15-17: se pueden dar permisos), 'under_15' (sin acceso posible), 'needs_birthdate' (falta la fecha de nacimiento).
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

-- Acceso de la propia persona (para que la app explique por qué no entra o qué puede hacer).
create or replace function public.community_get_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return jsonb_build_object('level', private.community_access_level((select auth.uid())), 'reason', private.community_access_reason((select auth.uid())),
                            'age_known', private.community_age_years((select auth.uid())) is not null,
                            -- Las personas menores de edad participan SIN fotos (norma de protección de menores).
                            'photos_allowed', private.community_user_is_adult((select auth.uid())));
end;
$$;

revoke all on function public.community_list_minor_permissions() from public, anon;
revoke all on function public.community_set_minor_permission(uuid, boolean, boolean, boolean) from public, anon;
revoke all on function public.community_get_access() from public, anon;
grant execute on function public.community_list_minor_permissions() to authenticated;
grant execute on function public.community_set_minor_permission(uuid, boolean, boolean, boolean) to authenticated;
grant execute on function public.community_get_access() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Fotos privadas: quién puede LEER un archivo del bucket «community-media» (políticas de Storage).
--   · Una foto es «visible» solo si cuelga de contenido PUBLICADO: foto de una publicación publicada, de un comentario publicado (en una publicación publicada)
--     o portada de una receta cuya publicación está publicada. Oculto por moderación, eliminado o sin publicar → no es visible.
--   · Visitantes sin sesión (los usa el Worker de Cloudflare con la clave anónima): solo fotos visibles y con Comunidad lanzada.
--   · Con sesión: fotos visibles si se tiene acceso de lectura (menores sin permiso, no); además las propias (borradores) y, para la administración, todas.
-- ---------------------------------------------------------------------------------------------
create or replace function private.community_photo_visible(p_path text, p_public boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- p_public = true (visitantes sin sesión y buscadores): además se excluye lo escrito por menores, que no tiene página pública.
  select exists (select 1 from public.community_post_photos ph join public.community_posts p on p.id = ph.post_id
                 where ph.storage_path = p_path and p.status = 'published' and not (p_public and p.ai_excluded))
      or exists (select 1 from public.community_comments c join public.community_posts p on p.id = c.post_id
                 where c.photo_path = p_path and c.status = 'published' and p.status = 'published' and not (p_public and (p.ai_excluded or c.ai_excluded)))
      or exists (select 1 from public.community_recipes r join public.community_posts p on p.recipe_id = r.id
                 where r.photo_path = p_path and p.status = 'published' and not (p_public and p.ai_excluded))
$$;
revoke execute on function private.community_photo_visible(text, boolean) from public, anon, authenticated;

create or replace function private.community_can_view_photo(p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return private.community_launched() and private.community_photo_visible(p_path, true);
  end if;
  if private.community_is_admin() then
    return true;
  end if;
  if not private.community_launched() then
    return false;
  end if;
  if private.community_access_level(v_uid) = 'none' then
    return false;
  end if;
  return split_part(p_path, '/', 1) = coalesce(private.community_cp()::text, '-') or private.community_photo_visible(p_path);
end;
$$;
revoke execute on function private.community_can_view_photo(text) from public;
grant execute on function private.community_can_view_photo(text) to anon, authenticated;

create policy "community media: read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'community-media' and (select private.community_can_view_photo(name)));

-- ---------------------------------------------------------------------------------------------
-- Contenido de menores y la IA: las condiciones de la API de Gemini prohíben usarla con personas menores de 18 años. Lo que escribe una cuenta que NO es adulta
-- (por edad conocida o, sin fecha, por rol/ficha de niño) se marca `ai_excluded` al crearse y NUNCA se envía a la IA: ni en los resúmenes de conversaciones, ni
-- Pepa responde a sus preguntas, ni atiende sus menciones. (Los comentarios de adultos en una publicación de un menor tampoco se resumen.)
-- ---------------------------------------------------------------------------------------------
create or replace function private.community_mark_ai_excluded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  select cp.user_id into v_user from public.community_profiles cp where cp.id = new.author_id;
  if v_user is not null then
    new.ai_excluded := not private.community_user_is_adult(v_user);
  end if;
  return new;
end;
$$;
revoke execute on function private.community_mark_ai_excluded() from public, anon, authenticated;
create trigger community_posts_mark_ai_excluded before insert on public.community_posts
  for each row execute function private.community_mark_ai_excluded();
create trigger community_comments_mark_ai_excluded before insert on public.community_comments
  for each row execute function private.community_mark_ai_excluded();

-- Si cambia la fecha de nacimiento, el enlace o el tipo de ficha de una persona, se RECALCULA lo ya publicado (si pasa a ser menor, deja de enviarse a la IA y de
-- tener página pública; si pasa a ser adulta, vuelve a ser normal).
create or replace function private.community_recompute_ai_excluded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid;
  v_excl boolean;
begin
  if new.linked_profile_id is null then
    return null;
  end if;
  select cp.id into v_cp from public.community_profiles cp where cp.user_id = new.linked_profile_id;
  if v_cp is null then
    return null;
  end if;
  v_excl := not private.community_user_is_adult(new.linked_profile_id);
  update public.community_posts set ai_excluded = v_excl where author_id = v_cp and ai_excluded is distinct from v_excl;
  update public.community_comments set ai_excluded = v_excl where author_id = v_cp and ai_excluded is distinct from v_excl;
  return null;
end;
$$;
revoke execute on function private.community_recompute_ai_excluded() from public, anon, authenticated;
create trigger family_members_recompute_ai_excluded after insert or update of birth_date, linked_profile_id, member_type on public.family_members
  for each row execute function private.community_recompute_ai_excluded();

-- ---------------------------------------------------------------------------------------------
-- Aviso a la familia: cuando una persona menor de edad PUBLICA o COMENTA en Comunidad, las personas administradoras de su familia reciben un aviso (sin el texto;
-- solo quién y un enlace). Como mucho uno por hora y menor para no saturar. Nunca bloquea la publicación si el aviso falla.
-- ---------------------------------------------------------------------------------------------
create or replace function private.community_notify_family_minor_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_family uuid;
  v_name text;
  v_kind text := case when tg_table_name = 'community_posts' then 'una publicación' else 'un comentario' end;
  r record;
begin
  if not new.ai_excluded then
    return new;
  end if;
  select cp.user_id into v_user from public.community_profiles cp where cp.id = new.author_id;
  if v_user is null then
    return new;
  end if;
  select pr.family_id, coalesce((select fm.name from public.family_members fm where fm.linked_profile_id = pr.id limit 1), pr.display_name)
    into v_family, v_name from public.profiles pr where pr.id = v_user;
  if v_family is null then
    return new;
  end if;
  for r in select p.id from public.profiles p where p.family_id = v_family and p.role = 'admin' and p.id <> v_user loop
    perform private.notify_user(r.id, 'other', 'community_minor_activity', 'Actividad en Comunidad',
      v_name || ' ha publicado ' || v_kind || ' en Comunidad.', '/comunidad/p/' || coalesce((to_jsonb(new) ->> 'post_id')::uuid, new.id), null,
      'minor-activity:' || new.author_id || ':' || to_char(now(), 'YYYYMMDDHH24') || ':' || r.id, true);
  end loop;
  return new;
exception when others then
  raise warning 'community_notify_family_minor_activity: %', sqlerrm;
  return new;
end;
$$;
revoke execute on function private.community_notify_family_minor_activity() from public, anon, authenticated;
create trigger community_posts_notify_family_minor after insert on public.community_posts
  for each row execute function private.community_notify_family_minor_activity();
create trigger community_comments_notify_family_minor after insert on public.community_comments
  for each row execute function private.community_notify_family_minor_activity();
