import { supabase } from '@/data/supabaseClient'
import type { GalleryPhoto } from '@/domain/types'

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

export async function listGalleryPhotos(): Promise<GalleryPhoto[]> {
  const { data, error } = await supabase
    .from('gallery_photos')
    .select('id, family_id, storage_path, caption, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    storagePath: r.storage_path,
    caption: r.caption,
    createdAt: r.created_at,
  }))
}

export async function uploadGalleryPhoto(file: File, caption: string): Promise<void> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const familyId = await currentFamilyId()
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${familyId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage.from('gallery').upload(path, file)
  if (uploadError) throw uploadError

  const { error } = await supabase.from('gallery_photos').insert({
    family_id: familyId,
    storage_path: path,
    caption: caption || null,
    uploaded_by: userResult.user.id,
  })
  if (error) throw error
}

export async function getGalleryPhotoUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('gallery').createSignedUrl(storagePath, 3600)
  if (error) throw error
  return data.signedUrl
}

export async function deleteGalleryPhoto(photo: GalleryPhoto): Promise<void> {
  await supabase.storage.from('gallery').remove([photo.storagePath])
  const { error } = await supabase.from('gallery_photos').delete().eq('id', photo.id)
  if (error) throw error
}
