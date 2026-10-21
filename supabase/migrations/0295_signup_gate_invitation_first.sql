-- 0295 · Primero la invitación, después la cuenta. SIN APLICAR en producción y SIN ACTIVAR el gancho de Supabase Auth (ambas cosas necesitan autorización).
-- Requiere 0294. Deshacer: supabase/rollbacks/0295_signup_gate_invitation_first_down.sql (y desactivar el gancho en Supabase, que es instantáneo).
--
-- Problema: hasta ahora cualquiera podía crear un LOGIN (auth.signUp) sin invitación; la invitación solo se pedía DESPUÉS, al crear la familia o unirse. Un login sin familia no sirve
-- de nada, pero abre la puerta a cuentas huérfanas y a correos de confirmación a cualquier dirección. Esta migración prepara el cambio de orden aprobado:
--   1) Se escribe el código de invitación  →  2) check_invitation lo valida en el SERVIDOR (sin gastarlo)  →  3) formulario de correo y contraseña  →  4) código de 6 cifras del correo
--   →  5) crear la familia o unirse (create_family / join_family_with_code, que vuelven a comprobar el código y lo gastan de verdad).
-- La comprobación NO está solo en la interfaz: el gancho «Before User Created» de Supabase Auth rechaza cualquier alta directa (signUp llamado a mano) que no traiga una invitación
-- válida, sin afectar a quien ya tiene cuenta, ni a recuperar contraseña, ni a cambiar de correo, ni a entrar.
--
-- · check_invitation(código): pública (la usa quien aún no tiene cuenta), con límite de intentos por IP y SIN revelar nada privado: solo si vale, de qué tipo es, cuándo caduca y si
--   la pantalla tiene que pedir la fecha de nacimiento (needs_birth_date: false cuando la ficha ya la trae; la fecha en sí nunca se envía).
-- · hook_before_user_created(event): el gancho. Acepta el alta solo si trae una invitación vigente y sin usar (o el código maestro) y la RESERVA para ese correo durante 2 horas, así dos
--   personas no pueden acabar con el mismo código ni quedarse cuentas a medias. No la gasta: la gasta create_family / join_family_with_code al terminar.
-- · purge_orphan_logins: limpia logins sin familia con más de 48 h (alta que no se completó). No se programa sola; necesita autorización.
--
-- Hay DOS tipos de invitación y no se mezclan: «familia nueva» (la genera solo una administradora de PEPA, family_invites) y «familiar» (vincula una cuenta a una ficha, la genera una
-- administradora de la familia o una madre/padre vinculado, family_members.invite_code). El código de 6 cifras del correo es otra cosa y no sustituye a ninguno de los dos.

create table private.invitation_attempts (
  ip_key text not null,
  window_start timestamptz not null,
  attempts int not null default 0,
  primary key (ip_key, window_start)
);
revoke all on private.invitation_attempts from public, anon, authenticated;

-- ¿Se permite este intento? Cuenta los intentos por hora y por IP. true = permitido.
create or replace function private.invitation_throttle(p_key text, p_limit int)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $function$
declare
  v_n int;
begin
  insert into private.invitation_attempts as a (ip_key, window_start, attempts)
  values (left(coalesce(p_key, 'unknown'), 120), date_trunc('hour', now()), 1)
  on conflict (ip_key, window_start) do update set attempts = a.attempts + 1
  returning a.attempts into v_n;
  if random() < 0.02 then
    delete from private.invitation_attempts where window_start < now() - interval '2 days';
  end if;
  return v_n <= p_limit;
end;
$function$;
revoke all on function private.invitation_throttle(text, int) from public, anon, authenticated;

create or replace function public.check_invitation(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $function$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_raw text := trim(coalesce(p_code, ''));
  v_ip text;
  v_master text;
  v_exp timestamptz;
  v_birth date;
begin
  -- IP de quien pregunta (la pone el servidor de Supabase; no se puede falsear desde el navegador).
  begin
    v_ip := trim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1));
  exception when others then
    v_ip := '';
  end;
  if coalesce(v_ip, '') = '' then
    v_ip := 'unknown';
  end if;

  -- Hasta 30 comprobaciones por hora y por IP: adivinar códigos a golpe de intento no sale a cuenta.
  if not private.invitation_throttle('check:' || v_ip, 30) then
    return jsonb_build_object('valid', false, 'throttled', true);
  end if;
  if length(v_code) < 6 or length(v_code) > 40 then
    return jsonb_build_object('valid', false);
  end if;

  select decrypted_secret into v_master from vault.decrypted_secrets where name = 'family_signup_code';
  if v_master is not null and v_raw = v_master then
    return jsonb_build_object('valid', true, 'kind', 'family', 'needs_birth_date', true);       -- código maestro: no caduca
  end if;

  select expires_at into v_exp from family_invites where code = v_code and used_at is null and expires_at > now();
  if found then
    return jsonb_build_object('valid', true, 'kind', 'family', 'expires_at', v_exp, 'needs_birth_date', true);
  end if;

  select invite_code_expires_at, birth_date into v_exp, v_birth from family_members
  where invite_code = v_code and invite_code_expires_at > now() and linked_profile_id is null and member_type <> 'baby';
  if found then
    -- needs_birth_date: la ficha ya trae la fecha (la puso quien invita) → la pantalla no la pide; no se revela la fecha.
    return jsonb_build_object('valid', true, 'kind', 'member', 'expires_at', v_exp, 'needs_birth_date', v_birth is null);
  end if;

  return jsonb_build_object('valid', false);
end;
$function$;

revoke all on function public.check_invitation(text) from public;
grant execute on function public.check_invitation(text) to anon, authenticated;

-- El gancho «Before User Created». Se registra en Supabase (Authentication → Hooks → Before User Created → Postgres function → public.hook_before_user_created): NO se hace aquí.
-- Recibe el alta que se va a crear; el código de invitación viaja en los datos del usuario (signUp con options.data.invite_code).
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user jsonb := coalesce(event -> 'user', '{}'::jsonb);
  v_email text := lower(coalesce(v_user ->> 'email', ''));
  -- El código viaja en los datos del usuario. La documentación de Supabase no deja claro con qué nombre llegan en este gancho (user_metadata o raw_user_meta_data): se aceptan los dos.
  -- Si ninguno trae el código, se RECHAZA el alta (falla cerrado). Se comprueba una vez en un entorno de pruebas antes de activarlo (docs/CUENTAS_SEGURIDAD_PLAN.md).
  v_raw text := trim(coalesce(v_user -> 'user_metadata' ->> 'invite_code', v_user -> 'raw_user_meta_data' ->> 'invite_code', ''));
  v_code text := upper(trim(coalesce(v_user -> 'user_metadata' ->> 'invite_code', v_user -> 'raw_user_meta_data' ->> 'invite_code', '')));
  v_provider text := coalesce(v_user -> 'app_metadata' ->> 'provider', '');
  v_master text;
  v_inv_code text;
  v_res_email text;
  v_res_until timestamptz;
  v_member uuid;
begin
  -- Solo se crean cuentas por correo y contraseña, y con invitación. Nada de acceso anónimo ni de proveedores externos.
  if coalesce((v_user ->> 'is_anonymous')::boolean, false) or v_provider <> 'email' or v_email = '' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'INVITATION_REQUIRED: Hace falta una invitación válida para crear una cuenta'));
  end if;
  if v_code = '' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'INVITATION_REQUIRED: Hace falta una invitación válida para crear una cuenta'));
  end if;

  select decrypted_secret into v_master from vault.decrypted_secrets where name = 'family_signup_code';
  if v_master is not null and v_raw = v_master then
    return '{}'::jsonb;                                              -- código maestro (compatibilidad): no se reserva
  end if;

  -- Invitación de familia nueva.
  select code, reserved_email, reserved_until into v_inv_code, v_res_email, v_res_until
  from public.family_invites where code = v_code and used_at is null and expires_at > now() for update;
  if v_inv_code is not null then
    if private.invitation_reserved_for_other(v_email, v_res_email, v_res_until) then
      return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'INVITATION_IN_USE: Esta invitación ya la está usando otra persona'));
    end if;
    update public.family_invites set reserved_email = v_email, reserved_until = now() + interval '2 hours' where code = v_inv_code;
    return '{}'::jsonb;
  end if;

  -- Invitación familiar (ficha sin cuenta).
  select id, invite_reserved_email, invite_reserved_until into v_member, v_res_email, v_res_until
  from public.family_members
  where invite_code = v_code and invite_code_expires_at > now() and linked_profile_id is null and member_type <> 'baby' for update;
  if v_member is not null then
    if private.invitation_reserved_for_other(v_email, v_res_email, v_res_until) then
      return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'INVITATION_IN_USE: Esta invitación ya la está usando otra persona'));
    end if;
    update public.family_members set invite_reserved_email = v_email, invite_reserved_until = now() + interval '2 hours' where id = v_member;
    return '{}'::jsonb;
  end if;

  return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'INVITATION_INVALID: La invitación no es válida o ha caducado'));
end;
$function$;

revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;

-- Logins sin familia (alta que no se completó): se borran pasadas 48 horas. Nunca toca a quien ya tiene familia. NO se programa sola.
create or replace function private.purge_orphan_logins(p_older_than interval default interval '48 hours')
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $function$
declare
  v_n integer;
begin
  with gone as (
    delete from auth.users u
    where u.created_at < now() - greatest(p_older_than, interval '24 hours')
      and not exists (select 1 from public.profiles p where p.id = u.id)
    returning 1
  )
  select count(*) into v_n from gone;
  return v_n;
end;
$function$;
revoke all on function private.purge_orphan_logins(interval) from public, anon, authenticated;
