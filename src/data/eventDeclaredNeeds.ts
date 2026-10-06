// RSVP → necesidades alimentarias (migración 0205). La familia revisa lo que declaró un invitado:
// aceptar (lo integra en event_guest_dietary_needs SIN duplicar), corregir la clasificación o rechazar (se conserva
// el texto y el registro, nunca se borra). El RSVP solo escribe pendientes; esta capa es la única que confirma.
import { supabase } from '@/data/supabaseClient'
import type { EventDeclaredNeed, EventDietaryCategory, EventDietaryKind } from '@/domain/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDeclared(r: any): EventDeclaredNeed {
  return {
    id: r.id,
    eventId: r.event_id,
    familyId: r.family_id,
    guestId: r.guest_id,
    memberId: r.member_id ?? null,
    declaredText: r.declared_text,
    category: r.category as EventDietaryCategory,
    kind: (r.kind ?? null) as EventDietaryKind | null,
    status: r.status,
    acceptedNeedId: r.accepted_need_id ?? null,
    createdAt: r.created_at,
  }
}

const DECLARED_SELECT = 'id, event_id, family_id, guest_id, member_id, declared_text, category, kind, status, accepted_need_id, created_at'

export async function listEventDeclaredNeeds(eventId: string): Promise<EventDeclaredNeed[]> {
  const { data, error } = await supabase
    .from('event_guest_declared_needs')
    .select(DECLARED_SELECT)
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapDeclared)
}

// Acepta una declaración: busca primero una necesidad confirmada equivalente (mismo invitado, persona y categoría)
// y la enlaza si existe; si no, crea UNA necesidad con el texto original y origen RSVP. Reintentar es seguro:
// la segunda vez encuentra la necesidad creada y no duplica nada.
export async function acceptEventDeclaredNeed(
  declared: EventDeclaredNeed,
  decision: { category: EventDietaryCategory; kind: EventDietaryKind | null; memberId: string | null },
): Promise<string> {
  let query = supabase
    .from('event_guest_dietary_needs')
    .select('id')
    .eq('event_id', declared.eventId)
    .eq('guest_id', declared.guestId)
    .eq('category', decision.category)
  query = decision.memberId ? query.eq('member_id', decision.memberId) : query.is('member_id', null)
  const { data: existing, error: existingError } = await query.limit(1)
  if (existingError) throw existingError

  let needId: string | null = existing && existing.length > 0 ? (existing[0].id as string) : null
  if (!needId) {
    const { data: inserted, error: insertError } = await supabase
      .from('event_guest_dietary_needs')
      .insert({
        event_id: declared.eventId,
        family_id: declared.familyId,
        guest_id: declared.guestId,
        member_id: decision.memberId,
        original_text: declared.declaredText,
        category: decision.category,
        kind: decision.kind,
        source: 'rsvp',
      })
      .select('id')
      .single()
    if (insertError) throw insertError
    needId = inserted.id as string
  }

  const { data: userResult } = await supabase.auth.getUser()
  const { error: updateError } = await supabase
    .from('event_guest_declared_needs')
    .update({ status: 'aceptada', decided_at: new Date().toISOString(), decided_by: userResult.user?.id ?? null, accepted_need_id: needId })
    .eq('id', declared.id)
  if (updateError) throw updateError
  return needId
}

// Rechaza: la fila y el texto original se conservan (trazabilidad); deja de aparecer como pendiente.
export async function rejectEventDeclaredNeed(declaredId: string): Promise<void> {
  const { data: userResult } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('event_guest_declared_needs')
    .update({ status: 'rechazada', decided_at: new Date().toISOString(), decided_by: userResult.user?.id ?? null })
    .eq('id', declaredId)
  if (error) throw error
}
