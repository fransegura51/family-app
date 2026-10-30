// «Solicitar datos» (Gestión de grupos): definición y validación de formularios personalizables. Módulo PURO (sin dependencias): lo usan la aplicación (src/domain/groupForms.ts)
// y la función pública del servidor (group-form-public), así lo que se acepta al construir el formulario y lo que se acepta al responderlo sale de las MISMAS reglas.

export const FIELD_TYPES = ['texto', 'numero', 'fecha', 'email', 'telefono', 'si_no', 'seleccion', 'multiple', 'archivo'] as const
export type FieldType = (typeof FIELD_TYPES)[number]

/** Campos de la ficha del participante que una respuesta puede completar (solo si están vacíos; si hay otro valor se pide confirmación). */
export const MAPS_TO = ['surname', 'guardianName', 'phone', 'email'] as const
export type MapsTo = (typeof MAPS_TO)[number]

export interface FormField {
  id: string
  type: FieldType
  label: string
  help: string | null
  required: boolean
  options: string[]
  /** Dato delicado (DNI, pasaporte, salud…): almacenamiento protegido, caducidad y nunca va a las notas ni a las exportaciones ordinarias. */
  sensitive: boolean
  mapsTo: MapsTo | null
}

export const MAX_FIELDS = 40
export const MAX_FILES_PER_FIELD = 5
export const MAX_RETENTION_DAYS = 400

export type AnswerValue = string | number | boolean | string[]

const ID_RE = /^[a-z0-9_]{1,40}$/
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

const clip = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** Limpia y valida la lista de preguntas. Lo que no cuadra se descarta (nunca lanza); los errores graves se devuelven para enseñarlos. */
export function normalizeFields(raw: unknown): { fields: FormField[]; errors: string[] } {
  const errors: string[] = []
  const fields: FormField[] = []
  if (!Array.isArray(raw)) return { fields, errors: ['El formulario no tiene preguntas.'] }
  const seen = new Set<string>()
  for (const r of raw.slice(0, MAX_FIELDS)) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const type = FIELD_TYPES.find((t) => t === o.type)
    const label = clip(o.label, 200)
    const id = typeof o.id === 'string' && ID_RE.test(o.id) && !seen.has(o.id) ? o.id : ''
    if (!type || !id) continue
    if (!label) {
      errors.push('Hay una pregunta sin texto.')
      continue
    }
    seen.add(id)
    const options = Array.isArray(o.options) ? [...new Set(o.options.map((x) => clip(x, 100)).filter(Boolean))].slice(0, 30) : []
    if ((type === 'seleccion' || type === 'multiple') && options.length < 2) errors.push(`«${label}» necesita al menos dos opciones.`)
    const mapsTo = MAPS_TO.find((m) => m === o.mapsTo) ?? null
    // Solo un dato ORDINARIO de texto, correo o teléfono puede completar un campo de la ficha: nunca uno delicado ni un archivo.
    const okMap = !!mapsTo && o.sensitive !== true && (type === 'texto' || type === 'email' || type === 'telefono') && !(mapsTo === 'email' && type === 'telefono') && !(mapsTo === 'phone' && type === 'email')
    fields.push({
      id,
      type,
      label,
      help: clip(o.help, 300) || null,
      required: o.required === true,
      options: type === 'seleccion' || type === 'multiple' ? options : [],
      sensitive: o.sensitive === true,
      mapsTo: okMap ? mapsTo : null,
    })
  }
  if (fields.length === 0) errors.push('Añade al menos una pregunta.')
  return { fields, errors }
}

export const hasSensitive = (fields: FormField[]) => fields.some((f) => f.sensitive)

export interface AnswerCheck {
  clean: Record<string, AnswerValue>
  /** Errores por pregunta, para enseñarlos junto a ella. */
  errors: Record<string, string>
}

function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(s + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** Valida las respuestas contra las preguntas. Las preguntas desconocidas se ignoran. `filePrefix` = ruta que deben tener los archivos subidos para este destinatario. */
export function validateAnswers(fields: FormField[], answers: unknown, filePrefix: string): AnswerCheck {
  const src = answers && typeof answers === 'object' ? (answers as Record<string, unknown>) : {}
  const clean: Record<string, AnswerValue> = {}
  const errors: Record<string, string> = {}
  for (const f of fields) {
    const v = src[f.id]
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
    if (empty) {
      if (f.required) errors[f.id] = 'Esta pregunta es obligatoria.'
      continue
    }
    switch (f.type) {
      case 'texto': {
        const s = typeof v === 'string' ? v.replace(/\r/g, '').trim().slice(0, 2000) : ''
        if (s) clean[f.id] = s
        else if (f.required) errors[f.id] = 'Esta pregunta es obligatoria.'
        break
      }
      case 'numero': {
        const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
        if (Number.isFinite(n) && Math.abs(n) < 1e12) clean[f.id] = n
        else errors[f.id] = 'Escribe un número.'
        break
      }
      case 'fecha':
        if (typeof v === 'string' && validDate(v)) clean[f.id] = v
        else errors[f.id] = 'Escribe una fecha válida.'
        break
      case 'email': {
        const s = typeof v === 'string' ? v.trim() : ''
        if (s.length <= 160 && EMAIL_RE.test(s)) clean[f.id] = s
        else errors[f.id] = 'Escribe un correo válido.'
        break
      }
      case 'telefono': {
        const s = typeof v === 'string' ? v.trim() : ''
        if (s.length <= 30 && s.replace(/\D/g, '').length >= 7 && /^[+\d][\d\s().\-/]*$/.test(s)) clean[f.id] = s
        else errors[f.id] = 'Escribe un teléfono válido.'
        break
      }
      case 'si_no':
        if (v === true || v === false) clean[f.id] = v
        else if (v === 'si' || v === 'no') clean[f.id] = v === 'si'
        else errors[f.id] = 'Elige Sí o No.'
        break
      case 'seleccion':
        if (typeof v === 'string' && f.options.includes(v)) clean[f.id] = v
        else errors[f.id] = 'Elige una de las opciones.'
        break
      case 'multiple': {
        const list = Array.isArray(v) ? v : []
        if (list.length > 0 && list.every((x) => typeof x === 'string' && f.options.includes(x))) clean[f.id] = [...new Set(list as string[])]
        else errors[f.id] = 'Elige solo entre las opciones.'
        break
      }
      case 'archivo': {
        const list = Array.isArray(v) ? v : []
        const ok = list.length > 0 && list.length <= MAX_FILES_PER_FIELD && list.every((x) => typeof x === 'string' && x.startsWith(filePrefix) && !x.includes('..') && x.length < 300)
        if (ok) clean[f.id] = list as string[]
        else errors[f.id] = 'Adjunta el archivo y espera a que termine de subirse.'
        break
      }
    }
  }
  return { clean, errors }
}

// ---------------------------------------------------------------------------------------------- conservación de datos delicados
/** Fecha de hoy («YYYY-MM-DD») en la zona horaria dada (por defecto, la de España). */
export function todayIn(now: Date, tz = 'Europe/Madrid'): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  return parts
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to + 'T00:00:00Z').getTime() - new Date(from + 'T00:00:00Z').getTime()) / 86400000)
}

/** ¿Es una fecha máxima de conservación admisible para quien organiza? (futura y como mucho 400 días). */
export function retentionMaxError(maxDate: string | null, today: string): string | null {
  if (!maxDate || !validDate(maxDate)) return 'Indica hasta qué fecha conservarás los datos delicados.'
  if (maxDate <= today) return 'La fecha de conservación tiene que ser posterior a hoy.'
  if (daysBetween(today, maxDate) > MAX_RETENTION_DAYS) return `La conservación no puede pasar de ${MAX_RETENTION_DAYS} días.`
  return null
}

/**
 * Fecha en que se eliminan los datos delicados de UNA respuesta: la que fijó quien organiza (máximo) o una anterior que elija quien responde.
 * Una fecha elegida posterior al máximo se recorta al máximo; una fecha pasada se ignora (se usa el máximo).
 */
export function retentionExpiry(maxDate: string, chosen: string | null, today: string): string {
  if (chosen && validDate(chosen) && chosen > today) return chosen < maxDate ? chosen : maxDate
  return maxDate
}

/** Rutas de archivo permitidas en una subida. */
export const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
}
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

/** Texto organizado para las Notas de una ficha: una cabecera con referencia al formulario y una línea por pregunta (nunca datos delicados ni archivos). */
export function notesBlock(formTitle: string, dateLabel: string, responseId: string, fields: FormField[], answers: Record<string, AnswerValue>): string {
  const lines: string[] = []
  for (const f of fields) {
    if (f.sensitive || f.type === 'archivo' || f.mapsTo) continue
    const v = answers[f.id]
    if (v === undefined) continue
    const shown = Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Sí' : 'No') : String(v)
    lines.push(`${f.label}: ${shown}`)
  }
  if (lines.length === 0) return ''
  return [`— Formulario «${formTitle}» (${dateLabel}) [${responseId.slice(0, 8)}] —`, ...lines].join('\n')
}
