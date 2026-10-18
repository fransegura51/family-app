// Reseñas y opiniones de la app: estrellas de 1 a 5 por sección y «lo que me gusta / lo que no me gusta». Aparte del Buzón de sugerencias (que es para proponer cambios).
import { NAV_TABS, navSectionId } from '@/domain/navTabs'

export interface ReviewSection {
  id: string
  label: string
  icon: string
}

export const GENERAL_SECTION: ReviewSection = { id: 'general', label: 'La app en general', icon: '⭐' }

// Cada sección de la navegación (menos Inicio), con el mismo nombre e icono que en el menú.
export const REVIEW_SECTIONS: ReviewSection[] = [
  { id: 'inicio', label: 'Inicio', icon: '🏠' },
  ...NAV_TABS.filter((t) => t.to !== '/').map((t) => ({ id: navSectionId(t), label: t.label, icon: t.icon })),
]

export const REVIEW_TEXT_MAX = 1000

export interface AppReview {
  id: string
  familyId: string
  profileId: string
  section: string
  stars: number
  liked: string | null
  disliked: string | null
  updatedAt: string
}

export function isValidStars(value: unknown): value is 1 | 2 | 3 | 4 | 5 {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
}

// Texto opcional: vacío → null (no se guarda un comentario en blanco); se recorta al máximo permitido.
export function cleanReviewText(text: string | null | undefined): string | null {
  const t = (text ?? '').trim()
  return t === '' ? null : t.slice(0, REVIEW_TEXT_MAX)
}

export function sectionLabel(id: string): string {
  if (id === GENERAL_SECTION.id) return GENERAL_SECTION.label
  return REVIEW_SECTIONS.find((s) => s.id === id)?.label ?? id
}

export interface SectionSummary {
  section: string
  count: number
  average: number
}

// Media (un decimal) y número de valoraciones por sección, de mejor a peor media; las secciones sin valoraciones no aparecen.
export function summarizeReviews(reviews: Pick<AppReview, 'section' | 'stars'>[]): SectionSummary[] {
  const bySection = new Map<string, number[]>()
  for (const r of reviews) {
    if (!isValidStars(r.stars)) continue
    bySection.set(r.section, [...(bySection.get(r.section) ?? []), r.stars])
  }
  return [...bySection.entries()]
    .map(([section, stars]) => ({ section, count: stars.length, average: Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10 }))
    .sort((a, b) => b.average - a.average || b.count - a.count)
}

export function starsText(stars: number): string {
  return `${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}`
}
