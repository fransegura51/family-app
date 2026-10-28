-- 0339 · CAT-2 — Ampliación mínima del catálogo general de categorías de Economía (versión 3 del catálogo).
--
-- Auditoría de 197 movimientos bancarios reales sin historial de clasificación (Familia prueba, 28/10/2026): los recibos de luz, agua y gas,
-- la clínica dental o las pensiones y los intereses caían en «Otros» porque el catálogo solo tenía «Suministros», «Salud y farmacia» y un único
-- «Ingreso» genérico. Se añaden SOLO las categorías habituales que faltaban, sin duplicar ninguna (Suministros se conserva como categoría
-- general de suministros varios y NO se toca; los gastos que ya la usan siguen igual).
--   · Vivienda y hogar → Electricidad, Gas, Agua, Comunidad de vecinos
--   · Salud y bienestar → Médicos, dentista y óptica
--   · Otros → Donaciones y ONG
--   · Ingreso → Pensión y prestaciones, Intereses y rentas
-- Las familias las reciben solas (disparador de la 0338). Aditiva e idempotente: no borra, no renombra y no reclasifica NINGÚN dato.
-- ROLLBACK: supabase/rollbacks/0339_catalog_economy_categories_down.sql (solo quita lo que ningún gasto, presupuesto ni etiqueta use).
do $$
declare
  v_version integer;
begin
  select coalesce(max(version), 0) + 1 into v_version from public.catalog_release;
  insert into public.catalog_release (version, notes)
  values (v_version, 'Categorías de Economía: Electricidad, Gas, Agua, Comunidad de vecinos, Médicos/dentista/óptica, Donaciones y ONG, Pensión y prestaciones, Intereses y rentas (2026-10-28).');

  insert into public.catalog_categories (key, budget_group, parent_key, name, icon, necessity, is_fixed, sort_order, protected, status, catalog_version) values
    ('g.vivienda_hogar.electricidad',          'generales', 'g.vivienda_hogar',  'Electricidad',               '⚡',  'necesito', true,  125, false, 'approved', v_version),
    ('g.vivienda_hogar.gas',                   'generales', 'g.vivienda_hogar',  'Gas',                        '🔥', 'necesito', true,  126, false, 'approved', v_version),
    ('g.vivienda_hogar.agua',                  'generales', 'g.vivienda_hogar',  'Agua',                       '🚰', 'necesito', true,  127, false, 'approved', v_version),
    ('g.vivienda_hogar.comunidad',             'generales', 'g.vivienda_hogar',  'Comunidad de vecinos',       '🏢', 'debo',     true,  128, false, 'approved', v_version),
    ('g.salud_bienestar.medicos_dentista_optica', 'generales', 'g.salud_bienestar', 'Médicos, dentista y óptica', '🩺', 'necesito', false, 104, false, 'approved', v_version),
    ('g.otros.donaciones',                     'generales', 'g.otros',           'Donaciones y ONG',           '🤝', 'quiero',   false, 92,  false, 'approved', v_version),
    ('i.ingreso.pensiones_prestaciones',       'ingresos',  'i.ingreso',         'Pensión y prestaciones',     '🏛️', null,       null,  12,  false, 'approved', v_version),
    ('i.ingreso.intereses_rentas',             'ingresos',  'i.ingreso',         'Intereses y rentas',         '📈', null,       null,  13,  false, 'approved', v_version)
  on conflict (key) do nothing;

  insert into public.catalog_audit (actor, action, entity, key, after, note)
  select 'migration:0339', 'promote', 'category', c.key, to_jsonb(c), 'Ampliación del catálogo de Economía (CAT-2)'
    from public.catalog_categories c
   where c.key in ('g.vivienda_hogar.electricidad', 'g.vivienda_hogar.gas', 'g.vivienda_hogar.agua', 'g.vivienda_hogar.comunidad',
                   'g.salud_bienestar.medicos_dentista_optica', 'g.otros.donaciones', 'i.ingreso.pensiones_prestaciones', 'i.ingreso.intereses_rentas')
     and not exists (select 1 from public.catalog_audit a where a.key = c.key and a.actor = 'migration:0339');
end $$;
