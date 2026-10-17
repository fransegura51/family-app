// Campana de avisos de Inicio: lógica pura (sin red) para ordenar, separar y plegar los avisos que se enseñan en el panel.
//
// Reglas aprobadas: dos bloques en orden fijo (Personales arriba, Otras notificaciones debajo); dentro de cada bloque, de más reciente a más antiguo
// (nunca por importancia); en cada bloque las no leídas desplegadas y las leídas plegadas bajo «Ver anteriores (X)»; no se enseñan bloques vacíos;
// el contador es el de avisos SIN LEER (no el del historial); abrir el panel no marca nada como leído, abrir un aviso sí.

export type NotificationBucket = 'personal' | 'other'

export interface AppNotification {
  id: string
  bucket: NotificationBucket
  category: string
  title: string
  body: string
  url: string | null
  groupKey: string | null
  payload: Record<string, unknown>
  createdAt: string
  readAt: string | null
}

export interface BucketView {
  bucket: NotificationBucket
  title: string
  // TODAS las del bloque, de más reciente a más antigua (el orden no cambia al marcar una como leída: nada salta mientras se lee).
  items: AppNotification[]
  unread: AppNotification[]
  earlier: AppNotification[]
}

export const BUCKET_TITLES: Record<NotificationBucket, string> = {
  personal: 'Personales',
  other: 'Otras notificaciones',
}

// Orden fijo de los bloques.
export const BUCKET_ORDER: NotificationBucket[] = ['personal', 'other']

function newestFirst(a: AppNotification, b: AppNotification): number {
  const diff = Date.parse(b.createdAt) - Date.parse(a.createdAt)
  return diff !== 0 ? diff : b.id.localeCompare(a.id)
}

export function unreadCount(list: AppNotification[]): number {
  return list.filter((n) => n.readAt === null).length
}

export function readCount(list: AppNotification[]): number {
  return list.filter((n) => n.readAt !== null).length
}

// «3 nuevas · 12 leídas»: se cuentan por separado (no solo un total).
export function countsLabel(unread: number, read: number): string {
  const nuevas = unread === 1 ? '1 nueva' : `${unread} nuevas`
  const leidas = read === 1 ? '1 leída' : `${read} leídas`
  return `${nuevas} · ${leidas}`
}

// Tiempo que un aviso tiene que estar a la vista en la pantalla de Avisos para darse por leído.
export const DWELL_READ_MS = 3000

// Seguimiento de «a la vista»: cada aviso que entra en la zona visible arranca su cuenta atrás; si sale antes de tiempo (o se cierra el panel) se cancela. Solo avisa
// UNA vez por aviso. Lógica pura (sin DOM) para poder probarla con temporizadores simulados.
export function createDwellTracker(onDwell: (id: string) => void, delayMs: number = DWELL_READ_MS) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const done = new Set<string>()
  return {
    enter(id: string) {
      if (done.has(id) || timers.has(id)) return
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id)
          done.add(id)
          onDwell(id)
        }, delayMs),
      )
    },
    leave(id: string) {
      const t = timers.get(id)
      if (t !== undefined) {
        clearTimeout(t)
        timers.delete(id)
      }
    },
    // Pausa general (pestaña oculta, detalle abierto o panel cerrado): ningún aviso cuenta mientras tanto.
    cancelAll() {
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
    },
    pending() {
      return timers.size
    },
  }
}

// Bloques del panel: sin bloques vacíos, cada uno con sus no leídas (desplegadas) y sus anteriores/leídas (plegadas).
export function buildBucketViews(list: AppNotification[]): BucketView[] {
  const views: BucketView[] = []
  for (const bucket of BUCKET_ORDER) {
    const items = list.filter((n) => n.bucket === bucket).sort(newestFirst)
    if (items.length === 0) continue
    views.push({
      bucket,
      title: BUCKET_TITLES[bucket],
      items,
      unread: items.filter((n) => n.readAt === null),
      earlier: items.filter((n) => n.readAt !== null),
    })
  }
  return views
}

// Solo rutas internas de PEPA: un aviso nunca puede mandar a otra web.
export function safeInternalUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null
  if (!url.startsWith('/') || url.startsWith('//') || url.includes('\\')) return null
  return url
}

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// «hace 5 min», «ayer», «el 12 oct»…
export function relativeTime(createdAt: string, now: Date = new Date()): string {
  const then = new Date(createdAt)
  const seconds = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000))
  if (seconds < 60) return 'ahora'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  return `el ${then.getDate()} ${MONTHS_SHORT[then.getMonth()]}`
}

// Texto del contador de la campana: 99+ para no desbordar el círculo.
export function badgeText(count: number): string {
  return count > 99 ? '99+' : String(count)
}

// Ids a borrar según la selección (sin duplicados y solo los que existen).
export function selectionIds(list: AppNotification[], selected: Set<string>): string[] {
  return list.filter((n) => selected.has(n.id)).map((n) => n.id)
}
