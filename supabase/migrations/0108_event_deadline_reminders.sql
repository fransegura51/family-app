-- Módulo Eventos — Fase 3: recordatorios push de plazo de RSVP y de
-- pagos/fianzas, reutilizando el pipeline de recordatorios que ya
-- existe para calendar_events (send-due-reminders) — mismo patrón que
-- member_documents.calendar_event_id para el vencimiento de un
-- documento: se crea una fila normal en calendar_events (privada de
-- cara al invitado, visible para la familia) y estas columnas guardan
-- el enlace de vuelta para poder actualizarla o no duplicarla.
alter table events add column rsvp_deadline_calendar_event_id uuid references calendar_events(id) on delete set null;
alter table event_payments add column reminder_calendar_event_id uuid references calendar_events(id) on delete set null;
