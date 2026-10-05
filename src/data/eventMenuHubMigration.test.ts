// Candado de la migración 0195 («Menú del evento»): aditiva, no borra ni reescribe ningún dato y no abre ningún
// agujero entre familias. Lee el SQL real como texto; el aislamiento real se comprobó además contra la base de
// producción con transacciones que se deshacen (ver el informe de la fase).
import { describe, expect, it } from 'vitest'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SQL = Object.entries(MIGRATIONS).find(([f]) => f.includes('0195_event_menu_hub'))?.[1] ?? ''
const CODE = SQL.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

describe('0195 — aditiva y sin tocar datos (41)', () => {
  it('existe y solo añade (alter add column / create table / create index / policy)', () => {
    expect(CODE.length).toBeGreaterThan(300)
    expect(CODE).not.toMatch(/\b(delete\s+from|truncate|drop\s+(table|column|policy)|update\s+\w+\s+set)\b/i)
  })
  it('prepared_by: nulable, solo familia|proveedor — el origen de un plato nunca se deduce del nombre', () => {
    expect(CODE).toContain("add column prepared_by text check (prepared_by is null or prepared_by in ('familia', 'proveedor'))")
  })
  it('topic: nulable, solo «comida» — la clasificación la marca la familia, no el texto de la pregunta', () => {
    expect(CODE).toContain("add column topic text check (topic is null or topic in ('comida'))")
  })
  it('event_menu_settings: una fila por evento (clave = evento), en cascada, solo preferencias de pantalla', () => {
    expect(CODE).toContain('event_id uuid primary key references events(id) on delete cascade')
    expect(CODE).toContain("sections jsonb not null default '[]'::jsonb")
    expect(CODE).not.toMatch(/event_menu_items\s*\(/) // no hay platos aquí
  })
  it('no toca las tablas de Invitados/RSVP/decisiones/necesidades: solo columnas de menú y de preguntas', () => {
    expect(CODE).not.toMatch(/alter table (?!event_menu_items|event_guest_questions|event_menu_settings)/i)
    expect(CODE).not.toMatch(/event_decisions|event_guest_dietary_needs|event_guest_members|event_menu_options|event_guests\b/)
  })
})

describe('0195 — RLS endurecida (aislamiento entre familias)', () => {
  it('event_menu_settings tiene RLS y UNA política por familia + sección de Eventos', () => {
    expect(CODE).toContain('alter table event_menu_settings enable row level security')
    expect((CODE.match(/create policy/g) ?? []).length).toBe(1)
    expect(CODE).toContain('family_id = (select private.current_family_id())')
    expect(CODE).toContain("(select private.has_section_access('eventos'))")
  })
  it('al escribir, el EVENTO también debe ser de la familia del usuario (no se puede colgar una fila de un evento ajeno)', () => {
    expect(CODE).toContain('exists (select 1 from events e where e.id = event_id and e.family_id = (select private.current_family_id()))')
  })
  it('las políticas de event_menu_items y event_guest_questions no se tocan (siguen las endurecidas de antes)', () => {
    expect(CODE).not.toMatch(/(drop|alter) policy/i)
    expect(CODE).not.toContain('on event_menu_items for')
    expect(CODE).not.toContain('on event_guest_questions for')
  })
  it('«transferred» se conserva (datos antiguos), solo deja de usarse en pantalla', () => {
    expect(CODE).not.toMatch(/transferred/)
    expect(SQL).toContain('«transferred» de event_menu_items se conserva')
  })
})
