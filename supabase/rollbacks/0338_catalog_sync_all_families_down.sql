-- ROLLBACK de 0338. Quita los disparadores y las funciones de sincronización. NO deshace los enlaces ni lo añadido a las familias (son datos
-- válidos); la consolidación de «Alimentos para bebés» queda registrada con su estado anterior en category_migration_log (phase '0338-consolidar').
drop trigger if exists catalog_food_types_sync_families on public.catalog_food_types;
drop trigger if exists catalog_categories_sync_families on public.catalog_categories;
drop function if exists public.sync_my_family_catalog();
drop function if exists private.catalog_changed_sync_families();
drop function if exists private.sync_all_families_catalog();
drop function if exists private.sync_family_catalog(uuid);
drop function if exists private.merge_family_class(uuid, uuid, uuid);
drop function if exists private.rename_family_class(uuid, uuid, text);
