-- Deshace 0272_community_public_read.sql (generado a partir de la migración; revisar antes de usar). Borra los datos de Comunidad que contuviera.
drop function if exists public.community_public_sitemap(integer, integer);
drop function if exists public.community_public_get_comments(uuid, integer);
drop function if exists public.community_public_get_post(uuid);
