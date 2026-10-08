import { describe, expect, it } from 'vitest'

// Fase 2 (plan de pendientes) — roster de "🎭 Personas especiales" / "👪 Familiares" (migración 0216).
const SRC = (import.meta.glob('/src/data/eventSpecialPeople.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/eventSpecialPeople.ts']
const MIG = (import.meta.glob('/supabase/migrations/0216_event_role_people.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/supabase/migrations/0216_event_role_people.sql'
]

function fn(source: string, signature: string): string {
  const start = source.indexOf(signature)
  expect(start, `no se encontró "${signature}"`).toBeGreaterThan(-1)
  return source.slice(start, source.indexOf('\n}', start) + 2)
}

describe('migración 0216 — una tabla, dos categorías, vínculo a invitados opcional y nunca automático', () => {
  it('event_role_people tiene RLS familiar', () => {
    expect(MIG).toContain('create table event_role_people')
    expect(MIG).toContain('alter table event_role_people enable row level security')
    expect(MIG).toContain("family_id = private.current_family_id() and private.has_section_access('eventos')")
  })
  it('category está acotada a especial/familiar', () => {
    expect(MIG).toContain("check (category in ('especial', 'familiar'))")
  })
  it('guest_member_id es ON DELETE SET NULL — borrar el invitado desglosado nunca borra la persona especial/familiar', () => {
    expect(MIG).toContain('references event_guest_members(id) on delete set null')
  })
})

describe('listEventRolePeople/addEventRolePerson/updateEventRolePerson/deleteEventRolePerson', () => {
  it('listEventRolePeople filtra por evento Y por categoría — nunca mezcla especiales con familiares', () => {
    const body = fn(SRC, 'export async function listEventRolePeople(')
    expect(body).toContain(".eq('event_id', eventId).eq('category', category)")
  })
  it('addEventRolePerson usa el family_id real del evento (nunca inventado), igual que addEventTaskGroup', () => {
    const body = fn(SRC, 'export async function addEventRolePerson(')
    expect(body).toContain("from('events').select('family_id')")
    expect(body).toContain('family_id: event.family_id')
  })
  it('updateEventRolePerson solo actualiza los campos realmente pasados (nunca sobrescribe roles/guestMemberId con undefined)', () => {
    const body = fn(SRC, 'export async function updateEventRolePerson(')
    expect(body).toContain('if (patch.name !== undefined)')
    expect(body).toContain('if (patch.roles !== undefined)')
    expect(body).toContain('if (patch.guestMemberId !== undefined)')
  })
  it('deleteEventRolePerson borra solo esa fila', () => {
    const body = fn(SRC, 'export async function deleteEventRolePerson(')
    expect(body).toContain("from('event_role_people').delete()")
  })
})
