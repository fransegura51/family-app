import { supabase } from '@/data/supabaseClient'
import { compressImageFile } from '@/domain/imageCompression'
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
  const compressed = await compressImageFile(file)
  const ext = compressed.name.split('.').pop() || 'jpg'
  const path = `${familyId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage.from('gallery').upload(path, compressed)
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

// Varias fotos en UNA sola petición (el carrusel de Inicio y el selector de fotos fijas piden hasta 5-36 a la vez: una llamada en vez de una por foto).
// Devuelve ruta → dirección firmada; las rutas que no se pudieron firmar no salen en el resultado.
export async function getGalleryPhotoUrls(storagePaths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(storagePaths)]
  if (unique.length === 0) return {}
  const { data, error } = await supabase.storage.from('gallery').createSignedUrls(unique, 3600)
  if (error) throw error
  const out: Record<string, string> = {}
  for (const item of data ?? []) {
    if (item.path && item.signedUrl && !item.error) out[item.path] = item.signedUrl
  }
  return out
}

// Cambia la descripción de una foto ya subida (vacía = sin descripción). Gallery_photos deja modificar a toda la familia (política «family crud»).
export async function updateGalleryCaption(id: string, caption: string): Promise<void> {
  const { error } = await supabase.from('gallery_photos').update({ caption: caption.trim() || null }).eq('id', id)
  if (error) throw error
}

export async function deleteGalleryPhoto(photo: GalleryPhoto): Promise<void> {
  await supabase.storage.from('gallery').remove([photo.storagePath])
  const { error } = await supabase.from('gallery_photos').delete().eq('id', photo.id)
  if (error) throw error
}
