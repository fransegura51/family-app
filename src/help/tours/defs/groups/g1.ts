import { visitaCalendario } from '@/help/tours/defs/g1/visitaCalendario'
import {
  tutCalendarioBorrarApunte,
  tutCalendarioCambiarSerie,
  tutCalendarioCambiarVista,
  tutCalendarioConsultarApunte,
  tutCalendarioEditarEvento,
  tutCalendarioEventoRecordatorio,
  tutCalendarioEventoRepetitivo,
  tutCalendarioFiltrarPersona,
  tutCalendarioGuardarEvento,
  tutCalendarioMarcarHecho,
  tutCalendarioNotaPersonal,
  tutCalendarioPuntos,
  tutCalendarioUbicacionAdjuntos,
} from '@/help/tours/defs/g1/calendarTutorials'
import type { TourDef } from '@/help/tours/types'

// Visita guiada («Conoce esta sección») y capítulos («Enséñame») del grupo g1: Calendario. El capítulo 1 de «Crear eventos y tareas» (`cal-crear-evento`) se registra aparte (registry.ts);
// los de g8/calendario.ts (Días y meses, Personas y categorías, Compartir, Calendarios externos) en g8. Las series que los agrupan están en src/help/tours/series/a.ts.
export const TOURS_G1: TourDef[] = [
  visitaCalendario,
  tutCalendarioCambiarVista,
  tutCalendarioFiltrarPersona,
  tutCalendarioNotaPersonal,
  tutCalendarioEventoRepetitivo,
  tutCalendarioEventoRecordatorio,
  tutCalendarioPuntos,
  tutCalendarioUbicacionAdjuntos,
  tutCalendarioGuardarEvento,
  tutCalendarioConsultarApunte,
  tutCalendarioMarcarHecho,
  tutCalendarioEditarEvento,
  tutCalendarioCambiarSerie,
  tutCalendarioBorrarApunte,
]
