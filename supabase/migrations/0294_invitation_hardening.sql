-- 0294 · Invitaciones: dar acceso a un menor (madre/padre vinculado), rol y secciones de la ficha, bloqueos contra el uso simultáneo y reserva por correo.
-- SIN APLICAR en producción (necesita autorización). Requiere 0292 y 0293. Deshacer: supabase/rollbacks/0294_invitation_hardening_down.sql.
--
-- REGLA FUNDAMENTAL: PEPA sigue siendo privada. La puerta por invitación se MANTIENE y se REFUERZA: mismas reglas (código vigente, de un solo uso, caducable, solo lo genera quien
-- corresponde), más (a) bloqueo de fila para que dos personas no puedan usar el mismo código a la vez, (b) reserva del código por correo mientras se completa el registro, (c) rol y
-- secciones tomados de la FICHA y no de lo que escriba la persona, (d) la fecha de nacimiento de la ficha manda sobre la escrita en el registro.
--
-- 1) Corrige el fallo detectado en la auditoría (0217/0286 dejaron de dar el rol «niño»/«invitado» y de copiar las secciones de la ficha: ver docs/CUENTAS_PADRES_HIJOS_E_INVITACIONES.md).
--    Hoy no hay ninguna cuenta afectada (comprobado en solo lectura el 21/10/2026); esto evita que la primera se cree mal.
-- 2) create_member_invitation: «Dar acceso a PEPA». Lo puede pedir una administradora de la familia (cualquier ficha sin cuenta salvo bebés) o una madre/padre/tutor VIGENTE
--    (0293) SOLO para la ficha de un niño menor de 18 años. Reutiliza el código si sigue vigente (no duplica) y devuelve la caducidad. generate_member_invite_code NO cambia.
-- 3) create_family y join_family_with_code conservan firma, mensajes y comprobaciones; las invitaciones de familia nueva las sigue generando SOLO la administradora de PEPA.
--
-- 4) BLINDAJE: hoy una administradora de familia podía escribir A MANO en family_members las columnas del código de invitación, su caducidad y el enlace con la cuenta
--    (linked_profile_id): se saltaba las 24 horas y podía mover quién es madre/padre vinculado. Un disparador lo impide: esas columnas solo las cambian las funciones del servidor
--    (create_member_invitation, join_family_with_code, generate_member_invite_code, el borrado de cuenta). La app no escribe nunca esas columnas por su cuenta (comprobado).
--
-- Mensajes de error nuevos (empiezan por el código): NOT_AUTHORIZED, MEMBER_NOT_INVITABLE, BIRTH_DATE_REQUIRED_ON_PROFILE, ADULT_REQUIRED.

alter table public.family_invites add column reserved_email text, add column reserved_until timestamptz;
alter table public.family_members add column invite_reserved_email text, add column invite_reserved_until timestamptz,
  add column invite_created_by uuid references public.profiles(id) on delete set null, add column invite_created_at timestamptz;

-- ¿Está la invitación reservada por OTRO correo (y la reserva sigue vigente)?
create or replace function private.invitation_reserved_for_other(p_email text, p_reserved_email text, p_reserved_until timestamptz)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_reserved_email is not null and p_reserved_until is not null and p_reserved_until > now() and p_reserved_email <> lower(coalesce(p_email, ''))
$$;
revoke all on function private.invitation_reserved_for_other(text, text, timestamptz) from public, anon, authenticated;

-- Código nuevo: 10 caracteres de un alfabeto sin confusiones (sin 0/O, 1/I), con generador criptográfico. Los códigos antiguos de 8 caracteres siguen valiendo.
create or replace function private.new_invitation_code(p_len int default 10)
returns text
language plpgsql
volatile
set search_path = public, extensions
as $function$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := gen_random_bytes(p_len);
  out text := '';
  i int;
begin
  for i in 0 .. p_len - 1 loop
    out := out || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return out;
end;
$function$;
revoke all on function private.new_invitation_code(int) from public, anon, authenticated;

create or replace function public.create_member_invitation(p_member_id uuid, p_regenerate boolean default false)
returns table (o_code text, o_expires_at timestamptz, o_reused boolean)
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_user uuid := auth.uid();
  v_family uuid := private.current_family_id();
  v_role text := private.current_role_in_family();
  m public.family_members%rowtype;
  v_code text;
  v_tries int := 0;
  v_allowed boolean := false;
begin
  if v_user is null then
    raise exception 'No autenticado';
  end if;
  if v_family is null then
    raise exception 'NOT_AUTHORIZED';
  end if;

  -- La ficha se bloquea mientras se decide: dos personas pidiendo código a la vez no crean dos.
  select * into m from public.family_members where id = p_member_id and family_id = v_family for update;
  if m.id is null then
    raise exception 'Miembro no encontrado';
  end if;
  if m.linked_profile_id is not null then
    raise exception 'Ese miembro ya tiene una cuenta';
  end if;
  if m.member_type = 'baby' then
    raise exception 'MEMBER_NOT_INVITABLE';
  end if;

  if v_role = 'admin' then
    v_allowed := true;                                                    -- administradora de ESA familia (como hasta ahora)
  elsif v_role = 'adult' and m.member_type = 'child' and private.is_active_guardian_of(m.id) then
    v_allowed := true;                                                    -- madre/padre/tutor VIGENTE de este menor (nunca de un adulto)
  end if;
  if not v_allowed then
    raise exception 'NOT_AUTHORIZED';
  end if;

  -- La edad de un menor sale de su ficha (la pone quien la crea), no de lo que escriba al registrarse.
  if m.member_type = 'child' and m.birth_date is null then
    raise exception 'BIRTH_DATE_REQUIRED_ON_PROFILE';
  end if;

  if m.invite_code is not null and m.invite_code_expires_at > now() and not coalesce(p_regenerate, false) then
    return query select m.invite_code, m.invite_code_expires_at, true;
    return;
  end if;

  loop
    v_code := private.new_invitation_code(10);
    exit when not exists (select 1 from public.family_members where invite_code = v_code)
          and not exists (select 1 from public.family_invites where code = v_code);
    v_tries := v_tries + 1;
    if v_tries > 10 then
      raise exception 'No se pudo generar un código. Inténtalo de nuevo.';
    end if;
  end loop;

  update public.family_members
  set invite_code = v_code, invite_code_expires_at = now() + interval '24 hours',
      invite_created_by = v_user, invite_created_at = now(), invite_reserved_email = null, invite_reserved_until = null
  where id = m.id;

  return query select v_code, now() + interval '24 hours', false;
end;
$function$;

revoke all on function public.create_member_invitation(uuid, boolean) from public, anon;
grant execute on function public.create_member_invitation(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------
-- Unirse a una familia con el código de una ficha. Misma firma y mismos mensajes que en 0286; añade bloqueo de fila, reserva por correo, rol y secciones de la ficha.
create or replace function public.join_family_with_code(p_code text, p_display_name text, p_birth_date date default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_code text := upper(trim(coalesce(p_code, '')));
  m public.family_members%rowtype;
  v_role text;
  v_birth date;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;
  if exists (select 1 from profiles where id = v_user_id) then
    raise exception 'El usuario ya pertenece a una familia';
  end if;

  -- El código se bloquea al leerlo: dos personas usando el mismo código a la vez no pueden ganar las dos.
  select * into m
  from family_members
  where invite_code = v_code
    and invite_code_expires_at > now()
    and linked_profile_id is null
  for update;

  if m.id is null or private.invitation_reserved_for_other(v_email, m.invite_reserved_email, m.invite_reserved_until) then
    if m.id is null and exists (
      select 1 from family_invites
      where code = v_code and used_at is null and expires_at > now()
    ) then
      raise exception 'Este código es para crear una familia nueva — pruébalo en "Crear una familia nueva", no aquí';
    end if;
    raise exception 'Código no válido o caducado';
  end if;

  -- Un bebé no tiene cuenta.
  if m.member_type = 'baby' then
    raise exception 'Código no válido o caducado';
  end if;

  if p_birth_date is not null and (p_birth_date > current_date or p_birth_date < date '1900-01-01') then
    raise exception 'BIRTH_DATE_INVALID: La fecha de nacimiento no es válida';
  end if;
  -- La fecha de la FICHA manda: lo que escriba la persona solo se usa si la ficha no la trae (y nunca para un niño).
  if m.member_type = 'child' and m.birth_date is null then
    raise exception 'BIRTH_DATE_REQUIRED_ON_PROFILE: La ficha de este niño o niña no tiene fecha de nacimiento; pide a quien te invita que la ponga';
  end if;
  v_birth := coalesce(m.birth_date, p_birth_date);
  if v_birth is null then
    raise exception 'BIRTH_DATE_REQUIRED: Falta tu fecha de nacimiento';
  end if;
  -- Una cuenta de adulta/o no se crea con una fecha de menor.
  if m.member_type in ('admin', 'adult') and v_birth > (current_date - interval '18 years')::date then
    raise exception 'ADULT_REQUIRED: Una cuenta de adulto requiere ser mayor de edad';
  end if;

  -- Rol y secciones salen de la FICHA (como hasta la migración 0097).
  v_role := case m.member_type
    when 'admin' then 'admin'
    when 'guest' then 'guest'
    when 'child' then 'child'
    else 'adult'
  end;

  insert into profiles (id, family_id, role, display_name, allowed_sections)
  values (v_user_id, m.family_id, v_role, p_display_name, m.allowed_sections);

  update family_members
  set linked_profile_id = v_user_id, invite_code = null, invite_code_expires_at = null,
      invite_reserved_email = null, invite_reserved_until = null,
      birth_date = coalesce(birth_date, p_birth_date)
  where id = m.id;

  return m.family_id;
end;
$function$;

-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------
-- Crear una familia nueva. Misma firma y mismos mensajes que en 0286; añade bloqueo de fila de la invitación, reserva por correo y que quien crea la familia sea mayor de edad.
create or replace function public.create_family(p_family_name text, p_display_name text, p_access_code text, p_birth_date date default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_family_id uuid;
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_expected_code text;
  v_invite_code text := upper(trim(coalesce(p_access_code, '')));
  v_used_invite text := null;
  v_inv public.family_invites%rowtype;
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
  if p_birth_date > (current_date - interval '18 years')::date then
    raise exception 'ADULT_REQUIRED: Quien crea una familia debe ser mayor de edad';
  end if;

  select decrypted_secret into v_expected_code from vault.decrypted_secrets where name = 'family_signup_code';
  if v_expected_code is not null and p_access_code = v_expected_code then
    null; -- código maestro
  else
    -- La invitación se bloquea al leerla: dos personas usando la misma a la vez no pueden ganar las dos.
    select * into v_inv from family_invites
    where code = v_invite_code and used_at is null and expires_at > now()
    for update;
    if v_inv.code is null or private.invitation_reserved_for_other(v_email, v_inv.reserved_email, v_inv.reserved_until) then
      raise exception 'Código de acceso incorrecto';
    end if;
    v_used_invite := v_inv.code;
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
    update family_invites set used_by_family = v_family_id, used_at = now(), reserved_email = null, reserved_until = null where code = v_used_invite;
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

-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------
-- Blindaje de las columnas de invitación y de enlace. Quien llama desde la app (rol authenticated o anon) no puede ponerlas ni cambiarlas; las funciones del servidor sí (se ejecutan con
-- los permisos de su propietario), igual que el borrado de cuenta (clave de servicio).
create or replace function private.family_members_protect_invitation_columns()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.invite_code is not null or new.invite_code_expires_at is not null or new.linked_profile_id is not null
         or new.invite_reserved_email is not null or new.invite_reserved_until is not null or new.invite_created_by is not null or new.invite_created_at is not null then
        raise exception 'Estos datos solo los cambia el servidor' using errcode = '42501';
      end if;
    elsif (new.invite_code, new.invite_code_expires_at, new.linked_profile_id, new.invite_reserved_email, new.invite_reserved_until, new.invite_created_by, new.invite_created_at)
          is distinct from
          (old.invite_code, old.invite_code_expires_at, old.linked_profile_id, old.invite_reserved_email, old.invite_reserved_until, old.invite_created_by, old.invite_created_at) then
      raise exception 'Estos datos solo los cambia el servidor' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;
revoke all on function private.family_members_protect_invitation_columns() from public, anon, authenticated;

create trigger family_members_protect_invitation_columns
  before insert or update on public.family_members
  for each row execute function private.family_members_protect_invitation_columns();
