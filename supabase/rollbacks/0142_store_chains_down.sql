-- ROLLBACK de la Fase 3 (0142_store_chains.sql). Solo borra objetos creados por esa migración; no toca el catálogo (Fase 1),
-- las familias (Fase 2), ni categorías, clases, productos, precios, tickets, movimientos o presupuestos.
-- catalog_norm_name pertenece a la Fase 1 y se conserva.
drop function if exists public.resolve_store_chain(text);
drop table if exists public.store_chain_aliases;
drop table if exists public.store_chains;
drop function if exists public.store_chains_touch_updated_at();
