-- ROLLBACK de la Fase 5 (0144_product_class_confirmed.sql): retira class_confirmed_at, su trigger y la RPC por lote.
-- No toca las fases 1-4 (catálogo, familias, cadenas, aprendizaje compartido), ni ninguna categoría de producto, precio, ticket,
-- movimiento o presupuesto.
--
-- QUÉ PASA CON LAS CONFIRMACIONES: las marcas de tiempo class_confirmed_at se PIERDEN (la columna desaparece), pero cada
-- products.category se conserva intacta. Es exactamente el estado anterior a la Fase 5: la categoría guardada vuelve a mandar tal
-- cual, sin distinguir si era manual o automática. Si se vuelve a aplicar la migración 0144, el backfill re-marca las mismas 185.
-- IMPORTANTE: revertir la base de datos sin revertir también el código (commit de la Fase 5) hace que el cliente nuevo falle al
-- leer/escribir class_confirmed_at; el rollback completo es: revertir el commit + este archivo.
drop function if exists public.resolve_shared_product_classes(jsonb);
drop trigger if exists products_class_confirmed_guard on public.products;
drop function if exists public.products_class_confirmed_guard();
alter table public.products drop column if exists class_confirmed_at;
