-- Rollback de 0217_join_family_code_mismatch_hint.sql: restaura join_family_with_code() a su cuerpo
-- original (sin la comprobación contra family_invites ni el mensaje específico).
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
