// Comunidad PEPA — prepara una foto ANTES de subirla: la dibuja en un lienzo y la guarda de nuevo como JPEG de máximo 1600 px de lado. Dibujar de nuevo es lo
// que ELIMINA los datos ocultos de la foto original (EXIF: ubicación GPS, modelo de móvil, fecha…): lo que se sube son solo los píxeles. Es obligatorio en
// Comunidad porque las fotos son PÚBLICAS (cualquiera con el enlace y los buscadores las pueden ver).
import { CommunityError } from '@/domain/communityErrors'

export const MAX_PHOTO_SIDE = 1600
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024

// Intentos de compresión, de más a menos calidad: se para en el primero que cabe en 3 MB. Si ninguno cabe, la foto se rechaza (BAD_PHOTO).
export const COMPRESSION_STEPS: { quality: number; scale: number }[] = [
  { quality: 0.85, scale: 1 },
  { quality: 0.72, scale: 1 },
  { quality: 0.6, scale: 0.8 },
  { quality: 0.5, scale: 0.6 },
]

// ---- Parte pura (se prueba sin navegador)

// Tamaño final: nunca más de `maxSide` en el lado largo, nunca se agranda una foto pequeña, y siempre al menos 1 px.
export function scaledSize(width: number, height: number, maxSide = MAX_PHOTO_SIDE, extraScale = 1): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 1, height: 1 }
  const scale = Math.min(1, maxSide / Math.max(width, height)) * extraScale
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export function fitsPhotoLimit(bytes: number): boolean {
  return bytes > 0 && bytes <= MAX_PHOTO_BYTES
}

// Se acepta cualquier imagen menos SVG (vectorial, no es una foto). Un tipo vacío se deja intentar: algunos móviles no lo informan y ya fallará al leerla.
export function looksLikeAcceptedImage(mimeType: string): boolean {
  const t = mimeType.trim().toLowerCase()
  if (t === '') return true
  return t.startsWith('image/') && t !== 'image/svg+xml'
}

// ---- Parte con navegador

interface Decoded {
  source: CanvasImageSource
  width: number
  height: number
  close: () => void
}

async function decode(file: Blob): Promise<Decoded> {
  // Primero createImageBitmap, que respeta la orientación de la foto (si no, saldría girada al quitarle el EXIF).
  if (typeof createImageBitmap === 'function') {
    for (const options of [{ imageOrientation: 'from-image' } as ImageBitmapOptions, undefined]) {
      try {
        const bmp = options ? await createImageBitmap(file, options) : await createImageBitmap(file)
        return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() }
      } catch {
        // Se prueba la siguiente forma.
      }
    }
  }
  // Último recurso (Safari antiguo): un <img> normal, que también aplica la orientación.
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('empty')
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

// Devuelve el JPEG limpio listo para subir. Lanza CommunityError('BAD_PHOTO') si no es una imagen, no se puede leer (p. ej. HEIC sin soporte en ese navegador)
// o sigue pesando más de 3 MB tras comprimir.
export async function prepareCommunityPhoto(file: Blob): Promise<Blob> {
  if (!looksLikeAcceptedImage(file.type)) throw new CommunityError('BAD_PHOTO')
  let decoded: Decoded
  try {
    decoded = await decode(file)
  } catch {
    throw new CommunityError('BAD_PHOTO')
  }
  try {
    for (const step of COMPRESSION_STEPS) {
      const { width, height } = scaledSize(decoded.width, decoded.height, MAX_PHOTO_SIDE, step.scale)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new CommunityError('BAD_PHOTO')
      // Fondo blanco: los PNG con transparencia saldrían negros al pasar a JPEG.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(decoded.source, 0, 0, width, height)
      const blob = await toJpeg(canvas, step.quality)
      if (!blob) throw new CommunityError('BAD_PHOTO')
      if (fitsPhotoLimit(blob.size)) return blob
    }
  } finally {
    decoded.close()
  }
  throw new CommunityError('BAD_PHOTO')
}
