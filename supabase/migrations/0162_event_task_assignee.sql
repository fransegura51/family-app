-- Eventos Fase 6 — responsable de una tarea. Auditoría: event_tasks no
-- tenía ninguna columna de responsable, así que hoy solo puede haber
-- avisos familiares, nunca "esto lo hace Paco". Mismo patrón ya usado
-- en el resto de la app para "asignado a" (bank_accounts.owner_member_id,
-- receipts.purchased_by_member_id, calendar_event_completions.member_id):
-- FK nullable a family_members, on delete set null — nunca se infiere ni
-- se rellena solo; las tareas ya existentes (y las nuevas por defecto)
-- se quedan sin asignar, sin ningún cambio de comportamiento.
alter table event_tasks
  add column assigned_member_id uuid references family_members(id) on delete set null;

create index if not exists event_tasks_assigned_member_id_idx on event_tasks(assigned_member_id);
