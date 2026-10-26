-- 0331 · Productos comunes para el comparador de precios (COMP-3)
--
-- Un PRODUCTO COMÚN agrupa artículos de distintas tiendas, marcas y formatos que se pueden comparar entre sí (LECHE SEMIDESNATADA: pack 6 × 1 l de Mercadona,
-- botella 1,5 l de Hiperber…). Cada artículo pertenece a UN solo producto común; no se emparejan los artículos de dos en dos. Lo que ya existía NO se duplica:
--   · «es exactamente el mismo producto» / «distinto» sigue siendo product_equivalences (decisión de la familia entre dos artículos) y el aprendizaje compartido
--     entre familias sigue funcionando igual (solo nombres normalizados).
--   · common_products / common_product_members solo dicen «estos artículos se comparan entre sí» (comparables).
-- Aditiva: tablas nuevas, ningún cambio sobre datos ni políticas existentes. Todo es de LA FAMILIA (RLS) y un artículo solo puede unirse a un producto común de su
-- propia familia (guarda). Los precios, formatos y nombres originales no se tocan nunca: aquí solo se guardan los vínculos.
create table if not exists public.common_products (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  normalized_name text not null,
  created_at timestamptz not null default now(),
  constraint common_products_name_uidx unique (family_id, normalized_name)
);
create index if not exists common_products_family_idx on public.common_products (family_id);

create table if not exists public.common_product_members (
  product_id uuid primary key references public.products(id) on delete cascade,
  common_id uuid not null references public.common_products(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  -- 'sugerido' = la persona aceptó la propuesta de PEPA; 'manual' = la eligió o creó ella; 'auto' = PEPA lo asignó sola porque era idéntico a un artículo ya agrupado.
  source text not null default 'manual' check (source in ('sugerido', 'manual', 'auto')),
  created_at timestamptz not null default now()
);
create index if not exists common_product_members_common_idx on public.common_product_members (common_id);
create index if not exists common_product_members_family_idx on public.common_product_members (family_id);

-- Artículos que la persona decide NO emparejar (no vuelven a la cola de «Emparejar»).
create table if not exists public.common_product_skips (
  product_id uuid primary key references public.products(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists common_product_skips_family_idx on public.common_product_skips (family_id);

-- Código de barras (EAN), solo AUXILIAR: ayuda a reconocer un artículo idéntico, nunca es requisito para comparar. Opcional.
alter table public.products add column if not exists ean text;
alter table public.products drop constraint if exists products_ean_valid;
alter table public.products add constraint products_ean_valid check (ean is null or ean ~ '^[0-9]{8,14}$');
create index if not exists products_family_ean_idx on public.products (family_id, ean) where ean is not null;

-- Guardas: el artículo y el producto común deben ser de la misma familia que la fila.
create or replace function public.common_product_members_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.products p where p.id = new.product_id and p.family_id = new.family_id) then
    raise exception 'common_product_members: el artículo no es de tu familia' using errcode = '23514';
  end if;
  if not exists (select 1 from public.common_products c where c.id = new.common_id and c.family_id = new.family_id) then
    raise exception 'common_product_members: el producto común no es de tu familia' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists common_product_members_guard on public.common_product_members;
create trigger common_product_members_guard before insert or update on public.common_product_members
  for each row execute function public.common_product_members_guard();

create or replace function public.common_product_skips_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.products p where p.id = new.product_id and p.family_id = new.family_id) then
    raise exception 'common_product_skips: el artículo no es de tu familia' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists common_product_skips_guard on public.common_product_skips;
create trigger common_product_skips_guard before insert or update on public.common_product_skips
  for each row execute function public.common_product_skips_guard();

alter table public.common_products enable row level security;
alter table public.common_product_members enable row level security;
alter table public.common_product_skips enable row level security;

drop policy if exists "common_products: family crud" on public.common_products;
create policy "common_products: family crud" on public.common_products
  for all to authenticated
  using (family_id = (select private.current_family_id()))
  with check (family_id = (select private.current_family_id()));
drop policy if exists "common_product_members: family crud" on public.common_product_members;
create policy "common_product_members: family crud" on public.common_product_members
  for all to authenticated
  using (family_id = (select private.current_family_id()))
  with check (family_id = (select private.current_family_id()));
drop policy if exists "common_product_skips: family crud" on public.common_product_skips;
create policy "common_product_skips: family crud" on public.common_product_skips
  for all to authenticated
  using (family_id = (select private.current_family_id()))
  with check (family_id = (select private.current_family_id()));

-- Privilegios mínimos (como 0312b): solo la sesión de una persona con cuenta; nada para anon.
revoke all on public.common_products, public.common_product_members, public.common_product_skips from public, anon, authenticated;
grant select, insert, update, delete on public.common_products, public.common_product_members, public.common_product_skips to authenticated;
revoke all on function public.common_product_members_guard(), public.common_product_skips_guard() from public, anon, authenticated;
