-- RETOQUE — tres modos de color del Calendario, mutuamente excluyentes, en vez de los dos de antes.
-- Cambio 100% aditivo y seguro para quien ya tenía esto configurado:
--   'miembros'        -> Modo 1 "Colores de personas" (sin cambios, mismo literal de siempre).
--   'categorias'      -> Modo 3 "Categorías + personas": es EXACTAMENTE el comportamiento que este
--                         literal ya producía (categoría -> persona -> neutro, ver eventColor/
--                         eventDotColors) — se reutiliza el mismo valor para ese modo en vez de migrar
--                         filas existentes, así que ningún usuario con 'categorias' ya puesto cambia de
--                         aspecto con este retoque.
--   'solo_categorias' -> Modo 2 "Colores de categorías" (NUEVO): solo categoría, sin caer en la persona
--                         si la categoría no tiene color — el único modo realmente nuevo.
-- El valor por defecto para perfiles NUEVOS pasa de 'miembros' a 'categorias' (el modo híbrido), porque
-- es el que mejor conserva "lo de siempre" para quien nunca ha tocado este ajuste — no afecta a ninguna
-- fila ya existente (el default de columna solo se aplica al crear una fila nueva).
alter table profiles drop constraint profiles_calendar_color_mode_check;
alter table profiles add constraint profiles_calendar_color_mode_check
  check (calendar_color_mode in ('miembros', 'categorias', 'solo_categorias'));
alter table profiles alter column calendar_color_mode set default 'categorias';
