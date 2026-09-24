import { describe, expect, it } from 'vitest'
import {
  buildAlfabeticoView,
  buildFamiliasView,
  buildGuestExportModel,
  buildMesasView,
  inviteScopeLabel,
  personTypeLabel,
  rsvpStatusLabel,
} from '@/domain/guestExport'
import type { EventGuest, EventGuestMember, EventGuestMemberType, EventTableSeat } from '@/domain/types'

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

describe('grupo SIN personas desglosadas (TEST: grupo sin desglose)', () => {
  it('produce una única fila group_aggregate con el total declarado, sin inventar nombres', () => {
    const guests = [guest('david', 'Familia David', { adultsCount: 4, childrenCount: 1 })]
    const model = buildGuestExportModel({ guests, membersByGuestId: {}, tables: [] }, 'todos')
    expect(model.rows).toHaveLength(1)
    expect(model.rows[0]).toMatchObject({ kind: 'group_aggregate', personName: null, count: 5, groupName: 'Familia David' })
  })

  it('si el grupo tiene mesa asignada, la fila agregada la hereda y es "seatable" (mesa real, no pendiente)', () => {
    const guests = [guest('david', 'Familia David', { adultsCount: 4, childrenCount: 1, tableId: 't1' })]
    const tables = [table('t1', 'Mesa 1', 6)]
    const model = buildGuestExportModel({ guests, membersByGuestId: {}, tables }, 'todos')
    expect(model.rows[0]).toMatchObject({ seatable: true, tableId: 't1', tableName: 'Mesa 1' })
  })
})

describe('grupo COMPLETAMENTE desglosado (TEST: grupo completo)', () => {
  it('una fila "named" por persona, ninguna fila "pending"', () => {
    const guests = [guest('leche', 'Familia Pan', { adultsCount: 2, childrenCount: 1 })]
    const members = [
      member('m1', 'leche', 'Pan', 'adulto'),
      member('m2', 'leche', 'Leche', 'adulto'),
      member('m3', 'leche', 'Huevos', 'nino'),
    ]
    const model = buildGuestExportModel({ guests, membersByGuestId: membersByGuestId(members), tables: [] }, 'todos')
    expect(model.rows).toHaveLength(3)
    expect(model.rows.every((r) => r.kind === 'named')).toBe(true)
  })
})

describe('grupo PARCIALMENTE desglosado (TEST: grupo parcial — caso real Familia Ramón)', () => {
  it('8 adultos + 1 niño declarados, 7 adultos identificados → 1 adulto pendiente + 1 niño pendiente', () => {
    const guests = [guest('ramon', 'Familia Ramón', { adultsCount: 8, childrenCount: 1 })]
    const members = Array.from({ length: 7 }, (_, i) => member(`m${i}`, 'ramon', `Adulto ${i}`, 'adulto'))
    const model = buildGuestExportModel({ guests, membersByGuestId: membersByGuestId(members), tables: [] }, 'todos')
    const named = model.rows.filter((r) => r.kind === 'named')
    const pendingAdult = model.rows.find((r) => r.kind === 'pending_adult')
    const pendingChild = model.rows.find((r) => r.kind === 'pending_child')
    expect(named).toHaveLength(7)
    expect(pendingAdult?.count).toBe(1)
    expect(pendingChild?.count).toBe(1)
    expect(pendingAdult?.seatable).toBe(false)
    expect(pendingChild?.seatable).toBe(false)
  })

  it('si el niño ya está identificado, solo quedan 2 adultos pendientes (nunca "1 adulto + 1 niño" cuando el niño ya tiene nombre)', () => {
    const guests = [guest('ramon', 'Familia Ramón', { adultsCount: 8, childrenCount: 1 })]
    const members = [...Array.from({ length: 6 }, (_, i) => member(`m${i}`, 'ramon', `Adulto ${i}`, 'adulto')), member('nino', 'ramon', 'Marito', 'nino')]
    const model = buildGuestExportModel({ guests, membersByGuestId: membersByGuestId(members), tables: [] }, 'todos')
    const pendingAdult = model.rows.find((r) => r.kind === 'pending_adult')
    const pendingChild = model.rows.find((r) => r.kind === 'pending_child')
    expect(pendingAdult?.count).toBe(2)
    expect(pendingChild).toBeUndefined()
  })

  it('el total declarado (9) se conserva siempre, aunque solo 7 estén identificados — nunca desaparecen', () => {
    const guests = [guest('ramon', 'Familia Ramón', { adultsCount: 8, childrenCount: 1 })]
    const members = Array.from({ length: 7 }, (_, i) => member(`m${i}`, 'ramon', `Adulto ${i}`, 'adulto'))
    const model = buildGuestExportModel({ guests, membersByGuestId: membersByGuestId(members), tables: [] }, 'todos')
    const totalRepresented = model.rows.reduce((sum, r) => sum + r.count, 0)
    expect(totalRepresented).toBe(9)
  })

  it('nunca genera más filas "pending" de las que faltan por identificar (desglose exacto al límite → sin pendientes)', () => {
    const guests = [guest('g', 'Grupo', { adultsCount: 2, childrenCount: 0 })]
    const members = [member('m1', 'g', 'A', 'adulto'), member('m2', 'g', 'B', 'adulto')]
    const model = buildGuestExportModel({ guests, membersByGuestId: membersByGuestId(members), tables: [] }, 'todos')
    expect(model.rows.some((r) => r.kind.startsWith('pending'))).toBe(false)
  })
})

describe('Vista por mesas — aforo (TEST: mesas + aforo reutiliza computeTableOccupancy)', () => {
  it('cuenta igual que la pantalla de Mesas: unidad sin desglose cuenta como grupo, unidad con desglose cuenta persona a persona', () => {
    const guests = [
      guest('david', 'Familia David', { adultsCount: 4, childrenCount: 1, tableId: 't1' }),
      guest('ramon', 'Familia Ramón', { adultsCount: 2, childrenCount: 0 }),
    ]
    const members = [member('m1', 'ramon', 'Ramón', 'adulto', { tableId: 't1' }), member('m2', 'ramon', 'Rosa', 'adulto', { tableId: 't1' })]
    const tables = [table('t1', 'Mesa 1', 6)]
    const model = buildGuestExportModel({ guests, membersByGuestId: membersByGuestId(members), tables }, 'todos')
    const view = buildMesasView(model)
    const mesa1 = view.tableGroups.find((t) => t.tableName === 'Mesa 1')
    expect(mesa1?.occupied).toBe(7) // 5 (Familia David agregada) + 2 (Ramón, Rosa)
    expect(mesa1?.overCapacity).toBe(true)
  })

  it('muestra "⚠️ Aforo superado" solo cuando ocupación > capacidad, igual que en pantalla', () => {
    const guests = [guest('a', 'A', { adultsCount: 3, childrenCount: 0, tableId: 't1' })]
    const tables = [table('t1', 'Mesa 1', 6)]
    const model = buildGuestExportModel({ guests, membersByGuestId: {}, tables }, 'todos')
    const view = buildMesasView(model)
    expect(view.tableGroups[0].overCapacity).toBe(false)
  })

  it('las personas pendientes de identificar NUNCA aparecen bajo una mesa concreta — solo en "Pendientes de asignar"', () => {
    const guests = [guest('ramon', 'Familia Ramón', { adultsCount: 8, childrenCount: 1, tableId: 't1' })]
    const members = Array.from({ length: 7 }, (_, i) => member(`m${i}`, 'ramon', `Adulto ${i}`, 'adulto', { tableId: 't1' }))
    const tables = [table('t1', 'Mesa 1', 10)]
    const model = buildGuestExportModel({ guests, membersByGuestId: membersByGuestId(members), tables }, 'todos')
    const view = buildMesasView(model)
    const mesa1 = view.tableGroups.find((t) => t.tableName === 'Mesa 1')
    expect(mesa1?.occupied).toBe(7)
    expect(mesa1?.entries.every((e) => !e.label.includes('pendiente'))).toBe(true)
    expect(view.pending).toHaveLength(1)
    expect(view.pending[0]).toMatchObject({ groupName: 'Familia Ramón' })
    expect(view.pending[0].lines.join(', ')).toContain('1 adulto pendiente de identificar')
    expect(view.pending[0].lines.join(', ')).toContain('1 niño pendiente de identificar')
  })

  it('un grupo sin desglose con mesa asignada aparece agregado bajo su mesa real, no en pendientes', () => {
    const guests = [guest('david', 'Familia David', { adultsCount: 4, childrenCount: 1, tableId: 't1' })]
    const tables = [table('t1', 'Mesa 1', 6)]
    const model = buildGuestExportModel({ guests, membersByGuestId: {}, tables }, 'todos')
    const view = buildMesasView(model)
    expect(view.pending).toHaveLength(0)
    const mesa1 = view.tableGroups.find((t) => t.tableName === 'Mesa 1')
    expect(mesa1?.entries[0].label).toBe('Familia David — 5 personas')
  })

  it('nunca genera cinco nombres ficticios para un grupo agregado sin desglose', () => {
    const guests = [guest('david', 'Familia David', { adultsCount: 4, childrenCount: 1, tableId: 't1' })]
    const tables = [table('t1', 'Mesa 1', 6)]
    const model = buildGuestExportModel({ guests, membersByGuestId: {}, tables }, 'todos')
    const view = buildMesasView(model)
    const mesa1 = view.tableGroups.find((t) => t.tableName === 'Mesa 1')
    expect(mesa1?.entries).toHaveLength(1)
  })

  it('agrupa personas sin mesa asignada bajo el cubo "Sin mesa", separado de las mesas reales', () => {
    const guests = [guest('a', 'Familia A', { adultsCount: 1, childrenCount: 0 })]
    const model = buildGuestExportModel({ guests, membersByGuestId: {}, tables: [] }, 'todos')
    const view = buildMesasView(model)
    expect(view.tableGroups).toHaveLength(1)
    expect(view.tableGroups[0]).toMatchObject({ tableName: 'Sin mesa' })
  })

  it('incluye mesas vacías (sin nadie asignado todavía), igual que en pantalla', () => {
    const tables = [table('t1', 'Mesa vacía', 4)]
    const model = buildGuestExportModel({ guests: [], membersByGuestId: {}, tables }, 'todos')
    const view = buildMesasView(model)
    expect(view.tableGroups).toHaveLength(1)
    expect(view.tableGroups[0].occupied).toBe(0)
    expect(view.tableGroups[0].entries).toHaveLength(0)
  })
})

describe('RSVP declarado vs. confirmado (TEST: RSVP nunca se reconcilia automáticamente)', () => {
  it('muestra Invitados y Confirmados por separado sin inferir quién falta (Familia Ramón: 9 declarados, 7 confirmados)', () => {
    const guests = [guest('ramon', 'Familia Ramón', { adultsCount: 8, childrenCount: 1, rsvpStatus: 'confirmado', rsvpAdultsCount: 6, rsvpChildrenCount: 1 })]
    const model = buildGuestExportModel({ guests, membersByGuestId: {}, tables: [] }, 'todos')
    const view = buildFamiliasView(model, false)
    expect(view.groups[0].declaredTotal).toBe(9)
    expect(view.groups[0].confirmedTotal).toBe(7)
  })

  it('no muestra "Confirmados" cuando coincide con lo declarado, para no repetir información', () => {
    const guests = [guest('a', 'Familia A', { adultsCount: 2, childrenCount: 0, rsvpStatus: 'confirmado', rsvpAdultsCount: 2, rsvpChildrenCount: 0 })]
    const model = buildGuestExportModel({ guests, membersByGuestId: {}, tables: [] }, 'todos')
    const view = buildFamiliasView(model, false)
    expect(view.groups[0].confirmedTotal).toBeNull()
  })

  it('sin confirmar, no hay número de confirmados que mostrar (nunca se inventa)', () => {
    const guests = [guest('a', 'Familia A', { adultsCount: 2, childrenCount: 0, rsvpStatus: 'pendiente' })]
    const model = buildGuestExportModel({ guests, membersByGuestId: {}, tables: [] }, 'todos')
    const view = buildFamiliasView(model, false)
    expect(view.groups[0].confirmedTotal).toBeNull()
    expect(view.groups[0].rsvpStatusLabel).toBe('Pendiente')
  })
})

describe('Filtro Todos/Confirmados (TEST: filtro hereda del grupo, sin RSVP individual)', () => {
  it('"Confirmados" excluye por completo (todas sus filas) a un grupo cuyo rsvp_status no es confirmado', () => {
    const guests = [
      guest('a', 'Familia A', { adultsCount: 1, childrenCount: 0, rsvpStatus: 'confirmado' }),
      guest('b', 'Familia B', { adultsCount: 1, childrenCount: 0, rsvpStatus: 'pendiente' }),
    ]
    const model = buildGuestExportModel({ guests, membersByGuestId: {}, tables: [] }, 'confirmados')
    expect(model.rows).toHaveLength(1)
    expect(model.rows[0].groupName).toBe('Familia A')
  })

  it('"Todos" incluye grupos con cualquier estado de RSVP', () => {
    const guests = [
      guest('a', 'Familia A', { adultsCount: 1, childrenCount: 0, rsvpStatus: 'no_asiste' }),
      guest('b', 'Familia B', { adultsCount: 1, childrenCount: 0, rsvpStatus: 'no_seguro' }),
    ]
    const model = buildGuestExportModel({ guests, membersByGuestId: {}, tables: [] }, 'todos')
    expect(model.rows).toHaveLength(2)
  })
})

describe('Vista alfabética (TEST: solo personas identificadas se ordenan; pendientes aparte)', () => {
  it('ordena solo las personas nombradas por nombre, sin intercalar pendientes', () => {
    const guests = [guest('ramon', 'Familia Ramón', { adultsCount: 4, childrenCount: 0 })]
    const members = [member('m1', 'ramon', 'Jorge', 'adulto'), member('m2', 'ramon', 'Ángela', 'adulto'), member('m3', 'ramon', 'Paquita', 'adulto')]
    const model = buildGuestExportModel({ guests, membersByGuestId: membersByGuestId(members), tables: [] }, 'todos')
    const view = buildAlfabeticoView(model)
    expect(view.entries.map((e) => e.text.split(' — ')[0])).toEqual(['Ángela', 'Jorge', 'Paquita'])
    expect(view.pending).toHaveLength(1)
    expect(view.pending[0].lines[0]).toContain('1 adulto pendiente')
  })

  it('cada entrada indica nombre, tipo, familia y mesa cuando existe', () => {
    const guests = [guest('ramon', 'Familia Ramón', { adultsCount: 1, childrenCount: 0 })]
    const members = [member('m1', 'ramon', 'Ángela', 'adulto', { tableId: 't1' })]
    const tables = [table('t1', 'Mesa 2')]
    const model = buildGuestExportModel({ guests, membersByGuestId: membersByGuestId(members), tables }, 'todos')
    const view = buildAlfabeticoView(model)
    expect(view.entries[0].text).toBe('Ángela — adulto · Familia Ramón · Mesa 2')
  })

  it('un grupo sin ningún nombre identificado aparece solo en "pendientes", con adultos y niños agrupados en una línea por tipo', () => {
    const guests = [guest('david', 'Familia David', { adultsCount: 4, childrenCount: 1 })]
    const model = buildGuestExportModel({ guests, membersByGuestId: {}, tables: [] }, 'todos')
    const view = buildAlfabeticoView(model)
    expect(view.entries).toHaveLength(0)
    expect(view.pending[0].groupName).toBe('Familia David')
    expect(view.pending[0].lines).toEqual(['4 adultos pendientes de identificar', '1 niño pendiente de identificar'])
  })
})

describe('Vista por familias — invite_scope (TEST: invite_scope solo cuando aporta información)', () => {
  it('incluye la etiqueta de invite_scope cuando showInviteScope es true', () => {
    const guests = [guest('a', 'Familia A', { adultsCount: 1, childrenCount: 0, inviteScope: 'solo_ceremonia' })]
    const model = buildGuestExportModel({ guests, membersByGuestId: {}, tables: [] }, 'todos')
    const view = buildFamiliasView(model, true)
    expect(view.groups[0].inviteScopeLabel).toBe('Solo ceremonia')
  })

  it('lo omite cuando showInviteScope es false (evento sin ceremonia/celebración separadas)', () => {
    const guests = [guest('a', 'Familia A', { adultsCount: 1, childrenCount: 0, inviteScope: 'solo_ceremonia' })]
    const model = buildGuestExportModel({ guests, membersByGuestId: {}, tables: [] }, 'todos')
    const view = buildFamiliasView(model, false)
    expect(view.groups[0].inviteScopeLabel).toBeNull()
  })
})

describe('Etiquetas invariables (TEST: sin género inventado — el esquema no lo tiene)', () => {
  it('personTypeLabel es siempre "adulto"/"niño", nunca adivina género por nombre', () => {
    expect(personTypeLabel('adulto')).toBe('adulto')
    expect(personTypeLabel('nino')).toBe('niño')
  })

  it('rsvpStatusLabel/inviteScopeLabel cubren todos los valores reales del esquema', () => {
    expect(rsvpStatusLabel('pendiente')).toBe('Pendiente')
    expect(rsvpStatusLabel('confirmado')).toBe('Confirmado')
    expect(rsvpStatusLabel('no_asiste')).toBe('No asiste')
    expect(rsvpStatusLabel('no_seguro')).toBe('No seguro')
    expect(inviteScopeLabel(null)).toBe('Ceremonia + celebración')
    expect(inviteScopeLabel('ambas')).toBe('Ceremonia + celebración')
    expect(inviteScopeLabel('solo_ceremonia')).toBe('Solo ceremonia')
    expect(inviteScopeLabel('solo_celebracion')).toBe('Solo celebración')
  })
})

describe('Privacidad (TEST: nunca se serializan IDs internos ni datos técnicos en las vistas)', () => {
  it('ninguna vista (mesas/familias/alfabético) contiene un UUID en ningún campo de texto', () => {
    const uuidLike = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    const guests = [
      guest('11111111-1111-1111-1111-111111111111', 'Familia Ramón', { adultsCount: 2, childrenCount: 0, tableId: '22222222-2222-2222-2222-222222222222' }),
    ]
    const members = [member('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Ángela', 'adulto', { tableId: '22222222-2222-2222-2222-222222222222' })]
    const tables = [table('22222222-2222-2222-2222-222222222222', 'Mesa 1', 6)]
    const model = buildGuestExportModel({ guests, membersByGuestId: membersByGuestId(members), tables }, 'todos')
    const mesas = buildMesasView(model)
    const familias = buildFamiliasView(model, true)
    const alfabetico = buildAlfabeticoView(model)
    const dump = JSON.stringify({ mesas, familias, alfabetico })
    expect(dump).not.toMatch(uuidLike)
  })

  it('las vistas nunca incluyen notes/rsvp_note/rsvp_token (esos campos ni siquiera entran en el modelo canónico)', () => {
    const guests = [guest('a', 'Familia A', { adultsCount: 1, childrenCount: 0, notes: 'nota privada del organizador', rsvpNote: 'mensaje privado del invitado' })]
    const model = buildGuestExportModel({ guests, membersByGuestId: {}, tables: [] }, 'todos')
    const dump = JSON.stringify(model.rows)
    expect(dump).not.toContain('nota privada')
    expect(dump).not.toContain('mensaje privado')
  })
})

describe('Modelo vacío (TEST: evento sin invitados no rompe nada)', () => {
  it('sin invitados, todas las vistas quedan vacías sin errores', () => {
    const model = buildGuestExportModel({ guests: [], membersByGuestId: {}, tables: [] }, 'todos')
    expect(model.rows).toEqual([])
    expect(buildMesasView(model)).toEqual({ tableGroups: [], pending: [] })
    expect(buildFamiliasView(model, false)).toEqual({ groups: [] })
    expect(buildAlfabeticoView(model)).toEqual({ entries: [], pending: [] })
  })
})
