import { supabase } from '@/data/supabaseClient'
import { compressImageFile } from '@/domain/imageCompression'
import type { BodyMeasurement, BodyPhoto } from '@/domain/types'

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
// Peso y medidas
// ---------------------------------------------------------------------

export async function listBodyMeasurements(memberId: string): Promise<BodyMeasurement[]> {
  const { data, error } = await supabase
    .from('body_measurements')
    .select('id, family_id, member_id, measured_date, weight_kg, waist_cm, abdomen_cm, arm_cm, leg_cm')
    .eq('member_id', memberId)
    .order('measured_date', { ascending: true })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    memberId: r.member_id,
    measuredDate: r.measured_date,
    weightKg: r.weight_kg,
    waistCm: r.waist_cm,
    abdomenCm: r.abdomen_cm,
    armCm: r.arm_cm,
    legCm: r.leg_cm,
  }))
}

export async function addBodyMeasurement(input: {
  memberId: string
  date: string
  weightKg: number | null
  waistCm: number | null
  abdomenCm: number | null
  armCm: number | null
  legCm: number | null
}): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('body_measurements').insert({
    family_id: familyId,
    member_id: input.memberId,
    measured_date: input.date,
    weight_kg: input.weightKg,
    waist_cm: input.waistCm,
    abdomen_cm: input.abdomenCm,
    arm_cm: input.armCm,
    leg_cm: input.legCm,
  })
  if (error) throw error
}

export async function deleteBodyMeasurement(id: string): Promise<void> {
  const { error } = await supabase.from('body_measurements').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------
// Fotos de evolución
// ---------------------------------------------------------------------

export async function listBodyPhotos(memberId: string): Promise<BodyPhoto[]> {
  const { data, error } = await supabase
    .from('body_photos')
    .select('id, family_id, member_id, photo_date, storage_path, caption, created_at')
    .eq('member_id', memberId)
    .order('photo_date', { ascending: false })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    memberId: r.member_id,
    photoDate: r.photo_date,
    storagePath: r.storage_path,
    caption: r.caption,
    createdAt: r.created_at,
  }))
}

export async function uploadBodyPhoto(input: { memberId: string; date: string; file: File; caption: string }): Promise<void> {
  const familyId = await currentFamilyId()
  const file = await compressImageFile(input.file)
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${familyId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage.from('body-photos').upload(path, file)
  if (uploadError) throw uploadError

  const { error } = await supabase.from('body_photos').insert({
    family_id: familyId,
    member_id: input.memberId,
    photo_date: input.date,
    storage_path: path,
    caption: input.caption || null,
  })
  if (error) throw error
}

export async function getBodyPhotoUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('body-photos').createSignedUrl(storagePath, 3600)
  if (error) throw error
  return data.signedUrl
}

export async function deleteBodyPhoto(photo: BodyPhoto): Promise<void> {
  await supabase.storage.from('body-photos').remove([photo.storagePath])
  const { error } = await supabase.from('body_photos').delete().eq('id', photo.id)
  if (error) throw error
}
