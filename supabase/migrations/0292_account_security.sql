-- 0292 · Cuentas y seguridad (PEPA-CUENTAS). ADITIVA: solo FUNCIONES NUEVAS; no cambia ni quita nada de lo que ya existe (set_own_pin, clear_own_pin,
-- verify_own_pin y admin_reset_profile_pin siguen igual hasta que el endurecimiento de supabase/pending-migrations/0293 se aplique, ya validado todo).
--
-- Qué añade:
--  1) private.has_recent_strong_auth: «¿esta sesión se abrió HACE POCO con contraseña o con un código del correo?». Lee la marca de cómo y cuándo
--     se autenticó la sesión (claim «amr» del token de Supabase Auth). Una sesión antigua que ya estaba abierta NO vale.
--  2) change_own_pin(PIN actual, PIN nuevo): cambia el PIN pidiendo el actual.
--  3) clear_own_pin_with_pin(PIN actual): quita el PIN pidiendo el actual (hoy «Quitar PIN» solo pregunta «¿seguro?»).
--  4) reset_own_pin_after_recent_auth(): «he olvidado mi PIN»: quita el PIN y BORRA las huellas / Face ID, solo si la persona se ha identificado hace
--     menos de 5 minutos. Sin administradores de por medio.
--  5) list_family_account_emails(): los correos de las cuentas de la familia (la administradora ve los de todas; el resto, solo el suyo).
--
-- Cuidado que importa (fallo clásico): cuando el PIN es incorrecto la función DEVUELVE un texto en vez de lanzar un error. Un error revertiría la
-- transacción entera y con ella el contador de intentos fallidos (verify_own_pin lo apunta antes de responder) → se podría probar PIN sin límite.

create or replace function private.has_recent_strong_auth(p_max_age_seconds int default 300)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(bool_or(
    (a ->> 'method') in ('password', 'otp', 'magiclink', 'recovery')
    and case when (a ->> 'timestamp') ~ '^[0-9]{1,12}$' then (a ->> 'timestamp')::bigint else 0 end
        >= extract(epoch from now())::bigint - least(greatest(coalesce(p_max_age_seconds, 300), 30), 900)
  ), false)
  from jsonb_array_elements(
    case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end
  ) a
$$;

-- Solo la usan otras funciones de este mismo esquema (que se ejecutan con permisos del propietario): nadie la llama directamente.
revoke all on function private.has_recent_strong_auth(int) from public, anon, authenticated;

create or replace function public.change_own_pin(p_old text, p_new text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_ok boolean;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if p_new is null or p_new !~ '^[0-9]{4,6}$' then
    raise exception 'El PIN debe tener entre 4 y 6 dígitos';
  end if;
  if not exists (select 1 from profile_locks where profile_id = auth.uid() and pin_hash is not null) then
    return 'no_pin';
  end if;

  -- Mismo contador de intentos y mismo bloqueo de 5 minutos que la pantalla de bloqueo (lanza PIN_LOCKED ANTES de escribir nada).
  v_ok := public.verify_own_pin(coalesce(p_old, ''));
  if not v_ok then
    return 'wrong_pin';
  end if;

  update profile_locks
  set pin_hash = crypt(p_new, gen_salt('bf')), failed_attempts = 0, locked_until = null, updated_at = now()
  where profile_id = auth.uid();
  return 'ok';
end;
$function$;

create or replace function public.clear_own_pin_with_pin(p_pin text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_ok boolean;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not exists (select 1 from profile_locks where profile_id = auth.uid() and pin_hash is not null) then
    return 'no_pin';
  end if;

  v_ok := public.verify_own_pin(coalesce(p_pin, ''));
  if not v_ok then
    return 'wrong_pin';
  end if;

  -- Igual que clear_own_pin: la huella es una capa sobre el PIN y no se deja huérfana.
  delete from profile_locks where profile_id = auth.uid();
  delete from profile_webauthn_credentials where profile_id = auth.uid();
  return 'ok';
end;
$function$;

create or replace function public.reset_own_pin_after_recent_auth()
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not private.has_recent_strong_auth(300) then
    raise exception 'RECENT_AUTH_REQUIRED';
  end if;

  delete from profile_locks where profile_id = auth.uid();
  -- Las huellas / Face ID anteriores dejan de valer: si no, volverían a abrir la app en cuanto se creara un PIN nuevo.
  delete from profile_webauthn_credentials where profile_id = auth.uid();
  delete from profile_webauthn_challenges where profile_id = auth.uid();
end;
$function$;

create or replace function public.list_family_account_emails()
returns table (profile_id uuid, email text, email_confirmed boolean, change_pending boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, u.email::text, (u.email_confirmed_at is not null), (coalesce(u.email_change, '') <> '')
  from profiles p
  join auth.users u on u.id = p.id
  where p.family_id = private.current_family_id()
    and (p.id = auth.uid() or private.current_role_in_family() = 'admin')
  order by p.created_at asc
$$;

revoke all on function public.change_own_pin(text, text) from public, anon;
revoke all on function public.clear_own_pin_with_pin(text) from public, anon;
revoke all on function public.reset_own_pin_after_recent_auth() from public, anon;
revoke all on function public.list_family_account_emails() from public, anon;

grant execute on function public.change_own_pin(text, text) to authenticated;
grant execute on function public.clear_own_pin_with_pin(text) to authenticated;
grant execute on function public.reset_own_pin_after_recent_auth() to authenticated;
grant execute on function public.list_family_account_emails() to authenticated;
