// Comunidad PEPA — quita los datos ocultos (metadatos) de una foto ANTES de servirla al público (INC-12, CMN-§19.5).
//
// Por qué aquí: la app ya dibuja cada foto de nuevo en el navegador antes de subirla (services/communityPhoto.ts), lo que borra el EXIF (ubicación GPS, modelo del
// móvil, fecha…). Pero el servidor solo valida tipo y tamaño: una subida directa por la API, o una versión antigua de la app, conservaría esos datos. Como todas
// las fotos de Comunidad se sirven por el Worker de Cloudflare (workers/community-public), éste las limpia al servirlas: lo que sale a internet NUNCA lleva
// EXIF, XMP, IPTC, comentarios ni marcas de tiempo, aunque se hubieran guardado así. Es lógica pura (sin red) para poder probarla con imágenes sintéticas.
//
// Qué conserva: los píxeles y lo necesario para pintarlos (JFIF, perfil de color ICC, Adobe, tablas…). Qué quita:
//   · JPEG: APP1 (Exif y XMP), APP2 que no sea ICC (MPF/FlashPix), APP3-APP13 y APP15 (IPTC/Photoshop…), comentarios, y TODO lo que venga detrás del final de imagen
//     (fotos incrustadas, datos añadidos).
//   · PNG: eXIf, tEXt, zTXt, iTXt (texto y XMP), tIME, y lo que venga detrás de IEND.
//   · WebP: los bloques EXIF y XMP (y sus indicadores en VP8X); se recalcula el tamaño.
// Un archivo que no se puede recorrer con seguridad (truncado, mal formado) devuelve null: el Worker responde 404 en vez de servirlo sin revisar.
// Limitación conocida: al quitar el EXIF se pierde también la orientación; las fotos que sube la app ya llevan los píxeles girados, así que no se nota.
export type ScrubImageType = 'image/jpeg' | 'image/png' | 'image/webp'

export function scrubImageMetadata(bytes: Uint8Array, type: ScrubImageType): Uint8Array | null {
  try {
    if (type === 'image/jpeg') return scrubJpeg(bytes)
    if (type === 'image/png') return scrubPng(bytes)
    if (type === 'image/webp') return scrubWebp(bytes)
  } catch {
    return null
  }
  return null
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0
  for (const p of parts) total += p.length
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

const ascii = (bytes: Uint8Array, start: number, text: string): boolean => {
  if (start + text.length > bytes.length) return false
  for (let i = 0; i < text.length; i++) if (bytes[start + i] !== text.charCodeAt(i)) return false
  return true
}

// ---------------------------------------------------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------------------------------------------------
function scrubJpeg(b: Uint8Array): Uint8Array | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  const parts: Uint8Array[] = [b.subarray(0, 2)]
  let i = 2
  while (i < b.length) {
    // Cada segmento empieza por 0xFF (puede haber bytes de relleno 0xFF delante).
    if (b[i] !== 0xff) return null
    while (i < b.length && b[i] === 0xff) i++
    if (i >= b.length) return null
    const marker = b[i]
    i++
    if (marker === 0xd9) return concat([...parts, new Uint8Array([0xff, 0xd9])]) // EOI antes de ninguna imagen: vacío pero válido
    // Marcadores sin longitud (RSTn y TEM).
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(new Uint8Array([0xff, marker]))
      continue
    }
    if (i + 2 > b.length) return null
    const length = (b[i] << 8) | b[i + 1]
    if (length < 2 || i + length > b.length) return null
    const dataStart = i + 2
    const segmentEnd = i + length
    if (marker === 0xda) {
      // Inicio del escaneo: desde aquí vienen los píxeles. Se copian hasta el PRIMER final de imagen (FF D9; dentro de los datos un FF siempre va seguido de 00
      // o de un RSTn), y se descarta cualquier cosa añadida detrás.
      let end = -1
      for (let k = segmentEnd; k + 1 < b.length; k++) {
        if (b[k] === 0xff && b[k + 1] === 0xd9) {
          end = k + 2
          break
        }
      }
      if (end === -1) return null
      parts.push(b.subarray(i - 2, end))
      return concat(parts)
    }
    if (keepJpegSegment(b, marker, dataStart, segmentEnd)) parts.push(b.subarray(i - 2, segmentEnd))
    i = segmentEnd
  }
  return null // sin inicio de escaneo ni final: truncado
}

function keepJpegSegment(b: Uint8Array, marker: number, dataStart: number, segmentEnd: number): boolean {
  if (marker >= 0xe0 && marker <= 0xef) {
    if (marker === 0xe0) return ascii(b, dataStart, 'JFIF\0') // JFIF sí; JFXX (miniatura extra) no
    if (marker === 0xe2) return ascii(b, dataStart, 'ICC_PROFILE\0') // perfil de color sí; MPF/FlashPix no
    if (marker === 0xee) return ascii(b, dataStart, 'Adobe') // transformación de color de Adobe (necesaria para CMYK/YCCK)
    return false // APP1 (Exif/XMP), APP3-APP13, APP15
  }
  if (marker === 0xfe) return false // comentarios
  return segmentEnd >= dataStart // tablas y cabeceras de imagen (DQT, DHT, SOF, DRI…): imprescindibles, se conservan siempre
}

// ---------------------------------------------------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------------------------------------------------
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME'])

function scrubPng(b: Uint8Array): Uint8Array | null {
  if (b.length < 8 + 12 || !PNG_SIGNATURE.every((v, k) => b[k] === v)) return null
  const parts: Uint8Array[] = [b.subarray(0, 8)]
  let i = 8
  while (i + 12 <= b.length) {
    const length = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
    const end = i + 12 + length // longitud + tipo + datos + CRC
    if (end > b.length) return null
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7])
    if (!PNG_DROP.has(type)) parts.push(b.subarray(i, end))
    i = end
    if (type === 'IEND') return concat(parts) // lo de detrás de IEND se descarta
  }
  return null
}

// ---------------------------------------------------------------------------------------------------------------------
// WebP (contenedor RIFF)
// ---------------------------------------------------------------------------------------------------------------------
function scrubWebp(b: Uint8Array): Uint8Array | null {
  if (b.length < 20 || !ascii(b, 0, 'RIFF') || !ascii(b, 8, 'WEBP')) return null
  const riffSize = (b[4] | (b[5] << 8) | (b[6] << 16) | (b[7] << 24)) >>> 0
  const limit = Math.min(b.length, 8 + riffSize)
  if (limit < 20) return null
  const chunks: Uint8Array[] = []
  let i = 12
  while (i + 8 <= limit) {
    const size = (b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24)) >>> 0
    const padded = size + (size % 2)
    if (i + 8 + size > limit) return null
    const fourcc = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3])
    const end = Math.min(i + 8 + padded, limit)
    if (fourcc === 'EXIF' || fourcc === 'XMP ') {
      i = end
      continue
    }
    const chunk = b.slice(i, end)
    // VP8X: indicadores de lo que contiene el archivo (bit 0x08 = EXIF, 0x04 = XMP): se apagan, porque ya no están.
    if (fourcc === 'VP8X' && size >= 10) chunk[8] = chunk[8] & ~0x0c
    chunks.push(chunk)
    i = end
  }
  if (chunks.length === 0) return null
  const body = concat(chunks)
  const header = new Uint8Array(12)
  header.set(b.subarray(0, 4), 0)
  const total = 4 + body.length
  header[4] = total & 0xff
  header[5] = (total >>> 8) & 0xff
  header[6] = (total >>> 16) & 0xff
  header[7] = (total >>> 24) & 0xff
  header.set(b.subarray(8, 12), 8)
  return concat([header, body])
}
