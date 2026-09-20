-- Curvas de crecimiento de la OMS: hace falta el sexo del miembro (las
-- curvas de niños y niñas son distintas) y, en las medidas, la talla y el
-- perímetro cefálico.
alter table public.family_members
  add column if not exists sex text check (sex in ('female', 'male'));

alter table public.body_measurements
  add column if not exists height_cm numeric,
  add column if not exists head_cm numeric;
