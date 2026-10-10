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

// Llamada REST genérica por la capa nativa, para lo que ocurre en segundo plano además de la posición: guardar y cerrar las paradas («has estado
// en...») y leer los lugares de la familia. Misma API que usaría supabase-js (PostgREST) y mismo token de la sesión.
export interface NativeRestArgs {
  supabaseUrl: string
  anonKey: string
  accessToken: string
  method: 'GET' | 'POST' | 'PATCH'
  path: string
  body?: unknown
  prefer?: string
}

export function buildRestRequest(a: NativeRestArgs) {
  return {
    url: `${a.supabaseUrl}/rest/v1/${a.path}`,
    method: a.method,
    headers: {
      apikey: a.anonKey,
      Authorization: `Bearer ${a.accessToken}`,
      'Content-Type': 'application/json',
      ...(a.prefer ? { Prefer: a.prefer } : {}),
    },
    ...(a.body === undefined ? {} : { data: a.body }),
  }
}

export async function restNative<T>(a: NativeRestArgs): Promise<T> {
  const res = await CapacitorHttp.request(buildRestRequest(a))
  if (res.status < 200 || res.status >= 300) throw new Error(`No se pudo completar la petición (${res.status})`)
  return res.data as T
}

// Punto del rastro de las últimas 24h (member_location_history). Mismo motivo que arriba: guardado desde la web se queda congelado en segundo
// plano, y la ruta del día salía vacía aunque la posición en vivo sí se actualizara (prueba real del 2026-10-10).
export function buildHistoryPointRequest(a: LiveLocationArgs) {
  return {
    url: `${a.supabaseUrl}/rest/v1/member_location_history`,
    headers: {
      apikey: a.anonKey,
      Authorization: `Bearer ${a.accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
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

export async function postHistoryPointNative(a: LiveLocationArgs): Promise<void> {
  const res = await CapacitorHttp.post(buildHistoryPointRequest(a))
  if (res.status < 200 || res.status >= 300) throw new Error(`No se pudo guardar el rastro (${res.status})`)
}
