import { describe, expect, it } from 'vitest'
import { areaOf, buildAreaViews, buildPersonalViews, computeAreaOrder, defaultPersonalCategories, isPersonalNotification } from '@/domain/notificationAreas'
import type { AppNotification } from '@/domain/notificationsCenter'

const n = (id: string, category: string, createdAt: string, readAt: string | null = null, bucket: 'personal' | 'other' = 'other'): AppNotification => ({ id, bucket, category, title: id, body: '', url: null, groupKey: null, payload: {}, createdAt, readAt })

describe('NOT-01 · áreas', () => {
  it('cada tipo conocido cae en su área y los desconocidos en el prefijo o en «otros»', () => {
    expect(areaOf('task_overdue_summary')).toBe('calendario')
    expect(areaOf('bank_import')).toBe('economia')
    expect(areaOf('community_anything')).toBe('comunidad')
    expect(areaOf('algo_nuevo')).toBe('otros')
  })

  it('las áreas con no leídos suben arriba (la del no leído más reciente primero); el resto, en orden fijo', () => {
    const list = [
      n('a', 'birthday_reminder', '2026-10-01T10:00:00Z', '2026-10-02T00:00:00Z'),
      n('b', 'forecast_due', '2026-10-05T10:00:00Z'),
      n('c', 'community_digest', '2026-10-09T10:00:00Z'),
      n('d', 'task_assigned', '2026-10-03T10:00:00Z', '2026-10-04T00:00:00Z'),
    ]
    expect(computeAreaOrder(list)).toEqual(['comunidad', 'economia', 'calendario', 'cumpleanos'])
  })

  it('las áreas empiezan desplegadas solo si tenían no leídos al cargar, y marcar uno como leído NO recoloca nada', () => {
    const list = [n('b', 'forecast_due', '2026-10-05T10:00:00Z'), n('d', 'task_assigned', '2026-10-03T10:00:00Z', '2026-10-04T00:00:00Z')]
    const order = computeAreaOrder(list)
    const unreadAtLoad = new Set(['b'])
    const before = buildAreaViews(list, order, unreadAtLoad)
    expect(before.map((v) => [v.area, v.startsExpanded, v.unreadCount])).toEqual([
      ['economia', true, 1],
      ['calendario', false, 0],
    ])
    const after = buildAreaViews([{ ...list[0], readAt: '2026-10-06T00:00:00Z' }, list[1]], order, unreadAtLoad)
    expect(after.map((v) => v.area)).toEqual(['economia', 'calendario'])
    expect(after[0].unreadCount).toBe(0) // el contador sí se actualiza
    expect(after[0].startsExpanded).toBe(true) // y no se pliega sola
  })
})

describe('NOT-01 · prioridad personal', () => {
  it('sin elegir, vale el bloque del servidor; eligiendo tipos, manda la elección', () => {
    const task = n('t', 'task_assigned', '2026-10-01T00:00:00Z', null, 'personal')
    const bank = n('b', 'bank_import', '2026-10-01T00:00:00Z', null, 'other')
    expect(isPersonalNotification(task, null)).toBe(true)
    expect(isPersonalNotification(bank, null)).toBe(false)
    expect(isPersonalNotification(bank, ['bank_import'])).toBe(true)
    expect(isPersonalNotification(task, ['bank_import'])).toBe(false)
    expect(defaultPersonalCategories()).toContain('task_assigned')
  })

  it('los no leídos al cargar van primero y no saltan al leerse', () => {
    const list = [n('old-unread', 'task_assigned', '2026-10-01T00:00:00Z', null, 'personal'), n('new-read', 'task_assigned', '2026-10-05T00:00:00Z', '2026-10-06T00:00:00Z', 'personal')]
    const snapshot = new Set(['old-unread'])
    expect(buildPersonalViews(list, null, snapshot)[0].items.map((x) => x.id)).toEqual(['old-unread', 'new-read'])
    const read = [{ ...list[0], readAt: '2026-10-07T00:00:00Z' }, list[1]]
    expect(buildPersonalViews(read, null, snapshot)[0].items.map((x) => x.id)).toEqual(['old-unread', 'new-read'])
  })
})
