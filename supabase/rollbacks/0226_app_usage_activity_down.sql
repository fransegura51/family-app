-- Rollback de 0226_app_usage_activity.sql: quita las funciones y la tabla de actividad de uso.
drop function if exists public.list_app_owner_families();
drop function if exists public.list_app_usage_activity(integer);
drop function if exists public.record_app_usage(jsonb);
drop table if exists public.app_usage_daily;
