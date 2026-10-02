-- ROLLBACK de 0184_calendar_tasks_categories.sql.
alter table profiles drop constraint if exists profiles_calendar_task_order_check;
alter table profiles drop column if exists calendar_task_order;
alter table profiles drop constraint if exists profiles_calendar_color_mode_check;
alter table profiles drop column if exists calendar_color_mode;

alter table calendar_events drop column if exists category_id;

drop policy if exists "calendar_categories: family crud" on calendar_categories;
drop table if exists calendar_categories;

alter table calendar_events drop constraint if exists calendar_events_kind_check;
alter table calendar_events drop column if exists kind;
