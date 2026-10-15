-- Deshace 0267_community_recipes.sql (generado a partir de la migración; revisar antes de usar). Borra los datos de Comunidad que contuviera.
drop function if exists public.community_mark_recipe_updated(uuid);
drop function if exists public.community_get_recipe_update(uuid);
drop function if exists public.community_record_import(uuid, uuid);
drop function if exists public.community_list_recipe_reviews(uuid, integer, integer);
drop function if exists public.community_rate_recipe(uuid, integer, text);
alter table public.community_recipe_imports drop column if exists private_recipe_id;
