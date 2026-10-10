-- Rollback de 0235_event_budget_items_tracking.sql.
drop table if exists event_budget_item_history;
drop table if exists event_budget_item_concepts;
alter table event_budget_items drop column if exists committed_amount;
alter table event_budget_items drop column if exists category_id;
alter table event_budget_items drop column if exists group_id;
alter table event_budget_items drop column if exists provider_id;
