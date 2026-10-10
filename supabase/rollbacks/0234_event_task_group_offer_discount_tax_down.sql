-- Rollback de 0234_event_task_group_offer_discount_tax.sql.
alter table event_task_group_offers drop column if exists tax_amount;
alter table event_task_group_offers drop column if exists discount_amount;
