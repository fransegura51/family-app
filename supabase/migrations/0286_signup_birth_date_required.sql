-- Alta de cuentas nuevas: la FECHA DE NACIMIENTO es obligatoria.
--
-- Decisión (17/10/2026): toda cuenta que se dé de alta a partir de ahora debe indicar su fecha de nacimiento. Hace falta para Comunidad PEPA (solo 18 años o más, 0284) y para
-- que el resto de la app conozca la edad. Hay dos únicos caminos para dar de alta una cuenta, y los dos la exigen en el SERVIDOR (no basta con el formulario):
--   · create_family(nombre de la familia, tu nombre, código, fecha de nacimiento): la ficha de quien crea la familia nace con su fecha.
--   · join_family_with_code(código, tu nombre, fecha de nacimiento): quien se une a una ficha ya existente debe tener fecha; si la ficha ya la traía (la puso quien administra)
--     se respeta esa; si no, se guarda la que se indica. Sin ninguna de las dos, no se da de alta.
-- Fecha válida: no futura y no anterior a 1900. Errores (texto que empieza por el código): BIRTH_DATE_REQUIRED, BIRTH_DATE_INVALID.
-- Los parámetros nuevos llevan `default null` para que un móvil con la versión antigua de la app (sin el campo) reciba el error claro en vez de «función no encontrada».
-- Las cuentas YA existentes no cambian (las que no tengan fecha la completan en Familia cuando quieran usar Comunidad).
-- Deshacer: supabase/rollbacks/0286_signup_birth_date_required_down.sql.

drop function if exists public.create_family(text, text, text);
drop function if exists public.join_family_with_code(text, text);

create or replace function public.create_family(p_family_name text, p_display_name text, p_access_code text, p_birth_date date default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_family_id uuid;
  v_user_id uuid := auth.uid();
  v_expected_code text;
  v_invite_code text := upper(trim(coalesce(p_access_code, '')));
  v_used_invite text := null;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  if p_birth_date is null then
    raise exception 'BIRTH_DATE_REQUIRED: Falta tu fecha de nacimiento';
  end if;
  if p_birth_date > current_date or p_birth_date < date '1900-01-01' then
    raise exception 'BIRTH_DATE_INVALID: La fecha de nacimiento no es válida';
  end if;

  select decrypted_secret into v_expected_code from vault.decrypted_secrets where name = 'family_signup_code';
  if v_expected_code is not null and p_access_code = v_expected_code then
    null; -- código maestro
  elsif exists (
    select 1 from family_invites
    where code = v_invite_code and used_at is null and expires_at > now()
  ) then
    v_used_invite := v_invite_code;
  else
    raise exception 'Código de acceso incorrecto';
  end if;

  if exists (select 1 from profiles where id = v_user_id) then
    raise exception 'El usuario ya pertenece a una familia';
  end if;

  insert into families (name) values (p_family_name) returning id into v_family_id;

  insert into profiles (id, family_id, role, display_name)
    values (v_user_id, v_family_id, 'admin', p_display_name);

  insert into family_members (family_id, name, member_type, linked_profile_id, birth_date)
    values (v_family_id, p_display_name, 'admin', v_user_id, p_birth_date);

  if v_used_invite is not null then
    update family_invites set used_by_family = v_family_id, used_at = now() where code = v_used_invite;
  end if;

  insert into budget_categories (family_id, name, icon, budget_group, parent_id, sort_order, necessity, is_fixed, catalog_key)
    select v_family_id, c.name, c.icon, c.budget_group, null, c.sort_order, c.necessity, c.is_fixed, c.key
    from catalog_categories c
    where c.status = 'approved' and c.parent_key is null
    order by c.budget_group, c.sort_order;

  insert into budget_categories (family_id, name, icon, budget_group, parent_id, sort_order, necessity, is_fixed, catalog_key)
    select v_family_id, c.name, c.icon, c.budget_group, p.id, c.sort_order, c.necessity, c.is_fixed, c.key
    from catalog_categories c
    join budget_categories p on p.family_id = v_family_id and p.catalog_key = c.parent_key
    where c.status = 'approved' and c.parent_key is not null
    order by c.budget_group, c.sort_order;

  insert into family_food_types (family_id, name, icon, kind, catalog_key, created_at)
    select v_family_id, t.name, t.icon, t.kind, t.key,
           now() + (row_number() over (order by t.kind, t.sort_order)) * interval '1 millisecond'
    from catalog_food_types t
    where t.status = 'approved';

  if (select count(*) from budget_categories where family_id = v_family_id)
       <> (select count(*) from catalog_categories where status = 'approved')
     or (select count(*) from family_food_types where family_id = v_family_id)
       <> (select count(*) from catalog_food_types where status = 'approved') then
    raise exception 'create_family: el catálogo base no se ha copiado completo';
  end if;

  return v_family_id;
end;
$function$;

create or replace function public.join_family_with_code(p_code text, p_display_name text, p_birth_date date default null)
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
  v_member_birth date;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;
  if exists (select 1 from profiles where id = v_user_id) then
    raise exception 'El usuario ya pertenece a una familia';
  end if;

  select id, family_id, member_type, birth_date into v_member_id, v_family_id, v_member_type, v_member_birth
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

  -- Fecha de nacimiento obligatoria: la de la ficha (si quien administra ya la puso) o, si no, la que indica la persona.
  if p_birth_date is not null and (p_birth_date > current_date or p_birth_date < date '1900-01-01') then
    raise exception 'BIRTH_DATE_INVALID: La fecha de nacimiento no es válida';
  end if;
  if v_member_birth is null and p_birth_date is null then
    raise exception 'BIRTH_DATE_REQUIRED: Falta tu fecha de nacimiento';
  end if;

  insert into profiles (id, family_id, role, display_name)
  values (v_user_id, v_family_id, case when v_member_type = 'admin' then 'admin' else 'adult' end, p_display_name);

  update family_members
  set linked_profile_id = v_user_id, invite_code = null, invite_code_expires_at = null,
      birth_date = coalesce(birth_date, p_birth_date)
  where id = v_member_id;

  return v_family_id;
end;
$function$;

revoke all on function public.create_family(text, text, text, date) from public, anon;
revoke all on function public.join_family_with_code(text, text, date) from public, anon;
grant execute on function public.create_family(text, text, text, date) to authenticated;
grant execute on function public.join_family_with_code(text, text, date) to authenticated;
