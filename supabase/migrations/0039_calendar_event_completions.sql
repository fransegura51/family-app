-- Marcar un evento del calendario como "hecho" (petición real: "quiero
-- un botón que ponga hecho al lado de cada tarea o cada evento") — las
-- tareas ya tenían task_completions; a los eventos de calendario les
-- faltaba el mismo concepto. Por ocurrencia (event_id + fecha), no por
-- evento entero, porque un evento recurrente ("bajar la basura todos
-- los martes") se marca hecho un día sin afectar a los demás.
create table calendar_event_completions (
  event_id uuid not null references calendar_events(id) on delete cascade,
  occurrence_date date not null,
  completed_at timestamptz not null default now(),
  primary key (event_id, occurrence_date)
);

alter table calendar_event_completions enable row level security;

create policy "calendar_event_completions: family crud"
  on calendar_event_completions for all
  using (exists (select 1 from calendar_events e where e.id = event_id and e.family_id = private.current_family_id()))
  with check (exists (select 1 from calendar_events e where e.id = event_id and e.family_id = private.current_family_id()));

create index idx_calendar_event_completions_event on calendar_event_completions(event_id);
