-- Salud física (Hevy): cada familia guarda su propia clave de API de
-- Hevy (cuenta Pro personal, no un secreto compartido de toda la app
-- como FatSecret) — por eso va en su propia tabla con RLS por familia,
-- no en Vault (que es para secretos únicos de toda la aplicación).
--
-- La clave real NUNCA se deja leer desde el cliente, ni siquiera al
-- admin que la guardó — no hay ninguna política de SELECT a propósito.
-- Solo la función de servidor (hevy-proxy, con la service role key que
-- salta RLS) la lee para llamar a la API de Hevy. El admin sabe si ya
-- hay una guardada a través de has_hevy_api_key(), que solo dice
-- true/false, nunca el valor.
create table hevy_credentials (
  family_id uuid primary key references families(id) on delete cascade,
  api_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table hevy_credentials enable row level security;

create policy "hevy_credentials: admin insert"
  on hevy_credentials for insert
  with check (family_id = private.current_family_id() and private.current_role_in_family() = 'admin');

create policy "hevy_credentials: admin update"
  on hevy_credentials for update
  using (family_id = private.current_family_id() and private.current_role_in_family() = 'admin')
  with check (family_id = private.current_family_id() and private.current_role_in_family() = 'admin');

create policy "hevy_credentials: admin delete"
  on hevy_credentials for delete
  using (family_id = private.current_family_id() and private.current_role_in_family() = 'admin');

create or replace function public.has_hevy_api_key()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from hevy_credentials where family_id = private.current_family_id()
  )
$$;

revoke execute on function public.has_hevy_api_key() from public, anon;
grant execute on function public.has_hevy_api_key() to authenticated;
