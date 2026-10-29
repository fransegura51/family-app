-- 0344 · COR-06 — Dos clases de producto y una categoría de Economía nuevas, tras auditar un caso real de Amazon (28/10/2026).
--
-- Auditoría de las clases existentes (Familia prueba y catálogo CAT-1):
--   · Bebé (chupetero, chupetes, mordedores, biberones, baberos): YA existe «Higiene y cuidado del bebé» (other.cuidado_bebe, 0334) y su catálogo ya reconoce chupete, biberón,
--     tetina, babero y sonajero → se REUTILIZA (se añaden solo palabras al catálogo en código: chupetero, mordedor). No se crea otra clase de bebé.
--   · Muebles (un archivador móvil de 5 cajones): no había clase de muebles. «Papelería y oficina» es material pequeño (carpetas, archivadores de anillas) y «Ferretería y bricolaje»
--     son herramientas → se añade «Muebles y organización».
--   · Manualidades y actividades creativas (plastilina, kits de experimentos, colorantes usados en una actividad con niños): estaban mezcladas con «Papelería y oficina» (plastilina,
--     témperas) o forzadas a «Juguetes» u «Otros alimentos» → se añade «Manualidades y creatividad». Los juegos educativos siguen siendo «Juguetes» y la comida real, comida.
--   · Economía: «Vivienda y hogar» no tenía una categoría para muebles → se añade «Muebles y organización» (la familia la recibe sola, como el resto del catálogo).
-- Aditiva e idempotente: no borra, no renombra y no reclasifica NINGÚN dato de las familias (productos, tickets, gastos, presupuestos, clasificaciones). Las familias reciben las
-- clases y la categoría nuevas por el sincronizador del catálogo (0338): una clase propia con el mismo nombre se enlaza sin renombrar nada.
-- ROLLBACK: supabase/rollbacks/0344_catalog_furniture_crafts_down.sql (solo quita lo no usado por ningún producto, gasto ni presupuesto).
do $$
declare
  v_version integer;
begin
  select coalesce(max(version), 0) + 1 into v_version from public.catalog_release;
  insert into public.catalog_release (version, notes)
  values (v_version, 'COR-06: clases Muebles y organización y Manualidades y creatividad; categoría Vivienda y hogar → Muebles y organización (2026-10-29).');

  insert into public.catalog_food_types (key, kind, name, legacy_names, icon, sort_order, catalog_version) values
    ('other.muebles_organizacion',    'no_alimentos', 'Muebles y organización',    '{}', '🗄️', 141, v_version),
    ('other.manualidades_creatividad', 'no_alimentos', 'Manualidades y creatividad', '{}', '🎨', 142, v_version)
  on conflict (key) do nothing;

  insert into public.catalog_categories (key, budget_group, parent_key, name, icon, necessity, is_fixed, sort_order, protected, status, catalog_version) values
    ('g.vivienda_hogar.muebles_organizacion', 'generales', 'g.vivienda_hogar', 'Muebles y organización', '🗄️', 'necesito', false, 129, false, 'approved', v_version)
  on conflict (key) do nothing;

  insert into public.catalog_audit (actor, action, entity, key, after, note)
  select 'migration:0344', 'promote', 'food_type', t.key, to_jsonb(t), 'COR-06 clases nuevas'
    from public.catalog_food_types t
   where t.key in ('other.muebles_organizacion', 'other.manualidades_creatividad')
     and not exists (select 1 from public.catalog_audit a where a.key = t.key and a.actor = 'migration:0344');

  insert into public.catalog_audit (actor, action, entity, key, after, note)
  select 'migration:0344', 'promote', 'category', c.key, to_jsonb(c), 'COR-06 categoría de Economía nueva'
    from public.catalog_categories c
   where c.key = 'g.vivienda_hogar.muebles_organizacion'
     and not exists (select 1 from public.catalog_audit a where a.key = c.key and a.actor = 'migration:0344');
end $$;
