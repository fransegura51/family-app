-- Skill de Pepa, puntos 15 y 16: Debo/Necesito/Quiero y Fijo/variable,
-- por movimiento. Nullable a propósito — no se inventa una
-- clasificación para movimientos antiguos que nadie ha revisado (el
-- documento prohíbe expresamente "inventar datos").
alter table expenses add column necessity text check (necessity in ('debo', 'necesito', 'quiero'));
alter table expenses add column is_fixed boolean;
