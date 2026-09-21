-- ROLLBACK de la Fase 2 (0141_catalog_link_families.sql).
-- Restaura create_family tal y como estaba (0131: copia de la familia plantilla) y elimina SOLO lo añadido por la fase 2:
-- triggers, índices, claves foráneas y las columnas catalog_key. No borra ni modifica ninguna categoría o clase de las
-- familias (solo pierden la referencia catalog_key). El catálogo de la Fase 1 (catalog_*) queda como estaba.

create or replace function public.create_family(p_family_name text, p_display_name text, p_access_code text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_family_id uuid;
  v_user_id uuid := auth.uid();
  v_expected_code text;
  v_invite_code text := upper(trim(coalesce(p_access_code, '')));
  v_used_invite text := null;
  v_template_family_id uuid;
  v_cat record;
  v_new_id uuid;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  select decrypted_secret into v_expected_code from vault.decrypted_secrets where name = 'family_signup_code';
  if v_expected_code is not null and p_access_code = v_expected_code then
    null; -- código maestro
  elsif exists (
    select 1 from family_invites
    where code = v_invite_code and used_at is null and expires_at > now()
  ) then
    v_used_invite := v_invite_code;
  else
    raise exception 'Código de acceso incorrecto';
  end if;

  if exists (select 1 from profiles where id = v_user_id) then
    raise exception 'El usuario ya pertenece a una familia';
  end if;

  insert into families (name) values (p_family_name) returning id into v_family_id;

  insert into profiles (id, family_id, role, display_name)
    values (v_user_id, v_family_id, 'admin', p_display_name);

  insert into family_members (family_id, name, member_type, linked_profile_id)
    values (v_family_id, p_display_name, 'admin', v_user_id);

  if v_used_invite is not null then
    update family_invites set used_by_family = v_family_id, used_at = now() where code = v_used_invite;
  end if;

  select id into v_template_family_id from families where is_seed_template limit 1;

  if v_template_family_id is not null then
    create temporary table if not exists tmp_create_family_cat_map (old_id uuid primary key, new_id uuid) on commit drop;

    for v_cat in
      select * from budget_categories where family_id = v_template_family_id and parent_id is null order by sort_order
    loop
      insert into budget_categories (family_id, name, icon, budget_group, parent_id, sort_order, necessity, is_fixed)
      values (v_family_id, v_cat.name, v_cat.icon, v_cat.budget_group, null, v_cat.sort_order, v_cat.necessity, v_cat.is_fixed)
      returning id into v_new_id;
      insert into tmp_create_family_cat_map values (v_cat.id, v_new_id);
    end loop;

    for v_cat in
      select * from budget_categories where family_id = v_template_family_id and parent_id is not null order by sort_order
    loop
      insert into budget_categories (family_id, name, icon, budget_group, parent_id, sort_order, necessity, is_fixed)
      values (
        v_family_id, v_cat.name, v_cat.icon, v_cat.budget_group,
        (select new_id from tmp_create_family_cat_map where old_id = v_cat.parent_id),
        v_cat.sort_order, v_cat.necessity, v_cat.is_fixed
      );
    end loop;

    insert into family_food_types (family_id, name, icon, kind)
      select v_family_id, name, icon, kind from family_food_types where family_id = v_template_family_id;
  end if;

  return v_family_id;
end;
$function$;

drop trigger if exists budget_categories_guard_catalog_key on public.budget_categories;
drop trigger if exists family_food_types_guard_catalog_key on public.family_food_types;
drop function if exists public.budget_categories_guard_catalog_key();
drop function if exists public.family_food_types_guard_catalog_key();

drop index if exists public.budget_categories_family_group_normname_uidx;
drop index if exists public.family_food_types_family_kind_normname_uidx;
drop index if exists public.budget_categories_family_catalog_key_uidx;
drop index if exists public.family_food_types_family_catalog_key_uidx;

alter table public.budget_categories drop constraint if exists budget_categories_catalog_key_fkey;
alter table public.family_food_types drop constraint if exists family_food_types_catalog_key_fkey;
alter table public.budget_categories drop column if exists catalog_key;
alter table public.family_food_types drop column if exists catalog_key;
