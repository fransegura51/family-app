import type { TourDef } from '@/help/tours/types'
import { TOURS_F_AVISOS } from '@/help/tours/defs/f/avisos'
import { TOURS_F_CUENTAS } from '@/help/tours/defs/f/cuentas'
import {
  tutEconomiaModoCuentas,
  tutEconomiaMesContable,
} from '@/help/tours/defs/g10/ajustes'
import { tutAyudaResenas } from '@/help/tours/defs/g10/cuentas'

// Grupo g10: ajustes de Configuración (Pepa, Economía), reseñas de la Ayuda y, en defs/f, Avisos y Cuentas (visitas y capítulos de «Tus avisos» y «Proteger mi cuenta»).
export const TOURS_G10: TourDef[] = [
  ...TOURS_F_AVISOS,
  ...TOURS_F_CUENTAS,
  tutEconomiaMesContable,
  tutEconomiaModoCuentas,
  tutAyudaResenas,
]
