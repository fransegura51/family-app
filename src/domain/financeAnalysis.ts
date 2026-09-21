// Motor de análisis de Economía de PEPA (SOLO LECTURA). Un único motor para todo:
//   - 💬 Hablar con PEPA ("analiza nuestros gastos", "¿dónde gastamos más?", "¿qué podríamos recortar?"...)
//   - y, más adelante, Economía → Conclusiones de PEPA: `buildAnalysis` + `overviewFindings` devuelven
//     datos estructurados (no texto de una pantalla), listos para pintarse en cualquier sitio.
//
// CÓDIGO CALCULA: todo lo numérico sale de aquí, con las mismas funciones que el resto de Economía
// (financeCompute → budgetSpent/isInternalTransferCategory..., priceTrends.decomposeSpendChange...).
// Los umbrales de "lo que más ha cambiado" (5 €) y "estable" (3 %) son los de las Conclusiones de Pepa
// que ya enseña la pestaña Resumen, para que las dos digan lo mismo.
//
// Cada respuesta separa cuatro cosas, para no presentar una opinión como un hecho:
//   HECHO (lo que pasó) · COMPARACIÓN (contra qué) · INTERPRETACIÓN (qué parece explicarlo) ·
//   SUGERENCIA (algo que podríais REVISAR — nunca "recortad" ni asesoramiento financiero).
import { resolveCategoryClassification, resolveExpenseFixed, isFoodCategory } from '@/domain/finance'
import {
  categoryParentName,
  dayOf,
  formatEuros,
  formatPercent,
  hasAnyExpense,
  isRealIncome,
  signedEuros,
  spendingRows,
  sum,
  ticketChange,
  type FinanceData,
} from '@/domain/financeCompute'
import { comparableAgainst, comparablePrevious, type ComparePeriods, type ResolvedPeriod } from '@/domain/financePeriod'
import type { Expense } from '@/domain/types'
import { averagePricesByMonth, compareMonths } from '@/domain/priceTrends'
import { buildFoodReceiptIds, isFoodPurchase } from '@/domain/products'
import type { AnalysisFact, FactKind } from '../../supabase/functions/_shared/ai/purposes/financeAnalysisCore.ts'

// Mismos umbrales que Conclusiones de Pepa (FinanceScreen → ResumenTab).
export const MOVER_MIN_EUR = 5
export const STABLE_PCT = 3
const TOP_CATEGORIES = 6
const MIN_STORE_VISITS = 2

export interface CategoryChange {
  name: string
  amount: number
  previous: number
  difference: number
  // Porcentaje del gasto total del periodo (0-100).
  share: number
}

export interface LeafCategory {
  name: string
  amount: number
  previous: number
  necessity: 'debo' | 'necesito' | 'quiero' | null
  // true = gasto fijo, false = variable, null = sin clasificar.
  fixed: boolean | null
}

export interface Analysis {
  period: ResolvedPeriod
  cp: ComparePeriods
  hasPrevious: boolean
  expenses: { total: number; previous: number | null; difference: number | null; percentChange: number | null }
  income: { total: number; previous: number | null; registered: boolean; previousRegistered: boolean }
  // null = no se puede calcular (sin ingresos registrados en ese tramo).
  savings: { total: number | null; previous: number | null; rate: number | null }
  categories: CategoryChange[]
  newCategories: string[]
  leaf: LeafCategory[]
  necessity: { quiero: number; quieroShare: number | null }
  fixedVariable: { fixed: number; variable: number }
  // Solo se usa en local: nunca viaja a la IA.
  topStore: { name: string; count: number; amount: number } | null
  biggestExpense: { category: string; amount: number; date: string } | null
  priceAnalysis: { available: boolean; compared: number; risen: number; fallen: number }
  purchaseChange: { available: boolean; priceEffect: number; quantityEffect: number; newProducts: number; removedProducts: number; basketBefore: number; basketNow: number }
  dataQuality: { bankStale: boolean; foodTicketCoverage: number | null; warnings: string[] }
}

export interface AnalysisOptions {
  // "¿Y comparado con agosto?": el periodo con el que se compara (por defecto, el anterior).
  baseline?: ResolvedPeriod
  full?: boolean
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function leafTotals(rows: Expense[]): Map<string, number> {
  const by = new Map<string, number>()
  for (const e of rows) by.set(e.category, (by.get(e.category) ?? 0) + e.amount)
  return by
}

function topLevelTotals(rows: Expense[], data: FinanceData): Map<string, number> {
  const by = new Map<string, number>()
  for (const e of rows) {
    const key = categoryParentName(e.category, data.categories) ?? e.category
    by.set(key, (by.get(key) ?? 0) + e.amount)
  }
  return by
}

export function buildAnalysis(data: FinanceData, period: ResolvedPeriod, today: Date, opts: AnalysisOptions = {}): Analysis {
  const cp = opts.baseline ? comparableAgainst(period, opts.baseline, today, opts.full) : comparablePrevious(period, today, data.monthStartDay, opts.full)
  const nowRows = spendingRows(data, cp.current.from, cp.current.to)
  const prevRows = spendingRows(data, cp.previous.from, cp.previous.to)
  const hasPrevious = hasAnyExpense(data, cp.previous.from, cp.previous.to)

  const total = sum(nowRows)
  const previous = hasPrevious ? sum(prevRows) : null
  const difference = previous === null ? null : round2(total - previous)
  const percentChange = previous !== null && previous > 0 ? ((total - previous) / previous) * 100 : null

  // Ingresos y ahorro (mismo tramo en los dos periodos).
  const incomeRows = (from: string, to: string) => data.expenses.filter((e) => isRealIncome(e, data.categories) && e.expenseDate >= from && e.expenseDate <= to)
  const incomeNowRows = incomeRows(cp.current.from, cp.current.to)
  const incomePrevRows = incomeRows(cp.previous.from, cp.previous.to)
  const incomeNow = sum(incomeNowRows)
  const incomePrev = sum(incomePrevRows)
  const savingsNow = incomeNowRows.length > 0 ? round2(incomeNow - total) : null
  const savingsPrev = incomePrevRows.length > 0 && previous !== null ? round2(incomePrev - previous) : null

  // Categorías principales, con su cambio.
  const nowTop = topLevelTotals(nowRows, data)
  const prevTop = topLevelTotals(prevRows, data)
  const categories: CategoryChange[] = [...nowTop.entries()]
    .map(([name, amount]) => {
      const prev = prevTop.get(name) ?? 0
      return { name, amount: round2(amount), previous: round2(prev), difference: round2(amount - prev), share: total > 0 ? (amount / total) * 100 : 0 }
    })
    .sort((a, b) => b.amount - a.amount)
  const newCategories = hasPrevious ? [...nowTop.keys()].filter((n) => !prevTop.has(n)) : []

  // Categorías finas, con su clasificación (fijo/variable, quiero/necesito): para "qué revisar".
  const leafNow = leafTotals(nowRows)
  const leafPrev = leafTotals(prevRows)
  const leaf: LeafCategory[] = [...leafNow.entries()]
    .map(([name, amount]) => {
      const cls = resolveCategoryClassification(name, data.categories)
      return { name, amount: round2(amount), previous: round2(leafPrev.get(name) ?? 0), necessity: cls.necessity, fixed: cls.isFixed }
    })
    .sort((a, b) => b.amount - a.amount)

  const quiero = round2(nowRows.filter((e) => resolveCategoryClassification(e.category, data.categories).necessity === 'quiero').reduce((s, e) => s + e.amount, 0))
  const fixed = round2(nowRows.filter((e) => resolveExpenseFixed(e, data.categories) === true).reduce((s, e) => s + e.amount, 0))

  // Comercio más frecuente y gasto más alto (solo en local).
  const stores = new Map<string, { count: number; amount: number }>()
  for (const e of nowRows) {
    if (!e.store) continue
    const cur = stores.get(e.store) ?? { count: 0, amount: 0 }
    cur.count++
    cur.amount += e.amount
    stores.set(e.store, cur)
  }
  const topStoreEntry = [...stores.entries()].sort((a, b) => b[1].count - a[1].count)[0]
  const topStore = topStoreEntry && topStoreEntry[1].count >= MIN_STORE_VISITS ? { name: topStoreEntry[0], count: topStoreEntry[1].count, amount: round2(topStoreEntry[1].amount) } : null
  const biggest = [...nowRows].sort((a, b) => b.amount - a.amount)[0]

  // Precios y cambio de cesta (solo tickets; mismas funciones que Economía).
  const foodReceiptIds = buildFoodReceiptIds(data.receipts, data.categories)
  const nonFood = new Set(data.products.filter((p) => p.nonFood).map((p) => p.id))
  const change = ticketChange(data, cp)
  let priceAnalysis = { available: false, compared: 0, risen: 0, fallen: 0 }
  if (change) {
    const inWindow = (d: string, r: { from: string; to: string }) => d >= r.from && d <= r.to
    const raw = data.prices
      .filter((p) => isFoodPurchase(p, foodReceiptIds, nonFood) && (inWindow(p.recordedDate, cp.current) || inWindow(p.recordedDate, cp.previous)))
      .map((p) => ({ productId: p.productId, price: p.price, quantity: 1, recordedDate: inWindow(p.recordedDate, cp.current) ? '2000-02-01' : '2000-01-01' }))
    const moves = compareMonths(averagePricesByMonth(raw), '2000-02', '2000-01').filter((c) => c.previousPrice != null && c.deltaPercent != null)
    priceAnalysis = {
      available: moves.length > 0,
      compared: moves.length,
      risen: moves.filter((c) => (c.deltaPercent as number) >= 0.5).length,
      fallen: moves.filter((c) => (c.deltaPercent as number) <= -0.5).length,
    }
  }
  const purchaseChange = change
    ? {
        available: true,
        priceEffect: round2(change.bd.priceEffect),
        quantityEffect: round2(change.bd.quantityEffect),
        newProducts: round2(change.bd.newProductsEffect),
        removedProducts: round2(change.bd.droppedProductsEffect),
        basketBefore: round2(change.bd.previousTotal),
        basketNow: round2(change.bd.currentTotal),
      }
    : { available: false, priceEffect: 0, quantityEffect: 0, newProducts: 0, removedProducts: 0, basketBefore: 0, basketNow: 0 }

  // Calidad de los datos: qué no se puede afirmar.
  const foodRows = nowRows.filter((e) => isFoodCategory(e.category, data.categories))
  const foodTotal = sum(foodRows)
  const foodWithTicket = sum(foodRows.filter((e) => e.source === 'ticket' || e.source === 'ticket_banco'))
  const foodTicketCoverage = foodTotal > 0 ? (foodWithTicket / foodTotal) * 100 : null
  const warnings: string[] = []
  if (data.bankStale) warnings.push('Hay una conexión bancaria caducada: puede faltar gasto reciente.')
  if (!hasPrevious) warnings.push('No hay gastos registrados en el periodo con el que comparar.')
  if (incomeNowRows.length === 0) warnings.push('No hay ingresos registrados en el periodo: no se puede calcular el ahorro.')
  if (!change) warnings.push('No hay tickets suficientes en los dos periodos para saber si el cambio viene de precios o de cantidades.')
  else if (foodTicketCoverage !== null && foodTicketCoverage < 50) warnings.push('Menos de la mitad del gasto en alimentación tiene ticket: el análisis de compras es parcial.')

  return {
    period,
    cp,
    hasPrevious,
    expenses: { total, previous, difference, percentChange },
    income: { total: incomeNow, previous: incomePrevRows.length > 0 ? incomePrev : null, registered: incomeNowRows.length > 0, previousRegistered: incomePrevRows.length > 0 },
    savings: { total: savingsNow, previous: savingsPrev, rate: savingsNow !== null && incomeNow > 0 ? (savingsNow / incomeNow) * 100 : null },
    categories,
    newCategories,
    leaf,
    necessity: { quiero, quieroShare: total > 0 && quiero > 0 ? (quiero / total) * 100 : null },
    fixedVariable: { fixed, variable: round2(total - fixed) },
    topStore,
    biggestExpense: biggest ? { category: biggest.category, amount: biggest.amount, date: biggest.expenseDate } : null,
    priceAnalysis,
    purchaseChange,
    dataQuality: { bankStale: data.bankStale, foodTicketCoverage, warnings },
  }
}

// ─── Hallazgos (texto compuesto por código) ───

export type FindingKind = 'fact' | 'comparison' | 'interpretation' | 'suggestion' | 'warning'
export interface Finding {
  kind: FindingKind
  text: string
}

export function renderFindings(findings: Finding[]): string {
  return findings.map((f) => f.text).join('\n')
}

function who(a: Analysis): string {
  return a.period.ongoing ? 'lleváis' : 'habéis gastado'
}

function whenLead(a: Analysis): string {
  const t = a.period.spec.t
  const label = a.period.label
  const cap = label.charAt(0).toUpperCase() + label.slice(1)
  return t === 'month_named' || t === 'last_days' || t === 'last_months' ? `En ${label}` : cap
}

// "el mismo tramo del mes anterior" / "el mismo tramo de agosto" (comparando 1-20 con 1-20).
function tramoLabel(cp: ComparePeriods): string {
  if (!cp.cutoff) return cp.previousLabel
  if (cp.previousLabel.startsWith('el ')) return `el mismo tramo del ${cp.previousLabel.slice(3)}`
  if (cp.previousLabel.startsWith('la ')) return `el mismo tramo de la ${cp.previousLabel.slice(3)}`
  return `el mismo tramo de ${cp.previousLabel}`
}

function baselineLabel(a: Analysis): string {
  return tramoLabel(a.cp)
}

// "a el mismo tramo" -> "al mismo tramo"; "a agosto" se queda.
function aLabel(label: string): string {
  return label.startsWith('el ') ? `al ${label.slice(3)}` : `a ${label}`
}

function spanNote(a: Analysis): string {
  return a.cp.cutoff ? ` (del ${dayOf(a.cp.current.from)} al ${dayOf(a.cp.current.to)})` : ''
}

// El mayor aumento y la mayor bajada entre categorías principales (umbral de Economía).
export function categoryMovers(a: Analysis): { rise: CategoryChange | null; fall: CategoryChange | null } {
  const moved = a.categories.filter((c) => Math.abs(c.difference) >= MOVER_MIN_EUR)
  const rise = [...moved].filter((c) => c.difference > 0).sort((x, y) => y.difference - x.difference)[0] ?? null
  const fall = [...moved].filter((c) => c.difference < 0).sort((x, y) => x.difference - y.difference)[0] ?? null
  return { rise, fall }
}

function dataWarnings(a: Analysis, only: 'bank' | 'all' = 'all'): Finding[] {
  const list = only === 'bank' ? a.dataQuality.warnings.filter((w) => w.startsWith('Hay una conexión')) : a.dataQuality.warnings
  return list.map((text) => ({ kind: 'warning' as const, text }))
}

function noData(a: Analysis): Finding[] | null {
  if (a.expenses.total === 0 && !a.hasPrevious) return [{ kind: 'warning', text: `No tengo gastos registrados ${a.period.label} para analizar.` }, ...dataWarnings(a, 'bank')]
  return null
}

// HECHO + COMPARACIÓN de la cabecera.
function headline(a: Analysis): Finding[] {
  const out: Finding[] = [{ kind: 'fact', text: `${whenLead(a)}${spanNote(a)} ${who(a)} ${formatEuros(a.expenses.total)} de gasto registrado.` }]
  if (a.expenses.difference !== null && a.expenses.previous !== null) {
    const d = a.expenses.difference
    const pct = a.expenses.percentChange
    if (pct !== null && Math.abs(pct) < STABLE_PCT) {
      out.push({ kind: 'comparison', text: `Es prácticamente lo mismo que ${baselineLabel(a)} (${formatEuros(a.expenses.previous)}).` })
    } else {
      out.push({
        kind: 'comparison',
        text: `${d === 0 ? 'Es lo mismo' : `Son ${formatEuros(Math.abs(d))} ${d > 0 ? 'más' : 'menos'}${pct !== null ? ` (${formatPercent(pct)})` : ''}`} que ${baselineLabel(a)} (${formatEuros(a.expenses.previous)}).`,
      })
    }
  } else {
    out.push({ kind: 'warning', text: 'No tengo gastos del periodo anterior con los que comparar.' })
  }
  return out
}

function topLine(a: Analysis, n = 3): Finding | null {
  const top = a.categories.slice(0, n)
  if (top.length === 0) return null
  return { kind: 'fact', text: `Lo que más pesa: ${top.map((c) => `${c.name} ${formatEuros(c.amount)} (${Math.round(c.share)} %)`).join(', ')}.` }
}

function moversLines(a: Analysis): Finding[] {
  if (!a.hasPrevious) return []
  const { rise, fall } = categoryMovers(a)
  const out: Finding[] = []
  if (rise) out.push({ kind: 'comparison', text: `Lo que más ha subido: ${rise.name} ${signedEuros(rise.difference)} (de ${formatEuros(rise.previous)} a ${formatEuros(rise.amount)}).` })
  if (fall) out.push({ kind: 'comparison', text: `Lo que más ha bajado: ${fall.name} ${signedEuros(fall.difference)} (de ${formatEuros(fall.previous)} a ${formatEuros(fall.amount)}).` })
  if (!rise && !fall) out.push({ kind: 'comparison', text: `Ninguna categoría ha cambiado más de ${formatEuros(MOVER_MIN_EUR)} respecto ${aLabel(baselineLabel(a))}.` })
  return out
}

// INTERPRETACIÓN: prudente, "parece", siempre apoyada en un número.
function interpretation(a: Analysis): Finding[] {
  const d = a.expenses.difference
  if (d === null || d === 0 || (a.expenses.percentChange !== null && Math.abs(a.expenses.percentChange) < STABLE_PCT)) return []
  const { rise, fall } = categoryMovers(a)
  const driver = d > 0 ? rise : fall
  if (!driver) return []
  const explained = Math.min(1, Math.abs(driver.difference) / Math.abs(d))
  if (explained < 0.5) return [{ kind: 'interpretation', text: `El ${d > 0 ? 'aumento' : 'descenso'} está repartido entre varias categorías; ninguna lo explica por sí sola.` }]
  return [{ kind: 'interpretation', text: `${driver.name} explica una parte importante del ${d > 0 ? 'aumento' : 'descenso'} (${formatEuros(Math.abs(driver.difference))} de ${formatEuros(Math.abs(d))}).` }]
}

function savingsLine(a: Analysis): Finding {
  if (a.savings.total === null) return { kind: 'warning', text: `No tengo ingresos registrados ${a.period.label}: no calculo el ahorro.` }
  const s = a.savings.total
  const base = `Ingresos ${formatEuros(a.income.total)} y gastos ${formatEuros(a.expenses.total)}: ${s >= 0 ? `ahorro de ${formatEuros(s)}` : `habéis gastado ${formatEuros(Math.abs(s))} más de lo ingresado`}.`
  return { kind: 'fact', text: base }
}

function ticketLine(a: Analysis): Finding {
  const p = a.purchaseChange
  if (!p.available) return { kind: 'warning', text: 'En los tickets que tengo registrados no hay todavía suficiente histórico para afirmar que el cambio venga de subidas o bajadas de precio.' }
  const delta = p.basketNow - p.basketBefore
  return {
    kind: 'interpretation',
    text: `En la cesta de tickets (${formatEuros(p.basketBefore)} → ${formatEuros(p.basketNow)}, ${signedEuros(delta)}): por precios ${signedEuros(p.priceEffect)}, por cantidades ${signedEuros(p.quantityEffect)}, productos nuevos ${signedEuros(p.newProducts)} y dejados de comprar ${signedEuros(p.removedProducts)}. Es una aproximación basada en tickets.`,
  }
}

// "Analiza nuestros gastos": versión de código de toda la conversación. También es la salida de
// reserva cuando la IA no está disponible, y lo que usará Economía → Conclusiones de PEPA.
export function overviewFindings(a: Analysis): Finding[] {
  const empty = noData(a)
  if (empty) return empty
  const out: Finding[] = [...headline(a)]
  const top = topLine(a)
  if (top) out.push(top)
  out.push(...moversLines(a))
  out.push(...interpretation(a))
  out.push(savingsLine(a))
  out.push(ticketLine(a))
  out.push(...dataWarnings(a, 'bank'))
  return out
}

// "¿En qué se nos está yendo el dinero?" / "¿Dónde estamos gastando más?"
export function whereMoneyFindings(a: Analysis): Finding[] {
  const empty = noData(a)
  if (empty) return empty
  const top = a.categories.slice(0, 4)
  const out: Finding[] = [{ kind: 'fact', text: `${whenLead(a)}${spanNote(a)} ${who(a)} ${formatEuros(a.expenses.total)}. Por categorías:` }]
  for (const c of top) out.push({ kind: 'fact', text: `${c.name}: ${formatEuros(c.amount)} (${Math.round(c.share)} %)` })
  const lead = a.leaf[0]
  if (lead && lead.name !== top[0]?.name) out.push({ kind: 'fact', text: `Dentro de eso, lo más alto es ${lead.name}, con ${formatEuros(lead.amount)}.` })
  if (a.topStore) out.push({ kind: 'fact', text: `El comercio más frecuente es ${a.topStore.name}: ${a.topStore.count} compras (${formatEuros(a.topStore.amount)}).` })
  out.push(...dataWarnings(a, 'bank'))
  return out
}

// "¿Qué categoría ha aumentado más?"
export function topIncreaseFindings(a: Analysis): Finding[] {
  const empty = noData(a)
  if (empty) return empty
  if (!a.hasPrevious) return [{ kind: 'warning', text: `No tengo gastos en ${a.cp.previousLabel} con los que comparar.` }]
  const { rise } = categoryMovers(a)
  if (!rise) return [{ kind: 'comparison', text: `Ninguna categoría ha subido más de ${formatEuros(MOVER_MIN_EUR)} respecto ${aLabel(baselineLabel(a))}.` }, ...dataWarnings(a, 'bank')]
  const out: Finding[] = [
    { kind: 'comparison', text: `La categoría que más ha aumentado es ${rise.name}: ${signedEuros(rise.difference)} (de ${formatEuros(rise.previous)} a ${formatEuros(rise.amount)})${rise.previous > 0 ? `, ${formatPercent((rise.difference / rise.previous) * 100)}` : ''}.` },
  ]
  if (a.expenses.difference !== null && a.expenses.difference > 0) out.push(...interpretation(a))
  out.push(...dataWarnings(a, 'bank'))
  return out
}

// "¿Qué ha cambiado respecto al mes pasado?"
export function changesFindings(a: Analysis): Finding[] {
  const empty = noData(a)
  if (empty) return empty
  const out: Finding[] = [...headline(a), ...moversLines(a), ...interpretation(a)]
  if (a.newCategories.length > 0) out.push({ kind: 'fact', text: `Categorías con gasto ahora y sin gasto en el periodo anterior: ${a.newCategories.slice(0, 3).join(', ')}.` })
  if (a.savings.total !== null && a.savings.previous !== null) {
    const d = round2(a.savings.total - a.savings.previous)
    out.push({ kind: 'comparison', text: `Ahorro: ${formatEuros(a.savings.total)} frente a ${formatEuros(a.savings.previous)} (${d === 0 ? 'igual' : `${formatEuros(Math.abs(d))} ${d > 0 ? 'más' : 'menos'}`}).` })
  }
  out.push(ticketLine(a), ...dataWarnings(a, 'bank'))
  return out
}

// "¿Estamos ahorrando más o menos?" — con corrección de premisa: `premise` es lo que da por hecho la
// pregunta ("¿por qué estamos ahorrando MENOS?"); si los datos dicen otra cosa, se dice.
export function savingsTrendFindings(a: Analysis, premise: 'more' | 'less' | null = null): Finding[] {
  if (a.savings.total === null) return [{ kind: 'warning', text: `No tengo ingresos registrados ${a.period.label}: no puedo calcular el ahorro.` }, ...dataWarnings(a, 'bank')]
  if (a.savings.previous === null) return [savingsLine(a), { kind: 'warning', text: 'No tengo ingresos y gastos del periodo anterior para saber si ahorráis más o menos.' }, ...dataWarnings(a, 'bank')]
  const d = round2(a.savings.total - a.savings.previous)
  const actual: 'more' | 'less' | 'same' = d > 0 ? 'more' : d < 0 ? 'less' : 'same'
  const out: Finding[] = []
  if (premise && actual !== premise) {
    out.push({
      kind: 'comparison',
      text: actual === 'same' ? 'En realidad estáis ahorrando lo mismo que en el periodo con el que comparo.' : `En realidad estáis ahorrando ${actual === 'more' ? 'más' : 'menos'}, no ${premise === 'more' ? 'más' : 'menos'}.`,
    })
  }
  out.push({
    kind: 'fact',
    text: `${whenLead(a)}${spanNote(a)} ahorráis ${formatEuros(a.savings.total)} frente a ${formatEuros(a.savings.previous)} en ${baselineLabel(a)}: ${d === 0 ? 'lo mismo' : `${formatEuros(Math.abs(d))} ${d > 0 ? 'más' : 'menos'}`}.`,
  })
  // Por qué: ingresos y gastos, con hechos.
  if (a.income.previous !== null && a.expenses.previous !== null && d !== 0) {
    const di = round2(a.income.total - a.income.previous)
    const de = round2(a.expenses.total - a.expenses.previous)
    out.push({ kind: 'interpretation', text: di === 0 ? `Los ingresos no han variado y los gastos han cambiado ${signedEuros(de)}.` : `Los ingresos han variado ${signedEuros(di)} y los gastos ${signedEuros(de)}.` })
  }
  out.push(...dataWarnings(a, 'bank'))
  return out
}

// "¿Qué gastos podríamos recortar?" — SOLO señala qué categorías REVISAR: variables o "quiero" primero,
// nunca fijas, nunca una orden. No es asesoramiento financiero.
export function cutsFindings(a: Analysis): Finding[] {
  const empty = noData(a)
  if (empty) return empty
  const classified = a.leaf.some((l) => l.necessity !== null || l.fixed !== null)
  const candidates = a.leaf.filter((l) => l.fixed !== true && l.necessity !== 'debo' && l.amount > 0)
  // Primero lo "quiero"; a igual clase, lo más alto.
  const ranked = [...candidates].sort((x, y) => Number(y.necessity === 'quiero') - Number(x.necessity === 'quiero') || y.amount - x.amount).slice(0, 2)
  if (ranked.length === 0) return [{ kind: 'fact', text: `Con los datos de ${a.period.label} no veo categorías variables que revisar: casi todo es gasto fijo o necesario.` }]
  const total = round2(ranked.reduce((s, l) => s + l.amount, 0))
  const share = a.expenses.total > 0 ? Math.round((total / a.expenses.total) * 100) : 0
  const out: Finding[] = [
    { kind: 'fact', text: `Entre los gastos que suelen ser variables, ${whenLead(a).toLowerCase()} destacan: ${ranked.map((l) => `${l.name} (${formatEuros(l.amount)}${l.previous > 0 ? `, antes ${formatEuros(l.previous)}` : ''})`).join(', ')}.` },
    { kind: 'suggestion', text: `Si queréis reducir gasto, podríais revisar ${ranked.map((l) => l.name).join(' y ')}: entre ${ranked.length === 1 ? 'esta' : 'ellas'} suman ${formatEuros(total)} (${share} % del gasto). Es solo una categoría que mirar, no una recomendación de recortar.` },
  ]
  if (!classified) out.push({ kind: 'warning', text: 'Vuestras categorías no están clasificadas como fijas/variables o "quiero/necesito", así que me baso solo en el importe.' })
  const rises = a.categories.filter((c) => c.difference >= MOVER_MIN_EUR).sort((x, y) => y.difference - x.difference)[0]
  if (rises) out.push({ kind: 'comparison', text: `Además, ${rises.name} ha subido ${formatEuros(rises.difference)} respecto ${aLabel(baselineLabel(a))}.` })
  out.push(...dataWarnings(a, 'bank'))
  return out
}

// "¿Hay algún gasto que te llame la atención?" — lo que destaca en los NÚMEROS, sin juzgar.
export function attentionFindings(a: Analysis): Finding[] {
  const empty = noData(a)
  if (empty) return empty
  const out: Finding[] = []
  const { rise, fall } = categoryMovers(a)
  if (rise) out.push({ kind: 'comparison', text: `${rise.name} ha subido ${formatEuros(rise.difference)} respecto ${aLabel(baselineLabel(a))} (de ${formatEuros(rise.previous)} a ${formatEuros(rise.amount)}).` })
  if (fall) out.push({ kind: 'comparison', text: `${fall.name} ha bajado ${formatEuros(Math.abs(fall.difference))} respecto ${aLabel(baselineLabel(a))}.` })
  if (a.newCategories.length > 0) out.push({ kind: 'fact', text: `Aparece gasto en ${a.newCategories.slice(0, 2).join(' y ')} que no había en el periodo anterior.` })
  if (a.biggestExpense) out.push({ kind: 'fact', text: `El gasto individual más alto ha sido de ${formatEuros(a.biggestExpense.amount)} en ${a.biggestExpense.category}.` })
  if (a.necessity.quieroShare !== null) out.push({ kind: 'fact', text: `Un ${Math.round(a.necessity.quieroShare)} % del gasto (${formatEuros(a.necessity.quiero)}) está en categorías marcadas como "quiero" (no esenciales).` })
  if (a.topStore) out.push({ kind: 'fact', text: `${a.topStore.name} es el comercio más repetido: ${a.topStore.count} compras.` })
  if (out.length === 0) return [{ kind: 'fact', text: `Con los datos de ${a.period.label} no destaca nada especial: ningún cambio de más de ${formatEuros(MOVER_MIN_EUR)} entre categorías.` }, ...dataWarnings(a, 'bank')]
  out.push({ kind: 'interpretation', text: 'Es solo lo que destaca en los números; no tiene por qué ser un problema.' })
  out.push(...dataWarnings(a, 'bank'))
  return out
}

// "Explícamelo más sencillo": lo esencial en tres frases cortas.
export function simplerFindings(a: Analysis): Finding[] {
  const empty = noData(a)
  if (empty) return empty
  const out: Finding[] = [{ kind: 'fact', text: `En sencillo: ${a.period.ongoing ? 'de momento habéis gastado' : 'gastasteis'} ${formatEuros(a.expenses.total)}.` }]
  const d = a.expenses.difference
  if (d !== null && d !== 0 && (a.expenses.percentChange === null || Math.abs(a.expenses.percentChange) >= STABLE_PCT)) out.push({ kind: 'comparison', text: `Eso es ${formatEuros(Math.abs(d))} ${d > 0 ? 'más' : 'menos'} que ${baselineLabel(a)}.` })
  else if (d !== null) out.push({ kind: 'comparison', text: `Eso es casi lo mismo que ${baselineLabel(a)}.` })
  const top = a.categories[0]
  if (top) out.push({ kind: 'fact', text: `Lo que más pesa es ${top.name}.` })
  return out
}

// Un solo bloque de categoría: "¿Y solo alimentación?" dentro de un análisis.
export function categoryFocusFindings(a: Analysis, name: string, data: FinanceData): Finding[] {
  const nowRows = spendingRows(data, a.cp.current.from, a.cp.current.to).filter((e) => e.category === name || categoryParentName(e.category, data.categories) === name)
  const prevRows = spendingRows(data, a.cp.previous.from, a.cp.previous.to).filter((e) => e.category === name || categoryParentName(e.category, data.categories) === name)
  const amount = sum(nowRows)
  const out: Finding[] = [{ kind: 'fact', text: `${whenLead(a)}${spanNote(a)} ${who(a)} ${formatEuros(amount)} en ${name}${a.expenses.total > 0 ? ` (${Math.round((amount / a.expenses.total) * 100)} % del gasto)` : ''}.` }]
  if (a.hasPrevious) {
    const before = sum(prevRows)
    const d = round2(amount - before)
    out.push({ kind: 'comparison', text: `${d === 0 ? 'Es lo mismo' : `Son ${formatEuros(Math.abs(d))} ${d > 0 ? 'más' : 'menos'}`}${before > 0 ? ` (${formatPercent((d / before) * 100)})` : ''} que ${baselineLabel(a)} (${formatEuros(before)}).` })
  }
  const by = leafTotals(nowRows)
  const subs = [...by.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3)
  if (subs.length > 1) out.push({ kind: 'fact', text: `Por dentro: ${subs.map(([n, v]) => `${n} ${formatEuros(v)}`).join(', ')}.` })
  out.push(...dataWarnings(a, 'bank'))
  return out
}

// ─── Paquete AGREGADO para la IA (mínimo, sin movimientos ni comercios) ───
//
// Lista plana de hechos; cada uno lleva una referencia (`ref`) que la IA cita entre llaves dobles
// ("{{expenses.total}}") en vez de escribir la cifra: el código compone después el texto final con los
// valores reales, así que la IA no puede inventar ni alterar un número.
export type { AnalysisFact, FactKind }

export function analysisFacts(a: Analysis): AnalysisFact[] {
  const f: AnalysisFact[] = []
  const add = (ref: string, label: string, value: number | string | null, kind: FactKind) => {
    if (value === null || (typeof value === 'number' && !Number.isFinite(value))) return
    f.push({ ref, label, value: typeof value === 'number' ? round2(value) : value, kind })
  }
  add('period.label', 'Periodo analizado', a.period.label, 'text')
  add('baseline.label', 'Periodo con el que se compara', tramoLabel(a.cp), 'text')
  add('expenses.total', 'Gasto total del periodo', a.expenses.total, 'eur')
  add('expenses.previous', 'Gasto total del periodo de comparación', a.expenses.previous, 'eur')
  add('expenses.difference', 'Diferencia de gasto (positivo = más gasto)', a.expenses.difference, 'eur_signed')
  add('expenses.percent', 'Cambio porcentual del gasto', a.expenses.percentChange, 'pct_signed')
  add('income.total', 'Ingresos del periodo', a.income.registered ? a.income.total : null, 'eur')
  add('income.previous', 'Ingresos del periodo de comparación', a.income.previous, 'eur')
  add('savings.total', 'Ahorro del periodo (ingresos menos gastos)', a.savings.total, 'eur')
  add('savings.previous', 'Ahorro del periodo de comparación', a.savings.previous, 'eur')
  add('savings.rate', 'Tasa de ahorro sobre ingresos', a.savings.rate, 'pct')
  a.categories.slice(0, TOP_CATEGORIES).forEach((c, i) => {
    const n = i + 1
    add(`cat.${n}.name`, `Categoría ${n}`, c.name, 'text')
    add(`cat.${n}.amount`, `Gasto en la categoría ${n}`, c.amount, 'eur')
    add(`cat.${n}.previous`, `Gasto en la categoría ${n} en el periodo de comparación`, a.hasPrevious ? c.previous : null, 'eur')
    add(`cat.${n}.difference`, `Cambio de la categoría ${n} (positivo = más gasto)`, a.hasPrevious ? c.difference : null, 'eur_signed')
    add(`cat.${n}.share`, `Peso de la categoría ${n} en el gasto total`, c.share, 'pct')
  })
  add('necessity.quiero', 'Gasto en categorías "quiero" (no esenciales)', a.necessity.quiero > 0 ? a.necessity.quiero : null, 'eur')
  add('necessity.quiero_share', 'Peso del gasto "quiero" en el total', a.necessity.quieroShare, 'pct')
  add('fixed.total', 'Gasto fijo', a.fixedVariable.fixed > 0 ? a.fixedVariable.fixed : null, 'eur')
  add('variable.total', 'Gasto variable', a.fixedVariable.fixed > 0 ? a.fixedVariable.variable : null, 'eur')
  add('prices.compared', 'Productos con precio comparable entre los dos periodos', a.priceAnalysis.available ? a.priceAnalysis.compared : null, 'num')
  add('prices.risen', 'Productos que han subido de precio', a.priceAnalysis.available ? a.priceAnalysis.risen : null, 'num')
  add('prices.fallen', 'Productos que han bajado de precio', a.priceAnalysis.available ? a.priceAnalysis.fallen : null, 'num')
  if (a.purchaseChange.available) {
    add('purchase.price_effect', 'Efecto de los precios en la cesta de tickets', a.purchaseChange.priceEffect, 'eur_signed')
    add('purchase.quantity_effect', 'Efecto de las cantidades en la cesta de tickets', a.purchaseChange.quantityEffect, 'eur_signed')
    add('purchase.new_products', 'Efecto de los productos nuevos en la cesta de tickets', a.purchaseChange.newProducts, 'eur_signed')
    add('purchase.removed_products', 'Efecto de los productos que se dejaron de comprar', a.purchaseChange.removedProducts, 'eur_signed')
  }
  a.dataQuality.warnings.slice(0, 4).forEach((w, i) => add(`quality.warning.${i + 1}`, `Aviso sobre los datos ${i + 1}`, w, 'text'))
  return f
}

