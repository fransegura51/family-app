-- ROLLBACK de 0339. Quita las 8 categorías añadidas al catálogo SOLO si ningún gasto, presupuesto ni etiqueta las usa en ninguna familia;
-- las copias de las familias sin uso se borran y las usadas se desenlazan (pasan a ser personales de la familia, sin perder datos).
update public.budget_categories b set catalog_key = null
 where b.catalog_key in ('g.vivienda_hogar.electricidad', 'g.vivienda_hogar.gas', 'g.vivienda_hogar.agua', 'g.vivienda_hogar.comunidad',
                         'g.salud_bienestar.medicos_dentista_optica', 'g.otros.donaciones', 'i.ingreso.pensiones_prestaciones', 'i.ingreso.intereses_rentas')
   and (exists (select 1 from public.expenses e where e.family_id = b.family_id and e.category = b.name)
     or exists (select 1 from public.budgets g where g.family_id = b.family_id and g.category = b.name));
delete from public.budget_categories b
 where b.catalog_key in ('g.vivienda_hogar.electricidad', 'g.vivienda_hogar.gas', 'g.vivienda_hogar.agua', 'g.vivienda_hogar.comunidad',
                         'g.salud_bienestar.medicos_dentista_optica', 'g.otros.donaciones', 'i.ingreso.pensiones_prestaciones', 'i.ingreso.intereses_rentas');
delete from public.catalog_categories
 where key in ('g.vivienda_hogar.electricidad', 'g.vivienda_hogar.gas', 'g.vivienda_hogar.agua', 'g.vivienda_hogar.comunidad',
               'g.salud_bienestar.medicos_dentista_optica', 'g.otros.donaciones', 'i.ingreso.pensiones_prestaciones', 'i.ingreso.intereses_rentas');
