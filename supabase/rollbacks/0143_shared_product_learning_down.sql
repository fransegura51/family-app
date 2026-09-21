-- ROLLBACK de la Fase 4 (0143_shared_product_learning.sql). Elimina la infraestructura del aprendizaje compartido y la primera
-- siembra (pepa_seed_v1). No toca las fases 1, 2 y 3 (catálogo, vinculación de familias, cadenas y alias), ni categorías, clases,
-- productos, precios, tickets, movimientos, presupuestos o familias. catalog_norm_name (Fase 1) y resolve_store_chain (Fase 3) se conservan.
drop function if exists public.resolve_shared_product_class(text, text);
drop table if exists public.shared_product_learning;
drop table if exists public.shared_learning_batches;
drop function if exists public.shared_product_learning_guard();
drop function if exists public.check_commercial_text(text);
drop function if exists public.product_text_key(text);
