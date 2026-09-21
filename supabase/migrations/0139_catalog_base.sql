-- FASE 1 — CATÁLOGO BASE PEPA (aditivo y aislado).
--
-- Crea el catálogo explícito de PEPA: categorías financieras y clases de producto aprobadas que, en fases
-- posteriores, recibirán las familias nuevas. En esta fase SOLO existen las tablas y su contenido: la app, create_family
-- y los datos de las familias NO los usan ni los tocan (ni budget_categories, family_food_types, products, expenses...).
--
-- Cambia solo por promoción deliberada (service_role / migración): los usuarios autenticados únicamente LEEN.
-- Identificador interno = key estable (nunca el nombre visible).
--
-- ROLLBACK: supabase/rollbacks/0139_catalog_base_down.sql (solo borra objetos creados aquí).

-- ─── Normalización de nombres (mismo criterio que usará el resto del diseño): sin tildes, minúsculas, signos como espacio ───
create or replace function public.catalog_norm_name(p_name text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select btrim(regexp_replace(lower(translate(p_name, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '[^a-z0-9]+', ' ', 'g'))
$$;

-- ─── Versiones del catálogo ───
create table public.catalog_release (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version > 0),
  released_at timestamptz not null default now(),
  notes text
);

-- ─── Categorías financieras estándar ───
create table public.catalog_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_]+(\.[a-z0-9_]+)*$'),
  budget_group text not null check (budget_group in ('generales', 'ingresos')),
  parent_key text references public.catalog_categories (key),
  name text not null check (length(btrim(name)) between 2 and 80),
  icon text not null,
  necessity text check (necessity in ('debo', 'necesito', 'quiero')),
  is_fixed boolean,
  sort_order integer not null,
  -- true = el código o las funciones de servidor usan este nombre tal cual (no se renombra ni se retira sin revisar).
  protected boolean not null default false,
  status text not null default 'approved' check (status in ('approved', 'retired')),
  catalog_version integer not null references public.catalog_release (version),
  created_at timestamptz not null default now()
);

create unique index catalog_categories_group_normname_uidx
  on public.catalog_categories (budget_group, public.catalog_norm_name(name));
create index catalog_categories_parent_idx on public.catalog_categories (parent_key);

-- Dos niveles como mucho, y la hija en el mismo grupo que su principal.
create or replace function public.catalog_categories_check_parent()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_parent public.catalog_categories;
begin
  if new.parent_key is null then
    return new;
  end if;
  select * into v_parent from public.catalog_categories where key = new.parent_key;
  if not found then
    raise exception 'catalog_categories: la principal % no existe', new.parent_key;
  end if;
  if v_parent.parent_key is not null then
    raise exception 'catalog_categories: solo hay dos niveles (% ya es hija)', new.parent_key;
  end if;
  if v_parent.budget_group <> new.budget_group then
    raise exception 'catalog_categories: % y su principal % están en grupos distintos', new.key, new.parent_key;
  end if;
  return new;
end;
$$;

create trigger catalog_categories_parent_check
  before insert or update of parent_key, budget_group on public.catalog_categories
  for each row execute function public.catalog_categories_check_parent();

-- ─── Clases de producto estándar (Alimentación / Otros) ───
create table public.catalog_food_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_]+(\.[a-z0-9_]+)*$'),
  kind text not null check (kind in ('alimentacion', 'no_alimentos')),
  name text not null check (length(btrim(name)) between 2 and 80),
  -- Nombres antiguos con los que ya existe esta clase en datos de familias (p. ej. 'Jardin' sin tilde).
  legacy_names text[] not null default '{}',
  icon text not null,
  sort_order integer not null,
  status text not null default 'approved' check (status in ('approved', 'retired')),
  catalog_version integer not null references public.catalog_release (version),
  created_at timestamptz not null default now()
);

create unique index catalog_food_types_kind_normname_uidx
  on public.catalog_food_types (kind, public.catalog_norm_name(name));

-- ─── Auditoría de cambios del catálogo (solo service_role) ───
create table public.catalog_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null,
  action text not null check (action in ('seed', 'promote', 'retire', 'edit', 'release')),
  entity text not null check (entity in ('category', 'food_type', 'release')),
  key text,
  before jsonb,
  after jsonb,
  note text
);

-- ─── Seguridad: lectura para usuarios autenticados; ninguna escritura (solo service_role / migraciones) ───
alter table public.catalog_release enable row level security;
alter table public.catalog_categories enable row level security;
alter table public.catalog_food_types enable row level security;
alter table public.catalog_audit enable row level security;

create policy "catalog_release: leer" on public.catalog_release for select to authenticated using (true);
create policy "catalog_categories: leer" on public.catalog_categories for select to authenticated using (true);
create policy "catalog_food_types: leer" on public.catalog_food_types for select to authenticated using (true);
-- catalog_audit: sin política ni permisos para usuarios (solo service_role, que se salta RLS).

revoke all on public.catalog_release, public.catalog_categories, public.catalog_food_types, public.catalog_audit from public, anon, authenticated;
grant select on public.catalog_release, public.catalog_categories, public.catalog_food_types to authenticated;

-- ─── Siembra: versión 1 ───
insert into public.catalog_release (version, notes)
values (1, 'Catálogo base v1: 56 categorías financieras y 27 clases de producto aprobadas en la Fase 0 (2026-09-21).');

-- Categorías principales (16)
insert into public.catalog_categories (key, budget_group, parent_key, name, icon, necessity, is_fixed, sort_order, protected, catalog_version) values
  ('g.ahorro_inversion',        'generales', null, 'Ahorro e inversión',         '💰', null,       null,  10, false, 1),
  ('g.alimentacion',            'generales', null, 'Alimentación',               '🛒', 'necesito', false, 20, true,  1),
  ('g.compras_familia',         'generales', null, 'Compras y familia',          '🛍️', 'quiero',   false, 30, false, 1),
  ('g.comunicaciones_servicios','generales', null, 'Comunicaciones y servicios', '📱', 'necesito', false, 40, false, 1),
  ('g.educacion',               'generales', null, 'Educación',                  '🎓', 'debo',     true,  50, false, 1),
  ('g.finanzas_obligaciones',   'generales', null, 'Finanzas y obligaciones',    '📑', 'debo',     true,  60, false, 1),
  ('g.movimientos_internos',    'generales', null, 'Movimientos internos',       '🔄', null,       null,  70, true,  1),
  ('g.ocio_viajes',             'generales', null, 'Ocio y viajes',              '🌴', 'quiero',   false, 80, false, 1),
  ('g.otros',                   'generales', null, 'Otros',                      '📦', null,       null,  90, false, 1),
  ('g.salud_bienestar',         'generales', null, 'Salud y bienestar',          '⚕️', 'necesito', false, 100, false, 1),
  ('g.transporte_vehiculo',     'generales', null, 'Transporte y vehículo',      '🚗', 'necesito', false, 110, false, 1),
  ('g.vivienda_hogar',          'generales', null, 'Vivienda y hogar',           '🏠', 'necesito', true,  120, false, 1),
  ('i.ingreso',                 'ingresos',  null, 'Ingreso',                    '💰', null,       null,  10, true,  1),
  ('i.movimientos_internos',    'ingresos',  null, 'Movimientos internos',       '🔄', null,       null,  20, true,  1),
  ('i.regalo',                  'ingresos',  null, 'Regalo',                     '🎁', null,       null,  30, false, 1),
  ('i.sueldo',                  'ingresos',  null, 'Sueldo',                     '💼', null,       null,  40, false, 1);

-- Subcategorías (40)
insert into public.catalog_categories (key, budget_group, parent_key, name, icon, necessity, is_fixed, sort_order, protected, catalog_version) values
  ('g.ahorro_inversion.ahorro',                      'generales', 'g.ahorro_inversion',         'Ahorro',                                              '🐷', null,       true,  11, false, 1),
  ('g.ahorro_inversion.inversiones',                 'generales', 'g.ahorro_inversion',         'Inversiones',                                         '📈', null,       false, 12, false, 1),
  ('g.alimentacion.restaurantes',                    'generales', 'g.alimentacion',             'Restaurantes, bares y cafeterías',                    '🍽️', 'quiero',   false, 21, false, 1),
  ('g.alimentacion.supermercado',                    'generales', 'g.alimentacion',             'Supermercado, carnicería y tiendas de alimentación',  '🛒', 'necesito', false, 22, false, 1),
  ('g.compras_familia.casa_jardin',                  'generales', 'g.compras_familia',          'Casa y jardín',                                       '🏡', 'quiero',   false, 31, false, 1),
  ('g.compras_familia.mascotas',                     'generales', 'g.compras_familia',          'Mascotas',                                            '🐾', 'necesito', false, 32, false, 1),
  ('g.compras_familia.ninos',                        'generales', 'g.compras_familia',          'Niños',                                               '🧸', 'necesito', false, 33, false, 1),
  ('g.compras_familia.regalos_compras_varias',       'generales', 'g.compras_familia',          'Regalos y compras varias',                            '🎁', 'quiero',   false, 34, false, 1),
  ('g.compras_familia.ropa_accesorios',              'generales', 'g.compras_familia',          'Ropa y accesorios',                                   '👕', 'necesito', false, 35, false, 1),
  ('g.compras_familia.tecnologia_electronica',       'generales', 'g.compras_familia',          'Tecnología y electrónica',                            '📺', 'quiero',   false, 36, false, 1),
  ('g.comunicaciones_servicios.otros_servicios',     'generales', 'g.comunicaciones_servicios', 'Otros servicios',                                     '🔌', 'necesito', false, 41, false, 1),
  ('g.comunicaciones_servicios.software_aplicaciones','generales','g.comunicaciones_servicios', 'Software y aplicaciones',                             '💻', 'quiero',   false, 42, false, 1),
  ('g.comunicaciones_servicios.telefono_internet',   'generales', 'g.comunicaciones_servicios', 'Teléfono e Internet',                                 '📶', 'necesito', true,  43, false, 1),
  ('g.finanzas_obligaciones.asesoria',               'generales', 'g.finanzas_obligaciones',    'Asesoría',                                            '🧑‍💼', 'debo',     false, 61, false, 1),
  ('g.finanzas_obligaciones.comisiones_cargos',      'generales', 'g.finanzas_obligaciones',    'Comisiones y cargos',                                 '💸', 'debo',     false, 62, false, 1),
  ('g.finanzas_obligaciones.impuestos',              'generales', 'g.finanzas_obligaciones',    'Impuestos',                                           '🧾', 'debo',     true,  63, false, 1),
  ('g.finanzas_obligaciones.multas_obligaciones',    'generales', 'g.finanzas_obligaciones',    'Multas / obligaciones',                               '🚨', 'debo',     false, 64, false, 1),
  ('g.finanzas_obligaciones.prestamos_intereses',    'generales', 'g.finanzas_obligaciones',    'Préstamos e intereses',                               '💳', 'debo',     true,  65, false, 1),
  ('g.finanzas_obligaciones.seguros',                'generales', 'g.finanzas_obligaciones',    'Seguros',                                             '🔒', 'debo',     true,  66, false, 1),
  ('g.movimientos_internos.cobro_anulado',           'generales', 'g.movimientos_internos',     'Cobro anulado',                                       '↩️', null,       null,  71, true,  1),
  ('g.movimientos_internos.transferencias_propias',  'generales', 'g.movimientos_internos',     'Transferencias entre cuentas propias',                '🔁', null,       null,  72, true,  1),
  ('g.ocio_viajes.aficiones',                        'generales', 'g.ocio_viajes',              'Aficiones',                                           '🎨', 'quiero',   false, 81, false, 1),
  ('g.ocio_viajes.eventos_celebraciones',            'generales', 'g.ocio_viajes',              'Eventos y celebraciones',                             '🎉', 'quiero',   false, 82, false, 1),
  ('g.ocio_viajes.ocio_cultura',                     'generales', 'g.ocio_viajes',              'Ocio y cultura',                                      '🎭', 'quiero',   false, 83, false, 1),
  ('g.ocio_viajes.suscripciones_entretenimiento',    'generales', 'g.ocio_viajes',              'Suscripciones y entretenimiento',                     '🎬', 'quiero',   true,  84, false, 1),
  ('g.ocio_viajes.viajes_vacaciones',                'generales', 'g.ocio_viajes',              'Viajes y vacaciones',                                 '✈️', 'quiero',   false, 85, false, 1),
  ('g.otros.imprevistos',                            'generales', 'g.otros',                    'Imprevistos',                                         '⚠️', null,       false, 91, false, 1),
  ('g.salud_bienestar.belleza_cuidado_personal',     'generales', 'g.salud_bienestar',          'Belleza y cuidado personal',                          '💅', 'quiero',   false, 101, false, 1),
  ('g.salud_bienestar.deporte_fitness',              'generales', 'g.salud_bienestar',          'Deporte y fitness',                                   '🏋️', 'quiero',   false, 102, false, 1),
  ('g.salud_bienestar.salud_farmacia',               'generales', 'g.salud_bienestar',          'Salud y farmacia',                                    '💊', 'necesito', false, 103, false, 1),
  ('g.transporte_vehiculo.aparcamiento_peajes',      'generales', 'g.transporte_vehiculo',      'Aparcamiento y peajes',                               '🅿️', 'necesito', false, 111, false, 1),
  ('g.transporte_vehiculo.combustible',              'generales', 'g.transporte_vehiculo',      'Combustible',                                         '⛽', 'necesito', false, 112, false, 1),
  ('g.transporte_vehiculo.mantenimiento_reparaciones','generales','g.transporte_vehiculo',      'Mantenimiento y reparaciones',                        '🔧', 'necesito', false, 113, false, 1),
  ('g.transporte_vehiculo.seguro_financiacion_vehiculo','generales','g.transporte_vehiculo',    'Seguro / financiación del vehículo',                  '🚙', 'debo',     true,  114, false, 1),
  ('g.transporte_vehiculo.transporte_publico_taxi',  'generales', 'g.transporte_vehiculo',      'Transporte público / taxi',                           '🚕', 'necesito', false, 115, false, 1),
  ('g.vivienda_hogar.alquiler_hipoteca',             'generales', 'g.vivienda_hogar',           'Alquiler / hipoteca',                                 '🏦', 'debo',     true,  121, false, 1),
  ('g.vivienda_hogar.mantenimiento_hogar',           'generales', 'g.vivienda_hogar',           'Mantenimiento y hogar',                               '🔨', 'necesito', false, 122, false, 1),
  ('g.vivienda_hogar.seguro_hogar',                  'generales', 'g.vivienda_hogar',           'Seguro de hogar',                                     '🛡️', 'debo',     true,  123, false, 1),
  ('g.vivienda_hogar.suministros',                   'generales', 'g.vivienda_hogar',           'Suministros',                                         '💡', 'necesito', true,  124, false, 1),
  ('i.ingreso.devoluciones',                         'ingresos',  'i.ingreso',                  'Devoluciones',                                        '🧾', null,       null,  11, false, 1);

-- Clases de producto (27): 14 de Alimentación + 13 de Otros
insert into public.catalog_food_types (key, kind, name, legacy_names, icon, sort_order, catalog_version) values
  ('food.carne',                    'alimentacion', 'Carne',                                         '{}', '🥩', 10, 1),
  ('food.panaderia_bolleria',       'alimentacion', 'Panadería y bollería',                          '{}', '🍞', 20, 1),
  ('food.lacteos_huevos',           'alimentacion', 'Lácteos y huevos',                              '{}', '🥛', 30, 1),
  ('food.congelados_helados',       'alimentacion', 'Congelados y helados',                          '{}', '🧊', 40, 1),
  ('food.snacks_dulces',            'alimentacion', 'Snacks y dulces',                               '{}', '🍬', 50, 1),
  ('food.despensa',                 'alimentacion', 'Despensa (arroz, pasta, aceite, conservas...)', '{}', '🥫', 60, 1),
  ('food.verdura_hortalizas',       'alimentacion', 'Verdura y hortalizas',                          '{}', '🥦', 70, 1),
  ('food.fruta',                    'alimentacion', 'Fruta',                                         '{}', '🍎', 80, 1),
  ('food.pescado_marisco',          'alimentacion', 'Pescado y marisco',                             '{}', '🐟', 90, 1),
  ('food.otros_alimentos',          'alimentacion', 'Otros alimentos',                               '{}', '🍽️', 100, 1),
  ('food.condimentos_hierbas',      'alimentacion', 'Condimentos y Hierbas',                         '{}', '🧂', 110, 1),
  ('food.bebidas_no_alcoholicas',   'alimentacion', 'Bebidas no alcohólicas',                        '{}', '🥤', 120, 1),
  ('food.bebidas_alcoholicas',      'alimentacion', 'Bebidas alcohólicas',                           '{}', '🍺', 130, 1),
  ('food.postres',                  'alimentacion', 'Postres',                                       '{}', '🍰', 140, 1),
  ('other.limpieza_hogar',          'no_alimentos', 'Limpieza del hogar',                            '{}', '🧽', 10, 1),
  ('other.cuidado_personal',        'no_alimentos', 'Cuidado personal',                              '{}', '🧴', 20, 1),
  ('other.ropa_calzado',            'no_alimentos', 'Ropa y calzado',                                '{}', '👕', 30, 1),
  ('other.electronica_hogar',       'no_alimentos', 'Electrónica y hogar',                           '{}', '📺', 40, 1),
  ('other.utensilios_cocina',       'no_alimentos', 'Utensilios cocina',                             '{}', '🧼', 50, 1),
  ('other.jardin',                  'no_alimentos', 'Jardín',                                        '{Jardin}', '🌸', 60, 1),
  ('other.combustible_aceite_adblue','no_alimentos','Combustible, Aceite y AdBlue',                  '{}', '🚗', 70, 1),
  ('other.ferreteria_bricolaje',    'no_alimentos', 'Ferretería y bricolaje',                        '{}', '🔧', 80, 1),
  ('other.farmacia_salud',          'no_alimentos', 'Farmacia y salud',                              '{}', '💊', 90, 1),
  ('other.juguetes',                'no_alimentos', 'Juguetes',                                      '{}', '🧸', 100, 1),
  ('other.mascotas',                'no_alimentos', 'Mascotas',                                      '{}', '🐾', 110, 1),
  ('other.papeleria_oficina',       'no_alimentos', 'Papelería y oficina',                           '{}', '📓', 120, 1),
  ('other.otros',                   'no_alimentos', 'Otros',                                         '{}', '🛍️', 130, 1);

-- Auditoría de la siembra
insert into public.catalog_audit (actor, action, entity, key, after, note)
select 'migration:0139', 'seed', 'category', c.key, to_jsonb(c), 'Catálogo base v1'
from public.catalog_categories c;

insert into public.catalog_audit (actor, action, entity, key, after, note)
select 'migration:0139', 'seed', 'food_type', t.key, to_jsonb(t), 'Catálogo base v1'
from public.catalog_food_types t;

insert into public.catalog_audit (actor, action, entity, key, after, note)
select 'migration:0139', 'release', 'release', r.version::text, to_jsonb(r), r.notes
from public.catalog_release r;
