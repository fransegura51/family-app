// Economía por voz: PREPARAR presupuestos (crear o cambiar el importe). Nunca escribe por sí mismo:
//
//   frase -> reglas (o, si no bastan, la IA solo ESTRUCTURA) -> validación contra las categorías y los
//   presupuestos reales -> pregunta si falta algo -> tarjeta de confirmación -> la persona confirma ->
//   la acción budget.set escribe con las funciones de datos de siempre.
//
// Lo único que se recuerda es la petición en curso (una pregunta pendiente o la tarjeta abierta), en memoria del
// navegador y solo 10 minutos. Otra tarea la olvida; cancelar no cambia nada. La IA nunca ve datos financieros.
import { getAccountsMode, getFinanceMonthStartDay } from '@/data/family'
import { listBudgetCategories, listBudgets } from '@/data/finance'
import {
  budgetSignal,
  categoryPhraseOf,
  draftFromRequest,
  isMoneyMoveRequest,
  isQuestionLike,
  MONEY_MOVE_REFUSED,
  nextBudgetStep,
  parseAdjustAmount,
  parseBudgetRequest,
  parsePeriodReply,
  periodRefusal,
  requestFromIntent,
  type Ask,
  type BudgetContext,
  type BudgetDraft,
  type BudgetSetParams,
  type BudgetStep,
} from '@/domain/financeBudget'
import { formatEuros } from '@/domain/financeCompute'
import { cleanFinanceText, baseQuery, withoutWakeWord } from '@/domain/financeQuery'
import { normalize } from '@/domain/voiceQuery'
import { proposeAction } from '@/pepa/actions/registry'
import { canAccessFinance, FINANCE_NO_ACCESS, rememberFinanceQuery } from '@/pepa/finance'
import { pendingActionIds, registerDialog } from '@/pepa/dialog'
import type { TalkOutcome } from '@/pepa/talk'
import { classifyBudgetIntent } from '@/services/financeBudgetIntent'
import { recordPepaAnswer } from '@/services/pepaUsage'
import type { BudgetIntentOutput } from '../../supabase/functions/_shared/ai/purposes/financeBudgetIntentCore.ts'

export interface BudgetActionDeps {
  canAccess(): Promise<boolean>
  load(): Promise<BudgetContext>
  // Solo cuando las reglas no ubican la categoría: la IA ESTRUCTURA la frase (nunca ejecuta ni ve datos).
  interpret?(text: string, today: Date): Promise<BudgetIntentOutput | null>
  // Contador de respuestas (solo números).
  record?(fn: string, usedAi: boolean): void
  // Tras guardar de verdad (para que "¿cuánto me queda?" hable de ese presupuesto).
  onSaved?(category: string | null): void
}

const TTL_MS = 10 * 60 * 1000
const FAILED = 'No he podido preparar el presupuesto ahora mismo. Inténtalo de nuevo en un momento.'
const CANCELLED = 'Vale, no preparo ningún presupuesto.'

const defaultDeps: BudgetActionDeps = {
  canAccess: canAccessFinance,
  async load() {
    const [categories, budgets, monthStartDay, accountsMode] = await Promise.all([listBudgetCategories(), listBudgets(), getFinanceMonthStartDay(), getAccountsMode()])
    return { categories, budgets, monthStartDay, accountsMode }
  },
  interpret: classifyBudgetIntent,
  record: recordPepaAnswer,
  onSaved: (category) => rememberFinanceQuery(baseQuery('budget_left', { target: category })),
}

// ─── Lo que se recuerda de la petición en curso ───

interface Clarify {
  draft: BudgetDraft
  ask: Ask
  options?: string[]
  at: number
  release: () => void
}
let clarify: Clarify | null = null
// El borrador de la tarjeta abierta: permite "mejor 250" sin empezar de nuevo.
let cardDraft: { draft: BudgetDraft; at: number } | null = null

function clearClarify(): void {
  clarify?.release()
  clarify = null
}

export function forgetBudgetActions(): void {
  clearClarify()
  cardDraft = null
}

function liveClarify(): Clarify | null {
  if (clarify && Date.now() - clarify.at > TTL_MS) clearClarify()
  return clarify
}

function liveCardDraft(): BudgetDraft | null {
  if (!cardDraft || Date.now() - cardDraft.at > TTL_MS) return null
  // Solo si lo abierto en pantalla ES la tarjeta de presupuesto (una única).
  const open = pendingActionIds()
  return open.length === 1 && open[0] === 'budget.set' ? cardDraft.draft : null
}

const answer = (text: string, keepPending = false): TalkOutcome => ({ kind: 'answer', text, ...(keepPending ? { keepPending: true } : {}) })

function ask(step: Extract<BudgetStep, { kind: 'ask' }>): TalkOutcome {
  clearClarify()
  const release = registerDialog(() => ({
    kind: 'finance-clarify',
    cancel: () => {
      forgetBudgetActions()
      return CANCELLED
    },
  }))
  clarify = { draft: step.draft, ask: step.ask, options: step.options, at: Date.now(), release }
  return answer(step.text)
}

// Convierte el paso resuelto en lo que ve la persona: pregunta, rechazo, aviso o tarjeta.
function present(step: BudgetStep, today: Date, deps: BudgetActionDeps): TalkOutcome {
  if (step.kind === 'ask') return ask(step)
  forgetBudgetActions()
  if (step.kind === 'refuse' || step.kind === 'same') return answer(step.text)

  const result = proposeAction('budget.set', step.params, { recipes: [], menuEntries: [], shoppingItemNames: [], members: [], today })
  if (!result.ok) return answer(`No he podido preparar ese presupuesto: ${result.errors[0]}`)
  const inner = result.proposal.confirm
  const params: BudgetSetParams = step.params
  // Solo cuando se guarda de verdad: se olvida el borrador y se recuerda el presupuesto para consultarlo.
  result.proposal.confirm = async (selection) => {
    const message = await inner(selection)
    cardDraft = null
    deps.onSaved?.(params.category)
    return message
  }
  cardDraft = { draft: step.draft, at: Date.now() }
  return { kind: 'proposal', text: step.text, proposal: result.proposal }
}

// ─── Empezar, continuar, ajustar ───

async function resolve(draft: BudgetDraft, text: string, today: Date, deps: BudgetActionDeps, allowAi: boolean): Promise<TalkOutcome> {
  const ctx = await deps.load()
  let step = nextBudgetStep(draft, ctx)
  let usedAi = false
  // La categoría dicha no existe (o no se entiende): antes de rendirse, la IA puede ESTRUCTURAR la frase.
  if (allowAi && step.kind === 'refuse' && deps.interpret) {
    const out = await deps.interpret(text, today).catch(() => null)
    const req = out ? requestFromIntent(out, text) : null
    if (req) {
      usedAi = true
      const fromAi = draftFromRequest(req)
      const merged: BudgetDraft = { ...fromAi, amount: fromAi.amount ?? draft.amount, amountProblem: fromAi.amount === null ? draft.amountProblem : null, monthOffset: fromAi.monthOffset ?? draft.monthOffset }
      const second = nextBudgetStep(merged, ctx)
      if (second.kind !== 'refuse') step = second
    }
  }
  deps.record?.('finance.budget', usedAi)
  return present(step, today, deps)
}

async function start(text: string, today: Date, deps: BudgetActionDeps): Promise<TalkOutcome | null> {
  const req = parseBudgetRequest(text)
  if (!req) {
    // Las reglas no la estructuran, pero suena a presupuesto con importe: que la IA lo intente (o nada).
    if (!budgetSignal(text) || !deps.interpret) return null
    if (!(await deps.canAccess())) return answer(FINANCE_NO_ACCESS)
    const out = await deps.interpret(text, today).catch(() => null)
    const fromAi = out ? requestFromIntent(out, text) : null
    if (!fromAi) return null
    deps.record?.('finance.budget', true)
    return present(nextBudgetStep(draftFromRequest(fromAi), await deps.load()), today, deps)
  }
  if (!(await deps.canAccess())) return answer(FINANCE_NO_ACCESS)
  const refusal = periodRefusal(req.period)
  if (req.period === 'other') return answer(refusal ?? FAILED)
  const draft = draftFromRequest(req)
  if (req.period === 'weekly') {
    // Los presupuestos son mensuales: se avisa y se pregunta si lo quiere mensual, sin adivinar.
    const step = nextBudgetStep(draft, await deps.load())
    return present(step.kind === 'ask' && step.ask === 'period' ? { ...step, text: refusal ?? step.text } : step, today, deps)
  }
  return resolve(draft, text, today, deps, true)
}

const NO_REPLY = /^(?:no|nop|cancela\w*|olvidalo|dejalo|mejor no|no gracias|da igual)$/

async function continueClarify(text: string, today: Date, deps: BudgetActionDeps): Promise<TalkOutcome | null> {
  const pending = liveClarify()
  if (!pending) return null
  const n = withoutWakeWord(cleanFinanceText(text))
  if (NO_REPLY.test(n)) {
    forgetBudgetActions()
    return answer(CANCELLED)
  }
  const draft = { ...pending.draft }

  if (pending.ask === 'period') {
    const reply = parsePeriodReply(text)
    if (reply === null) return null
    if (reply === 'no') {
      forgetBudgetActions()
      return answer(CANCELLED)
    }
    if (reply === 'weekly' || reply === 'other') return ask({ kind: 'ask', ask: 'period', draft, text: periodRefusal(reply) ?? '¿Mensual?' })
    draft.monthOffset = reply === 'next_month' ? 1 : 0
    return resolve(draft, text, today, deps, false)
  }

  if (pending.ask === 'amount') {
    const adjust = parseAdjustAmount(text)
    if (adjust === null) return null
    if ('problem' in adjust) {
      draft.amount = null
      draft.amountProblem = adjust.problem
    } else {
      draft.amount = adjust.amount
      draft.amountProblem = null
    }
    return resolve(draft, text, today, deps, false)
  }

  if (pending.ask === 'category-choice') {
    const said = categoryPhraseOf(text)
    const options = (pending.options ?? []).filter((o) => said.length > 0 && said.split(' ').every((w) => normalize(o).split(/[^a-z0-9ñ]+/).includes(w)))
    if (options.length === 1) {
      draft.categoryName = options[0]
      return resolve(draft, text, today, deps, false)
    }
    // Sigue habiendo varias: se vuelve a preguntar solo entre esas.
    if (options.length > 1) return ask({ kind: 'ask', ask: 'category-choice', draft, options, text: '¿Cuál de estas categorías: ' + options.join(', ') + '?' })
    return null
  }

  // ask === 'category': una respuesta corta con el nombre de la categoría.
  const phrase = categoryPhraseOf(text)
  if (!phrase || phrase.split(' ').length > 3 || isQuestionLike(text)) return null
  draft.categoryPhrase = phrase
  return resolve(draft, text, today, deps, false)
}

// "Mejor 250" con la tarjeta de presupuesto abierta: se actualiza la PROPUESTA (nueva tarjeta); no se guarda nada.
async function adjustCard(text: string, today: Date, deps: BudgetActionDeps): Promise<TalkOutcome | null> {
  const draft = liveCardDraft()
  if (!draft) return null
  const adjust = parseAdjustAmount(text)
  if (adjust === null) return null
  if ('problem' in adjust) {
    return answer(
      adjust.problem === 'ambiguous' ? 'No me ha quedado claro el importe. ¿De cuántos euros exactamente? La tarjeta sigue como estaba.' : 'Ese importe no es válido. La tarjeta sigue como estaba.',
      true,
    )
  }
  const ctx = await deps.load()
  const step = nextBudgetStep({ ...draft, amount: adjust.amount, amountProblem: null }, ctx)
  if (step.kind === 'ready') return present({ ...step, text: `Vale, lo dejo en ${formatEuros(adjust.amount)} al mes. Todavía no he guardado nada: revisa la tarjeta y pulsa Confirmar.` }, today, deps)
  return present(step, today, deps)
}

// Punto de entrada. Devuelve la respuesta (pregunta, aviso o tarjeta), o null si la frase no es de presupuestos.
export async function handleBudgetAction(text: string, today: Date = new Date(), deps: BudgetActionDeps = defaultDeps): Promise<TalkOutcome | null> {
  try {
    if (isMoneyMoveRequest(text)) {
      forgetBudgetActions()
      return answer(MONEY_MOVE_REFUSED)
    }
    const followUp = (await continueClarify(text, today, deps)) ?? (await adjustCard(text, today, deps))
    if (followUp) return followUp
    // Otra tarea: lo que estaba a medias se abandona (la tarjeta abierta la cierra quien la muestra).
    forgetBudgetActions()
    return await start(text, today, deps)
  } catch {
    forgetBudgetActions()
    return answer(FAILED)
  }
}
