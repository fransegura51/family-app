// URL pública (protegida por un token largo, no por sesión) donde
// Google Calendar/Apple Calendar pueden SUSCRIBIRSE para traer el
// calendario de la app al móvil — sentido contrario a los calendarios
// enlazados en Externos, que traen un calendario externo HACIA la app.
import { supabase } from '@/data/supabaseClient'

export async function getCalendarExportUrl(): Promise<string> {
  const { data, error } = await supabase.rpc('get_or_create_calendar_export_token')
  if (error) throw error
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  return `${supabaseUrl}/functions/v1/export-calendar-ics?token=${data as string}`
}
