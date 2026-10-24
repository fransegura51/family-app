import { tutIniMenuYBarra, tutIniPepaTeAvisa } from '@/help/tours/defs/g7/inicio'
import { TOURS_PEPA } from '@/help/tours/defs/g7/pepa'
import type { TourDef } from '@/help/tours/types'

// Grupo g7: Inicio (PEPA te avisa, menú y barra) y Hablar con PEPA (visita y tutoriales).
export const TOURS_G7: TourDef[] = [tutIniPepaTeAvisa, tutIniMenuYBarra, ...TOURS_PEPA]
