-- Fase 6 (Skills 17/18/19/20): economía familiar, presupuestos y
-- educación financiera infantil (dinero virtual, independiente del
-- sistema de puntos de tareas).

create table expenses (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  expense_date date not null default current_date,
  amount numeric(10, 2) not null,
  category text not null,
  store text,
  kind text not null default 'real' check (kind in ('real', 'estimado', 'previsto')),
  notes text,
  created_at timestamptz not null default now()
);

create table budgets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  period_type text not null check (period_type in ('mensual', 'semanal')),
  period_start date not null,
  category text, -- null = presupuesto general
  amount numeric(10, 2) not null,
  created_at timestamptz not null default now()
);

-- Dinero virtual educativo (Skill 20) — deliberadamente separado del
-- sistema de puntos de tareas (Skill 05): aquí se enseña economía real
-- (ingresos, gastos, ahorro), no recompensas por comportamiento.
create table kid_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  type text not null check (type in ('ingreso', 'gasto')),
  amount numeric(10, 2) not null check (amount > 0),
  description text not null,
  created_at timestamptz not null default now()
);

create table kid_goals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  title text not null,
  target_amount numeric(10, 2) not null check (target_amount > 0),
  created_at timestamptz not null default now()
);

alter table expenses enable row level security;
alter table budgets enable row level security;
alter table kid_wallet_transactions enable row level security;
alter table kid_goals enable row level security;

create policy "expenses: family crud" on expenses for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

create policy "budgets: family crud" on budgets for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

create policy "kid_wallet_transactions: family crud" on kid_wallet_transactions for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

create policy "kid_goals: family crud" on kid_goals for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

create index idx_expenses_family_date on expenses(family_id, expense_date);
create index idx_budgets_family on budgets(family_id);
create index idx_kid_wallet_member on kid_wallet_transactions(member_id);
create index idx_kid_goals_member on kid_goals(member_id);
