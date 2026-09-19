-- Panel /admin de la web de PEPA (pepa-web): función de solo lectura
-- para que el cliente sepa si debe pintar el panel o no. No es la
-- barrera de seguridad real (eso lo hace la RLS de cada tabla nueva,
-- todas con el mismo predicado is_app_owner) — solo evita la
-- ambigüedad de "AdminUsageScreen" (vacío por falta de datos vs. vacío
-- por falta de permiso), devolviendo un booleano explícito.
create or replace function public.is_pepa_web_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles me where me.id = auth.uid() and me.is_app_owner
  );
$$;

grant execute on function public.is_pepa_web_admin() to authenticated;
