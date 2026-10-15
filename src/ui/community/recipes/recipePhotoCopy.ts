// Comunidad PEPA — copiar la foto de una receta entre la Cocina PRIVADA y Comunidad (siempre una COPIA nueva: los dos lados son independientes).
// Privada → pública: se baja por URL firmada (el bucket privado nunca es público), se vuelve a dibujar (prepareCommunityPhoto quita los datos ocultos de la
// foto: GPS, modelo del móvil…) y se sube a la carpeta pública de la persona. Pública → privada: se baja de Comunidad y se sube a la Cocina de la familia.
import { communityPhotoUrl, uploadCommunityPhoto } from '@/data/community'
import { getRecipePhotoUrl, uploadRecipePhoto } from '@/data/food'
import { CommunityError } from '@/domain/communityErrors'
import { prepareCommunityPhoto } from '@/services/communityPhoto'

async function downloadBlob(url: string): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) throw new CommunityError('BAD_PHOTO')
  return response.blob()
}

// Devuelve la ruta de la foto ya subida a Comunidad (carpeta del perfil público `profileId`).
export async function copyPrivatePhotoToCommunity(profileId: string, imagePath: string): Promise<string> {
  const blob = await downloadBlob(await getRecipePhotoUrl(imagePath))
  const prepared = await prepareCommunityPhoto(blob)
  return uploadCommunityPhoto(profileId, prepared)
}

// Devuelve la ruta de la foto ya subida a la Cocina de la familia (con la compresión de siempre).
export async function copyCommunityPhotoToKitchen(path: string): Promise<string> {
  const blob = await downloadBlob(communityPhotoUrl(path))
  const file = new File([blob], 'receta.jpg', { type: blob.type || 'image/jpeg' })
  return uploadRecipePhoto(file)
}
