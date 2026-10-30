-- 0359 · COMP-02 — Título original de los productos importados (referencia).
--
-- Los pedidos de Amazon llegan con el título de posicionamiento del vendedor (200 caracteres, palabras repetidas). El nombre visible pasa a ser una versión limpia
-- (domain/commercialTitle.ts) y el título ORIGINAL completo se conserva aparte en esta columna, como dato de referencia. Opcional y sin valor por defecto: NO cambia ningún
-- producto existente, ningún nombre ni ninguna compra. Solo se rellena (a) al importar un pedido nuevo y (b) cuando una persona acepta el nombre sugerido de un producto
-- ya importado (se guarda el nombre que tenía hasta entonces).
-- ROLLBACK: supabase/rollbacks/0359_product_original_name_down.sql
alter table public.products add column if not exists original_name text;
comment on column public.products.original_name is 'Título comercial original completo de un producto importado (p. ej. Amazon); display_name es la versión limpia. Solo referencia.';
