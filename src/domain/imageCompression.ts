// Comprime una foto antes de subirla — una foto de cámara suele pesar
// varios MB, y en el plan gratuito de Supabase el espacio de storage es
// limitado (petición real: "que se suban comprimidas... para que
// ocupen menos espacio posible"). Se usa en todos los sitios donde se
// sube una foto (tickets, documentos, galería, miembros, seguimiento
// corporal) — no solo en uno, para no acabar con unos sitios
// comprimiendo y otros no.
const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.82

export async function compressImageFile(file: File): Promise<File> {
  // Un PDF, o algo que no sea imagen, pasa tal cual — nada que
  // recomprimir. SVG tampoco: ya es texto vectorial, pequeño de por sí,
  // y recodificarlo a JPEG lo estropearía (se convertiría en mapa de
  // píxeles).
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
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
