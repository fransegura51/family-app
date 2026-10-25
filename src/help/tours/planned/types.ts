import type { HelpModuleId } from '@/help/types'

// Recorridos PLANIFICADOS: tutoriales de funciones que todavía están en desarrollo o sin validar. Figuran en el mapa de Ayuda (Centro de Administración → Ayuda) pero NO se ofrecen
// a las familias hasta que se terminen. Cuando la función esté lista, se convierten en una serie normal (src/help/tours/series) sin reorganizar nada más.
export interface PlannedSeries {
  id: string
  module: HelpModuleId
  title: string
  /** Qué cubrirá, en una línea. */
  summary: string
  /** Qué debe estar terminado o validado antes de poder escribirlo. */
  blockedBy: string
}
