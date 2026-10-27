-- Reversión de 0334: quita las tres clases del catálogo maestro SOLO donde ningún producto ni gasto las usa; donde se usan se dejan (no se pierde ninguna clasificación).
-- Las clases propias de una familia que la 0334 enlazó con el catálogo se desenlazan (catalog_key a null) sin tocar su nombre.
do $$
begin
  delete from public.family_food_types f
   where f.catalog_key in ('food.alimentacion_infantil', 'food.platos_preparados', 'other.cuidado_bebe')
     and not exists (select 1 from public.products p where p.family_id = f.family_id and p.category = f.name)
     and not exists (select 1 from public.expenses e where e.family_id = f.family_id and e.product_classification = f.name);

  update public.family_food_types
     set catalog_key = null
   where catalog_key in ('food.alimentacion_infantil', 'food.platos_preparados', 'other.cuidado_bebe');

  delete from public.catalog_food_types
   where key in ('food.alimentacion_infantil', 'food.platos_preparados', 'other.cuidado_bebe')
     and not exists (select 1 from public.shared_product_confirmations s where s.food_type_key = catalog_food_types.key)
     and not exists (select 1 from public.shared_product_general_review r where r.food_type_key = catalog_food_types.key)
     and not exists (select 1 from public.family_food_types f where f.catalog_key = catalog_food_types.key);
end $$;
