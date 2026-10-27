import type { AiPart, AiPurposeSpec } from '../types.ts'
import { asRecord, parseJsonLoose } from '../validate.ts'

// «Fotografiar envase» (comparador de precios, COMP-3): lee de una o varias fotos de un envase (frontal, etiqueta trasera…) los datos IMPRESOS que sirven para
// comparar precios: nombre, marca, cuántas unidades trae, cuánto contiene cada una y el código de barras. REGLA FUNDAMENTAL: transcribir, no interpretar ni calcular.
// La salida es SIEMPRE una propuesta que la persona corrige antes de guardar; esta función no guarda nada, las imágenes no se conservan en ningún sitio y el código de
// barras es solo una ayuda (nunca un requisito para comparar).

export interface PackagePhotoImage {
  imageBase64: string
  mimeType: string
}

export interface PackagePhotoInput {
  images: PackagePhotoImage[]
}

export type PackagePhotoUnit = 'g' | 'kg' | 'ml' | 'l' | 'ud'

export interface PackagePhotoOutput {
  name: string | null
  brand: string | null
  /** Unidades que trae la presentación (6 latas). 1 si es un solo envase. null = no se ve. */
  count: number | null
  /** Contenido de CADA unidad (330) en `unit`. null = no se ve. */
  amount: number | null
  unit: PackagePhotoUnit | null
  /** Texto de la presentación tal como se lee («Pack 6 latas de 33 cl»). */
  presentation: string | null
  /** EAN-8/13 con dígito de control correcto, o null. */
  ean: string | null
  /** alta = todo impreso y coherente; media = falta algo o hay una lectura dudosa; baja = no se debe usar sin revisar a mano. */
  confidence: 'alta' | 'media' | 'baja'
  notes: string | null
}

const MAX_IMAGES = 3

const PROMPT =
  'Estas imágenes son fotos de UN envase de un producto de supermercado (frontal y/o etiqueta trasera). Tu trabajo es solo LEER lo que está IMPRESO y que sirve ' +
  'para comparar precios entre tiendas. Responde ÚNICAMENTE un objeto JSON con esta forma exacta, sin texto adicional ni markdown:\n' +
  '{"name": "nombre del producto o null", "brand": "marca o null", "count": numero_o_null, "amount": numero_o_null, "unit": "g"|"kg"|"ml"|"l"|"ud"|null, ' +
  '"total": numero_o_null, "totalUnit": "g"|"kg"|"ml"|"l"|"ud"|null, "presentation": "texto de la presentación o null", "ean": "dígitos del código de barras o null", ' +
  '"confidence": "alta"|"media"|"baja", "notes": "motivo de la duda o null"}\n' +
  'Reglas estrictas:\n' +
  '- NUNCA inventes, adivines ni calcules. Si un dato no está impreso y legible, pon null. No multipliques ni dividas tú ningún número.\n' +
  '- "count" = cuántas unidades individuales trae el paquete (p. ej. «pack 6 latas» → 6; un envase suelto → 1 solo si el envase es claramente una unidad).\n' +
  '- "amount" y "unit" = el contenido de CADA unidad tal como está impreso (330 ml → amount 330, unit "ml"; 1,5 L → 1.5, "l"; 500 g → 500, "g"). ' +
  'Usa solo g, kg, ml, l o ud (para productos que se cuentan: huevos, rollos, pañales, cápsulas). Convierte cl a ml solo si es literal (33 cl → 330 ml).\n' +
  '- Si el envase solo imprime un contenido NETO TOTAL («Contenido neto 1,98 L (6 x 33 cl)»), apunta count y amount de cada unidad y pon en "total"/"totalUnit" ese total tal cual.\n' +
  '- Si solo ves el peso o volumen total de un envase único, count=1 y amount = ese contenido.\n' +
  '- "ean": solo los dígitos del código de barras si se ve entero y nítido (8 o 13 dígitos); si dudas de un solo dígito, null.\n' +
  '- "confidence": "alta" solo si count, amount y unit están claramente impresos; "baja" si la imagen es borrosa, está cortada o hay lecturas contradictorias.\n' +
  'Si las imágenes no muestran un envase legible, responde todo null con "confidence": "baja".'

const UNITS: readonly PackagePhotoUnit[] = ['g', 'kg', 'ml', 'l', 'ud']

function asUnit(v: unknown): PackagePhotoUnit | null {
  if (typeof v !== 'string') return null
  const u = v.trim().toLowerCase()
  if (u === 'cl') return null // la conversión de cl la hace el modelo solo si es literal; una unidad cl llegando aquí es dudosa
  return (UNITS as readonly string[]).includes(u) ? (u as PackagePhotoUnit) : null
}

function asPositive(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? n : null
}

/** Dígito de control de un EAN-8 / EAN-13 (también acepta UPC-A de 12 y GTIN-14 como 13/14 con ceros). */
export function isValidEan(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false
  const digits = code.split('').map(Number)
  const check = digits.pop() as number
  let sum = 0
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += digits[i] * w
  return (10 - (sum % 10)) % 10 === check
}

const EMPTY: PackagePhotoOutput = { name: null, brand: null, count: null, amount: null, unit: null, presentation: null, ean: null, confidence: 'baja', notes: null }

const toBase = (n: number, u: PackagePhotoUnit): number => (u === 'kg' || u === 'l' ? n * 1000 : n)

/**
 * Valida de forma ESTRICTA lo que devuelve el modelo. Nunca lanza: una respuesta rara es «no se ha leído nada». Se comprueba la coherencia (count × amount frente al
 * total impreso, EAN con dígito de control) y cualquier duda baja la confianza: la persona siempre revisa antes de guardar.
 */
export function parsePackagePhotoOutput(rawText: string): PackagePhotoOutput {
  const p = asRecord(parseJsonLoose(rawText))
  if (!p) return { ...EMPTY, notes: 'No se ha podido leer el envase.' }
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, max) : null)
  let count = asPositive(p.count)
  const amount = asPositive(p.amount)
  const unit = asUnit(p.unit)
  const notes: string[] = []
  let confidence: PackagePhotoOutput['confidence'] = p.confidence === 'alta' || p.confidence === 'media' || p.confidence === 'baja' ? p.confidence : 'baja'

  if (count != null && !Number.isInteger(count) && unit === 'ud') {
    // 2,5 unidades no existe: dato dudoso
    count = null
    notes.push('El número de unidades no es entero.')
  }
  if (count == null || amount == null || unit == null) {
    // Un formato a medias no se ofrece como completo: se rellena lo que se vio y se avisa de lo que falta.
    if (confidence === 'alta') confidence = 'media'
    notes.push(count == null ? 'No se ve cuántas unidades trae.' : amount == null || unit == null ? 'No se ve el contenido de cada unidad.' : '')
  }
  // Coherencia con el contenido neto total impreso, si lo hay.
  const total = asPositive(p.total)
  const totalUnit = asUnit(p.totalUnit)
  if (total != null && totalUnit != null && count != null && amount != null && unit != null) {
    const sameKind = (a: PackagePhotoUnit, b: PackagePhotoUnit) => (['g', 'kg'].includes(a) && ['g', 'kg'].includes(b)) || (['ml', 'l'].includes(a) && ['ml', 'l'].includes(b)) || (a === 'ud' && b === 'ud')
    if (sameKind(unit, totalUnit)) {
      const expected = count * toBase(amount, unit)
      const printed = toBase(total, totalUnit)
      if (Math.abs(expected - printed) > Math.max(1, printed * 0.02)) {
        confidence = 'baja'
        notes.push('El contenido total impreso no coincide con unidades × contenido.')
      }
    }
  }
  let ean = typeof p.ean === 'string' ? p.ean.replace(/\D/g, '') : null
  if (ean != null && ean !== '' && !isValidEan(ean)) {
    notes.push('El código de barras leído no es válido y se ha descartado.')
    ean = null
    if (confidence === 'alta') confidence = 'media'
  }
  const modelNotes = str(p.notes, 200)
  if (modelNotes) notes.push(modelNotes)
  return {
    name: str(p.name, 120),
    brand: str(p.brand, 60),
    count,
    amount,
    unit,
    presentation: str(p.presentation, 120),
    ean: ean || null,
    confidence,
    notes: notes.filter(Boolean).length > 0 ? notes.filter(Boolean).join(' ').slice(0, 300) : null,
  }
}

export const packagePhotoSpec: AiPurposeSpec<PackagePhotoInput, PackagePhotoOutput> = {
  purpose: 'analyze-package-photo',
  maxOutputTokens: 512,
  // Control de coste propio: pocas llamadas al día por familia (cada foto cuesta una fracción de céntimo; el tope evita abusos).
  purposeDailyCap: 40,

  readInput(body) {
    const raw = body.images
    if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: 'missing image' }
    const images: PackagePhotoImage[] = []
    for (const item of raw.slice(0, MAX_IMAGES)) {
      const rec = asRecord(item)
      if (!rec || typeof rec.imageBase64 !== 'string' || !rec.imageBase64 || typeof rec.mimeType !== 'string' || !rec.mimeType.startsWith('image/')) return { ok: false, error: 'invalid image' }
      // ~6 MB en base64: la imagen ya viene reducida por el móvil; esto solo corta casos patológicos.
      if (rec.imageBase64.length > 8_000_000) return { ok: false, error: 'image too large' }
      images.push({ imageBase64: rec.imageBase64, mimeType: rec.mimeType })
    }
    return { ok: true, input: { images } }
  },

  buildParts({ images }) {
    const parts: AiPart[] = [{ text: PROMPT }]
    for (const i of images) parts.push({ inlineData: { mimeType: i.mimeType, data: i.imageBase64 } })
    return parts
  },

  parseOutput(rawText) {
    return parsePackagePhotoOutput(rawText)
  },
}
