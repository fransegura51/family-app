// Tutoriales principales («series») y capítulos: reglas de estructura, compatibilidad con los identificadores antiguos y recorridos planificados.
import { describe, expect, it } from 'vitest'
import { HELP_CARD_BY_ID, HELP_MODULE_BY_ID } from '@/help/catalog'
import { TOUR_ALIASES } from '@/help/tours/aliases'
import { PLANNED_SERIES } from '@/help/tours/planned'
import { getTour, TOURS } from '@/help/tours/registry'
import { chapterPosition, chaptersOf, SERIES, seriesOfChapter, seriesSeconds } from '@/help/tours/series'

const tutorials = TOURS.filter((t) => (t.kind ?? 'tutorial') === 'tutorial')

describe('series: tutoriales principales con capítulos', () => {
  it('hay series, con identificadores únicos y válidos', () => {
    expect(SERIES.length).toBeGreaterThan(0)
    const ids = SERIES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of SERIES) expect(s.id, s.id).toMatch(/^ser-[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('cada serie declara módulo real, título, resumen y capítulos que existen y son tutoriales', () => {
    for (const s of SERIES) {
      expect(HELP_MODULE_BY_ID.has(s.module), `${s.id}: módulo`).toBe(true)
      expect(s.title.length, `${s.id}: título`).toBeGreaterThan(3)
      expect(s.summary.length, `${s.id}: resumen`).toBeGreaterThan(10)
      expect(s.chapters.length, `${s.id}: capítulos`).toBeGreaterThan(0)
      expect(new Set(s.chapters).size, `${s.id}: capítulos repetidos`).toBe(s.chapters.length)
      for (const id of s.chapters) {
        const t = TOURS.find((x) => x.id === id)
        expect(t, `${s.id}: el capítulo ${id} no existe (o es un identificador antiguo: usa el nuevo)`).toBeTruthy()
        expect(t!.kind ?? 'tutorial', `${s.id}/${id}: un capítulo es un tutorial, no una visita`).toBe('tutorial')
        expect(t!.module, `${s.id}/${id}: el capítulo es de otro módulo`).toBe(s.module)
      }
      for (const c of s.cardIds ?? []) expect(HELP_CARD_BY_ID.has(c), `${s.id}: ficha ${c}`).toBe(true)
    }
  })

  it('TODO tutorial pertenece a exactamente una serie (nada queda huérfano ni repetido)', () => {
    const count = new Map<string, number>()
    for (const s of SERIES) for (const id of s.chapters) count.set(id, (count.get(id) ?? 0) + 1)
    const orphans = tutorials.filter((t) => !count.has(t.id)).map((t) => t.id)
    const repeated = [...count.entries()].filter(([, n]) => n > 1).map(([id]) => id)
    expect(orphans, `Tutoriales sin serie: ${orphans.join(', ')}`).toEqual([])
    expect(repeated, `Capítulos en más de una serie: ${repeated.join(', ')}`).toEqual([])
  })

  it('capítulos de 2 minutos como máximo y recorrido completo razonable (≤ 9 min)', () => {
    for (const s of SERIES) {
      for (const c of chaptersOf(s)) expect(c.durationSec, `${c.id}`).toBeLessThanOrEqual(120)
      expect(seriesSeconds(s), `${s.id}: recorrido completo demasiado largo`).toBeLessThanOrEqual(540)
    }
  })

  it('cada capítulo tiene resumen y el orden de la serie permite ir al anterior y al siguiente', () => {
    for (const s of SERIES) {
      const chs = chaptersOf(s)
      chs.forEach((c, i) => {
        expect(c.summary?.length ?? 0, `${c.id}: falta el resumen del capítulo`).toBeGreaterThan(10)
        const pos = chapterPosition(c.id)!
        expect(pos.series.id).toBe(s.id)
        expect(pos.index).toBe(i)
        expect(pos.prev?.id).toBe(chs[i - 1]?.id)
        expect(pos.next?.id).toBe(chs[i + 1]?.id)
        expect(seriesOfChapter(c.id)?.id).toBe(s.id)
      })
    }
  })

  it('las series del mismo módulo no repiten título', () => {
    const seen = new Set<string>()
    for (const s of SERIES) {
      const k = `${s.module}:${s.title}`
      expect(seen.has(k), k).toBe(false)
      seen.add(k)
    }
  })
})

describe('alias de identificadores antiguos', () => {
  it('un alias apunta a un capítulo que existe, nunca a otro alias, y el identificador antiguo ya no es un tutorial propio', () => {
    for (const [from, to] of Object.entries(TOUR_ALIASES)) {
      expect(TOURS.some((t) => t.id === from), `${from} sigue existiendo como tutorial: quita el alias o el tutorial`).toBe(false)
      expect(TOURS.some((t) => t.id === to), `${from} → ${to}: el destino no existe`).toBe(true)
      expect(TOUR_ALIASES[to], `${from} → ${to}: cadena de alias`).toBeUndefined()
      expect(getTour(from)?.id, from).toBe(to)
    }
  })

  it('formato de identificador válido (progreso y enlaces)', () => {
    for (const [from, to] of Object.entries(TOUR_ALIASES)) {
      expect(from).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(to).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })
})

describe('recorridos planificados (funciones sin terminar)', () => {
  it('no se ofrecen como series, tienen módulo real y dicen qué falta por terminar', () => {
    const real = new Set(SERIES.map((s) => s.id))
    for (const p of PLANNED_SERIES) {
      expect(real.has(p.id), `${p.id} ya existe como serie: quítalo de los planificados`).toBe(false)
      expect(HELP_MODULE_BY_ID.has(p.module), p.id).toBe(true)
      expect(p.title.length, p.id).toBeGreaterThan(3)
      expect(p.blockedBy.length, `${p.id}: indica qué debe terminarse antes`).toBeGreaterThan(10)
    }
    const ids = PLANNED_SERIES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
