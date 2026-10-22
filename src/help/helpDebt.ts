// DEUDA DOCUMENTAL conocida de la Ayuda (AYUDA-01). Sirve de «trinquete»: lo que ya estaba sin documentar el 23/10/2026 queda aquí identificado y NO bloquea ninguna publicación; pero
// cualquier función nueva o modificada que no tenga su ficha (o cuya cobertura empeore) SÍ hace fallar las pruebas. Al documentar algo de esta lista, se quita de aquí.
// No añadir funciones nuevas a esta lista para esquivar la regla: documentar la función es lo que toca.

/** Funciones del inventario sin ficha de Ayuda para familias porque son herramientas internas de la administración de PEPA (se explican en el propio Centro de Administración). */
export const INTERNAL_ADMIN_FEATURES: readonly string[] = ['admin-centro', 'admin-errores', 'admin-invitaciones-familia', 'admin-automatizaciones']

/** Funciones operativas o parciales que todavía no tienen sus puntos clave de Ayuda definidos («pendiente de revisión»). Vacío = no hay deuda. */
export const FEATURES_PENDING_HELP_REVIEW: readonly string[] = ['admin-errores', 'admin-invitaciones-familia', 'admin-automatizaciones']

/** Piso de la cobertura: nº de funciones con la Ayuda «completa». Si baja, algo de la Ayuda se ha roto o se ha cambiado sin actualizarla. Se SUBE al mejorar la Ayuda. */
export const MIN_FEATURES_WITH_COMPLETE_HELP = 38

/** Piso de fichas completas (pasos + «Llévame»). Se sube al completar fichas. */
export const MIN_COMPLETE_CARDS = 17
