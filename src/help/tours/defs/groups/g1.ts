import { visitaCalendario } from '@/help/tours/defs/g1/visitaCalendario'
import {
  tutCalendarioCambiarVista,
  tutCalendarioEditarEvento,
  tutCalendarioEventoRecordatorio,
  tutCalendarioEventoRepetitivo,
  tutCalendarioFiltrarPersona,
  tutCalendarioMarcarHecho,
  tutCalendarioNotaPersonal,
  tutCalendarioPuntos,
  tutCalendarioTareaRepetitiva,
} from '@/help/tours/defs/g1/calendarTutorials'
import type { TourDef } from '@/help/tours/types'

// Visitas guiadas («Conoce esta sección») y tutoriales («Enséñame») del grupo g1: Calendario. Los pilotos `cal-crear-evento` y `cal-crear-tarea` se registran aparte (registry.ts).
export const TOURS_G1: TourDef[] = [
  visitaCalendario,
  tutCalendarioCambiarVista,
  tutCalendarioFiltrarPersona,
  tutCalendarioMarcarHecho,
  tutCalendarioEditarEvento,
  tutCalendarioEventoRepetitivo,
  tutCalendarioTareaRepetitiva,
  tutCalendarioEventoRecordatorio,
  tutCalendarioPuntos,
  tutCalendarioNotaPersonal,
]
