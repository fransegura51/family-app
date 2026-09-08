-- Revertido: la familia probó los adjuntos sueltos por día y pidió
-- quitarlos — solo quieren foto/archivo/ubicación ligados a un evento
-- concreto (ya implementado en calendar_events). El bucket
-- calendar-attachments se queda, lo siguen usando los adjuntos de evento.
drop table if exists calendar_day_attachments;
