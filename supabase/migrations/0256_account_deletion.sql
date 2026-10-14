-- Borrar la cuenta desde dentro de la app (petición real, 14/10/2026; además Apple lo exige para publicar en la App Store, regla 5.1.1(v)).
--
-- Quien borra es la función de servidor «delete-account» (supabase/functions/delete-account), que usa estas dos funciones. Nadie puede llamarlas desde la app: solo
-- el servidor (service_role).
--
--   · delete_account_prepare(perfil): deja la familia en orden ANTES de borrar el acceso de una persona. Pasa a otra persona de la familia lo que esa cuenta
--     había creado y no admite quedar sin autor (los eventos), borra sus conexiones de Google Calendar y TODO su rastro de ubicación (última posición,
--     rastro, permiso de compartir y llaves del móvil), y deja sin efecto lo demás (los avisos, las huellas y el perfil se borran solos al borrar el acceso).
--     Su ficha de familiar se queda (sin cuenta): es de la familia.
--   · family_storage_paths(familia): los archivos de esa familia en el almacén (fotos, tickets, documentos…), para borrarlos al borrar la familia entera. Las
--     carpetas empiezan por el id de la familia.

create or replace function public.delete_account_prepare(p_profile uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_member uuid;
  v_heir uuid;
begin
  select p.family_id into v_family from public.profiles p where p.id = p_profile;
  if v_family is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Heredero de lo creado: otra administradora si la hay; si no, cualquier otra cuenta de la familia.
  select p.id into v_heir
  from public.profiles p
  where p.family_id = v_family and p.id <> p_profile
  order by (p.role = 'admin') desc, p.created_at
  limit 1;
  if v_heir is null then
    return jsonb_build_object('ok', false, 'error', 'only_account');
  end if;

  update public.events set created_by = v_heir where created_by = p_profile;
  update public.event_decisions set created_by = null where created_by = p_profile;
  delete from public.google_calendar_credentials where connected_by = p_profile;

  select fm.id into v_member from public.family_members fm where fm.linked_profile_id = p_profile limit 1;
  if v_member is not null then
    delete from public.member_locations where member_id = v_member;
    delete from public.member_location_history where member_id = v_member;
    delete from public.location_sharing_consent where member_id = v_member;
    update public.location_device_tokens set revoked_at = now() where member_id = v_member and revoked_at is null;
  end if;

  return jsonb_build_object('ok', true, 'heir', v_heir, 'member', v_member);
end;
$$;
revoke execute on function public.delete_account_prepare(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_prepare(uuid) to service_role;

create or replace function public.family_storage_paths(p_family uuid)
returns table (bucket text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id::text, o.name::text
  from storage.objects o
  where split_part(o.name, '/', 1) = p_family::text
$$;
revoke execute on function public.family_storage_paths(uuid) from public, anon, authenticated;
grant execute on function public.family_storage_paths(uuid) to service_role;
