// Sincronización de verdad, cada hora, del calendario de la app HACIA
// Google Calendar — sentido contrario a los calendarios enlazados
// (Google -> app) y más fiable que la exportación por URL (app -> app
// de calendario del móvil, pero Google/Apple deciden cuándo la miran):
// aquí es la app quien empuja los cambios usando la API de Google, así
// que si cumple "cada hora" de verdad.
import { supabase } from '@/data/supabaseClient'

export interface GoogleCalendarStatus {
  connected: boolean
  lastSyncedAt: string | null
  lastSyncError: string | null
}

export async function getGoogleCalendarStatus(): Promise<GoogleCalendarStatus> {
  const { data, error } = await supabase.rpc('get_google_calendar_status')
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return {
    connected: !!row?.connected,
    lastSyncedAt: row?.last_synced_at ?? null,
    lastSyncError: row?.last_sync_error ?? null,
  }
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const { error } = await supabase.rpc('disconnect_google_calendar')
  if (error) throw error
}

// Redirige el navegador a Google para pedir permiso — la vuelta ocurre
// en google-calendar-oauth-callback, que trae de vuelta a esta misma
// pantalla con ?google=connected o ?google=error.
export async function startGoogleConnect(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No autenticado')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const res = await fetch(`${supabaseUrl}/functions/v1/google-calendar-oauth-start`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = await res.json()
  if (!res.ok || !json.url) throw new Error(json.error ?? 'No se pudo iniciar la conexión con Google')
  window.location.href = json.url
}
