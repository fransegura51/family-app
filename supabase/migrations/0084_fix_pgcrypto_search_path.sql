-- Bug real encontrado probando en vivo: pgcrypto vive en el esquema
-- `extensions` en este proyecto de Supabase (no en `public`), así que
-- `set search_path = public` en set_own_pin/verify_own_pin hacía que
-- crypt()/gen_salt() no se encontraran ("function gen_salt(unknown)
-- does not exist"). Se añade `extensions` al search_path de las dos
-- funciones que usan pgcrypto.
create or replace function public.set_own_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
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

create or replace function public.verify_own_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
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
