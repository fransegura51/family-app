-- 0342 · CAT-2 — Lo que la familia QUITA del catálogo general no se le vuelve a poner.
--
-- La sincronización de la 0338 añade a cada familia lo que le falte del catálogo general. Pero una familia puede haber borrado a propósito una categoría general
-- (p. ej. «Mascotas» sin mascotas) o una clase de producto: volver a ponérsela sería deshacer una decisión suya. Esta migración:
--   · Recuerda lo que se quita: un disparador anota en family_catalog_hidden cada categoría o clase ENLAZADA al catálogo que la familia borra (las personales no
--     se anotan: no son del catálogo). Si lo borrado es por el borrado de la propia familia (cascada), no anota nada.
--   · La sincronización (reemplazada aquí) no vuelve a añadir lo anotado.
--   · restore_my_family_catalog(): «Recuperar las que quité» — olvida lo anotado y sincroniza (devuelve las categorías y clases generales a la familia).
--   · Datos: la tabla solo guarda qué clave se quitó; no toca gastos, tickets ni productos. RLS: cada familia solo ve lo suyo; solo escriben el disparador y la función.
-- ROLLBACK: supabase/rollbacks/0342_family_catalog_hidden_down.sql
create table if not exists public.family_catalog_hidden (
  family_id uuid not null references public.families (id) on delete cascade,
  entity text not null check (entity in ('category', 'food_type')),
  catalog_key text not null,
  hidden_at timestamptz not null default now(),
  primary key (family_id, entity, catalog_key)
);
alter table public.family_catalog_hidden enable row level security;
drop policy if exists family_catalog_hidden_select on public.family_catalog_hidden;
create policy family_catalog_hidden_select on public.family_catalog_hidden for select to authenticated
  using (family_id = (select family_id from public.profiles where id = (select auth.uid())));
revoke all on public.family_catalog_hidden from anon, authenticated;
grant select on public.family_catalog_hidden to authenticated;

create or replace function private.remember_hidden_catalog_item()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if old.catalog_key is null then
    return old;
  end if;
  -- Cascada por borrado de la familia: ya no existe, no hay nada que recordar.
  if not exists (select 1 from public.families where id = old.family_id) then
    return old;
  end if;
  insert into public.family_catalog_hidden (family_id, entity, catalog_key)
  values (old.family_id, case tg_table_name when 'budget_categories' then 'category' else 'food_type' end, old.catalog_key)
  on conflict do nothing;
  return old;
end $$;
revoke all on function private.remember_hidden_catalog_item() from public, anon, authenticated;

drop trigger if exists budget_categories_remember_hidden on public.budget_categories;
create trigger budget_categories_remember_hidden after delete on public.budget_categories
  for each row execute function private.remember_hidden_catalog_item();
drop trigger if exists family_food_types_remember_hidden on public.family_food_types;
create trigger family_food_types_remember_hidden after delete on public.family_food_types
  for each row execute function private.remember_hidden_catalog_item();

-- La sincronización respeta lo que la familia quitó.
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
     and not exists (select 1 from public.family_catalog_hidden h where h.family_id = p_family and h.entity = 'food_type' and h.catalog_key = c.key)
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
       and not exists (select 1 from public.family_catalog_hidden h where h.family_id = p_family and h.entity = 'category' and h.catalog_key = c.key)
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
       and not exists (select 1 from public.family_catalog_hidden h where h.family_id = p_family and h.entity = 'category' and h.catalog_key = c.key)
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

create or replace function public.restore_my_family_catalog()
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
  delete from public.family_catalog_hidden where family_id = v_family;
  return private.sync_family_catalog(v_family);
end $$;
revoke all on function public.restore_my_family_catalog() from public, anon;
grant execute on function public.restore_my_family_catalog() to authenticated;
