// Presupuestos por voz (PREPARAR, nunca guardar): entender la frase, resolverla contra las categorías y los
// presupuestos REALES y devolver o una pregunta, o un rechazo, o unos parámetros listos para la tarjeta de
// confirmación. Aquí no se escribe nada y no se llama a ninguna IA.
//
// Se reutiliza lo que ya existe: la resolución de categorías de las consultas (resolveTarget), el mes contable
// (accountingMonthRange / accountingPeriodLabel), el periodo de un presupuesto (budgetPeriodRange) y la
// regla de qué es un traspaso interno (isInternalTransferCategory). Un presupuesto es, como en la pantalla:
// categoría (por nombre) + importe + mes contable + grupo 'generales' (+ dueño en modo Separado).
import { MONTH_LABELS } from '@/domain/calendar'
import { accountingMonthRange, accountingPeriodLabel } from '@/domain/dateRanges'
import { interpretReply } from '@/domain/dialogReply'
import { budgetPeriodRange, budgetSpent, isInternalTransferCategory } from '@/domain/finance'
import { formatEuros, resolveTarget, type FinanceData } from '@/domain/financeCompute'
import { cleanFinanceText, withoutWakeWord } from '@/domain/financeQuery'
import type { Budget, BudgetCategory } from '@/domain/types'
import { amountsIn, isNumberWord, validAmount, type BudgetIntentOutput } from '../../supabase/functions/_shared/ai/purposes/financeBudgetIntentCore.ts'

export const BUDGET_GROUP = 'generales'

// ─── Lo que se rechaza siempre: mover dinero ───

export const MONEY_MOVE_REFUSED =
  'No puedo hacer transferencias, pagos ni ninguna operación bancaria: eso solo puedes hacerlo tú, desde tu banco.'

const MONEY_MOVE_VERBS =
  /^(?:por favor\s+)?(?:(?:puedes|podrias|quiero que|necesito que|me gustaria que)\s+)?(?:transfiere|transfieres|transferir|transfiereme|traspasa|traspasar|traspasame|paga|pagar|pagame|abona|abonar|ingresa|ingresar|ingresame|retira|retirar|saca|sacar|envia|enviar|manda|mandar|mueve|mover|invierte|invertir|presta|prestame|solicita|contrata|haz(?:me)? un (?:pago|bizum|ingreso|traspaso|transferencia)|hacer un (?:pago|bizum|ingreso|traspaso|transferencia)|bizum)\b/
const MONEY_CUE = /\b(?:dinero|euros?|eur|bizum|cuenta|cuentas|banco|efectivo|saldo|hipoteca|prestamo)\b|€|\d/

export function isMoneyMoveRequest(text: string): boolean {
  const n = withoutWakeWord(cleanFinanceText(text))
  if (/^(?:cuanto|cuanta|cuantos|que|como|donde|cuando|por que|quien)\b/.test(n)) return false
  return MONEY_MOVE_VERBS.test(n) && MONEY_CUE.test(n)
}

// ─── Entender la frase ───

export type PeriodRequest = 'this_month' | 'next_month' | 'monthly' | 'unspecified' | 'weekly' | 'other'

export interface BudgetRequest {
  // Las palabras de la categoría, tal cual las dijo la persona ("restaurantes"); '' si no dijo ninguna.
  categoryPhrase: string
  general: boolean
  amounts: number[]
  // "unos 300", "más o menos 300", "entre 200 y 300": no es un importe exacto.
  hedged: boolean
  // "-50", "cero euros": un importe que no puede ser.
  negative: boolean
  period: PeriodRequest
}

const NOT_A_STATEMENT = /^(?:cuanto|cuanta|cuantos|cuantas|que|cual|cuales|como|donde|cuando|por que|quien|estamos|hemos|tenemos|hay|es|esta|va|cuantos)\b/

const LEADING = '(?:por favor\\s+)?(?:(?:puedes|podrias|podeis|quiero que|necesito que|me gustaria que|vamos a|hay que|tienes que|pepa)\\s+)?'
const BUDGET_VERBS =
  'crea|crear|creame|pon|ponme|poner|ponle|ponnos|establece|establecer|fija|fijar|define|definir|cambia|cambiar|cambiame|modifica|modificar|actualiza|actualizar|sube|subir|baja|bajar|ajusta|ajustar|aumenta|aumentar|reduce|reducir|haz|hazme|hacer|prepara|preparame|anade|anadir|agrega|agregar|apunta|apuntar|activa|configura|configurar|deja|dejar|limita|limitar|reserva|reservar|asigna|asignar|destina|destinar|dedica|dedicar|quiero|necesito|queremos|necesitamos|dame|damelo|abre'
const BUDGET_NOUN = /\b(?:presupuestos?|limites?|topes?|techos?)\b/
const LEAD_VERB = new RegExp(`^${LEADING}(?:${BUDGET_VERBS})\\b`)
const LEAD_DET = new RegExp(`^${LEADING}(?:un|el|mi|nuestro|otro)\\s+(?:nuevo\\s+)?(?:presupuesto|limite|tope|techo)\\b`)
// Sin la palabra "presupuesto": "pon 300 al mes para restaurantes", "limita ocio a 100": hace falta un gesto de límite
// o de periodo para no confundirlo con apuntar un gasto.
// "Pon 300 euros para restaurantes": con estos verbos y un importe se entiende como fijar un presupuesto, y siempre se
// pregunta lo que falta y se confirma en la tarjeta. Apuntar/añadir un gasto NO está aquí: eso se rechaza.
const SET_VERB = new RegExp('^' + LEADING + '(?:pon|ponme|ponle|ponnos|fija|establece|limita|reserva|asigna|destina|dedica|ajusta|deja|define)\\b')
const LIMIT_CUE = /\b(?:al mes|mensual\w*|cada mes|por mes|todos los meses|de limite|como maximo|maximo|tope|limite|mas de|no pasar\w*|este mes|mes que viene|proximo mes|del mes)\b/
// "no quiero gastar más de 200 en ropa", "queremos gastar como máximo 300 en ocio".
const SPEND_CAP = /\b(?:gast\w+|gasto)\b.*\b(?:mas de|como maximo|maximo|tope|no pasar\w*|no pasarnos\w*|por encima de)\b|\b(?:no pasar\w*|no pasarnos\w*)\b.*\b(?:de|del)\b/

const NEXT_MONTH = /\b(?:mes que viene|proximo mes|mes proximo|siguiente mes|mes siguiente)\b/
const THIS_MONTH = /\b(?:este mes|de este mes|del mes|mes actual|mes en curso)\b/
const MONTHLY = /\b(?:al mes|mensual\w*|cada mes|por mes|todos los meses|mensualmente)\b/
const WEEKLY = /\b(?:semana|semanas|semanal\w*)\b/
const OTHER_PERIOD = /\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ano|anual\w*|trimestr\w*|quincena\w*|mes pasado|ayer|hoy|dia|dias)\b/
const HEDGE = /\b(?:unos|unas|aproximadamente|aprox|mas o menos|alrededor de|entre|cerca de|casi|como)\b(?!\s+maximo)/

const STOP = new Set(
  (
    'de del la el los las un una unos unas para en por a al con que sea sean se llame llamada llamado este esta estos mes meses ' +
    'mensual mensuales mensualmente cada semana semanal proximo siguiente viene euros euro eur presupuesto presupuestos limite limites ' +
    'tope topes techo techos maximo maximos como mas menos gastar gasto gastos gastemos gastamos categoria categorias ' +
    'quiero necesito queremos necesitamos no favor gracias porfa pepa ahora tambien solo ya me nos mi mis nuestro nuestra tu su lo le les y o e ' +
    'entonces vale ok si oye hola hey nuevo nueva otro otra puedes podrias podeis vamos hay tienes todos ' +
    BUDGET_VERBS.split('|').join(' ') +
    ' pasar pasarnos pasarme pasa encima total global general actual curso'
  ).split(' '),
)

function stripped(n: string): string[] {
  return n
    .replace(/€/g, ' ')
    .split(' ')
    .filter((t) => t && !STOP.has(t) && !/\d/.test(t) && !isNumberWord(t))
}

export function parseBudgetRequest(text: string): BudgetRequest | null {
  const n = withoutWakeWord(cleanFinanceText(text))
  if (!n || NOT_A_STATEMENT.test(n)) return null
  const hasNoun = BUDGET_NOUN.test(n)
  const amounts = amountsIn(n)
  const statement = LEAD_VERB.test(n) || LEAD_DET.test(n)
  const cap = SPEND_CAP.test(n) && /^(?:por favor\s+)?(?:no\s+)?(?:quiero|queremos|necesito|necesitamos|vamos a|hay que|voy a|gastar|no)\b/.test(n)
  const limitLike = LIMIT_CUE.test(n)
  const setVerb = SET_VERB.test(n)
  // Debe ser una orden o un deseo sobre un presupuesto/límite; nunca una consulta ni apuntar un gasto.
  if (!((statement && hasNoun) || (statement && amounts.length > 0 && limitLike) || (setVerb && amounts.length > 0) || (cap && amounts.length > 0))) return null

  const period: PeriodRequest = WEEKLY.test(n)
    ? 'weekly'
    : NEXT_MONTH.test(n)
      ? 'next_month'
      : THIS_MONTH.test(n)
        ? 'this_month'
        : MONTHLY.test(n)
          ? 'monthly'
          : OTHER_PERIOD.test(n.replace(NEXT_MONTH, ' ').replace(THIS_MONTH, ' '))
            ? 'other'
            : 'unspecified'

  const words = stripped(n.replace(/\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/g, ' '))
  const general = /\b(?:general|total|global|del mes completo|de todo)\b/.test(n) && words.length === 0
  const negative = /(?:^|\s)-\s?\d/.test(n) || amounts.includes(0)
  return { categoryPhrase: words.join(' '), general, amounts, negative, hedged: HEDGE.test(n) || /\b\d[\d.,]*\s*(?:o|u)\s*\d/.test(n), period }
}

// La IA solo ha ESTRUCTURADO la frase: se traduce a la misma petición que produce el analizador de reglas.
export function requestFromIntent(out: BudgetIntentOutput, text: string): BudgetRequest | null {
  if (out.intent !== 'budget_set') return null
  const period: PeriodRequest = out.period === 'this_month' || out.period === 'next_month' || out.period === 'monthly' || out.period === 'weekly' || out.period === 'other' ? out.period : 'unspecified'
  const said = amountsIn(text)
  return {
    categoryPhrase: out.category ?? '',
    general: out.general,
    amounts: out.amount !== null && said.includes(out.amount) ? [out.amount] : [],
    hedged: false,
    negative: false,
    period,
  }
}

// ─── Respuestas cortas mientras hay una tarjeta o una pregunta pendiente ───

const ADJUST_FILLER = new Set(
  (
    'no mejor pon ponle ponlo ponla que sea sean cambia cambialo cambiala a dejalo dejala en de con hazlo hazla sube subelo baja bajalo ajusta ajustalo ' +
    'y euros euro eur por favor porfa pues bueno vale ok oye pepa el la un una mi importe presupuesto son seria fuera seran mas bien ' +
    'unos unas aproximadamente aprox alrededor cerca casi entre como menos o'
  ).split(' '),
)

// "Mejor 250", "que sean 250", "cámbialo a 250 euros", "250": SOLO un importe (con relleno). Con otra cosa
// dentro, no es un ajuste.
export function parseAdjustAmount(text: string): { amount: number } | { problem: 'ambiguous' | 'invalid' } | null {
  const n = withoutWakeWord(cleanFinanceText(text))
  if (!n) return null
  const leftover = n
    .replace(/€/g, ' ')
    .split(' ')
    .filter((t) => t && !ADJUST_FILLER.has(t) && !/^\d[\d.,]*$/.test(t) && !isNumberWord(t))
  if (leftover.length > 0) return null
  const amounts = amountsIn(n)
  if (amounts.length === 0) return null
  if (amounts.length > 1 || HEDGE.test(n)) return { problem: 'ambiguous' }
  return validAmount(amounts[0]) ? { amount: amounts[0] } : { problem: 'invalid' }
}

// "Sí", "mensual", "este mes", "hazlo" ante "¿Mensual?"; "el mes que viene"; "semanal" (no soportado).
export function parsePeriodReply(text: string): PeriodRequest | 'yes' | 'no' | null {
  const n = withoutWakeWord(cleanFinanceText(text))
  if (!n) return null
  const said = interpretReply(text, { kind: 'action-card' })
  if (said?.type === 'no') return 'no'
  if (WEEKLY.test(n)) return 'weekly'
  if (NEXT_MONTH.test(n)) return 'next_month'
  if (/^(?:(?:si|vale|ok|claro)\s+)?(?:mensual\w*|mensualmente|al mes|cada mes|este mes|del mes|el mes actual)$/.test(n)) return 'this_month'
  if (said?.type === 'yes' || said?.type === 'save') return 'yes'
  return null
}

// ─── Resolver contra lo real ───

export interface BudgetContext {
  categories: BudgetCategory[]
  budgets: Budget[]
  monthStartDay: number
  accountsMode: 'compartido' | 'separado'
}

export interface BudgetDraft {
  categoryPhrase: string
  // El nombre REAL de la categoría, ya resuelto (null = presupuesto general o todavía sin resolver).
  categoryName: string | null
  general: boolean
  amount: number | null
  amountProblem: 'ambiguous' | 'invalid' | null
  // 0 = mes contable en curso, 1 = el siguiente; null = todavía no dicho.
  monthOffset: 0 | 1 | null
  scope: 'personal' | 'comun' | null
}

export type Ask = 'category' | 'category-choice' | 'amount' | 'period'

export type BudgetStep =
  | { kind: 'ask'; ask: Ask; text: string; draft: BudgetDraft; options?: string[] }
  | { kind: 'refuse'; text: string }
  | { kind: 'same'; text: string }
  | { kind: 'ready'; params: BudgetSetParams; text: string; draft: BudgetDraft }

// Todo lo que la tarjeta necesita para enseñarse y, al confirmar, guardar (la acción budget.set).
export interface BudgetSetParams {
  category: string | null
  amount: number
  periodStart: string
  periodLabel: string
  // null = modo Compartido (no hay Individual/Común); en Separado se elige en la tarjeta.
  scope: 'personal' | 'comun' | null
  // Importe que ya hay ahora mismo para esa categoría y mes (por si se cambia), según el dueño.
  existing: { personal: number | null; comun: number | null }
}

export function draftFromRequest(req: BudgetRequest): BudgetDraft {
  const distinct = req.amounts
  let amount: number | null = null
  let amountProblem: BudgetDraft['amountProblem'] = null
  if (req.negative) amountProblem = 'invalid'
  else if (distinct.length > 1 || (req.hedged && distinct.length > 0)) amountProblem = 'ambiguous'
  else if (distinct.length === 1) {
    if (validAmount(distinct[0])) amount = distinct[0]
    else amountProblem = 'invalid'
  }
  return {
    categoryPhrase: req.categoryPhrase,
    categoryName: null,
    general: req.general,
    amount,
    amountProblem,
    monthOffset: req.period === 'next_month' ? 1 : req.period === 'this_month' || req.period === 'monthly' ? 0 : null,
    scope: null,
  }
}

export function periodRefusal(period: PeriodRequest): string | null {
  if (period === 'weekly') return 'De momento solo preparo presupuestos mensuales, no semanales. ¿Lo hago mensual?'
  if (period === 'other') return 'De momento solo preparo presupuestos de este mes o del mes que viene.'
  return null
}

function budgetable(categories: BudgetCategory[]): BudgetCategory[] {
  return categories.filter((c) => c.budgetGroup === BUDGET_GROUP && !isInternalTransferCategory(c.name, categories))
}

function sameMonth(b: Budget, from: string): boolean {
  const a = accountingPeriodLabel(budgetPeriodRange(b).start)
  const t = accountingPeriodLabel(from)
  return a.year === t.year && a.month0 === t.month0
}

export function monthLabel(labelMonth0: number, labelYear: number): string {
  return `${MONTH_LABELS[labelMonth0].toLowerCase()} de ${labelYear}`
}

// El presupuesto ya guardado de esa categoría (o el general) en ese mes contable, según el dueño. En modo
// Separado: 'personal' = el tuyo (con dueño), 'comun' = el de todos (sin dueño); en Compartido no hay dueño que mirar.
export function findBudget(
  category: string | null,
  from: string,
  scope: 'personal' | 'comun' | null,
  budgets: Budget[],
): Budget | null {
  const mine = budgets.filter((b) => b.budgetGroup === BUDGET_GROUP && (b.category || '') === (category ?? '') && sameMonth(b, from))
  if (scope === 'comun') return mine.find((b) => b.ownerMemberId === null) ?? null
  if (scope === 'personal') return mine.find((b) => b.ownerMemberId !== null) ?? null
  return mine[0] ?? null
}

export function existingAmounts(category: string | null, from: string, ctx: Pick<BudgetContext, 'budgets' | 'accountsMode'>): { personal: number | null; comun: number | null } {
  if (ctx.accountsMode === 'separado') {
    return { personal: findBudget(category, from, 'personal', ctx.budgets)?.amount ?? null, comun: findBudget(category, from, 'comun', ctx.budgets)?.amount ?? null }
  }
  return { personal: findBudget(category, from, null, ctx.budgets)?.amount ?? null, comun: null }
}

// El siguiente paso de una petición de presupuesto: preguntar lo que falta, rechazar lo que no se puede o dejarla lista.
export function nextBudgetStep(input: BudgetDraft, ctx: BudgetContext): BudgetStep {
  const draft = { ...input }

  // 1. Categoría (real).
  if (!draft.general && !draft.categoryName) {
    if (!draft.categoryPhrase) {
      return { kind: 'ask', ask: 'category', draft, text: '¿Para qué categoría es el presupuesto?' }
    }
    const spendCats = budgetable(ctx.categories)
    const hit = resolveTarget(draft.categoryPhrase, { categories: spendCats, expenses: [], storeNames: [] })
    if (hit.kind === 'category') draft.categoryName = hit.name
    else if (hit.kind === 'ambiguous') {
      const options = hit.options.slice(0, 5)
      return { kind: 'ask', ask: 'category-choice', draft, options, text: `¿Cuál de estas categorías: ${options.join(', ')}?` }
    } else {
      const isIncome = resolveTarget(draft.categoryPhrase, { categories: ctx.categories.filter((c) => c.budgetGroup !== BUDGET_GROUP), expenses: [], storeNames: [] })
      if (isIncome.kind === 'category') return { kind: 'refuse', text: `«${isIncome.name}» no es una categoría de gasto: los presupuestos son de gasto.` }
      return {
        kind: 'refuse',
        text: `No tengo ninguna categoría de gasto llamada «${draft.categoryPhrase}». Si quieres, créala primero en Economía y luego te preparo el presupuesto.`,
      }
    }
  }

  // 2. Importe.
  if (draft.amount === null) {
    const text =
      draft.amountProblem === 'ambiguous'
        ? 'No me ha quedado claro el importe. ¿De cuántos euros exactamente?'
        : draft.amountProblem === 'invalid'
          ? 'Ese importe no es válido. Dime una cantidad de euros mayor que cero.'
          : '¿De cuántos euros?'
    return { kind: 'ask', ask: 'amount', draft, text }
  }

  // 3. Periodo: los presupuestos son mensuales, como en la pantalla.
  const monthName = monthLabel(accountingMonthRange(ctx.monthStartDay, 0).labelMonth0, accountingMonthRange(ctx.monthStartDay, 0).labelYear)
  if (draft.monthOffset === null) {
    return { kind: 'ask', ask: 'period', draft, text: `¿Mensual, para este mes (${monthName})?` }
  }

  // 4. Preparado.
  const range = accountingMonthRange(ctx.monthStartDay, draft.monthOffset)
  const category = draft.general ? null : draft.categoryName
  const existing = existingAmounts(category, range.from, ctx)
  const scope = ctx.accountsMode === 'separado' ? (draft.scope ?? 'personal') : null
  const current = scope === 'comun' ? existing.comun : existing.personal
  const label = monthLabel(range.labelMonth0, range.labelYear)
  const what = category ?? 'General'
  if (current !== null && current === draft.amount) {
    return { kind: 'same', text: `Ya tienes ese presupuesto: ${what}, ${formatEuros(current)} al mes (${label}). No cambio nada.` }
  }
  const params: BudgetSetParams = { category, amount: draft.amount, periodStart: range.from, periodLabel: label, scope, existing }
  const text =
    current !== null
      ? `Ya tienes un presupuesto de ${what} de ${formatEuros(current)} para ${label}. Preparo el cambio a ${formatEuros(draft.amount)} al mes. Revísalo en la tarjeta y pulsa Confirmar.`
      : `Preparo un presupuesto de ${formatEuros(draft.amount)} al mes para ${what} (${label}). Revísalo en la tarjeta y pulsa Confirmar.`
  return { kind: 'ready', params, text, draft: { ...draft, scope: scope } }
}

// Suena a presupuesto con importe aunque las reglas no sepan estructurarlo (la IA puede intentarlo).
export function budgetSignal(text: string): boolean {
  const n = withoutWakeWord(cleanFinanceText(text))
  return !!n && !NOT_A_STATEMENT.test(n) && BUDGET_NOUN.test(n) && amountsIn(n).length > 0
}

// Las palabras con contenido de una respuesta corta ("restaurantes", "la de ocio").
export function categoryPhraseOf(text: string): string {
  return stripped(withoutWakeWord(cleanFinanceText(text))).join(' ')
}

export function isQuestionLike(text: string): boolean {
  return NOT_A_STATEMENT.test(withoutWakeWord(cleanFinanceText(text)))
}

// ─── Consulta: cuánto queda de los presupuestos del mes (lo mismo que enseña la pantalla) ───

export interface BudgetLeftAnswer {
  text: string
  items: string[]
}

export function budgetLeft(target: string | null, data: FinanceData): BudgetLeftAnswer {
  const range = accountingMonthRange(data.monthStartDay, 0)
  const label = monthLabel(range.labelMonth0, range.labelYear)
  const budgets = (data.budgets ?? []).filter((b) => b.budgetGroup === BUDGET_GROUP && sameMonth(b, range.from))
  if (budgets.length === 0) return { text: `Todavía no hay ningún presupuesto para ${label}.`, items: [] }

  let wanted = budgets
  if (target) {
    const hit = resolveTarget(target, { categories: data.categories, expenses: [], storeNames: [] })
    if (hit.kind === 'category') {
      wanted = budgets.filter((b) => b.category === hit.name)
      if (wanted.length === 0) return { text: `No hay presupuesto de ${hit.name} para ${label}.`, items: [] }
    } else if (hit.kind === 'ambiguous') {
      return { text: `«${target}» puede ser varias categorías: ${hit.options.join(', ')}. ¿Cuál quieres?`, items: [] }
    } else {
      return { text: `No encuentro ninguna categoría llamada «${target}» para mirar su presupuesto.`, items: [] }
    }
  }

  // Mismo cálculo que la pantalla de Presupuestos (budgetSpent); en modo Separado, lo individual y lo común se
  // cuentan con sus propios gastos.
  const separate = data.accountsMode === 'separado'
  const line = (b: Budget): { name: string; text: string } => {
    const expenses = separate ? data.expenses.filter((e) => (b.ownerMemberId === null ? e.shared : !e.shared)) : data.expenses
    const spent = budgetSpent(b, expenses, { categories: data.categories })
    const name = (b.category || 'General') + (separate ? (b.ownerMemberId === null ? ' (común)' : ' (individual)') : '')
    const left = b.amount - spent
    return {
      name,
      text:
        left >= 0
          ? `Os quedan ${formatEuros(left)} del presupuesto de ${name} (${formatEuros(b.amount)} al mes; lleváis ${formatEuros(spent)} en ${label}).`
          : `Os habéis pasado ${formatEuros(-left)} del presupuesto de ${name} (${formatEuros(b.amount)} al mes; lleváis ${formatEuros(spent)} en ${label}).`,
    }
  }
  const lines = wanted.slice(0, 6).map(line)
  if (lines.length === 1) return { text: lines[0].text, items: [lines[0].name] }
  const more = wanted.length > 6 ? `\n… y ${wanted.length - 6} más.` : ''
  return { text: `Presupuestos de ${label}:\n${lines.map((l) => `• ${l.text}`).join('\n')}${more}`, items: lines.map((l) => l.name) }
}
