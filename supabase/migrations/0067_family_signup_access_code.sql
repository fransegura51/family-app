-- Petición real: "cualquiera que tenga la URL puede abrir la
-- aplicación y utilizarla... quiero que tenga una seguridad". El
-- código de invitación para SUMARSE a la familia ya existente
-- (join_family_with_code) no cambia — esto solo protege la creación de
-- una familia NUEVA desde cero, que ahora exige un código de acceso
-- guardado en Vault (mismo mecanismo que la clave de Gemini), para que
-- un desconocido que llegue a la URL no pueda crearse su propia
-- familia y usar la app.
create or replace function public.create_family(p_family_name text, p_display_name text, p_access_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_user_id uuid := auth.uid();
  v_expected_code text;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  select decrypted_secret into v_expected_code from vault.decrypted_secrets where name = 'family_signup_code';
  if v_expected_code is null or p_access_code is null or p_access_code <> v_expected_code then
    raise exception 'Código de acceso incorrecto';
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

revoke all on function public.create_family(text, text, text) from public;
grant execute on function public.create_family(text, text, text) to authenticated;

-- La versión anterior (sin código) queda inútil para nadie: se
-- elimina para que no quede una puerta trasera sin proteger.
drop function if exists public.create_family(text, text);
