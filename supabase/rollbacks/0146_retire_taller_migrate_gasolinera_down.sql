-- ROLLBACK de la Fase 6B (0146_retire_taller_migrate_gasolinera.sql): restaura el estado anterior EXACTO.
--   * Recrea la categoría personal «Taller» con su mismo id, padre, orden, icono y demás propiedades (copiadas en category_migration_log).
--   * Devuelve a «Gasolinera» los 2 gastos bancarios migrados (solo si siguen en «Combustible», para no pisar cambios posteriores).
--   * Elimina el propio registro. No toca receipts, budgets, productos, catálogo ni ninguna otra familia.
-- El registro de actividad (trigger de expenses) se suspende durante el cambio, igual que en la migración.
alter table public.expenses disable trigger trg_log_expenses;

update public.expenses e
set category = l.before ->> 'category'
from public.category_migration_log l
where l.phase = '6B' and l.entity = 'expense' and l.entity_id = e.id and e.category = l.after ->> 'category';

alter table public.expenses enable trigger trg_log_expenses;

insert into public.budget_categories
select r.*
from public.category_migration_log l,
     jsonb_populate_record(null::public.budget_categories, l.before) r
where l.phase = '6B' and l.entity = 'budget_category'
on conflict do nothing;

drop table if exists public.category_migration_log;
