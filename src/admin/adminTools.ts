import type { AdminAreaId } from '@/admin/adminAreas'
import type { AdminTabId, ModerationSection } from '@/domain/communityAdmin'
import { normalizeHelpText } from '@/admin/features/featureHelp'
import { SUPPORT_ENABLED } from '@/support/flags'

// Registro de TODAS las herramientas administrativas del Centro, para el buscador global: cada una dice en qué área está, en qué bloque plegable (grupo) y, si es de Comunidad,
// en qué pestaña (y sección de Moderación). Al elegir un resultado se abre el área, se despliega el bloque y se trae a la vista.
// MANTENIMIENTO: si se añade una herramienta al Centro, se añade aquí en el mismo cambio. Una prueba comprueba que cada grupo y cada pestaña citados existen de verdad.
export interface AdminTool {
  id: string
  label: string
  area: AdminAreaId
  /** Identificador del bloque plegable dentro del área (ver las constantes de cada área). */
  group?: string
  /** Pestaña de Comunidad (solo área «comunidad»). */
  tab?: AdminTabId
  /** Sección dentro de la pestaña Moderación. */
  seccion?: ModerationSection
  /** Palabras con las que alguien buscaría esta herramienta (sinónimos incluidos). */
  keywords: string
}

// Bloques plegables de cada área (los usa el Centro y las pruebas).
export const ADMIN_GROUP_IDS: Record<Exclude<AdminAreaId, 'funcionalidades' | 'comunidad'>, string[]> = {
  resumen: ['areas', 'funcionalidades', 'vivo', 'invitar'],
  usuarios: ['invitar-amigos', 'codigos', 'actividad', 'familias'],
  ayuda: ['cobertura', 'modulos', 'fichas', 'tutoriales', 'rutas', 'valoraciones', 'prioridades'],
  // «soporte» solo se pinta con el Soporte técnico encendido (src/support/flags.ts); el identificador del bloque existe siempre.
  sistema: ['errores', 'automatizaciones', 'soporte', 'vistas'],
}

export const ADMIN_TOOLS: AdminTool[] = [
  // Resumen
  { id: 'resumen-areas', label: 'Las seis áreas del Centro', area: 'resumen', group: 'areas', keywords: 'areas inicio panel indice' },
  { id: 'resumen-funcionalidades', label: 'Recuento de funcionalidades y Ayuda', area: 'resumen', group: 'funcionalidades', keywords: 'estado operativas parciales desactivadas cobertura ayuda recuento' },
  { id: 'resumen-vivo', label: 'Datos en vivo (familias, cuentas, errores)', area: 'resumen', group: 'vivo', keywords: 'numeros estadisticas familias cuentas contador' },
  { id: 'resumen-invitar', label: 'Invitar amigos (estado)', area: 'resumen', group: 'invitar', keywords: 'invitar amigos proximamente preparacion' },
  // Usuarios
  { id: 'usuarios-invitar-amigos', label: 'Invitar amigos: estado de la función', area: 'usuarios', group: 'invitar-amigos', keywords: 'invitar amigos proximamente no activa' },
  { id: 'usuarios-generar-codigo', label: 'Generar código de invitación para una familia nueva', area: 'usuarios', group: 'codigos', keywords: 'codigo invitacion generar crear nueva familia alta acceso 7 dias' },
  { id: 'usuarios-anular-codigo', label: 'Ver o anular códigos de invitación', area: 'usuarios', group: 'codigos', keywords: 'anular borrar codigos invitacion usado caducado disponible' },
  { id: 'usuarios-actividad', label: 'Actividad de cada cuenta y pantallas más usadas', area: 'usuarios', group: 'actividad', keywords: 'actividad uso aperturas pantallas ranking cuentas inactivas' },
  { id: 'usuarios-familias', label: 'Familias y cuentas (altas, último acceso, notificaciones)', area: 'usuarios', group: 'familias', keywords: 'familias cuentas usuarios altas ultimo acceso correo notificaciones push' },
  // Comunidad: pestañas
  { id: 'com-resumen', label: 'Comunidad: Resumen', area: 'comunidad', tab: 'resumen', keywords: 'comunidad resumen pendientes numeros panel' },
  { id: 'com-moderacion', label: 'Comunidad: Moderación', area: 'comunidad', tab: 'moderacion', keywords: 'moderacion moderar denuncias' },
  { id: 'com-denuncias', label: 'Moderación: denuncias', area: 'comunidad', tab: 'moderacion', seccion: 'denuncias', keywords: 'denuncias reportes avisos contenido ocultar advertencia' },
  { id: 'com-visitantes', label: 'Moderación: denuncias de visitantes', area: 'comunidad', tab: 'moderacion', seccion: 'visitantes', keywords: 'visitantes denuncias sin cuenta avisos' },
  { id: 'com-ocultos', label: 'Moderación: contenido oculto', area: 'comunidad', tab: 'moderacion', seccion: 'ocultos', keywords: 'ocultos ocultado restaurar contenido' },
  { id: 'com-readmisiones', label: 'Moderación: readmisiones', area: 'comunidad', tab: 'moderacion', seccion: 'readmisiones', keywords: 'readmision expulsado expulsion volver readmitir' },
  { id: 'com-eliminacion', label: 'Moderación: eliminación de contenido', area: 'comunidad', tab: 'moderacion', seccion: 'eliminacion', keywords: 'eliminar borrar contenido solicitud eliminacion' },
  { id: 'com-usuarios', label: 'Comunidad: Usuarios (alias, advertencias, expulsiones)', area: 'comunidad', tab: 'usuarios', keywords: 'usuarios alias advertencias expulsar expulsion perfiles personas' },
  { id: 'com-oficial', label: 'Comunidad: Contenido oficial (artículos, menú semanal de Pepa)', area: 'comunidad', tab: 'oficial', keywords: 'oficial articulos propuestas menu semanal pepa publicar contenido generado ia aprobar' },
  { id: 'com-temas', label: 'Comunidad: Temas propuestos', area: 'comunidad', tab: 'temas', keywords: 'temas propuestos propuestas sugerencias temas nuevos' },
  { id: 'com-encuestas', label: 'Comunidad: Encuestas', area: 'comunidad', tab: 'encuestas', keywords: 'encuestas votaciones preguntas' },
  { id: 'com-destacados', label: 'Comunidad: Destacados', area: 'comunidad', tab: 'destacados', keywords: 'destacados destacar portada' },
  { id: 'com-configuracion', label: 'Comunidad: Configuración (apertura, interruptores, parámetros)', area: 'comunidad', tab: 'configuracion', keywords: 'configuracion apertura lanzamiento interruptor parametros limites ia publica' },
  { id: 'com-historial', label: 'Comunidad: Historial de acciones de administración', area: 'comunidad', tab: 'historial', keywords: 'historial registro log acciones auditoria' },
  // Funcionalidades
  { id: 'func-inventario', label: 'Inventario de funcionalidades (buscar y filtrar)', area: 'funcionalidades', keywords: 'funcionalidades inventario funciones estado operativa parcial desactivada verificacion buscar filtrar modulos' },
  // Ayuda
  { id: 'ayuda-cobertura', label: 'Cobertura de la Ayuda por función', area: 'ayuda', group: 'cobertura', keywords: 'cobertura ayuda completa parcial inexistente pendiente' },
  { id: 'ayuda-modulos', label: 'Cobertura de la Ayuda por módulo', area: 'ayuda', group: 'modulos', keywords: 'modulos secciones ayuda apartados fichas documentacion cobertura' },
  { id: 'ayuda-fichas', label: 'Estado de las fichas de Ayuda (completas, parciales, pendientes)', area: 'ayuda', group: 'fichas', keywords: 'fichas completas parciales pendientes ayuda pasos llevame' },
  { id: 'ayuda-tutoriales', label: 'Tutoriales «Enséñame» y vídeos (disponibles y pendientes)', area: 'ayuda', group: 'tutoriales', keywords: 'tutoriales videos ensename guias recorridos candidatos pendientes' },
  { id: 'ayuda-rutas', label: 'Errores y rutas rotas de la Ayuda', area: 'ayuda', group: 'rutas', keywords: 'rutas rotas errores llevame enlaces destinos botones' },
  { id: 'ayuda-valoraciones', label: 'Valoraciones «¿Te ha servido?» (agregadas)', area: 'ayuda', group: 'valoraciones', keywords: 'valoraciones te ha servido utilidad votos satisfaccion feedback' },
  { id: 'ayuda-prioridades', label: 'Prioridades para completar la documentación', area: 'ayuda', group: 'prioridades', keywords: 'lagunas pendientes prioridades documentacion faltan completar' },
  // Sistema
  { id: 'sistema-errores', label: 'Errores de la app (ver, agrupar, borrar)', area: 'sistema', group: 'errores', keywords: 'errores fallos pantalla traza borrar incidencias' },
  { id: 'sistema-diagnostico', label: 'Diagnóstico temporal de sincronización', area: 'sistema', group: 'errores', keywords: 'diagnostico sincronizacion prefs-diag preferencias temporal' },
  { id: 'sistema-amazon', label: 'Automatizaciones: Amazon, Mercadona y correo de eventos (webhooks)', area: 'sistema', group: 'automatizaciones', keywords: 'automatizaciones webhook amazon mercadona tickets eventos correo pipedream' },
  { id: 'sistema-token', label: 'Regenerar token de automatizaciones', area: 'sistema', group: 'automatizaciones', keywords: 'token regenerar copiar url secreto' },
  ...(SUPPORT_ENABLED
    ? [{ id: 'sistema-soporte', label: 'Soporte técnico: incidencias de las personas usuarias', area: 'sistema' as const, group: 'soporte', keywords: 'soporte tecnico incidencias ayuda tickets responder asignar notas internas estadisticas' }]
    : []),
  { id: 'sistema-sugerencias', label: 'Sugerencias de todas las familias', area: 'sistema', group: 'vistas', keywords: 'sugerencias buzon ideas familias' },
  { id: 'sistema-resenas', label: 'Reseñas y opiniones de todas las familias', area: 'sistema', group: 'vistas', keywords: 'resenas opiniones valoraciones estrellas' },
]

export function searchAdminTools(query: string, tools: AdminTool[] = ADMIN_TOOLS): AdminTool[] {
  // Plurales sencillos: «códigos» encuentra «código».
  const words = normalizeHelpText(query)
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
  if (words.length === 0) return []
  return tools
    .map((t) => {
      const label = normalizeHelpText(t.label)
      const hay = `${label} ${normalizeHelpText(t.keywords)}`
      if (!words.every((w) => hay.includes(w))) return null
      const inLabel = words.filter((w) => label.includes(w)).length
      return { t, score: inLabel * 2 + (label.startsWith(words[0]) ? 1 : 0) }
    })
    .filter((x): x is { t: AdminTool; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.t)
}
