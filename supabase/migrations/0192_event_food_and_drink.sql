-- Eventos — fase "🍽️ Comida y bebida" del configurador. Auditado antes de escribir nada (ver informe de
-- la fase): lo que YA existía y se REUTILIZA sin tocar su semántica —
--   · event_decisions / decision_id en tareas, presupuesto, proveedores y plan del día (0176) → todas las
--     preguntas nuevas viven ahí (block_key 'comida' y 'lugar_servicios'), sin tabla nueva para decisiones;
--   · event_menu_items (0106) → se EXTIENDE de forma compatible (columnas nuevas todas nulables o con
--     valor por defecto) en vez de crear una tabla paralela de "platos del menú oficial";
--   · event_menu_options + event_guest_members.menu_option_id (0189) → solo se le añade a quién va
--     dirigida cada opción; ninguna fila existente cambia de significado;
--   · recipes (0008), el bucket privado y el patrón de políticas de storage de 0171.
-- Lo que SÍ es nuevo y no existía: documentos de comida (foto/PDF de un menú), necesidades alimentarias
-- estructuradas por persona, y el destinatario (adultos/niños/todos) de una opción de menú.

-- ---------------------------------------------------------------------
-- 1) Opciones de menú: a quién van dirigidas. Por defecto 'todos' — ninguna opción ya creada cambia de
--    comportamiento (hoy no existe ninguna fila real, pero el valor por defecto lo garantiza igualmente).
-- ---------------------------------------------------------------------
alter table event_menu_options add column audience text not null default 'todos'
  check (audience in ('todos', 'adultos', 'ninos'));

-- ---------------------------------------------------------------------
-- 2) Documentos de comida (foto/PDF de un menú, carta, propuesta de catering...). El documento original
--    NUNCA se borra al importar: la importación propone, la familia revisa y solo entonces se guardan los
--    platos, que conservan la referencia (event_menu_items.document_id) a este original.
-- ---------------------------------------------------------------------
create table event_food_documents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  kind text not null default 'menu_principal'
    check (kind in ('menu_principal', 'menu_infantil', 'coctel', 'bebidas', 'recena', 'propuesta_catering', 'otro')),
  storage_path text not null,
  original_name text,
  mime_type text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_event_food_documents_event on event_food_documents(event_id);
create index idx_event_food_documents_family on event_food_documents(family_id);

alter table event_food_documents enable row level security;
create policy "event_food_documents: family crud" on event_food_documents for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('eventos')
    and exists (select 1 from events e where e.id = event_id and e.family_id = private.current_family_id())
    -- La ruta del archivo debe vivir en la carpeta de la propia familia (misma regla que el bucket).
    and (storage.foldername(storage_path))[1] = private.current_family_id()::text
  );

insert into storage.buckets (id, name, public)
values ('event_food_documents', 'event_food_documents', false)
on conflict (id) do nothing;

create policy "event_food_documents storage: family select" on storage.objects for select
  using (bucket_id = 'event_food_documents' and (storage.foldername(name))[1] = private.current_family_id()::text);

create policy "event_food_documents storage: family insert" on storage.objects for insert
  with check (bucket_id = 'event_food_documents' and (storage.foldername(name))[1] = private.current_family_id()::text);

create policy "event_food_documents storage: family delete" on storage.objects for delete
  using (bucket_id = 'event_food_documents' and (storage.foldername(name))[1] = private.current_family_id()::text);

-- ---------------------------------------------------------------------
-- 3) event_menu_items — extensión COMPATIBLE. "category" ya guardaba la sección ("Aperitivo", "Postre",
--    "Bebidas"... ver MENU_PLAN_TEMPLATES) y sigue siendo la sección del plato; "name" sigue siendo el plato.
--    Columnas nuevas (todas opcionales): receta enlazada (nunca obligatoria), nota del plato, de dónde viene
--    (a mano o importado de un documento) y el documento original. Ninguna fila existente se modifica.
-- ---------------------------------------------------------------------
alter table event_menu_items add column recipe_id uuid references recipes(id) on delete set null;
alter table event_menu_items add column notes text;
alter table event_menu_items add column source text not null default 'manual' check (source in ('manual', 'importado'));
alter table event_menu_items add column document_id uuid references event_food_documents(id) on delete set null;
alter table event_menu_items add column updated_at timestamptz not null default now();

create index idx_event_menu_items_recipe on event_menu_items(recipe_id) where recipe_id is not null;
create index idx_event_menu_items_document on event_menu_items(document_id) where document_id is not null;

-- RLS "hardened" (mismo patrón que 0176/0189): la receta enlazada debe ser de la MISMA familia y el documento
-- del MISMO evento y familia. Solo se endurece la escritura; la lectura queda exactamente igual.
drop policy "event_menu_items: family crud" on event_menu_items;
create policy "event_menu_items: family crud" on event_menu_items for all
  using (
    family_id = (select private.current_family_id())
    and (select private.has_section_access('eventos'))
  )
  with check (
    family_id = (select private.current_family_id())
    and (select private.has_section_access('eventos'))
    and (
      recipe_id is null
      or exists (select 1 from recipes r where r.id = recipe_id and r.family_id = (select private.current_family_id()))
    )
    and (
      document_id is null
      or exists (
        select 1 from event_food_documents d
        where d.id = document_id and d.family_id = (select private.current_family_id()) and d.event_id = event_menu_items.event_id
      )
    )
  );

-- ---------------------------------------------------------------------
-- 4) Necesidades alimentarias estructuradas por PERSONA. Separa lo DECLARADO (original_text, nunca se
--    sobrescribe) de la clasificación OPERATIVA de PEPA (category) y de su tipo (kind), solo cuando se puede
--    determinar con seguridad. Es para ORGANIZAR el evento, no un diagnóstico: celiaquía, alergia al trigo y
--    preferencia sin gluten NO son equivalentes médicamente — por eso "kind" las distingue cuando el texto
--    lo dice, y "category" solo dice qué hay que vigilar en el menú.
--    guest_id identifica siempre la unidad invitada; member_id (opcional) la persona concreta dentro de ella.
--    "source": 'organizador' (lo registró quien organiza), 'invitado_nota' (sugerencia detectada en la nota
--    del invitado y CONFIRMADA por quien organiza) o 'rsvp' (reservado para una futura captura estructurada
--    en el RSVP — todavía no se escribe desde ninguna parte).
-- ---------------------------------------------------------------------
create table event_guest_dietary_needs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  guest_id uuid not null references event_guests(id) on delete cascade,
  member_id uuid references event_guest_members(id) on delete cascade,
  original_text text not null,
  category text not null
    check (category in ('gluten', 'lactosa', 'lacteos', 'huevo', 'frutos_secos', 'cacahuete', 'marisco', 'pescado', 'soja', 'vegetariano', 'vegano', 'sin_cerdo', 'sin_alcohol', 'otra')),
  kind text check (kind is null or kind in ('alergia', 'intolerancia', 'celiaquia', 'preferencia', 'dieta', 'otro')),
  source text not null default 'organizador' check (source in ('organizador', 'invitado_nota', 'rsvp')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_event_guest_dietary_needs_event on event_guest_dietary_needs(event_id);
create index idx_event_guest_dietary_needs_family on event_guest_dietary_needs(family_id);
create index idx_event_guest_dietary_needs_guest on event_guest_dietary_needs(guest_id);

alter table event_guest_dietary_needs enable row level security;
create policy "event_guest_dietary_needs: family crud" on event_guest_dietary_needs for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('eventos')
    and exists (
      select 1 from event_guests g
      where g.id = guest_id and g.family_id = private.current_family_id() and g.event_id = event_guest_dietary_needs.event_id
    )
    and (
      member_id is null
      or exists (
        select 1 from event_guest_members m
        where m.id = member_id and m.guest_id = event_guest_dietary_needs.guest_id and m.family_id = private.current_family_id()
      )
    )
  );
