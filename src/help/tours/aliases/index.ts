import { ALIASES_A } from '@/help/tours/aliases/a'
import { ALIASES_B } from '@/help/tours/aliases/b'
import { ALIASES_C } from '@/help/tours/aliases/c'
import { ALIASES_D } from '@/help/tours/aliases/d'
import { ALIASES_E } from '@/help/tours/aliases/e'
import { ALIASES_F } from '@/help/tours/aliases/f'

// Identificadores antiguos → capítulo que los sustituye. Se resuelven en `getTour` (registro), en el progreso guardado (prefs) y en las sugerencias finales de cada recorrido, así que
// ni los enlaces ni lo ya completado se pierden al fusionar tutoriales.
export const TOUR_ALIASES: Readonly<Record<string, string>> = { ...ALIASES_A, ...ALIASES_B, ...ALIASES_C, ...ALIASES_D, ...ALIASES_E, ...ALIASES_F }

/** Identificadores antiguos que hoy apuntan a este capítulo (para leer el progreso que tenían guardado). */
export function legacyIdsOf(tourId: string): string[] {
  return Object.entries(TOUR_ALIASES)
    .filter(([, to]) => to === tourId)
    .map(([from]) => from)
}
