import { getTour } from '@/help/tours/registry'
import { SERIES_A } from '@/help/tours/series/a'
import { SERIES_B } from '@/help/tours/series/b'
import { SERIES_C } from '@/help/tours/series/c'
import { SERIES_D } from '@/help/tours/series/d'
import { SERIES_E } from '@/help/tours/series/e'
import { SERIES_F } from '@/help/tours/series/f'
import { SERIES_G } from '@/help/tours/series/g'
import type { TutorialSeries } from '@/help/tours/series/types'
import type { TourDef } from '@/help/tours/types'

export type { TutorialSeries }

// Todos los tutoriales principales. Un tutorial («Enséñame») que no pertenezca a ninguna serie no se ofrece en el catálogo (una prueba lo impide).
export const SERIES: readonly TutorialSeries[] = [...SERIES_A, ...SERIES_B, ...SERIES_C, ...SERIES_D, ...SERIES_E, ...SERIES_F, ...SERIES_G]

export const SERIES_BY_ID = new Map(SERIES.map((s) => [s.id, s]))

/** Serie a la que pertenece un capítulo (el identificador puede ser uno antiguo: se resuelve por alias en `getTour`). */
export function seriesOfChapter(tourId: string | undefined): TutorialSeries | undefined {
  const t = getTour(tourId)
  return t ? SERIES.find((s) => s.chapters.includes(t.id)) : undefined
}

export function chaptersOf(series: TutorialSeries): TourDef[] {
  return series.chapters.flatMap((id) => {
    const t = getTour(id)
    return t ? [t] : []
  })
}

export interface ChapterPosition {
  series: TutorialSeries
  /** Posición (0 = primero) dentro de la serie. */
  index: number
  total: number
  prev?: TourDef
  next?: TourDef
}

export function chapterPosition(tourId: string | undefined): ChapterPosition | undefined {
  const series = seriesOfChapter(tourId)
  const t = getTour(tourId)
  if (!series || !t) return undefined
  const chapters = chaptersOf(series)
  const index = chapters.findIndex((c) => c.id === t.id)
  return { series, index, total: chapters.length, prev: chapters[index - 1], next: chapters[index + 1] }
}

export function seriesSeconds(series: TutorialSeries): number {
  return chaptersOf(series).reduce((n, c) => n + c.durationSec, 0)
}
