-- Rollback de 0227_event_task_group_offer_items.sql.
alter table event_task_group_offers drop column if exists supersedes_offer_id;
drop table if exists event_task_group_offer_items;
