-- ROLLBACK de 0342. Quita la tabla de lo quitado, los disparadores y la función de recuperar, y devuelve la sincronización a la versión de la 0338 (sin respetar lo quitado).
drop trigger if exists budget_categories_remember_hidden on public.budget_categories;
drop trigger if exists family_food_types_remember_hidden on public.family_food_types;
drop function if exists private.remember_hidden_catalog_item();
drop function if exists public.restore_my_family_catalog();
drop table if exists public.family_catalog_hidden;
-- Vuelve a ejecutar la definición de private.sync_family_catalog de supabase/migrations/0338_catalog_sync_all_families.sql para restaurar la versión anterior.
