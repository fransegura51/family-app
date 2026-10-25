import { HELP_CARDS, HELP_MODULES } from '@/help/catalog'
import { EXPLAINERS } from '@/help/explainers'
import { PLANNED_SERIES, type PlannedSeries } from '@/help/tours/planned'
import { TOURS } from '@/help/tours/registry'
import { SERIES, type TutorialSeries } from '@/help/tours/series'
import type { TourDef } from '@/help/tours/types'
import type { HelpModule, HelpModuleId } from '@/help/types'

// Catálogo MAESTRO de la Ayuda: vincula, por sección, sus fichas, su visita guiada («Conoce esta sección»), sus tutoriales («Enséñame») y sus explicaciones («Cómo funciona PEPA»).
// No guarda nada nuevo: se calcula con los registros existentes, así que no puede desfasarse. Lo usan la interfaz (para decidir qué mostrar) y el Centro de Administración y las
// pruebas (para detectar secciones sin visita, tutoriales huérfanos, etc.). Un tutorial o visita que NO esté registrado aquí no existe para nadie: nunca se enseña «próximamente».
export type SectionStatus = 'operativa' | 'parcial' | 'no-disponible'

export interface SectionInventory {
  module: HelpModule
  status: SectionStatus
  cards: number
  /** Visitas guiadas de la sección (normalmente una; Ayuda tiene dos: la Ayuda y el Buzón). */
  visits: TourDef[]
  tutorials: TourDef[]
  /** Tutoriales principales («Enséñame») de la sección, con sus capítulos. */
  series: TutorialSeries[]
  /** Recorridos planificados: la función aún no está terminada o validada (no se ofrecen a las familias). */
  planned: PlannedSeries[]
  explainers: number
}

export const visitsOf = (id: HelpModuleId): TourDef[] => TOURS.filter((t) => t.kind === 'visit' && t.module === id)
export const tutorialsOf = (id: HelpModuleId): TourDef[] => TOURS.filter((t) => (t.kind ?? 'tutorial') === 'tutorial' && t.module === id)
export const seriesOf = (id: HelpModuleId): TutorialSeries[] => SERIES.filter((s) => s.module === id)
export const plannedOf = (id: HelpModuleId): PlannedSeries[] => PLANNED_SERIES.filter((s) => s.module === id)
export const explainersOf = (id: HelpModuleId) => EXPLAINERS.filter((e) => e.module === id)

export function sectionStatus(id: HelpModuleId): SectionStatus {
  const cards = HELP_CARDS.filter((c) => c.module === id)
  if (cards.length === 0 || cards.every((c) => c.state === 'desactivada')) return 'no-disponible'
  return cards.some((c) => c.state !== 'disponible') ? 'parcial' : 'operativa'
}

export function sectionInventory(): SectionInventory[] {
  return HELP_MODULES.map((module) => ({
    module,
    status: sectionStatus(module.id),
    cards: HELP_CARDS.filter((c) => c.module === module.id).length,
    visits: visitsOf(module.id),
    tutorials: tutorialsOf(module.id),
    series: seriesOf(module.id),
    planned: plannedOf(module.id),
    explainers: explainersOf(module.id).length,
  }))
}
