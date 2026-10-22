import type { HelpModuleId } from '@/help/types'

// Inventario privado de funcionalidades de PEPA (área «Estado de funcionalidades» del Centro de Administración). Solo lo ven las administradoras de PEPA.
//
// REGLAS (para que el inventario siga siendo fiable y mantenible):
//  - Nada se inventa: cada función cita los archivos del repositorio que lo demuestran (`evidence`) y una prueba automática las comprueba (existen).
//  - «Estado de la función» y «cobertura de la Ayuda» son cosas distintas: que la Ayuda esté incompleta NO significa que la función esté a medias.
//  - La cobertura de la Ayuda NO se escribe a mano: se calcula buscando los `terms` de cada función en el texto real de la Ayuda de su módulo (src/help). Si la Ayuda cambia, cambia sola.
//  - Lo que depende de producción o de un dispositivo y no se puede comprobar leyendo el código se marca «no verificable»: nunca se da por hecho.

// operativa = hace lo que promete; parcial = funciona pero le falta algo concreto (se explica en `missing`); desactivada = existe pero está apagada o sin pantalla.
export type FeatureState = 'operativa' | 'parcial' | 'desactivada'

// probada = hay pruebas automáticas en el repositorio (`tests`); revisada = se leyó el código y se comprobó, sin prueba automática; no_verificable = depende de producción,
// del despliegue o de un dispositivo y no se puede comprobar desde el código.
export type FeatureVerification = 'probada' | 'revisada' | 'no_verificable'

// completa = todos los puntos clave de la función aparecen en la Ayuda; parcial = solo algunos; inexistente = ninguno (la sección de Ayuda existe pero no lo cuenta, o no hay sección);
// pendiente = todavía no se han definido los puntos clave para calcularlo (hay que revisarlo).
export type HelpCoverage = 'completa' | 'parcial' | 'inexistente' | 'pendiente'

export interface FeatureEntry {
  id: string
  module: string
  name: string
  state: FeatureState
  /** Qué hace hoy. */
  works: string
  /** Qué le falta (obligatorio si no está operativa). */
  missing?: string
  /** Limitaciones y dependencias (otra función, un servicio externo, un interruptor, una migración…). */
  limits?: string
  verification: FeatureVerification
  verificationNote: string
  /** Fecha (AAAA-MM-DD) en que se revisó esta ficha por última vez. */
  reviewed: string
  /** Archivos del repositorio que lo demuestran (rutas desde la raíz del proyecto). */
  evidence: string[]
  /** Pruebas automáticas (obligatorio si la verificación es «probada»). */
  tests?: string[]
  /** Ayuda: módulo de la Ayuda donde debería contarse (null = aún sin revisar) y puntos clave que deben aparecer en su texto. */
  help: { module: HelpModuleId | null; terms: string[] }
}

export const FEATURE_STATE_LABEL: Record<FeatureState, string> = {
  operativa: 'Operativa',
  parcial: 'Parcial',
  desactivada: 'Desactivada',
}

export const FEATURE_VERIFICATION_LABEL: Record<FeatureVerification, string> = {
  probada: 'Probada con pruebas automáticas',
  revisada: 'Revisada en el código',
  no_verificable: 'No verificable desde el código',
}

export const HELP_COVERAGE_LABEL: Record<HelpCoverage, string> = {
  completa: 'Completa',
  parcial: 'Parcial',
  inexistente: 'Inexistente',
  pendiente: 'Pendiente de revisión',
}
