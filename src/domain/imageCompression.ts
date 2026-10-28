// Comprime una foto antes de subirla — una foto de cámara suele pesar
// varios MB, y en el plan gratuito de Supabase el espacio de storage es
// limitado (petición real: "que se suban comprimidas... para que
// ocupen menos espacio posible"). Se usa en todos los sitios donde se
// sube una foto (tickets, documentos, galería, miembros, seguimiento
// corporal) — no solo en uno, para no acabar con unos sitios
// comprimiendo y otros no.
const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.82

// maxDimension: un ticket largo y estrecho necesita más resolución que una foto normal para que se lea la letra pequeña.
export async function compressImageFile(file: File, maxDimension: number = MAX_DIMENSION): Promise<File> {
  // Un PDF, o algo que no sea imagen, pasa tal cual — nada que
  // recomprimir. SVG tampoco: ya es texto vectorial, pequeño de por sí,
  // y recodificarlo a JPEG lo estropearía (se convertiría en mapa de
  // píxeles).
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    if (!blob) return file
    // Si el resultado recodificado pesa más que el original (p. ej. una
    // captura de pantalla ya pequeña y comprimida), nos quedamos con el
    // original — el objetivo es ocupar menos, nunca más.
    if (blob.size >= file.size) return file

    const newName = file.name.replace(/\.[^./\\]+$/, '') + '.jpg'
    return new File([blob], newName, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    // createImageBitmap puede fallar con algún formato sin soporte en
    // ese navegador (p. ej. HEIC en Chrome/Android) — mejor subir la
    // foto original que no subir nada.
    return file
  }
}

// ── Foto de un documento para que la lea la IA (Previsión de pagos → «Importar desde foto o documento») ───────────────────────────────────────────────────────────────
// Hasta el 28/10/2026 la foto se mandaba TAL CUAL salía de la cámara. La misma fotografía de un cuadro de amortización se leía bien desde un iPhone y daba «no puedo extraer nada»
// desde un Android. Causas PROBABLES de esa diferencia (no se pudo comprobar en un Android real; la preparación común las cubre todas sin tratar a Android aparte):
//   · Orientación: la cámara de Android suele guardar la foto de lado (los píxeles tal cual salen del sensor) y anotar «gírala» en los metadatos EXIF; el modelo de IA mira los
//     píxeles, no la anotación, y ve una tabla tumbada. Safari en iPhone ya entrega la imagen girada al subirla.
//   · Tamaño: una foto de Android de 12-50 megapíxeles son varios MB (en base64, un tercio más) metidos en una sola petición JSON, frente a los ~1-3 MB del iPhone.
//   · Tipo: el navegador puede dar un tipo vacío o raro («image/jpg», «application/octet-stream») y el modelo lo rechaza o lo interpreta mal.
// La preparación es la MISMA para todos los dispositivos: se decodifica aplicando la orientación, se reduce y se vuelve a codificar como JPEG con la imagen ya derecha.
// Nunca se guarda ni se registra la imagen ni sus datos.
export type AiImageVariant = 'standard' | 'enhanced'

export interface PreparedAiImage {
  file: File
  /** true si se recodificó (orientación aplicada y reducida); false si se mandó el original (PDF, formato que el navegador no sabe decodificar...). */
  reencoded: boolean
}

const AI_MAX_DIMENSION: Record<AiImageVariant, number> = { standard: 2000, enhanced: 2600 }
const AI_JPEG_QUALITY: Record<AiImageVariant, number> = { standard: 0.88, enhanced: 0.92 }
// Tope del archivo ya preparado: por encima se baja la resolución una vez más (la petición viaja en base64, un tercio más grande).
const AI_MAX_BYTES = 6 * 1024 * 1024

/** Tipo MIME fiable: el que dice el navegador si es una imagen o un PDF conocido; si no, el que sale de la extensión; si no, JPEG. */
export function normalizedAiMimeType(file: { type: string; name: string }): string {
  const t = (file.type || '').toLowerCase()
  if (t === 'application/pdf') return t
  if (t === 'image/jpg' || t === 'image/pjpeg') return 'image/jpeg'
  if (/^image\/(jpeg|png|webp|heic|heif)$/.test(t)) return t
  const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  const byExt: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' }
  return (ext && byExt[ext]) || 'image/jpeg'
}

async function renderToJpeg(bitmap: ImageBitmap, maxDimension: number, quality: number, variant: AiImageVariant): Promise<Blob | null> {
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  // Segundo intento («enhanced»): escala de grises y más contraste, que ayuda con fotos de papel con poca luz o sombras. Los importes y fechas no se tocan: solo cómo se ve la imagen.
  if (variant === 'enhanced') ctx.filter = 'grayscale(1) contrast(1.35)'
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

export async function prepareImageForAi(file: File, variant: AiImageVariant = 'standard'): Promise<PreparedAiImage> {
  const mime = normalizedAiMimeType(file)
  const original = file.type === mime ? file : new File([file], file.name, { type: mime, lastModified: file.lastModified })
  if (!mime.startsWith('image/')) return { file: original, reencoded: false }
  try {
    // 'from-image' aplica la orientación EXIF a los píxeles (es el comportamiento por defecto en los navegadores modernos; se pide a las claras para no depender de ello).
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    let blob = await renderToJpeg(bitmap, AI_MAX_DIMENSION[variant], AI_JPEG_QUALITY[variant], variant)
    if (blob && blob.size > AI_MAX_BYTES) blob = await renderToJpeg(bitmap, 1500, 0.8, variant)
    bitmap.close()
    if (!blob || blob.size === 0) return { file: original, reencoded: false }
    return { file: new File([blob], file.name.replace(/\.[^./\\]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified }), reencoded: true }
  } catch {
    // Formato que este navegador no sabe decodificar (p. ej. HEIC en Chrome de Android): se manda el original con su tipo corregido; el servidor de IA lo admite.
    return { file: original, reencoded: false }
  }
}
