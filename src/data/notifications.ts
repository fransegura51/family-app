// Centro de avisos (campana de Inicio): historial de avisos de cada persona, contador de no leídos y ajustes de avisos por persona.
// Todo vive en la base (migraciones 0260-0262), así que la lectura, el borrado y los ajustes se sincronizan entre los dispositivos de la misma persona.
// Las tablas solo dejan ver/cambiar lo propio (RLS); un aviso solo permite cambiar su «leído» (no el texto) y nadie crea avisos desde la app.
import { supabase } from '@/data/supabaseClient'
import type { AppNotification, NotificationBucket } from '@/domain/notificationsCenter'
import type { NotificationPrefs, TaskNotifyMode } from '@/domain/notificationPrefs'
import { DEFAULT_NOTIFICATION_PREFS } from '@/domain/notificationPrefs'
import { isViewMode } from '@/domain/notificationAreas'
import type { NotifyModes } from '@/domain/eventRecipients'

interface NotificationRow {
  id: string
  bucket: string
  category: string
  title: string
  body: string
  url: string | null
  group_key: string | null
  payload: Record<string, unknown> | null
  created_at: string
  read_at: string | null
}

const COLUMNS = 'id, bucket, category, title, body, url, group_key, payload, created_at, read_at'

function fromRow(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    bucket: row.bucket === 'personal' ? 'personal' : ('other' as NotificationBucket),
    category: row.category,
    title: row.title,
    body: row.body,
    url: row.url,
    groupKey: row.group_key,
    payload: row.payload ?? {},
    createdAt: row.created_at,
    readAt: row.read_at,
  }
}

// El historial dura 30 días, así que una sola consulta (con tope) cubre todo lo que se enseña.
export const NOTIFICATIONS_LIMIT = 300

export async function listNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase.from('user_notifications').select(COLUMNS).order('created_at', { ascending: false }).limit(NOTIFICATIONS_LIMIT)
  if (error) throw error
  return ((data ?? []) as NotificationRow[]).map(fromRow)
}

// NOT-04: los movimientos (gastos) del último aviso agrupado de «movimientos nuevos del banco», para abrir Economía → Movimientos solo con ellos. El aviso guarda los
// identificadores de los movimientos del banco; aquí se resuelve a qué gastos corresponden (los que ya se han creado a partir de ellos).
export async function getLatestBankImportExpenseIds(): Promise<string[]> {
  const { data, error } = await supabase.from('user_notifications').select('payload').eq('category', 'bank_import').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  const raw = (data as { payload: { bank_tx_ids?: unknown } | null } | null)?.payload?.bank_tx_ids
  const txIds = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
  if (txIds.length === 0) return []
  const { data: rows, error: rowsError } = await supabase.from('bank_transactions').select('matched_expense_id').in('id', txIds).not('matched_expense_id', 'is', null)
  if (rowsError) throw rowsError
  return [...new Set(((rows ?? []) as { matched_expense_id: string }[]).map((r) => r.matched_expense_id))]
}

// Solo el número (sin traer los avisos): es lo que se pide al abrir Inicio y al volver a la app.
export async function fetchUnreadNotificationCount(): Promise<number> {
  const { count, error } = await supabase.from('user_notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
  if (error) throw error
  return count ?? 0
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('user_notifications').update({ read_at: new Date().toISOString() }).in('id', ids).is('read_at', null)
  if (error) throw error
}

// Abrir Novedades de Comunidad cuenta como «abrir el aviso agrupado»: marca como leídos los avisos agrupados de Comunidad (category community_digest)
// para que la espera hasta el siguiente aviso sea de 1 hora y no de 2 (INC-06, regla de 0271). Solo marca los propios (RLS) y solo el campo «leído».
export async function markCommunityDigestsRead(): Promise<void> {
  const { error } = await supabase.from('user_notifications').update({ read_at: new Date().toISOString() }).eq('category', 'community_digest').is('read_at', null)
  if (error) throw error
}

// La campana de Inicio cuenta los avisos sin leer una vez al abrir Inicio y al volver a la app (no hay consulta periódica). Cuando algo los cambia fuera del
// panel (abrir un aviso del sistema, abrir Novedades), se avisa con este evento para que la campana, si está en pantalla, se actualice al momento.
export const NOTIFICATIONS_CHANGED_EVENT = 'pepa:notifications-changed'
export function announceNotificationsChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
}

// «Marcar como no leída»: deja el aviso pendiente para recordarlo más tarde (el estado es del servidor, igual en todos los dispositivos de la persona).
export async function markNotificationUnread(id: string): Promise<void> {
  const { error } = await supabase.from('user_notifications').update({ read_at: null }).eq('id', id)
  if (error) throw error
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase.from('user_notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
  if (error) throw error
}

// «Marcar todas como no leídas»: deja todos los avisos pendientes para recordarlos (solo los propios, por RLS). Pareja de markAllNotificationsRead.
export async function markAllNotificationsUnread(): Promise<void> {
  const { error } = await supabase.from('user_notifications').update({ read_at: null }).not('read_at', 'is', null)
  if (error) throw error
}

// Borrar un aviso NO borra la tarea, el pago, el evento o la publicación a la que apuntaba.
export async function deleteNotifications(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('user_notifications').delete().in('id', ids)
  if (error) throw error
}

export async function deleteAllNotifications(): Promise<void> {
  const { error } = await supabase.from('user_notifications').delete().not('id', 'is', null)
  if (error) throw error
}

// ---- Ajustes de avisos por persona
interface PrefsRow {
  timezone: string
  task_today_enabled: boolean
  task_today_time: string
  task_overdue_enabled: boolean
  task_overdue_time: string
  personal_community_mode: string
  personal_window_start: string
  personal_window_end: string
  community_suggestions_enabled: boolean
  community_suggestion_every_hours: number
  notification_view_mode: string | null
  personal_categories: string[] | null
  overdue_repeat_hours: number | null
  bank_import_enabled: boolean | null
}

const PREFS_COLUMNS = 'timezone, task_today_enabled, task_today_time, task_overdue_enabled, task_overdue_time, personal_community_mode, personal_window_start, personal_window_end, community_suggestions_enabled, community_suggestion_every_hours, notification_view_mode, personal_categories, overdue_repeat_hours, bank_import_enabled'

// Las horas llegan como «08:00:00»; la app las usa como «08:00».
function hhmm(value: string): string {
  return value.slice(0, 5)
}

export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  const { data, error } = await supabase.from('user_notification_prefs').select(PREFS_COLUMNS).maybeSingle()
  if (error) throw error
  if (!data) return { ...DEFAULT_NOTIFICATION_PREFS }
  const row = data as PrefsRow
  return {
    timezone: row.timezone,
    taskTodayEnabled: row.task_today_enabled ?? DEFAULT_NOTIFICATION_PREFS.taskTodayEnabled,
    taskTodayTime: hhmm(row.task_today_time ?? DEFAULT_NOTIFICATION_PREFS.taskTodayTime),
    taskOverdueEnabled: row.task_overdue_enabled ?? DEFAULT_NOTIFICATION_PREFS.taskOverdueEnabled,
    taskOverdueTime: hhmm(row.task_overdue_time ?? DEFAULT_NOTIFICATION_PREFS.taskOverdueTime),
    personalCommunityMode: row.personal_community_mode === 'window' ? 'window' : 'any',
    personalWindowStart: hhmm(row.personal_window_start),
    personalWindowEnd: hhmm(row.personal_window_end),
    communitySuggestionsEnabled: row.community_suggestions_enabled ?? DEFAULT_NOTIFICATION_PREFS.communitySuggestionsEnabled,
    communitySuggestionEveryHours: row.community_suggestion_every_hours ?? DEFAULT_NOTIFICATION_PREFS.communitySuggestionEveryHours,
    notificationViewMode: isViewMode(row.notification_view_mode) ? row.notification_view_mode : DEFAULT_NOTIFICATION_PREFS.notificationViewMode,
    personalCategories: Array.isArray(row.personal_categories) ? row.personal_categories : null,
    overdueRepeatHours: row.overdue_repeat_hours ?? null,
    bankImportEnabled: row.bank_import_enabled ?? DEFAULT_NOTIFICATION_PREFS.bankImportEnabled,
  }
}

// Si la persona aún no tiene ajustes guardados, se crea la fila con lo que cambie y el resto por defecto.
export async function saveNotificationPrefs(patch: Partial<NotificationPrefs>): Promise<void> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const row: Record<string, unknown> = { profile_id: userResult.user.id }
  if (patch.timezone !== undefined) row.timezone = patch.timezone
  if (patch.taskTodayEnabled !== undefined) row.task_today_enabled = patch.taskTodayEnabled
  if (patch.taskTodayTime !== undefined) row.task_today_time = patch.taskTodayTime
  if (patch.taskOverdueEnabled !== undefined) row.task_overdue_enabled = patch.taskOverdueEnabled
  if (patch.taskOverdueTime !== undefined) row.task_overdue_time = patch.taskOverdueTime
  if (patch.personalCommunityMode !== undefined) row.personal_community_mode = patch.personalCommunityMode
  if (patch.personalWindowStart !== undefined) row.personal_window_start = patch.personalWindowStart
  if (patch.personalWindowEnd !== undefined) row.personal_window_end = patch.personalWindowEnd
  if (patch.communitySuggestionsEnabled !== undefined) row.community_suggestions_enabled = patch.communitySuggestionsEnabled
  if (patch.communitySuggestionEveryHours !== undefined) row.community_suggestion_every_hours = patch.communitySuggestionEveryHours
  if (patch.notificationViewMode !== undefined) row.notification_view_mode = patch.notificationViewMode
  if (patch.personalCategories !== undefined) row.personal_categories = patch.personalCategories
  if (patch.overdueRepeatHours !== undefined) row.overdue_repeat_hours = patch.overdueRepeatHours
  if (patch.bankImportEnabled !== undefined) row.bank_import_enabled = patch.bankImportEnabled
  const { error } = await supabase.from('user_notification_prefs').upsert(row, { onConflict: 'profile_id' })
  if (error) throw error
}

// ---- Destinatarios de los avisos de tareas y eventos (ajuste familiar: solo lo cambia un administrador)
export async function getTaskNotifyMode(familyId: string): Promise<TaskNotifyMode> {
  const { data, error } = await supabase.from('families').select('task_notify_mode').eq('id', familyId).maybeSingle()
  if (error) throw error
  const mode = (data as { task_notify_mode: string | null } | null)?.task_notify_mode
  return mode === 'all' || mode === 'assigned' ? mode : null
}

export async function setTaskNotifyMode(familyId: string, mode: 'all' | 'assigned'): Promise<void> {
  const { error } = await supabase.from('families').update({ task_notify_mode: mode }).eq('id', familyId)
  if (error) throw error
  modeCache = null
}

// NOT-03: destinatarios de los EVENTOS (independientes de los de las tareas).
export async function getEventNotifyMode(familyId: string): Promise<TaskNotifyMode> {
  const { data, error } = await supabase.from('families').select('event_notify_mode').eq('id', familyId).maybeSingle()
  if (error) throw error
  const mode = (data as { event_notify_mode: string | null } | null)?.event_notify_mode
  return mode === 'all' || mode === 'assigned' ? mode : null
}

export async function setEventNotifyMode(familyId: string, mode: 'all' | 'assigned'): Promise<void> {
  const { error } = await supabase.from('families').update({ event_notify_mode: mode }).eq('id', familyId)
  if (error) throw error
  modeCache = null
}

// Los formularios de tarea/evento necesitan saber el modo para enseñar o no la casilla «Aviso a toda la familia»: se pide una vez cada 5 minutos
// (la fila de la familia es la única que deja ver la RLS, no hace falta indicar el id).
let modeCache: { at: number; value: Promise<NotifyModes> } | null = null
const MODE_CACHE_MS = 5 * 60 * 1000

const asMode = (m: string | null | undefined): TaskNotifyMode => (m === 'all' || m === 'assigned' ? m : null)

// Los dos ajustes (tareas y eventos) en UNA sola consulta; sin elegir, null (los valores por defecto los resuelve resolveNotifyMode).
export function getNotifyModesCached(): Promise<NotifyModes> {
  const now = Date.now()
  if (modeCache && now - modeCache.at < MODE_CACHE_MS) return modeCache.value
  const value = (async () => {
    const { data, error } = await supabase.from('families').select('task_notify_mode, event_notify_mode').limit(1).maybeSingle()
    if (error) throw error
    const row = data as { task_notify_mode: string | null; event_notify_mode: string | null } | null
    return { task: asMode(row?.task_notify_mode), event: asMode(row?.event_notify_mode) }
  })()
  modeCache = { at: now, value }
  value.catch(() => {
    if (modeCache?.value === value) modeCache = null
  })
  return value
}

export function getTaskNotifyModeCached(): Promise<TaskNotifyMode> {
  return getNotifyModesCached().then((m) => m.task)
}
