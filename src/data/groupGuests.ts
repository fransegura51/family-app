import { supabase } from '@/data/supabaseClient'
import type { GuestOrigin } from '@/domain/groups'

// Invitados de un evento que vienen de un grupo (migración 0349: event_guests.group_id / group_participant_id). Mantener el origen permite «Actualizar invitados»,
// que es siempre una acción manual: nada se añade ni se cambia solo.

export async function listGuestOrigins(eventId: string): Promise<(GuestOrigin & { groupId: string | null })[]> {
  const { data, error } = await supabase.from('event_guests').select('id, display_name, group_id, group_participant_id').eq('event_id', eventId).not('group_participant_id', 'is', null)
  if (error) throw error
  return (data ?? []).map((r) => ({ guestId: r.id as string, displayName: r.display_name as string, participantId: r.group_participant_id as string, groupId: (r.group_id as string | null) ?? null }))
}

async function familyId(): Promise<string> {
  const { data: u } = await supabase.auth.getUser()
  if (!u.user) throw new Error('No autenticado')
  const { data, error } = await supabase.from('profiles').select('family_id').eq('id', u.user.id).single()
  if (error) throw error
  return data.family_id as string
}

/** Cada participante pasa a ser un invitado (un menor, sin adultos): después se ajusta en Eventos. No se copia ningún teléfono ni correo. */
export async function importGroupGuests(eventId: string, people: { participantId: string; groupId: string; name: string }[]): Promise<void> {
  if (people.length === 0) return
  const fid = await familyId()
  const base = Date.now()
  const rows = people.map((p, i) => ({
    event_id: eventId,
    family_id: fid,
    display_name: p.name.trim(),
    adults_count: 0,
    children_count: 1,
    sort_order: base + i,
    group_id: p.groupId,
    group_participant_id: p.participantId,
  }))
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from('event_guests').insert(rows.slice(i, i + 200))
    if (error) throw error
  }
}

export async function applyGuestUpdates(eventId: string, changes: { add: { participantId: string; groupId: string; name: string }[]; rename: { guestId: string; name: string }[]; remove: string[] }): Promise<void> {
  await importGroupGuests(eventId, changes.add)
  for (const r of changes.rename) {
    const { error } = await supabase.from('event_guests').update({ display_name: r.name.trim() }).eq('id', r.guestId)
    if (error) throw error
  }
  if (changes.remove.length > 0) {
    const { error } = await supabase.from('event_guests').delete().in('id', changes.remove)
    if (error) throw error
  }
}
