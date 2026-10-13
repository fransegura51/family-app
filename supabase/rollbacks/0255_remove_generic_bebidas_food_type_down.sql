-- Rollback de 0255_remove_generic_bebidas_food_type.sql — reinserta la fila exacta que se borró
-- (mismo id, para que cualquier referencia futura a ese id siga siendo válida), con sus valores reales
-- comprobados antes de borrarla.
insert into public.family_food_types (id, family_id, name, icon, kind, catalog_key, created_at)
values ('b00f7e83-bd45-4a90-8e58-cccdcf8d8b07', '223ea7b0-bd93-4e6d-9acb-46d4aa60817b', 'Bebidas', '🥤', 'alimentacion', null, '2026-10-13 18:44:28.301406+00')
on conflict (id) do nothing;
