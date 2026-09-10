-- Petición real: "vamos a hacer todo lo que falta para que... no
-- falle". Hasta ahora, si a una familia se le rompía una pantalla, nadie
-- se enteraba: ErrorBoundary solo pintaba el error en la pantalla de
-- quien lo sufría. Con miles de usuarios eso es ir a ciegas. Esta tabla
-- recibe cada error de la app (fallo de render, promesa sin capturar,
-- error global) y la dueña de la app los ve en su panel.
create table client_errors (
  id uuid primary key default gen_random_uuid(),
  -- Sin FK a profiles: un usuario recién registrado (todavía sin
  -- profiles row, en el alta) también tiene que poder reportar.
  profile_id uuid,
  family_id uuid references families(id) on delete set null,
  message text not null,
  stack text,
  component_stack text,
  url text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index idx_client_errors_created on client_errors(created_at desc);
create index idx_client_errors_family on client_errors(family_id);

-- family_id lo rellena el servidor a partir del perfil, para que el
-- cliente no tenga que hacer ninguna consulta extra en plena caída.
create or replace function private.fill_client_error_family()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.family_id is null and new.profile_id is not null then
    select family_id into new.family_id from profiles where id = new.profile_id;
  end if;
  return new;
end;
$$;

create trigger client_errors_fill_family
  before insert on client_errors
  for each row execute function private.fill_client_error_family();

alter table client_errors enable row level security;

-- Cualquier usuario autenticado puede registrar SU propio error.
create policy "client_errors: insert own" on client_errors
  for insert to authenticated
  with check (profile_id = (select auth.uid()));

-- Solo la dueña de la app los lee (mismo criterio que list_app_usage).
create policy "client_errors: owner select" on client_errors
  for select to authenticated
  using (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));

-- Idem para limpiarlos desde el panel.
create policy "client_errors: owner delete" on client_errors
  for delete to authenticated
  using (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));
