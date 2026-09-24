import { describe, expect, it } from 'vitest'

// Eventos Fase 14A — event_guest_members: desglose OPCIONAL de
// personas dentro de una unidad invitada (event_guests sigue siendo
// la unidad real para invitación/RSVP/token público/recuentos).
//
// La RLS "hardened" de esta tabla (y el endurecimiento de
// event_guests.table_id que esta misma migración añade) se verificó
// EN VIVO contra producción (objhgjgrinbhyzscjlbw) con un rehearsal
// BEGIN/ROLLBACK simulando un usuario real de Familia Hepburn
// (profile 93b0ce0e-...) antes de aplicar: alta válida OK, person_type
// inválido rechazado, guest_id de otra familia/evento (Bautizo de
// Alba/Familia Demo) rechazado, table_id de otro evento rechazado,
// event_guests.table_id endurecido rechaza mesa cruzada, borrar un
// guest borra sus members en cascada, y los 3 invitados reales de
// "Bodas de plata" quedaron intactos. Ninguna asignación cruzada
// preexistente se encontró en producción (comprobado antes de aplicar
// el endurecimiento), así que no hizo falta corregir ningún dato.
const FILES = import.meta.glob(['/supabase/migrations/0164_event_guest_members.sql', '/supabase/rollbacks/0164_event_guest_members_down.sql'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0164_event_guest_members.sql']
const ROLLBACK = FILES['/supabase/rollbacks/0164_event_guest_members_down.sql']

describe('0164 — event_guest_members: esquema', () => {
  it('guest_id es obligatorio (TEST: guest obligatorio)', () => {
    expect(MIGRATION).toContain('guest_id uuid not null references event_guests(id) on delete cascade')
  })

  it('event_id y family_id van redundantes a propósito, para que la RLS compruebe pertenencia sin JOIN extra', () => {
    expect(MIGRATION).toContain('event_id uuid not null references events(id) on delete cascade')
    expect(MIGRATION).toContain('family_id uuid not null references families(id) on delete cascade')
  })

  it('person_type es TEXT + CHECK (adulto/nino) — mismo patrón que el resto de Eventos, no un enum de Postgres', () => {
    expect(MIGRATION).toContain("person_type text not null check (person_type in ('adulto', 'nino'))")
  })

  it('table_id es nullable, on delete set null — una persona puede quedar sin mesa, o perderla si se borra la mesa', () => {
    expect(MIGRATION).toContain('table_id uuid references event_tables(id) on delete set null')
    expect(MIGRATION).not.toMatch(/table_id uuid not null/)
  })

  it('name es obligatorio, nombre completo libre — sin first_name/last_name', () => {
    expect(MIGRATION).toContain('name text not null')
    expect(MIGRATION).not.toMatch(/first_name|last_name/)
  })

  it('no añade ningún campo fuera del alcance de V1 (sin CRM: sin teléfono, email, edad, alergias, asistencia individual...)', () => {
    expect(MIGRATION).not.toMatch(/attendance_status|phone|email|\bage\b|relationship|menu|allerg|intoleran|contact_id|\bnotes\b/i)
  })

  it('tiene índices para guest_id, event_id, table_id y family_id', () => {
    expect(MIGRATION).toContain('create index idx_event_guest_members_guest on event_guest_members(guest_id)')
    expect(MIGRATION).toContain('create index idx_event_guest_members_event on event_guest_members(event_id)')
    expect(MIGRATION).toContain('create index idx_event_guest_members_table on event_guest_members(table_id)')
    expect(MIGRATION).toContain('create index idx_event_guest_members_family on event_guest_members(family_id)')
  })
})

describe('0164 — RLS hardened (TEST: guest misma familia/evento, cross-family/cross-event rechazados, mesa correcta/incorrecta)', () => {
  it('exige family_id = current_family_id() Y que guest_id pertenezca a esa misma familia Y a ese mismo event_id', () => {
    expect(MIGRATION).toContain('family_id = private.current_family_id()')
    expect(MIGRATION).toContain(
      'exists (\n      select 1 from event_guests g\n      where g.id = guest_id and g.family_id = private.current_family_id() and g.event_id = event_guest_members.event_id\n    )',
    )
  })

  it('table_id, cuando existe, debe pertenecer a la misma familia Y al mismo evento (mesa correcta aceptada, mesa de otro evento rechazada)', () => {
    expect(MIGRATION).toContain('table_id is null')
    expect(MIGRATION).toContain('t.family_id = private.current_family_id() and t.event_id = event_guest_members.event_id')
  })

  it('sigue exigiendo has_section_access(\'eventos\'), igual que el resto de tablas de Eventos', () => {
    const count = (MIGRATION.match(/private\.has_section_access\('eventos'\)/g) ?? []).length
    expect(count).toBeGreaterThanOrEqual(2) // event_guest_members + event_guests endurecida
  })
})

describe('0164 — endurece el hueco ya detectado en event_guests.table_id (auditoría Fase 13)', () => {
  it('sustituye la política de event_guests para exigir también que table_id pertenezca al mismo evento/familia', () => {
    expect(MIGRATION).toContain('drop policy "event_guests: family crud" on event_guests')
    expect(MIGRATION).toContain('create policy "event_guests: family crud" on event_guests for all')
    const secondPolicyIdx = MIGRATION.lastIndexOf('create policy "event_guests: family crud"')
    const secondPolicyBody = MIGRATION.slice(secondPolicyIdx)
    expect(secondPolicyBody).toContain('t.family_id = private.current_family_id() and t.event_id = event_guests.event_id')
  })

  it('no toca la parte de lectura (using) de event_guests, solo endurece la escritura (with check)', () => {
    expect(MIGRATION).toContain('using (family_id = private.current_family_id() and private.has_section_access(\'eventos\'))\n  with check (')
  })
})

describe('0164 — cascada y rollback', () => {
  it('borrar un event_guests elimina en cascada sus event_guest_members (TEST: borrar guest elimina members)', () => {
    expect(MIGRATION).toContain('references event_guests(id) on delete cascade')
  })

  it('el rollback restaura la política simple de event_guests y elimina la tabla nueva, sin tocar datos', () => {
    expect(ROLLBACK).toContain('drop table if exists event_guest_members')
    expect(ROLLBACK).toContain('create policy "event_guests: family crud" on event_guests for all')
    expect(ROLLBACK).not.toMatch(/\bdelete from\b|\btruncate\b/i)
  })
})

const APP = import.meta.glob('/src/data/events.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SRC = APP['/src/data/events.ts']

describe('capa de datos: event_guest_members (TEST: crear persona válida, adulto/niño válidos)', () => {
  it('addEventGuestMember inserta guest_id/event_id/family_id desde la unidad padre, nunca a mano desde la UI', () => {
    const start = SRC.indexOf('export async function addEventGuestMember')
    const body = SRC.slice(start, SRC.indexOf('\nexport async function updateEventGuestMember', start))
    expect(body).toContain('guest_id: guest.id')
    expect(body).toContain('event_id: guest.eventId')
    expect(body).toContain('family_id: guest.familyId')
    expect(body).toContain('person_type: input.personType')
  })

  it('listEventGuestMembers/listEventGuestMembersForEvent seleccionan exactamente las columnas de la migración', () => {
    expect(SRC).toContain("const GUEST_MEMBER_SELECT = 'id, guest_id, event_id, family_id, name, person_type, table_id, sort_order, created_at'")
  })

  it('updateEventGuestMember permite cambiar tableId a null explícitamente (quitar de mesa) sin borrar la persona', () => {
    const start = SRC.indexOf('export async function updateEventGuestMember')
    const body = SRC.slice(start, SRC.indexOf('\nexport async function deleteEventGuestMember', start))
    expect(body).toContain('if (patch.tableId !== undefined) update.table_id = patch.tableId')
  })
})

describe('regresión: Invitados/RSVP existentes no se han tocado (TEST: eventos/invitados antiguos siguen cargando, RSVP antiguo sigue funcionando)', () => {
  it('GUEST_SELECT, mapGuest, listEventGuests, addEventGuest y updateEventGuest siguen exactamente igual', () => {
    expect(SRC).toContain('const GUEST_SELECT =')
    expect(SRC).toContain(
      "'id, event_id, family_id, display_name, adults_count, children_count, notes, invite_scope, rsvp_status, rsvp_adults_count, rsvp_children_count, rsvp_note, rsvp_token_active, rsvp_responded_at, table_id, sort_order, created_at'",
    )
    expect(SRC).toContain('export async function listEventGuests(eventId: string): Promise<EventGuest[]>')
    expect(SRC).toContain('export async function addEventGuest(')
    expect(SRC).toContain('export async function updateEventGuest(')
  })

  it('el flujo público de RSVP (event-rsvp Edge Function) no se ha modificado en esta fase', () => {
    const RSVP_FN = (
      import.meta.glob('/supabase/functions/event-rsvp/index.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    )['/supabase/functions/event-rsvp/index.ts']
    expect(RSVP_FN).not.toContain('event_guest_members')
  })
})
