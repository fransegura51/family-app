drop index if exists event_tasks_assigned_member_id_idx;
alter table event_tasks drop column if exists assigned_member_id;
