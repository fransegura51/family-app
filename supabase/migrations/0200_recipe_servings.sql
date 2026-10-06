-- Recetas: número de raciones estructurado (2.ª tanda de Menú del evento, escalado orientativo de la compra).
-- Aditiva y nullable, SIN default: una receta antigua queda en null («raciones desconocidas»), nunca en 0.
-- Las recetas ya cubren la columna con sus políticas familiares existentes (0008): no hay políticas nuevas.
alter table recipes add column servings smallint null check (servings is null or servings between 1 and 50);
