import { HELP_MODULE_BY_ID } from '@/help/catalog'
import { getTourProgress } from '@/help/prefs'
import { normalizeText, root, stem } from '@/help/search/normalize'
import { SERIES, chaptersOf } from '@/help/tours/series'
import type { TutorialSeries } from '@/help/tours/series/types'
import type { TourDef } from '@/help/tours/types'

// Búsqueda y progreso de los tutoriales principales («Enséñame»). Se usa en el catálogo «¿Qué quieres aprender a hacer?» y en la búsqueda general de Ayuda para llevar a la persona
// al capítulo exacto (no solo a la serie). Todo sale de los registros: no hay nada escrito a mano aquí.

export interface SeriesHit {
  series: TutorialSeries
  /** Capítulos que encajan con lo escrito (vacío = encaja la serie entera, no un capítulo concreto). */
  chapters: TourDef[]
  score: number
}

function tokens(text: string): string[] {
  return normalizeText(text).split(' ').filter(Boolean)
}

function matches(word: string, hay: string[]): boolean {
  const w = stem(word)
  const r = root(word)
  return hay.some((h) => h === word || stem(h) === w || (r.length >= 4 && root(h) === r) || (word.length >= 4 && h.startsWith(word)))
}

const FILLER = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'o', 'un', 'una', 'para', 'por', 'con', 'en', 'a', 'al', 'como', 'que', 'mi', 'mis', 'tu', 'tus', 'quiero', 'hacer', 'aprender', 'ensename', 'ensenarme'])

/**
 * Series (y capítulos) que responden a una búsqueda. `canDoSeries`/`canDoChapter` esconden lo que la persona no puede hacer. Sin texto devuelve todas las series permitidas.
 */
export function searchSeries(query: string, opts: { canDoSeries: (id: string) => boolean; canDoChapter: (id: string) => boolean }): SeriesHit[] {
  const words = tokens(query).filter((w) => !FILLER.has(w))
  const out: SeriesHit[] = []
  for (const series of SERIES) {
    if (!opts.canDoSeries(series.id)) continue
    const chapters = chaptersOf(series).filter((c) => opts.canDoChapter(c.id))
    if (chapters.length === 0) continue
    if (words.length === 0) {
      out.push({ series, chapters: [], score: 0 })
      continue
    }
    const moduleLabel = HELP_MODULE_BY_ID.get(series.module)?.label ?? ''
    const serHay = tokens(`${series.title} ${series.summary} ${(series.synonyms ?? []).join(' ')} ${moduleLabel}`)
    const hits = chapters.filter((c) => {
      const hay = tokens(`${c.title} ${c.summary ?? ''} ${c.group ?? ''}`)
      return words.every((w) => matches(w, hay) || matches(w, serHay))
    })
    const serieAll = words.every((w) => matches(w, serHay))
    if (!serieAll && hits.length === 0) continue
    // Un capítulo sugerido solo si la búsqueda encaja con él más que con toda la serie.
    const own = hits.filter((c) => words.some((w) => matches(w, tokens(`${c.title} ${c.summary ?? ''}`))))
    out.push({ series, chapters: serieAll && own.length === chapters.length ? [] : own, score: (serieAll ? 2 : 0) + own.length })
  }
  return out.sort((a, b) => b.score - a.score)
}

export interface SeriesProgress {
  total: number
  done: number
  started: boolean
  /** Primer capítulo que aún no se ha completado (con el que «Continuar» sigue), o el primero si no hay ninguno hecho. */
  next: TourDef | undefined
  complete: boolean
}

export function chapterDone(t: TourDef): boolean {
  const p = getTourProgress(t.id)
  return Boolean(p && p.status === 'completed' && p.version >= t.version)
}

export function seriesProgress(series: TutorialSeries, canDoChapter: (id: string) => boolean = () => true): SeriesProgress {
  const chapters = chaptersOf(series).filter((c) => canDoChapter(c.id))
  const done = chapters.filter(chapterDone).length
  const started = done > 0 || chapters.some((c) => getTourProgress(c.id)?.status === 'started')
  return { total: chapters.length, done, started, next: chapters.find((c) => !chapterDone(c)) ?? chapters[0], complete: chapters.length > 0 && done === chapters.length }
}
