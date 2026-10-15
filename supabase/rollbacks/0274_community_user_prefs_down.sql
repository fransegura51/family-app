-- Deshace 0274_community_user_prefs.sql (generado a partir de la migración; revisar antes de usar). Borra los datos de Comunidad que contuviera.
drop function if exists public.community_set_user_prefs(text, boolean);
drop function if exists public.community_get_user_prefs();
drop table if exists public.community_user_prefs cascade;
