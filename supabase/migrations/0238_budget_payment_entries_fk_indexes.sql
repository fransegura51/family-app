-- Advisor de rendimiento (Supabase) tras la migración 0235/0236 — foreign keys family_id/changed_by sin
-- índice que las cubra en las tablas nuevas. Mismo criterio que el resto de la app tras el pase de
-- escalado (scale_rls_initplan): cada family_id que participa en RLS lleva su propio índice.
create index if not exists idx_event_budget_item_concepts_family on event_budget_item_concepts(family_id);
create index if not exists idx_event_budget_item_history_family on event_budget_item_history(family_id);
create index if not exists idx_event_budget_item_history_changed_by on event_budget_item_history(changed_by);
create index if not exists idx_event_payment_entries_family on event_payment_entries(family_id);
