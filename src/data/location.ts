import { supabase } from '@/data/supabaseClient'
import type {
  AutomationRule,
  AutomationTriggerType,
  LocationConsent,
  LocationPlace,
  LocationPlaceVisit,
  MemberLocation,
  MemberLocationPoint,
} from '@/domain/types'

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

export async function listPlaces(): Promise<LocationPlace[]> {
  const { data, error } = await supabase
    .from('location_places')
    .select('id, family_id, name, latitude, longitude, radius_m')
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    radiusM: r.radius_m,
  }))
}

export async function addPlace(input: {
  name: string
  latitude: number
  longitude: number
  radiusM: number
}): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('location_places').insert({
    family_id: familyId,
    name: input.name,
    latitude: input.latitude,
    longitude: input.longitude,
    radius_m: input.radiusM,
  })
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

// Sustituye (upsert) la última posición conocida, y ADEMÁS añade un
// punto al rastro de las últimas 24h (member_location_history, con
// purga automática — nunca queda más histórico que eso) para poder
// dibujar la ruta del día en el mapa.
export async function updateMemberLocation(memberId: string, latitude: number, longitude: number): Promise<void> {
  const familyId = await currentFamilyId()
  const recordedAt = new Date().toISOString()
  const { error } = await supabase.from('member_locations').upsert({
    member_id: memberId,
    family_id: familyId,
    latitude,
    longitude,
    recorded_at: recordedAt,
  })
  if (error) throw error

  const { error: historyError } = await supabase
    .from('member_location_history')
    .insert({ member_id: memberId, family_id: familyId, latitude, longitude, recorded_at: recordedAt })
  if (historyError) throw historyError
}

// Rastro de las últimas 24h de un miembro, más antiguo primero (para
// dibujar la ruta en orden).
export async function listMemberLocationHistory(memberId: string): Promise<MemberLocationPoint[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('member_location_history')
    .select('id, member_id, family_id, latitude, longitude, recorded_at')
    .eq('member_id', memberId)
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: true })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    memberId: r.member_id,
    familyId: r.family_id,
    latitude: r.latitude,
    longitude: r.longitude,
    recordedAt: r.recorded_at,
  }))
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
