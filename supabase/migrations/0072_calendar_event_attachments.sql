-- Adjuntos ligados a un evento concreto (foto/archivo, ubicación,
-- nota) — formato "Nuevo evento" de referencia. Reutiliza el mismo
-- bucket calendar-attachments ya creado para los adjuntos sueltos del
-- día (misma familia, mismas políticas de RLS por has_section_access).
alter table calendar_events add column location_label text;
alter table calendar_events add column location_latitude double precision;
alter table calendar_events add column location_longitude double precision;
alter table calendar_events add column attachment_storage_path text;
alter table calendar_events add column attachment_kind text check (attachment_kind in ('foto', 'archivo'));
alter table calendar_events add column attachment_original_name text;
alter table calendar_events add column note text;
