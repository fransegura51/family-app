// Núcleo PURO (sin APIs de Deno) de la interpretación de peticiones de PRESUPUESTO con IA. Lo usan las DOS
// partes (el servidor y la app), así la comprobación es exactamente la misma.
//
// La IA SOLO ESTRUCTURA la frase (qué presupuesto, de qué categoría, cuánto y para qué periodo): nunca escribe
// nada ni ve datos financieros. Solo recibe la frase (con alias en los nombres de familiares) y la fecha.
// Lo que devuelve se valida aquí:
//   - el importe tiene que ser uno de los números que la persona ha DICHO (amountsIn): la IA no puede
//     inventarlo ni "corregirlo";
//   - las palabras de la categoría tienen que estar en la frase.
// Después EL CÓDIGO la resuelve contra las categorías reales, comprueba el presupuesto existente y prepara la
// tarjeta de confirmación. Nada se guarda sin que la persona la confirme.

export const BUDGET_INTENTS = ['budget_set', 'none'] as const
export type BudgetIntentName = (typeof BUDGET_INTENTS)[number]

export const BUDGET_PERIODS = ['this_month', 'next_month', 'monthly', 'weekly', 'other'] as const
export type BudgetPeriodName = (typeof BUDGET_PERIODS)[number]

export interface BudgetIntentOutput {
  intent: BudgetIntentName
  // Palabras de la categoría tal como las dijo la persona; null si no dijo ninguna (o es un presupuesto general).
  category: string | null
  general: boolean
  amount: number | null
  period: BudgetPeriodName | null
}

export const MAX_BUDGET_AMOUNT = 1_000_000

export function plain(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

// ─── Importes dichos en la frase: cifras ("300", "1.500,50", "300€") y palabras ("trescientos") ───

const UNITS: Record<string, number> = {
  cero: 0, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13,
  catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21,
  veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
}
const ONES: Record<string, number> = { un: 1, uno: 1, una: 1 }
const TENS: Record<string, number> = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 }
const HUNDREDS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400,
  quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700, ochocientos: 800,
  ochocientas: 800, novecientos: 900, novecientas: 900,
}

export function isNumberWord(w: string): boolean {
  return w in UNITS || w in ONES || w in TENS || w in HUNDREDS || w === 'mil' || w === 'y'
}

// "doscientos cincuenta" -> 250, "dos mil quinientos" -> 2500. null si no es un número bien formado.
function wordsValue(tokens: string[]): number | null {
  let total = 0
  let current = 0
  let seen = false
  for (const t of tokens) {
    if (t === 'y') continue
    seen = true
    if (t in HUNDREDS) current += HUNDREDS[t]
    else if (t in TENS) current += TENS[t]
    else if (t in UNITS) current += UNITS[t]
    else if (t in ONES) current += ONES[t]
    else if (t === 'mil') {
      total += (current === 0 ? 1 : current) * 1000
      current = 0
    }
  }
  return seen ? total + current : null
}

// "1.500" (miles) o "1.5"/"1,5" (decimal). Con los dos separadores, el último es el decimal.
function digitsValue(raw: string): number | null {
  let s = raw
  const dot = s.lastIndexOf('.')
  const comma = s.lastIndexOf(',')
  if (dot >= 0 && comma >= 0) {
    const decimalIsComma = comma > dot
    s = decimalIsComma ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (comma >= 0) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (dot >= 0) {
    s = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// Todos los importes distintos que aparecen en la frase, en el orden en que se dicen.
export function amountsIn(text: string): number[] {
  const t = plain(text).replace(/[¿?¡!;:]/g, ' ')
  const out: number[] = []
  const push = (n: number | null) => {
    if (n !== null && !out.includes(n)) out.push(n)
  }
  // Cifras (con "mil" detrás: "2 mil").
  const digitRe = /(?:^|[^\d.,])(\d+(?:[.,]\d+)*)(?![\d])(\s+mil\b)?/g
  for (const m of t.matchAll(digitRe)) {
    const v = digitsValue(m[1].replace(/[.,]+$/, ''))
    push(v === null ? null : m[2] ? v * 1000 : v)
  }
  // Palabras: tramos seguidos de palabras-número ("trescientos cincuenta"); un "un/una" suelto no es un importe.
  // "y" solo une decenas con unidades ("treinta y cinco").
  const tokens = t.replace(/\d[\d.,]*\s+mil\b/g, ' ').split(/[^a-z0-9ñ.,]+/).filter(Boolean)
  let run: string[] = []
  const flush = () => {
    if (run.length > 0 && !run.every((w) => w in ONES)) push(wordsValue(run))
    run = []
  }
  tokens.forEach((w, i) => {
    const next = tokens[i + 1]
    const unitNext = next !== undefined && (next in ONES || (next in UNITS && UNITS[next] < 10))
    if (w === 'y') {
      if (run.length > 0 && run[run.length - 1] in TENS && unitNext) run.push(w)
      else flush()
    } else if (isNumberWord(w)) run.push(w)
    else flush()
  })
  flush()
  return out
}

export function validAmount(n: number): boolean {
  return Number.isFinite(n) && n > 0 && n <= MAX_BUDGET_AMOUNT && Math.round(n * 100) / 100 === n
}

// ─── Petición a la IA ───

export interface BudgetIntentRequest {
  text: string
  today: string
}

const MAX_TEXT = 220
const MAX_CATEGORY = 40
const IBAN_RE = /\b[A-Za-z]{2}\d{2}[A-Za-z0-9]{10,30}\b/
const EMAIL_RE = /\S+@\S+\.\S+/
const LONG_NUMBER_RE = /\d{9,}/

function hasControlChars(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) < 32) return true
  }
  return false
}

export function readBudgetIntentRequest(body: Record<string, unknown>): { ok: true; input: BudgetIntentRequest } | { ok: false; error: string } {
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

// null = no válida (se descarta y PEPA lo dice sin adivinar).
export function validateBudgetIntentOutput(raw: unknown, text: string): BudgetIntentOutput | null {
  const rec = asRecord(raw)
  if (!rec) return null
  if (typeof rec.intent !== 'string' || !(BUDGET_INTENTS as readonly string[]).includes(rec.intent)) return null
  if (rec.intent === 'none') return { intent: 'none', category: null, general: false, amount: null, period: null }

  let category: string | null = null
  if (rec.category !== null && rec.category !== undefined) {
    if (typeof rec.category !== 'string') return null
    const c = rec.category.replace(/\s+/g, ' ').trim()
    if (c.length < 2 || c.length > MAX_CATEGORY || hasControlChars(c) || !/^[\p{L}\p{N} ]+$/u.test(c)) return null
    const said = new Set(plain(text).split(/[^a-z0-9ñ]+/).filter(Boolean))
    if (!plain(c).split(' ').every((w) => said.has(w))) return null
    category = c
  }

  let amount: number | null = null
  if (rec.amount !== null && rec.amount !== undefined) {
    if (typeof rec.amount !== 'number' || !validAmount(rec.amount)) return null
    // El importe tiene que ser uno de los que la persona dijo, tal cual.
    if (!amountsIn(text).includes(rec.amount)) return null
    amount = rec.amount
  }

  let period: BudgetPeriodName | null = null
  if (rec.period !== null && rec.period !== undefined) {
    if (typeof rec.period !== 'string' || !(BUDGET_PERIODS as readonly string[]).includes(rec.period)) return null
    period = rec.period as BudgetPeriodName
  }
  const general = rec.general === true && category === null
  return { intent: 'budget_set', category, general, amount, period }
}
