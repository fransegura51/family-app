-- 0333 · Agrupación automática del comparador: grupos propuestos por PEPA, pendientes de revisar (COMP-3)
--
-- Aditiva. Un producto común creado por PEPA a partir del historial nace 'pending' (se enseña como «Agrupado por PEPA, pendiente de revisar»); al confirmarlo
-- pasa a 'confirmed'. Los grupos que ya existían (creados por la familia) quedan 'confirmed' tal cual: ninguna fila existente cambia de significado.
-- Los artículos que la persona separa o descarta de una propuesta de PEPA se anotan en common_product_auto_rejects para que PEPA no vuelva a proponerlos
-- (el proceso es idempotente: ejecutarlo varias veces no duplica ni resucita lo descartado). Los precios, tickets y formatos NO se tocan.
alter table public.common_products add column if not exists status text not null default 'confirmed';
alter table public.common_products drop constraint if exists common_products_status_valid;
alter table public.common_products add constraint common_products_status_valid check (status in ('confirmed', 'pending'));

-- 'pepa' = lo agrupó el proceso automático de PEPA (propuesta pendiente de revisar).
alter table public.common_product_members drop constraint if exists common_product_members_source_check;
alter table public.common_product_members add constraint common_product_members_source_check check (source in ('sugerido', 'manual', 'auto', 'pepa'));

create table if not exists public.common_product_auto_rejects (
  product_id uuid primary key references public.products(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists common_product_auto_rejects_family_idx on public.common_product_auto_rejects (family_id);

create or replace function public.common_product_auto_rejects_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.products p where p.id = new.product_id and p.family_id = new.family_id) then
    raise exception 'common_product_auto_rejects: el artículo no es de tu familia' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists common_product_auto_rejects_guard on public.common_product_auto_rejects;
create trigger common_product_auto_rejects_guard before insert or update on public.common_product_auto_rejects
  for each row execute function public.common_product_auto_rejects_guard();

alter table public.common_product_auto_rejects enable row level security;
drop policy if exists "common_product_auto_rejects: family crud" on public.common_product_auto_rejects;
create policy "common_product_auto_rejects: family crud" on public.common_product_auto_rejects
  for all to authenticated
  using (family_id = (select private.current_family_id()))
  with check (family_id = (select private.current_family_id()));

revoke all on public.common_product_auto_rejects from public, anon, authenticated;
grant select, insert, update, delete on public.common_product_auto_rejects to authenticated;
revoke all on function public.common_product_auto_rejects_guard() from public, anon, authenticated;
