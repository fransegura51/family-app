import type { HelpAccessRule, HelpModuleId } from '@/help/types'

// Un TUTORIAL PRINCIPAL («Enséñame») = una serie de CAPÍTULOS. Cada capítulo es un `TourDef` de siempre (src/help/tours/types.ts): mismos pasos, mismas marcas, mismo motor y el
// progreso se guarda por capítulo con su identificador. La serie solo los agrupa y ordena: no tiene pasos propios.
//  - Los capítulos que ya existían CONSERVAN su identificador (progreso y enlaces antiguos siguen valiendo).
//  - Un tutorial antiguo que se fusiona en otro desaparece y su identificador pasa a src/help/tours/aliases (apunta al capítulo que lo cubre).
export interface TutorialSeries {
  /** Identificador estable ([a-z0-9-]+). Convención: `ser-<modulo>-<tema>`. */
  id: string
  module: HelpModuleId
  title: string
  /** Una línea para el catálogo «¿Qué quieres aprender a hacer?». */
  summary: string
  /** Identificadores de los capítulos (TourDef de tipo tutorial), EN ORDEN de aprendizaje. */
  chapters: string[]
  /** Fichas de Ayuda que llevan a esta serie (además del `cardId` de cada capítulo). */
  cardIds?: string[]
  /** Palabras con las que la gente lo buscaría. */
  synonyms?: string[]
  /** Quién puede hacerla (además del acceso al módulo y de la regla propia de cada capítulo). */
  access?: HelpAccessRule
}

export type { HelpModuleId }
