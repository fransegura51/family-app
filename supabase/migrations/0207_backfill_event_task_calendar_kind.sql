-- Backfill seguro: antes de la migración 0206, linkEventTaskToCalendar insertaba calendar_events sin
-- `kind`, así que quedaba el valor por defecto 'event' (migración 0184) aunque la entrada fuera en
-- realidad la tarea enlazada de un event_tasks (Preparativos de Eventos), no un evento real.
--
-- Identificación FIABLE (no heurística): una fila de calendar_events es el "carrier" de una tarea si y
-- solo si existe una fila en event_tasks cuyo calendar_event_id apunta exactamente a ese id. Esa
-- relación ya es la fuente de verdad que usa toda la sincronización (events.ts: linkEventTaskToCalendar
-- / syncLinkedTaskCalendarEventSafely), así que no hay ambigüedad posible: NUNCA se toca una fila que
-- no esté referenciada así, por lo que ningún evento real puede resultar afectado.
--
-- Auditado antes de aplicar (objhgjgrinbhyzscjlbw, solo lectura):
--   - 889 calendar_events en total; 5 ya tenían kind='task' (de la función general de Tareas del
--     calendario, migración 0184 — no son de Preparativos de Eventos: ninguno está referenciado desde
--     event_tasks.calendar_event_id, así que esta migración no los toca).
--   - exactamente 2 candidatos: e589bf36-37e7-46c8-ab00-a551bb95e6fc ("Enviar las invitaciones") y
--     5c6303a7-7c51-422b-a8dc-7284e7b6ba4f ("Encargar la tarta"), ambos de la familia
--     011429a4-4fd8-4341-9c04-ec6b2f585196, ambos con el mismo título que su event_tasks
--     correspondiente (054d0d1d-4a15-4316-a9b9-b02ae87754a3 / fe68db4b-1b63-4920-9fda-e2c32f479224),
--     ambos all_day=true (como siempre crea linkEventTaskToCalendar).
--   - 0 punteros huérfanos (event_tasks.calendar_event_id que no exista en calendar_events).
--
-- Verificado después de aplicar: 7 calendar_events con kind='task' (5+2), 0 candidatos restantes, 882
-- con kind='event' (889-7, consistente).
update calendar_events
set kind = 'task'
where kind <> 'task'
  and id in (select calendar_event_id from event_tasks where calendar_event_id is not null);
