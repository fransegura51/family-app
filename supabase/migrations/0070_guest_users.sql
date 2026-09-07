-- Usuarios invitados: preparar la app para compartir secciones
-- concretas (empezando por Galería, petición real de la familia) con
-- gente externa, de cara a poder venderla a otras familias en el
-- futuro. allowed_sections NULL = acceso a todo (así los perfiles ya
-- existentes de admin/adult no pierden nada — no se inventa una
-- restricción para datos ya creados). Un invitado sí lleva su lista
-- explícita de secciones permitidas (rutas de NAV_TABS sin la barra,
-- p. ej. "galeria").

alter table family_members drop constraint if exists family_members_member_type_check;
alter table family_members add constraint family_members_member_type_check
  check (member_type in ('admin', 'adult', 'child', 'baby', 'guest'));
alter table family_members add column allowed_sections text[];

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('admin', 'adult', 'guest'));
alter table profiles add column allowed_sections text[];

create or replace function private.has_section_access(p_section text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select allowed_sections is null or p_section = any(allowed_sections)
  from profiles where id = auth.uid()
$$;

revoke execute on function private.has_section_access(text) from public, anon, authenticated;
grant execute on function private.has_section_access(text) to authenticated;

-- Reutiliza el mismo mecanismo de código de invitación de un solo uso
-- (generate_member_invite_code no cambia, ya es genérico por
-- member_id) — solo se actualiza join_family_with_code para copiar
-- allowed_sections del family_member al profile nuevo, y para que un
-- member_type 'guest' cree un profile con role 'guest' en vez de 'adult'.
create or replace function public.join_family_with_code(p_code text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_member_id uuid;
  v_family_id uuid;
  v_member_type text;
  v_allowed_sections text[];
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;
  if exists (select 1 from profiles where id = v_user_id) then
    raise exception 'El usuario ya pertenece a una familia';
  end if;

  select id, family_id, member_type, allowed_sections into v_member_id, v_family_id, v_member_type, v_allowed_sections
  from family_members
  where invite_code = upper(p_code)
    and invite_code_expires_at > now()
    and linked_profile_id is null;

  if v_member_id is null then
    raise exception 'Código no válido o caducado';
  end if;

  insert into profiles (id, family_id, role, display_name, allowed_sections)
  values (
    v_user_id,
    v_family_id,
    case when v_member_type = 'admin' then 'admin' when v_member_type = 'guest' then 'guest' else 'adult' end,
    p_display_name,
    v_allowed_sections
  );

  update family_members
  set linked_profile_id = v_user_id, invite_code = null, invite_code_expires_at = null
  where id = v_member_id;

  return v_family_id;
end;
$function$;

-- Primer uso real: Galería. Sin has_section_access('galeria'), un
-- invitado sin esa sección no vería fotos ni podría subir/borrar,
-- aunque manipulase la app para saltarse la UI.
drop policy if exists "gallery_photos: family crud" on gallery_photos;
create policy "gallery_photos: family crud" on gallery_photos for all
  using (family_id = private.current_family_id() and private.has_section_access('galeria'))
  with check (family_id = private.current_family_id() and private.has_section_access('galeria'));

drop policy if exists "gallery storage: family select" on storage.objects;
create policy "gallery storage: family select" on storage.objects for select
  using (bucket_id = 'gallery' and (storage.foldername(name))[1] = private.current_family_id()::text and private.has_section_access('galeria'));

drop policy if exists "gallery storage: family insert" on storage.objects;
create policy "gallery storage: family insert" on storage.objects for insert
  with check (bucket_id = 'gallery' and (storage.foldername(name))[1] = private.current_family_id()::text and private.has_section_access('galeria'));

drop policy if exists "gallery storage: family delete" on storage.objects;
create policy "gallery storage: family delete" on storage.objects for delete
  using (bucket_id = 'gallery' and (storage.foldername(name))[1] = private.current_family_id()::text and private.has_section_access('galeria'));
