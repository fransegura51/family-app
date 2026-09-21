-- ROLLBACK de la Fase 1 (0139_catalog_base.sql). Solo borra objetos creados por esa migración; no toca ninguna
-- tabla de familias, create_family ni ningún dato existente. Ejecutar solo si se decide abandonar el catálogo base.
-- Después conviene borrar también la fila '0139' de supabase_migrations.schema_migrations si se quiere re-aplicar.
drop table if exists public.catalog_audit;
drop table if exists public.catalog_food_types;
drop table if exists public.catalog_categories;
drop table if exists public.catalog_release;
drop function if exists public.catalog_categories_check_parent();
drop function if exists public.catalog_norm_name(text);
