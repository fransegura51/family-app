-- FASE 2 — CONECTAR EL CATÁLOGO BASE CON LAS FAMILIAS Y create_family.
--
-- 1. catalog_key (nullable) en budget_categories y family_food_types: NOT NULL = elemento estándar PEPA (identidad estable =
--    key del catálogo, nunca el nombre visible); NULL = elemento personal de la familia.
-- 2. Mapeo de las familias existentes SOLO cuando la correspondencia es inequívoca (no se borra, renombra, fusiona ni
--    reclasifica nada; lo que no encaja queda personal/NULL: Gasolinera, Taller, Amazon...).
-- 3. create_family v2: las familias NUEVAS reciben exactamente el catálogo aprobado (56 categorías + 27 clases) y ya no
--    dependen de Familia Hepburn (is_seed_template deja de leerse aquí; la columna sigue existiendo).
-- 4. Unicidad normalizada por familia y grupo (Educación = EDUCACIÓN = " Educación "), auditada antes: 0 conflictos.
--
-- No toca products, product_prices, receipts, expenses, budgets ni clasificaciones.
-- ROLLBACK: supabase/rollbacks/0141_catalog_link_families_down.sql

-- ─── 1. Referencias al catálogo ───
alter table public.budget_categories add column catalog_key text;
alter table public.family_food_types add column catalog_key text;

alter table public.budget_categories
  add constraint budget_categories_catalog_key_fkey
  foreign key (catalog_key) references public.catalog_categories (key) on update cascade on delete restrict;
alter table public.family_food_types
  add constraint family_food_types_catalog_key_fkey
  foreign key (catalog_key) references public.catalog_food_types (key) on update cascade on delete restrict;

-- Como mucho una categoría/clase de la familia por cada elemento del catálogo.
create unique index budget_categories_family_catalog_key_uidx
  on public.budget_categories (family_id, catalog_key) where catalog_key is not null;
create unique index family_food_types_family_catalog_key_uidx
  on public.family_food_types (family_id, catalog_key) where catalog_key is not null;

-- catalog_key solo lo gestiona PEPA (create_family, migraciones, service_role): un usuario no puede marcar como estándar
-- una categoría suya ni cambiar la referencia. Además debe coincidir con el grupo (categorías) o el tipo (clases).
create or replace function public.budget_categories_guard_catalog_key()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_group text;
begin
  if new.catalog_key is null then
    if tg_op = 'UPDATE' and old.catalog_key is not null and current_user in ('authenticated', 'anon') then
      raise exception 'catalog_key: solo PEPA puede cambiar la referencia al catálogo';
    end if;
    return new;
  end if;
  if current_user in ('authenticated', 'anon') and (tg_op = 'INSERT' or new.catalog_key is distinct from old.catalog_key) then
    raise exception 'catalog_key: solo PEPA puede fijar la referencia al catálogo';
  end if;
  select budget_group into v_group from public.catalog_categories where key = new.catalog_key;
  if v_group is distinct from new.budget_group then
    raise exception 'catalog_key %: el grupo del catálogo (%) no coincide con el de la categoría (%)', new.catalog_key, v_group, new.budget_group;
  end if;
  return new;
end;
$$;

create trigger budget_categories_guard_catalog_key
  before insert or update of catalog_key, budget_group on public.budget_categories
  for each row execute function public.budget_categories_guard_catalog_key();

create or replace function public.family_food_types_guard_catalog_key()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_kind text;
begin
  if new.catalog_key is null then
    if tg_op = 'UPDATE' and old.catalog_key is not null and current_user in ('authenticated', 'anon') then
      raise exception 'catalog_key: solo PEPA puede cambiar la referencia al catálogo';
    end if;
    return new;
  end if;
  if current_user in ('authenticated', 'anon') and (tg_op = 'INSERT' or new.catalog_key is distinct from old.catalog_key) then
    raise exception 'catalog_key: solo PEPA puede fijar la referencia al catálogo';
  end if;
  select kind into v_kind from public.catalog_food_types where key = new.catalog_key;
  if v_kind is distinct from new.kind then
    raise exception 'catalog_key %: el tipo del catálogo (%) no coincide con el de la clase (%)', new.catalog_key, v_kind, new.kind;
  end if;
  return new;
end;
$$;

create trigger family_food_types_guard_catalog_key
  before insert or update of catalog_key, kind on public.family_food_types
  for each row execute function public.family_food_types_guard_catalog_key();

-- ─── 2. Mapeo de las familias existentes (solo correspondencias inequívocas) ───
-- Categorías: mismo grupo, mismo nombre normalizado, exactamente UNA candidata del catálogo, sin duplicados dentro de la
-- familia+grupo y con el mismo padre (principal con principal; hija con hija cuya principal equivale a la del catálogo).
with fam as (
  select b.id, b.family_id, b.budget_group, b.parent_id, public.catalog_norm_name(b.name) nn,
         public.catalog_norm_name(p.name) parent_nn
  from public.budget_categories b
  left join public.budget_categories p on p.id = b.parent_id
),
dup as (
  select family_id, budget_group, nn, count(*) n from fam group by 1, 2, 3
),
cand as (
  select f.id, count(c.key) n_cand, min(c.key) cand_key,
         bool_or((f.parent_id is null and c.parent_key is null)
              or (f.parent_id is not null and c.parent_key is not null and f.parent_nn = public.catalog_norm_name(cp.name))) parent_ok
  from fam f
  left join public.catalog_categories c
    on c.budget_group = f.budget_group and public.catalog_norm_name(c.name) = f.nn and c.status = 'approved'
  left join public.catalog_categories cp on cp.key = c.parent_key
  group by f.id
)
update public.budget_categories b
set catalog_key = cand.cand_key
from fam f
join cand on cand.id = f.id
join dup on dup.family_id = f.family_id and dup.budget_group = f.budget_group and dup.nn = f.nn
where b.id = f.id and cand.n_cand = 1 and cand.parent_ok and dup.n = 1;

-- Clases: mismo tipo y mismo nombre normalizado (o nombre legacy aprobado, p. ej. 'Jardin' -> other.jardin), exactamente UNA
-- candidata y sin duplicados dentro de la familia+tipo. NO se renombra nada.
with fam as (
  select t.id, t.family_id, t.kind, t.name, public.catalog_norm_name(t.name) nn from public.family_food_types t
),
dup as (
  select family_id, kind, nn, count(*) n from fam group by 1, 2, 3
),
cand as (
  select f.id, count(c.key) n_cand, min(c.key) cand_key
  from fam f
  left join public.catalog_food_types c
    on c.kind = f.kind and c.status = 'approved' and (public.catalog_norm_name(c.name) = f.nn or f.name = any (c.legacy_names))
  group by f.id
)
update public.family_food_types t
set catalog_key = cand.cand_key
from fam f
join cand on cand.id = f.id
join dup on dup.family_id = f.family_id and dup.kind = f.kind and dup.nn = f.nn
where t.id = f.id and cand.n_cand = 1 and dup.n = 1;

-- ─── 3. Unicidad normalizada por familia y grupo/tipo (auditado: 0 conflictos existentes) ───
create unique index budget_categories_family_group_normname_uidx
  on public.budget_categories (family_id, budget_group, public.catalog_norm_name(name));
create unique index family_food_types_family_kind_normname_uidx
  on public.family_food_types (family_id, kind, public.catalog_norm_name(name));

-- ─── 4. create_family v2: las familias nuevas reciben el catálogo PEPA aprobado (no Hepburn) ───
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

  -- Catálogo base PEPA aprobado (catalog_categories / catalog_food_types): primero las principales y después las hijas
  -- (cada hija apunta a la principal de ESTA familia por su catalog_key). Ninguna dependencia de otra familia.
  insert into budget_categories (family_id, name, icon, budget_group, parent_id, sort_order, necessity, is_fixed, catalog_key)
    select v_family_id, c.name, c.icon, c.budget_group, null, c.sort_order, c.necessity, c.is_fixed, c.key
    from catalog_categories c
    where c.status = 'approved' and c.parent_key is null
    order by c.budget_group, c.sort_order;

  insert into budget_categories (family_id, name, icon, budget_group, parent_id, sort_order, necessity, is_fixed, catalog_key)
    select v_family_id, c.name, c.icon, c.budget_group, p.id, c.sort_order, c.necessity, c.is_fixed, c.key
    from catalog_categories c
    join budget_categories p on p.family_id = v_family_id and p.catalog_key = c.parent_key
    where c.status = 'approved' and c.parent_key is not null
    order by c.budget_group, c.sort_order;

  -- Las clases se enseñan por created_at: marcas de tiempo crecientes para conservar el orden del catálogo.
  insert into family_food_types (family_id, name, icon, kind, catalog_key, created_at)
    select v_family_id, t.name, t.icon, t.kind, t.key,
           now() + (row_number() over (order by t.kind, t.sort_order)) * interval '1 millisecond'
    from catalog_food_types t
    where t.status = 'approved';

  -- Seguridad: si el catálogo no se ha copiado entero (p. ej. una principal retirada con hijas aprobadas), la creación falla.
  if (select count(*) from budget_categories where family_id = v_family_id)
       <> (select count(*) from catalog_categories where status = 'approved')
     or (select count(*) from family_food_types where family_id = v_family_id)
       <> (select count(*) from catalog_food_types where status = 'approved') then
    raise exception 'create_family: el catálogo base no se ha copiado completo';
  end if;

  return v_family_id;
end;
$function$;
