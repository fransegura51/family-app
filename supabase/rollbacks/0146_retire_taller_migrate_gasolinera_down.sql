-- ROLLBACK COMPLETO de la Fase 6B (0146_retire_taller_migrate_gasolinera.sql + 0147_close_gasolinera_reference.sql): restaura el estado
-- anterior a la Fase 6B, EXACTO:
--   * Recrea las categorías personales «Taller» y «Gasolinera» de Familia Hepburn con sus mismos ids, padre, orden, icono y demás
--     propiedades (copiadas en category_migration_log).
--   * Devuelve a «Gasolinera» los 2 gastos bancarios migrados (FOOTWORK-EL BADEN y E S THADER-MURCIA) y el ticket de Repsol (bombona).
--     Solo se devuelve lo que sigue en la categoría a la que se migró, para no pisar cambios posteriores.
--   * Elimina el propio registro. No toca productos, precios, presupuestos, catálogo, Familia Demo ni ninguna otra familia.
-- El registro de actividad (trigger de expenses) se suspende durante el cambio de gastos, igual que en la migración.
alter table public.expenses disable trigger trg_log_expenses;

update public.expenses e
set category = l.before ->> 'category'
from public.category_migration_log l
where l.phase in ('6B', '6B-cierre') and l.entity = 'expense' and l.entity_id = e.id and e.category = l.after ->> 'category';

alter table public.expenses enable trigger trg_log_expenses;

update public.receipts x
set category = l.before ->> 'category'
from public.category_migration_log l
where l.phase in ('6B', '6B-cierre') and l.entity = 'receipt' and l.entity_id = x.id and x.category = l.after ->> 'category';

insert into public.budget_categories
select r.*
from public.category_migration_log l,
     jsonb_populate_record(null::public.budget_categories, l.before) r
where l.phase in ('6B', '6B-cierre') and l.entity = 'budget_category'
on conflict do nothing;

drop table if exists public.category_migration_log;
