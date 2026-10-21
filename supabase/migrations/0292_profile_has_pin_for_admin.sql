-- Fallo real reportado: en Familia → miembro → "yo" salía "Reiniciar PIN" aunque esa persona no tuviera ningún PIN. El botón
-- se pintaba para cualquier miembro con cuenta, sin saber si había PIN que reiniciar. Esta función deja al administrador de la
-- familia saber SOLO si un perfil de su familia tiene PIN (sí/no; nunca el hash).
create or replace function public.profile_has_pin(p_profile_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $function$
declare
  v_target_family uuid;
begin
  select family_id into v_target_family from profiles where id = p_profile_id;
  if v_target_family is null or v_target_family <> private.current_family_id() then
    raise exception 'Perfil no encontrado';
  end if;
  if p_profile_id <> auth.uid() and private.current_role_in_family() <> 'admin' then
    raise exception 'Solo un administrador puede consultar el PIN de otra persona';
  end if;
  return exists(select 1 from profile_locks where profile_id = p_profile_id and pin_hash is not null);
end;
$function$;

revoke all on function public.profile_has_pin(uuid) from public, anon;
grant execute on function public.profile_has_pin(uuid) to authenticated;
