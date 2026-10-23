import { TOURS_BUZON } from '@/help/tours/defs/g5/buzon'
import { TOURS_CONFIGURACION } from '@/help/tours/defs/g5/configuracion'
import { TOURS_FAMILIA } from '@/help/tours/defs/g5/familia'
import { TOURS_UBICACION } from '@/help/tours/defs/g5/ubicacion'
import type { TourDef } from '@/help/tours/types'

// Visitas guiadas («Conoce esta sección») y tutoriales («Enséñame») del grupo g5: Familia, Configuración (con los avisos), Buzón de sugerencias y Ubicación.
// Reseñas y opiniones no tiene tutorial: cada toque en las estrellas guarda y publica una valoración al momento.
export const TOURS_G5: TourDef[] = [...TOURS_FAMILIA, ...TOURS_CONFIGURACION, ...TOURS_UBICACION, ...TOURS_BUZON]
