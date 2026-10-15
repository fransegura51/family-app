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
export type AdminTabId = 'resumen' | 'moderacion' | 'usuarios' | 'oficial' | 'encuestas' | 'destacados' | 'configuracion' | 'historial'

export const ADMIN_TABS: { id: AdminTabId; label: string; icon: string }[] = [
  { id: 'resumen', label: 'Resumen', icon: '📊' },
  { id: 'moderacion', label: 'Moderación', icon: '🛡️' },
  { id: 'usuarios', label: 'Usuarios', icon: '👥' },
  { id: 'oficial', label: 'Contenido oficial', icon: '📝' },
  { id: 'encuestas', label: 'Encuestas', icon: '🗳️' },
  { id: 'destacados', label: 'Destacados', icon: '⭐' },
  { id: 'configuracion', label: 'Configuración', icon: '⚙️' },
  { id: 'historial', label: 'Historial', icon: '📜' },
]

// La pestaña activa viaja en la dirección (?tab=…) para que recargar la página no te devuelva al principio; un valor raro vuelve a Resumen.
export function parseAdminTab(v: string | null | undefined): AdminTabId {
  return ADMIN_TABS.find((t) => t.id === v)?.id ?? 'resumen'
}

export type ModerationSection = 'denuncias' | 'ocultos' | 'readmisiones' | 'eliminacion'

export const MODERATION_SECTIONS: { id: ModerationSection; label: string }[] = [
  { id: 'denuncias', label: 'Denuncias' },
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
  { key: 'hiddenContent', label: 'Contenido oculto', hint: 'Publicaciones y comentarios ocultos' },
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
export type ReportTargetType = 'post' | 'comment' | 'user'
export type ResolveAction = 'sin_accion' | 'ocultar' | 'advertir' | 'expulsar'

export const TARGET_TYPE_TEXT: Record<ReportTargetType, string> = { post: 'Publicación', comment: 'Comentario', user: 'Persona' }

export function reasonLabel(id: string): string {
  return REPORT_REASONS.find((r) => r.id === id)?.label ?? id
}

export interface ReportedContent {
  title: string
  excerpt: string
  status: string
  authorId: string | null
  authorAlias: string
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

const asTargetType = (v: unknown): ReportTargetType => (v === 'comment' || v === 'user' ? v : 'post')

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
  type: 'post' | 'comment'
  id: string
  title: string
  body: string
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
  const type = raw.type === 'comment' ? 'comment' : 'post'
  const photoPath = strOrNull(raw.photoPath)
  const photos = asArr(raw.photos).filter((x): x is string => typeof x === 'string')
  return {
    type,
    id: str(raw.id),
    title: str(raw.title),
    body: str(raw.body),
    status: str(raw.status),
    hiddenReason: strOrNull(raw.hiddenReason),
    authorAlias: str(raw.authorAlias, 'Persona sin alias'),
    kind: strOrNull(raw.kind),
    createdAt: strOrNull(raw.createdAt),
    postId: type === 'comment' ? strOrNull(raw.postId) : null,
    photos: photoPath ? [photoPath, ...photos] : photos,
    reports: rows(raw.reports).map((r) => ({ reason: str(r.reason), detail: strOrNull(r.detail), status: str(r.status), createdAt: strOrNull(r.createdAt) })),
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Ocultos, readmisiones y solicitudes de eliminación
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export interface HiddenItem {
  key: string
  type: 'post' | 'comment'
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
      const type = r.type === 'comment' ? 'comment' : 'post'
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
export type ProposalKind = 'tip' | 'poll' | 'article'
export type ProposalStatus = 'proposed' | 'approved' | 'rejected' | 'published'

export const PROPOSAL_KIND_TEXT: Record<ProposalKind, string> = { tip: 'Consejo de Pepa', poll: 'Encuesta', article: 'Artículo de Equipo PEPA' }
export const PROPOSAL_KIND_ICON: Record<ProposalKind, string> = { tip: '💡', poll: '🗳️', article: '📰' }

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
}

const asKind = (v: unknown): ProposalKind => (v === 'poll' || v === 'article' ? v : 'tip')
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
  if (kind === 'tip') return null
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
  return kind === 'article' ? 'Artículo aprobado y publicado.' : 'Consejo aprobado y publicado.'
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
}

export const LOG_TARGET_TEXT: Record<string, string> = {
  user: 'Persona',
  post: 'Publicación',
  comment: 'Comentario',
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

// Pide una fila de más para saber si hay página siguiente sin otra consulta.
export function splitPage<T>(items: T[], pageSize: number): { page: T[]; hasMore: boolean } {
  return { page: items.slice(0, pageSize), hasMore: items.length > pageSize }
}
