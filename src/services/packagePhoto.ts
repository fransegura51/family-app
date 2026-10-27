// Llama a la función de servidor «analyze-package-photo» (IA ya integrada en PEPA, Gemini) para leer de una a tres fotos de un envase sus datos impresos. Mismo patrón que
// analyzeReceiptPhoto: la clave de la IA nunca pasa por aquí. Las imágenes se reducen en el móvil, se envían y NO se guardan en ningún sitio.
import { supabase } from '@/data/supabaseClient'
import { compressImageFile } from '@/domain/imageCompression'
import { sanitizeReading, type PackPhotoReading } from '@/domain/packPhoto'

export const MAX_PACKAGE_PHOTOS = 3

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(((reader.result as string) ?? '').split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export async function analyzePackagePhotos(files: readonly File[]): Promise<PackPhotoReading> {
  const chosen = files.filter((f) => f.type.startsWith('image/')).slice(0, MAX_PACKAGE_PHOTOS)
  if (chosen.length === 0) throw new Error('Elige una foto del envase')
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No autenticado')
  const images = await Promise.all(
    chosen.map(async (f) => {
      const small = await compressImageFile(f)
      return { imageBase64: await fileToBase64(small), mimeType: small.type || 'image/jpeg' }
    }),
  )
  const url = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/analyze-package-photo`
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ images }) })
  if (res.status === 404) throw new Error('Leer envases con una foto todavía no está disponible. Escribe el formato a mano.')
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as { reason?: string }
    throw new Error(body.reason === 'purpose_daily_cap' ? 'Has llegado al máximo de lecturas de envases de hoy. Escribe el formato a mano.' : 'La lectura con IA no está disponible para esta cuenta. Escribe el formato a mano.')
  }
  if (!res.ok) throw new Error('No se pudo leer el envase. Escribe el formato a mano.')
  return sanitizeReading(await res.json())
}
