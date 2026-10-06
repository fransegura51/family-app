-- Recetas: raciones con medio punto y texto original de la fuente (autorizada).
-- 1) recipes.servings pasa de smallint a numeric(4,1): admite 6,5 para los rangos de la fuente («6-7 personas»).
--    Los valores existentes son enteros: el cambio de tipo es exacto, no hay backfill ni se toca ninguna receta.
-- 2) Solo valores entre 1 y 50 en incrementos de 0,5 (null = desconocido, nunca 0).
-- 3) servings_source: texto ORIGINAL de la fuente («6-7 personas»). Es solo información; el valor de cálculo es
--    siempre servings. Nullable, sin default, máximo 60 caracteres.
alter table recipes drop constraint recipes_servings_check;
alter table recipes alter column servings type numeric(4,1) using servings::numeric(4,1);
alter table recipes add constraint recipes_servings_check
  check (servings is null or (servings >= 1 and servings <= 50 and servings * 2 = floor(servings * 2)));
alter table recipes add column servings_source text null
  check (servings_source is null or char_length(servings_source) <= 60);
