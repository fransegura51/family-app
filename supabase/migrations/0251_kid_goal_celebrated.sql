-- Pequeños Grandes (prompt PG-PUNTOS-FINANZAS, Parte B2) — "al completar un objetivo, '¡Enhorabuena!' +
-- confeti, registrado para que no se repita". Columna aditiva: un objetivo ya existente no pierde ni
-- cambia nada de lo que tenía. `celebrated_at` marca que YA se le enseñó la celebración a ese objetivo
-- (nunca se vuelve a mostrar, aunque el ahorro suba y baje más adelante) — la RLS ya existente de
-- kid_goals ("family crud", migración 0009) ya permite actualizar esta columna, sin necesitar una
-- política nueva: es solo "no repitas esto", igual de permisivo que reward_milestones_seen.
alter table kid_goals add column celebrated_at timestamptz null;
