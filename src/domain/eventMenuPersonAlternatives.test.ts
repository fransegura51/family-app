import { describe, expect, it } from 'vitest'
import { findMenuConflicts } from '@/domain/eventDietaryNeeds'
import { alternativeConflicts, alternativeKey, personConflictRows } from '@/domain/eventMenuHub'
import { makeGuest, makeMenuItem, makeNeed } from '@/domain/eventFoodFixtures'
import { REVIEW_STATUS_LABELS } from '@/domain/eventMenuHub'

// «Menú del evento» (2.ª tanda): conflictos desglosados POR COMENSAL y alternativas que se vuelven a comprobar.
const MIGRATION_FILES = import.meta.glob('/supabase/migrations/0199_event_menu_person_alternatives.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const MIGRATION = MIGRATION_FILES['/supabase/migrations/0199_event_menu_person_alternatives.sql']

const guests = [makeGuest({ id: 'g1', displayName: 'Familia Ramón' })]
const members = [
  { id: 'm-jorge', guestId: 'g1', eventId: 'e1', familyId: 'f1', name: 'Jorge', personType: 'adulto', tableId: null, sortOrder: 1 },
  { id: 'm-ana', guestId: 'g1', eventId: 'e1', familyId: 'f1', name: 'Ana', personType: 'adulto', tableId: null, sortOrder: 2 },
] as never

describe('conflictos por comensal — cada persona tiene su fila, el plato general no cambia', () => {
  it('una alergia al marisco de Jorge produce una fila «Jorge (Familia Ramón)» · «Sin marisco · Alergia»', () => {
    const needs = [makeNeed({ id: 'n-jorge', guestId: 'g1', memberId: 'm-jorge', category: 'marisco', kind: 'alergia' })]
    const conflicts = findMenuConflicts([makeMenuItem({ id: 'd1', name: 'Gambas blancas cocidas' })], needs)
    const [row] = personConflictRows(conflicts, needs, guests, members)
    expect(row).toMatchObject({ dishId: 'd1', needId: 'n-jorge', personLabel: 'Jorge (Familia Ramón)', detail: 'Sin marisco · Alergia' })
  })

  it('cada persona con la misma necesidad aparece por separado (alternativa propia para cada una)', () => {
    const needs = [
      makeNeed({ id: 'n-jorge', guestId: 'g1', memberId: 'm-jorge', category: 'marisco', kind: 'alergia' }),
      makeNeed({ id: 'n-ana', guestId: 'g1', memberId: 'm-ana', category: 'marisco', kind: 'intolerancia' }),
    ]
    const conflicts = findMenuConflicts([makeMenuItem({ id: 'd1', name: 'Gambas' })], needs)
    const rows = personConflictRows(conflicts, needs, guests, members)
    expect(rows.map((r) => r.needId).sort()).toEqual(['n-ana', 'n-jorge'])
  })

  it('las necesidades de la misma persona viajan juntas para re-comprobar la alternativa', () => {
    const needs = [
      makeNeed({ id: 'n-jorge', guestId: 'g1', memberId: 'm-jorge', category: 'marisco', kind: 'alergia' }),
      makeNeed({ id: 'n-jorge-2', guestId: 'g1', memberId: 'm-jorge', category: 'gluten', kind: 'celiaquia' }),
      makeNeed({ id: 'n-ana', guestId: 'g1', memberId: 'm-ana', category: 'gluten', kind: 'preferencia' }),
    ]
    const conflicts = findMenuConflicts([makeMenuItem({ id: 'd1', name: 'Gambas' })], needs)
    const [jorge] = personConflictRows(conflicts, needs, guests, members).filter((r) => r.needId === 'n-jorge')
    expect(jorge.personNeeds.map((n) => n.id).sort()).toEqual(['n-jorge', 'n-jorge-2'])
  })
})

describe('alternativas — se vuelven a comprobar; nunca se presentan como seguras', () => {
  const jorgeNeeds = [makeNeed({ id: 'n-jorge', guestId: 'g1', memberId: 'm-jorge', category: 'marisco', kind: 'alergia' })]

  it('una alternativa sin conflicto detectable devuelve lista vacía (que NO significa segura)', () => {
    expect(alternativeConflicts('Pollo asado con patatas', jorgeNeeds)).toEqual([])
  })

  it('una alternativa que vuelve a chocar con la necesidad de esa persona se advierte', () => {
    const found = alternativeConflicts('Cóctel de gambas', jorgeNeeds)
    expect(found.map((c) => c.category)).toEqual(['marisco'])
  })

  it('la clave (plato, necesidad) identifica una alternativa concreta', () => {
    expect(alternativeKey('d1', 'n-jorge')).toBe('d1:n-jorge')
    expect(alternativeKey('d1', 'n-jorge')).not.toBe(alternativeKey('d2', 'n-jorge'))
  })
})

describe('estados de revisión — etiquetas exactas, sin palabras de seguridad', () => {
  it('los cuatro estados tienen la etiqueta pedida y ninguna afirma seguridad', () => {
    expect(Object.values(REVIEW_STATUS_LABELS)).toEqual([
      'Pendiente de revisar',
      'Alternativa prevista',
      'Confirmado con quien prepara la comida',
      'Confirmado con restaurante/catering',
    ])
    for (const label of Object.values(REVIEW_STATUS_LABELS)) expect(label.toLowerCase()).not.toMatch(/segur|apto|no contiene/)
  })
})

describe('migración 0199 — aditiva, RLS familiar, sin cadenas vacías ni ceros', () => {
  it('tabla nueva, sin alterar platos ni necesidades', () => {
    expect(MIGRATION).toContain('create table event_menu_person_alternatives')
    expect(MIGRATION).not.toMatch(/alter table event_menu_items/)
    expect(MIGRATION).not.toMatch(/alter table event_guest_dietary_needs/)
    expect(MIGRATION).not.toMatch(/\bdelete\s+from\b/i)
  })

  it('unicidad por (plato, necesidad): una alternativa por persona y plato', () => {
    expect(MIGRATION).toContain('unique (dish_id, need_id)')
  })

  it('el texto de alternativa es NULL cuando no hay alternativa (nunca cadena vacía)', () => {
    expect(MIGRATION).toContain('alternative_text text null check (alternative_text is null or length(trim(alternative_text)) > 0)')
  })

  it('estado de revisión restringido a los cuatro valores', () => {
    expect(MIGRATION).toContain("check (review_status in ('pendiente', 'alternativa_prevista', 'confirmado_preparador', 'confirmado_restaurante'))")
  })

  it('RLS familiar + eventos, y el plato y la necesidad deben pertenecer al mismo evento', () => {
    expect(MIGRATION).toContain("family_id = private.current_family_id() and private.has_section_access('eventos')")
    expect(MIGRATION).toContain('i.event_id = event_menu_person_alternatives.event_id')
    expect(MIGRATION).toContain('n.event_id = event_menu_person_alternatives.event_id')
  })
})
