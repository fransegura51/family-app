-- Reversión de 0336: quita la columna de la identidad confirmada (la app vuelve a leer el producto del nombre del ticket; no se pierde ningún dato de compras).
alter table public.products drop constraint if exists products_catalog_product_key_valid;
alter table public.products drop column if exists catalog_product_key;
