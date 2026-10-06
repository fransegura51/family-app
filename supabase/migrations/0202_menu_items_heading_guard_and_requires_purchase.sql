-- «Menú del evento» (tanda cerrar Eventos → Comida/Menú/Invitados).
-- 1) G — integridad: un encabezado o nota NUNCA lleva receta, categoría ni responsable. La auditoría (30 filas,
--    0 incumplimientos) confirma que la restricción puede añadirse sin tocar ningún dato existente.
-- 2) H — «No hay que comprarlo»: excepción explícita por plato. Por defecto true = comportamiento actual.
--    No es un campo de tipo ambiguo: `requires_purchase` dice exactamente lo que significa.
-- Aditiva: no borra ni modifica filas. Las filas existentes reciben el valor por defecto (true).
alter table event_menu_items
  add constraint event_menu_items_non_dish_has_no_extras_check
  check (kind = 'dish' or (recipe_id is null and category is null and prepared_by is null));

alter table event_menu_items
  add column requires_purchase boolean not null default true;
