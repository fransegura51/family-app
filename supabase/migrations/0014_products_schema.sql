-- Skills 09/11: productos normalizados con historial de precios, y
-- memoria de compras (frecuencia, sugerencias). Sin OCR de tickets (eso
-- sigue pendiente de un proveedor de IA de pago): el precio se registra
-- a mano al marcar un producto como comprado.

create table products (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  normalized_name text not null, -- minúsculas + recortado, para agrupar variantes del mismo texto
  display_name text not null,    -- el texto tal cual lo escribió la familia, se conserva (Skill 11)
  category text,
  brand text,
  created_at timestamptz not null default now(),
  unique (family_id, normalized_name)
);

create table product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  price numeric(10, 2) not null check (price >= 0),
  store text,
  quantity text,
  unit text,
  recorded_date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table products enable row level security;
alter table product_prices enable row level security;

create policy "products: family crud" on products for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

create policy "product_prices: family crud" on product_prices for all
  using (exists (select 1 from products p where p.id = product_id and p.family_id = private.current_family_id()))
  with check (exists (select 1 from products p where p.id = product_id and p.family_id = private.current_family_id()));

create index idx_products_family on products(family_id);
create index idx_product_prices_product on product_prices(product_id);
