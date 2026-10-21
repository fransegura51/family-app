-- 0303 · Endurecimiento de las cuentas y el PIN. APLICADA en producción el 21/10/2026, tras comprobar en vivo que «Recuperar mi PIN» funciona con una sesión real.
-- Deshacer: supabase/rollbacks/0303_account_security_lockdown_down.sql (devuelve los permisos y deja set_own_pin como estaba).
--
--  · La administradora deja de poder reiniciar el PIN de otra persona.
--  · «Quitar PIN» sin comprobar nada (clear_own_pin) deja de estar disponible: se quita con clear_own_pin_with_pin o con la recuperación.
--  · set_own_pin ya solo sirve para ACTIVAR un PIN que no existe: cambiarlo exige el actual (change_own_pin).

revoke execute on function public.admin_reset_profile_pin(uuid) from authenticated;
revoke execute on function public.clear_own_pin() from authenticated;
-- La consulta «¿tiene PIN esa persona?» (0292 de la web actual) solo servía para el botón «Reiniciar PIN» de la administradora, que desaparece: deja de ser consultable.
revoke execute on function public.profile_has_pin(uuid) from authenticated;

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
  if exists (select 1 from profile_locks where profile_id = auth.uid() and pin_hash is not null) then
    raise exception 'PIN_ALREADY_SET';
  end if;

  insert into profile_locks (profile_id, pin_hash, failed_attempts, locked_until, updated_at)
  values (auth.uid(), crypt(p_pin, gen_salt('bf')), 0, null, now())
  on conflict (profile_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
end;
$function$;
