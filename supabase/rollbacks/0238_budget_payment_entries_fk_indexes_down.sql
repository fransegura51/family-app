-- Rollback de 0238_budget_payment_entries_fk_indexes.sql.
drop index if exists idx_event_payment_entries_family;
drop index if exists idx_event_budget_item_history_changed_by;
drop index if exists idx_event_budget_item_history_family;
drop index if exists idx_event_budget_item_concepts_family;
