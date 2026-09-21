// Economía por voz, SOLO CONSULTA: aquí CALCULA el código, con los datos reales de la familia.
// Nada de esto llega a la IA y nada escribe en la base de datos.
//
// Se reutiliza lo que ya existe en Economía:
//   - isInternalTransferCategory (domain/finance): qué no cuenta como gasto. La regla "la categoría o una
//     hija suya" es la de isFoodCategory/budgetSpent generalizada a cualquier categoría (isUnderCategory);
//     los tests comprueban que el total coincide con budgetSpent, el cálculo de los presupuestos.
//   - accountingMonthRange / rangeForPreset (domain/dateRanges), a través de financePeriod: los MISMOS
//     meses que enseña la pantalla de Economía.
//   - decomposeSpendChange / compareMonths / averagePricesByMonth (domain/priceTrends): el análisis
//     "¿Por qué ha cambiado mi gasto?" (precio / cantidad / productos nuevos / dejados de comprar).
//   - isFoodPurchase / buildFoodReceiptIds (domain/products): qué líneas de ticket cuentan.
//
// LAS FUENTES NO SE MEZCLAN (para no contar dos veces lo mismo):
//   - GASTO / INGRESO / AHORRO: solo la tabla de movimientos (`expenses`). Un ticket subido o un
//     movimiento del banco ya se convierten en UN movimiento (conciliación en la subida del ticket y
//     en la sincronización del banco), así que jamás se suman `receipts` ni `bank_transactions` aparte.
//   - PRECIOS y "dónde es más barato": solo las líneas de ticket (`product_prices`), nunca importes.
//   - "¿Por qué ha cambiado?": la cesta de tickets (es un análisis por producto) se dice aparte del
//     gasto total del ledger, sin sumarlos.
import { isInternalTransferCategory } from '@/domain/finance'
import { comparableAgainst, comparablePrevious, resolvePeriod, type PeriodSpec, type ResolvedPeriod } from '@/domain/financePeriod'
import type { FinanceQuery } from '@/domain/financeQuery'
import { averagePricesByMonth, compareMonths, decomposeSpendChange, type RawPurchase, type SpendChangeBreakdown } from '@/domain/priceTrends'
import { pendingSpending, type PendingSpending } from '@/domain/pending'
import { buildFoodReceiptIds, buildProductKindSets, isFoodPurchase } from '@/domain/products'
import type { Budget, BudgetCategory, Expense, Product, ProductPrice, Receipt } from '@/domain/types'
import { normalize } from '@/domain/voiceQuery'

export interface FinanceData {
  expenses: Expense[]
  categories: BudgetCategory[]
  receipts: Receipt[]
  prices: ProductPrice[]
  products: Product[]
  // Tiendas dadas de alta en la familia.
  storeNames: string[]
  monthStartDay: number
  // Hay alguna conexión bancaria caducada o revocada: puede faltar gasto reciente.
  bankStale: boolean
  // Solo para consultas de presupuesto (se cargan únicamente entonces).
  budgets?: Budget[]
  accountsMode?: 'compartido' | 'separado'
}

// ─── Formato ───

export function formatEuros(amount: number): string {
  const rounded = Math.round(Math.abs(amount) * 100) / 100
  const [int, dec] = rounded.toFixed(2).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${amount < 0 && rounded !== 0 ? '-' : ''}${grouped},${dec} €`
}

export function formatPercent(p: number): string {
  const rounded = Math.round(p * 10) / 10
  return `${rounded > 0 ? '+' : ''}${String(rounded).replace('.', ',')} %`
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// "Este mes lleváis…" pero "En agosto habéis gastado…", "En los últimos 30 días…".
function subjectOf(period: ResolvedPeriod): string {
  const t = period.spec.t
  return t === 'month_named' || t === 'last_days' || t === 'last_months' ? `En ${period.label}` : capitalize(period.label)
}

// En medio de una frase: "este mes", "en agosto", "desde junio".
function whenOf(period: ResolvedPeriod): string {
  const t = period.spec.t
  return t === 'month_named' || t === 'last_days' || t === 'last_months' ? `en ${period.label}` : period.label
}

export function dayOf(date: string): number {
  return Number(date.slice(8, 10))
}

// ─── Gasto real: la MISMA definición que budgetSpent y que Resumen de Economía ───
// Solo gasto real (nunca estimado/previsto), nunca ingresos y nunca movimientos internos entre
// cuentas propias.

export function isRealSpending(e: Expense, categories: BudgetCategory[]): boolean {
  return e.kind === 'real' && !e.isIncome && !isInternalTransferCategory(e.category, categories)
}

export function isRealIncome(e: Expense, categories: BudgetCategory[]): boolean {
  return e.kind === 'real' && e.isIncome && !isInternalTransferCategory(e.category, categories)
}

function inRange(e: Expense, from: string, to: string): boolean {
  return e.expenseDate >= from && e.expenseDate <= to
}

// ─── Categorías y tiendas REALES ───

function stem(word: string): string {
  return word.length > 4 && word.endsWith('es') ? word.slice(0, -2) : word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word
}

// Acepta null/undefined (p. ej. una categoría pendiente de clasificar): sin texto no hay palabras, nunca una excepción.
function words(text: string | null | undefined): string[] {
  return normalize(text ?? '')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 1)
}

const CATEGORY_ALIASES: Record<string, string> = { comida: 'alimentacion', alimentos: 'alimentacion', comidas: 'alimentacion', super: 'supermercado', supermercados: 'supermercado' }

export type TargetResolution =
  | { kind: 'category'; name: string }
  | { kind: 'store'; name: string }
  // Un concepto: aparece en el nombre de la categoría, el comercio o el texto del movimiento ("luz").
  | { kind: 'concept'; stems: string[]; label: string }
  | { kind: 'ambiguous'; options: string[] }
  | { kind: 'none' }

function storeMatches(store: string | null, target: string): boolean {
  if (!store) return false
  const have = new Set(words(store).map(stem))
  const want = words(target).map(stem)
  return want.length > 0 && want.every((w) => have.has(w))
}

// ¿El movimiento "habla" de eso? Mira la categoría, el comercio y el texto del movimiento, por palabras enteras.
export function conceptMatches(e: Pick<Expense, 'category' | 'store' | 'notes'>, stems: string[]): boolean {
  if (stems.length === 0) return false
  const have = new Set([...words(e.category ?? ''), ...words(e.store ?? ''), ...words(e.notes ?? '')].map(stem))
  return stems.every((w) => have.has(w))
}

// "alimentación", "comida", "restaurantes", "supermercados", "Mercadona", "luz": contra lo que existe de verdad.
export function resolveTarget(target: string, data: Pick<FinanceData, 'categories' | 'expenses' | 'storeNames'>): TargetResolution {
  const wanted = words(target).map((w) => stem(CATEGORY_ALIASES[w] ?? w))
  if (wanted.length === 0) return { kind: 'none' }

  // 1) Una CATEGORÍA real: todas las palabras pedidas están en su nombre ("restaurantes" -> "Restaurantes,
  //    bares y cafeterías"), o el nombre entero está dentro de lo pedido ("luz electrica" -> "Luz").
  const names = [...new Set(data.categories.map((c) => c.name))]
  const scored = names
    .map((name) => {
      const nameWords = words(name).map(stem)
      const contains = wanted.every((w) => nameWords.includes(w))
      const insideRequest = nameWords.length > 0 && nameWords.length <= 3 && nameWords.every((w) => wanted.includes(w))
      const exact = normalize(name) === normalize(target) || (nameWords.length === wanted.length && contains)
      return { name, contains, insideRequest, exact, size: nameWords.length, top: !data.categories.find((c) => c.name === name)?.parentId }
    })
    .filter((c) => c.contains || c.insideRequest)
  if (scored.length > 0) {
    const exact = scored.filter((c) => c.exact)
    const containing = scored.filter((c) => c.contains)
    // Preferencia: exacta, luego las que contienen lo pedido, luego las que caben dentro de lo pedido (la más larga).
    let pool = exact.length > 0 ? exact : containing.length > 0 ? containing : scored
    if (exact.length === 0 && containing.length === 0) {
      const longest = Math.max(...pool.map((c) => c.size))
      pool = pool.filter((c) => c.size === longest)
    }
    const tops = pool.filter((c) => c.top)
    const best = tops.length > 0 ? tops : pool
    if (best.length === 1) return { kind: 'category', name: best[0].name }
    return { kind: 'ambiguous', options: best.map((b) => b.name) }
  }

  // 2) Una TIENDA real (dada de alta o vista en los movimientos).
  const registered = data.storeNames.find((s) => storeMatches(s, target))
  const inLedger = data.expenses.find((e) => storeMatches(e.store, target))
  if (registered || inLedger) return { kind: 'store', name: registered ?? target }

  // 3) Un CONCEPTO: las palabras aparecen en el nombre de la categoría, el comercio o el texto del movimiento
  //    ("recibo de la luz"). Se busca en local; ese texto no sale nunca del dispositivo.
  if (data.expenses.some((e) => conceptMatches(e, wanted))) return { kind: 'concept', stems: wanted, label: words(target).join(' ') }
  return { kind: 'none' }
}

export function categoryParentName(category: string | null, categories: BudgetCategory[]): string | null {
  if (category == null) return null
  const cat = categories.find((c) => c.name === category)
  if (!cat?.parentId) return null
  return categories.find((c) => c.id === cat.parentId)?.name ?? null
}

// Misma regla que isFoodCategory (la categoría o una hija suya), para cualquier categoría.
export function isUnderCategory(expenseCategory: string | null, name: string, categories: BudgetCategory[]): boolean {
  if (expenseCategory == null) return false // pendiente de clasificar: no está en ninguna categoría
  if (expenseCategory === name) return true
  return categoryParentName(expenseCategory, categories) === name
}

export interface Filter {
  category?: string
  store?: string
  concept?: string[]
}

export function spendingRows(data: FinanceData, from: string, to: string, filter: Filter = {}): Expense[] {
  return data.expenses.filter((e) => {
    if (!isRealSpending(e, data.categories) || !inRange(e, from, to)) return false
    if (filter.category && !isUnderCategory(e.category, filter.category, data.categories)) return false
    if (filter.store && !storeMatches(e.store, filter.store)) return false
    if (filter.concept && !conceptMatches(e, filter.concept)) return false
    return true
  })
}

export function sum(rows: Expense[]): number {
  return Math.round(rows.reduce((t, e) => t + e.amount, 0) * 100) / 100
}

export function totalSpending(data: FinanceData, from: string, to: string, filter: Filter = {}): number {
  return sum(spendingRows(data, from, to, filter))
}

export function totalIncome(data: FinanceData, from: string, to: string): number {
  return sum(data.expenses.filter((e) => isRealIncome(e, data.categories) && inRange(e, from, to)))
}

export function groupSpending(rows: Expense[], data: FinanceData, category?: string): { name: string; amount: number }[] {
  const by = new Map<string, number>()
  for (const e of rows) {
    if (e.category == null) continue // pendiente (NULL): sigue en los totales, pero no se atribuye a una categoría; lo muestra la 6C.2B
    let key = e.category
    if (!category) key = categoryParentName(e.category, data.categories) ?? e.category
    by.set(key, (by.get(key) ?? 0) + e.amount)
  }
  return [...by.entries()].map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 })).sort((a, b) => b.amount - a.amount)
}

// Reparto por categorías REALES + los pendientes de clasificar APARTE (category NULL): nunca se mezclan ni se atribuyen a una categoría.
// Invariante: suma(groups) + pending.amount = sum(rows) (salvo redondeos de céntimos), porque groupSpending solo omite los pendientes.
export function spendingBreakdown(
  rows: Expense[],
  data: FinanceData,
  category?: string,
): { groups: { name: string; amount: number }[]; pending: PendingSpending } {
  return { groups: groupSpending(rows, data, category), pending: pendingSpending(rows) }
}

// ─── Respuestas ───

export interface FinanceAnswer {
  text: string
  // La consulta ya con el periodo y filtros resueltos: es lo que se recuerda para las continuaciones.
  query: FinanceQuery
}

const NO_DATA = (label: string) => `No tengo gastos registrados ${label}.`

export function staleNote(data: FinanceData): string {
  return data.bankStale ? ' Ojo: hay una conexión bancaria caducada, así que puede faltar gasto reciente.' : ''
}

function periodOf(query: FinanceQuery, data: FinanceData, today: Date, fallback: PeriodSpec = { t: 'month', offset: 0 }): { spec: PeriodSpec; resolved: ResolvedPeriod } {
  const spec = query.period ?? fallback
  return { spec, resolved: resolvePeriod(spec, today, data.monthStartDay) }
}

export function spanText(from: string, to: string): string {
  return from === to ? `el ${dayOf(from)}` : `del ${dayOf(from)} al ${dayOf(to)}`
}

function targetPhrase(target: TargetResolution): string {
  if (target.kind === 'concept') return ` en «${target.label}» (movimientos cuya categoría, comercio o concepto lo mencionan)`
  return target.kind === 'category' || target.kind === 'store' ? ` en ${target.name}` : ''
}

function answerTargetProblem(target: TargetResolution, raw: string): string | null {
  if (target.kind === 'ambiguous') return `«${raw}» puede ser varias cosas: ${target.options.join(', ')}. ¿Cuál quieres?`
  if (target.kind === 'none') return `No encuentro ninguna categoría, tienda ni concepto llamado «${raw}» en tus datos, así que no lo calculo.`
  return null
}

function filterOf(target: TargetResolution): Filter {
  if (target.kind === 'category') return { category: target.name }
  if (target.kind === 'store') return { store: target.name }
  if (target.kind === 'concept') return { concept: target.stems }
  return {}
}

export function hasAnyExpense(data: FinanceData, from: string, to: string): boolean {
  return data.expenses.some((e) => e.kind === 'real' && inRange(e, from, to))
}

function answerSpent(query: FinanceQuery, data: FinanceData, today: Date): FinanceAnswer {
  const { spec, resolved } = periodOf(query, data, today)
  const q = { ...query, period: spec }
  let target: TargetResolution = { kind: 'none' }
  if (query.target) {
    target = resolveTarget(query.target, data)
    const problem = answerTargetProblem(target, query.target)
    if (problem) return { text: problem, query: q }
  }
  const filter = filterOf(target)
  const where = targetPhrase(target)
  const total = totalSpending(data, resolved.from, resolved.to, filter)

  if (total === 0 && !hasAnyExpense(data, resolved.from, resolved.to)) {
    return { text: NO_DATA(whenOf(resolved)) + staleNote(data), query: q }
  }
  const lead = resolved.ongoing ? `${subjectOf(resolved)} lleváis` : `${subjectOf(resolved)} habéis gastado`
  let text = `${lead} ${formatEuros(total)}${where || ' de gastos registrados'}.`
  // Un gasto pendiente de clasificar SÍ está en ese total (es gasto real); solo se aclara cuánto de él aún no tiene categoría.
  const pending = pendingSpending(spendingRows(data, resolved.from, resolved.to, filter))
  if (pending.count > 0) text += ` De ese total, ${formatEuros(pending.amount)} están pendientes de clasificar.`

  // Comparación útil solo con periodos en curso, contra el MISMO tramo del anterior.
  if (resolved.ongoing && (spec.t === 'month' || spec.t === 'month_named' || spec.t === 'week' || spec.t === 'year')) {
    const cp = comparablePrevious(resolved, today, data.monthStartDay)
    // Se compara el MISMO tramo de los dos periodos (1-20 contra 1-20), no el mes entero con un tramo.
    const sameSpan = totalSpending(data, cp.current.from, cp.current.to, filter)
    const before = totalSpending(data, cp.previous.from, cp.previous.to, filter)
    if (before > 0) {
      const diff = Math.round((sameSpan - before) * 100) / 100
      const same = spec.t === 'month' || spec.t === 'month_named' ? 'mes anterior' : spec.t === 'week' ? 'semana anterior' : 'año anterior'
      text += diff === 0 ? ` Es lo mismo que en el mismo periodo del ${same}.` : ` Son ${formatEuros(Math.abs(diff))} ${diff > 0 ? 'más' : 'menos'} que en el mismo periodo del ${same}.`
    }
  }
  return { text: text + staleNote(data), query: { ...q, target: target.kind === 'category' || target.kind === 'store' ? target.name : target.kind === 'concept' ? target.label : query.target } }
}

function answerIncome(query: FinanceQuery, data: FinanceData, today: Date): FinanceAnswer {
  const { spec, resolved } = periodOf(query, data, today)
  const q = { ...query, period: spec, target: null }
  const total = totalIncome(data, resolved.from, resolved.to)
  const anyIncome = data.expenses.some((e) => isRealIncome(e, data.categories) && inRange(e, resolved.from, resolved.to))
  if (!anyIncome) return { text: `No tengo ingresos registrados ${whenOf(resolved)}.` + staleNote(data), query: q }
  const lead = resolved.ongoing ? `${subjectOf(resolved)} lleváis` : `${subjectOf(resolved)} habéis ingresado`
  return { text: `${lead} ${formatEuros(total)} de ingresos registrados.` + staleNote(data), query: q }
}

function answerSaved(query: FinanceQuery, data: FinanceData, today: Date): FinanceAnswer {
  const { spec, resolved } = periodOf(query, data, today)
  const q = { ...query, period: spec, target: null }
  const income = totalIncome(data, resolved.from, resolved.to)
  const spent = totalSpending(data, resolved.from, resolved.to)
  const anyIncome = data.expenses.some((e) => isRealIncome(e, data.categories) && inRange(e, resolved.from, resolved.to))
  if (!anyIncome) {
    return { text: `No tengo ingresos registrados ${whenOf(resolved)}, así que no puedo calcular el ahorro. Gastos registrados: ${formatEuros(spent)}.` + staleNote(data), query: q }
  }
  const saved = Math.round((income - spent) * 100) / 100
  const head = `${subjectOf(resolved)}: ingresos ${formatEuros(income)}, gastos ${formatEuros(spent)}.`
  if (saved >= 0) {
    const rate = income > 0 ? ` (${String(Math.round((saved / income) * 1000) / 10).replace('.', ',')} % de lo ingresado)` : ''
    return { text: `${head} Ahorro: ${formatEuros(saved)}${rate}.` + staleNote(data), query: q }
  }
  return { text: `${head} Habéis gastado ${formatEuros(Math.abs(saved))} más de lo que habéis ingresado.` + staleNote(data), query: q }
}

function answerTopCategories(query: FinanceQuery, data: FinanceData, today: Date): FinanceAnswer {
  const { spec, resolved } = periodOf(query, data, today)
  const q = { ...query, period: spec }
  let target: TargetResolution = { kind: 'none' }
  if (query.target) {
    target = resolveTarget(query.target, data)
    const problem = answerTargetProblem(target, query.target)
    if (problem) return { text: problem, query: q }
  }
  const filter = filterOf(target)
  const rows = spendingRows(data, resolved.from, resolved.to, filter)
  if (rows.length === 0) return { text: NO_DATA(whenOf(resolved)) + staleNote(data), query: q }
  const total = sum(rows)
  const groups = groupSpending(rows, data, target.kind === 'category' ? target.name : undefined).slice(0, 5)
  const lines = groups.map((g) => `${g.name}: ${formatEuros(g.amount)} (${Math.round((g.amount / total) * 100)} %)`)
  const head = `${subjectOf(resolved)}${targetPhrase(target)}, ${formatEuros(total)} en total. Lo que más:`
  // Los pendientes NO son una categoría: no entran en el ranking; se informan aparte (siguen dentro del total).
  const pending = pendingSpending(rows)
  const pendingLine =
    pending.count > 0
      ? `\nHay ${formatEuros(pending.amount)} en ${pending.count === 1 ? '1 movimiento pendiente' : `${pending.count} movimientos pendientes`} de clasificar, que no están en ninguna categoría.`
      : ''
  return { text: `${head}\n${lines.join('\n')}${pendingLine}` + staleNote(data), query: q }
}

// "¿Qué tengo pendiente de clasificar?": gasto real con category NULL. Sin periodo dicho se cuentan TODOS (un pendiente sigue pendiente
// aunque pase el mes); con periodo, solo ese.
function answerPending(query: FinanceQuery, data: FinanceData, today: Date): FinanceAnswer {
  const hasPeriod = query.period !== null
  const { spec, resolved } = periodOf(query, data, today)
  const q = { ...query, period: hasPeriod ? spec : null, target: null }
  const rows = spendingRows(data, hasPeriod ? resolved.from : '0000-01-01', hasPeriod ? resolved.to : '9999-12-31')
  const pending = pendingSpending(rows)
  const when = hasPeriod ? ` ${whenOf(resolved)}` : ''
  if (pending.count === 0) return { text: `No tenéis gastos pendientes de clasificar${when}.` + staleNote(data), query: q }
  const total = sum(rows)
  const share = total > 0 ? ` (el ${Math.round((pending.amount / total) * 100)} % del gasto registrado)` : ''
  const movs = pending.count === 1 ? '1 movimiento pendiente' : `${pending.count} movimientos pendientes`
  return {
    text: `Tenéis ${movs} de clasificar${when}: ${formatEuros(pending.amount)} en total${share}. Siguen contando en el gasto total; solo falta decir en qué categoría van.` + staleNote(data),
    query: q,
  }
}

function answerCompare(query: FinanceQuery, data: FinanceData, today: Date): FinanceAnswer {
  const { spec, resolved } = periodOf(query, data, today)
  const q = { ...query, period: spec }
  let target: TargetResolution = { kind: 'none' }
  if (query.target) {
    target = resolveTarget(query.target, data)
    const problem = answerTargetProblem(target, query.target)
    if (problem) return { text: problem, query: q }
  }
  const filter = filterOf(target)
  const cp = comparablePrevious(resolved, today, data.monthStartDay, query.full)
  const now = totalSpending(data, cp.current.from, cp.current.to, filter)
  const before = totalSpending(data, cp.previous.from, cp.previous.to, filter)
  if (!hasAnyExpense(data, cp.previous.from, cp.previous.to)) {
    return { text: `No tengo gastos registrados en ${cp.previousLabel}, así que no puedo compararlo todavía.` + staleNote(data), query: q }
  }
  const diff = Math.round((now - before) * 100) / 100
  const pct = before > 0 ? ` (${formatPercent((diff / before) * 100)})` : ''
  const span = cp.cutoff ? ` (${spanText(cp.current.from, cp.current.to)})` : ''
  const prevSpan = cp.cutoff ? ` (${spanText(cp.previous.from, cp.previous.to)})` : ''
  const verdict = diff === 0 ? 'lo mismo' : `${formatEuros(Math.abs(diff))} ${diff > 0 ? 'más' : 'menos'}${pct}`
  const fair = cp.cutoff ? ' Comparo el mismo tramo de días para que sea justo.' : ''
  const text = `${subjectOf(resolved)}${span}${targetPhrase(target)} ${resolved.ongoing ? 'lleváis' : 'habéis gastado'} ${formatEuros(now)} frente a ${formatEuros(before)} en ${cp.previousLabel}${prevSpan}: ${verdict}.${fair}`
  return { text: text + staleNote(data), query: q }
}

// Un mes sintético por ventana, para reutilizar decomposeSpendChange/compareMonths TAL CUAL (trabajan
// por meses YYYY-MM) aunque la ventana sea un tramo de días o un mes contable que cruza meses de calendario.
const SYN_PREV = '2000-01'
const SYN_CUR = '2000-02'

function ticketPurchases(data: FinanceData): (RawPurchase & { store: string | null })[] {
  const foodReceiptIds = buildFoodReceiptIds(data.receipts, data.categories)
  const { nonFoodProductIds: nonFood, foodProductIds } = buildProductKindSets(data.products)
  return data.prices
    .filter((p) => isFoodPurchase(p, foodReceiptIds, nonFood, foodProductIds))
    .map((p) => {
      const qty = Number(p.quantity)
      return { productId: p.productId, price: p.price, quantity: Number.isFinite(qty) && qty > 0 ? qty : 1, recordedDate: p.recordedDate, store: p.store }
    })
}

function windowPurchases(all: RawPurchase[], cp: { current: { from: string; to: string }; previous: { from: string; to: string } }): RawPurchase[] {
  const out: RawPurchase[] = []
  for (const p of all) {
    if (p.recordedDate >= cp.current.from && p.recordedDate <= cp.current.to) out.push({ ...p, recordedDate: `${SYN_CUR}-01` })
    else if (p.recordedDate >= cp.previous.from && p.recordedDate <= cp.previous.to) out.push({ ...p, recordedDate: `${SYN_PREV}-01` })
  }
  return out
}

export function productName(data: FinanceData, id: string): string {
  return data.products.find((p) => p.id === id)?.displayName ?? '?'
}

export function signedEuros(n: number): string {
  return `${n >= 0 ? '+' : '-'}${formatEuros(Math.abs(n))}`
}

// Cambio de la cesta de tickets entre dos tramos: la MISMA decomposeSpendChange que usa Economía.
// Devuelve null si no hay tickets en los dos tramos (no se puede afirmar nada).
export function ticketChange(
  data: FinanceData,
  cp: { current: { from: string; to: string }; previous: { from: string; to: string } },
): { bd: SpendChangeBreakdown; movers: { productId: string; deltaPercent: number }[] } | null {
  const purchases = windowPurchases(ticketPurchases(data), cp)
  const hasCur = purchases.some((p) => p.recordedDate.startsWith(SYN_CUR))
  const hasPrev = purchases.some((p) => p.recordedDate.startsWith(SYN_PREV))
  if (!hasCur || !hasPrev) return null
  const bd = decomposeSpendChange(purchases, SYN_CUR, SYN_PREV)
  const movers = compareMonths(averagePricesByMonth(purchases), SYN_CUR, SYN_PREV)
    .filter((c) => c.previousPrice != null && c.deltaPercent != null && Math.abs(c.deltaPercent) >= 0.5)
    .map((c) => ({ productId: c.productId, deltaPercent: c.deltaPercent as number }))
    .sort((x, y) => Math.abs(y.deltaPercent) - Math.abs(x.deltaPercent))
  return { bd, movers }
}

function answerWhy(query: FinanceQuery, data: FinanceData, today: Date): FinanceAnswer {
  const { spec, resolved } = periodOf(query, data, today)
  const q = { ...query, period: spec, target: null }
  // "¿Y comparado con agosto?": contra el periodo elegido, con la misma regla de corte.
  const cp = query.baseline
    ? comparableAgainst(resolved, resolvePeriod(query.baseline, today, data.monthStartDay), today, query.full)
    : comparablePrevious(resolved, today, data.monthStartDay, query.full)
  const nowRows = spendingRows(data, cp.current.from, cp.current.to)
  const prevRows = spendingRows(data, cp.previous.from, cp.previous.to)
  if (prevRows.length === 0 || nowRows.length === 0) {
    return { text: `No tengo gastos registrados suficientes en los dos periodos para explicar el cambio todavía.` + staleNote(data), query: q }
  }
  const now = sum(nowRows)
  const before = sum(prevRows)
  const diff = Math.round((now - before) * 100) / 100
  const lines: string[] = []
  const fair = cp.cutoff ? ` (mismo tramo de días: ${spanText(cp.current.from, cp.current.to)} contra ${spanText(cp.previous.from, cp.previous.to)})` : ''
  if (diff <= 0) {
    lines.push(`En realidad ${whenOf(resolved)} ${resolved.ongoing ? 'lleváis' : 'habéis gastado'} ${diff === 0 ? 'lo mismo' : `${formatEuros(Math.abs(diff))} menos`} que en ${cp.previousLabel}${fair}: ${formatEuros(now)} contra ${formatEuros(before)}.`)
  } else {
    lines.push(`${subjectOf(resolved)} ${resolved.ongoing ? 'lleváis' : 'habéis gastado'} ${formatEuros(diff)} más que en ${cp.previousLabel}${fair}: ${formatEuros(now)} contra ${formatEuros(before)}.`)
  }

  // Qué categorías explican el cambio (por diferencia entre periodos).
  const a = new Map(groupSpending(nowRows, data).map((g) => [g.name, g.amount]))
  const b = new Map(groupSpending(prevRows, data).map((g) => [g.name, g.amount]))
  const deltas = [...new Set([...a.keys(), ...b.keys()])]
    .map((name) => ({ name, delta: Math.round(((a.get(name) ?? 0) - (b.get(name) ?? 0)) * 100) / 100 }))
    .filter((d) => (diff >= 0 ? d.delta > 0 : d.delta < 0))
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
    .slice(0, 3)
  if (deltas.length > 0) lines.push(`Por categorías: ${deltas.map((d) => `${d.name} ${signedEuros(d.delta)}`).join(', ')}.`)

  // Análisis de la cesta de tickets (misma función que Economía): precio, cantidad, nuevos, dejados.
  const change = ticketChange(data, cp)
  if (change) {
    const { bd, movers } = change
    const basketDelta = bd.currentTotal - bd.previousTotal
    lines.push(`Solo en la cesta de tickets (${formatEuros(bd.previousTotal)} → ${formatEuros(bd.currentTotal)}, ${signedEuros(basketDelta)}):`)
    lines.push(`Por precios ${signedEuros(bd.priceEffect)} · por cantidades ${signedEuros(bd.quantityEffect)} · productos nuevos ${signedEuros(bd.newProductsEffect)} · dejados de comprar ${signedEuros(bd.droppedProductsEffect)}.`)
    const top = movers.slice(0, 3)
    if (top.length > 0) lines.push(`Precios que más han cambiado: ${top.map((m) => `${productName(data, m.productId)} ${formatPercent(m.deltaPercent)}`).join(', ')}.`)
    lines.push('El análisis de tickets puede no coincidir con el banco.')
  } else {
    lines.push('No tengo tickets suficientes en los dos periodos para separar precio y cantidad.')
  }
  return { text: lines.join('\n') + staleNote(data), query: q }
}

// ─── Precios (solo líneas de ticket) ───

const MIN_PRICE_CHANGE = 0.5

function baseMonths(query: FinanceQuery, data: FinanceData, today: Date): { current: string; previous: string; label: string; spec: PeriodSpec } {
  // Igual que Economía y el Historial de Compras: mes de calendario contra el anterior.
  let year = today.getFullYear()
  let month0 = today.getMonth()
  let label = 'este mes'
  let spec: PeriodSpec = { t: 'month', offset: 0 }
  if (query.period) {
    const r = resolvePeriod(query.period, today, data.monthStartDay)
    if (query.period.t === 'month' || query.period.t === 'month_named') {
      year = Number(r.from.slice(0, 4))
      month0 = Number(r.from.slice(5, 7)) - 1
      // Un mes contable que empieza el día 20 cae, por su fin, en el mes siguiente.
      if (dayOf(r.from) > 15) {
        month0 = (month0 + 1) % 12
        if (month0 === 0) year += 1
      }
      label = query.period.t === 'month_named' ? `en ${r.label}` : r.label
      spec = query.period
    }
  }
  const cur = `${year}-${String(month0 + 1).padStart(2, '0')}`
  const prevDate = new Date(year, month0 - 1, 1)
  const prev = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
  return { current: cur, previous: prev, label, spec }
}

function answerPrices(query: FinanceQuery, data: FinanceData, today: Date, direction: 'up' | 'down'): FinanceAnswer {
  const { current, previous, label, spec } = baseMonths(query, data, today)
  const q = { ...query, period: spec, target: null }
  const purchases = ticketPurchases(data)
  const changes = compareMonths(averagePricesByMonth(purchases), current, previous).filter((c) => c.previousPrice != null && c.deltaPercent != null)
  if (changes.length === 0) {
    return { text: `No tengo suficientes compras registradas ${label.startsWith('en ') ? label : `en ${label}`} y el mes anterior para comparar precios todavía.`, query: q }
  }
  const wanted = changes
    .filter((c) => (direction === 'up' ? c.deltaPercent! >= MIN_PRICE_CHANGE : c.deltaPercent! <= -MIN_PRICE_CHANGE))
    .sort((x, y) => (direction === 'up' ? y.deltaPercent! - x.deltaPercent! : x.deltaPercent! - y.deltaPercent!))
    .slice(0, 5)
  if (wanted.length === 0) {
    return { text: `Según tus tickets, ${label} ningún producto ha ${direction === 'up' ? 'subido' : 'bajado'} de precio respecto al mes anterior (entre los ${changes.length} que puedo comparar).`, query: q }
  }
  const lines = wanted.map((c) => `${productName(data, c.productId)}: ${formatEuros(c.previousPrice!)} → ${formatEuros(c.currentPrice!)} (${formatPercent(c.deltaPercent!)})`)
  return { text: `Según tus tickets, ${label} han ${direction === 'up' ? 'subido' : 'bajado'} más de precio (precio medio por unidad):\n${lines.join('\n')}`, query: q }
}

function answerCheapest(query: FinanceQuery, data: FinanceData): FinanceAnswer {
  const term = query.product ?? ''
  const q = { ...query }
  const wanted = words(term).map(stem)
  if (wanted.length === 0) return { text: '¿De qué producto quieres comparar tiendas?', query: q }
  const matches = data.products.filter((p) => {
    const have = new Set(words(`${p.displayName} ${p.normalizedName}`).map(stem))
    return wanted.every((w) => have.has(w))
  })
  const purchases = data.prices.filter((p) => matches.some((m) => m.id === p.productId))
  if (purchases.length === 0) return { text: `No tengo compras registradas de «${term}», así que no puedo compararlo.`, query: q }

  // Por producto: último precio en cada tienda (igual que la ficha del producto en Compras).
  const perProduct = matches
    .map((product) => {
      const rows = purchases.filter((p) => p.productId === product.id).sort((a, b) => a.recordedDate.localeCompare(b.recordedDate))
      const byStore = new Map<string, { price: number; date: string }>()
      for (const r of rows) byStore.set(r.store || 'Sin tienda concreta', { price: r.price, date: r.recordedDate })
      return { product, count: rows.length, stores: [...byStore.entries()].sort((a, b) => a[1].price - b[1].price) }
    })
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)

  const comparable = perProduct.filter((x) => x.stores.filter(([s]) => s !== 'Sin tienda concreta').length >= 2 && x.count >= 3)
  if (comparable.length === 0) {
    const where = [...new Set(purchases.map((p) => p.store).filter(Boolean))]
    const only = where.length === 1 ? ` Solo las tengo de ${where[0]}.` : ''
    return { text: `No tengo suficientes compras registradas de «${term}» en más de una tienda para compararlo todavía (${purchases.length} ${purchases.length === 1 ? 'compra' : 'compras'}).${only}`, query: q }
  }
  const lines: string[] = ['Según tus compras registradas (último precio por unidad en cada tienda):']
  for (const c of comparable.slice(0, 2)) {
    const cheapest = c.stores[0]
    lines.push(`${c.product.displayName}: ${c.stores.map(([s, i]) => `${s} ${formatEuros(i.price)}`).join(' · ')} — más barato en ${cheapest[0]}.`)
  }
  lines.push('Es solo tu histórico, no el precio actual del mercado.')
  return { text: lines.join('\n'), query: q }
}

export function answerFinanceQuery(query: FinanceQuery, data: FinanceData, today: Date): FinanceAnswer {
  switch (query.metric) {
    case 'spent':
      return answerSpent(query, data, today)
    case 'income':
      return answerIncome(query, data, today)
    case 'saved':
      return answerSaved(query, data, today)
    case 'top_categories':
      return answerTopCategories(query, data, today)
    case 'pending':
      return answerPending(query, data, today)
    case 'compare':
      return answerCompare(query, data, today)
    case 'why_changed':
      return answerWhy(query, data, today)
    case 'price_up':
      return answerPrices(query, data, today, 'up')
    case 'price_down':
      return answerPrices(query, data, today, 'down')
    case 'cheapest_store':
      return answerCheapest(query, data)
    default:
      // Las consultas de análisis las responde financeAnswer (motor de análisis), no estas cifras sueltas.
      return { text: 'Esa consulta se responde con el análisis de Economía.', query }
  }
}

