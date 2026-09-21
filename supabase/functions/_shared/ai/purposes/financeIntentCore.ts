// Núcleo PURO (sin APIs de Deno) de la interpretación de preguntas de Economía con IA. Lo usan las DOS partes
// (el servidor y la app), así la comprobación es exactamente la misma.
//
// La IA SOLO CLASIFICA Y ESTRUCTURA una frase que las reglas no han sabido entender: devuelve la intención,
// el periodo y un filtro. NUNCA calcula dinero ni ve datos financieros: solo recibe la frase de la persona
// (con los nombres de familiares cambiados por alias) y la fecha de hoy. Lo que devuelve se valida aquí y,
// después, EL CÓDIGO lo resuelve contra los datos reales (categorías, tiendas, conceptos) y hace los cálculos.

export const FINANCE_INTENTS = [
  'finance_spend_query',
  'finance_income_query',
  'finance_savings_query',
  'finance_top_categories',
  'finance_compare',
  'finance_why',
  'finance_analysis',
  'finance_cuts',
  'finance_changes',
  'finance_attention',
  'finance_savings_trend',
  'finance_price_up',
  'finance_price_down',
  'finance_cheapest_store',
  'none',
] as const
export type FinanceIntentName = (typeof FINANCE_INTENTS)[number]

export const INTENT_PERIODS = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'this_year', 'last_year', 'last_30_days', 'last_3_months', 'named_month', 'since_month'] as const
export type IntentPeriod = (typeof INTENT_PERIODS)[number]

export const FILTER_TYPES = ['category', 'store', 'concept', 'product'] as const
export type IntentFilterType = (typeof FILTER_TYPES)[number]

export interface IntentOutput {
  intent: FinanceIntentName
  period: IntentPeriod | null
  // 1-12, solo con named_month / since_month.
  month: number | null
  year: number | null
  filterType: IntentFilterType | null
  filter: string | null
  premise: 'more' | 'less' | null
}

export interface IntentRequest {
  text: string
  today: string
}

const MAX_TEXT = 220
const MAX_FILTER = 40

export function plain(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function hasControlChars(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) < 32) return true
  }
  return false
}

const IBAN_RE = /\b[A-Za-z]{2}\d{2}[A-Za-z0-9]{10,30}\b/
const EMAIL_RE = /\S+@\S+\.\S+/
const LONG_NUMBER_RE = /\d{9,}/

// La entrada: solo la frase y la fecha. Nada que parezca un IBAN, un correo o un identificador largo.
export function readIntentRequest(body: Record<string, unknown>): { ok: true; input: IntentRequest } | { ok: false; error: string } {
  const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim() : ''
  if (text.length < 3 || text.length > MAX_TEXT || hasControlChars(text)) return { ok: false, error: 'invalid text' }
  if (IBAN_RE.test(text) || EMAIL_RE.test(text) || LONG_NUMBER_RE.test(text)) return { ok: false, error: 'sensitive data' }
  const today = body.today
  if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return { ok: false, error: 'invalid today' }
  return { ok: true, input: { text, today } }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

// La respuesta de la IA. null = no válida (se descarta y PEPA lo dice sin adivinar).
//  - todo con valores de listas cerradas;
//  - el filtro debe estar EN la frase de la persona (cada palabra suya aparece en ella): la IA no puede
//    inventarse una categoría, una tienda ni un concepto que la persona no ha dicho.
export function validateIntentOutput(raw: unknown, text: string): IntentOutput | null {
  const rec = asRecord(raw)
  if (!rec) return null
  if (typeof rec.intent !== 'string' || !(FINANCE_INTENTS as readonly string[]).includes(rec.intent)) return null

  let period: IntentPeriod | null = null
  if (rec.period !== null && rec.period !== undefined) {
    if (typeof rec.period !== 'string' || !(INTENT_PERIODS as readonly string[]).includes(rec.period)) return null
    period = rec.period as IntentPeriod
  }
  let month: number | null = null
  if (rec.month !== null && rec.month !== undefined) {
    if (typeof rec.month !== 'number' || !Number.isInteger(rec.month) || rec.month < 1 || rec.month > 12) return null
    month = rec.month
  }
  let year: number | null = null
  if (rec.year !== null && rec.year !== undefined) {
    if (typeof rec.year !== 'number' || !Number.isInteger(rec.year) || rec.year < 2000 || rec.year > 2100) return null
    year = rec.year
  }
  if ((period === 'named_month' || period === 'since_month') && month === null) return null
  if (period !== 'named_month' && period !== 'since_month') {
    month = null
    year = null
  }

  let filterType: IntentFilterType | null = null
  if (rec.filterType !== null && rec.filterType !== undefined) {
    if (typeof rec.filterType !== 'string' || !(FILTER_TYPES as readonly string[]).includes(rec.filterType)) return null
    filterType = rec.filterType as IntentFilterType
  }
  let filter: string | null = null
  if (rec.filter !== null && rec.filter !== undefined) {
    if (typeof rec.filter !== 'string') return null
    const f = rec.filter.replace(/\s+/g, ' ').trim()
    if (f.length < 2 || f.length > MAX_FILTER || hasControlChars(f) || !/^[\p{L}\p{N} ]+$/u.test(f)) return null
    const said = new Set(plain(text).split(/[^a-z0-9ñ]+/).filter(Boolean))
    if (!plain(f).split(' ').every((w) => said.has(w))) return null
    filter = f
  }
  if ((filter === null) !== (filterType === null)) return null

  let premise: 'more' | 'less' | null = null
  if (rec.premise === 'more' || rec.premise === 'less') premise = rec.premise

  return { intent: rec.intent as FinanceIntentName, period, month, year, filterType, filter, premise }
}
