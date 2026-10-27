// Lo que devuelve la lectura de un envase por fotografía (servidor: analyze-package-photo) y cómo se ofrece a la persona. Puro.
//
// Reglas: es siempre una PROPUESTA que se corrige antes de guardar; una lectura de confianza «baja» no rellena nada; nunca se inventa una cantidad; el código de barras es
// solo una ayuda (no hace falta para comparar).
import { packTotalSize, PACK_UNITS, type PackUnit } from './productSize'

export interface PackPhotoReading {
  name: string | null
  brand: string | null
  count: number | null
  amount: number | null
  unit: PackUnit | null
  presentation: string | null
  ean: string | null
  confidence: 'alta' | 'media' | 'baja'
  notes: string | null
}

export function sanitizeReading(raw: unknown): PackPhotoReading {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
  const unit = typeof r.unit === 'string' && (PACK_UNITS as readonly string[]).includes(r.unit) ? (r.unit as PackUnit) : null
  const confidence = r.confidence === 'alta' || r.confidence === 'media' ? r.confidence : 'baja'
  const ean = typeof r.ean === 'string' && /^\d{8}$|^\d{12,14}$/.test(r.ean) ? r.ean : null
  return { name: str(r.name), brand: str(r.brand), count: num(r.count), amount: num(r.amount), unit, presentation: str(r.presentation), ean, confidence, notes: str(r.notes) }
}

export interface PackPhotoSuggestion {
  /** Campos para rellenar el editor (texto), o null si la lectura no es utilizable. */
  fill: { count: string; amount: string; unit: PackUnit } | null
  /** Qué decirle a la persona. */
  message: string
}

const num = (n: number) => String(Math.round(n * 1000) / 1000)

/** Qué se rellena en el editor a partir de la lectura. Con confianza baja o datos a medias no se rellena un formato completo. */
export function suggestionFromReading(r: PackPhotoReading): PackPhotoSuggestion {
  if (r.confidence === 'baja') return { fill: null, message: r.notes ? `No se ha podido leer con seguridad (${r.notes}). Escríbelo a mano o prueba con otra foto.` : 'No se ha podido leer con seguridad. Escríbelo a mano o prueba con otra foto de la etiqueta.' }
  if (r.count == null || r.amount == null || r.unit == null) {
    const seen = [r.amount != null && r.unit != null ? `contenido ${num(r.amount)} ${r.unit}` : null, r.count != null ? `${num(r.count)} unidades` : null].filter(Boolean).join(', ')
    return { fill: null, message: `Solo se ha leído una parte${seen ? ` (${seen})` : ''}: completa el resto a mano o añade otra foto.` }
  }
  if (!packTotalSize({ count: r.count, amount: r.amount, unit: r.unit })) return { fill: null, message: 'La lectura no es válida. Escríbelo a mano.' }
  return {
    fill: { count: num(r.count), amount: num(r.amount), unit: r.unit },
    message: `Detectado${r.name ? ` en «${r.name}»` : ''}: ${num(r.count)} × ${num(r.amount)} ${r.unit}${r.confidence === 'media' ? ' (lectura media: revísalo)' : ''}. Comprueba y pulsa «Guardar formato».`,
  }
}

/** Código de barras leído → solo ayuda: se guarda aparte y sirve para reconocer un artículo idéntico; nunca para comparar. */
export function eanHint(reading: PackPhotoReading): string | null {
  return reading.confidence === 'baja' ? null : reading.ean
}
