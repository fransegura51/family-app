-- FASE CALENDARIO — un único motor (calendar_events), dos tipos: Evento y Tarea, distinguidos por
-- `kind`. NUNCA una tabla "tasks" aparte — la fusión de dos motores en uno ya se hizo una vez (la vieja
-- migración 0040, fusión de Tasks con Events) y la auditoría de esta fase es explícita: no se repite
-- ese error. Todas las filas ya existentes nacen `kind = 'event'` (default + columna NOT NULL, cambio
-- 100% aditivo). Una Tarea es, en la base de datos, un calendar_events más — sin hora propia (all_day
-- en la práctica), sin recurrencia/recordatorios por ahora (el formulario reducido no los pide, pero la
-- columna ya existe y no se restringe aquí), reutilizando exactamente las mismas tablas de miembros
-- (calendar_event_members), recordatorios, adjuntos, ubicación, nota y puntos que un Evento.
alter table calendar_events add column kind text not null default 'event';
alter table calendar_events add constraint calendar_events_kind_check check (kind in ('event', 'task'));
create index idx_calendar_events_kind on calendar_events(family_id, kind);

-- Categorías del Calendario — propias, nunca budget_categories ni tags de otro dominio (petición
-- explícita). Opcional tanto para Evento como para Tarea. El emoji es obligatorio (siempre hay algo que
-- mostrar junto al título cuando hay categoría); el color es opcional (modo de color por categorías,
-- ver profiles.calendar_color_mode más abajo, con fallback seguro cuando no hay color de categoría).
create table calendar_categories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  emoji text not null,
  color text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table calendar_categories enable row level security;

create policy "calendar_categories: family crud" on calendar_categories for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

create index idx_calendar_categories_family on calendar_categories(family_id);

-- on delete set null (nunca cascade): borrar una categoría nunca borra los Eventos/Tareas que la
-- llevaban, solo les quita la categoría.
alter table calendar_events add column category_id uuid references calendar_categories(id) on delete set null;
create index idx_calendar_events_category on calendar_events(category_id);

-- Preferencias de visualización del Calendario — POR USUARIO (profiles), nunca families ni
-- localStorage: cada persona de la familia puede ver el calendario a su manera. Mismo patrón exacto que
-- date_filter_favorite/date_filter_disabled (migración 0170) — la política RLS "profiles: update own
-- row" ya existente cubre las columnas nuevas sin tocar nada más; default seguro para que cualquier
-- fila ya existente se comporte exactamente igual que hoy hasta que la persona cambie el ajuste.
alter table profiles add column calendar_color_mode text not null default 'miembros';
alter table profiles add constraint profiles_calendar_color_mode_check check (calendar_color_mode in ('miembros', 'categorias'));
alter table profiles add column calendar_task_order text not null default 'eventos_primero';
alter table profiles add constraint profiles_calendar_task_order_check check (calendar_task_order in ('eventos_primero', 'tareas_primero'));

-- Sincronización externa de Tareas: esta fase decide que una Tarea NUNCA sincroniza con Google Calendar
-- por defecto (nunca queremos que una tarea sencilla se convierta en un evento externo de día
-- completo) — se consigue reutilizando la columna sync_to_google que calendar_events YA tiene
-- (migración 0155, ya certificada end-to-end contra el cron de Google Calendar): el formulario de Nueva
-- tarea simplemente la manda en `false` al crear. No hace falta ninguna columna nueva para esto. El día
-- de mañana, una preferencia por usuario para decidirlo caso a caso encaja sin reescritura: solo
-- cambiaría de dónde sale ese `false` (hoy fijo, entonces leído de profiles), sin tocar ni el cron ni
-- esta migración.
