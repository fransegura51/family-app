import { BUCKET_TITLES, type AppNotification, type BucketView, type NotificationBucket } from '@/domain/notificationsCenter'

// NOT-01 — dos formas de ver el panel de avisos, a elegir por persona (user_notification_prefs.notification_view_mode, igual en todos sus dispositivos):
//  · 'areas'    → «Por áreas»: los avisos agrupados por módulo (Calendario, Economía…) con su contador de no leídos. Las áreas con no leídos suben arriba (la del no leído más reciente,
//                 primero) y salen desplegadas; el resto, en un orden fijo y plegadas. El orden se calcula UNA vez al cargar: marcar un aviso como leído no recoloca nada.
//  · 'personal' → «Por prioridad personal» (lo de siempre): Personales / Otras notificaciones, con los no leídos primero. Cada persona decide qué TIPOS de aviso cuentan como personales
//                 (personal_categories); sin elegir, valen los que el servidor ya marcaba como personales.
// Lógica pura, sin red.

export type NotificationArea = 'calendario' | 'economia' | 'ubicacion' | 'cumpleanos' | 'recompensas' | 'comunidad' | 'otros'
export type NotificationViewMode = 'areas' | 'personal'

export const AREA_ORDER: NotificationArea[] = ['calendario', 'economia', 'ubicacion', 'cumpleanos', 'recompensas', 'comunidad', 'otros']
export const AREA_META: Record<NotificationArea, { label: string; icon: string }> = {
  calendario: { label: 'Calendario y tareas', icon: '📅' },
  economia: { label: 'Economía', icon: '💶' },
  ubicacion: { label: 'Ubicación', icon: '📍' },
  cumpleanos: { label: 'Cumpleaños', icon: '🎂' },
  recompensas: { label: 'Recompensas', icon: '🏅' },
  comunidad: { label: 'Comunidad', icon: '👥' },
  otros: { label: 'Otros', icon: '🔔' },
}

export interface NotificationTypeInfo {
  category: string
  label: string
  area: NotificationArea
  /** ¿Cuenta como «personal» mientras la persona no haya elegido? (= el bloque en el que ya salía). */
  defaultPersonal: boolean
}

export const NOTIFICATION_TYPES: NotificationTypeInfo[] = [
  { category: 'task_assigned', label: 'Te asignan una tarea', area: 'calendario', defaultPersonal: true },
  { category: 'task_daily_summary', label: 'Tareas de hoy', area: 'calendario', defaultPersonal: true },
  { category: 'task_overdue_summary', label: 'Tareas atrasadas', area: 'calendario', defaultPersonal: true },
  { category: 'calendar_reminder', label: 'Recordatorios de eventos y tareas', area: 'calendario', defaultPersonal: false },
  { category: 'forecast_due', label: 'Pagos previstos que vencen', area: 'economia', defaultPersonal: false },
  { category: 'bank_import', label: 'Movimientos nuevos del banco', area: 'economia', defaultPersonal: false },
  { category: 'family_alert', label: 'Llegadas y salidas de la familia', area: 'ubicacion', defaultPersonal: false },
  { category: 'birthday_reminder', label: 'Cumpleaños', area: 'cumpleanos', defaultPersonal: true },
  { category: 'reward_request', label: 'Solicitudes de recompensa', area: 'recompensas', defaultPersonal: true },
  { category: 'community_digest', label: 'Novedades de Comunidad', area: 'comunidad', defaultPersonal: true },
  { category: 'community_followed_post', label: 'Publicaciones que sigues', area: 'comunidad', defaultPersonal: false },
  { category: 'community_suggestion', label: 'Sugerencias «Para ti»', area: 'comunidad', defaultPersonal: false },
  { category: 'community_admin', label: 'Avisos de moderación', area: 'comunidad', defaultPersonal: false },
  { category: 'community_minor_activity', label: 'Actividad de menores en Comunidad', area: 'comunidad', defaultPersonal: false },
]

const TYPE_BY_CATEGORY = new Map(NOTIFICATION_TYPES.map((t) => [t.category, t]))

export function areaOf(category: string): NotificationArea {
  const known = TYPE_BY_CATEGORY.get(category)
  if (known) return known.area
  if (category.startsWith('community')) return 'comunidad'
  if (category.startsWith('task_') || category.startsWith('calendar')) return 'calendario'
  if (category.startsWith('bank') || category.startsWith('forecast')) return 'economia'
  return 'otros'
}

export function isViewMode(value: unknown): value is NotificationViewMode {
  return value === 'areas' || value === 'personal'
}

/** ¿Cuenta este aviso como personal? Con tipos elegidos por la persona, manda su elección (un tipo que no conocemos se rige por el bloque del servidor). */
export function isPersonalNotification(n: Pick<AppNotification, 'category' | 'bucket'>, personalCategories: readonly string[] | null): boolean {
  if (!personalCategories) return n.bucket === 'personal'
  if (!TYPE_BY_CATEGORY.has(n.category) && !n.category.startsWith('community')) return n.bucket === 'personal'
  return personalCategories.includes(n.category)
}

/** Los tipos que cuentan como personales por defecto (lo que se marca en Configuración antes de que la persona elija). */
export function defaultPersonalCategories(): string[] {
  return NOTIFICATION_TYPES.filter((t) => t.defaultPersonal).map((t) => t.category)
}

function newestFirst(a: AppNotification, b: AppNotification): number {
  const diff = Date.parse(b.createdAt) - Date.parse(a.createdAt)
  return diff !== 0 ? diff : b.id.localeCompare(a.id)
}

/**
 * Vista «Por prioridad personal»: Personales y Otras, con los avisos que estaban SIN LEER al cargar primero (`unreadAtLoad`) y luego los demás, cada grupo de más reciente a más antiguo.
 * Se ordena con la foto del momento de cargar, no con el estado actual: al marcar uno como leído no salta de sitio.
 */
export function buildPersonalViews(list: readonly AppNotification[], personalCategories: readonly string[] | null, unreadAtLoad: ReadonlySet<string>): BucketView[] {
  const views: BucketView[] = []
  for (const bucket of ['personal', 'other'] as NotificationBucket[]) {
    const items = list
      .filter((n) => (isPersonalNotification(n, personalCategories) ? 'personal' : 'other') === bucket)
      .sort((a, b) => {
        const ua = unreadAtLoad.has(a.id) ? 0 : 1
        const ub = unreadAtLoad.has(b.id) ? 0 : 1
        return ua !== ub ? ua - ub : newestFirst(a, b)
      })
    if (items.length === 0) continue
    views.push({ bucket, title: BUCKET_TITLES[bucket], items, unread: items.filter((n) => n.readAt === null), earlier: items.filter((n) => n.readAt !== null) })
  }
  return views
}

/** Orden de las áreas al cargar: primero las que tienen no leídos (la del no leído más reciente, arriba); después las demás en el orden fijo. Solo áreas con avisos. */
export function computeAreaOrder(list: readonly AppNotification[]): NotificationArea[] {
  const latestUnread = new Map<NotificationArea, number>()
  const present = new Set<NotificationArea>()
  for (const n of list) {
    const area = areaOf(n.category)
    present.add(area)
    if (n.readAt === null) latestUnread.set(area, Math.max(latestUnread.get(area) ?? 0, Date.parse(n.createdAt)))
  }
  const withUnread = [...latestUnread.entries()].sort((a, b) => b[1] - a[1] || AREA_ORDER.indexOf(a[0]) - AREA_ORDER.indexOf(b[0])).map(([a]) => a)
  const rest = AREA_ORDER.filter((a) => present.has(a) && !latestUnread.has(a))
  return [...withUnread, ...rest]
}

export interface AreaView {
  area: NotificationArea
  title: string
  icon: string
  /** Todos los avisos del área, de más reciente a más antiguo. */
  items: AppNotification[]
  /** Sin leer AHORA (el contador de la cabecera se actualiza al leer; el orden de las áreas no). */
  unreadCount: number
  /** ¿Empieza desplegada? Sí si tenía no leídos al cargar. */
  startsExpanded: boolean
}

export function buildAreaViews(list: readonly AppNotification[], order: readonly NotificationArea[], unreadAtLoad: ReadonlySet<string>): AreaView[] {
  const views: AreaView[] = []
  for (const area of order) {
    const items = list.filter((n) => areaOf(n.category) === area).sort(newestFirst)
    if (items.length === 0) continue
    views.push({
      area,
      title: AREA_META[area].label,
      icon: AREA_META[area].icon,
      items,
      unreadCount: items.filter((n) => n.readAt === null).length,
      startsExpanded: items.some((n) => unreadAtLoad.has(n.id)),
    })
  }
  return views
}
