-- Rollback de 0228_event_task_group_resolution_offer_link.sql.
alter table event_task_group_resolutions drop column if exists offer_id;
alter table event_task_groups drop column if exists offer_id;
