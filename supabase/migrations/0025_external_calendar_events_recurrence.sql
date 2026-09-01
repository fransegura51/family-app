-- Los eventos recurrentes de un calendario externo (Google/Outlook/
-- Apple...) solo se importaban en su primera ocurrencia — un evento
-- semanal real de la usuaria solo aparecía una vez al mes en vez de
-- cada semana, dando la sensación de que el calendario "no se había
-- quedado bien enlazado". Se guarda el RRULE (ya normalizado al
-- RRULE-lite propio, no el crudo del .ics) para poder expandirlo igual
-- que los eventos nativos.
alter table external_calendar_events add column recurrence_rule text;
