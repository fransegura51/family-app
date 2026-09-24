import { describe, expect, it } from 'vitest'
import { guestListText, recipeText, shoppingListText } from './share'
import { buildAlfabeticoView, buildFamiliasView, buildGuestExportModel, buildMesasView } from './guestExport'
import type { EventGuest, EventGuestMember, EventGuestMemberType, EventTableSeat } from './types'

describe('shoppingListText', () => {
  it('agrupa por tienda con cantidad y unidad', () => {
    const text = shoppingListText([
      {
        store: 'Mercadona',
        items: [
          { name: 'Leche', quantity: '2', unit: 'l' },
          { name: 'Pan', quantity: null, unit: null },
        ],
      },
      { store: 'Sin tienda', items: [{ name: 'Pilas', quantity: '4', unit: null }] },
    ])
    expect(text).toContain('— Mercadona —')
    expect(text).toContain('• Leche (2 l)')
    expect(text).toContain('• Pan')
    expect(text).not.toContain('Pan (')
    expect(text).toContain('— Sin tienda —')
    expect(text).toContain('• Pilas (4)')
  })

  it('omite tiendas sin productos', () => {
    const text = shoppingListText([{ store: 'Vacía', items: [] }])
    expect(text).not.toContain('Vacía')
  })
})

describe('recipeText', () => {
  it('incluye título, ingredientes con cantidad y preparación', () => {
    const text = recipeText({
      title: 'Tortilla de patatas',
      ingredients: [
        { name: 'Patatas', quantity: '1', unit: 'kg' },
        { name: 'Huevos', quantity: '6', unit: null },
      ],
      notes: 'Freír y cuajar.',
    })
    expect(text).toContain('🍽️ Tortilla de patatas')
    expect(text).toContain('• Patatas — 1 kg')
    expect(text).toContain('• Huevos — 6')
    expect(text).toContain('Preparación:')
    expect(text).toContain('Freír y cuajar.')
  })

  it('sin ingredientes ni notas, solo el título', () => {
    const text = recipeText({ title: 'Receta vacía', ingredients: [], notes: null })
    expect(text).toBe('🍽️ Receta vacía')
  })
})

function guest(id: string, displayName: string, overrides: Partial<EventGuest> = {}): EventGuest {
  return {
    id,
    eventId: 'ev1',
    familyId: 'f1',
    displayName,
    adultsCount: 1,
    childrenCount: 0,
    notes: null,
    inviteScope: null,
    rsvpStatus: 'pendiente',
    rsvpAdultsCount: null,
    rsvpChildrenCount: null,
    rsvpNote: null,
    rsvpTokenActive: true,
    rsvpRespondedAt: null,
    tableId: null,
    sortOrder: 0,
    createdAt: '2026-01-01',
    ...overrides,
  }
}

function member(id: string, guestId: string, name: string, personType: EventGuestMemberType, overrides: Partial<EventGuestMember> = {}): EventGuestMember {
  return { id, guestId, eventId: 'ev1', familyId: 'f1', name, personType, tableId: null, sortOrder: 0, createdAt: '2026-01-01', ...overrides }
}

function table(id: string, name: string, capacity: number | null = null): EventTableSeat {
  return { id, eventId: 'ev1', familyId: 'f1', name, capacity, sortOrder: 0, createdAt: '2026-01-01' }
}

function membersByGuestId(members: EventGuestMember[]): Record<string, EventGuestMember[]> {
  const map: Record<string, EventGuestMember[]> = {}
  for (const m of members) (map[m.guestId] ??= []).push(m)
  return map
}

describe('guestListText — Fase 14E.4 (TEST: sobre las mismas vistas de pantalla, nunca un contenido distinto)', () => {
  it('mesas: incluye evento, filtro, mesas con aforo/aviso, y pendientes al final', () => {
    const guests = [guest('a', 'Familia A', { adultsCount: 3, childrenCount: 0, tableId: 't1' })]
    const tables = [table('t1', 'Mesa 1', 2)]
    const model = buildGuestExportModel({ guests, membersByGuestId: {}, tables }, 'todos')
    const text = guestListText('Bodas de plata', 'todos', { organize: 'mesas', view: buildMesasView(model) })
    expect(text).toContain('👥 Invitados — Bodas de plata')
    expect(text).toContain('Por mesas · Todos')
    expect(text).toContain('— Mesa 1 (3/2) · ⚠️ Aforo superado —')
    expect(text).toContain('• Familia A — 3 personas')
  })

  it('mesas: los pendientes de identificar aparecen aparte, nunca bajo una mesa', () => {
    const guests = [guest('ramon', 'Familia Ramón', { adultsCount: 2, childrenCount: 1 })]
    const members = [member('m1', 'ramon', 'Jorge', 'adulto')]
    const model = buildGuestExportModel({ guests, membersByGuestId: membersByGuestId(members), tables: [] }, 'todos')
    const text = guestListText('Boda', 'todos', { organize: 'mesas', view: buildMesasView(model) })
    expect(text).toContain('⚠️ Pendientes de asignar')
    expect(text).toContain('Familia Ramón: 1 adulto pendiente de identificar, 1 niño pendiente de identificar')
  })

  it('familias: incluye declarado/confirmado por separado y nombres con su mesa', () => {
    const guests = [guest('ramon', 'Familia Ramón', { adultsCount: 8, childrenCount: 1, rsvpStatus: 'confirmado', rsvpAdultsCount: 6, rsvpChildrenCount: 1 })]
    const members = [member('m1', 'ramon', 'Jorge', 'adulto', { tableId: 't1' })]
    const tables = [table('t1', 'Mesa 2')]
    const model = buildGuestExportModel({ guests, membersByGuestId: membersByGuestId(members), tables }, 'todos')
    const text = guestListText('Boda', 'todos', { organize: 'familias', view: buildFamiliasView(model, false) })
    expect(text).toContain('— Familia Ramón —')
    expect(text).toContain('Invitados: 9 · Confirmados: 7 · Confirmado')
    expect(text).toContain('• Jorge — adulto — Mesa 2')
  })

  it('alfabético: personas ordenadas + pendientes al final, nunca intercalados', () => {
    const guests = [guest('a', 'Familia A', { adultsCount: 2, childrenCount: 0 })]
    const members = [member('m1', 'a', 'Zoe', 'adulto'), member('m2', 'a', 'Ana', 'adulto')]
    const model = buildGuestExportModel({ guests, membersByGuestId: membersByGuestId(members), tables: [] }, 'todos')
    const text = guestListText('Boda', 'todos', { organize: 'alfabetico', view: buildAlfabeticoView(model) })
    const anaIndex = text.indexOf('Ana')
    const zoeIndex = text.indexOf('Zoe')
    expect(anaIndex).toBeGreaterThan(-1)
    expect(anaIndex).toBeLessThan(zoeIndex)
  })

  it('privacidad: el texto compartido nunca contiene un UUID ni notas privadas, en ningún modo', () => {
    const uuidLike = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    const guests = [
      guest('11111111-1111-1111-1111-111111111111', 'Familia Ramón', {
        adultsCount: 2,
        childrenCount: 0,
        tableId: '22222222-2222-2222-2222-222222222222',
        notes: 'nota privada del organizador',
        rsvpNote: 'mensaje privado',
      }),
    ]
    const members = [
      member('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Ángela', 'adulto', {
        tableId: '22222222-2222-2222-2222-222222222222',
      }),
    ]
    const tables = [table('22222222-2222-2222-2222-222222222222', 'Mesa 1', 6)]
    const model = buildGuestExportModel({ guests, membersByGuestId: membersByGuestId(members), tables }, 'todos')
    const texts = [
      guestListText('Boda', 'todos', { organize: 'mesas', view: buildMesasView(model) }),
      guestListText('Boda', 'todos', { organize: 'familias', view: buildFamiliasView(model, true) }),
      guestListText('Boda', 'todos', { organize: 'alfabetico', view: buildAlfabeticoView(model) }),
    ]
    for (const text of texts) {
      expect(text).not.toMatch(uuidLike)
      expect(text).not.toContain('nota privada')
      expect(text).not.toContain('mensaje privado')
    }
  })
})
