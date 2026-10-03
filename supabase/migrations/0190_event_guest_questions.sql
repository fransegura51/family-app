-- Eventos — "📋 Preguntas a los invitados": capacidad GENÉRICA, independiente de la elección de menú
-- (event_menu_options/event_guest_members.menu_option_id, migración 0189, que sigue intacta y con su
-- propia semántica — no se toca aquí). Permite a la familia definir sus propias preguntas de opción
-- múltiple para el RSVP (p. ej. "¿Qué preferís de postre?"), cada una respondida por PERSONA o por
-- INVITACIÓN/familia entera, obligatoria u opcional. Auditado antes de escribir nada: no existía ningún
-- modelo de pregunta/opción/respuesta genérico para invitados — solo la elección de menú, que es
-- deliberadamente su propio sistema (ligado a la futura fase "Comida y celebración") y no se reutiliza
-- aquí para no mezclar semánticas.
--
-- Tres tablas, mismo patrón "hardened" que event_menu_options/event_guest_members (0189): RLS por
-- family_id + has_section_access('eventos'), y el "with check" de escritura exige además que las claves
-- foráneas (question_id/guest_id/member_id/option_id) pertenezcan al MISMO event_id — nunca solo al id a
-- secas, para que el rol de servicio del RSVP público nunca pueda mezclar preguntas/invitados de otro
-- evento o de otra familia.

create table event_guest_questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  prompt text not null,
  scope text not null check (scope in ('persona', 'invitacion')),
  required boolean not null default false,
  active boolean not null default true,
  sort_order bigint not null default 0,
  created_at timestamptz not null default now()
);

create index idx_event_guest_questions_event on event_guest_questions(event_id);
create index idx_event_guest_questions_family on event_guest_questions(family_id);

alter table event_guest_questions enable row level security;
create policy "event_guest_questions: family crud" on event_guest_questions for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

create table event_guest_question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references event_guest_questions(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  label text not null,
  sort_order bigint not null default 0,
  created_at timestamptz not null default now()
);

create index idx_event_guest_question_options_question on event_guest_question_options(question_id);
create index idx_event_guest_question_options_event on event_guest_question_options(event_id);

alter table event_guest_question_options enable row level security;
create policy "event_guest_question_options: family crud" on event_guest_question_options for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('eventos')
    and exists (
      select 1 from event_guest_questions q
      where q.id = question_id and q.family_id = private.current_family_id() and q.event_id = event_guest_question_options.event_id
    )
  );

-- guest_id SIEMPRE se guarda (incluso para scope "persona": es la unidad a la que pertenece esa persona),
-- member_id solo cuando scope = "persona". Dos índices únicos parciales (nunca una sola columna
-- nullable con unique normal, que trataría cada NULL como distinto) garantizan como mucho una respuesta
-- por invitación cuando no hay persona, y como mucho una por persona cuando sí la hay — así el RSVP puede
-- hacer upsert sin duplicar filas al reabrir el enlace y cambiar una respuesta.
create table event_guest_question_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references event_guest_questions(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  guest_id uuid not null references event_guests(id) on delete cascade,
  member_id uuid references event_guest_members(id) on delete cascade,
  option_id uuid references event_guest_question_options(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uq_event_guest_question_answers_invitacion on event_guest_question_answers(question_id, guest_id) where member_id is null;
create unique index uq_event_guest_question_answers_persona on event_guest_question_answers(question_id, member_id) where member_id is not null;
create index idx_event_guest_question_answers_event on event_guest_question_answers(event_id);
create index idx_event_guest_question_answers_guest on event_guest_question_answers(guest_id);

alter table event_guest_question_answers enable row level security;
create policy "event_guest_question_answers: family crud" on event_guest_question_answers for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('eventos')
    and exists (
      select 1 from event_guest_questions q
      where q.id = question_id and q.family_id = private.current_family_id() and q.event_id = event_guest_question_answers.event_id
    )
    and exists (
      select 1 from event_guests g
      where g.id = guest_id and g.family_id = private.current_family_id() and g.event_id = event_guest_question_answers.event_id
    )
    and (
      member_id is null
      or exists (
        select 1 from event_guest_members m
        where m.id = member_id and m.guest_id = event_guest_question_answers.guest_id and m.event_id = event_guest_question_answers.event_id
      )
    )
    and (
      option_id is null
      or exists (
        select 1 from event_guest_question_options o
        where o.id = option_id and o.question_id = event_guest_question_answers.question_id and o.event_id = event_guest_question_answers.event_id
      )
    )
  );
