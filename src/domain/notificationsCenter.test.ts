// Campana de avisos: orden, bloques, plegado y seguridad de los enlaces.
import { describe, expect, it } from 'vitest'
import {
  badgeText,
  buildBucketViews,
  relativeTime,
  safeInternalUrl,
  selectionIds,
  unreadCount,
  type AppNotification,
} from '@/domain/notificationsCenter'

function n(id: string, bucket: 'personal' | 'other', createdAt: string, read = false): AppNotification {
  return { id, bucket, category: 'x', title: `t${id}`, body: '', url: '/calendario', groupKey: null, payload: {}, createdAt, readAt: read ? '2026-10-15T10:00:00Z' : null }
}

describe('bloques de la campana', () => {
  const list = [
    n('1', 'other', '2026-10-14T10:00:00Z'),
    n('2', 'personal', '2026-10-14T09:00:00Z', true),
    n('3', 'personal', '2026-10-14T11:00:00Z'),
    n('4', 'personal', '2026-10-13T08:00:00Z'),
    n('5', 'other', '2026-10-14T12:00:00Z', true),
  ]

  it('Personales siempre arriba y Otras notificaciones debajo', () => {
    expect(buildBucketViews(list).map((v) => v.bucket)).toEqual(['personal', 'other'])
    expect(buildBucketViews([...list].reverse()).map((v) => v.title)).toEqual(['Personales', 'Otras notificaciones'])
  })

  it('en cada bloque, de más reciente a más antiguo (nunca por importancia)', () => {
    const personal = buildBucketViews(list)[0]
    expect(personal.unread.map((x) => x.id)).toEqual(['3', '4'])
    expect(personal.earlier.map((x) => x.id)).toEqual(['2'])
  })

  it('las no leídas quedan desplegadas y las leídas van a «anteriores»', () => {
    const other = buildBucketViews(list)[1]
    expect(other.unread.map((x) => x.id)).toEqual(['1'])
    expect(other.earlier.map((x) => x.id)).toEqual(['5'])
  })

  it('no se enseñan bloques vacíos', () => {
    expect(buildBucketViews([n('1', 'other', '2026-10-14T10:00:00Z')]).map((v) => v.bucket)).toEqual(['other'])
    expect(buildBucketViews([])).toEqual([])
  })

  it('con la misma hora, el orden es estable (por id)', () => {
    const same = [n('a', 'personal', '2026-10-14T10:00:00Z'), n('b', 'personal', '2026-10-14T10:00:00Z')]
    expect(buildBucketViews(same)[0].unread.map((x) => x.id)).toEqual(['b', 'a'])
  })
})

describe('contador', () => {
  it('cuenta solo lo SIN LEER, no el historial', () => {
    expect(unreadCount([n('1', 'other', '2026-10-14T10:00:00Z'), n('2', 'other', '2026-10-14T10:00:00Z', true)])).toBe(1)
    expect(unreadCount([])).toBe(0)
  })
  it('99+ para no desbordar el círculo', () => {
    expect(badgeText(7)).toBe('7')
    expect(badgeText(99)).toBe('99')
    expect(badgeText(100)).toBe('99+')
  })
})

describe('enlaces de los avisos', () => {
  it('solo rutas internas de PEPA', () => {
    expect(safeInternalUrl('/calendario')).toBe('/calendario')
    expect(safeInternalUrl('/comunidad/p/123?x=1')).toBe('/comunidad/p/123?x=1')
  })
  it('rechaza otras webs y trucos', () => {
    for (const bad of ['https://malo.example', '//malo.example', 'javascript:alert(1)', 'calendario', '/\\malo', '', null, undefined]) {
      expect(safeInternalUrl(bad as string | null | undefined)).toBeNull()
    }
  })
})

describe('tiempo relativo', () => {
  const now = new Date('2026-10-14T12:00:00Z')
  it('describe lo reciente con claridad', () => {
    expect(relativeTime('2026-10-14T11:59:40Z', now)).toBe('ahora')
    expect(relativeTime('2026-10-14T11:55:00Z', now)).toBe('hace 5 min')
    expect(relativeTime('2026-10-14T09:00:00Z', now)).toBe('hace 3 h')
    expect(relativeTime('2026-10-13T11:00:00Z', now)).toBe('ayer')
    expect(relativeTime('2026-10-10T12:00:00Z', now)).toBe('hace 4 días')
  })
})

describe('selección para borrar', () => {
  it('solo ids que existen y sin repetir', () => {
    const list = [n('1', 'other', '2026-10-14T10:00:00Z'), n('2', 'other', '2026-10-14T10:00:00Z')]
    expect(selectionIds(list, new Set(['2', 'zzz']))).toEqual(['2'])
  })
})
