-- Reversión de 0330. OJO: borra los formatos de envase guardados (los precios y el resto no se tocan; el comparador vuelve a leer el tamaño del nombre).
alter table public.product_prices drop constraint if exists product_prices_pack_valid;
alter table public.product_prices
  drop column if exists pack_count,
  drop column if exists pack_amount,
  drop column if exists pack_unit,
  drop column if exists pack_source;
