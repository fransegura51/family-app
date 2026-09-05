-- Los ingresos de cada presupuesto no se deben sumar entre pestañas —
-- petición real: "presupuestos de alimentación y presupuestos
-- generales, los ingresos tienen que ser diferentes... no quiero que
-- me sumen en presupuesto de alimentación los cuatro mil euros [de
-- Generales]". Se marca cada gasto/ingreso con a qué presupuesto
-- pertenece, igual que ya tienen budgets y budget_categories.
alter table expenses add column budget_group text not null default 'alimentacion';
