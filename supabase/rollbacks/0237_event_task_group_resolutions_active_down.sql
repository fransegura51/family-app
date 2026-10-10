-- Rollback de 0237_event_task_group_resolutions_active.sql.
drop index if exists idx_event_task_group_resolutions_active;
alter table event_task_group_resolutions drop column if exists active;
