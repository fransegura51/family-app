-- ROLLBACK del cierre de la Fase 6B (0147_close_gasolinera_reference.sql): deja el estado posterior a la 0146.
--   * Recrea la categoría personal Gasolinera de Familia Hepburn con su mismo id, padre, orden, icono y demás propiedades.
--   * Devuelve el ticket de Repsol (bombona) a la categoría «Gasolinera» (solo si sigue en «Suministros»).
-- Conserva el registro de la 0146 (para poder deshacer también esa) y borra solo las filas de este cierre.
-- El rollback COMPLETO de la Fase 6B (Taller, los 2 movimientos, Gasolinera y el ticket) es 0146_retire_taller_migrate_gasolinera_down.sql.
insert into public.budget_categories
select r.*
from public.category_migration_log l,
     jsonb_populate_record(null::public.budget_categories, l.before) r
where l.phase = '6B-cierre' and l.entity = 'budget_category'
on conflict do nothing;

update public.receipts x
set category = l.before ->> 'category'
from public.category_migration_log l
where l.phase = '6B-cierre' and l.entity = 'receipt' and l.entity_id = x.id and x.category = l.after ->> 'category';

delete from public.category_migration_log where phase = '6B-cierre';
