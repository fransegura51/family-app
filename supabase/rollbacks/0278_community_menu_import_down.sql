-- Deshace 0278_community_menu_import.sql (generado a partir de la migración; revisar antes de usar). Borra los datos de Comunidad que contuviera.
drop function if exists public.community_menu_import(uuid, text, text, text, integer, date, integer, text, text, text);
drop function if exists public.community_menu_import_preview(uuid, text, text, text, integer, date, integer, text);
drop function if exists private.community_menu_check_args(text, date, integer, text, text);
drop function if exists private.community_menu_clean_recipe(jsonb, numeric, numeric);
drop function if exists private.community_menu_slots(jsonb, text, text, text, integer);
drop function if exists private.community_menu_of_post(uuid);
drop function if exists private.community_menu_valid_servings(jsonb);
drop function if exists private.community_menu_scale(text, text, numeric, numeric);
drop function if exists private.community_menu_day_name(integer);
drop function if exists private.community_menu_day_index(text);
drop function if exists private.community_menu_norm(text);
drop table if exists public.community_menu_imports cascade;
