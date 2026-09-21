// Periodos de tiempo de las consultas de Economía por voz ("este mes", "el mes pasado", "desde
// junio", "en agosto", "últimos 30 días"...). TODO con reglas: la IA nunca decide qué periodo se pide.
//
// Los meses son los MISMOS que ve la familia en Economía: el mes contable con el día de inicio
// configurado (accountingMonthRange). Las fechas de hoy se leen del reloj del sistema, igual que
// en el resto de Economía.
import { accountingMonthRange, toDateStr } from '@/domain/dateRanges'
import { MONTHS } from '@/domain/spokenDate'
import { normalize } from '@/domain/voiceQuery'

export type PeriodSpec =
  | { t: 'day'; offset: 0 | -1 }
  | { t: 'week'; offset: 0 | -1 }
  | { t: 'month'; offset: number }
  // Un mes concreto dicho por nombre; sin año se elige el más razonable (ver resolveYear).
  | { t: 'month_named'; month0: number; year: number }
  | { t: 'year'; offset: 0 | -1 }
  | { t: 'since_month'; month0: number; year: number }
  | { t: 'last_days'; n: number }
  | { t: 'last_months'; n: number }

export interface ResolvedPeriod {
  spec: PeriodSpec
  from: string
  to: string
  label: string
  // El periodo todavía no ha terminado: "este mes" a día 20.
  ongoing: boolean
}

const NUMBER_WORDS: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, quince: 15, veinte: 20, treinta: 30 }
const MONTH_RE = MONTHS.join('|')

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return toDateStr(new Date(y, m - 1, d + days))
}

export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number)
  const [y2, m2, d2] = to.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

// Un mes sin año: el más reciente que no sea futuro. "agosto" en septiembre de 2026 = agosto de
// 2026; "diciembre" en septiembre de 2026 = diciembre de 2025 (y así se dice en la respuesta).
function resolveYear(month0: number, explicit: number | null, today: Date): number {
  if (explicit) return explicit
  return month0 <= today.getMonth() ? today.getFullYear() : today.getFullYear() - 1
}

export interface PeriodMatch {
  spec: PeriodSpec
  // El texto sin la parte que decía el periodo (para sacar de lo que queda una categoría o tienda).
  rest: string
}

function cut(n: string, m: RegExpExecArray): string {
  return (n.slice(0, m.index) + ' ' + n.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim()
}

// `text` ya normalizado (sin acentos, minúsculas, sin signos).
export function extractPeriod(text: string, today: Date): PeriodMatch | null {
  let m = new RegExp(`\\b(?:desde|a partir de)\\s+(?:el\\s+(?:mes\\s+de\\s+)?|mes\\s+de\\s+)?(${MONTH_RE})(?:\\s+(?:de\\s+)?(\\d{4}))?\\b`).exec(text)
  if (m) {
    const month0 = MONTHS.indexOf(m[1])
    return { spec: { t: 'since_month', month0, year: resolveYear(month0, m[2] ? Number(m[2]) : null, today) }, rest: cut(text, m) }
  }

  m = /\bultim[oa]s\s+(\d{1,3}|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince|veinte|treinta)\s+(dias?|semanas?|meses|mes)\b/.exec(text)
  if (m) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]]
    const unit = m[2]
    if (n >= 1 && n <= 366) {
      if (unit.startsWith('dia')) return { spec: { t: 'last_days', n }, rest: cut(text, m) }
      if (unit.startsWith('semana')) return { spec: { t: 'last_days', n: n * 7 }, rest: cut(text, m) }
      return { spec: { t: 'last_months', n }, rest: cut(text, m) }
    }
  }

  const relative: [RegExp, PeriodSpec][] = [
    [/\b(?:el\s+)?mes\s+(?:pasado|anterior)\b/, { t: 'month', offset: -1 }],
    [/\b(?:este|el presente)\s+mes\b|\beste mes\b/, { t: 'month', offset: 0 }],
    [/\b(?:la\s+)?semana\s+(?:pasada|anterior)\b/, { t: 'week', offset: -1 }],
    [/\besta\s+semana\b/, { t: 'week', offset: 0 }],
    [/\b(?:el\s+)?ano\s+(?:pasado|anterior)\b/, { t: 'year', offset: -1 }],
    [/\beste\s+ano\b|\bdurante\s+el\s+ano\b/, { t: 'year', offset: 0 }],
    [/\bhoy\b/, { t: 'day', offset: 0 }],
    [/\bayer\b/, { t: 'day', offset: -1 }],
  ]
  for (const [re, spec] of relative) {
    const r = re.exec(text)
    if (r) return { spec, rest: cut(text, r) }
  }

  m = new RegExp(`\\b(?:en|durante|de|del)?\\s*(?:el\\s+mes\\s+de\\s+)?(${MONTH_RE})(?:\\s+(?:de\\s+)?(\\d{4}))?\\b`).exec(text)
  if (m) {
    const month0 = MONTHS.indexOf(m[1])
    return { spec: { t: 'month_named', month0, year: resolveYear(month0, m[2] ? Number(m[2]) : null, today) }, rest: cut(text, m) }
  }
  return null
}

export function parsePeriodText(text: string, today: Date): PeriodMatch | null {
  return extractPeriod(
    normalize(text)
      .replace(/[¿?¡!.,;:]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    today,
  )
}

function monthLabel(month0: number, year: number, today: Date): string {
  return year === today.getFullYear() ? MONTHS[month0] : `${MONTHS[month0]} de ${year}`
}

// Desplazamiento en meses contables de un (año, mes) respecto al mes contable de hoy.
function accountingOffset(year: number, month0: number, monthStartDay: number): number {
  const current = accountingMonthRange(monthStartDay, 0)
  return year * 12 + month0 - (current.labelYear * 12 + current.labelMonth0)
}

export function resolvePeriod(spec: PeriodSpec, today: Date, monthStartDay: number): ResolvedPeriod {
  const todayStr = toDateStr(today)
  const finish = (from: string, to: string, label: string): ResolvedPeriod => ({ spec, from, to, label, ongoing: to > todayStr && from <= todayStr })

  switch (spec.t) {
    case 'day': {
      const d = spec.offset === 0 ? todayStr : addDays(todayStr, -1)
      return finish(d, d, spec.offset === 0 ? 'hoy' : 'ayer')
    }
    case 'week': {
      const dow = (today.getDay() + 6) % 7
      const monday = addDays(todayStr, -dow + spec.offset * 7)
      return finish(monday, addDays(monday, 6), spec.offset === 0 ? 'esta semana' : 'la semana pasada')
    }
    case 'month': {
      const r = accountingMonthRange(monthStartDay, spec.offset)
      const label = spec.offset === 0 ? 'este mes' : spec.offset === -1 ? 'el mes pasado' : monthLabel(r.labelMonth0, r.labelYear, today)
      return finish(r.from, r.to, label)
    }
    case 'month_named': {
      const r = accountingMonthRange(monthStartDay, accountingOffset(spec.year, spec.month0, monthStartDay))
      return finish(r.from, r.to, monthLabel(spec.month0, spec.year, today))
    }
    case 'year': {
      const y = today.getFullYear() + spec.offset
      return finish(`${y}-01-01`, `${y}-12-31`, spec.offset === 0 ? 'este año' : 'el año pasado')
    }
    case 'since_month': {
      const from = `${spec.year}-${pad2(spec.month0 + 1)}-01`
      return { spec, from, to: todayStr, label: `desde ${monthLabel(spec.month0, spec.year, today)}`, ongoing: true }
    }
    case 'last_days': {
      return { spec, from: addDays(todayStr, -(spec.n - 1)), to: todayStr, label: `los últimos ${spec.n} días`, ongoing: true }
    }
    case 'last_months': {
      const first = accountingMonthRange(monthStartDay, -(spec.n - 1))
      return { spec, from: first.from, to: todayStr, label: spec.n === 1 ? 'el último mes' : `los últimos ${spec.n} meses`, ongoing: true }
    }
  }
}

export interface ComparePeriods {
  current: { from: string; to: string }
  previous: { from: string; to: string }
  previousLabel: string
  // true = se compara el mismo tramo (1-20 contra 1-20), no el periodo anterior completo.
  cutoff: boolean
}

// Con qué se compara un periodo. REGLA DE CORTE: si el periodo actual no ha terminado (este mes a
// día 20), se compara lo que va (1-20) con el MISMO tramo del anterior (1-20 del mes pasado), no con
// el mes pasado entero — así no sale "gastáis menos" solo porque el mes no ha acabado.
// Con `full` (piden meses completos) o con un periodo ya cerrado se comparan periodos enteros.
export function comparablePrevious(period: ResolvedPeriod, today: Date, monthStartDay: number, full = false): ComparePeriods {
  const todayStr = toDateStr(today)
  const spec = period.spec
  let prev: { from: string; to: string }
  let previousLabel: string

  switch (spec.t) {
    case 'day': {
      const d = addDays(period.from, -1)
      prev = { from: d, to: d }
      previousLabel = 'el día anterior'
      break
    }
    case 'week': {
      prev = { from: addDays(period.from, -7), to: addDays(period.to, -7) }
      previousLabel = 'la semana anterior'
      break
    }
    case 'month':
    case 'month_named': {
      const off = spec.t === 'month' ? spec.offset : accountingOffset(spec.year, spec.month0, monthStartDay)
      const r = accountingMonthRange(monthStartDay, off - 1)
      prev = { from: r.from, to: r.to }
      previousLabel = 'el mes anterior'
      break
    }
    case 'year': {
      const y = Number(period.from.slice(0, 4)) - 1
      prev = { from: `${y}-01-01`, to: `${y}-12-31` }
      previousLabel = 'el año anterior'
      break
    }
    case 'since_month':
    case 'last_days':
    case 'last_months': {
      const len = daysBetween(period.from, period.to) + 1
      prev = { from: addDays(period.from, -len), to: addDays(period.from, -1) }
      previousLabel = 'el tramo anterior de la misma duración'
      break
    }
  }

  let current = { from: period.from, to: period.to }
  let cutoff = false
  if (!full && period.ongoing && (spec.t === 'month' || spec.t === 'month_named' || spec.t === 'week' || spec.t === 'year')) {
    // Días transcurridos del periodo actual (incluido hoy) aplicados al anterior.
    const elapsed = daysBetween(period.from, todayStr)
    current = { from: period.from, to: todayStr }
    const prevEnd = addDays(prev.from, elapsed)
    prev = { from: prev.from, to: prevEnd < prev.to ? prevEnd : prev.to }
    cutoff = true
  }
  return { current, previous: prev, previousLabel, cutoff }
}

// Comparar contra un periodo concreto elegido por la persona ("¿y comparado con agosto?"), con la misma
// regla de corte: si el actual no ha terminado, se compara el mismo tramo de días del periodo elegido.
export function comparableAgainst(period: ResolvedPeriod, baseline: ResolvedPeriod, today: Date, full = false): ComparePeriods {
  const todayStr = toDateStr(today)
  let current = { from: period.from, to: period.to }
  let previous = { from: baseline.from, to: baseline.to }
  let cutoff = false
  const t = period.spec.t
  if (!full && period.ongoing && (t === 'month' || t === 'month_named' || t === 'week' || t === 'year')) {
    const elapsed = daysBetween(period.from, todayStr)
    current = { from: period.from, to: todayStr }
    const end = addDays(baseline.from, elapsed)
    previous = { from: baseline.from, to: end < baseline.to ? end : baseline.to }
    cutoff = true
  }
  return { current, previous, previousLabel: baseline.label, cutoff }
}
