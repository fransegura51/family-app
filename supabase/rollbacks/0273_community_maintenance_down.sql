-- Deshace 0273_community_maintenance.sql (generado a partir de la migración; revisar antes de usar). Borra los datos de Comunidad que contuviera.
drop function if exists public.community_service_orphan_check(text[]);
drop function if exists public.community_service_mark_media_deleted(uuid[]);
drop function if exists public.community_service_pending_media_deletions(integer);
drop function if exists public.community_service_ai_allowed();
drop function if exists public.community_service_record_ai(text, boolean);
drop table if exists public.community_ai_usage cascade;
