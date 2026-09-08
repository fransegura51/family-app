import { supabase } from '@/data/supabaseClient'
import { compressImageFile } from '@/domain/imageCompression'
import type { DayAttachment } from '@/domain/types'

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

// Adjuntos sueltos por día (foto/archivo/ubicación) — no ligados a un
// evento concreto. Se listan todos de golpe, igual que el resto de
// datos del calendario, y se agrupan por día en la UI.
export async function listDayAttachments(): Promise<DayAttachment[]> {
  const { data, error } = await supabase
    .from('calendar_day_attachments')
    .select('id, family_id, day, kind, storage_path, original_name, label, latitude, longitude, created_at')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    day: r.day,
    kind: r.kind,
    storagePath: r.storage_path,
    originalName: r.original_name,
    label: r.label,
    latitude: r.latitude,
    longitude: r.longitude,
    createdAt: r.created_at,
  }))
}

export async function addDayPhoto(day: string, file: File): Promise<void> {
  const familyId = await currentFamilyId()
  const compressed = await compressImageFile(file)
  const ext = compressed.name.split('.').pop() || 'jpg'
  const path = `${familyId}/${crypto.randomUUID()}.${ext}`
  const { error: uploadError } = await supabase.storage.from('calendar-attachments').upload(path, compressed)
  if (uploadError) throw uploadError
  const { error } = await supabase.from('calendar_day_attachments').insert({
    family_id: familyId,
    day,
    kind: 'foto',
    storage_path: path,
  })
  if (error) throw error
}

// Archivo genérico (PDF, documento...) — sin comprimir, a diferencia
// de la foto.
export async function addDayFile(day: string, file: File): Promise<void> {
  const familyId = await currentFamilyId()
  const ext = file.name.split('.').pop() || 'dat'
  const path = `${familyId}/${crypto.randomUUID()}.${ext}`
  const { error: uploadError } = await supabase.storage.from('calendar-attachments').upload(path, file)
  if (uploadError) throw uploadError
  const { error } = await supabase.from('calendar_day_attachments').insert({
    family_id: familyId,
    day,
    kind: 'archivo',
    storage_path: path,
    original_name: file.name,
  })
  if (error) throw error
}

// Admite texto libre, coordenadas reales, o las dos cosas a la vez.
export async function addDayLocation(
  day: string,
  input: { label: string | null; latitude: number | null; longitude: number | null },
): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('calendar_day_attachments').insert({
    family_id: familyId,
    day,
    kind: 'ubicacion',
    label: input.label,
    latitude: input.latitude,
    longitude: input.longitude,
  })
  if (error) throw error
}

export async function getDayAttachmentUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('calendar-attachments').createSignedUrl(storagePath, 3600)
  if (error) throw error
  return data.signedUrl
}

export async function deleteDayAttachment(attachment: DayAttachment): Promise<void> {
  if (attachment.storagePath) await supabase.storage.from('calendar-attachments').remove([attachment.storagePath])
  const { error } = await supabase.from('calendar_day_attachments').delete().eq('id', attachment.id)
  if (error) throw error
}
