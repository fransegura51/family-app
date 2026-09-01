// Calendarios externos (Google/Outlook/Apple/Android, vía su URL .ics).
// Sincronizar pasa por la función de servidor "sync-external-calendar"
// solo para saltar CORS al descargar el .ics — el parseo y el guardado
// en base de datos ocurren aquí, bajo la sesión del propio usuario.
import { supabase } from '@/data/supabaseClient'
import { parseIcs } from '@/domain/icsParser'

export interface ExternalCalendarFeed {
  id: string
  memberId: string | null
  name: string
  icsUrl: string
  isHolidayCalendar: boolean
  lastSyncedAt: string | null
  lastSyncError: string | null
}

export interface ExternalCalendarEvent {
  id: string
  feedId: string
  title: string
  startAt: string
  endAt: string | null
  allDay: boolean
}

interface FeedRow {
  id: string
  member_id: string | null
  name: string
  ics_url: string
  is_holiday_calendar: boolean
  last_synced_at: string | null
  last_sync_error: string | null
}

function toFeed(row: FeedRow): ExternalCalendarFeed {
  return {
    id: row.id,
    memberId: row.member_id,
    name: row.name,
    icsUrl: row.ics_url,
    isHolidayCalendar: row.is_holiday_calendar,
    lastSyncedAt: row.last_synced_at,
    lastSyncError: row.last_sync_error,
  }
}

export async function listFeeds(): Promise<ExternalCalendarFeed[]> {
  const { data, error } = await supabase
    .from('external_calendar_feeds')
    .select('id, member_id, name, ics_url, is_holiday_calendar, last_synced_at, last_sync_error')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as FeedRow[]).map(toFeed)
}

export async function addFeed(input: {
  name: string
  icsUrl: string
  memberId: string | null
  isHolidayCalendar: boolean
}): Promise<string> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')

  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('family_id')
    .eq('id', userResult.user.id)
    .single()
  if (profileError) throw profileError

  const { data, error } = await supabase
    .from('external_calendar_feeds')
    .insert({
      family_id: profileRow.family_id,
      member_id: input.memberId,
      name: input.name,
      ics_url: input.icsUrl,
      is_holiday_calendar: input.isHolidayCalendar,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

// Fechas (YYYY-MM-DD) marcadas como festivo en cualquier calendario
// enlazado que la familia haya señalado como "de festivos" — se usa
// para saltarlas en las repeticiones que pidan excluirlas.
export async function listHolidayDates(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('external_calendar_events')
    .select('start_at, external_calendar_feeds!inner(is_holiday_calendar)')
    .eq('external_calendar_feeds.is_holiday_calendar', true)
  if (error) throw error

  const dates = new Set<string>()
  for (const row of data as unknown as { start_at: string }[]) {
    const d = new Date(row.start_at)
    dates.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
  return dates
}

export async function deleteFeed(id: string): Promise<void> {
  const { error } = await supabase.from('external_calendar_feeds').delete().eq('id', id)
  if (error) throw error
}

export async function listExternalEvents(): Promise<ExternalCalendarEvent[]> {
  const { data, error } = await supabase
    .from('external_calendar_events')
    .select('id, feed_id, title, start_at, end_at, all_day')
    .order('start_at', { ascending: true })
  if (error) throw error
  return (data as { id: string; feed_id: string; title: string; start_at: string; end_at: string | null; all_day: boolean }[]).map(
    (row) => ({
      id: row.id,
      feedId: row.feed_id,
      title: row.title,
      startAt: row.start_at,
      endAt: row.end_at,
      allDay: row.all_day,
    }),
  )
}

// Descarga (vía la función de servidor, para saltar CORS), parsea y
// reemplaza los eventos guardados de un feed. Reemplazar en vez de
// diffear es más simple y suficiente: el .ics no trae "borrados"
// explícitos, así que sincronizar de nuevo es la única forma fiable de
// reflejar cambios y borrados hechos en el calendario original.
export async function syncFeed(feedId: string): Promise<{ count: number }> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No autenticado')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/sync-external-calendar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ feedId }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error === 'fetch_failed' ? 'No se pudo descargar el calendario' : 'Error al sincronizar')
    }

    const { icsText } = await res.json()
    const parsed = parseIcs(icsText as string)

    const { error: deleteError } = await supabase.from('external_calendar_events').delete().eq('feed_id', feedId)
    if (deleteError) throw deleteError

    if (parsed.length > 0) {
      const { error: insertError } = await supabase.from('external_calendar_events').insert(
        parsed.map((e) => ({
          feed_id: feedId,
          uid: e.uid,
          title: e.title,
          start_at: e.startAt,
          end_at: e.endAt,
          all_day: e.allDay,
        })),
      )
      if (insertError) throw insertError
    }

    await supabase
      .from('external_calendar_feeds')
      .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
      .eq('id', feedId)

    return { count: parsed.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al sincronizar'
    await supabase.from('external_calendar_feeds').update({ last_sync_error: message }).eq('id', feedId)
    throw err
  }
}
