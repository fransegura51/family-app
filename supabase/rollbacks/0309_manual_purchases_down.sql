-- Retira lo añadido en 0309. Las compras manuales ya guardadas conservan su fila (y su gasto); solo se pierden las dos columnas.
drop trigger if exists receipts_check_purchaser_family on public.receipts;
drop function if exists public.receipts_check_purchaser_family();
alter table public.receipts drop constraint if exists receipts_payment_method_check;
alter table public.receipts drop column if exists payment_method;
alter table public.receipts drop column if exists is_manual;
