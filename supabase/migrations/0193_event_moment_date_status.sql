-- Eventos — alta mínima: la fecha deja de preguntarse en "Nuevo evento" y vive en el primer bloque del
-- configurador ("Ceremonia y celebración" / "Celebración"). Para eventos organizados por momentos, cada
-- momento necesita su propio estado de fecha (◷ Provisional / ✓ Confirmada).
--
-- Aditiva y sin tocar datos: la columna es NULABLE y los momentos que ya existen se quedan en NULL, que
-- significa "hereda el estado de fecha del evento" (events.date_status) — exactamente lo que valían hasta
-- ahora. Nada se reescribe. events.event_date / events.date_status siguen siendo la única fecha OPERATIVA
-- del evento (calendario, tareas, cuenta atrás...); la app la mantiene al día a partir de los momentos.
alter table event_moments add column date_status text check (date_status is null or date_status in ('provisional', 'confirmada'));
