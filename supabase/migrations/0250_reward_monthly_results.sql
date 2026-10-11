-- Pequeños Grandes (prompt PG-PUNTOS-FINANZAS, Parte A6) — resultado de un mes de Carrera ya CERRADO
-- (un mes anterior al actual, nunca el mes en curso, que sigue cambiando) — se calcula una sola vez con
-- monthlyRaceStandings()/assignTrophies() (src/domain/rewards.ts) sobre datos reales, y se guarda aquí
-- para no tener que recalcularlo cada vez ni perderlo si point_grants cambia más adelante (historial
-- preservado, igual que reward_redemptions/point_grants: nunca se actualiza ni se borra una fila ya
-- insertada). Nunca mueve puntos de verdad — esto es solo un trofeo simbólico, jamás una fila en
-- point_grants.
create table reward_monthly_results (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  year_month text not null check (year_month ~ '^\d{4}-\d{2}$'),
  member_id uuid not null references family_members(id) on delete cascade,
  points integer not null check (points >= 0),
  rank integer not null check (rank > 0),
  trophy text not null check (trophy in ('oro', 'plata', 'bronce', 'participacion')),
  finalized_at timestamptz not null default now(),
  unique (year_month, member_id)
);
create index idx_reward_monthly_results_family on reward_monthly_results(family_id);
create index idx_reward_monthly_results_member on reward_monthly_results(member_id);

alter table reward_monthly_results enable row level security;
create policy "reward_monthly_results: family select" on reward_monthly_results for select
  using (family_id = (select private.current_family_id()));
-- Cerrar un mes es solo "guardar un cálculo ya hecho con datos reales", sin ningún efecto sobre puntos
-- ni premios — lo puede hacer cualquiera de la familia, igual que reward_milestones_seen.
create policy "reward_monthly_results: family insert" on reward_monthly_results for insert
  with check (
    family_id = (select private.current_family_id())
    and exists (select 1 from family_members m where m.id = member_id and m.family_id = (select private.current_family_id()))
  );
