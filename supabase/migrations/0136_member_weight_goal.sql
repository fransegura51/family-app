-- Peso objetivo opcional de cada miembro (vista de adultos de Peso y medidas).
alter table public.family_members
  add column if not exists weight_goal_kg numeric check (weight_goal_kg is null or weight_goal_kg > 0);
