-- Petición real: "la mayoría de los usuarios no aplicarán el mismo
-- tiempo que yo para comprobar las clasificaciones... al menos las
-- clasificaciones de Mercadona y Hiperber se podrían aplicar a muchas
-- familias" — 0117 ya traspasaba budget_categories y family_food_types
-- (el CATÁLOGO de clases) de la familia plantilla a cada familia nueva;
-- ahora se traspasa también la RELACIÓN nombre de producto → clase ya
-- resuelta (products.category/non_food), no el historial de consumo:
-- nunca product_prices (precios, fechas, tiendas) ni receipts/expenses,
-- solo el texto del producto y su clasificación, que es lo que de
-- verdad se repite entre familias que compran en las mismas cadenas.
--
-- Solo se copian productos YA clasificados (category no vacío): uno sin
-- clasificar no aporta nada (el adivinador de Alimentos ya corre igual
-- en cliente) y, peor, apagaría la marca "Nuevo" al revisar un ticket
-- (ver resolveDraftLineClass, FinanceScreen.tsx) para un producto que en
-- realidad nadie ha revisado nunca — justo lo contrario de lo que se
-- pide aquí.
create or replace function public.create_family(p_family_name text, p_display_name text, p_access_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
    delete from tmp_create_family_cat_map;

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

    -- Solo nombre + clasificación, nunca precios ni fechas (ver
    -- comentario de cabecera) — on conflict por si dos productos de la
    -- plantilla normalizaran al mismo nombre (no debería pasar, la
    -- propia tabla ya lo impide con su unique, pero así el alta nunca
    -- revienta por esto).
    insert into products (family_id, normalized_name, display_name, category, brand, non_food)
      select v_family_id, normalized_name, display_name, category, brand, non_food
      from products
      where family_id = v_template_family_id and coalesce(category, '') <> ''
    on conflict (family_id, normalized_name) do nothing;
  end if;

  return v_family_id;
end;
$$;
