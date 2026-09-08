-- Petición real: "quiero que yo pueda seleccionar cada gasto, si es
-- fijo o es variable... y que se pueda filtrar por fijo o variable
-- para saber cuánto tenemos de cada" — hasta ahora Fijo/Variable se
-- calculaba SOLO desde la categoría (resolveCategoryClassification,
-- ver domain/finance.ts), sin poder cambiarlo para un movimiento
-- suelto. NULL = sigue la categoría como hasta ahora (comportamiento
-- por defecto sin tocar nada); true/false = el propio movimiento
-- manda por encima de su categoría.
alter table expenses add column is_fixed_override boolean;
