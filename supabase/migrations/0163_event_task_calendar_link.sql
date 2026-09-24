-- Eventos Fase 9 — "Mostrar en Calendario" por tarea. Mismo patrón ya
-- certificado que events.rsvp_deadline_calendar_event_id (enlace
-- ESTABLE por id, nunca se busca por título): la propia presencia de
-- este id es el estado del interruptor -- null = no se muestra, con
-- valor = ya tiene su calendar_events enlazado. Nullable, backward
-- compatible: las tareas ya existentes se quedan sin enlazar, sin
-- ningún cambio de comportamiento ni backfill.
alter table event_tasks
  add column calendar_event_id uuid references calendar_events(id) on delete set null;

create index if not exists event_tasks_calendar_event_id_idx on event_tasks(calendar_event_id);
