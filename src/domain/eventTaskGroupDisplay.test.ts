import { describe, expect, it } from 'vitest'
import { buildTaskGroupRenderItems } from '@/domain/eventTaskGroupDisplay'
import type { EventTask, EventTaskGroup } from '@/domain/types'

function makeTask(overrides: Partial<EventTask> = {}): EventTask {
  return {
    id: 't1',
    eventId: 'e1',
    familyId: 'f1',
    title: 'Tarea',
    done: false,
    dueDate: null,
    source: 'manual',
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
    assignedMemberId: null,
    calendarEventId: null,
    decisionId: null,
    groupId: null,
    ...overrides,
  }
}

function makeGroup(overrides: Partial<EventTaskGroup> = {}): EventTaskGroup {
  return {
    id: 'g1',
    eventId: 'e1',
    name: 'Flores',
    sortOrder: 0,
    kind: null,
    resolvedAt: null,
    resolutionMethod: null,
    resolutionNote: null,
    providerId: null,
    providerName: null,
    paymentId: null,
    ...overrides,
  }
}

describe('buildTaskGroupRenderItems — un encabezado por encargo, nunca repetido por tarjeta', () => {
  it('sin ningún grupo: cada tarea es un ítem suelto, en orden', () => {
    const tasks = [makeTask({ id: 't1' }), makeTask({ id: 't2' })]
    expect(buildTaskGroupRenderItems(tasks, [])).toEqual([
      { type: 'task', task: tasks[0] },
      { type: 'task', task: tasks[1] },
    ])
  })

  it('varias tareas del mismo encargo: UN solo bloque "group" con todas, en la posición de la PRIMERA', () => {
    const group = makeGroup({ id: 'g1', name: 'Flores' })
    const ramo = makeTask({ id: 't1', title: 'Encargar ramo', groupId: 'g1' })
    const suelta = makeTask({ id: 't2', title: 'Enviar invitaciones' })
    const prendido = makeTask({ id: 't3', title: 'Encargar prendido', groupId: 'g1' })
    const items = buildTaskGroupRenderItems([ramo, suelta, prendido], [group])
    expect(items).toEqual([
      { type: 'group', groupId: 'g1', groupName: 'Flores', group, tasks: [ramo, prendido] },
      { type: 'task', task: suelta },
    ])
  })

  it('una tarea cuyo groupId ya no corresponde a ningún grupo real (borrado/no cargado) se trata como suelta', () => {
    const huerfana = makeTask({ id: 't1', groupId: 'no-existe' })
    expect(buildTaskGroupRenderItems([huerfana], [])).toEqual([{ type: 'task', task: huerfana }])
  })

  it('un grupo sin ninguna tarea en la lista no genera ningún bloque (nada que mostrar)', () => {
    const group = makeGroup({ id: 'g1' })
    const suelta = makeTask({ id: 't1' })
    expect(buildTaskGroupRenderItems([suelta], [group])).toEqual([{ type: 'task', task: suelta }])
  })

  it('dos encargos distintos: dos bloques separados, cada uno con solo sus tareas', () => {
    const flores = makeGroup({ id: 'g1', name: 'Flores' })
    const tarta = makeGroup({ id: 'g2', name: 'Tarta' })
    const ramo = makeTask({ id: 't1', groupId: 'g1' })
    const encargarTarta = makeTask({ id: 't2', groupId: 'g2' })
    const prendido = makeTask({ id: 't3', groupId: 'g1' })
    const items = buildTaskGroupRenderItems([ramo, encargarTarta, prendido], [flores, tarta])
    expect(items).toEqual([
      { type: 'group', groupId: 'g1', groupName: 'Flores', group: flores, tasks: [ramo, prendido] },
      { type: 'group', groupId: 'g2', groupName: 'Tarta', group: tarta, tasks: [encargarTarta] },
    ])
  })
})
