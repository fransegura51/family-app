-- Punto 1.2 (prompt de correcciones) — "valoraciones" sobre un proveedor, aparte de las "notas" (texto
-- libre) que ya existían. 1 a 5, opcional, nunca inventada. Ya es privada por construcción: providers_global
-- no tiene ninguna superficie de cara a invitados ni a otras familias (RLS por family_id de siempre), así
-- que ni esta columna ni `notes` necesitan ningún cambio de política — "comentarios privados" ya lo eran.
alter table providers_global add column rating smallint null check (rating is null or (rating between 1 and 5));
