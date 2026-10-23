import { TOURS_COMPRAS } from '@/help/tours/defs/g2/compras'
import { TOURS_ECONOMIA } from '@/help/tours/defs/g2/economia'
import type { TourDef } from '@/help/tours/types'

// Visitas guiadas («Conoce esta sección») y tutoriales («Enséñame») del grupo g2: Compras y Economía.
export const TOURS_G2: TourDef[] = [...TOURS_COMPRAS, ...TOURS_ECONOMIA]
