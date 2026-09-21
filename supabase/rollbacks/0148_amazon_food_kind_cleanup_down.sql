-- ROLLBACK de la Fase 6C (0148_amazon_food_kind_cleanup.sql): restaura EXACTAMENTE lo que la migración cambió.
--   * Los 10 productos con clase de «no alimentos» vuelven a non_food = false.
--   * Las 2 camisetas de La Tostadora vuelven a no tener clase, sin confirmar y con non_food = false.
--   * El ticket 02c189b8… vuelve a la categoría literal «Amazon».
-- Solo se restaura una fila si sigue en el valor al que la llevó la migración (no se pisan cambios posteriores de la familia).
-- No toca gastos, precios, presupuestos, categorías, clases, catálogo, cadenas, aprendizaje compartido ni otras familias.
update public.products p
set category = l.before ->> 'category',
    class_confirmed_at = (l.before ->> 'class_confirmed_at')::timestamptz,
    non_food = (l.before ->> 'non_food')::boolean
from public.food_kind_migration_log l
where l.phase = '6C' and l.entity = 'product' and l.entity_id = p.id
  and p.category is not distinct from (l.after ->> 'category')
  and p.class_confirmed_at is not distinct from (l.after ->> 'class_confirmed_at')::timestamptz
  and p.non_food = (l.after ->> 'non_food')::boolean;

update public.receipts x
set category = l.before ->> 'category'
from public.food_kind_migration_log l
where l.phase = '6C' and l.entity = 'receipt' and l.entity_id = x.id and x.category = l.after ->> 'category';

drop table if exists public.food_kind_migration_log;
