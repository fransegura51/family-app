-- «Menú del evento» (antes «Menú y compra»): espacio operativo del menú. Todo ADITIVO.
--
--  · event_menu_items.prepared_by — quién se encarga de ESTE plato cuando el evento es mixto («combinaremos varias
--    opciones»): 'familia' | 'proveedor'. null = sin indicar. Nunca se deduce del nombre del plato. En eventos no
--    mixtos el origen sale de la decisión «¿Quién se encargará de la comida?» y esta columna no se usa.
--  · event_menu_settings — qué secciones del menú quiere ver este evento, en qué orden y cuáles ha ocultado o
--    creado la familia (una fila por evento; el contenido son solo preferencias de pantalla, nunca platos). Ocultar
--    una sección jamás borra platos.
--  · event_guest_questions.topic — clasificación ESTRUCTURADA de una pregunta a los invitados: 'comida' o null
--    (sin clasificar). La marca la familia a mano; PEPA nunca la deduce del texto de la pregunta.
--
-- «transferred» de event_menu_items se conserva tal cual (datos antiguos), pero la pantalla ya no traspasa
-- platos enteros a Compras: solo los ingredientes de una RECETA que la familia elige, con el selector de Recetas.

alter table event_menu_items
  add column prepared_by text check (prepared_by is null or prepared_by in ('familia', 'proveedor'));

alter table event_guest_questions
  add column topic text check (topic is null or topic in ('comida'));

create table event_menu_settings (
  event_id uuid primary key references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  sections jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index idx_event_menu_settings_family on event_menu_settings(family_id);

alter table event_menu_settings enable row level security;

-- Mismo patrón endurecido que 0176/0189: la fila debe ser de la familia del usuario Y el evento también.
create policy "event_menu_settings: family crud" on event_menu_settings for all
  using (
    family_id = (select private.current_family_id())
    and (select private.has_section_access('eventos'))
  )
  with check (
    family_id = (select private.current_family_id())
    and (select private.has_section_access('eventos'))
    and exists (select 1 from events e where e.id = event_id and e.family_id = (select private.current_family_id()))
  );
