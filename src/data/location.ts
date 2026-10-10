import { postHistoryPointNative, postLiveLocationNative, restNative } from '@/data/liveLocationNative'
import { supabase } from '@/data/supabaseClient'
import { isNativeApp } from '@/services/nativeApp'
import type {
  AutomationRule,
  AutomationTriggerType,
  LocationConsent,
  LocationPlace,
  LocationPlaceVisit,
  MemberLocation,
  MemberLocationPoint,
} from '@/domain/types'

// Contexto para escribir la posición desde la app nativa: token de la sesión (local, sin red salvo que caduque) y familia recordada por usuario.
let nativeFamilyCache: { userId: string; familyId: string } | null = null
async function nativeWriteContext(): Promise<{ accessToken: string; familyId: string }> {
  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (!session) throw new Error('No autenticado')
  if (!nativeFamilyCache || nativeFamilyCache.userId !== session.user.id) {
    nativeFamilyCache = { userId: session.user.id, familyId: await currentFamilyId() }
  }
  return { accessToken: session.access_token, familyId: nativeFamilyCache.familyId }
}

// Petición REST por la capa nativa con el token de la sesión (ver data/liveLocationNative.ts: restNative).
async function nativeRest<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown, prefer?: string): Promise<T> {
  const ctx = await nativeWriteContext()
  return restNative<T>({
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    accessToken: ctx.accessToken,
    method,
    path,
    body,
    prefer,
  })
}

async function currentFamilyId(): Promise<string> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: profileRow, error } = await supabase
    .from('profiles')
    .select('family_id')
    .eq('id', userResult.user.id)
    .single()
  if (error) throw error
  return profileRow.family_id
}

// ---------------------------------------------------------------------
// Lugares frecuentes (Skill 23)
// ---------------------------------------------------------------------

interface PlaceRow {
  id: string
  family_id: string
  name: string
  category: string | null
  latitude: number
  longitude: number
  radius_m: number
  notify_arrivals: boolean
}

export async function listPlaces(): Promise<LocationPlace[]> {
  let data: PlaceRow[]
  if (isNativeApp()) {
    // Lo llama el reconocimiento de paradas, que corre con el móvil bloqueado: por la capa nativa (la web se congela en segundo plano).
    data = await nativeRest<PlaceRow[]>('GET', 'location_places?select=id,family_id,name,category,latitude,longitude,radius_m,notify_arrivals')
  } else {
    const res = await supabase.from('location_places').select('id, family_id, name, category, latitude, longitude, radius_m, notify_arrivals')
    if (res.error) throw res.error
    data = res.data as PlaceRow[]
  }
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    name: r.name,
    category: r.category,
    latitude: r.latitude,
    longitude: r.longitude,
    radiusM: r.radius_m,
    notifyArrivals: r.notify_arrivals,
  }))
}

// Avisos de llegada/salida por lugar, estilo Google Maps (petición real: "lo quiero así") — por
// dentro gestiona dos automation_rules ocultas (las evalúa la base de datos en el instante en que se
// guarda una posición, ver migración 0186_server_side_automations.sql — solo se da un interruptor más
// sencillo que crear una regla a mano). Los mensajes usan {miembro}/{lugar}: el servidor los
// sustituye al disparar, así que cambiar el nombre del lugar más tarde no deja el aviso
// desactualizado. El nombre de la regla lleva un prefijo reconocible (PLACE_NOTIFY_RULE_PREFIX) para
// poder encontrarlas y borrarlas al apagar el interruptor sin tocar las reglas que la familia haya
// creado a mano para el mismo lugar — y para que RulesTab (la pestaña "Reglas") las oculte de la
// lista en vez de enseñar el texto sin sustituir.
export const PLACE_NOTIFY_RULE_PREFIX = '🔔 Aviso automático:'

async function createPlaceNotifyRules(placeId: string): Promise<void> {
  const name = `${PLACE_NOTIFY_RULE_PREFIX} {lugar}`
  await createAutomationRule({ name, triggerType: 'llegada', memberId: null, placeId, timeOfDay: null, message: '📍 {miembro} ha llegado a {lugar}.' })
  await createAutomationRule({ name, triggerType: 'salida', memberId: null, placeId, timeOfDay: null, message: '🚪 {miembro} se ha ido de {lugar}.' })
}

async function deletePlaceNotifyRules(placeId: string): Promise<void> {
  const rules = await listAutomationRules()
  const toDelete = rules.filter((r) => r.placeId === placeId && r.name.startsWith(PLACE_NOTIFY_RULE_PREFIX))
  for (const r of toDelete) await deleteAutomationRule(r.id)
}

export async function setPlaceNotifyArrivals(placeId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.from('location_places').update({ notify_arrivals: enabled }).eq('id', placeId)
  if (error) throw error
  if (enabled) await createPlaceNotifyRules(placeId)
  else await deletePlaceNotifyRules(placeId)
}

export async function addPlace(input: {
  name: string
  category: string | null
  latitude: number
  longitude: number
  radiusM: number
  notifyArrivals?: boolean
}): Promise<string> {
  const familyId = await currentFamilyId()
  const { data, error } = await supabase
    .from('location_places')
    .insert({
      family_id: familyId,
      name: input.name,
      category: input.category,
      latitude: input.latitude,
      longitude: input.longitude,
      radius_m: input.radiusM,
      notify_arrivals: input.notifyArrivals ?? false,
    })
    .select('id')
    .single()
  if (error) throw error
  if (input.notifyArrivals) await createPlaceNotifyRules(data.id)
  return data.id
}

// Petición real: "quiero poder editarlo... poder ponerle la categoría que yo quiera" — cambia el
// nombre/categoría/radio de un lugar ya guardado, sin tocar dónde está (para eso, borrar y volver a
// crearlo con el buscador). El aviso de llegada/salida es aparte (setPlaceNotifyArrivals): tiene que
// gestionar las reglas ocultas, así que no se puede colar aquí como un campo más.
export async function updatePlace(id: string, input: { name: string; category: string | null; radiusM: number }): Promise<void> {
  const { error } = await supabase
    .from('location_places')
    .update({ name: input.name, category: input.category, radius_m: input.radiusM })
    .eq('id', id)
  if (error) throw error
}

export async function deletePlace(id: string): Promise<void> {
  const { error } = await supabase.from('location_places').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------
// Consentimiento y ubicación (Skill 23/28)
// ---------------------------------------------------------------------

export async function listConsents(): Promise<LocationConsent[]> {
  const { data, error } = await supabase.from('location_sharing_consent').select('member_id, family_id, enabled')
  if (error) throw error
  return data.map((r) => ({ memberId: r.member_id, familyId: r.family_id, enabled: r.enabled }))
}

// El admin puede activar/desactivar a cualquiera; cada persona también
// puede activar/desactivar la suya propia (RLS lo permite para ambos
// casos — ver migración 0029). Al desactivar, borra también la última
// ubicación conocida y el rastro de las últimas 24h — mínima retención
// (Skill 23): apagar el compartir borra el dato, no solo deja de
// actualizarlo.
export async function setConsent(memberId: string, enabled: boolean): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase
    .from('location_sharing_consent')
    .upsert({ member_id: memberId, family_id: familyId, enabled, updated_at: new Date().toISOString() })
  if (error) throw error

  if (!enabled) {
    await supabase.from('member_locations').delete().eq('member_id', memberId)
    await supabase.from('member_location_history').delete().eq('member_id', memberId)
  }
}

export async function listMemberLocations(): Promise<MemberLocation[]> {
  const { data, error } = await supabase
    .from('member_locations')
    .select('member_id, family_id, latitude, longitude, recorded_at')
  if (error) throw error
  return data.map((r) => ({
    memberId: r.member_id,
    familyId: r.family_id,
    latitude: r.latitude,
    longitude: r.longitude,
    recordedAt: r.recorded_at,
  }))
}

// Sustituye (upsert) la última posición conocida — esto sí en CADA
// posición GPS que llega, para que el punto en el mapa esté siempre al
// día. El rastro de las últimas 24h es aparte (appendLocationHistoryPoint
// más abajo): guardar ahí también en cada posición desbordaba el límite
// de puntos en pocas horas quieta en un solo sitio (ver
// services/locationSharing.ts).
export async function updateMemberLocation(memberId: string, latitude: number, longitude: number): Promise<void> {
  if (isNativeApp()) {
    // App nativa: la petición la hace la capa nativa (Android frena las de la web en segundo plano) y la familia se recuerda en memoria
    // para no preguntarla en cada posición.
    const ctx = await nativeWriteContext()
    await postLiveLocationNative({
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
      anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      accessToken: ctx.accessToken,
      familyId: ctx.familyId,
      memberId,
      latitude,
      longitude,
      recordedAt: new Date().toISOString(),
    })
    return
  }
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('member_locations').upsert({
    member_id: memberId,
    family_id: familyId,
    latitude,
    longitude,
    recorded_at: new Date().toISOString(),
  })
  if (error) throw error
}

// Añade un punto al rastro de las últimas 24h (member_location_history,
// con purga automática — nunca queda más histórico que eso) para poder
// dibujar la ruta del día en el mapa. A diferencia de updateMemberLocation
// (arriba), NO se llama en cada posición GPS — ver services/locationSharing.ts,
// shouldRecordHistoryPoint: solo cuando de verdad aporta algo nuevo al
// trazo (se ha movido, o ha pasado un rato quieta en el mismo sitio).
export async function appendLocationHistoryPoint(memberId: string, latitude: number, longitude: number): Promise<void> {
  if (isNativeApp()) {
    // Igual que la posición en vivo: la petición la hace la capa nativa para que funcione con el móvil bloqueado.
    const ctx = await nativeWriteContext()
    await postHistoryPointNative({
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
      anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      accessToken: ctx.accessToken,
      familyId: ctx.familyId,
      memberId,
      latitude,
      longitude,
      recordedAt: new Date().toISOString(),
    })
    return
  }
  const familyId = await currentFamilyId()
  const { error } = await supabase
    .from('member_location_history')
    .insert({ member_id: memberId, family_id: familyId, latitude, longitude, recorded_at: new Date().toISOString() })
  if (error) throw error
}

// Rastro de las últimas 24h de un miembro, más antiguo primero (para
// dibujar la ruta en orden).
//
// Límite duro de seguridad (2000 puntos, ya de sobra para dibujar una
// ruta de 24h — un punto cada ~43s): bug real grave reportado, un
// refresco cada 30s en LocationScreen pedía este histórico completo sin
// límite y disparó el consumo de Supabase a varios GB (forzó pasar a
// plan de pago). Ese refresco ya no llama a esto tan seguido, pero este
// límite se queda de todas formas — para que ningún futuro descuido
// similar pueda volver a pedir un histórico sin tope.
const MAX_HISTORY_POINTS = 2000

export async function listMemberLocationHistory(memberId: string): Promise<MemberLocationPoint[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('member_location_history')
    .select('id, member_id, family_id, latitude, longitude, recorded_at')
    .eq('member_id', memberId)
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: false })
    .limit(MAX_HISTORY_POINTS)
  if (error) throw error
  return data
    .map((r) => ({
      id: r.id,
      memberId: r.member_id,
      familyId: r.family_id,
      latitude: r.latitude,
      longitude: r.longitude,
      recordedAt: r.recorded_at,
    }))
    .reverse()
}

// ---------------------------------------------------------------------
// Historial de sitios visitados (Skill 23/28) — ver migración
// 0058_place_visits: a diferencia del rastro GPS en crudo (24h), esto
// se conserva 90 días porque es mucho menos sensible (una fila por
// parada real, no coordenadas cada pocos segundos).
// ---------------------------------------------------------------------

export async function recordPlaceVisit(input: {
  memberId: string
  placeName: string
  latitude: number
  longitude: number
  arrivedAt: string
}): Promise<string> {
  if (isNativeApp()) {
    // Se llama cuando termina una parada, con el móvil normalmente bloqueado: por la capa nativa.
    const ctx = await nativeWriteContext()
    const rows = await nativeRest<{ id: string }[]>(
      'POST',
      'member_place_visits?select=id',
      {
        family_id: ctx.familyId,
        member_id: input.memberId,
        place_name: input.placeName,
        latitude: input.latitude,
        longitude: input.longitude,
        arrived_at: input.arrivedAt,
      },
      'return=representation',
    )
    if (!rows[0]?.id) throw new Error('No se pudo guardar la visita')
    return rows[0].id
  }
  const familyId = await currentFamilyId()
  const { data, error } = await supabase
    .from('member_place_visits')
    .insert({
      family_id: familyId,
      member_id: input.memberId,
      place_name: input.placeName,
      latitude: input.latitude,
      longitude: input.longitude,
      arrived_at: input.arrivedAt,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function closePlaceVisit(id: string, leftAt: string): Promise<void> {
  if (isNativeApp()) {
    await nativeRest('PATCH', `member_place_visits?id=eq.${encodeURIComponent(id)}`, { left_at: leftAt }, 'return=minimal')
    return
  }
  const { error } = await supabase.from('member_place_visits').update({ left_at: leftAt }).eq('id', id)
  if (error) throw error
}

// Historial de todos los miembros de la familia entre dos fechas (para
// filtrar por día/semana/mes) — más reciente primero.
export async function listPlaceVisits(from: string, to: string): Promise<LocationPlaceVisit[]> {
  const { data, error } = await supabase
    .from('member_place_visits')
    .select('id, family_id, member_id, place_name, latitude, longitude, arrived_at, left_at')
    .gte('arrived_at', from)
    .lte('arrived_at', to)
    .order('arrived_at', { ascending: false })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    memberId: r.member_id,
    placeName: r.place_name,
    latitude: r.latitude,
    longitude: r.longitude,
    arrivedAt: r.arrived_at,
    leftAt: r.left_at,
  }))
}

// ---------------------------------------------------------------------
// Automatizaciones (Skill 24)
// ---------------------------------------------------------------------

export async function listAutomationRules(): Promise<AutomationRule[]> {
  const { data, error } = await supabase
    .from('automation_rules')
    .select('id, family_id, name, trigger_type, member_id, place_id, time_of_day, message, active, muted_until')
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    name: r.name,
    triggerType: r.trigger_type as AutomationTriggerType,
    memberId: r.member_id,
    placeId: r.place_id,
    timeOfDay: r.time_of_day,
    message: r.message,
    active: r.active,
    mutedUntil: r.muted_until,
  }))
}

export async function createAutomationRule(input: {
  name: string
  triggerType: AutomationTriggerType
  memberId: string | null
  placeId: string | null
  timeOfDay: string | null
  message: string
}): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('automation_rules').insert({
    family_id: familyId,
    name: input.name,
    trigger_type: input.triggerType,
    member_id: input.memberId,
    place_id: input.placeId,
    time_of_day: input.timeOfDay,
    message: input.message,
  })
  if (error) throw error
}

export async function toggleAutomationRule(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('automation_rules').update({ active }).eq('id', id)
  if (error) throw error
}

export async function muteAutomationRule(id: string, mutedUntil: string | null): Promise<void> {
  const { error } = await supabase.from('automation_rules').update({ muted_until: mutedUntil }).eq('id', id)
  if (error) throw error
}

export async function deleteAutomationRule(id: string): Promise<void> {
  const { error } = await supabase.from('automation_rules').delete().eq('id', id)
  if (error) throw error
}
