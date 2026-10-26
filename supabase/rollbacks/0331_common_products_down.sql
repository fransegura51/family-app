-- Reversión de 0331. OJO: borra los productos comunes, sus vínculos, los «no emparejar» y los códigos EAN guardados (los artículos, precios y formatos no se tocan).
drop trigger if exists common_product_members_guard on public.common_product_members;
drop trigger if exists common_product_skips_guard on public.common_product_skips;
drop function if exists public.common_product_members_guard();
drop function if exists public.common_product_skips_guard();
drop table if exists public.common_product_skips;
drop table if exists public.common_product_members;
drop table if exists public.common_products;
drop index if exists public.products_family_ean_idx;
alter table public.products drop constraint if exists products_ean_valid;
alter table public.products drop column if exists ean;
