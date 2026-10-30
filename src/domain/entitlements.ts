// Preparación para un FUTURO modelo por planes (BLOQUE 9 del encargo «Contactos, Gestión de grupos e importaciones inteligentes», 30/10/2026).
// IMPORTANTE: hoy NO existe ningún plan, precio ni límite. Este módulo solo deja un único punto donde, más adelante, se podrá preguntar «¿esta familia tiene incluida esta
// función?». Mientras no se decida el modelo comercial, la respuesta es SIEMPRE «sí»: no bloquea a ninguna persona actual y no inventa precios, planes ni cupos.
//
// Cuando exista un modelo real, solo habrá que cambiar `checkEntitlement` (y llamarlo en los puntos de entrada de cada función); el resto de la app no cambia.
// Decisiones comerciales pendientes (NO implementadas, documentadas en docs/FREEMIUM_PREPARACION.md): suscripción familiar; número de miembros (hoy sin límite, a revisar);
// posibles planes Gratis, Flexible y Completo; conexiones bancarias incluidas con límite y suplemento por las adicionales; acceso limitado a módulos relacionados
// (por ejemplo, organizar un evento desde Gestión de grupos como prueba del módulo Eventos: solo se documenta, no se limita).

/** Funciones que en el futuro podrían depender del plan. La lista es de referencia; añadir una clave no cambia ningún comportamiento. */
export const FEATURE_KEYS = [
  'grupos.formularios',
  'grupos.contactos-whatsapp',
  'grupos.compartir-contactos',
  'grupos.responsables-codigo',
  'grupos.evento-desde-grupo',
  'eventos.crear',
  'economia.conexion-bancaria',
  'familia.miembros',
] as const

export type FeatureKey = (typeof FEATURE_KEYS)[number]

export interface EntitlementContext {
  /** Espacio (familia) que pregunta. Hoy no se usa. */
  familyId?: string
}

export interface EntitlementResult {
  allowed: true
  /** Hoy solo hay un motivo: no hay ningún modelo comercial activo. */
  reason: 'sin-modelo-comercial'
}

/** ¿Tiene esta familia incluida esta función? Hoy: siempre sí. No hay planes, precios ni límites. */
export function checkEntitlement(_feature: FeatureKey, _ctx: EntitlementContext = {}): EntitlementResult {
  return { allowed: true, reason: 'sin-modelo-comercial' }
}
