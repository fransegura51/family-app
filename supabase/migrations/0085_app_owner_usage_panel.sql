-- Petición real: "quiero un contador para ver la gente que se ha
-- descargado la aplicación... para controlar la gente que se descarga
-- la aplicación, para ver en cuanto a orden de descarga". El
-- administrador de la app (no de una familia concreta) son Jennifer y
-- Paco — un concepto nuevo, distinto de profiles.role='admin' (que es
-- solo administrador DENTRO de su propia familia; ya hay admins en
-- otras familias de prueba, p. ej. Fran en "Familia prueba", que no
-- deben ver esto).
alter table profiles add column is_app_owner boolean not null default false;

-- Cada fila de profiles = una cuenta real de Supabase Auth = una
-- "descarga" en el sentido que importa aquí (family_members sin cuenta
-- propia no han instalado nada). has_push se usa como pista de "de
-- verdad la tiene puesta en el móvil" (activó notificaciones), no solo
-- "la abrió una vez en el navegador". Sin RLS-policy propia (no expone
-- ninguna tabla nueva): todo el control de acceso vive en el where de
-- abajo, que solo deja ver filas si quien llama es ya is_app_owner —
-- así que a cualquier otra persona simplemente le devuelve 0 filas, sin
-- error ni pista de que la función existe.
create or replace function public.list_app_usage()
returns table (
  family_id uuid,
  family_name text,
  profile_id uuid,
  display_name text,
  role text,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  has_push boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    f.id, f.name, p.id, p.display_name, p.role, u.email, u.created_at, u.last_sign_in_at,
    exists(select 1 from push_subscriptions ps where ps.profile_id = p.id)
  from profiles p
  join families f on f.id = p.family_id
  join auth.users u on u.id = p.id
  where exists (select 1 from profiles me where me.id = auth.uid() and me.is_app_owner)
  order by p.created_at asc
$$;

revoke all on function public.list_app_usage() from public, anon;
grant execute on function public.list_app_usage() to authenticated;

update profiles set is_app_owner = true
where id in ('93b0ce0e-f786-40d2-b683-4fa7cc4e3ef4', '8019cab6-66cf-4803-83ef-9e0cdbe3c9eb');
