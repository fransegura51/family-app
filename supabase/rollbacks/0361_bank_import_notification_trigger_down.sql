-- Deshacer 0361: quita el disparador del aviso agrupado del banco. Los avisos ya creados no se tocan. (0360 queda con sus columnas y su función de reparto.)
drop trigger if exists bank_transactions_notify_new on public.bank_transactions;
drop function if exists private.bank_transactions_notify_new();
drop function if exists public.notify_bank_import(uuid, text, integer, integer, uuid[]);
drop function if exists private.bank_import_text(integer, integer);
