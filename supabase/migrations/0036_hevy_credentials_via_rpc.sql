-- El guardado directo por RLS en hevy_credentials daba "new row
-- violates row-level security policy" de forma intermitente para la
-- usuaria real (probado a fondo del lado del servidor con su mismo
-- perfil y sí funciona ahí, así que el fallo está en algo del cliente
-- que no se ha podido reproducir con certeza). En vez de seguir
-- dependiendo de que el navegador mande el family_id correcto y de una
-- política RLS sobre la tabla en bruto, se pasa a dos funciones que
-- calculan el family_id ellas mismas del lado del servidor (nunca se
-- fían de lo que mande el cliente) y comprueban el rol admin por
-- dentro — mismo patrón ya usado para los códigos de invitación
-- (generate_member_invite_code).
drop policy if exists "hevy_credentials: admin insert" on hevy_credentials;
drop policy if exists "hevy_credentials: admin update" on hevy_credentials;
drop policy if exists "hevy_credentials: admin delete" on hevy_credentials;

create or replace function public.save_hevy_api_key(p_api_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid := private.current_family_id();
  v_role text := private.current_role_in_family();
begin
  if v_family_id is null then
    raise exception 'No autenticado';
  end if;
  if v_role <> 'admin' then
    raise exception 'Solo un administrador puede conectar Hevy';
  end if;

  insert into hevy_credentials (family_id, api_key, updated_at)
  values (v_family_id, p_api_key, now())
  on conflict (family_id) do update set api_key = excluded.api_key, updated_at = now();
end;
$$;

create or replace function public.delete_hevy_api_key()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid := private.current_family_id();
  v_role text := private.current_role_in_family();
begin
  if v_family_id is null then
    raise exception 'No autenticado';
  end if;
  if v_role <> 'admin' then
    raise exception 'Solo un administrador puede desconectar Hevy';
  end if;

  delete from hevy_credentials where family_id = v_family_id;
end;
$$;

revoke execute on function public.save_hevy_api_key(text) from public, anon;
revoke execute on function public.delete_hevy_api_key() from public, anon;
grant execute on function public.save_hevy_api_key(text) to authenticated;
grant execute on function public.delete_hevy_api_key() to authenticated;
