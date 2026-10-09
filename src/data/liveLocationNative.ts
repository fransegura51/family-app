// Envío de la posición EN VIVO desde la app nativa. Android frena las peticiones que salen de la web (WebView) pasados 5 minutos en segundo
// plano; justo el caso de la ubicación con el móvil bloqueado. Por eso aquí la petición la hace la capa NATIVA (CapacitorHttp), con la misma
// llamada que haría supabase-js: un upsert en member_locations por la API REST. El aviso de llegada/salida lo calcula la base de datos al
// guardarse (migración 0186), igual que con la web.
import { CapacitorHttp } from '@capacitor/core'

export interface LiveLocationArgs {
  supabaseUrl: string
  anonKey: string
  accessToken: string
  familyId: string
  memberId: string
  latitude: number
  longitude: number
  recordedAt: string
}

export function buildLiveLocationRequest(a: LiveLocationArgs) {
  return {
    url: `${a.supabaseUrl}/rest/v1/member_locations?on_conflict=member_id`,
    headers: {
      apikey: a.anonKey,
      Authorization: `Bearer ${a.accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    data: [
      {
        member_id: a.memberId,
        family_id: a.familyId,
        latitude: a.latitude,
        longitude: a.longitude,
        recorded_at: a.recordedAt,
      },
    ],
  }
}

export async function postLiveLocationNative(a: LiveLocationArgs): Promise<void> {
  const res = await CapacitorHttp.post(buildLiveLocationRequest(a))
  if (res.status < 200 || res.status >= 300) throw new Error(`No se pudo guardar la ubicación (${res.status})`)
}
