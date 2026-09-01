-- Para poder calcular calorías/macros de "100 gramos de pechuga de
-- pollo" (o los gramos que sean) hace falta guardar el dato POR GRAMO,
-- no solo por la ración que devuelve FatSecret por defecto (que puede
-- ser "1 unidad", "1 bote"...). Nulo cuando el alimento no tiene
-- ninguna ración en gramos/mililitros de la que derivar ese dato.
alter table public.food_cache
  add column calories_per_g numeric,
  add column protein_g_per_g numeric,
  add column carbs_g_per_g numeric,
  add column fat_g_per_g numeric;
