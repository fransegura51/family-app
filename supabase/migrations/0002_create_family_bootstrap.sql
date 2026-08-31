-- Bootstrap de familia: crea la familia + el perfil admin del usuario que
-- se acaba de registrar, en una sola transacción atómica. No añadimos
-- políticas INSERT abiertas en families/profiles (evita que un usuario
-- pueda insertarse en la familia de otro) — toda alta pasa por esta
-- función, validada en backend (Skill 21/27).

create or replace function public.create_family(p_family_name text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  if exists (select 1 from profiles where id = v_user_id) then
    raise exception 'El usuario ya pertenece a una familia';
  end if;

  insert into families (name) values (p_family_name) returning id into v_family_id;

  insert into profiles (id, family_id, role, display_name)
    values (v_user_id, v_family_id, 'admin', p_display_name);

  insert into family_members (family_id, name, member_type, linked_profile_id)
    values (v_family_id, p_display_name, 'admin', v_user_id);

  return v_family_id;
end;
$$;

revoke all on function public.create_family(text, text) from public;
grant execute on function public.create_family(text, text) to authenticated;
