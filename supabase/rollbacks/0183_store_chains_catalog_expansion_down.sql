-- ROLLBACK de 0183_store_chains_catalog_expansion.sql. Solo borra las cadenas/alias añadidos aquí; no
-- toca ninguna otra fila de store_chains/store_chain_aliases. shopping_stores.chain_key no tiene
-- "on delete" (por defecto, bloquea el borrado) — si alguna familia ya vinculó una tienda a una de estas
-- cadenas, este rollback falla con un error de FK en vez de borrar en silencio; hay que desvincular esa
-- tienda a mano primero (chain_key = null) si de verdad se quiere deshacer esta migración.
delete from public.store_chain_aliases where chain_key in ('carrefour', 'eroski', 'alcampo', 'el_corte_ingles', 'hipercor');
delete from public.store_chains where key in ('carrefour', 'eroski', 'dia', 'alcampo', 'el_corte_ingles', 'hipercor');
