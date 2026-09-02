-- Permite que un miembro de la familia que todavía no tiene cuenta
-- propia (p. ej. Paco, ligado hasta ahora a la sesión de Jennifer) se
-- cree su propio usuario y quede enlazado a su perfil YA EXISTENTE en
-- la familia, en vez de crear una familia nueva desde cero. El código
-- lo genera el admin (de un solo uso, caduca a las 24h) y la persona
-- lo usa junto con su propio email/contraseña al registrarse — la
-- contraseña nunca pasa por aquí, solo por su propio formulario de
-- alta.
alter table family_members add column invite_code text unique;
alter table family_members add column invite_code_expires_at timestamptz;

create or replace function public.generate_member_invite_code(p_member_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_code text;
  v_family_id uuid;
begin
  select family_id into v_family_id from family_members where id = p_member_id;
  if v_family_id is null or v_family_id <> private.current_family_id() then
    raise exception 'Miembro no encontrado';
  end if;
  if private.current_role_in_family() <> 'admin' then
    raise exception 'Solo el administrador puede generar códigos';
  end if;
  if exists (select 1 from family_members where id = p_member_id and linked_profile_id is not null) then
    raise exception 'Ese miembro ya tiene una cuenta';
  end if;

  v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  update family_members
  set invite_code = v_code, invite_code_expires_at = now() + interval '24 hours'
  where id = p_member_id;

  return v_code;
end;
$function$;

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
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;
  if exists (select 1 from profiles where id = v_user_id) then
    raise exception 'El usuario ya pertenece a una familia';
  end if;

  select id, family_id, member_type into v_member_id, v_family_id, v_member_type
  from family_members
  where invite_code = upper(p_code)
    and invite_code_expires_at > now()
    and linked_profile_id is null;

  if v_member_id is null then
    raise exception 'Código no válido o caducado';
  end if;

  insert into profiles (id, family_id, role, display_name)
  values (v_user_id, v_family_id, case when v_member_type = 'admin' then 'admin' else 'adult' end, p_display_name);

  update family_members
  set linked_profile_id = v_user_id, invite_code = null, invite_code_expires_at = null
  where id = v_member_id;

  return v_family_id;
end;
$function$;
