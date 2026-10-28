-- 0338 · CAT-2 — El catálogo general de PEPA llega SOLO a todas las familias (actuales y futuras) y se mantiene al día.
--
-- Causa de las clases sin enlace (auditada el 28/10/2026): las clasificaciones de cada familia son COPIAS del catálogo (family_food_types /
-- budget_categories con catalog_key). create_family copiaba el catálogo completo, pero (a) las familias anteriores a la 0141 solo se enlazaron
-- por nombre una vez, y (b) la pantalla de Compras sembraba una lista FIJA (FOOD_TYPES/NO_FOOD_TYPES) cuando una familia no tenía clases:
-- el cliente no puede fijar catalog_key (lo impide el disparador), así que esas filas nacían «personales» y sin enlace («Familia prueba»,
-- 13/10/2026: 20 de 24). Nada mantenía las copias al día cuando el catálogo crecía.
--
-- Esta migración NO crea otro catálogo: añade el mecanismo que mantiene sincronizadas las copias.
--   · private.sync_family_catalog(familia): (1) enlaza las clases/categorías personales que equivalen sin ambigüedad a una del catálogo
--     (mismo nombre normalizado o nombre antiguo declarado en legacy_names), (2) consolida un duplicado equivalente (p. ej. «Alimentos para
--     bebés» junto a «Alimentación infantil»): mueve sus referencias y SOLO borra la fila vacía cuando no queda ninguna referencia,
--     (3) renombra al nombre vigente las clases que aún llevan un nombre antiguo, (4) añade lo que falte del catálogo aprobado.
--     Nunca borra ni renombra una categoría personal, ni cambia importes, productos, tickets, repartos, etiquetas o presupuestos.
--   · Disparadores sobre catalog_food_types y catalog_categories: cada ampliación del catálogo llega a todas las familias en la misma operación.
--   · public.sync_my_family_catalog(): la app lo llama al entrar (idempotente) para que una familia nunca dependa de una copia desactualizada.
--   · Una categoría PERSONAL de la familia (catalog_key NULL) sigue siendo privada de la familia y funciona igual; renombrar o cambiar el icono
--     de una general solo afecta a esa familia (el catálogo compartido no se toca; la identidad es catalog_key, no el nombre).
-- ROLLBACK: supabase/rollbacks/0338_catalog_sync_all_families_down.sql (quita disparadores y funciones; no devuelve los borrados porque
-- guarda el estado anterior en category_migration_log).

-- El registro de migraciones de categorías admite también las clases de producto de la familia (solo se AMPLÍA la lista permitida).
alter table public.category_migration_log drop constraint if exists category_migration_log_entity_check;
alter table public.category_migration_log
  add constraint category_migration_log_entity_check check (entity = any (array['expense', 'receipt', 'budget_category', 'family_food_type']));

-- ─── Utilidad: cambiar el nombre de una clase en TODO lo que la guarda por nombre ───
create or replace function private.rename_family_class(p_family uuid, p_id uuid, p_new text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_old text;
begin
  select name into v_old from public.family_food_types where id = p_id and family_id = p_family;
  if v_old is null or v_old = p_new then return; end if;
  if exists (select 1 from public.family_food_types x where x.family_id = p_family and x.id <> p_id
              and x.kind = (select kind from public.family_food_types where id = p_id)
              and public.catalog_norm_name(x.name) = public.catalog_norm_name(p_new)) then
    raise exception 'rename_family_class: ya existe una clase llamada %', p_new;
  end if;
  update public.family_food_types set name = p_new where id = p_id;
  update public.products set category = p_new where family_id = p_family and category = v_old;
  update public.expenses set product_classification = p_new where family_id = p_family and product_classification = v_old;
  update public.expense_class_shares set class_name = p_new where family_id = p_family and class_name = v_old;
end $$;

-- ─── Utilidad: consolidar una clase personal EQUIVALENTE en la del catálogo (mueve referencias; borra la fila solo si queda vacía) ───
create or replace function private.merge_family_class(p_family uuid, p_from_id uuid, p_into_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_from public.family_food_types;
  v_into public.family_food_types;
  v_left integer;
begin
  select * into v_from from public.family_food_types where id = p_from_id and family_id = p_family;
  select * into v_into from public.family_food_types where id = p_into_id and family_id = p_family;
  if v_from.id is null or v_into.id is null or v_from.id = v_into.id or v_from.kind <> v_into.kind then
    raise exception 'merge_family_class: pareja no válida';
  end if;
  if exists (select 1 from public.expense_class_shares a join public.expense_class_shares b on a.expense_id = b.expense_id
              where a.family_id = p_family and a.class_name = v_from.name and b.class_name = v_into.name) then
    raise exception 'merge_family_class: un gasto reparte entre las dos clases; se deja para revisión manual';
  end if;

  insert into public.category_migration_log (phase, entity, entity_id, before, after)
  values ('0338-consolidar', 'family_food_type', v_from.id, to_jsonb(v_from),
          jsonb_build_object('into', v_into.id, 'into_name', v_into.name,
                             'products', (select count(*) from public.products where family_id = p_family and category = v_from.name),
                             'expenses', (select count(*) from public.expenses where family_id = p_family and product_classification = v_from.name),
                             'shares', (select count(*) from public.expense_class_shares where family_id = p_family and class_name = v_from.name)));

  update public.products set category = v_into.name where family_id = p_family and category = v_from.name;
  update public.expenses set product_classification = v_into.name where family_id = p_family and product_classification = v_from.name;
  update public.expense_class_shares set class_name = v_into.name where family_id = p_family and class_name = v_from.name;

  -- Comprobación antes de borrar: ninguna referencia por nombre puede quedar apuntando a la fila que desaparece.
  select (select count(*) from public.products where family_id = p_family and category = v_from.name)
       + (select count(*) from public.expenses where family_id = p_family and product_classification = v_from.name)
       + (select count(*) from public.expense_class_shares where family_id = p_family and class_name = v_from.name)
    into v_left;
  if v_left > 0 then
    raise exception 'merge_family_class: quedan % referencias; no se borra nada', v_left;
  end if;
  delete from public.family_food_types where id = v_from.id;
end $$;

-- ─── El mecanismo: deja a UNA familia con todo el catálogo aprobado, enlazado ───
create or replace function private.sync_family_catalog(p_family uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_linked_classes integer := 0;
  v_merged_classes integer := 0;
  v_renamed_classes integer := 0;
  v_added_classes integer := 0;
  v_linked_cats integer := 0;
  v_added_cats integer := 0;
  v_n integer;
  r record;
  v_target uuid;
  v_sort bigint;
  v_parent uuid;
begin
  if not exists (select 1 from public.families where id = p_family) then
    return jsonb_build_object('error', 'familia inexistente');
  end if;

  -- 1. CLASES de producto: enlazar las personales que equivalen sin ambigüedad (nombre normalizado o nombre antiguo).
  with fam as (
    select t.id, t.kind, t.name, public.catalog_norm_name(t.name) nn
      from public.family_food_types t where t.family_id = p_family and t.catalog_key is null
  ), cand as (
    select f.id, count(c.key) n_cand, min(c.key) cand_key
      from fam f
      left join public.catalog_food_types c
        on c.kind = f.kind and c.status = 'approved' and (public.catalog_norm_name(c.name) = f.nn or f.name = any (c.legacy_names))
     group by f.id
  ), one as (
    select id, cand_key from cand where n_cand = 1
  )
  update public.family_food_types t
     set catalog_key = o.cand_key
    from one o
   where t.id = o.id
     and not exists (select 1 from public.family_food_types x where x.family_id = p_family and x.catalog_key = o.cand_key)
     and (select count(*) from one o2 where o2.cand_key = o.cand_key) = 1;
  get diagnostics v_linked_classes = row_count;

  -- 2. CONSOLIDAR duplicados equivalentes (la familia ya tiene la clase del catálogo y además una personal que es la misma, p. ej. nombre antiguo).
  for r in
    select t.id as from_id, k.id as into_id
      from public.family_food_types t
      join public.catalog_food_types c
        on c.kind = t.kind and c.status = 'approved' and (public.catalog_norm_name(c.name) = public.catalog_norm_name(t.name) or t.name = any (c.legacy_names))
      join public.family_food_types k on k.family_id = t.family_id and k.catalog_key = c.key
     where t.family_id = p_family and t.catalog_key is null
  loop
    begin
      perform private.merge_family_class(p_family, r.from_id, r.into_id);
      v_merged_classes := v_merged_classes + 1;
    exception when others then
      null; -- queda como está (clase personal); nunca se fuerza
    end;
  end loop;

  -- 3. Las clases enlazadas que aún llevan un nombre ANTIGUO del catálogo pasan al nombre vigente (como hizo la 0294 con «Lácteos y huevos»).
  for r in
    select t.id, c.name as new_name
      from public.family_food_types t
      join public.catalog_food_types c on c.key = t.catalog_key
     where t.family_id = p_family and t.name <> c.name and t.name = any (c.legacy_names)
  loop
    begin
      perform private.rename_family_class(p_family, r.id, r.new_name);
      v_renamed_classes := v_renamed_classes + 1;
    exception when others then
      null;
    end;
  end loop;

  -- 4. AÑADIR las clases del catálogo que la familia no tiene (sin chocar con un nombre ya usado).
  insert into public.family_food_types (family_id, name, icon, kind, catalog_key, created_at)
  select p_family, c.name, c.icon, c.kind, c.key,
         now() + (row_number() over (order by c.kind, c.sort_order)) * interval '1 millisecond'
    from public.catalog_food_types c
   where c.status = 'approved'
     and not exists (select 1 from public.family_food_types x where x.family_id = p_family and x.catalog_key = c.key)
     and not exists (select 1 from public.family_food_types x where x.family_id = p_family and x.kind = c.kind
                      and public.catalog_norm_name(x.name) = public.catalog_norm_name(c.name))
  on conflict do nothing;
  get diagnostics v_added_classes = row_count;

  -- 5. CATEGORÍAS económicas: enlazar principales personales equivalentes (mismo grupo y nombre normalizado, candidata única).
  with fam as (
    select b.id, b.budget_group, public.catalog_norm_name(b.name) nn
      from public.budget_categories b where b.family_id = p_family and b.catalog_key is null and b.parent_id is null
  ), cand as (
    select f.id, count(c.key) n_cand, min(c.key) cand_key
      from fam f
      left join public.catalog_categories c
        on c.status = 'approved' and c.parent_key is null and c.budget_group = f.budget_group and public.catalog_norm_name(c.name) = f.nn
     group by f.id
  ), one as (select id, cand_key from cand where n_cand = 1)
  update public.budget_categories b
     set catalog_key = o.cand_key
    from one o
   where b.id = o.id
     and not exists (select 1 from public.budget_categories x where x.family_id = p_family and x.catalog_key = o.cand_key)
     and (select count(*) from one o2 where o2.cand_key = o.cand_key) = 1;
  get diagnostics v_n = row_count;
  v_linked_cats := v_linked_cats + v_n;

  -- 6. Subcategorías personales equivalentes a una hija del catálogo cuya principal ya es la misma.
  with fam as (
    select b.id, b.budget_group, public.catalog_norm_name(b.name) nn, p.catalog_key as parent_key
      from public.budget_categories b
      join public.budget_categories p on p.id = b.parent_id
     where b.family_id = p_family and b.catalog_key is null and p.catalog_key is not null
  ), cand as (
    select f.id, count(c.key) n_cand, min(c.key) cand_key
      from fam f
      left join public.catalog_categories c
        on c.status = 'approved' and c.parent_key = f.parent_key and c.budget_group = f.budget_group and public.catalog_norm_name(c.name) = f.nn
     group by f.id
  ), one as (select id, cand_key from cand where n_cand = 1)
  update public.budget_categories b
     set catalog_key = o.cand_key
    from one o
   where b.id = o.id
     and not exists (select 1 from public.budget_categories x where x.family_id = p_family and x.catalog_key = o.cand_key)
     and (select count(*) from one o2 where o2.cand_key = o.cand_key) = 1;
  get diagnostics v_n = row_count;
  v_linked_cats := v_linked_cats + v_n;

  -- 7. AÑADIR las categorías del catálogo que falten: primero las principales, luego las hijas.
  for r in
    select c.* from public.catalog_categories c
     where c.status = 'approved' and c.parent_key is null
       and not exists (select 1 from public.budget_categories x where x.family_id = p_family and x.catalog_key = c.key)
       and not exists (select 1 from public.budget_categories x where x.family_id = p_family and x.budget_group = c.budget_group
                        and public.catalog_norm_name(x.name) = public.catalog_norm_name(c.name))
     order by c.budget_group, c.sort_order
  loop
    select coalesce(max(sort_order), 0) + 1 into v_sort from public.budget_categories
     where family_id = p_family and budget_group = r.budget_group and parent_id is null;
    insert into public.budget_categories (family_id, name, icon, budget_group, parent_id, sort_order, necessity, is_fixed, catalog_key)
    values (p_family, r.name, r.icon, r.budget_group, null, v_sort, r.necessity, r.is_fixed, r.key)
    on conflict do nothing;
    get diagnostics v_n = row_count;
    v_added_cats := v_added_cats + v_n;
  end loop;

  for r in
    select c.* from public.catalog_categories c
     where c.status = 'approved' and c.parent_key is not null
       and not exists (select 1 from public.budget_categories x where x.family_id = p_family and x.catalog_key = c.key)
       and not exists (select 1 from public.budget_categories x where x.family_id = p_family and x.budget_group = c.budget_group
                        and public.catalog_norm_name(x.name) = public.catalog_norm_name(c.name))
     order by c.budget_group, c.sort_order
  loop
    select id into v_parent from public.budget_categories where family_id = p_family and catalog_key = r.parent_key;
    if v_parent is null then continue; end if; -- su principal no existe en esta familia (personalizada con otro nombre): no se fuerza
    select coalesce(max(sort_order), 0) + 1 into v_sort from public.budget_categories where family_id = p_family and parent_id = v_parent;
    insert into public.budget_categories (family_id, name, icon, budget_group, parent_id, sort_order, necessity, is_fixed, catalog_key)
    values (p_family, r.name, r.icon, r.budget_group, v_parent, v_sort, r.necessity, r.is_fixed, r.key)
    on conflict do nothing;
    get diagnostics v_n = row_count;
    v_added_cats := v_added_cats + v_n;
  end loop;

  return jsonb_build_object('linked_classes', v_linked_classes, 'merged_classes', v_merged_classes, 'renamed_classes', v_renamed_classes,
                            'added_classes', v_added_classes, 'linked_categories', v_linked_cats, 'added_categories', v_added_cats);
end $$;

create or replace function private.sync_all_families_catalog()
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  f record;
begin
  for f in select id from public.families loop
    perform private.sync_family_catalog(f.id);
  end loop;
end $$;

-- Cada ampliación del catálogo (alta o aprobación) llega a todas las familias en la misma operación.
create or replace function private.catalog_changed_sync_families()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  perform private.sync_all_families_catalog();
  return null;
end $$;

drop trigger if exists catalog_food_types_sync_families on public.catalog_food_types;
create trigger catalog_food_types_sync_families
  after insert or update on public.catalog_food_types
  for each statement execute function private.catalog_changed_sync_families();
drop trigger if exists catalog_categories_sync_families on public.catalog_categories;
create trigger catalog_categories_sync_families
  after insert or update on public.catalog_categories
  for each statement execute function private.catalog_changed_sync_families();

-- La app lo llama al entrar (y la pantalla de Compras ya no siembra una lista fija): idempotente, solo para la familia de quien llama.
create or replace function public.sync_my_family_catalog()
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_family uuid;
begin
  select family_id into v_family from public.profiles where id = auth.uid();
  if v_family is null then
    return jsonb_build_object('skipped', 'sin familia');
  end if;
  return private.sync_family_catalog(v_family);
end $$;

revoke all on function private.rename_family_class(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.merge_family_class(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.sync_family_catalog(uuid) from public, anon, authenticated;
revoke all on function private.sync_all_families_catalog() from public, anon, authenticated;
revoke all on function private.catalog_changed_sync_families() from public, anon, authenticated;
revoke all on function public.sync_my_family_catalog() from public, anon;
grant execute on function public.sync_my_family_catalog() to authenticated;

-- «Alimentos para bebés» (creada a mano por una familia porque no encontró la general) es el mismo concepto que «Alimentación infantil».
-- Se declara como nombre equivalente: la sincronización la consolida en TODAS las familias que la tengan, sin tocar sus datos.
update public.catalog_food_types
   set legacy_names = (select array(select distinct unnest(legacy_names || array['Alimentos para bebés', 'Comida para bebés'])))
 where key = 'food.alimentacion_infantil' and not ('Alimentos para bebés' = any (legacy_names));

insert into public.catalog_audit (actor, action, entity, key, note)
select 'migration:0338', 'edit', 'food_type', 'food.alimentacion_infantil', 'Nombres equivalentes: «Alimentos para bebés», «Comida para bebés»'
 where not exists (select 1 from public.catalog_audit a where a.actor = 'migration:0338' and a.key = 'food.alimentacion_infantil');

-- Puesta al día de TODAS las familias existentes (enlaza, consolida lo equivalente y añade lo que falte).
select private.sync_all_families_catalog();
