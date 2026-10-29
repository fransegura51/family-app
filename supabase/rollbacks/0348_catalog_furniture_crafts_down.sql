-- ROLLBACK de 0348. Quita las dos clases y la categoría añadidas SOLO donde ningún producto, gasto ni presupuesto las usa; donde se usan se dejan
-- (se desenlazan del catálogo y pasan a ser propias de la familia, sin perder ninguna clasificación).
do $$
begin
  delete from public.family_food_types f
   where f.catalog_key in ('other.muebles_organizacion', 'other.manualidades_creatividad')
     and not exists (select 1 from public.products p where p.family_id = f.family_id and p.category = f.name)
     and not exists (select 1 from public.expenses e where e.family_id = f.family_id and e.product_classification = f.name);

  update public.family_food_types
     set catalog_key = null
   where catalog_key in ('other.muebles_organizacion', 'other.manualidades_creatividad');

  delete from public.catalog_food_types
   where key in ('other.muebles_organizacion', 'other.manualidades_creatividad')
     and not exists (select 1 from public.shared_product_confirmations s where s.food_type_key = catalog_food_types.key)
     and not exists (select 1 from public.shared_product_general_review r where r.food_type_key = catalog_food_types.key)
     and not exists (select 1 from public.family_food_types f where f.catalog_key = catalog_food_types.key);

  update public.budget_categories b set catalog_key = null
   where b.catalog_key = 'g.vivienda_hogar.muebles_organizacion'
     and (exists (select 1 from public.expenses e where e.family_id = b.family_id and e.category = b.name)
       or exists (select 1 from public.budgets g where g.family_id = b.family_id and g.category = b.name));
  delete from public.budget_categories b where b.catalog_key = 'g.vivienda_hogar.muebles_organizacion';
  delete from public.catalog_categories where key = 'g.vivienda_hogar.muebles_organizacion';
end $$;
