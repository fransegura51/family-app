-- 0336 · Producto del catálogo maestro confirmado o corregido por la familia al revisar un ticket
--
-- El catálogo maestro (src/domain/catalog) lee el producto del texto del ticket al vuelo. Cuando la familia CONFIRMA o CORRIGE esa lectura en la
-- pantalla «Productos leídos», se guarda aquí la clave estable del producto del catálogo (p. ej. «lac.leche», «pes.merluza»), para que Compras,
-- Economía y el Comparador usen la misma identidad y no se pierda la corrección.
-- Aditiva: una columna opcional. No cambia ningún nombre, precio, ticket ni clasificación existente; sin valor, todo se lee como antes.
-- Las políticas de products no cambian (cada familia solo ve y edita lo suyo).
alter table public.products add column if not exists catalog_product_key text;
alter table public.products drop constraint if exists products_catalog_product_key_valid;
alter table public.products add constraint products_catalog_product_key_valid check (catalog_product_key is null or catalog_product_key ~ '^[a-z0-9_.]{2,80}$');
