-- Petición real de usuarios: «separaría lácteos de huevos, habrá gente deportista para los que marca la diferencia».
-- «Lácteos y huevos» (food.lacteos_huevos) pasa a llamarse «Lácteos» y nace la clase «Huevos» (food.huevos). La clave estable
-- food.lacteos_huevos NO cambia (el aprendizaje compartido sigue apuntando a ella). El nombre antiguo queda como legacy_name.
-- Los productos/gastos que guardaban el nombre «Lácteos y huevos» pasan a «Lácteos» (mismo producto, mismo importe: solo cambia la etiqueta).
-- Ninguna fila se borra. Es idempotente.
do $$
declare
  v_version integer;
begin
  select max(version) into v_version from public.catalog_release;

  update public.catalog_food_types
     set name = 'Lácteos',
         legacy_names = (select array(select distinct unnest(legacy_names || array['Lácteos y huevos'])))
   where key = 'food.lacteos_huevos' and name <> 'Lácteos';

  insert into public.catalog_food_types (key, kind, name, legacy_names, icon, sort_order, catalog_version)
  values ('food.huevos', 'alimentacion', 'Huevos', '{}', '🥚', 31, v_version)
  on conflict (key) do nothing;

  -- Etiqueta de la clase en cada familia (conserva el catalog_key) y en lo que la usa por nombre.
  update public.family_food_types set name = 'Lácteos'
   where catalog_key = 'food.lacteos_huevos' and name = 'Lácteos y huevos'
     and not exists (select 1 from public.family_food_types x where x.family_id = family_food_types.family_id and x.kind = 'alimentacion' and x.name = 'Lácteos');
  update public.products set category = 'Lácteos' where category = 'Lácteos y huevos'
     and exists (select 1 from public.family_food_types t where t.family_id = products.family_id and t.name = 'Lácteos');
  update public.expenses set product_classification = 'Lácteos' where product_classification = 'Lácteos y huevos'
     and exists (select 1 from public.family_food_types t where t.family_id = expenses.family_id and t.name = 'Lácteos');

  -- «Huevos» para todas las familias que ya tienen sus clases de alimentación.
  insert into public.family_food_types (family_id, name, icon, kind, catalog_key)
  select distinct f.family_id, 'Huevos', '🥚', 'alimentacion', 'food.huevos'
    from public.family_food_types f
   where f.kind = 'alimentacion'
     and not exists (select 1 from public.family_food_types x where x.family_id = f.family_id and x.catalog_key = 'food.huevos')
     and not exists (select 1 from public.family_food_types x where x.family_id = f.family_id and x.kind = 'alimentacion' and lower(x.name) = 'huevos');
end $$;
