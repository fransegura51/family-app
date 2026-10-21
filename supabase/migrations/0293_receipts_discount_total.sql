-- Fallo real reportado: «Los descuentos que hay en los tickets no los registra». Las líneas de descuento (importe negativo) se apartaban del
-- historial de precios y se perdían sin dejar rastro. Ahora el ticket guarda la SUMA de sus descuentos (positiva, en €) para mostrarla;
-- el total del ticket sigue siendo el pagado (ya con el descuento aplicado).
alter table public.receipts
  add column if not exists discount_total numeric(10, 2) not null default 0 check (discount_total >= 0);
