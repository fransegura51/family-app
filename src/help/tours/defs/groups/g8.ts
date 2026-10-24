import type { TourDef } from '@/help/tours/types'
import { tutCalendarioCompartir, tutCalendarioGoogle, tutCalendarioParaQuien, tutCalendarioSaltarFecha } from '@/help/tours/defs/g8/calendario'
import { tutComprasCompartir, tutComprasTiendas } from '@/help/tours/defs/g8/compras'

// Tutoriales «Enséñame» del grupo g8: Calendario (Google/enlaces, ¿Para quién?, compartir, ir a una fecha) y Compras (tiendas, compartir la lista).
export const TOURS_G8: TourDef[] = [tutCalendarioGoogle, tutCalendarioParaQuien, tutCalendarioCompartir, tutCalendarioSaltarFecha, tutComprasTiendas, tutComprasCompartir]
