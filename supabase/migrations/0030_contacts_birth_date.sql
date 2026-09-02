-- Cumpleaños también en Contactos (no solo en miembros de la familia)
-- para que aparezcan en Cumpleaños y en el Calendario — p. ej. la
-- abuela o un amigo que se guarda como contacto, no como miembro.
alter table contacts add column birth_date date;
