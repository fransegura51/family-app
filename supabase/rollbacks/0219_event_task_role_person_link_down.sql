-- Rollback de 0219_event_task_role_person_link.sql: restaura la policy de event_tasks exactamente como
-- quedó en la migración 0176 (sin la condición de role_person_id).
drop policy "event_tasks: family crud" on event_tasks;
create policy "event_tasks: family crud" on event_tasks for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id() and private.has_section_access('eventos')
    and (decision_id is null or exists (select 1 from event_decisions d where d.id = decision_id and d.family_id = private.current_family_id() and d.event_id = event_tasks.event_id))
  );

drop index if exists idx_event_tasks_role_person;
alter table event_tasks drop column if exists role_person_id;
