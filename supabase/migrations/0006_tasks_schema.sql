-- Fase 2 (Skill 05): tareas únicas/recurrentes, rutinas, misiones
-- infantiles, puntos, rachas y recompensas canjeables.

create table tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid references family_members(id) on delete cascade, -- null = tarea familiar, cualquiera la completa
  title text not null,
  task_type text not null check (task_type in ('unica', 'recurrente', 'rutina', 'mision')),
  recurrence_rule text, -- mismo formato simple que el calendario; null = tarea única
  points int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  completed_date date not null default current_date,
  points_awarded int not null default 0,
  created_at timestamptz not null default now(),
  unique (task_id, member_id, completed_date)
);

create table rewards (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  points_cost int not null check (points_cost > 0),
  created_at timestamptz not null default now()
);

create table reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid not null references rewards(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  points_spent int not null,
  redeemed_at timestamptz not null default now()
);

alter table tasks enable row level security;
alter table task_completions enable row level security;
alter table rewards enable row level security;
alter table reward_redemptions enable row level security;

-- tasks / rewards: cualquier miembro autenticado de la familia gestiona
-- (mismo patrón que calendar_events — app de uso compartido en familia).
create policy "tasks: family crud" on tasks for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

create policy "rewards: family crud" on rewards for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

-- task_completions / reward_redemptions: sin family_id propio, se
-- valida a través de la tarea/recompensa a la que pertenecen.
create policy "task_completions: family crud" on task_completions for all
  using (exists (select 1 from tasks t where t.id = task_id and t.family_id = private.current_family_id()))
  with check (exists (select 1 from tasks t where t.id = task_id and t.family_id = private.current_family_id()));

create policy "reward_redemptions: family crud" on reward_redemptions for all
  using (exists (select 1 from rewards r where r.id = reward_id and r.family_id = private.current_family_id()))
  with check (exists (select 1 from rewards r where r.id = reward_id and r.family_id = private.current_family_id()));

create index idx_tasks_family on tasks(family_id);
create index idx_task_completions_task on task_completions(task_id);
create index idx_task_completions_member on task_completions(member_id);
create index idx_rewards_family on rewards(family_id);
create index idx_reward_redemptions_member on reward_redemptions(member_id);
