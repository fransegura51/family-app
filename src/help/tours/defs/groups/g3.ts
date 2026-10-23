import type { TourDef } from '@/help/tours/types'
import { TOURS_COCINA } from '@/help/tours/defs/g3/cocina'
import { TOURS_PEQUENOS } from '@/help/tours/defs/g3/pequenos'

// Visitas guiadas («Conoce esta sección») y tutoriales («Enséñame») del grupo g3: La cocina de Pepa y Pequeños Grandes.
export const TOURS_G3: TourDef[] = [...TOURS_COCINA, ...TOURS_PEQUENOS]
