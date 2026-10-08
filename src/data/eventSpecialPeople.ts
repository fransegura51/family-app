// Fase 2 (plan de pendientes) — roster de "🎭 Personas especiales" y "👪 Familiares" (migración 0216,
// event_role_people). Un único conjunto de funciones para las dos categorías — category las distingue.
import { supabase } from '@/data/supabaseClient'
import type { EventRolePerson, EventRolePersonCategory } from '@/domain/types'

const ROLE_PERSON_SELECT = 'id, event_id, family_id, category, name, roles, guest_member_id, sort_order, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRolePerson(r: any): EventRolePerson {
  return {
    id: r.id,
    eventId: r.event_id,
    familyId: r.family_id,
    category: r.category,
    name: r.name,
    roles: r.roles ?? [],
    guestMemberId: r.guest_member_id,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  }
}

export async function listEventRolePeople(eventId: string, category: EventRolePersonCategory): Promise<EventRolePerson[]> {
  const { data, error } = await supabase.from('event_role_people').select(ROLE_PERSON_SELECT).eq('event_id', eventId).eq('category', category).order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapRolePerson)
}

export async function addEventRolePerson(
  eventId: string,
  category: EventRolePersonCategory,
  input: { name: string | null; roles: string[]; guestMemberId?: string | null },
): Promise<string> {
  const { data: event, error: eventError } = await supabase.from('events').select('family_id').eq('id', eventId).single()
  if (eventError) throw eventError
  const { data, error } = await supabase
    .from('event_role_people')
    .insert({
      event_id: eventId,
      family_id: event.family_id,
      category,
      name: input.name?.trim() ? input.name.trim() : null,
      roles: input.roles,
      guest_member_id: input.guestMemberId ?? null,
      sort_order: Date.now(),
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function updateEventRolePerson(id: string, patch: { name?: string | null; roles?: string[]; guestMemberId?: string | null }): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) update.name = patch.name?.trim() ? patch.name.trim() : null
  if (patch.roles !== undefined) update.roles = patch.roles
  if (patch.guestMemberId !== undefined) update.guest_member_id = patch.guestMemberId
  const { error } = await supabase.from('event_role_people').update(update).eq('id', id)
  if (error) throw error
}

export async function deleteEventRolePerson(id: string): Promise<void> {
  const { error } = await supabase.from('event_role_people').delete().eq('id', id)
  if (error) throw error
}
