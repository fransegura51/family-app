drop index if exists event_tasks_calendar_event_id_idx;
alter table event_tasks drop column if exists calendar_event_id;
