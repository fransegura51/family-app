-- Petición real: "la aplicación va a tener datos financieros, te dé la
-- opción de poder bloquearla y desbloquearla con huella dactilar, con
-- reconocimiento facial o con un PIN... que pueda elegir todos los
-- usuarios, cada uno el suyo" + "hazlo opcional, si alguien no lo
-- quiere poner que no lo ponga". No existe un "perfil activo" separado
-- del login (ver useSession.ts): cada adulto tiene su propia cuenta de
-- Supabase Auth en su propio móvil, así que el bloqueo se ancla a
-- `profiles.id` (= auth.uid()), no a family_members — para cada
-- persona el resultado es el mismo, "mi PIN/huella en mi móvil".
--
-- El PIN nunca se guarda en texto plano ni siquiera para el admin: solo
-- su hash (pgcrypto crypt/gen_salt, ya usado en el proyecto). Sin
-- policies de RLS a propósito — nadie lee/escribe estas tablas
-- directamente, todo pasa por las funciones SECURITY DEFINER de abajo,
-- que validan auth.uid() por su cuenta (mismo patrón que
-- private.current_family_id()).
create table profile_locks (
  profile_id uuid primary key references profiles(id) on delete cascade,
  pin_hash text,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table profile_locks enable row level security;

-- Credenciales WebAuthn (huella/Face ID) — capa opcional POR ENCIMA del
-- PIN, nunca lo sustituye como único mecanismo (si falla la biometría,
-- siempre se puede caer al PIN). La clave pública no es secreta, pero
-- se deja igualmente sin policies para que todo pase por las funciones
-- de abajo y por la Edge Function `profile-webauthn` (única que conoce
-- el reto en curso).
create table profile_webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  device_label text,
  created_at timestamptz not null default now()
);
alter table profile_webauthn_credentials enable row level security;

-- Reto (challenge) de la ceremonia WebAuthn en curso — vive segundos,
-- se borra en cuanto se verifica. Una fila por perfil (no hay
-- ceremonias en paralelo del mismo usuario).
create table profile_webauthn_challenges (
  profile_id uuid primary key references profiles(id) on delete cascade,
  challenge text not null,
  created_at timestamptz not null default now()
);
alter table profile_webauthn_challenges enable row level security;

create or replace function public.has_own_pin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(select 1 from profile_locks where profile_id = auth.uid() and pin_hash is not null)
$$;

create or replace function public.set_own_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'El PIN debe tener entre 4 y 6 dígitos';
  end if;

  insert into profile_locks (profile_id, pin_hash, failed_attempts, locked_until, updated_at)
  values (auth.uid(), crypt(p_pin, gen_salt('bf')), 0, null, now())
  on conflict (profile_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
end;
$function$;

-- Desactivar el PIN uno mismo (ya se pasó por el bloqueo para llegar a
-- Ajustes, o nunca lo tuvo activado) — borra también cualquier huella
-- registrada, porque la huella es una capa sobre el PIN y no tiene
-- sentido dejarla huérfana sin PIN debajo.
create or replace function public.clear_own_pin()
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  delete from profile_locks where profile_id = auth.uid();
  delete from profile_webauthn_credentials where profile_id = auth.uid();
end;
$function$;

create or replace function public.verify_own_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_hash text;
  v_locked_until timestamptz;
  v_attempts int;
begin
  select pin_hash, locked_until, failed_attempts into v_hash, v_locked_until, v_attempts
  from profile_locks where profile_id = auth.uid();

  if v_hash is null then
    return false;
  end if;

  if v_locked_until is not null and v_locked_until > now() then
    raise exception 'PIN_LOCKED';
  end if;

  if v_hash = crypt(p_pin, v_hash) then
    update profile_locks set failed_attempts = 0, locked_until = null, updated_at = now()
    where profile_id = auth.uid();
    return true;
  end if;

  v_attempts := coalesce(v_attempts, 0) + 1;
  update profile_locks
  set failed_attempts = v_attempts,
      locked_until = case when v_attempts >= 5 then now() + interval '5 minutes' else null end,
      updated_at = now()
  where profile_id = auth.uid();
  return false;
end;
$function$;

-- Solo un admin, y solo dentro de su propia familia — "reiniciar" (no
-- ver ni mandar) el PIN de otra persona cuando se le olvida: la deja
-- sin PIN, así que la próxima vez que abra el bloqueo tendrá que crear
-- uno nuevo. No toca su huella (sigue registrada en su móvil).
create or replace function public.admin_reset_profile_pin(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_target_family uuid;
begin
  if private.current_role_in_family() <> 'admin' then
    raise exception 'Solo un administrador puede reiniciar un PIN';
  end if;

  select family_id into v_target_family from profiles where id = p_profile_id;
  if v_target_family is null or v_target_family <> private.current_family_id() then
    raise exception 'Perfil no encontrado';
  end if;

  update profile_locks set pin_hash = null, failed_attempts = 0, locked_until = null, updated_at = now()
  where profile_id = p_profile_id;
end;
$function$;

create or replace function public.list_own_webauthn_credentials()
returns table (id uuid, device_label text, created_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select id, device_label, created_at from profile_webauthn_credentials
  where profile_id = auth.uid()
  order by created_at asc
$$;

create or replace function public.delete_own_webauthn_credential(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from profile_webauthn_credentials where id = p_id and profile_id = auth.uid()
$$;

revoke all on function public.has_own_pin() from public, anon;
revoke all on function public.set_own_pin(text) from public, anon;
revoke all on function public.clear_own_pin() from public, anon;
revoke all on function public.verify_own_pin(text) from public, anon;
revoke all on function public.admin_reset_profile_pin(uuid) from public, anon;
revoke all on function public.list_own_webauthn_credentials() from public, anon;
revoke all on function public.delete_own_webauthn_credential(uuid) from public, anon;

grant execute on function public.has_own_pin() to authenticated;
grant execute on function public.set_own_pin(text) to authenticated;
grant execute on function public.clear_own_pin() to authenticated;
grant execute on function public.verify_own_pin(text) to authenticated;
grant execute on function public.admin_reset_profile_pin(uuid) to authenticated;
grant execute on function public.list_own_webauthn_credentials() to authenticated;
grant execute on function public.delete_own_webauthn_credential(uuid) to authenticated;
