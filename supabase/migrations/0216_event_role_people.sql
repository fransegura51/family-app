-- Fase 2 (plan de pendientes) — "Personas especiales" (boda/bautizo/comunión: padrino, madrina,
-- testigos, damas de honor...) y "Familiares" (bautizo/comunión: madre, padre, hermano/a, abuelo/a...)
-- comparten la misma forma — una ficha con nombre (opcional en Familiares) y uno o varios papeles — así
-- que viven en UNA sola tabla con `category` como discriminador, en vez de dos tablas casi idénticas.
--
-- roles es un array de ETIQUETAS en texto libre (no un enum): mezcla las sugeridas (Padrino/Madrina/...,
-- o Madre/Padre/... en Familiares) con cualquier "+Otro papel" escrito a mano — mismo patrón que
-- ComplementosAnswer.selected en eventPairDecisions.ts (una lista de texto, no un catálogo cerrado en BD).
--
-- guest_member_id es un vínculo OPCIONAL y NUNCA automático a un invitado ya desglosado
-- (event_guest_members) — "¿María es María López de vuestra lista de invitados?" lo pregunta, nunca lo
-- asume por coincidencia de nombre. ON DELETE SET NULL: borrar ese invitado desglosado nunca borra la
-- persona especial/familiar, solo deja de apuntar a nadie.
create table event_role_people (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  category text not null check (category in ('especial', 'familiar')),
  name text null check (name is null or char_length(btrim(name)) between 1 and 80),
  roles text[] not null default '{}',
  guest_member_id uuid null references event_guest_members(id) on delete set null,
  sort_order bigint not null default 0,
  created_at timestamptz not null default now()
);

create index idx_event_role_people_event on event_role_people(event_id);
create index idx_event_role_people_family on event_role_people(family_id);
create index idx_event_role_people_guest_member on event_role_people(guest_member_id);

alter table event_role_people enable row level security;
create policy "event_role_people: family crud" on event_role_people for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));
