import { describe, expect, it } from 'vitest'

// Eventos Fase 14C — mesas por persona invitada, sobre el desglose
// opcional de la Fase 14B. Las pruebas puras de computeGuestSeatingStatus
// y computeTableOccupancy (dos modos mutuamente excluyentes, sin doble
// conteo, plazas sin nombre nunca asignables, y la reproducción del
// caso real "Mesa niños" de Bodas de plata) viven en
// src/domain/events.test.ts, junto a esas funciones. Aquí se comprueba
// el cableado de TablesSection: asignar una persona individual sin
// mover al resto, asignar todo el grupo de golpe, que una unidad sin
// desglosar sigue funcionando exactamente igual que antes de esta
// fase, la transición grupo→personas (mesa heredada solo por la
// primera persona) y personas→grupo (borrar a todos vuelve limpio al
// modo unidad), y el aviso de capacidad superada sin bloquear nada.
const APP = import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SRC = APP['/src/ui/EventosScreen.tsx']

function window(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const TABLES_SECTION = window(SRC, 'function TablesSection', '\n// ---------------------------------------------------------------------\n// Fase 3 — Decoración')

describe('Fase 14C — unidad sin desglosar sigue igual (TEST: unidad sin desglosar sigue funcionando igual)', () => {
  it('un guest sin miembros sigue usando assignGuestTable (el mismo <select> de siempre, sin cambios)', () => {
    const body = window(TABLES_SECTION, 'if (guestMembers.length === 0) {', 'const status = computeGuestSeatingStatus')
    expect(body).toContain('assignGuestTable(g.id, e.target.value || null).then(reload)')
  })
})

describe('Fase 14C — asignar una persona individual sin mover al resto (TEST: asignar persona individual)', () => {
  it('el <select> por persona llama a updateEventGuestMember solo con el id de esa persona', () => {
    const body = window(TABLES_SECTION, 'guestMembers.map((m) => (', '))}\n                </div>\n              )')
    expect(body).toContain('updateEventGuestMember(m.id, { tableId: e.target.value || null }).then(reload)')
  })
})

describe('Fase 14C — asignar todo el grupo (TEST: asignar todo el grupo)', () => {
  it('handleAssignAllGroup aplica el mismo tableId a TODOS los miembros del grupo con un solo Promise.all', () => {
    const body = window(TABLES_SECTION, 'async function handleAssignAllGroup', 'return (')
    expect(body).toContain('Promise.all(guestMembers.map((m) => updateEventGuestMember(m.id, { tableId })))')
  })

  it('el selector de "asignar todo el grupo" usa un valor propio para "Sin mesa" (no comparte value con el placeholder deshabilitado)', () => {
    const body = window(TABLES_SECTION, 'Asignar todo el grupo a…', '{tables.map((t) => (')
    expect(body).toContain(`<option value={GROUP_ASSIGN_NONE}>Sin mesa</option>`)
  })
})

describe('Fase 14C — sin doble conteo en la UI (mismo criterio que computeTableOccupancy)', () => {
  it('seatedCount de cada mesa se calcula con computeTableOccupancy, no con un conteo propio de la UI', () => {
    expect(TABLES_SECTION).toContain('const seatedCount = computeTableOccupancy(t, guests, membersByGuestId)')
  })

  it('la lista de nombres de una mesa separa unidades sin desglose (grupo entero) de personas desglosadas (una por una), sin repetir ninguna unidad ya desglosada', () => {
    const body = window(TABLES_SECTION, 'const namesHere = [', '\n          ]')
    expect(body).toContain("guests.filter((g) => (membersByGuestId[g.id]?.length ?? 0) === 0 && g.tableId === t.id)")
    expect(body).toContain('members.filter((m) => m.tableId === t.id)')
  })
})

describe('Fase 14C — transición grupo→personas (TEST: transición grupo→personas hereda mesa)', () => {
  it('la primera persona añadida a un grupo que ya tenía mesa hereda esa mesa como inicial', () => {
    const body = window(SRC, 'async function handleAddPerson', 'function startEdit')
    expect(body).toContain('const initialTableId = members.length === 0 ? guest.tableId : null')
    expect(body).toContain('await addEventGuestMember(guest, { name: personName, personType, tableId: initialTableId })')
  })

  it('a partir de la 2ª persona ya no se copia ninguna mesa (no hay una única mesa de grupo que copiar sin ambigüedad)', () => {
    const body = window(SRC, 'async function handleAddPerson', 'function startEdit')
    expect(body).toMatch(/members\.length === 0 \? guest\.tableId : null/)
  })
})

describe('Fase 14C — transición personas→grupo (TEST: personas→grupo vuelve limpio al modo unidad)', () => {
  it('event_guests.table_id nunca se borra al añadir/editar/borrar personas: sigue ahí para cuando el grupo se quede sin ninguna', () => {
    const dataApp = (import.meta.glob('/src/data/events.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/events.ts']
    const deleteMemberBody = dataApp.slice(dataApp.indexOf('export async function deleteEventGuestMember'), dataApp.indexOf('export async function deleteEventGuestMember') + 300)
    expect(deleteMemberBody).not.toContain('event_guests')
  })

  it('sin miembros, la unidad vuelve a mostrar el <select> clásico de mesa de unidad (no queda "fantasma" sin forma de asignarla)', () => {
    expect(TABLES_SECTION).toContain('if (guestMembers.length === 0) {')
    expect(TABLES_SECTION).toContain('value={g.tableId ?? \'\'}')
  })
})

describe('Fase 14C — capacidad visual, sin bloqueo (TEST: capacidad sin bloqueo destructivo)', () => {
  it('overCapacity solo cambia el estilo/añade un aviso, nunca deshabilita ni impide ninguna asignación', () => {
    expect(TABLES_SECTION).toContain('const overCapacity = t.capacity != null && seatedCount > t.capacity')
    expect(TABLES_SECTION).not.toMatch(/disabled=\{[^}]*overCapacity/)
  })
})

describe('Fase 14C — plazas sin nombre no son asignables individualmente en la UI', () => {
  it('el aviso "por nombrar" es informativo (unidentifiedCount), no genera ningún <select> nuevo por cada plaza sin nombre', () => {
    const body = window(TABLES_SECTION, 'status.seatedIdentifiedCount', 'guestMembers.map((m) => (')
    expect(body).toContain('por nombrar')
    expect(body).not.toContain('unidentifiedCount }).map')
  })
})
