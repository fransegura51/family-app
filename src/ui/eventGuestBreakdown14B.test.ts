import { describe, expect, it } from 'vitest'

// Eventos Fase 14B — desglose OPCIONAL de personas dentro de una
// unidad invitada (UI de EventosScreen.tsx, sobre la infraestructura
// de la Fase 14A). Las pruebas puras de computeGuestBreakdownStatus
// (grupo sin personas, una persona, varias personas, desglose
// completo/parcial, exceso de adultos/niños) viven en
// src/domain/events.test.ts junto a la propia función. Aquí se
// comprueban el cableado de la UI y las regresiones explícitas que
// pedía la Fase 14B: edición de nombre, cambio de tipo, eliminación,
// que cambiar los agregados de la unidad no borra personas, que el
// RSVP sigue siendo por agregado, y que una unidad sin desglose se ve
// igual que antes.
const APP = import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SRC = APP['/src/ui/EventosScreen.tsx']

function window(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const GUEST_BREAKDOWN_SECTION = window(SRC, 'function GuestBreakdownSection', '\nfunction AddGuestModal')

describe('Fase 14B — grupo no desglosado sigue idéntico (TEST: unidad sin desglose no cambia)', () => {
  it('colapsado por defecto: sin expandir, solo se pinta el botón "Desglosar personas"', () => {
    const body = window(GUEST_BREAKDOWN_SECTION, 'if (!expanded) {', '\n\n  return (')
    expect(body).toContain('👤 Desglosar personas')
  })

  it('listEventGuestMembers solo se llama cuando expanded es true (no en cada render de la lista de invitados)', () => {
    const effectBody = window(GUEST_BREAKDOWN_SECTION, 'useEffect(() => {', '}, [expanded, guest.id])')
    expect(effectBody).toContain('if (expanded) reloadMembers()')
  })

  it('la fila existente del invitado ("X adultos, Y niños" + notas) no se ha tocado, solo se añade GuestBreakdownSection debajo', () => {
    const guestRow = window(SRC, '{g.adultsCount} adultos, {g.childrenCount} niños', '<GuestBreakdownSection guest={g} />')
    expect(guestRow).toContain("{g.notes ? ` · ${g.notes}` : ''}")
  })
})

describe('Fase 14B — formulario de alta: Nombre, Tipo, Guardar, Cancelar. Nada más (TEST: añadir persona)', () => {
  it('addEventGuestMember recibe el guest completo (para que la capa de datos saque guest_id/event_id/family_id) y el tipo elegido', () => {
    const body = window(GUEST_BREAKDOWN_SECTION, 'async function handleAddPerson', 'function startEdit')
    expect(body).toContain('await addEventGuestMember(guest, { name: personName, personType })')
  })

  it('el formulario de alta no pide más que nombre y tipo (sin teléfono, edad, mesa...)', () => {
    const form = window(GUEST_BREAKDOWN_SECTION, 'showAddPerson ? (', '+ Añadir persona')
    expect(form).toContain('placeholder="Nombre"')
    expect(form).toContain('<option value="adulto">Adulto</option>')
    expect(form).toContain('<option value="nino">Niño</option>')
    expect(form).not.toMatch(/phone|email|edad|age|mesa|table/i)
  })
})

describe('Fase 14B — edición de nombre y tipo (TEST: edición nombre, TEST: cambio tipo)', () => {
  it('handleSaveEdit llama a updateEventGuestMember con el nombre y tipo editados de esa persona concreta', () => {
    const body = window(GUEST_BREAKDOWN_SECTION, 'async function handleSaveEdit', 'async function handleDeletePerson')
    expect(body).toContain('await updateEventGuestMember(id, { name: editName, personType: editType })')
  })
})

describe('Fase 14B — eliminación (TEST: eliminación)', () => {
  it('handleDeletePerson llama a deleteEventGuestMember y recarga la lista', () => {
    const body = window(GUEST_BREAKDOWN_SECTION, 'async function handleDeletePerson', 'if (!expanded) {')
    expect(body).toContain('await deleteEventGuestMember(id)')
    expect(body).toContain('reloadMembers()')
  })
})

describe('Fase 14B — aviso de inconsistencia no bloqueante', () => {
  it('el aviso solo se pinta si adultsExceeded/childrenExceeded, nunca impide guardar (no hay ningún disabled ligado a status)', () => {
    expect(GUEST_BREAKDOWN_SECTION).toContain('status.adultsExceeded || status.childrenExceeded')
    expect(GUEST_BREAKDOWN_SECTION).not.toMatch(/disabled=\{[^}]*status\./)
  })
})

describe('Fase 14B — cambiar los agregados de la unidad no borra personas (TEST: cambio de agregados no borra personas)', () => {
  it('updateEventGuest (capa de datos) no toca event_guest_members: son dos tablas independientes', () => {
    const dataApp = (import.meta.glob('/src/data/events.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/events.ts']
    const start = dataApp.indexOf('export async function updateEventGuest(')
    expect(start).toBeGreaterThan(-1)
    const body = dataApp.slice(start, dataApp.indexOf('\nexport async function deleteEventGuest', start))
    expect(body).not.toContain('event_guest_members')
  })
})

describe('Fase 14B — RSVP sigue siendo por agregado (TEST: RSVP sigue agregado)', () => {
  it('handleRsvpStatusChange (GuestsSection) sigue leyendo/escribiendo solo los campos agregados del guest, sin tocar event_guest_members', () => {
    const body = window(SRC, 'async function handleRsvpStatusChange', 'async function handleRemindPending')
    expect(body).toContain('rsvpAdultsCount')
    expect(body).toContain('rsvpChildrenCount')
    expect(body).not.toContain('event_guest_members')
    expect(body).not.toContain('listEventGuestMembers')
  })

  it('el flujo público de RSVP (event-rsvp Edge Function) sigue sin mencionar event_guest_members', () => {
    const rsvpFn = (import.meta.glob('/supabase/functions/event-rsvp/index.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
      '/supabase/functions/event-rsvp/index.ts'
    ]
    expect(rsvpFn).not.toContain('event_guest_members')
  })
})

describe('Fase 14B — Mesas no se toca todavía (fuera de alcance hasta 14C)', () => {
  it('GuestBreakdownSection no ofrece asignar mesa a una persona (eso es Fase 14C)', () => {
    expect(GUEST_BREAKDOWN_SECTION).not.toMatch(/table_id|assignGuestTable|event_tables/i)
  })
})
