-- Ubicación, lugares frecuentes: categoría libre por lugar (petición real: "trabajo", "casa madre",
-- "campo padre"... la etiqueta que yo quiera") — texto libre sin lista cerrada, igual que el nombre.
-- Columna opcional (NULL = sin categoría, como hasta ahora) para que los lugares ya guardados sigan
-- viéndose exactamente igual que antes de este cambio. La política RLS "location_places: family
-- crud" ya cubre todas las columnas (es a nivel de fila, no de columna) y ya permite UPDATE, así que
-- no hace falta ninguna política nueva para poder editar esto.
alter table location_places add column category text;
