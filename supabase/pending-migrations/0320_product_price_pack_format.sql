-- 0320 · Formato del envase en cada compra de un producto (COMP-2)
--
-- Para comparar precios entre tiendas hace falta saber cuánto contiene lo que se compró (6 latas × 330 ml = 1,98 l). Hasta ahora solo se podía leer del NOMBRE.
-- Ahora se guarda, opcional, en cada línea de product_prices: lo confirma la persona al registrar la compra, o se reconoce del nombre / de compras anteriores.
-- Aditiva: cuatro columnas nuevas, todas opcionales (null = formato desconocido, como hasta ahora). No cambia ningún precio ni ninguna política (la de product_prices ya
-- cubre las columnas nuevas). Una presentación distinta del mismo producto (pack de 6 / pack de 12) es otra línea con su propio formato: nunca se mezclan.
alter table public.product_prices
  add column if not exists pack_count numeric(8, 3),
  add column if not exists pack_amount numeric(12, 3),
  add column if not exists pack_unit text,
  add column if not exists pack_source text;

alter table public.product_prices drop constraint if exists product_prices_pack_valid;
alter table public.product_prices add constraint product_prices_pack_valid check (
  (pack_count is null and pack_amount is null and pack_unit is null and pack_source is null)
  or (pack_count > 0 and pack_amount > 0 and pack_unit in ('g', 'kg', 'ml', 'l', 'ud') and pack_source in ('ticket', 'nombre', 'recordado', 'manual'))
);
