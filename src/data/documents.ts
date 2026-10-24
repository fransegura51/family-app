import { supabase } from '@/data/supabaseClient'
import { compressImageFile } from '@/domain/imageCompression'
import { createEvent, deleteEvent, updateEvent } from '@/data/calendar'
import type { MemberDocument } from '@/domain/types'

// Recordatorios de renovación por defecto (30/7/1 días antes) —
// petición real: "que mande varios recuerdos de renovación".
const EXPIRY_REMINDERS = [43200, 10080, 1440].map((minutesBefore) => ({ minutesBefore, anchor: 'start' as const }))

async function syncExpiryEvent(input: {
  existingEventId: string | null
  title: string
  memberId: string | null
  expiryDate: string | null
  // Un documento restringido no debe filtrar su título a la familia por el evento de vencimiento: ese evento es solo de quien lo sube.
  restricted: boolean
}): Promise<string | null> {
  if (!input.expiryDate) {
    if (input.existingEventId) await deleteEvent(input.existingEventId)
    return null
  }
  const startAt = new Date(`${input.expiryDate}T00:00`).toISOString()
  const eventInput = {
    title: `Vence: ${input.title}`,
    startAt,
    endAt: null,
    allDay: true,
    recurrenceRule: null,
    reminders: EXPIRY_REMINDERS,
    memberIds: input.memberId ? [input.memberId] : [],
    visibility: input.restricted ? ('private' as const) : ('shared' as const),
  }
  if (input.existingEventId) {
    await updateEvent(input.existingEventId, eventInput)
    return input.existingEventId
  }
  return createEvent(eventInput)
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

export async function listMemberDocuments(): Promise<MemberDocument[]> {
  const { data: userResult } = await supabase.auth.getUser()
  const myId = userResult.user?.id ?? null
  const { data, error } = await supabase
    .from('member_documents')
    .select('id, family_id, member_id, storage_path, title, category, expiry_date, calendar_event_id, uploaded_by, visible_to_member_ids')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map((r) => ({
    uploadedBy: r.uploaded_by,
    visibleToMemberIds: r.visible_to_member_ids,
    isMine: r.uploaded_by === null || r.uploaded_by === myId,
    id: r.id,
    familyId: r.family_id,
    memberId: r.member_id,
    storagePath: r.storage_path,
    title: r.title,
    category: r.category,
    expiryDate: r.expiry_date,
    calendarEventId: r.calendar_event_id,
  }))
}

export async function uploadMemberDocument(input: {
  memberId: string | null
  file: File
  title: string
  category: string
  expiryDate?: string | null
  // null o sin indicar = toda la familia; lista = solo esas fichas (y quien lo sube); [] = solo quien lo sube.
  visibleToMemberIds?: string[] | null
}): Promise<void> {
  const familyId = await currentFamilyId()
  const file = await compressImageFile(input.file)
  const ext = file.name.split('.').pop() || 'pdf'
  const path = `${familyId}/${input.memberId ?? 'general'}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage.from('documents').upload(path, file)
  if (uploadError) throw uploadError

  const calendarEventId = await syncExpiryEvent({
    existingEventId: null,
    title: input.title,
    memberId: input.memberId,
    expiryDate: input.expiryDate ?? null,
    restricted: !!input.visibleToMemberIds,
  })

  const { error } = await supabase.from('member_documents').insert({
    visible_to_member_ids: input.visibleToMemberIds ?? null,
    family_id: familyId,
    member_id: input.memberId,
    storage_path: path,
    title: input.title,
    category: input.category || null,
    expiry_date: input.expiryDate || null,
    calendar_event_id: calendarEventId,
  })
  if (error) throw error
}

// Cambia el título y/o la fecha de vencimiento de un documento ya
// subido — crea, actualiza o borra el evento del calendario según
// haga falta (con el título nuevo si ha cambiado), sin tocar el
// archivo. Petición real: "un lápiz para poder editar el nombre del
// documento y la fecha de vencimiento".
export async function updateMemberDocument(
  doc: MemberDocument,
  input: { title: string; expiryDate: string | null; visibleToMemberIds?: string[] | null },
): Promise<void> {
  // Sin indicar, la visibilidad queda como estaba.
  const visible = input.visibleToMemberIds === undefined ? doc.visibleToMemberIds : input.visibleToMemberIds
  const calendarEventId = await syncExpiryEvent({
    existingEventId: doc.calendarEventId,
    title: input.title,
    memberId: doc.memberId,
    expiryDate: input.expiryDate,
    restricted: !!visible,
  })
  const { error } = await supabase
    .from('member_documents')
    .update({ title: input.title, expiry_date: input.expiryDate, calendar_event_id: calendarEventId, visible_to_member_ids: visible })
    .eq('id', doc.id)
  if (error) throw error
}

export async function getMemberDocumentUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(storagePath, 3600)
  if (error) throw error
  return data.signedUrl
}

export async function deleteMemberDocument(doc: MemberDocument): Promise<void> {
  await supabase.storage.from('documents').remove([doc.storagePath])
  if (doc.calendarEventId) await deleteEvent(doc.calendarEventId)
  const { error } = await supabase.from('member_documents').delete().eq('id', doc.id)
  if (error) throw error
}
