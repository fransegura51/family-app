-- ROLLBACK de 0182_store_chains_logo_and_shopping_link.sql. Solo quita lo añadido por esa migración; no
-- toca shopping_items, receipts, product_prices ni ninguna otra relación por nombre de tienda ya existente.
drop index if exists public.idx_shopping_stores_chain_key;
alter table public.shopping_stores drop column if exists chain_key;
alter table public.store_chains drop column if exists logo_asset;
