-- Pequeños Grandes (prompt PG-PUNTOS-FINANZAS, Parte A5) — "hitos cada 10 puntos, con una breve
-- celebración + confeti, calculados del saldo canjeable REAL, que no se repita cada vez que se abra la
-- pantalla". El nivel de hito en sí nunca se guarda aparte (sale de milestoneProgress() sobre el saldo
-- real en src/domain/rewards.ts, siempre derivado, nunca una columna que pudiera desincronizarse) — esta
-- tabla solo registra "hasta qué hito ya se le ha enseñado la celebración a este miembro", para no volver
-- a enseñarla sin más datos nuevos de por medio. Igual que point_grants: nunca se actualiza ni se borra
-- una fila ya insertada, solo se añaden niveles más altos según se van alcanzando de verdad.
create table reward_milestones_seen (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  milestone integer not null check (milestone > 0),
  seen_at timestamptz not null default now(),
  unique (member_id, milestone)
);
create index idx_reward_milestones_seen_member on reward_milestones_seen(member_id);
create index idx_reward_milestones_seen_family on reward_milestones_seen(family_id);

alter table reward_milestones_seen enable row level security;
create policy "reward_milestones_seen: family select" on reward_milestones_seen for select
  using (family_id = (select private.current_family_id()));
-- Cualquiera de la familia puede marcar un hito como ya visto (es solo "no repitas esta celebración",
-- sin ningún efecto sobre puntos/premios) — no hace falta restringirlo a adultos, a diferencia de
-- reward_participants/reward_settings que sí cambian cómo se comporta la pantalla para todos.
create policy "reward_milestones_seen: family insert" on reward_milestones_seen for insert
  with check (
    family_id = (select private.current_family_id())
    and exists (select 1 from family_members m where m.id = member_id and m.family_id = (select private.current_family_id()))
  );
