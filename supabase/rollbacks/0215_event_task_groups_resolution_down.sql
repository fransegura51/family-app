-- Rollback de 0215_event_task_groups_resolution.sql.
drop index if exists event_task_groups_kind_unique;

alter table event_task_groups
  drop column if exists kind,
  drop column if exists resolved_at,
  drop column if exists resolution_method,
  drop column if exists resolution_note,
  drop column if exists provider_id,
  drop column if exists provider_name,
  drop column if exists payment_id;
