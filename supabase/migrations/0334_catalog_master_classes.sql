-- 0334 · Catálogo maestro de productos: tres clases de producto nuevas en el clasificador común CAT-1
--
-- El catálogo maestro (src/domain/catalog) reconoce familias de compra que el clasificador común no tenía bien representadas:
--   · food.alimentacion_infantil  «Alimentación infantil»          leche de fórmula por etapas, papillas, potitos, bolsitas de fruta, snacks y galletas infantiles
--   · food.platos_preparados      «Platos preparados»              pizzas, croquetas, empanadillas, quesadillas, sushi… (antes caían en Carne por llevar «pollo»)
--   · other.cuidado_bebe          «Higiene y cuidado del bebé»     pañales por talla y tipo, toallitas, cremas, geles y champús infantiles
-- Todo lo demás (limpieza, higiene personal, mascotas, papelería, bebidas…) YA tenía su clase y se reutiliza: no se duplica nada.
--
-- Aditiva e idempotente: no borra, no renombra y no reclasifica NINGÚN dato de las familias (productos, tickets, gastos, presupuestos, clasificaciones).
--   · catalog_food_types: tres filas nuevas con una versión nueva del catálogo (la clave estable no cambia nunca).
--   · create_family ya copia TODAS las clases aprobadas del catálogo: las familias nuevas las reciben solas.
--   · Familias existentes: se les ofrece la clase nueva SOLO si tienen ya sus clases de ese conjunto sembradas. Si una familia ya tenía una clase suya con el
--     mismo nombre, se enlaza con la del catálogo (sin renombrar nada); si el nombre choca con otra cosa, no se toca esa familia (la app sigue con sus reglas de siempre).
-- Hasta que se aplique, la app funciona igual: una clase que la familia no tiene hace que el catálogo no clasifique y se sigan usando las reglas por palabras clave.
-- ROLLBACK: supabase/rollbacks/0334_catalog_master_classes_down.sql (solo quita lo no usado por ningún producto ni gasto).
do $$
declare
  v_version integer;
  v_row record;
begin
  select coalesce(max(version), 0) + 1 into v_version from public.catalog_release;
  insert into public.catalog_release (version, notes)
  values (v_version, 'Catálogo maestro de productos: Alimentación infantil, Platos preparados e Higiene y cuidado del bebé (2026-10-27).');

  insert into public.catalog_food_types (key, kind, name, legacy_names, icon, sort_order, catalog_version) values
    ('food.alimentacion_infantil', 'alimentacion', 'Alimentación infantil',        '{}', '🍼', 150, v_version),
    ('food.platos_preparados',     'alimentacion', 'Platos preparados',            '{}', '🥘', 160, v_version),
    ('other.cuidado_bebe',         'no_alimentos', 'Higiene y cuidado del bebé',   '{}', '👶', 140, v_version)
  on conflict (key) do nothing;

  insert into public.catalog_audit (actor, action, entity, key, after, note)
  select 'migration:0334', 'promote', 'food_type', t.key, to_jsonb(t), 'Catálogo maestro de productos'
  from public.catalog_food_types t
  where t.key in ('food.alimentacion_infantil', 'food.platos_preparados', 'other.cuidado_bebe')
    and not exists (select 1 from public.catalog_audit a where a.key = t.key and a.actor = 'migration:0334');

  for v_row in
    select key, kind, name, icon from public.catalog_food_types
    where key in ('food.alimentacion_infantil', 'food.platos_preparados', 'other.cuidado_bebe')
  loop
    -- Una clase PROPIA de la familia con el mismo nombre se enlaza con la del catálogo (no se renombra ni se mueve nada).
    update public.family_food_types f
       set catalog_key = v_row.key
     where f.catalog_key is null
       and f.kind = v_row.kind
       and lower(f.name) = lower(v_row.name)
       and not exists (select 1 from public.family_food_types x where x.family_id = f.family_id and x.catalog_key = v_row.key);

    -- El resto de las familias que ya tienen sembradas las clases de ese conjunto la reciben.
    insert into public.family_food_types (family_id, name, icon, kind, catalog_key)
    select distinct f.family_id, v_row.name, v_row.icon, v_row.kind, v_row.key
      from public.family_food_types f
     where f.kind = v_row.kind
       and not exists (select 1 from public.family_food_types x where x.family_id = f.family_id and x.catalog_key = v_row.key)
       and not exists (select 1 from public.family_food_types x where x.family_id = f.family_id and lower(x.name) = lower(v_row.name));
  end loop;
end $$;
