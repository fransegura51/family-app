// Centro de Mando de Comunidad — tipos y lógica PURA (sin red ni React).
// El servidor devuelve cada lista como filas sueltas (`Record<string, unknown>[]`, ya en camelCase). Aquí se convierten en tipos propios con funciones que
// nunca fallan (un dato que falta se queda en un valor neutro) y se guardan los textos de estado y las reglas de validación para poder probarlos sin pantalla.
import { REPORT_REASONS } from '@/domain/community'

type Rec = Record<string, unknown>

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const asRec = (v: unknown): Rec => (isRec(v) ? v : {})
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const bool = (v: unknown): boolean => v === true
const rows = (v: unknown): Rec[] => asArr(v).filter(isRec)

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Pestañas
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export type AdminTabId = 'resumen' | 'moderacion' | 'usuarios' | 'oficial' | 'temas' | 'encuestas' | 'destacados' | 'configuracion' | 'historial'

export const ADMIN_TABS: { id: AdminTabId; label: string; icon: string }[] = [
  { id: 'resumen', label: 'Resumen', icon: '📊' },
  { id: 'moderacion', label: 'Moderación', icon: '🛡️' },
  { id: 'usuarios', label: 'Usuarios', icon: '👥' },
  { id: 'oficial', label: 'Contenido oficial', icon: '📝' },
  { id: 'temas', label: 'Temas propuestos', icon: '💡' },
  { id: 'encuestas', label: 'Encuestas', icon: '🗳️' },
  { id: 'destacados', label: 'Destacados', icon: '⭐' },
  { id: 'configuracion', label: 'Configuración', icon: '⚙️' },
  { id: 'historial', label: 'Historial', icon: '📜' },
]

// Las nueve pestañas se presentan agrupadas por tema dentro del Centro de Administración (sin quitar ninguna ni cambiar su contenido): facilita encontrar cada apartado.
export const ADMIN_TAB_GROUPS: { label: string; ids: AdminTabId[] }[] = [
  { label: 'Supervisión', ids: ['resumen', 'moderacion', 'usuarios'] },
  { label: 'Contenido', ids: ['oficial', 'temas', 'encuestas', 'destacados'] },
  { label: 'Ajustes y registro', ids: ['configuracion', 'historial'] },
]

// La pestaña activa viaja en la dirección (?tab=…) para que recargar la página no te devuelva al principio; un valor raro vuelve a Resumen.
export function parseAdminTab(v: string | null | undefined): AdminTabId {
  return ADMIN_TABS.find((t) => t.id === v)?.id ?? 'resumen'
}

export type ModerationSection = 'denuncias' | 'visitantes' | 'ocultos' | 'readmisiones' | 'eliminacion'

export const MODERATION_SECTIONS: { id: ModerationSection; label: string }[] = [
  { id: 'denuncias', label: 'Denuncias' },
  { id: 'visitantes', label: 'Denuncias de visitantes' },
  { id: 'ocultos', label: 'Ocultos' },
  { id: 'readmisiones', label: 'Readmisiones' },
  { id: 'eliminacion', label: 'Eliminación de contenido' },
]

// Textos fijos que la pantalla enseña (así se pueden probar y mantener en un solo sitio).
export const ADMIN_TEXT = {
  notAdmin: 'Esta zona es solo para la administración',
  twoAdmins:
    'Los dos administradores de Comunidad tienen los mismos permisos: no hay jefe ni doble firma, y cualquiera puede deshacer lo que hizo el otro (todo queda en el historial). No es lo mismo que el administrador de tu familia en PEPA.',
  reportAloneRemovesNothing: 'Una denuncia por sí sola NO retira nada: el contenido sigue visible hasta que un administrador decide.',
  visitorNeverHides:
    'Los avisos de visitantes nunca ocultan nada por sí solos: los revisa la administración. Llegan de personas sin cuenta (a través de la página pública) o de personas con sesión pero sin alias o con permiso solo de lectura. No se guarda quién es la persona: solo, si ella lo escribe, un contacto, que aquí sale como texto (nunca como enlace). Úsalo solo si de verdad hace falta.',
  visitorLimits:
    'Para evitar abusos, el servidor limita los avisos: 5 al día por origen, 5 abiertos por contenido y día, y topes por hora y por día en total. Si ves muchos avisos iguales, es normal que solo llegue una parte.',
  autoHide:
    'La ocultación automática es provisional: solo ocurre cuando 3 personas distintas denuncian lo mismo con un motivo grave (acoso, violencia, contenido sexual, algo ilegal o datos privados). Queda pendiente de que lo revise una persona de la administración.',
  threeWarnings:
    'Tres advertencias equivalen a una expulsión de Comunidad (no de la cuenta de PEPA) de 30 días. Pasado ese plazo, la persona puede pedir volver y lo decide la administración.',
  resolvedForBoth: 'Lo que resuelve uno de los dos administradores queda resuelto para el otro.',
  noPublishWithoutApproval:
    'Nada oficial se publica sin que una persona lo apruebe, ni siquiera cuando llega la fecha. Basta la aprobación de uno de los dos administradores. Si editas algo ya aprobado, hay que aprobarlo de nuevo.',
  pollSchedule:
    'Las encuestas aprobadas abren el sábado a las 10:00 y cierran el domingo a las 17:00 (hora peninsular española, con el cambio de hora de verano e invierno). Los comentarios siguen abiertos después del cierre.',
  featuredAuto:
    'Los destacados se eligen solos, a diario, según la calidad de la publicación, los comentarios, los me gusta, los guardados, las veces que se importa la receta y dando ventaja a quienes publican poco (para que las cuentas nuevas también se vean). No hace falta aprobarlos antes. Aquí solo puedes retirar uno o volver a ponerlo.',
  logReadOnly:
    'Este historial es solo de lectura: no se puede editar ni borrar desde aquí. Es independiente del historial de avisos (las notificaciones se borran solas a los 30 días; este no).',
  settingsAuthorized: 'Solo se pueden cambiar los parámetros autorizados. Cada cambio queda en el historial.',
  menuAutopublishOff: 'La publicación automática está DESACTIVADA hasta que se valide',
  menuAutopublishOn: 'La publicación automática está ACTIVADA: cada sábado a las 10:00 (hora peninsular) sale el menú aprobado para la semana siguiente',
  menuAutopublishHelp:
    'Un menú aprobado no se publica al momento: se programa para el próximo sábado a las 10:00 y cubre la semana siguiente (de lunes a domingo). Solo hay un menú por semana. Si el sábado no hay un menú aprobado, no se publica nada y se avisa a la administración. El interruptor no se cambia desde aquí: es un ajuste técnico.',
} as const

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Fechas (siempre hora peninsular española, con el cambio de hora)
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export const MADRID_TZ = 'Europe/Madrid'

export function toDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  if (typeof v !== 'string' || v === '') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatMadrid(v: unknown, style: 'full' | 'short' | 'date' = 'short'): string {
  const d = toDate(v)
  if (!d) return 'sin fecha'
  const opts: Intl.DateTimeFormatOptions =
    style === 'full'
      ? { timeZone: MADRID_TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
      : style === 'date'
        ? { timeZone: MADRID_TZ, day: 'numeric', month: 'long', year: 'numeric' }
        : { timeZone: MADRID_TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
  return new Intl.DateTimeFormat('es-ES', opts).format(d)
}

interface MadridParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  isoWeekday: number // 1 lunes … 7 domingo
}

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

export function madridParts(d: Date): MadridParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MADRID_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    isoWeekday: WEEKDAY[get('weekday')] ?? 1,
  }
}

function madridOffsetMs(utcMs: number): number {
  const minute = Math.floor(utcMs / 60000) * 60000
  const p = madridParts(new Date(minute))
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0) - minute
}

// Hora de pared de Madrid → instante real (se corrige dos veces por si cae justo en el cambio de hora).
export function madridWallToInstant(year: number, month: number, day: number, hour: number, minute: number): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  const first = guess - madridOffsetMs(guess)
  const second = guess - madridOffsetMs(first)
  return new Date(second)
}

// El servidor guarda la apertura de la encuesta; el cierre es SIEMPRE el domingo siguiente (o el mismo día si abre en domingo) a las 17:00 de Madrid.
export function pollClosesAt(opensAt: Date): Date {
  const p = madridParts(opensAt)
  const add = (7 - p.isoWeekday) % 7
  const sunday = new Date(Date.UTC(p.year, p.month - 1, p.day + add))
  return madridWallToInstant(sunday.getUTCFullYear(), sunday.getUTCMonth() + 1, sunday.getUTCDate(), 17, 0)
}

export type PollPhase = 'scheduled' | 'open' | 'closed'

export function pollPhase(now: Date, opensAt: Date, closesAt: Date): PollPhase {
  if (now.getTime() < opensAt.getTime()) return 'scheduled'
  return now.getTime() < closesAt.getTime() ? 'open' : 'closed'
}

export const POLL_PHASE_TEXT: Record<PollPhase, string> = {
  scheduled: 'Aprobada, abre pronto',
  open: 'Abierta a votos',
  closed: 'Cerrada',
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export interface AdminOverview {
  posts: number
  posts7d: number
  comments7d: number
  members: number
  openReports: number
  openVisitorReports: number
  hiddenContent: number
  activeBans: number
  readmissionRequests: number
  removalRequests: number
  featured: number
}

export function toAdminOverview(raw: unknown): AdminOverview {
  const r = asRec(raw)
  return {
    posts: num(r.posts),
    posts7d: num(r.posts7d),
    comments7d: num(r.comments7d),
    members: num(r.members),
    openReports: num(r.openReports),
    openVisitorReports: num(r.openVisitorReports),
    hiddenContent: num(r.hiddenContent),
    activeBans: num(r.activeBans),
    readmissionRequests: num(r.readmissionRequests),
    removalRequests: num(r.removalRequests),
    featured: num(r.featured),
  }
}

export const OVERVIEW_METRICS: { key: keyof AdminOverview; label: string; hint: string }[] = [
  { key: 'posts', label: 'Publicaciones', hint: 'Publicaciones visibles ahora mismo' },
  { key: 'posts7d', label: 'Publicaciones (7 días)', hint: 'Nuevas en la última semana' },
  { key: 'comments7d', label: 'Comentarios (7 días)', hint: 'Nuevos en la última semana' },
  { key: 'members', label: 'Miembros', hint: 'Personas con alias público' },
  { key: 'openReports', label: 'Denuncias abiertas', hint: 'Contenidos con denuncias por revisar' },
  { key: 'openVisitorReports', label: 'Denuncias de visitantes', hint: 'Avisos de personas sin alias por revisar' },
  { key: 'hiddenContent', label: 'Contenido oculto', hint: 'Publicaciones, comentarios y reseñas ocultos' },
  { key: 'activeBans', label: 'Expulsiones activas', hint: 'Personas sin poder participar ahora' },
  { key: 'readmissionRequests', label: 'Readmisiones pedidas', hint: 'Personas que piden volver' },
  { key: 'removalRequests', label: 'Eliminaciones pedidas', hint: 'Solicitudes de borrar contenido' },
  { key: 'featured', label: 'Destacados', hint: 'Publicaciones destacadas ahora' },
]

export interface PendingShortcut {
  id: string
  label: string
  tab: AdminTabId
  section?: ModerationSection
  count: number | null
}

// Accesos rápidos: solo lo que tiene algo pendiente (y siempre el repaso de propuestas de Pepa, que el servidor no cuenta en el resumen).
export function pendingShortcuts(o: AdminOverview): PendingShortcut[] {
  const out: PendingShortcut[] = []
  if (o.openReports > 0) out.push({ id: 'reports', label: 'Denuncias por revisar', tab: 'moderacion', section: 'denuncias', count: o.openReports })
  if (o.openVisitorReports > 0) out.push({ id: 'visitors', label: 'Denuncias de visitantes', tab: 'moderacion', section: 'visitantes', count: o.openVisitorReports })
  if (o.readmissionRequests > 0) out.push({ id: 'readmissions', label: 'Peticiones de readmisión', tab: 'moderacion', section: 'readmisiones', count: o.readmissionRequests })
  if (o.removalRequests > 0) out.push({ id: 'removals', label: 'Peticiones de eliminar contenido', tab: 'moderacion', section: 'eliminacion', count: o.removalRequests })
  if (o.hiddenContent > 0) out.push({ id: 'hidden', label: 'Contenido oculto', tab: 'moderacion', section: 'ocultos', count: o.hiddenContent })
  out.push({ id: 'proposals', label: 'Propuestas de Pepa para revisar', tab: 'oficial', count: null })
  if (o.featured > 0) out.push({ id: 'featured', label: 'Destacados actuales', tab: 'destacados', count: o.featured })
  return out
}

export function launchText(launched: boolean): { state: string; effect: string; button: string; confirm: string } {
  return launched
    ? {
        state: 'Comunidad está ABIERTA a todos los usuarios de PEPA.',
        effect:
          'Si la cierras, Comunidad deja de verse para todo el mundo salvo para los dos administradores. No se borra nada (publicaciones, comentarios y perfiles se conservan), pero deja de servirse el contenido público y Pepa pausa sus intervenciones automáticas. Puedes volver a abrirla cuando quieras.',
        button: 'Cerrar Comunidad',
        confirm: 'Toca otra vez para cerrar Comunidad a todos',
      }
    : {
        state: 'Comunidad está CERRADA: ahora solo la ven y la prueban los dos administradores.',
        effect:
          'Si la abres, todos los usuarios de PEPA podrán leer y, con su alias, publicar y comentar al momento (la moderación es posterior). El contenido público y las intervenciones de Pepa se activan. Haz antes una última comprobación de normas, denuncias y contenido oficial.',
        button: 'Abrir Comunidad a todos',
        confirm: 'Toca otra vez para abrir Comunidad a todos',
      }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Notas y motivos (obligatorios en las acciones que afectan a personas o contenido)
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export const NOTE_MAX = 500
export const NOTE_MIN = 3

export function validateAdminNote(note: string, required: boolean): string | null {
  const t = note.trim()
  if (required && t.length < NOTE_MIN) return 'Escribe el motivo (mínimo 3 letras). Queda guardado en el historial.'
  if (t.length > NOTE_MAX) return `El motivo es demasiado largo (máximo ${NOTE_MAX} letras).`
  return null
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Denuncias
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export type ReportTargetType = 'post' | 'comment' | 'user' | 'review'
export type ResolveAction = 'sin_accion' | 'ocultar' | 'advertir' | 'expulsar'

export const TARGET_TYPE_TEXT: Record<ReportTargetType, string> = { post: 'Publicación', comment: 'Comentario', user: 'Persona', review: 'Reseña' }

// «★★★☆☆ (3 de 5)»: las estrellas de una reseña dichas también en palabras, para quien no ve los símbolos.
export function starsLabel(stars: number | null): string {
  if (stars === null) return ''
  const n = Math.max(0, Math.min(5, Math.round(stars)))
  return `${'★'.repeat(n)}${'☆'.repeat(5 - n)} (${n} de 5)`
}

export function reasonLabel(id: string): string {
  return REPORT_REASONS.find((r) => r.id === id)?.label ?? id
}

export interface ReportedContent {
  title: string
  excerpt: string
  // Solo en las reseñas de receta.
  stars: number | null
  status: string
  authorId: string | null
  authorAlias: string
  // Publicación (o receta) a la que pertenece el comentario o la reseña; en las publicaciones, ella misma si el servidor lo manda.
  postId: string | null
}

export type Resolution = 'sin_accion' | 'oculto' | 'advertencia' | 'expulsion'

export const RESOLUTION_TEXT: Record<Resolution, string> = {
  sin_accion: 'Sin acción',
  oculto: 'Ocultado',
  advertencia: 'Advertido (y ocultado)',
  expulsion: 'Expulsado (y ocultado)',
}

export interface ReportGroup {
  key: string
  targetType: ReportTargetType
  targetId: string
  reportCount: number
  reasons: string[]
  firstAt: string | null
  lastAt: string | null
  status: 'open' | 'resolved'
  resolution: Resolution | null
  content: ReportedContent | null
}

const asTargetType = (v: unknown): ReportTargetType => (v === 'comment' || v === 'user' || v === 'review' ? v : 'post')

export function toReportGroups(raw: unknown): ReportGroup[] {
  return rows(raw)
    .filter((r) => str(r.targetId) !== '')
    .map((r) => {
      const type = asTargetType(r.targetType)
      const id = str(r.targetId)
      const c = isRec(r.content) ? r.content : null
      const res = str(r.resolution)
      return {
        key: `${type}:${id}`,
        targetType: type,
        targetId: id,
        reportCount: num(r.reportCount, 1),
        reasons: asArr(r.reasons).filter((x): x is string => typeof x === 'string'),
        firstAt: strOrNull(r.firstAt),
        lastAt: strOrNull(r.lastAt),
        status: r.status === 'resolved' ? 'resolved' : 'open',
        resolution: res in RESOLUTION_TEXT ? (res as Resolution) : null,
        content: c
          ? {
              title: str(c.title),
              excerpt: str(c.excerpt),
              stars: typeof c.stars === 'number' ? c.stars : null,
              status: str(c.status),
              authorId: strOrNull(c.authorId),
              authorAlias: str(c.authorAlias, 'Persona sin alias'),
              postId: strOrNull(c.postId),
            }
          : null,
      }
    })
}

export function reportCountText(n: number): string {
  return n === 1 ? '1 denuncia' : `${n} denuncias`
}

export function contentStatusText(status: string): string {
  if (status === 'published') return 'Visible'
  if (status === 'hidden') return 'Oculto'
  if (status === 'deleted') return 'Eliminado'
  return 'Sin contenido'
}

export interface ResolveActionInfo {
  id: ResolveAction
  label: string
  needsNote: boolean
  help: string
  danger: boolean
}

const ALL_RESOLVE_ACTIONS: ResolveActionInfo[] = [
  { id: 'sin_accion', label: 'Sin acción', needsNote: false, danger: false, help: 'Cierra las denuncias y deja el contenido como está.' },
  { id: 'ocultar', label: 'Ocultar', needsNote: true, danger: false, help: 'Oculta el contenido (se puede restaurar después) y cierra las denuncias. Se avisa a su autor.' },
  {
    id: 'advertir',
    label: 'Advertir',
    needsNote: true,
    danger: true,
    help: 'Oculta el contenido, pone una advertencia a su autor y cierra las denuncias. A la tercera advertencia se le expulsa de Comunidad 30 días.',
  },
  {
    id: 'expulsar',
    label: 'Expulsar',
    needsNote: true,
    danger: true,
    help: 'Oculta el contenido y expulsa a su autor de Comunidad (30 días; su cuenta de PEPA no se toca). Cierra las denuncias.',
  },
]

// Una denuncia a una persona (no a un contenido) no tiene nada que ocultar.
export function resolveActionsFor(type: ReportTargetType): ResolveActionInfo[] {
  return type === 'user' ? ALL_RESOLVE_ACTIONS.filter((a) => a.id !== 'ocultar') : ALL_RESOLVE_ACTIONS
}

export interface ReportDetail {
  reason: string
  detail: string | null
  status: string
  createdAt: string | null
}

export interface AdminContent {
  type: 'post' | 'comment' | 'review'
  id: string
  title: string
  body: string
  // Solo en las reseñas de receta.
  stars: number | null
  status: string
  hiddenReason: string | null
  authorAlias: string
  kind: string | null
  createdAt: string | null
  postId: string | null
  photos: string[]
  reports: ReportDetail[]
}

export function toAdminContent(raw: unknown): AdminContent | null {
  if (!isRec(raw)) return null
  const type = raw.type === 'comment' ? 'comment' : raw.type === 'review' ? 'review' : 'post'
  const photoPath = strOrNull(raw.photoPath)
  const photos = asArr(raw.photos).filter((x): x is string => typeof x === 'string')
  return {
    type,
    id: str(raw.id),
    title: str(raw.title),
    // Una reseña solo con estrellas llega con `body` nulo: se enseña vacío.
    body: str(raw.body),
    stars: typeof raw.stars === 'number' ? raw.stars : null,
    status: str(raw.status),
    hiddenReason: strOrNull(raw.hiddenReason),
    authorAlias: str(raw.authorAlias, 'Persona sin alias'),
    kind: strOrNull(raw.kind),
    createdAt: strOrNull(raw.createdAt),
    postId: type === 'comment' || type === 'review' ? strOrNull(raw.postId) : null,
    photos: photoPath ? [photoPath, ...photos] : photos,
    reports: rows(raw.reports).map((r) => ({ reason: str(r.reason), detail: strOrNull(r.detail), status: str(r.status), createdAt: strOrNull(r.createdAt) })),
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Ocultos, readmisiones y solicitudes de eliminación
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export interface HiddenItem {
  key: string
  type: 'post' | 'comment' | 'review'
  id: string
  title: string
  reason: string | null
  hiddenAt: string | null
  authorAlias: string
  automatic: boolean
}

// El servidor marca con «auto:» lo que ocultó solo (varias denuncias graves): sigue pendiente de revisión humana.
export const isAutoHidden = (reason: string | null): boolean => (reason ?? '').startsWith('auto:')

export function toHiddenItems(raw: unknown): HiddenItem[] {
  return rows(raw)
    .filter((r) => str(r.id) !== '')
    .map((r) => {
      const type = r.type === 'comment' ? 'comment' : r.type === 'review' ? 'review' : 'post'
      const reason = strOrNull(r.reason)
      return {
        key: `${type}:${str(r.id)}`,
        type,
        id: str(r.id),
        title: str(r.title),
        reason,
        hiddenAt: strOrNull(r.hiddenAt),
        authorAlias: str(r.authorAlias, 'Persona sin alias'),
        automatic: isAutoHidden(reason),
      }
    })
}

export interface Readmission {
  banId: string
  profileId: string
  alias: string
  reason: string
  endsAt: string | null
  requestedAt: string | null
}

export function toReadmissions(raw: unknown): Readmission[] {
  return rows(raw)
    .filter((r) => str(r.banId) !== '')
    .map((r) => ({
      banId: str(r.banId),
      profileId: str(r.profileId),
      alias: str(r.alias, 'Persona sin alias'),
      reason: str(r.reason),
      endsAt: strOrNull(r.endsAt),
      requestedAt: strOrNull(r.requestedAt),
    }))
}

export type RemovalStatus = 'open' | 'done' | 'rejected'

export interface RemovalRequest {
  id: string
  scope: 'all_my_content' | 'specific'
  targetType: 'post' | 'comment' | null
  detail: string
  status: RemovalStatus
  alias: string | null
  createdAt: string | null
}

// Por privacidad NO se enseña el dato de contacto de quien pide (el servidor lo guarda; la administración responde por la propia app).
export function toRemovalRequests(raw: unknown): RemovalRequest[] {
  return rows(raw)
    .filter((r) => str(r.id) !== '')
    .map((r) => ({
      id: str(r.id),
      scope: r.scope === 'specific' ? 'specific' : 'all_my_content',
      targetType: r.targetType === 'comment' ? 'comment' : r.targetType === 'post' ? 'post' : null,
      detail: str(r.detail),
      status: r.status === 'done' ? 'done' : r.status === 'rejected' ? 'rejected' : 'open',
      alias: strOrNull(r.alias),
      createdAt: strOrNull(r.createdAt),
    }))
}

export function removalScopeText(r: Pick<RemovalRequest, 'scope' | 'targetType'>): string {
  if (r.scope === 'all_my_content') return 'Pide eliminar TODAS sus publicaciones y comentarios'
  return r.targetType === 'comment' ? 'Pide eliminar un comentario concreto' : 'Pide eliminar una publicación concreta'
}

export const REMOVAL_STATUS_TEXT: Record<RemovalStatus, string> = { open: 'Pendientes', done: 'Hechas', rejected: 'Rechazadas' }

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Denuncias de visitantes (orden 2.4): avisos de personas SIN cuenta (desde la página pública) o con sesión pero sin poder participar (sin alias, solo lectura).
// Nunca ocultan nada solos. El servidor ya los limita contra abusos; aquí solo se revisan y se resuelven.
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export const VISITOR_PAGE = 20

export type VisitorTargetType = 'post' | 'comment' | 'review'
export type VisitorResolution = 'sin_accion' | 'oculto' | 'advertencia' | 'expulsion' | 'otro'
export type VisitorSource = 'visitor' | 'reader'

export const VISITOR_SOURCE_TEXT: Record<VisitorSource, string> = { visitor: 'Visitante (sin cuenta)', reader: 'Lector sin alias' }

export const VISITOR_RESOLUTION_TEXT: Record<VisitorResolution, string> = {
  sin_accion: 'Sin acción',
  oculto: 'Contenido ocultado',
  advertencia: 'Autor/a advertido/a',
  expulsion: 'Autor/a expulsado/a',
  otro: 'Otra decisión',
}

export interface VisitorReportContent {
  title: string
  excerpt: string
  stars: number | null
  status: string
  hidden: boolean
  authorId: string | null
  authorAlias: string
  postId: string | null
}

export interface VisitorReport {
  id: string
  targetType: VisitorTargetType
  targetId: string
  reason: string
  detail: string | null
  // Texto libre que escribe la persona (puede ser un correo, un teléfono o cualquier cosa): SIEMPRE se pinta como texto, nunca como enlace.
  contact: string | null
  source: VisitorSource
  status: 'open' | 'resolved'
  resolution: VisitorResolution | null
  resolutionNote: string | null
  resolvedAt: string | null
  createdAt: string | null
  // null = el contenido ya no existe.
  content: VisitorReportContent | null
}

const asVisitorType = (v: unknown): VisitorTargetType => (v === 'comment' || v === 'review' ? v : 'post')

export function toVisitorReports(raw: unknown): VisitorReport[] {
  return rows(raw)
    .filter((r) => str(r.id) !== '' && str(r.targetId) !== '')
    .map((r) => {
      const c = isRec(r.content) ? r.content : null
      const res = str(r.resolution)
      return {
        id: str(r.id),
        targetType: asVisitorType(r.targetType),
        targetId: str(r.targetId),
        reason: str(r.reason),
        detail: strOrNull(r.detail),
        contact: strOrNull(r.contact),
        source: r.source === 'reader' ? 'reader' : 'visitor',
        status: r.status === 'resolved' ? 'resolved' : 'open',
        resolution: res in VISITOR_RESOLUTION_TEXT ? (res as VisitorResolution) : null,
        resolutionNote: strOrNull(r.resolutionNote),
        resolvedAt: strOrNull(r.resolvedAt),
        createdAt: strOrNull(r.createdAt),
        content: c
          ? {
              title: str(c.title),
              excerpt: str(c.excerpt),
              stars: typeof c.stars === 'number' ? c.stars : null,
              status: str(c.status),
              hidden: bool(c.hidden) || c.status === 'hidden',
              authorId: strOrNull(c.authorId),
              authorAlias: str(c.authorAlias, 'Persona sin alias'),
              postId: strOrNull(c.postId),
            }
          : null,
      }
    })
}

export interface VisitorActionInfo {
  id: VisitorResolution
  label: string
  needsNote: boolean
  danger: boolean
  help: string
  // none: no oculta nunca · forced: oculta siempre · optional: oculta solo si se marca «ocultar también el contenido».
  hide: 'none' | 'forced' | 'optional'
  // Necesita que el contenido (y su autor/a) siga existiendo: ocultar, advertir y expulsar actúan sobre él.
  needsAuthor: boolean
}

export const VISITOR_ACTIONS: VisitorActionInfo[] = [
  { id: 'sin_accion', label: 'Sin acción', needsNote: false, danger: false, hide: 'none', needsAuthor: false, help: 'Cierra el aviso y deja el contenido como está.' },
  { id: 'oculto', label: 'Ocultar contenido', needsNote: true, danger: false, hide: 'forced', needsAuthor: true, help: 'Oculta el contenido (se puede restaurar después) y se avisa a su autor/a.' },
  {
    id: 'advertencia',
    label: 'Advertir al autor',
    needsNote: true,
    danger: true,
    hide: 'optional',
    needsAuthor: true,
    help: 'Pone una advertencia a su autor/a. A la tercera se le expulsa de Comunidad 30 días. Puedes ocultar también el contenido.',
  },
  {
    id: 'expulsion',
    label: 'Expulsar',
    needsNote: true,
    danger: true,
    hide: 'optional',
    needsAuthor: true,
    help: 'Expulsa a su autor/a de Comunidad (30 días; su cuenta de PEPA no se toca). Puedes ocultar también el contenido.',
  },
  { id: 'otro', label: 'Otro', needsNote: true, danger: false, hide: 'optional', needsAuthor: false, help: 'Cierra el aviso con otra decisión que explicas en la nota. Puedes ocultar también el contenido.' },
]

// Si el contenido ya no existe (o no se sabe quién lo escribió) solo se puede cerrar el aviso: el servidor rechazaría ocultar, advertir o expulsar.
export function visitorActionsFor(r: Pick<VisitorReport, 'content'>): VisitorActionInfo[] {
  const hasAuthor = !!r.content && r.content.authorId !== null
  return VISITOR_ACTIONS.filter((a) => hasAuthor || !a.needsAuthor)
}

// Valor de `p_hide` según la acción y la casilla.
export function visitorHideValue(action: VisitorActionInfo, checked: boolean): boolean {
  if (action.hide === 'forced') return true
  return action.hide === 'optional' && checked
}

// «Otro» con la casilla de ocultar necesita también que el contenido exista.
export function validateVisitorResolution(action: VisitorActionInfo, note: string, hide: boolean, r: Pick<VisitorReport, 'content'>): string | null {
  const problem = validateAdminNote(note, action.needsNote)
  if (problem) return problem
  if (hide && !r.content) return 'El contenido ya no existe: no se puede ocultar.'
  return null
}

// Qué se enseña tras resolver (el servidor devuelve { hidden, warningId?, activeWarnings?, banned? }).
export function visitorResultText(action: VisitorResolution, result: unknown): string {
  const r = asRec(result)
  const parts = ['Aviso resuelto.']
  if (bool(r.hidden)) parts.push('El contenido queda oculto.')
  if (action === 'advertencia') parts.push(warnResultText(result))
  if (action === 'expulsion' && bool(r.banned)) parts.push('La persona queda expulsada de Comunidad 30 días.')
  return parts.join(' ')
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export interface UserWarning {
  id: string
  reason: string
  issuedAt: string | null
  revokedAt: string | null
}

export interface UserBan {
  id: string
  reason: string
  startsAt: string | null
  endsAt: string | null
  liftedAt: string | null
  readmissionStatus: string
}

export type UserBanState = 'ok' | 'banned' | 'readmission'

export interface AdminUser {
  id: string
  alias: string
  createdAt: string | null
  posts: number
  warnings: UserWarning[]
  bans: UserBan[]
  banState: UserBanState
}

export function toAdminUsers(raw: unknown): AdminUser[] {
  return rows(raw)
    .filter((r) => str(r.id) !== '')
    .map((r) => ({
      id: str(r.id),
      alias: str(r.alias, 'Persona sin alias'),
      createdAt: strOrNull(r.createdAt),
      posts: num(r.posts),
      warnings: rows(r.warnings).map((w) => ({ id: str(w.id), reason: str(w.reason), issuedAt: strOrNull(w.issuedAt), revokedAt: strOrNull(w.revokedAt) })),
      bans: rows(r.bans).map((b) => ({
        id: str(b.id),
        reason: str(b.reason),
        startsAt: strOrNull(b.startsAt),
        endsAt: strOrNull(b.endsAt),
        liftedAt: strOrNull(b.liftedAt),
        readmissionStatus: str(b.readmissionStatus, 'none'),
      })),
      banState: r.banState === 'banned' || r.banState === 'readmission' ? r.banState : 'ok',
    }))
}

// Igual que el servidor: cuentan las advertencias NO retiradas hechas después de la última expulsión (se haya retirado o no).
export function activeWarningCount(u: Pick<AdminUser, 'warnings' | 'bans'>): number {
  let since = -Infinity
  for (const b of u.bans) {
    const t = toDate(b.startsAt)?.getTime()
    if (t !== undefined && t > since) since = t
  }
  return u.warnings.filter((w) => {
    if (w.revokedAt) return false
    const t = toDate(w.issuedAt)?.getTime()
    return t !== undefined && t > since
  }).length
}

// La expulsión que sigue en pie (no retirada y sin readmisión aprobada), la más reciente.
export function currentBan(u: Pick<AdminUser, 'bans'>): UserBan | null {
  const live = u.bans.filter((b) => !b.liftedAt && b.readmissionStatus !== 'approved')
  live.sort((a, b) => (toDate(b.startsAt)?.getTime() ?? 0) - (toDate(a.startsAt)?.getTime() ?? 0))
  return live[0] ?? null
}

export function banStateText(state: UserBanState, endsAt?: string | null): string {
  if (state === 'banned') return endsAt ? `Expulsada hasta el ${formatMadrid(endsAt, 'date')}` : 'Expulsada de Comunidad'
  if (state === 'readmission') return 'Plazo cumplido: puede pedir volver'
  return 'Participa con normalidad'
}

export const READMISSION_TEXT: Record<string, string> = {
  none: 'sin solicitud',
  requested: 'ha pedido volver',
  approved: 'readmitida',
  rejected: 'readmisión rechazada',
}

export function warnResultText(result: unknown): string {
  const r = asRec(result)
  const n = num(r.activeWarnings)
  if (bool(r.banned)) return `Advertencia puesta (${n} de 3). Como era la tercera, la persona queda expulsada de Comunidad 30 días.`
  return `Advertencia puesta (${n} de 3).`
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Contenido oficial
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export type ProposalKind = 'tip' | 'poll' | 'article' | 'menu'
export type ProposalStatus = 'proposed' | 'approved' | 'rejected' | 'published'

export const PROPOSAL_KIND_TEXT: Record<ProposalKind, string> = { tip: 'Consejo de Pepa', poll: 'Encuesta', article: 'Artículo de Equipo PEPA', menu: 'Menú semanal de Pepa' }
export const PROPOSAL_KIND_ICON: Record<ProposalKind, string> = { tip: '💡', poll: '🗳️', article: '📰', menu: '🍽️' }

export const PROPOSAL_STATUS_TEXT: Record<ProposalStatus, string> = {
  proposed: 'Pendiente de revisar',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  published: 'Publicada',
}

export const PROPOSAL_FILTERS: { id: ProposalStatus; label: string }[] = [
  { id: 'proposed', label: 'Pendientes' },
  { id: 'approved', label: 'Aprobadas' },
  { id: 'rejected', label: 'Rechazadas' },
  { id: 'published', label: 'Publicadas' },
]

export interface ArticleSource {
  title: string
  publisher: string
  url: string
  date: string
}

export interface ProposalPayload {
  options: string[]
  sources: ArticleSource[]
  methodology: string
  comparison: string
  raw: Record<string, unknown>
}

export function toProposalPayload(raw: unknown): ProposalPayload {
  const r = asRec(raw)
  return {
    options: asArr(r.options).filter((x): x is string => typeof x === 'string'),
    sources: rows(r.sources).map((s) => ({ title: str(s.title), publisher: str(s.publisher), url: str(s.url), date: str(s.date) })),
    methodology: str(r.methodology),
    comparison: str(r.comparison),
    raw: r,
  }
}

export interface Proposal {
  id: string
  kind: ProposalKind
  section: string
  topicId: string
  title: string
  body: string
  payload: ProposalPayload
  batchWeek: string | null
  status: ProposalStatus
  version: number
  proposedAt: string | null
  approvedVersion: number | null
  approvedAt: string | null
  approvedByName: string | null
  reviewNote: string | null
  publishAt: string | null
  publishedPostId: string | null
  // Solo menús (null/0/false en el resto): semana (lunes), intentos de publicación, último error y texto sin revisar.
  menuWeekStart: string | null
  publishAttempts: number
  publishError: string | null
  menuTextStale: boolean
}

const asKind = (v: unknown): ProposalKind => (v === 'poll' || v === 'article' || v === 'menu' ? v : 'tip')
const asProposalStatus = (v: unknown): ProposalStatus => (v === 'approved' || v === 'rejected' || v === 'published' ? v : 'proposed')

export function toProposals(raw: unknown): Proposal[] {
  return rows(raw)
    .filter((r) => str(r.id) !== '')
    .map((r) => ({
      id: str(r.id),
      kind: asKind(r.kind),
      section: str(r.section),
      topicId: str(r.topicId),
      title: str(r.title),
      body: str(r.body),
      payload: toProposalPayload(r.payload),
      batchWeek: strOrNull(r.batchWeek),
      status: asProposalStatus(r.status),
      version: num(r.version, 1),
      proposedAt: strOrNull(r.proposedAt),
      approvedVersion: typeof r.approvedVersion === 'number' ? r.approvedVersion : null,
      approvedAt: strOrNull(r.approvedAt),
      approvedByName: strOrNull(r.approvedByName),
      reviewNote: strOrNull(r.reviewNote),
      publishAt: strOrNull(r.publishAt),
      publishedPostId: strOrNull(r.publishedPostId),
      menuWeekStart: strOrNull(r.menuWeekStart),
      publishAttempts: num(r.publishAttempts),
      publishError: strOrNull(r.publishError),
      menuTextStale: bool(r.menuTextStale),
    }))
}

// «Aprobada por X el … (versión N)». Si falta el nombre, se dice sin nombre (nunca se inventa).
export function approvalLine(p: Pick<Proposal, 'status' | 'approvedAt' | 'approvedByName' | 'approvedVersion' | 'version'>): string | null {
  if (!p.approvedAt) return null
  const who = p.approvedByName ? `por ${p.approvedByName}` : 'por la administración'
  return `Aprobada ${who} el ${formatMadrid(p.approvedAt)} (versión ${p.approvedVersion ?? p.version})`
}

export function batchWeekText(batchWeek: string | null): string {
  if (!batchWeek) return 'Lote sin fecha'
  const d = toDate(`${batchWeek}T12:00:00Z`)
  return d ? `Lote de la semana del ${formatMadrid(d, 'date')}` : 'Lote sin fecha'
}

// Solo se enseñan como enlace las fuentes http/https (el texto de las fuentes viene de la IA y se trata como no fiable).
export function safeSourceUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim())
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

export interface ProposalForm {
  title: string
  body: string
  topicId: string
  options: string[]
  sources: ArticleSource[]
  methodology: string
  comparison: string
}

export function proposalToForm(p: Proposal): ProposalForm {
  return {
    title: p.title,
    body: p.body,
    topicId: p.topicId,
    options: p.kind === 'poll' ? (p.payload.options.length ? [...p.payload.options] : ['', '']) : [],
    sources: p.kind === 'article' ? p.payload.sources.map((s) => ({ ...s })) : [],
    methodology: p.payload.methodology,
    comparison: p.payload.comparison,
  }
}

export const MAX_POLL_OPTIONS = 6
export const MIN_POLL_OPTIONS = 2

export function validateProposalForm(kind: ProposalKind, f: ProposalForm): string | null {
  const title = f.title.trim()
  if (title.length < 3) return 'El título necesita al menos 3 letras.'
  if (title.length > 140) return 'El título es demasiado largo (máximo 140 letras).'
  if (f.body.length > 10000) return 'El texto es demasiado largo.'
  if (kind === 'poll') {
    const opts = f.options.map((o) => o.trim()).filter(Boolean)
    if (opts.length < MIN_POLL_OPTIONS) return 'Una encuesta necesita al menos 2 opciones.'
    if (opts.length > MAX_POLL_OPTIONS) return 'Una encuesta admite como máximo 6 opciones.'
    if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) return 'Hay opciones repetidas.'
  }
  if (kind === 'article') {
    for (const s of f.sources) {
      if (s.url.trim() !== '' && !safeSourceUrl(s.url)) return 'Una fuente tiene un enlace no válido (debe empezar por https://).'
    }
  }
  return null
}

// Carga útil para `adminEditProposal`: solo los consejos mandan null (el servidor deja la que había). Se conservan las claves que no editamos.
export function buildProposalPayload(kind: ProposalKind, original: ProposalPayload, f: ProposalForm): Record<string, unknown> | null {
  // Los datos del menú NO se editan desde el panel: se manda null y el servidor conserva los datos (y anota que el texto puede haber dejado de coincidir).
  if (kind === 'tip' || kind === 'menu') return null
  if (kind === 'poll') return { ...original.raw, options: f.options.map((o) => o.trim()).filter(Boolean) }
  const sources = f.sources
    .map((s) => ({ title: s.title.trim(), publisher: s.publisher.trim(), url: s.url.trim(), date: s.date.trim() }))
    .filter((s) => s.title !== '' || s.url !== '' || s.publisher !== '')
  return { ...original.raw, sources, methodology: f.methodology.trim(), comparison: f.comparison.trim() }
}

export function approveResultText(kind: ProposalKind, result: unknown): string {
  const r = asRec(result)
  if (kind === 'poll') {
    const opens = toDate(r.opensAt)
    const closes = toDate(r.closesAt)
    if (bool(r.scheduled) && opens && closes) return `Encuesta aprobada. Abre el ${formatMadrid(opens, 'full')} y cierra el ${formatMadrid(closes, 'full')} (hora peninsular).`
    return 'Encuesta aprobada y publicada ahora: ya está abierta a votos.'
  }
  if (kind === 'menu') return menuApproveText(result)
  return kind === 'article' ? 'Artículo aprobado y publicado.' : 'Consejo aprobado y publicado.'
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Menú semanal oficial («Menú semanal de Pepa»)
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export type MenuState = 'draft' | 'scheduled' | 'published' | 'error' | 'rejected'

export const MENU_STATE_TEXT: Record<MenuState, string> = {
  draft: 'Borrador (pendiente de revisar)',
  scheduled: 'Programado',
  published: 'Publicado',
  error: 'Con error',
  rejected: 'Rechazado',
}

export const MENU_AUTOPUBLISH_KEY = 'weekly_menu_autopublish'
export const MENU_MAX_ATTEMPTS = 3

const asMenuState = (v: unknown): MenuState => (v === 'scheduled' || v === 'published' || v === 'error' || v === 'rejected' ? v : 'draft')

// Aviso de la revisión de calidad: «error» = el menú no es válido (no se puede aprobar); «warning» = aviso que decide la persona.
export interface MenuCheckItem {
  code: string
  severity: 'error' | 'warning'
  message: string
  day: string | null
  meal: string | null
  recipe: string | null
}

export function toMenuCheck(raw: unknown): MenuCheckItem[] {
  return rows(raw)
    .filter((c) => str(c.message) !== '')
    .map((c) => ({
      code: str(c.code),
      severity: c.severity === 'error' ? ('error' as const) : ('warning' as const),
      message: str(c.message),
      day: strOrNull(c.day),
      meal: strOrNull(c.meal),
      recipe: strOrNull(c.recipe),
    }))
}

export interface MenuRow {
  id: string
  title: string
  state: MenuState
  version: number
  seedKey: string | null
  // true = menú SEMANAL (se programa y sale el sábado a las 10:00); false = publicación puntual (se publica al aprobar).
  weekly: boolean
  source: string | null
  weekStart: string | null
  weekEnd: string | null
  publishAt: string | null
  publishedPostId: string | null
  publishAttempts: number
  publishError: string | null
  lastPublishAttemptAt: string | null
  textStale: boolean
  proposedAt: string | null
  approvedAt: string | null
  approvedByName: string | null
  reviewNote: string | null
  checkErrors: number | null
  checkWarnings: number | null
}

export interface MenuList {
  // Valor de weekly_menu_autopublish (solo lectura).
  autopublish: boolean
  menus: MenuRow[]
}

export function toMenuRow(r: Rec): MenuRow {
  return {
    id: str(r.id),
    title: str(r.title),
    state: asMenuState(r.state),
    version: num(r.version, 1),
    seedKey: strOrNull(r.seedKey),
    weekly: bool(r.scheduledWeekly),
    source: strOrNull(r.source),
    weekStart: strOrNull(r.weekStart),
    weekEnd: strOrNull(r.weekEnd),
    publishAt: strOrNull(r.publishAt),
    publishedPostId: strOrNull(r.publishedPostId),
    publishAttempts: num(r.publishAttempts),
    publishError: strOrNull(r.publishError),
    lastPublishAttemptAt: strOrNull(r.lastPublishAttemptAt),
    textStale: bool(r.textStale),
    proposedAt: strOrNull(r.proposedAt),
    approvedAt: strOrNull(r.approvedAt),
    approvedByName: strOrNull(r.approvedByName),
    reviewNote: strOrNull(r.reviewNote),
    checkErrors: typeof r.checkErrors === 'number' ? r.checkErrors : null,
    checkWarnings: typeof r.checkWarnings === 'number' ? r.checkWarnings : null,
  }
}

export function toMenuList(raw: unknown): MenuList {
  const r = asRec(raw)
  return {
    autopublish: bool(r.autopublish),
    menus: rows(r.menus)
      .filter((m) => str(m.id) !== '')
      .map(toMenuRow),
  }
}

export interface MenuRecipeData {
  title: string
  servings: number
  ingredientCount: number
  stepCount: number
  // Elemento sencillo (fruta, pan tostado…): no tiene pasos y no es una receta de Cocina.
  simple: boolean
}
export interface MenuMealData {
  title: string
  side: string | null
  recipes: MenuRecipeData[]
}
export interface MenuDayData {
  day: string
  comida: MenuMealData | null
  cena: MenuMealData | null
}
export interface MenuData {
  servings: number
  days: MenuDayData[]
}

function toMenuMeal(v: unknown): MenuMealData | null {
  const m = asRec(v)
  if (str(m.title) === '') return null
  return {
    title: str(m.title),
    side: strOrNull(m.side),
    recipes: rows(m.recipes).map((r) => ({ title: str(r.title), servings: num(r.servings), ingredientCount: asArr(r.ingredients).length, stepCount: asArr(r.steps).length, simple: r.simple === true })),
  }
}

// Resumen del menú para el panel (días, platos, nº de ingredientes y pasos): el detalle completo de las recetas no se pinta.
export function toMenuData(raw: unknown): MenuData | null {
  const m = asRec(raw)
  const days = rows(m.days).map((d) => {
    const meals = asRec(d.meals)
    return { day: str(d.day), comida: toMenuMeal(meals.comida), cena: toMenuMeal(meals.cena) }
  })
  return days.length === 0 ? null : { servings: num(m.servings), days }
}

// Un menú completo para revisarlo antes de aprobar: fila + texto + resumen de los datos + avisos de calidad.
export interface MenuDetail extends MenuRow {
  body: string
  section: string
  topicId: string
  menu: MenuData | null
  check: MenuCheckItem[]
  itemError: string | null
}

export function toMenuDetail(raw: unknown): MenuDetail | null {
  const r = asRec(raw)
  if (str(r.id) === '') return null
  return { ...toMenuRow(r), body: str(r.body), section: str(r.section), topicId: str(r.topicId), menu: toMenuData(r.menu), check: toMenuCheck(r.check), itemError: strOrNull(r.itemError) }
}

// Semana de lunes a domingo: «Semana del 26 de octubre al 1 de noviembre de 2026».
export function menuWeekText(start: string | null, end: string | null): string {
  const a = start ? toDate(`${start}T12:00:00Z`) : null
  const b = end ? toDate(`${end}T12:00:00Z`) : null
  if (!a || !b) return 'Sin semana asignada'
  return `Semana del ${formatMadrid(a, 'date').replace(/ de \d{4}$/, '')} al ${formatMadrid(b, 'date')}`
}

// Línea de estado de un menú: semana + hora programada. Nunca se inventa una hora.
export function menuStateLine(m: Pick<MenuRow, 'state' | 'weekStart' | 'weekEnd' | 'publishAt' | 'weekly'>): string {
  if (m.state === 'published') return m.weekStart ? `Publicado · ${menuWeekText(m.weekStart, m.weekEnd)}` : 'Publicado'
  if (m.state === 'scheduled' && m.publishAt) return `Sale el ${formatMadrid(m.publishAt, 'full')} (hora peninsular) · ${menuWeekText(m.weekStart, m.weekEnd)}`
  if (m.state === 'error') return m.publishAt ? `Debía salir el ${formatMadrid(m.publishAt, 'full')} (hora peninsular)` : 'No se ha podido publicar'
  if (m.state === 'draft') return m.weekly ? 'Al aprobarlo se programa para el próximo sábado a las 10:00' : 'Al aprobarlo se publica al momento (no es semanal)'
  return ''
}

// Próximos sábados a las 10:00 de Madrid (con el cambio de hora), estrictamente posteriores a `now`: para reprogramar un menú.
export function nextMenuSaturdays(now: Date, count = 8): { value: string; label: string }[] {
  const p = madridParts(now)
  const out: { value: string; label: string }[] = []
  let add = (6 - p.isoWeekday + 7) % 7
  for (let guard = 0; out.length < count && guard < count + 3; guard++, add += 7) {
    const d = new Date(Date.UTC(p.year, p.month - 1, p.day + add))
    const at = madridWallToInstant(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 10, 0)
    if (at.getTime() > now.getTime()) out.push({ value: at.toISOString(), label: formatMadrid(at, 'full') })
  }
  return out
}

export function menuApproveText(result: unknown): string {
  const r = asRec(result)
  const at = toDate(r.publishAt)
  if (bool(r.scheduled) && at) return `Menú aprobado. NO se publica ahora: sale el ${formatMadrid(at, 'full')} (hora peninsular). ${menuWeekText(strOrNull(r.weekStart), strOrNull(r.weekEnd))}.`
  return 'Menú aprobado y publicado.'
}

export function menuRetryText(result: unknown): { ok: boolean; text: string } {
  const r = asRec(result)
  if (bool(r.ok)) return { ok: true, text: 'Menú publicado.' }
  return { ok: false, text: `Sigue sin poder publicarse (intento ${num(r.attempts, 1)}). ${str(r.error)}`.trim() }
}

export function menuRescheduleText(result: unknown): string {
  const r = asRec(result)
  const at = toDate(r.publishAt)
  if (bool(r.scheduled) && at) return `Menú reprogramado: sale el ${formatMadrid(at, 'full')} (hora peninsular).`
  return 'Programación cancelada: el menú vuelve a «Borrador».'
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Encuestas
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export interface PollRow {
  id: string
  title: string
  options: string[]
  opensAt: Date | null
  closesAt: Date | null
  phase: PollPhase | null
  publishedPostId: string | null
}

// Encuestas aprobadas (programadas) y publicadas (abiertas o cerradas), de la más reciente a la más antigua.
export function buildPollRows(proposals: Proposal[], now: Date): PollRow[] {
  return proposals
    .filter((p) => p.kind === 'poll' && (p.status === 'approved' || p.status === 'published'))
    .map((p) => {
      const opens = toDate(p.publishAt)
      const closes = opens ? pollClosesAt(opens) : null
      return {
        id: p.id,
        title: p.title,
        options: p.payload.options,
        opensAt: opens,
        closesAt: closes,
        phase: opens && closes ? pollPhase(now, opens, closes) : null,
        publishedPostId: p.publishedPostId,
      }
    })
    .sort((a, b) => (b.opensAt?.getTime() ?? 0) - (a.opensAt?.getTime() ?? 0))
}

export function pollPhaseText(phase: PollPhase | null): string {
  return phase ? POLL_PHASE_TEXT[phase] : 'Sin fecha de apertura'
}

export interface PollResultLine {
  option: string
  votes: number
  percent: number
}

export function pollResultLines(options: string[], counts: number[] | null, total: number | null): PollResultLine[] {
  const sum = total ?? (counts ? counts.reduce((a, b) => a + b, 0) : 0)
  return options.map((option, i) => {
    const votes = counts?.[i] ?? 0
    return { option, votes, percent: sum > 0 ? Math.round((votes / sum) * 100) : 0 }
  })
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Destacados
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export interface FeaturedItem {
  id: string
  title: string
  featuredAt: string | null
  removed: boolean
  likes: number
  comments: number
  saves: number
}

export function toFeaturedItems(raw: unknown): FeaturedItem[] {
  return rows(raw)
    .filter((r) => str(r.id) !== '')
    .map((r) => ({
      id: str(r.id),
      title: str(r.title),
      featuredAt: strOrNull(r.featuredAt),
      removed: bool(r.removed),
      likes: num(r.likes),
      comments: num(r.comments),
      saves: num(r.saves),
    }))
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export const LAUNCH_KEY = 'launch_enabled'

export interface SettingMeta {
  label: string
  unit?: string
  // Solo se pueden cambiar los parámetros autorizados (lista blanca que impone también el servidor); el resto lo fija la especificación aprobada.
  editable: boolean
  min?: number
  max?: number
}

export const FIXED_SETTING_LABEL = 'Fijado por las reglas aprobadas'

// Nombre corto en español de cada parámetro conocido (la descripción larga la manda el servidor).
export const SETTING_META: Record<string, SettingMeta> = {
  // Editables (lista blanca).
  rate_posts_per_hour: { label: 'Publicaciones por persona y hora', unit: 'por hora', editable: true, min: 1, max: 100 },
  rate_comments_per_10min: { label: 'Comentarios por persona cada 10 minutos', unit: 'cada 10 min', editable: true, min: 1, max: 200 },
  rate_reports_per_day: { label: 'Denuncias por persona y día', unit: 'por día', editable: true, min: 1, max: 200 },
  report_autohide_distinct_reporters: { label: 'Denunciantes distintos para ocultar provisionalmente', unit: 'personas', editable: true, min: 1, max: 10 },
  max_links_per_post: { label: 'Enlaces por publicación o comentario', unit: 'enlaces', editable: true, min: 1, max: 50 },
  ai_daily_cap: { label: 'Tope diario de llamadas de IA (0 = sin tope)', unit: 'al día', editable: true, min: 0, max: 5000 },
  // Fijados por la especificación aprobada: solo lectura.
  summary_comment_threshold: { label: 'Comentarios para el resumen de Pepa', unit: 'comentarios', editable: false },
  summary_refresh_every: { label: 'Comentarios nuevos para renovar el resumen', unit: 'comentarios', editable: false },
  pepa_unanswered_hours: { label: 'Horas sin respuesta para que Pepa conteste', unit: 'horas', editable: false },
  pepa_max_per_hour: { label: 'Intervenciones de Pepa por hora', unit: 'por hora', editable: false },
  draft_days: { label: 'Días que se guarda un borrador', unit: 'días', editable: false },
  first_ban_days: { label: 'Duración de la primera expulsión', unit: 'días', editable: false },
  max_photos_per_post: { label: 'Fotos por publicación', unit: 'fotos', editable: false },
  search_history_size: { label: 'Búsquedas recientes que se guardan', unit: 'búsquedas', editable: false },
  admin_log_retention_years: { label: 'Años que se conserva el historial de administración', unit: 'años', editable: false },
  participants_adults_only: { label: 'Solo participan personas adultas', editable: false },
  [LAUNCH_KEY]: { label: 'Comunidad abierta a todos', editable: false },
  // Solo lectura: se activa con un ajuste técnico cuando la dueña valide el menú semanal.
  weekly_menu_autopublish: { label: 'Publicación automática del menú semanal (0 = desactivada, 1 = activada)', editable: false },
}

export type SettingKind = 'number' | 'switch' | 'other'

export interface AdminSetting {
  key: string
  label: string
  unit: string | null
  description: string
  value: number | null
  kind: SettingKind
  // false = solo lectura («Fijado por las reglas aprobadas»). Un parámetro desconocido NUNCA es editable.
  editable: boolean
  min: number
  max: number
}

// Los interruptores son los parámetros que solo valen 0 o 1 (por ahora, la apertura de Comunidad).
export const SWITCH_KEYS: string[] = [LAUNCH_KEY]

export interface AdminSettings {
  settings: AdminSetting[]
  blockedDomains: { domain: string; reason: string | null }[]
}

export function toAdminSettings(raw: unknown): AdminSettings {
  const r = asRec(raw)
  return {
    settings: rows(r.settings)
      .filter((s) => str(s.key) !== '')
      .map((s) => {
        const key = str(s.key)
        const value = typeof s.value === 'number' && Number.isFinite(s.value) ? s.value : null
        const meta = SETTING_META[key]
        return {
          key,
          label: meta?.label ?? key.replace(/_/g, ' '),
          unit: meta?.unit ?? null,
          description: str(s.description),
          value,
          kind: value === null ? 'other' : SWITCH_KEYS.includes(key) ? 'switch' : 'number',
          editable: meta?.editable === true && value !== null && !SWITCH_KEYS.includes(key),
          min: meta?.min ?? 0,
          max: meta?.max ?? 0,
        }
      }),
    blockedDomains: rows(r.blockedDomains)
      .filter((d) => str(d.domain) !== '')
      .map((d) => ({ domain: str(d.domain), reason: strOrNull(d.reason) })),
  }
}

// Entero dentro del rango autorizado de ese parámetro (el servidor lo vuelve a comprobar con su lista blanca).
export function validateSettingValue(raw: string, min = 0, max = 100000): { value: number | null; error: string | null } {
  const t = raw.trim()
  if (!/^\d+$/.test(t)) return { value: null, error: 'Escribe un número entero, sin decimales ni signos.' }
  const n = Number(t)
  if (n < min || n > max) return { value: null, error: `El valor tiene que estar entre ${min} y ${max}.` }
  return { value: n, error: null }
}

export function normalizeDomain(raw: string): { domain: string | null; error: string | null } {
  let d = raw.trim().toLowerCase()
  d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^www\./, '')
  d = d.split(/[/?#:]/)[0] ?? ''
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return { domain: null, error: 'Escribe solo el nombre del sitio, por ejemplo ejemplo.com.' }
  return { domain: d, error: null }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Historial de acciones
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export const LOG_PAGE_SIZE = 30

export interface LogEntry {
  id: string
  actor: string
  action: string
  targetType: string
  reason: string | null
  details: Record<string, unknown>
  createdAt: string | null
}

export function toLogEntries(raw: unknown): LogEntry[] {
  return rows(raw).map((r) => ({
    id: String(r.id ?? ''),
    actor: str(r.actor, 'sistema'),
    action: str(r.action),
    targetType: str(r.targetType),
    reason: strOrNull(r.reason),
    details: asRec(r.details),
    createdAt: strOrNull(r.createdAt),
  }))
}

export const LOG_ACTION_TEXT: Record<string, string> = {
  warning: 'Puso una advertencia',
  warning_revoked: 'Retiró una advertencia',
  ban: 'Expulsó de Comunidad',
  ban_lifted: 'Retiró una expulsión',
  resolve_sin_accion: 'Resolvió una denuncia sin acción',
  resolve_ocultar: 'Resolvió una denuncia ocultando el contenido',
  resolve_advertir: 'Resolvió una denuncia advirtiendo al autor',
  resolve_expulsar: 'Resolvió una denuncia expulsando al autor',
  resolve_visitor_sin_accion: 'Resolvió una denuncia de visitante sin acción',
  resolve_visitor_oculto: 'Resolvió una denuncia de visitante ocultando el contenido',
  resolve_visitor_advertencia: 'Resolvió una denuncia de visitante advirtiendo al autor',
  resolve_visitor_expulsion: 'Resolvió una denuncia de visitante expulsando al autor',
  resolve_visitor_otro: 'Resolvió una denuncia de visitante con otra decisión',
  hide: 'Ocultó un contenido',
  restore: 'Restauró un contenido',
  readmission_approved: 'Aprobó una readmisión',
  readmission_rejected: 'Rechazó una readmisión',
  removal_done: 'Eliminó contenido a petición de su autor',
  removal_rejected: 'Rechazó una petición de eliminar contenido',
  launch: 'Abrió Comunidad a todos',
  unlaunch: 'Cerró Comunidad a todos',
  setting: 'Cambió un parámetro',
  feature: 'Volvió a poner un destacado',
  unfeature: 'Retiró un destacado',
  domain_blocked: 'Bloqueó un dominio',
  domain_unblocked: 'Desbloqueó un dominio',
  proposal_approved: 'Aprobó una propuesta oficial',
  proposal_edit: 'Editó una propuesta oficial',
  proposal_rejected: 'Rechazó una propuesta oficial',
  menu_published: 'Se publicó un menú semanal',
  menu_publish_failed: 'Falló la publicación de un menú semanal',
  menu_rescheduled: 'Reprogramó un menú semanal',
  menu_unscheduled: 'Canceló la programación de un menú semanal',
  menu_retry_published: 'Publicó un menú semanal tras reintentar',
  menu_retry_failed: 'Reintentó publicar un menú semanal y falló',
}

export const LOG_TARGET_TEXT: Record<string, string> = {
  user: 'Persona',
  post: 'Publicación',
  comment: 'Comentario',
  review: 'Reseña',
  setting: 'Parámetro',
  domain: 'Dominio',
  official_item: 'Propuesta oficial',
  removal_request: 'Solicitud de eliminación',
}

export function logActionText(action: string): string {
  return LOG_ACTION_TEXT[action] ?? action.replace(/_/g, ' ')
}

export function logTargetText(type: string): string {
  return LOG_TARGET_TEXT[type] ?? 'Otro'
}

// Dato extra útil de algunas acciones (nunca ids internos).
export function logExtra(e: Pick<LogEntry, 'action' | 'details'>): string | null {
  const d = e.details
  if (e.action === 'ban' && typeof d.days === 'number') return `${d.days} días`
  if ((e.action === 'proposal_approved' || e.action === 'proposal_edit') && typeof d.version === 'number') return `versión ${d.version}`
  return null
}

// Motivo que se enseña en el historial. El servidor guarda para algunas acciones un texto técnico («max_links_per_post=12», «launch_enabled»):
// aquí se convierte en una frase en español con el nombre legible del ajuste y su valor. El resto de motivos (escritos por quien administra) van tal cual.
export function logReasonText(e: Pick<LogEntry, 'action' | 'reason'>): string | null {
  const reason = e.reason?.trim()
  if (!reason) return null
  if (e.action === 'launch' || e.action === 'unlaunch') return reason === LAUNCH_KEY ? null : reason
  if (e.action === 'setting') {
    const m = /^([a-z][a-z0-9_]*)=(-?[0-9]+)$/.exec(reason)
    if (!m) return reason
    const [, key, value] = m
    const meta = SETTING_META[key]
    // El nombre largo puede traer una aclaración entre paréntesis («… (0 = sin tope)»): se quita porque la frase ya dice el valor.
    const label = (meta?.label ?? key.replace(/_/g, ' ')).replace(/ *[(][^)]*[)] *$/, '')
    if (key === 'ai_daily_cap' && Number(value) === 0) return `Ahora «${label}» está sin tope.`
    return `Ahora «${label}» vale ${value}${meta?.unit ? ` ${meta.unit}` : ''}.`
  }
  return reason
}

// Pide una fila de más para saber si hay página siguiente sin otra consulta.
export function splitPage<T>(items: T[], pageSize: number): { page: T[]; hasMore: boolean } {
  return { page: items.slice(0, pageSize), hasMore: items.length > pageSize }
}

// ---- Temas propuestos por las familias (0284): agrupados por tema; la administración NO ve quién propone, solo cuántas personas distintas.
export interface TopicProposalGroup {
  groupKey: string
  label: string
  topicId: string
  topicLabel: string
  people: number
  proposals: number
  firstAt: string
  lastAt: string
  texts: string[]
  ids: string[]
  // Cuántas personas aceptaron que se las mencione (sin decir quiénes), el artículo enlazado y si ya se avisó.
  creditPeople: number
  itemId: string | null
  itemTitle: string | null
  itemStatus: string | null
  notified: boolean
}

export function toTopicProposalGroups(raw: unknown): TopicProposalGroup[] {
  if (!Array.isArray(raw)) return []
  const out: TopicProposalGroup[] = []
  for (const x of raw) {
    if (typeof x !== 'object' || x === null) continue
    const g = x as Record<string, unknown>
    if (typeof g.groupKey !== 'string' || typeof g.label !== 'string') continue
    out.push({
      groupKey: g.groupKey,
      label: g.label,
      topicId: typeof g.topicId === 'string' ? g.topicId : '',
      topicLabel: typeof g.topicLabel === 'string' ? g.topicLabel : '',
      people: typeof g.people === 'number' ? g.people : 0,
      proposals: typeof g.proposals === 'number' ? g.proposals : 0,
      firstAt: typeof g.firstAt === 'string' ? g.firstAt : '',
      lastAt: typeof g.lastAt === 'string' ? g.lastAt : '',
      texts: Array.isArray(g.texts) ? g.texts.filter((t): t is string => typeof t === 'string') : [],
      ids: Array.isArray(g.ids) ? g.ids.filter((t): t is string => typeof t === 'string') : [],
      creditPeople: typeof g.creditPeople === 'number' ? g.creditPeople : 0,
      itemId: typeof g.itemId === 'string' ? g.itemId : null,
      itemTitle: typeof g.itemTitle === 'string' ? g.itemTitle : null,
      itemStatus: typeof g.itemStatus === 'string' ? g.itemStatus : null,
      notified: g.notified === true,
    })
  }
  return out
}

export function peopleLabel(n: number): string {
  return n === 1 ? '1 persona' : `${n} personas`
}
