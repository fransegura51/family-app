-- Marcar "hecho" o borrar una nota importada de un calendario externo
-- (Google/Outlook/...), igual que ya se puede con las notas propias
-- de la app — petición real: "las notas que se exportan de los
-- calendarios de Google al calendario nuestro... que tengamos la
-- opción de eliminarlas o marcarlas como hecho, igual que las otras
-- notas". Antes eran de solo lectura.
--
-- OJO: sync-external-calendar y sync-external-calendars-cron BORRAN y
-- vuelven a INSERTAR todos los eventos de un feed en cada
-- sincronización (el .ics no trae "borrados" explícitos, así que
-- reemplazar es la única forma fiable de reflejar cambios) — el `id`
-- de cada fila cambia cada vez. Por eso este estado NO puede
-- guardarse contra ese `id`: se guarda contra (feed_id, uid,
-- occurrence_date), donde `uid` es el identificador del propio evento
-- dentro del .ics, que sí es estable entre sincronizaciones.
create table external_calendar_event_dismissals (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references external_calendar_feeds(id) on delete cascade,
  uid text not null,
  -- null = toda la serie borrada (equivalente a "toda la serie" en
  -- los eventos propios); con fecha = solo esa ocurrencia.
  occurrence_date date,
  dismissed_at timestamptz not null default now(),
  unique (feed_id, uid, occurrence_date)
);

create table external_calendar_event_completions (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references external_calendar_feeds(id) on delete cascade,
  uid text not null,
  occurrence_date date not null,
  completed_at timestamptz not null default now(),
  unique (feed_id, uid, occurrence_date)
);

alter table external_calendar_event_dismissals enable row level security;
alter table external_calendar_event_completions enable row level security;

create policy "external_calendar_event_dismissals: family crud"
  on external_calendar_event_dismissals for all
  using (exists (select 1 from external_calendar_feeds f where f.id = feed_id and f.family_id = private.current_family_id()))
  with check (exists (select 1 from external_calendar_feeds f where f.id = feed_id and f.family_id = private.current_family_id()));

create policy "external_calendar_event_completions: family crud"
  on external_calendar_event_completions for all
  using (exists (select 1 from external_calendar_feeds f where f.id = feed_id and f.family_id = private.current_family_id()))
  with check (exists (select 1 from external_calendar_feeds f where f.id = feed_id and f.family_id = private.current_family_id()));

create index idx_external_dismissals_feed on external_calendar_event_dismissals(feed_id, uid);
create index idx_external_completions_feed on external_calendar_event_completions(feed_id, uid);
