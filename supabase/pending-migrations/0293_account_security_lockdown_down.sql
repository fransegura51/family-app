-- Deshacer el endurecimiento 0293: devuelve a las cuentas autenticadas el permiso de las dos funciones y restaura set_own_pin tal como lo dejó 0084.
grant execute on function public.admin_reset_profile_pin(uuid) to authenticated;
grant execute on function public.clear_own_pin() to authenticated;

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
