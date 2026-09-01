-- Caché de alimentos consultados en FatSecret (Fase 5, skill
-- organizador-familiar). No es específica de familia: los datos
-- nutricionales de un alimento son los mismos para cualquiera, así que
-- cachear en global evita repetir la misma llamada a la API gratuita
-- una y otra vez entre miembros/familias. RLS activado sin políticas:
-- nadie con el JWT normal puede leer/escribir esta tabla directamente,
-- solo la Edge Function con la service role key (igual que el patrón ya
-- usado para leer secretos de Vault) — el cliente nunca la consulta
-- directo, siempre a través de la función.
create table public.food_cache (
  id uuid primary key default gen_random_uuid(),
  fatsecret_food_id text not null unique,
  name text not null,
  brand text,
  serving_description text,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  cached_at timestamptz not null default now()
);

alter table public.food_cache enable row level security;
