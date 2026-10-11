-- Pequeños Grandes (prompt PG-PUNTOS-FINANZAS, Parte A) — A2: qué miembros participan en Puntos y
-- recompensas, y A3: modo de progreso (Camino/Carrera). Se hace con tablas NUEVAS, sin tocar
-- family_members ni families: su RLS de escritura es admin-only (migración 0001), pero el prompt pide
-- expresamente que "los adultos" (no solo el admin) puedan elegir participantes y modo, y que esto
-- "nunca toque los permisos generales de la familia". Ausencia de fila = valor por defecto, para no
-- necesitar backfill por cada familia/miembro ya existente: "camino" como modo, participación activada
-- para child/baby/guest y desactivada para admin/adult — mismo criterio que calculan las funciones puras
-- en src/domain/rewards.ts, nunca decidido aparte en el cliente.

create table reward_settings (
  family_id uuid primary key references families(id) on delete cascade,
  mode text not null default 'camino' check (mode in ('camino', 'carrera')),
  updated_at timestamptz not null default now()
);

alter table reward_settings enable row level security;
create policy "reward_settings: family select" on reward_settings for select
  using (family_id = (select private.current_family_id()));
create policy "reward_settings: adult insert" on reward_settings for insert
  with check (family_id = (select private.current_family_id()) and (select private.current_role_in_family()) in ('admin', 'adult'));
create policy "reward_settings: adult update" on reward_settings for update
  using (family_id = (select private.current_family_id()) and (select private.current_role_in_family()) in ('admin', 'adult'))
  with check (family_id = (select private.current_family_id()));

create table reward_participants (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  unique (member_id)
);
create index idx_reward_participants_family on reward_participants(family_id);

alter table reward_participants enable row level security;
create policy "reward_participants: family select" on reward_participants for select
  using (family_id = (select private.current_family_id()));
create policy "reward_participants: adult insert" on reward_participants for insert
  with check (family_id = (select private.current_family_id()) and (select private.current_role_in_family()) in ('admin', 'adult'));
create policy "reward_participants: adult update" on reward_participants for update
  using (family_id = (select private.current_family_id()) and (select private.current_role_in_family()) in ('admin', 'adult'))
  with check (family_id = (select private.current_family_id()));
