-- Rollback de 0223_event_task_group_offers.sql.
drop policy if exists "event_task_group_offers storage: family delete" on storage.objects;
drop policy if exists "event_task_group_offers storage: family insert" on storage.objects;
drop policy if exists "event_task_group_offers storage: family select" on storage.objects;
delete from storage.buckets where id = 'event_task_group_offers';
drop table if exists event_task_group_offers;
