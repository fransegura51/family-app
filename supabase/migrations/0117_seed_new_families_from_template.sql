-- Petición real: "quiero que todas las categorías y clasificaciones que
-- defino sean la base de las cuentas de nuevos usuarios. Únicamente las
-- etiquetas no se deben traspasar porque son personales" — hasta ahora
-- una familia nueva arrancaba con el árbol genérico de fábrica
-- (MASTER_CATEGORY_SEED/FOOD_TYPES en el cliente, sembrado la primera
-- vez que se abre cada pestaña), sin nada de lo que Jennifer ya ha
-- retocado a mano (Educación, Cobro anulado, Condimentos y Hierbas...).
-- Mismo criterio que is_app_owner (0085_app_owner_usage_panel.sql): un
-- flag en la fila real de la familia, fijado aquí mismo con un UPDATE
-- directo — no hace falta ninguna pantalla nueva para elegir la
-- "familia plantilla", solo hay una.
alter table families add column is_seed_template boolean not null default false;

update families set is_seed_template = true
where id = '011429a4-4fd8-4341-9c04-ec6b2f585196';

-- create_family copia ahora budget_categories (los dos budget_group,
-- respetando la jerarquía padre/hijo) y family_food_types (los dos
-- kind) de la familia plantilla a la familia recién creada — nunca
-- tags (son del gusto de cada familia, no un catálogo compartido). Si
-- no hay ninguna familia marcada como plantilla (is_seed_template),
-- simplemente no copia nada y la familia arranca vacía como siempre
-- (el sembrado de fábrica del cliente sigue ahí de red de seguridad).
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
  end if;

  return v_family_id;
end;
$$;
