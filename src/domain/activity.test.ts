// «Actividad reciente»: el caso real (una anotación humana + decenas de «modificó un evento» idénticas, sin persona, del mismo minuto) y las reglas para no ocultar nada legítimo.
// Y la sincronización de Google: solo escribe cuando algo cambió de verdad (la causa de las decenas de anotaciones).
import { describe, expect, it } from 'vitest'
import type { ActivityEntry } from '@/data/activity'
import { AUTOMATIC_ACTOR, describeActivity, describeActivityGroup, groupActivity } from '@/domain/activity'
import { importedEventUnchanged, type ImportedEventFields } from '../../supabase/functions/sync-calendar-from-google-cron/eventDiff'

let n = 0
const entry = (over: Partial<ActivityEntry> & { at: string }): ActivityEntry => ({
  id: `e${++n}`,
  tableName: 'calendar_events',
  action: 'update',
  createdAt: over.at,
  actorId: null,
  actorName: null,
  recordId: `r${n}`,
  ...over,
})

describe('texto de una entrada', () => {
  it('sin persona asociada ya no dice «Alguien»: dice que fue un proceso automático', () => {
    expect(describeActivity(entry({ at: '2026-10-23T15:06:00Z' }))).toBe(`${AUTOMATIC_ACTOR} modificó un evento`)
  })
  it('con persona, la nombra; con un id de persona pero sin nombre legible, «Alguien» (no se inventa nada)', () => {
    expect(describeActivity(entry({ at: '2026-10-23T15:08:00Z', actorId: 'p1', actorName: 'Jennifer', tableName: 'shopping_items', action: 'insert' }))).toBe('Jennifer creó un producto de la lista')
    expect(describeActivity(entry({ at: '2026-10-23T15:08:00Z', actorId: 'p1', actorName: null }))).toBe('Alguien modificó un evento')
  })
})

describe('el caso reportado: 1 producto creado por Jennifer + 49 modificaciones idénticas sin persona en el mismo minuto', () => {
  const rows: ActivityEntry[] = [
    entry({ at: '2026-10-23T15:08:00Z', actorId: 'p1', actorName: 'Jennifer', tableName: 'shopping_items', action: 'insert', recordId: 'prod' }),
    ...Array.from({ length: 49 }, (_, i) => entry({ at: `2026-10-23T15:06:${String(i).padStart(2, '0')}Z`.replace(/:(\d)Z/, ':0$1Z'), recordId: `ev${i}` })),
  ]

  it('se ven dos líneas: la anotación humana y UNA línea que dice cuántos eventos tocó el proceso automático', () => {
    const groups = groupActivity(rows)
    expect(groups).toHaveLength(2)
    expect(describeActivityGroup(groups[0])).toBe('Jennifer creó un producto de la lista')
    expect(groups[1].count).toBe(49)
    expect(groups[1].distinct).toBe(49)
    expect(describeActivityGroup(groups[1])).toBe(`${AUTOMATIC_ACTOR} modificó 49 eventos`)
  })

  it('con nombres legibles lista los primeros y cuenta el resto', () => {
    const groups = groupActivity(rows)
    const names = new Map(rows.slice(1, 6).map((r, i) => [r.recordId as string, `Evento ${i}`]))
    expect(describeActivityGroup(groups[1], names)).toContain('«Evento 0», «Evento 1», «Evento 2» y 46 más')
  })
})

describe('nada legítimo se oculta', () => {
  it('distintas personas, tablas o acciones nunca se juntan, aunque sean del mismo minuto', () => {
    const t = '2026-10-23T15:06:00Z'
    const rows = [
      entry({ at: t, actorId: 'a', actorName: 'Ana' }),
      entry({ at: t, actorId: 'b', actorName: 'Beto' }),
      entry({ at: t, actorId: 'b', actorName: 'Beto', tableName: 'shopping_items' }),
      entry({ at: t, actorId: 'b', actorName: 'Beto', tableName: 'shopping_items', action: 'delete' }),
    ]
    expect(groupActivity(rows)).toHaveLength(4)
  })

  it('un hueco de más de 2 minutos separa grupos aunque sea lo mismo', () => {
    const rows = [entry({ at: '2026-10-23T15:10:00Z' }), entry({ at: '2026-10-23T15:09:00Z' }), entry({ at: '2026-10-23T15:05:00Z' })]
    const groups = groupActivity(rows)
    expect(groups.map((g) => g.count)).toEqual([2, 1])
  })

  it('editar la misma ficha tres veces seguidas = un elemento y «3 cambios seguidos»', () => {
    const rows = [1, 2, 3].map((i) => entry({ at: `2026-10-23T15:0${i}:00Z`, actorId: 'a', actorName: 'Ana', recordId: 'mismo', tableName: 'family_members' }))
    const g = groupActivity(rows.reverse())[0]
    expect(g.distinct).toBe(1)
    expect(describeActivityGroup(g, new Map([['mismo', 'Eric']]))).toBe('Ana modificó un miembro: «Eric» (3 cambios seguidos)')
  })

  it('un elemento sin nombre legible (borrado, evento privado de otra persona) usa el texto genérico, sin revelar nada', () => {
    const g = groupActivity([entry({ at: '2026-10-23T15:06:00Z', actorId: 'a', actorName: 'Ana', recordId: 'privado' })])[0]
    expect(describeActivityGroup(g, new Map())).toBe('Ana modificó un evento')
  })
})

describe('sincronización de Google: solo se escribe lo que cambió', () => {
  const stored: ImportedEventFields = {
    title: 'Dentista',
    description: null,
    start_at: '2026-11-05T09:00:00+00:00',
    end_at: '2026-11-05T10:00:00+00:00',
    all_day: false,
    recurrence_rule: null,
    exception_dates: [],
  }

  it('igual (aunque la hora venga en otro formato de texto) → no se escribe', () => {
    expect(importedEventUnchanged(stored, { ...stored, start_at: '2026-11-05T09:00:00.000Z', end_at: '2026-11-05T10:00:00.000Z' })).toBe(true)
  })

  it('cualquier cambio real (título, hora, día completo, repetición, excepciones, descripción) → se escribe', () => {
    expect(importedEventUnchanged(stored, { ...stored, title: 'Dentista (cambiado)' })).toBe(false)
    expect(importedEventUnchanged(stored, { ...stored, start_at: '2026-11-05T09:30:00.000Z' })).toBe(false)
    expect(importedEventUnchanged(stored, { ...stored, all_day: true })).toBe(false)
    expect(importedEventUnchanged(stored, { ...stored, recurrence_rule: 'FREQ=WEEKLY' })).toBe(false)
    expect(importedEventUnchanged(stored, { ...stored, exception_dates: ['2026-11-12'] })).toBe(false)
    expect(importedEventUnchanged(stored, { ...stored, description: 'nota' })).toBe(false)
  })

  it('un evento que aún no estaba guardado se escribe siempre', () => {
    expect(importedEventUnchanged(undefined, stored)).toBe(false)
    expect(importedEventUnchanged(null, stored)).toBe(false)
  })
})
