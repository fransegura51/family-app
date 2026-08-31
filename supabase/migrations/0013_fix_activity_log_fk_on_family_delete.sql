-- Bug real (encontrado durante limpieza de datos de pentest): borrar una
-- familia hace cascade delete de family_members, cuyo trigger intenta
-- INSERTAR en activity_log con el family_id que se está borrando en la
-- misma sentencia — la FK a families(id) revienta porque el padre ya no
-- existe en el momento del insert del log. Un log de auditoría no debe
-- depender de que la entidad referenciada siga existiendo (así sobrevive
-- incluso si la familia se elimina más adelante): se quita la FK dura y
-- se deja family_id como columna simple, indexada, usada solo por RLS.
alter table activity_log drop constraint activity_log_family_id_fkey;
