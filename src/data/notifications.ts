// Centro de avisos (campana de Inicio): historial de avisos de cada persona, contador de no leídos y ajustes de avisos por persona.
// Todo vive en la base (migraciones 0260-0262), así que la lectura, el borrado y los ajustes se sincronizan entre los dispositivos de la misma persona.
// Las tablas solo dejan ver/cambiar lo propio (RLS); un aviso solo permite cambiar su «leído» (no el texto) y nadie crea avisos desde la app.
import { supabase } from '@/data/supabaseClient'
import type { AppNotification, NotificationBucket } from '@/domain/notificationsCenter'
import type { NotificationPrefs, TaskNotifyMode } from '@/domain/notificationPrefs'
import { DEFAULT_NOTIFICATION_PREFS } from '@/domain/notificationPrefs'

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

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase.from('user_notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
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
  daily_summary_enabled: boolean
  daily_summary_time: string
  personal_community_mode: string
  personal_window_start: string
  personal_window_end: string
  community_suggestions_enabled: boolean
  community_suggestion_every_hours: number
}

const PREFS_COLUMNS = 'timezone, daily_summary_enabled, daily_summary_time, personal_community_mode, personal_window_start, personal_window_end, community_suggestions_enabled, community_suggestion_every_hours'

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
    dailySummaryEnabled: row.daily_summary_enabled,
    dailySummaryTime: hhmm(row.daily_summary_time),
    personalCommunityMode: row.personal_community_mode === 'window' ? 'window' : 'any',
    personalWindowStart: hhmm(row.personal_window_start),
    personalWindowEnd: hhmm(row.personal_window_end),
    communitySuggestionsEnabled: row.community_suggestions_enabled ?? DEFAULT_NOTIFICATION_PREFS.communitySuggestionsEnabled,
    communitySuggestionEveryHours: row.community_suggestion_every_hours ?? DEFAULT_NOTIFICATION_PREFS.communitySuggestionEveryHours,
  }
}

// Si la persona aún no tiene ajustes guardados, se crea la fila con lo que cambie y el resto por defecto.
export async function saveNotificationPrefs(patch: Partial<NotificationPrefs>): Promise<void> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const row: Record<string, unknown> = { profile_id: userResult.user.id }
  if (patch.timezone !== undefined) row.timezone = patch.timezone
  if (patch.dailySummaryEnabled !== undefined) row.daily_summary_enabled = patch.dailySummaryEnabled
  if (patch.dailySummaryTime !== undefined) row.daily_summary_time = patch.dailySummaryTime
  if (patch.personalCommunityMode !== undefined) row.personal_community_mode = patch.personalCommunityMode
  if (patch.personalWindowStart !== undefined) row.personal_window_start = patch.personalWindowStart
  if (patch.personalWindowEnd !== undefined) row.personal_window_end = patch.personalWindowEnd
  if (patch.communitySuggestionsEnabled !== undefined) row.community_suggestions_enabled = patch.communitySuggestionsEnabled
  if (patch.communitySuggestionEveryHours !== undefined) row.community_suggestion_every_hours = patch.communitySuggestionEveryHours
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

// Los formularios de tarea/evento necesitan saber el modo para enseñar o no la casilla «Aviso a toda la familia»: se pide una vez cada 5 minutos
// (la fila de la familia es la única que deja ver la RLS, no hace falta indicar el id).
let modeCache: { at: number; value: Promise<TaskNotifyMode> } | null = null
const MODE_CACHE_MS = 5 * 60 * 1000

export function getTaskNotifyModeCached(): Promise<TaskNotifyMode> {
  const now = Date.now()
  if (modeCache && now - modeCache.at < MODE_CACHE_MS) return modeCache.value
  const value = (async () => {
    const { data, error } = await supabase.from('families').select('task_notify_mode').limit(1).maybeSingle()
    if (error) throw error
    const mode = (data as { task_notify_mode: string | null } | null)?.task_notify_mode
    return mode === 'all' || mode === 'assigned' ? mode : null
  })()
  modeCache = { at: now, value }
  value.catch(() => {
    if (modeCache?.value === value) modeCache = null
  })
  return value
}
