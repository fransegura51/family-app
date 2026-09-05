-- Presupuesto Generales, además del de Alimentación que ya había, y
-- seguimiento de ingresos — petición real: "ábreme en dinero otra
-- pestaña que se llame presupuesto generales... luz, agua, impuestos,
-- taller, imprevistos, hipoteca, préstamos, gastos escolares... que
-- todos los presupuestos estén conectados... con los gráficos de
-- estadísticas total ingresos y cuánto se gasta".
--
-- budget_group separa las categorías/presupuestos de Alimentación de
-- los Generales SOLO para poder mostrarlos en pestañas distintas — las
-- estadísticas (BudgetsOverview) sí suman las dos juntas, que es lo
-- que hace que estén "conectados". Los que ya existían eran todos de
-- Alimentación (la única pestaña de presupuestos que había hasta
-- ahora), de ahí el valor por defecto.
alter table budget_categories add column budget_group text not null default 'alimentacion';
alter table budgets add column budget_group text not null default 'alimentacion';

-- Un ingreso (nómina, paga extra...) se guarda en la misma tabla de
-- gastos con esta marca, en vez de una tabla paralela — mismo importe,
-- fecha y categoría, solo cambia el signo con el que cuenta en los
-- totales.
alter table expenses add column is_income boolean not null default false;
