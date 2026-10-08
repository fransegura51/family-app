-- Bug real (confusión reportada 2026-10-08): la app tiene DOS sistemas de código de un solo uso con
-- nombres parecidos — uno en family_invites (migración 0093, "Panel de admin", para CREAR una familia
-- nueva) y otro en family_members.invite_code (esta misma migración 0032, para UNIRSE a una familia ya
-- existente). Un código del primero escrito en la pantalla "Ya tengo un código de invitación" (que solo
-- consulta el segundo) daba el mismo "Código no válido o caducado" que un código realmente inventado o
-- caducado, sin ninguna pista de dónde sí era válido.
--
-- join_family_with_code ahora, SOLO cuando no encuentra el código en family_members, comprueba si existe
-- sin usar y sin caducar en family_invites — y si es así, avisa específicamente de que ese código es para
-- "Crear una familia nueva", en vez del genérico "no válido o caducado". No cambia ninguna otra regla
-- (sigue exigiendo sesión iniciada, sigue sin dejar re-unirse a quien ya tiene profile, sigue sin
-- consumir ni tocar family_invites — ese código se queda intacto para que lo use donde corresponde).
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
    if exists (
      select 1 from family_invites
      where code = upper(trim(p_code)) and used_at is null and expires_at > now()
    ) then
      raise exception 'Este código es para crear una familia nueva — pruébalo en "Crear una familia nueva", no aquí';
    end if;
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
