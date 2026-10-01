-- Eventos — Fase 1 de la ampliación "Cómo queréis que sea vuestro evento": infraestructura del motor de
-- decisiones y del modelo genérico de momentos, SIN ninguna UI ni generación automática todavía (plan de
-- fases aprobado tras auditoría completa del módulo). Tres piezas, ninguna visible para la familia hasta
-- que se construya la UI en una fase posterior:
--
-- 1) event_decisions: una fila por pregunta respondida del futuro configurador. No la usa todavía ningún
--    formulario — solo se deja lista la tabla y las funciones de datos (src/data/events.ts).
-- 2) decision_id (FK real, nunca "target_table + target_id" polimórfico) en las 5 tablas que el motor
--    podrá generar más adelante: event_tasks (preparativos), event_budget_items (presupuesto),
--    event_providers (proveedores), event_decoration_items (decoración), event_day_plan_items (plan).
--    event_menu_items/event_activities quedan fuera a propósito: ya los rellena generateEventPlan
--    ("Organízamelo Pepa"), un mecanismo existente y distinto, de aplicar-una-vez, sin la semántica de
--    "decisión revisable" de este motor nuevo. event_favor_items/event_special_details quedan fuera
--    también a propósito: su paso por el motor de decisiones es una fase futura (no esta), y añadir la
--    columna ahora sin ningún escritor real sería especular sobre un diseño que todavía puede cambiar.
-- 3) event_moments + event_guest_moments: modelo genérico de "momento" (fecha/hora/lugar propios) que
--    sustituirá en la UI a los campos fijos ceremony_location_*/celebration_location_* y al invite_scope
--    cerrado de event_guests — pero SIN tocar ni borrar ninguno de esos campos todavía. Un evento antiguo
--    sigue comportándose exactamente igual que hoy: resolveEventMoments/resolveGuestInvitedMoments
--    (src/domain/events.ts) sintetizan los momentos "legacy" al vuelo a partir de los campos heredados
--    cuando event_moments está vacío para ese evento, así que la compatibilidad no depende solo del
--    backfill de más abajo — sigue funcionando aunque un evento se edite después por "Gestionar evento"
--    (que en esta fase sigue escribiendo únicamente los campos heredados) antes de que exista la Fase 2.

create table event_decisions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  block_key text not null,
  question_key text not null,
  answer jsonb not null default '{}'::jsonb,
  is_custom_option boolean not null default false,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_event_decisions_event on event_decisions(event_id);
create index idx_event_decisions_family on event_decisions(family_id);

alter table event_decisions enable row level security;
create policy "event_decisions: family crud" on event_decisions for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

-- decision_id: FK real con ON DELETE SET NULL — borrar la decisión nunca borra el elemento generado, solo
-- deja de "saber" quién lo generó (el elemento se queda como si se hubiera añadido a mano). Nullable en
-- las 5 tablas: todo lo creado hasta hoy, y todo lo que se cree a mano en el futuro, se queda en NULL.

alter table event_tasks add column decision_id uuid references event_decisions(id) on delete set null;
create index idx_event_tasks_decision on event_tasks(decision_id);

alter table event_budget_items add column decision_id uuid references event_decisions(id) on delete set null;
create index idx_event_budget_items_decision on event_budget_items(decision_id);

alter table event_providers add column decision_id uuid references event_decisions(id) on delete set null;
create index idx_event_providers_decision on event_providers(decision_id);

alter table event_decoration_items add column decision_id uuid references event_decisions(id) on delete set null;
create index idx_event_decoration_items_decision on event_decoration_items(decision_id);

alter table event_day_plan_items add column decision_id uuid references event_decisions(id) on delete set null;
create index idx_event_day_plan_items_decision on event_day_plan_items(decision_id);

-- Endurece las 5 políticas ya existentes (mismo patrón "hardened" que ya usa event_guest_members en
-- 0164_event_guest_members.sql): decision_id, cuando no es null, debe pertenecer al MISMO evento y a la
-- MISMA familia que la fila que lo usa — nunca una decisión de otro evento de la misma familia. Solo se
-- toca el "with check" (escritura); el "using" (lectura) se deja exactamente igual que hoy.

drop policy "event_tasks: family crud" on event_tasks;
create policy "event_tasks: family crud" on event_tasks for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id() and private.has_section_access('eventos')
    and (decision_id is null or exists (select 1 from event_decisions d where d.id = decision_id and d.family_id = private.current_family_id() and d.event_id = event_tasks.event_id))
  );

drop policy "event_budget_items: family crud" on event_budget_items;
create policy "event_budget_items: family crud" on event_budget_items for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id() and private.has_section_access('eventos')
    and (decision_id is null or exists (select 1 from event_decisions d where d.id = decision_id and d.family_id = private.current_family_id() and d.event_id = event_budget_items.event_id))
  );

drop policy "event_providers: family crud" on event_providers;
create policy "event_providers: family crud" on event_providers for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id() and private.has_section_access('eventos')
    and (decision_id is null or exists (select 1 from event_decisions d where d.id = decision_id and d.family_id = private.current_family_id() and d.event_id = event_providers.event_id))
  );

drop policy "event_decoration_items: family crud" on event_decoration_items;
create policy "event_decoration_items: family crud" on event_decoration_items for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id() and private.has_section_access('eventos')
    and (decision_id is null or exists (select 1 from event_decisions d where d.id = decision_id and d.family_id = private.current_family_id() and d.event_id = event_decoration_items.event_id))
  );

drop policy "event_day_plan_items: family crud" on event_day_plan_items;
create policy "event_day_plan_items: family crud" on event_day_plan_items for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id() and private.has_section_access('eventos')
    and (decision_id is null or exists (select 1 from event_decisions d where d.id = decision_id and d.family_id = private.current_family_id() and d.event_id = event_day_plan_items.event_id))
  );

-- Momentos genéricos (fecha/hora/lugar propios) — sustituirán en la UI a ceremony_location_*/
-- celebration_location_* y a event_guests.invite_scope, pero esos campos NO se tocan ni se borran en esta
-- fase (ver cabecera). moment_date es independiente de events.event_date a propósito: permite un evento de
-- varios días (ej. matrimonio civil el viernes, celebración el sábado) sin cambiar el significado del
-- campo principal del evento, que se conserva tal cual para compatibilidad.
create table event_moments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  moment_date date,
  moment_time time,
  location_label text,
  location_latitude double precision,
  location_longitude double precision,
  sort_order bigint not null default 0,
  created_at timestamptz not null default now()
);

create index idx_event_moments_event on event_moments(event_id);
create index idx_event_moments_family on event_moments(family_id);

alter table event_moments enable row level security;
create policy "event_moments: family crud" on event_moments for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

-- Invitado <-> momento, muchos a muchos. "on delete cascade" en moment_id es lo que garantiza que borrar
-- un momento nunca deja una relación con un invitado apuntando a un momento inexistente — no hace falta
-- limpiarlo a mano en ningún sitio. RLS "hardened" igual que event_guest_members (0164): guest_id y
-- moment_id deben pertenecer al MISMO evento y a la MISMA familia que esta fila, nunca a otro evento de la
-- misma familia.
create table event_guest_moments (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references event_guests(id) on delete cascade,
  moment_id uuid not null references event_moments(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (guest_id, moment_id)
);

create index idx_event_guest_moments_guest on event_guest_moments(guest_id);
create index idx_event_guest_moments_moment on event_guest_moments(moment_id);
create index idx_event_guest_moments_event on event_guest_moments(event_id);
create index idx_event_guest_moments_family on event_guest_moments(family_id);

alter table event_guest_moments enable row level security;
create policy "event_guest_moments: family crud" on event_guest_moments for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('eventos')
    and exists (select 1 from event_guests g where g.id = guest_id and g.family_id = private.current_family_id() and g.event_id = event_guest_moments.event_id)
    and exists (select 1 from event_moments m where m.id = moment_id and m.family_id = private.current_family_id() and m.event_id = event_guest_moments.event_id)
  );

-- Backfill NO destructivo: crea momentos "Ceremonia"/"Celebración" reales para eventos que YA tienen esos
-- datos en los campos heredados. Idempotente (el "where not exists" evita duplicar si por lo que sea se
-- repite), seguro sobre eventos incompletos (nunca crea un momento sin datos reales), y no depende del
-- tipo de evento — se guía solo por qué campos tienen datos de verdad, más robusto que filtrar por
-- comunión/bautizo/boda.
insert into event_moments (event_id, family_id, title, moment_date, moment_time, location_label, location_latitude, location_longitude, sort_order)
select e.id, e.family_id, 'Ceremonia', e.event_date, e.ceremony_time, e.ceremony_location_label, e.ceremony_location_latitude, e.ceremony_location_longitude, 0
from events e
where e.ceremony_location_label is not null
  and not exists (select 1 from event_moments m where m.event_id = e.id and m.title = 'Ceremonia');

insert into event_moments (event_id, family_id, title, moment_date, moment_time, location_label, location_latitude, location_longitude, sort_order)
select e.id, e.family_id, 'Celebración', e.event_date, e.event_time, e.celebration_location_label, e.celebration_location_latitude, e.celebration_location_longitude, 1
from events e
where e.celebration_location_label is not null
  and not exists (select 1 from event_moments m where m.event_id = e.id and m.title = 'Celebración');

-- Backfill de event_guest_moments a partir de invite_scope — solo cuando el momento correspondiente
-- existe de verdad (si un evento solo tenía ceremonia, un invitado "ambas" solo se enlaza a Ceremonia).
insert into event_guest_moments (guest_id, moment_id, event_id, family_id)
select g.id, m.id, g.event_id, g.family_id
from event_guests g
join event_moments m on m.event_id = g.event_id and m.title = 'Ceremonia'
where g.invite_scope in ('ambas', 'solo_ceremonia')
  and not exists (select 1 from event_guest_moments gm where gm.guest_id = g.id and gm.moment_id = m.id);

insert into event_guest_moments (guest_id, moment_id, event_id, family_id)
select g.id, m.id, g.event_id, g.family_id
from event_guests g
join event_moments m on m.event_id = g.event_id and m.title = 'Celebración'
where g.invite_scope in ('ambas', 'solo_celebracion')
  and not exists (select 1 from event_guest_moments gm where gm.guest_id = g.id and gm.moment_id = m.id);
