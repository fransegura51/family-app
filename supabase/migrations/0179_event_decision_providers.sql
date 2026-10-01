-- Fase 3 (Eventos → "👰🤵 La pareja") — relación muchos-a-muchos decisión ↔ proveedor: un mismo proveedor
-- (p. ej. una floristería) puede estar relacionado con varias decisiones del motor (ramo, prendido, y más
-- adelante flores de ceremonia/centros de mesa en Decoración) sin duplicar la fila de event_providers.
-- event_providers.decision_id (migración 0176) se mantiene tal cual — sigue siendo "qué decisión creó este
-- proveedor la primera vez"; esta tabla puente es la relación real que se consulta/mantiene a partir de
-- ahora. Mismo patrón que event_guest_moments (0176): on delete cascade en ambos lados (borrar la decisión
-- o el proveedor borra solo las filas de relación, nunca al otro lado), RLS "hardened" con la misma
-- comprobación de pertenencia al mismo evento/familia.
create table event_decision_providers (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references event_decisions(id) on delete cascade,
  provider_id uuid not null references event_providers(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (decision_id, provider_id)
);

create index idx_event_decision_providers_decision on event_decision_providers(decision_id);
create index idx_event_decision_providers_provider on event_decision_providers(provider_id);
create index idx_event_decision_providers_event on event_decision_providers(event_id);
create index idx_event_decision_providers_family on event_decision_providers(family_id);

alter table event_decision_providers enable row level security;
create policy "event_decision_providers: family crud" on event_decision_providers for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('eventos')
    and exists (select 1 from event_decisions d where d.id = decision_id and d.family_id = private.current_family_id() and d.event_id = event_decision_providers.event_id)
    and exists (select 1 from event_providers p where p.id = provider_id and p.family_id = private.current_family_id() and p.event_id = event_decision_providers.event_id)
  );
