-- Fase 5 (Skills 14/15/16): alimentación, menús y recetas.

create table recipes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  name text not null,
  quantity text,
  unit text
);

create table menu_entries (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  entry_date date not null,
  meal_type text not null check (meal_type in ('desayuno', 'comida', 'merienda', 'cena', 'snack')),
  recipe_id uuid references recipes(id) on delete set null,
  free_text text, -- comida sin receta asociada, ej. "fruta"
  created_at timestamptz not null default now()
);

create table food_logs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  log_date date not null default current_date,
  meal_type text not null check (meal_type in ('desayuno', 'comida', 'merienda', 'cena', 'snack')),
  description text not null,
  calories int,
  protein_g numeric(6, 1),
  carbs_g numeric(6, 1),
  fat_g numeric(6, 1),
  is_estimated boolean not null default true,
  created_at timestamptz not null default now()
);

alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;
alter table menu_entries enable row level security;
alter table food_logs enable row level security;

create policy "recipes: family crud" on recipes for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

create policy "recipe_ingredients: family crud" on recipe_ingredients for all
  using (exists (select 1 from recipes r where r.id = recipe_id and r.family_id = private.current_family_id()))
  with check (exists (select 1 from recipes r where r.id = recipe_id and r.family_id = private.current_family_id()));

create policy "menu_entries: family crud" on menu_entries for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

create policy "food_logs: family crud" on food_logs for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

create index idx_recipes_family on recipes(family_id);
create index idx_recipe_ingredients_recipe on recipe_ingredients(recipe_id);
create index idx_menu_entries_family_date on menu_entries(family_id, entry_date);
create index idx_food_logs_family_date on food_logs(family_id, log_date);
