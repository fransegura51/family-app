// @vitest-environment jsdom
// Progreso por capítulo (con compatibilidad con los identificadores antiguos), búsqueda de tutoriales y resolución de alias.
import { beforeEach, describe, expect, it } from 'vitest'
import { getTourProgress, markTourProgress, setTourProgress, tourProgressKey } from '@/help/prefs'
import { legacyIdsOf, TOUR_ALIASES } from '@/help/tours/aliases'
import { getTour } from '@/help/tours/registry'
import { chaptersOf, SERIES } from '@/help/tours/series'
import { chapterDone, searchSeries, seriesProgress } from '@/help/tours/series/search'

beforeEach(() => localStorage.clear())

const aliasEntry = Object.entries(TOUR_ALIASES).find(([from, to]) => from !== to && getTour(to))

describe('progreso guardado', () => {
  it.skipIf(!aliasEntry)('un tutorial antiguo ya completado cuenta como hecho en el capítulo que lo sustituye', () => {
    const [old, current] = aliasEntry!
    const tour = getTour(current)!
    localStorage.setItem(tourProgressKey(old), JSON.stringify({ status: 'completed', at: '2026-09-01', version: tour.version }))
    expect(getTourProgress(current)?.status).toBe('completed')
    expect(chapterDone(tour)).toBe(true)
    expect(legacyIdsOf(current)).toContain(old)
  })

  it.skipIf(!aliasEntry)('un identificador antiguo se resuelve al capítulo vigente (enlaces y fichas antiguas siguen funcionando)', () => {
    const [old, current] = aliasEntry!
    expect(getTour(old)?.id).toBe(current)
  })

  it('empezar o salir de un capítulo ya completado NO le quita el ✓', () => {
    const t = SERIES[0] && chaptersOf(SERIES[0])[0]
    expect(t).toBeTruthy()
    setTourProgress(t.id, { status: 'completed', at: '2026-09-01', version: t.version })
    markTourProgress(t.id, 'started', t.version)
    markTourProgress(t.id, 'dismissed', t.version)
    expect(getTourProgress(t.id)?.status).toBe('completed')
  })

  it('lo completado con una versión anterior sí se puede volver a ofrecer', () => {
    const t = chaptersOf(SERIES[0])[0]
    setTourProgress(t.id, { status: 'completed', at: '2026-01-01', version: t.version - 1 })
    expect(chapterDone(t)).toBe(false)
    markTourProgress(t.id, 'started', t.version)
    expect(getTourProgress(t.id)?.status).toBe('started')
  })
})

describe('progreso de una serie', () => {
  const series = SERIES.find((s) => chaptersOf(s).length >= 2)!

  it('cuenta capítulos hechos y propone seguir por el primero que falta', () => {
    const chapters = chaptersOf(series)
    expect(seriesProgress(series)).toMatchObject({ total: chapters.length, done: 0, started: false, complete: false })
    expect(seriesProgress(series).next?.id).toBe(chapters[0].id)
    setTourProgress(chapters[0].id, { status: 'completed', at: '2026-09-01', version: chapters[0].version })
    const p = seriesProgress(series)
    expect(p).toMatchObject({ done: 1, started: true, complete: false })
    expect(p.next?.id).toBe(chapters[1].id)
    for (const c of chapters) setTourProgress(c.id, { status: 'completed', at: '2026-09-01', version: c.version })
    expect(seriesProgress(series).complete).toBe(true)
  })

  it('solo cuenta los capítulos que esta persona puede hacer', () => {
    const chapters = chaptersOf(series)
    const only = new Set([chapters[0].id])
    expect(seriesProgress(series, (id) => only.has(id)).total).toBe(1)
  })
})

describe('búsqueda de tutoriales', () => {
  const all = { canDoSeries: () => true, canDoChapter: () => true }

  it('sin texto devuelve todas las series permitidas', () => {
    expect(searchSeries('', all).length).toBe(SERIES.length)
  })

  it('esconde lo que la persona no puede hacer', () => {
    expect(searchSeries('', { canDoSeries: () => false, canDoChapter: () => true })).toEqual([])
    const first = SERIES[0]
    const hits = searchSeries('', { canDoSeries: (id) => id === first.id, canDoChapter: () => true })
    expect(hits.map((h) => h.series.id)).toEqual([first.id])
  })

  it('encuentra una serie por su título y un capítulo concreto por el suyo, con singular/plural', () => {
    const s = SERIES.find((x) => chaptersOf(x).length >= 2)!
    const byTitle = searchSeries(s.title, all)
    expect(byTitle.some((h) => h.series.id === s.id)).toBe(true)
    const c = chaptersOf(s)[1]
    const byChapter = searchSeries(c.title, all)
    const hit = byChapter.find((h) => h.series.id === s.id)
    expect(hit).toBeTruthy()
  })

  it('una búsqueda sin sentido no devuelve nada', () => {
    expect(searchSeries('zzzqqqxxx', all)).toEqual([])
  })
})
