// Limpieza de metadatos de las fotos de Comunidad (INC-12): con imágenes sintéticas que llevan GPS/EXIF/XMP/comentarios se comprueba que lo oculto desaparece,
// que los píxeles y lo necesario para pintarlos se conservan y que lo mal formado se rechaza (null).
import { describe, expect, it } from 'vitest'
import { scrubImageMetadata } from '@/domain/communityImageScrub'

const enc = (s: string) => new TextEncoder().encode(s)
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}
const bytes = (...n: number[]) => new Uint8Array(n)
const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b)
const has = (b: Uint8Array, needle: string) => text(b).includes(needle)

// ---- JPEG sintético: SOI + segmentos + SOS + datos de imagen + EOI
function jpegSegment(marker: number, payload: Uint8Array): Uint8Array {
  const len = payload.length + 2
  return cat(bytes(0xff, marker, len >> 8, len & 0xff), payload)
}
const JFIF = jpegSegment(0xe0, cat(enc('JFIF\0'), bytes(1, 1, 0, 0, 1, 0, 1, 0, 0)))
const EXIF_GPS = jpegSegment(0xe1, cat(enc('Exif\0\0'), enc('GPSLatitude=40.4168;GPSLongitude=-3.7038;Make=Xiaomi')))
const XMP = jpegSegment(0xe1, cat(enc('http://ns.adobe.com/xap/1.0/\0'), enc('<x:xmpmeta>autor secreto</x:xmpmeta>')))
const IPTC = jpegSegment(0xed, enc('Photoshop 3.0\0nombre real del fotografo'))
const COMMENT = jpegSegment(0xfe, enc('comentario con datos privados'))
const ICC = jpegSegment(0xe2, cat(enc('ICC_PROFILE\0'), bytes(1, 1), enc('perfil-de-color')))
const MPF = jpegSegment(0xe2, cat(enc('MPF\0'), enc('segunda-imagen-incrustada')))
const DQT = jpegSegment(0xdb, cat(bytes(0), new Uint8Array(64).fill(8)))
const SOF = jpegSegment(0xc0, bytes(8, 0, 1, 0, 1, 1, 1, 0x11, 0))
const SOS = jpegSegment(0xda, bytes(1, 1, 0, 0, 0x3f, 0))
const PIXELS = bytes(0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78, 0x9a) // con un 0xFF 0x00 (relleno) y un RST0 dentro de los datos
const EOI = bytes(0xff, 0xd9)
const SOI = bytes(0xff, 0xd8)
const jpeg = (...segments: Uint8Array[]) => cat(SOI, ...segments, SOS, PIXELS, EOI)

describe('JPEG', () => {
  it('quita Exif con GPS, XMP, IPTC y comentarios, y conserva JFIF, el perfil de color y los píxeles', () => {
    const dirty = jpeg(JFIF, EXIF_GPS, XMP, IPTC, COMMENT, ICC, DQT, SOF)
    const clean = scrubImageMetadata(dirty, 'image/jpeg')!
    expect(clean).not.toBeNull()
    for (const secret of ['GPSLatitude', 'Xiaomi', 'Exif', 'autor secreto', 'nombre real', 'comentario con datos privados']) expect(has(clean, secret), secret).toBe(false)
    for (const kept of ['JFIF', 'ICC_PROFILE', 'perfil-de-color']) expect(has(clean, kept), kept).toBe(true)
    expect(clean).toEqual(jpeg(JFIF, ICC, DQT, SOF)) // exactamente lo mismo sin los segmentos ocultos
    expect(clean.length).toBeLessThan(dirty.length)
  })

  it('una foto sin metadatos sale idéntica (byte a byte)', () => {
    const plain = jpeg(JFIF, DQT, SOF)
    expect(scrubImageMetadata(plain, 'image/jpeg')).toEqual(plain)
  })

  it('quita el segundo perfil MPF (fotos incrustadas) y las miniaturas JFXX', () => {
    const jfxx = jpegSegment(0xe0, cat(enc('JFXX\0'), bytes(0x10), enc('miniatura-con-exif')))
    const clean = scrubImageMetadata(jpeg(JFIF, jfxx, MPF, DQT, SOF), 'image/jpeg')!
    expect(has(clean, 'MPF')).toBe(false)
    expect(has(clean, 'miniatura')).toBe(false)
    expect(has(clean, 'JFIF')).toBe(true)
  })

  it('descarta lo que venga DETRÁS del final de imagen (datos añadidos o una foto incrustada con GPS)', () => {
    const dirty = cat(jpeg(JFIF, DQT, SOF), enc('GPSLatitude=1.0 datos añadidos'), jpeg(EXIF_GPS))
    const clean = scrubImageMetadata(dirty, 'image/jpeg')!
    expect(has(clean, 'GPSLatitude')).toBe(false)
    expect(clean).toEqual(jpeg(JFIF, DQT, SOF))
  })

  it('el 0xFF 0xD0 (reinicio) y el relleno 0xFF 0x00 dentro de los datos no se confunden con el final', () => {
    const clean = scrubImageMetadata(jpeg(JFIF, DQT, SOF), 'image/jpeg')!
    expect(Array.from(clean.slice(-PIXELS.length - 2))).toEqual([...PIXELS, 0xff, 0xd9])
  })

  it('un archivo truncado o que no es un JPEG se rechaza (null), no se sirve sin revisar', () => {
    expect(scrubImageMetadata(enc('<svg onload=alert(1)>'), 'image/jpeg')).toBeNull()
    expect(scrubImageMetadata(bytes(0xff, 0xd8), 'image/jpeg')).toBeNull()
    expect(scrubImageMetadata(jpeg(JFIF, DQT, SOF).slice(0, 40), 'image/jpeg')).toBeNull() // cortado a mitad de un segmento
    expect(scrubImageMetadata(cat(SOI, JFIF, DQT, SOF, SOS, PIXELS), 'image/jpeg')).toBeNull() // sin final de imagen
    expect(scrubImageMetadata(cat(SOI, bytes(0xff, 0xe1, 0x00, 0x01)), 'image/jpeg')).toBeNull() // longitud imposible
  })
})

// ---- PNG sintético
function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const len = data.length
  return cat(bytes((len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255), enc(type), data, bytes(1, 2, 3, 4)) // el CRC no se recalcula: se copia tal cual
}
const PNG_SIG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
const IHDR = pngChunk('IHDR', bytes(0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0))
const IDAT = pngChunk('IDAT', bytes(8, 0x1d, 1, 2, 3))
const IEND = pngChunk('IEND', bytes())

describe('PNG', () => {
  it('quita eXIf, tEXt, zTXt, iTXt y tIME y conserva cabecera, datos y perfil de color', () => {
    const iccp = pngChunk('iCCP', enc('perfil\0\0datos'))
    const dirty = cat(
      PNG_SIG,
      IHDR,
      pngChunk('eXIf', enc('GPSLongitude secreta')),
      iccp,
      pngChunk('tEXt', enc('Author\0Maria Lopez')),
      pngChunk('zTXt', enc('Comment\0\0x')),
      pngChunk('iTXt', enc('XML:com.adobe.xmp\0\0\0\0\0<xmp>privado</xmp>')),
      pngChunk('tIME', bytes(7, 234, 10, 15, 12, 0, 0)),
      IDAT,
      IEND,
    )
    const clean = scrubImageMetadata(dirty, 'image/png')!
    for (const secret of ['GPSLongitude', 'Maria Lopez', 'privado', 'tIME', 'eXIf']) expect(has(clean, secret), secret).toBe(false)
    expect(clean).toEqual(cat(PNG_SIG, IHDR, iccp, IDAT, IEND))
  })

  it('descarta lo que haya detrás de IEND y rechaza un PNG truncado o sin IEND', () => {
    expect(scrubImageMetadata(cat(PNG_SIG, IHDR, IDAT, IEND, enc('GPSLatitude añadido')), 'image/png')).toEqual(cat(PNG_SIG, IHDR, IDAT, IEND))
    expect(scrubImageMetadata(cat(PNG_SIG, IHDR, IDAT), 'image/png')).toBeNull()
    expect(scrubImageMetadata(cat(PNG_SIG, IHDR, IDAT, IEND).slice(0, 30), 'image/png')).toBeNull()
    expect(scrubImageMetadata(enc('no soy un png de verdad, sin firma'), 'image/png')).toBeNull()
  })
})

// ---- WebP sintético (contenedor RIFF)
function riffChunk(fourcc: string, data: Uint8Array): Uint8Array {
  const n = data.length
  const pad = n % 2 ? bytes(0) : bytes()
  return cat(enc(fourcc), bytes(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255), data, pad)
}
function webp(...chunks: Uint8Array[]): Uint8Array {
  const body = cat(...chunks)
  const size = 4 + body.length
  return cat(enc('RIFF'), bytes(size & 255, (size >>> 8) & 255, (size >>> 16) & 255, (size >>> 24) & 255), enc('WEBP'), body)
}
const VP8 = riffChunk('VP8 ', bytes(1, 2, 3, 4, 5, 6, 7, 8, 9))
const riffSize = (b: Uint8Array) => (b[4] | (b[5] << 8) | (b[6] << 16) | (b[7] << 24)) >>> 0

describe('WebP', () => {
  it('quita los bloques EXIF y XMP, apaga sus indicadores en VP8X y recalcula el tamaño', () => {
    const vp8x = (flags: number) => riffChunk('VP8X', bytes(flags, 0, 0, 0, 0, 0, 0, 0, 0, 0))
    const dirty = webp(vp8x(0x08 | 0x04 | 0x20), VP8, riffChunk('EXIF', enc('GPSLatitude secreta')), riffChunk('XMP ', enc('<xmp>privado</xmp>')))
    const clean = scrubImageMetadata(dirty, 'image/webp')!
    expect(has(clean, 'GPSLatitude')).toBe(false)
    expect(has(clean, 'privado')).toBe(false)
    expect(clean).toEqual(webp(vp8x(0x20), VP8)) // solo queda el indicador de «tiene ICC/animación», no los de EXIF/XMP
    expect(riffSize(clean)).toBe(clean.length - 8)
  })

  it('un WebP sencillo sin metadatos sale igual, y uno con bloque impar (relleno) mantiene la alineación', () => {
    const plain = webp(VP8)
    expect(scrubImageMetadata(plain, 'image/webp')).toEqual(plain)
    const odd = webp(riffChunk('VP8 ', bytes(1, 2, 3)), riffChunk('EXIF', enc('x')))
    expect(scrubImageMetadata(odd, 'image/webp')).toEqual(webp(riffChunk('VP8 ', bytes(1, 2, 3))))
  })

  it('se rechaza lo truncado, lo que declara más tamaño del que hay o lo que no es WebP', () => {
    expect(scrubImageMetadata(webp(VP8).slice(0, 22), 'image/webp')).toBeNull()
    expect(scrubImageMetadata(enc('RIFFxxxxWAVEfmt '), 'image/webp')).toBeNull()
    expect(scrubImageMetadata(enc('GIF89a....'), 'image/webp')).toBeNull()
  })
})

it('un tipo desconocido no se acepta', () => {
  expect(scrubImageMetadata(jpeg(JFIF, DQT, SOF), 'image/gif' as never)).toBeNull()
})
