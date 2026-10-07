-- Preparativos — PEPA sigue vigilando una prioridad fijada por el usuario (incluida «Sin prioridad») y
-- puede PROPONER un cambio con motivo, nunca sobrescribir sola. Estado estructurado (nunca solo una
-- frase): basta con el fingerprint para saber si una propuesta ya se mostró/rechazó para ESTE contexto.
create table event_task_priority_suggestions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references event_tasks(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,

  current_priority text null check (current_priority is null or current_priority in ('alta', 'media', 'baja')),
  proposed_priority text not null check (proposed_priority in ('alta', 'media', 'baja')),
  reason text not null check (reason in ('practica', 'reserva', 'fecha_proxima', 'dependencia', 'general')),
  -- Resume qué provocó la propuesta (señal + franja de urgencia) — mientras no cambie, es el MISMO
  -- contexto: una propuesta ya rechazada con el mismo fingerprint no debe volver a crearse.
  context_fingerprint text not null,

  status text not null default 'pendiente' check (status in ('pendiente', 'aceptada', 'rechazada', 'resuelta')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  constraint event_task_priority_suggestions_resolved_at check ((status = 'pendiente') = (resolved_at is null))
);

create index idx_event_task_priority_suggestions_task on event_task_priority_suggestions(task_id);
create index idx_event_task_priority_suggestions_event on event_task_priority_suggestions(event_id);
-- Como mucho una propuesta pendiente por tarea: una propuesta nueva mientras ya hay una pendiente
-- ACTUALIZA esa misma fila (ver ensureTaskPrioritySuggestions) en vez de crear una segunda.
create unique index event_task_priority_suggestions_one_open_per_task on event_task_priority_suggestions(task_id) where status = 'pendiente';

alter table event_task_priority_suggestions enable row level security;
create policy "event_task_priority_suggestions: family crud" on event_task_priority_suggestions for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));
