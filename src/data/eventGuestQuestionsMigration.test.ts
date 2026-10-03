import { describe, expect, it } from 'vitest'

// Eventos — "📋 Preguntas a los invitados" (reajuste de "Momentos especiales"): capacidad GENÉRICA,
// deliberadamente aparte de la elección de menú (event_menu_options/event_guest_members.menuOptionId,
// migración 0189, que sigue intacta — no se toca en esta fase). Auditado antes de escribir nada: no
// existía ningún modelo de pregunta/opción/respuesta genérico para invitados.
const FILES = import.meta.glob('/supabase/migrations/0190_event_guest_questions.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0190_event_guest_questions.sql']

describe('0190 — event_guest_questions: esquema', () => {
  it('scope solo admite "persona" o "invitacion"', () => {
    expect(MIGRATION).toContain("scope text not null check (scope in ('persona', 'invitacion'))")
  })

  it('required y active tienen default sensato (opcional por defecto, activa por defecto)', () => {
    expect(MIGRATION).toContain('required boolean not null default false')
    expect(MIGRATION).toContain('active boolean not null default true')
  })

  it('RLS: family crud, scoped a current_family_id() + has_section_access(\'eventos\')', () => {
    const block = MIGRATION.slice(MIGRATION.indexOf('create policy "event_guest_questions: family crud"'), MIGRATION.indexOf('create table event_guest_question_options'))
    expect(block).toContain('family_id = private.current_family_id() and private.has_section_access(\'eventos\')')
  })
})

describe('0190 — event_guest_question_options: esquema y RLS "hardened"', () => {
  it('question_id es obligatorio y en cascada', () => {
    expect(MIGRATION).toContain('question_id uuid not null references event_guest_questions(id) on delete cascade')
  })

  it('el "with check" exige que question_id pertenezca al MISMO event_id — nunca solo al id a secas', () => {
    const block = MIGRATION.slice(
      MIGRATION.indexOf('create policy "event_guest_question_options: family crud"'),
      MIGRATION.indexOf('create table event_guest_question_answers'),
    )
    expect(block).toContain('q.id = question_id and q.family_id = private.current_family_id() and q.event_id = event_guest_question_options.event_id')
  })
})

describe('0190 — event_guest_question_answers: guest_id siempre, member_id solo en scope "persona"', () => {
  it('guest_id obligatorio; member_id opcional (nullable), on delete cascade', () => {
    expect(MIGRATION).toContain('guest_id uuid not null references event_guests(id) on delete cascade')
    expect(MIGRATION).toContain('member_id uuid references event_guest_members(id) on delete cascade')
  })

  it('option_id es on delete set null — borrar una opción nunca borra la respuesta de nadie', () => {
    expect(MIGRATION).toContain('option_id uuid references event_guest_question_options(id) on delete set null')
  })

  it('dos índices únicos PARCIALES (nunca uno solo con NULL) garantizan como mucho una respuesta por invitación y una por persona, para poder hacer upsert sin duplicar', () => {
    expect(MIGRATION).toContain('create unique index uq_event_guest_question_answers_invitacion on event_guest_question_answers(question_id, guest_id) where member_id is null')
    expect(MIGRATION).toContain('create unique index uq_event_guest_question_answers_persona on event_guest_question_answers(question_id, member_id) where member_id is not null')
  })

  it('RLS "with check" valida question_id, guest_id, member_id (si existe) y option_id (si existe) — los 4, nunca solo el principal', () => {
    const block = MIGRATION.slice(MIGRATION.indexOf('create policy "event_guest_question_answers: family crud"'), MIGRATION.length)
    expect(block).toContain('q.id = question_id and q.family_id = private.current_family_id() and q.event_id = event_guest_question_answers.event_id')
    expect(block).toContain('g.id = guest_id and g.family_id = private.current_family_id() and g.event_id = event_guest_question_answers.event_id')
    expect(block).toContain('m.id = member_id and m.guest_id = event_guest_question_answers.guest_id and m.event_id = event_guest_question_answers.event_id')
    expect(block).toContain('o.id = option_id and o.question_id = event_guest_question_answers.question_id and o.event_id = event_guest_question_answers.event_id')
  })
})

describe('0190 — no toca event_guests/event_guest_members/su RLS, ni event_menu_options (Parte B) — solo añade tablas nuevas que las REFERENCIAN', () => {
  it('nunca hace ALTER TABLE sobre event_guests/event_guest_members/event_menu_options', () => {
    expect(MIGRATION).not.toMatch(/alter table event_guests\b/)
    expect(MIGRATION).not.toMatch(/alter table event_guest_members\b/)
    expect(MIGRATION).not.toMatch(/alter table event_menu_options\b/)
  })

  it('nunca borra ni recrea las políticas de event_guests/event_guest_members', () => {
    expect(MIGRATION).not.toContain('drop policy "event_guests: family crud"')
    expect(MIGRATION).not.toContain('drop policy "event_guest_members: family crud"')
  })
})

describe('capa de datos: src/data/events.ts — solo CRUD de preguntas/opciones, nunca de respuestas', () => {
  const APP = import.meta.glob('/src/data/events.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const SRC = APP['/src/data/events.ts']

  it('GUEST_QUESTION_SELECT/GUEST_QUESTION_OPTION_SELECT piden exactamente las columnas de la migración', () => {
    expect(SRC).toContain("const GUEST_QUESTION_SELECT = 'id, event_id, family_id, prompt, scope, required, active, sort_order, created_at'")
    expect(SRC).toContain("const GUEST_QUESTION_OPTION_SELECT = 'id, question_id, event_id, family_id, label, sort_order, created_at'")
  })

  it('addEventGuestQuestion devuelve la fila creada (select().single()) — para poder encadenar addEventGuestQuestionOption con su id', () => {
    const start = SRC.indexOf('export async function addEventGuestQuestion(')
    const body = SRC.slice(start, SRC.indexOf('\nexport async function updateEventGuestQuestion', start))
    expect(body).toContain('.select(GUEST_QUESTION_SELECT)')
    expect(body).toContain('.single()')
  })

  it('ninguna función de este archivo ESCRIBE en event_guest_question_answers — las respuestas solo las escribe el RSVP público (rol de servicio); sí se permite una lectura agregada (getEventGuestQuestionAnswerStats, para decidir si editar una pregunta es seguro)', () => {
    expect(SRC).not.toContain("from('event_guest_question_answers').insert")
    expect(SRC).not.toContain("from('event_guest_question_answers').update")
    expect(SRC).not.toContain("from('event_guest_question_answers').delete")
    const start = SRC.indexOf('export async function getEventGuestQuestionAnswerStats(')
    expect(start).toBeGreaterThan(-1)
    const body = SRC.slice(start, SRC.indexOf('\n}', start))
    expect(body).toContain("from('event_guest_question_answers').select('option_id')")
  })

  it('deleteEventGuestQuestion borra la pregunta entera (cascada se lleva opciones y respuestas, por la propia migración)', () => {
    const start = SRC.indexOf('export async function deleteEventGuestQuestion(')
    expect(start).toBeGreaterThan(-1)
    const body = SRC.slice(start, start + 200)
    expect(body).toContain("supabase.from('event_guest_questions').delete().eq('id', id)")
  })
})
