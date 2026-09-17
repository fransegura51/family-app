-- Petición real: "en los productos no alimenticios en el engranaje
-- viene la misma clasificación de los alimentos... reestructuramos la
-- creación de clases y la hacemos para todos los productos, misma
-- separación por un botón Alimentos y Otros" — family_food_types pasa
-- a servir dos conjuntos de clases independientes (uno por Alimentos,
-- otro por Otros), no solo el de alimentación. Las filas ya
-- existentes son todas de Alimentos, así que el valor por defecto las
-- deja tal cual sin tocar nada a mano.
alter table family_food_types
  add column kind text not null default 'alimentacion' check (kind in ('alimentacion', 'no_alimentos'));

-- El nombre solo tenía que ser único DENTRO de cada conjunto (ya no
-- vale que "Otros" para Alimentos choque con un futuro "Otros" para
-- Otros productos).
drop index if exists idx_family_food_types_family_name;
create unique index idx_family_food_types_family_kind_name on family_food_types(family_id, kind, lower(name));
