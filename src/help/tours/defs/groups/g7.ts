import { TOURS_INICIO_G7 } from '@/help/tours/defs/g7/inicio'
import { TOURS_PEPA } from '@/help/tours/defs/g7/pepa'
import type { TourDef } from '@/help/tours/types'

// Grupo g7: Inicio (barra y menú, secciones fijas y carrusel) y Hablar con PEPA (visita y capítulos).
export const TOURS_G7: TourDef[] = [...TOURS_INICIO_G7, ...TOURS_PEPA]
