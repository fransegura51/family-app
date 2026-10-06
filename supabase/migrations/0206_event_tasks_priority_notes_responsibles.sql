-- Preparativos: prioridad, nota, hora, fecha de completado, varios responsables y personas externas.
-- Aditiva: columnas nuevas NULLABLE (sin backfill; las tareas existentes quedan sin prioridad guardada hasta que
-- se editen), tablas nuevas y RLS familiar. No se borra ni se modifica ningún dato existente.
--
-- Prioridad: null = sin prioridad. priority_source distingue lo que propuso PEPA de lo que decidió el usuario:
-- una prioridad marcada por el usuario manda y PEPA no la sobrescribe en reconciliaciones.
-- priority_reason es un código corto (no texto libre) para poder reconciliar el motivo.

alter table event_tasks
  add column priority text null check (priority in ('alta', 'media', 'baja')),
  add column priority_source text null check (priority_source in ('pepa', 'usuario')),
  add column priority_reason text null check (priority_reason in ('practica', 'reserva', 'fecha_proxima', 'dependencia', 'general')),
  add column notes text null check (notes is null or char_length(notes) <= 1000),
  -- Hora opcional: sin fecha no puede haber hora (nunca se inventa 00:00).
  add column due_time time null,
  add column completed_at timestamptz null;

alter table event_tasks
  add constraint event_tasks_due_time_needs_date check (due_time is null or due_date is not null);

-- Varios responsables de la familia (además del principal assigned_member_id, que se mantiene por compatibilidad).
create table event_task_members (
  task_id uuid not null references event_tasks(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  primary key (task_id, member_id)
);

create index idx_event_task_members_member on event_task_members(member_id);

alter table event_task_members enable row level security;

create policy "event_task_members: family crud" on event_task_members for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('eventos')
    and exists (select 1 from event_tasks t where t.id = task_id and t.event_id = event_task_members.event_id and t.family_id = private.current_family_id())
    and exists (select 1 from family_members m where m.id = member_id and m.family_id = private.current_family_id())
  );

-- Personas externas: ayudan en el evento, NO tienen cuenta ni acceso a PEPA ni vínculo con Invitados.
-- Pertenecen exclusivamente a un evento.
create table event_helpers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  label text null check (label is null or char_length(label) <= 60),
  created_at timestamptz not null default now()
);

create index idx_event_helpers_event on event_helpers(event_id);

alter table event_helpers enable row level security;

create policy "event_helpers: family crud" on event_helpers for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('eventos')
    and exists (select 1 from events e where e.id = event_id and e.family_id = private.current_family_id())
  );

-- Responsables externos de una tarea. helper_id se pone a NULL si la persona se borra y se decide CONSERVAR la
-- asignación: la fila conserva el snapshot (nombre y etiqueta), así la tarea sigue mostrando «María · Hermana».
create table event_task_helpers (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references event_tasks(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  helper_id uuid null references event_helpers(id) on delete set null,
  helper_name text not null check (char_length(btrim(helper_name)) between 1 and 80),
  helper_label text null check (helper_label is null or char_length(helper_label) <= 60),
  created_at timestamptz not null default now()
);

-- Una persona activa no puede asignarse dos veces a la misma tarea.
create unique index event_task_helpers_active_unique on event_task_helpers (task_id, helper_id) where helper_id is not null;

alter table event_task_helpers enable row level security;

create policy "event_task_helpers: family crud" on event_task_helpers for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('eventos')
    and exists (select 1 from event_tasks t where t.id = task_id and t.event_id = event_task_helpers.event_id and t.family_id = private.current_family_id())
    and (helper_id is null or exists (select 1 from event_helpers h where h.id = helper_id and h.event_id = event_task_helpers.event_id and h.family_id = private.current_family_id()))
  );
