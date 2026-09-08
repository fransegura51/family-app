-- Fecha de vencimiento opcional por documento (DNI, seguro, ITV...) —
-- petición real: "campo de fecha de vencimiento opcional al subir
-- documento, anotarlo automáticamente en el calendario y que mande
-- varios recuerdos de renovación". calendar_event_id enlaza con el
-- evento creado automáticamente, para poder borrarlo/actualizarlo si
-- se cambia o se borra el documento.
alter table member_documents add column expiry_date date;
alter table member_documents add column calendar_event_id uuid references calendar_events(id) on delete set null;
