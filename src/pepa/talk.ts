// "Hablar con PEPA": un solo sitio donde decir cualquier cosa. Reutiliza la
// lógica de siempre y la ordena así:
//
//   1. Cocina (reglas): ¿qué cenamos hoy?, pon tortilla el viernes...
//   2. Enrutado por reglas (domain/talkRoute): preguntar por calendario o
//      compra, apuntar en la compra, apuntar en el calendario.
//   3. Solo si las reglas no entienden la frase: la IA, y solo para entender
//      PREGUNTAS (nunca escribe nada).
//   4. Si nada de eso funciona, Pepa dice qué no ha entendido — igual que
//      hoy con los botones de siempre.
//
// Consultar no confirma. TODA escritura sale como propuesta (ActionProposal)
// que hay que confirmar en la tarjeta; aquí no se escribe nada.
import { extractShoppingStore } from '@/domain/voiceQuery'
import { splitEntries } from '@/domain/quickCapture'
import { expandEntries, shouldAskAi } from '@/domain/productSplit'
import { isoDate, kitchenDateLabel } from '@/domain/kitchenQuery'
import { routeTalk } from '@/domain/talkRoute'
import { cleanShoppingText, extractTrailingStore, prepareCalendarFromText } from '@/domain/talkParse'
import type { KitchenOutcome } from '@/pepa/kitchen'
import { proposeAction } from '@/pepa/actions/registry'
import type { ActionContext, ActionProposal } from '@/pepa/actions/types'
import type { Recipe } from '@/domain/types'
import type { RecipeRequest } from '@/pepa/recentContext'

export type TalkOutcome =
  // keepPending: la respuesta aclara algo sobre lo que hay abierto (p. ej. un importe dudoso ante la tarjeta de
  // presupuesto) y NO lo cierra.
  | { kind: 'answer'; text: string; keepPending?: boolean }
  | { kind: 'proposal'; text: string; proposal: ActionProposal }
  | { kind: 'focus-store'; store: string; text: string }
  // Receta que no existe: ofrece prepararla (la IA solo se llama si la persona acepta).
  | { kind: 'recipe-offer'; text: string; request: RecipeRequest }
  // Pregunta de tienda al añadir los ingredientes de una receta.
  | { kind: 'store-question'; text: string; recipe: Recipe; recipes: Recipe[]; stores: string[] }

export interface AiQuestion {
  intent: 'tasks_today' | 'next_calendar_event' | 'shopping_list' | 'none'
  explicitDate: string | null
  when: 'today' | 'tomorrow'
  memberHint: string | null
  storeHint: string | null
  nowOnly: boolean
}

export interface TalkDeps {
  today(): Date
  kitchen(text: string): Promise<KitchenOutcome | null>
  // Economía, presupuestos: prepara (nunca guarda) una tarjeta de confirmación o hace una pregunta. null = no es de eso.
  financeAction?(text: string): Promise<TalkOutcome | null>
  // Economía (solo consulta): devuelve la respuesta, o null si la frase no es de Economía.
  finance?(text: string): Promise<string | null>
  forgetFinance?(): void
  storeNames(): Promise<string[]>
  members(): Promise<{ id: string; name: string }[]>
  // Las respuestas a preguntas las construye el código de siempre.
  answerCalendar(text: string): Promise<string>
  answerShopping(text: string, storeNames: string[]): Promise<string>
  // IA solo para entender preguntas cuando las reglas no bastan.
  classifyWithAi(text: string, today: string): Promise<AiQuestion>
  answerFromAi(question: AiQuestion, text: string): Promise<string | null>
  splitWithAi(text: string): Promise<string[]>
}

export const NOT_UNDERSTOOD =
  'No lo he entendido. Prueba, por ejemplo: «qué tengo mañana», «añade leche y pan a Mercadona», «dentista el viernes a las cinco» o «qué cenamos hoy».'

const DELETE_NOTICE = 'Todavía no puedo borrar citas hablando — ábrela en el calendario y pulsa "Borrar".'

function baseContext(today: Date, members: { id: string; name: string }[] = []): ActionContext {
  return { recipes: [], menuEntries: [], shoppingItemNames: [], members, today }
}

async function shoppingProposal(text: string, storeNames: string[], deps: TalkDeps, today: Date): Promise<TalkOutcome> {
  const known = extractShoppingStore(text, storeNames)
  let store = known.store
  let rest = known.text
  // Una tienda que todavía no está dada de alta, dicha al final: "...pan a Mercadona".
  if (!store) {
    const memberNames = (await deps.members()).map((m) => m.name)
    const trailing = extractTrailingStore(rest, memberNames)
    store = trailing.store
    rest = trailing.text
  }
  // Primero reglas: comas, " y " y, si la transcripción ha pegado productos
  // ("leche huevo"), el reconocimiento de productos habituales.
  const expanded = expandEntries(splitEntries(cleanShoppingText(rest)))
  let entries = expanded.entries
  if (entries.length === 0) {
    // Solo se ha dicho la tienda ("Mercadona"): se abre su lista, sin escribir.
    if (store) return { kind: 'focus-store', store, text: `Aquí tienes la lista de la compra de ${store}.` }
    return { kind: 'answer', text: NOT_UNDERSTOOD }
  }
  // La IA de separación (mismo respaldo de siempre, con su cuota y su interruptor)
  // solo entra si tras las reglas queda algo dudoso que puede ser varios productos
  // (palabras que no reconoce). Como mucho dos consultas; si falla, se deja tal cual.
  let aiCalls = 0
  for (const dubious of expanded.ambiguous) {
    if (aiCalls >= 2 || !shouldAskAi(dubious, entries.length)) continue
    aiCalls++
    try {
      const split = await deps.splitWithAi(dubious)
      const at = entries.indexOf(dubious)
      if (split.length > 1 && at >= 0) entries = [...entries.slice(0, at), ...split, ...entries.slice(at + 1)]
    } catch {
      // Sin IA no pasa nada.
    }
  }
  const result = proposeAction('shopping.add', { store, items: entries, skipped: [] }, baseContext(today))
  if (!result.ok) return { kind: 'answer', text: `No he podido preparar eso: ${result.errors[0]}` }
  const where = store ? ` de ${store}` : ''
  return {
    kind: 'proposal',
    proposal: result.proposal,
    text: `Voy a añadir a la lista de la compra${where}: ${entries.join(', ')}. Revísalo en la tarjeta y pulsa Añadir.`,
  }
}

async function calendarProposal(text: string, deps: TalkDeps, today: Date): Promise<TalkOutcome> {
  const members = await deps.members()
  const prepared = prepareCalendarFromText(text, today, members)
  const context = baseContext(today, members)
  const result = proposeAction(
    'calendar.create',
    {
      title: prepared.title,
      date: prepared.date,
      time: prepared.time,
      endTime: prepared.endTime,
      memberId: prepared.memberId,
      recurrenceRule: prepared.recurrenceRule,
      reminders: prepared.reminders,
      notes: prepared.notes,
    },
    context,
  )
  if (!result.ok) return { kind: 'answer', text: `No he podido preparar eso: ${result.errors[0]}` }
  const who = prepared.memberId ? ` para ${members.find((m) => m.id === prepared.memberId)?.name ?? ''}` : ''
  const when = prepared.time ? ` a las ${prepared.time}` : ''
  const notes = prepared.notes.length > 0 ? ` ${prepared.notes.join(' ')}` : ''
  return {
    kind: 'proposal',
    proposal: result.proposal,
    text: `Voy a apuntar en el calendario «${prepared.title}» ${kitchenDateLabel(prepared.date, today)}${when}${who}. Revísalo en la tarjeta y pulsa Guardar.${notes}`,
  }
}

async function askWithAi(text: string, deps: TalkDeps, today: Date): Promise<TalkOutcome> {
  try {
    const question = await deps.classifyWithAi(text, isoDate(today))
    if (question.intent !== 'none') {
      const answer = await deps.answerFromAi(question, text)
      if (answer) return { kind: 'answer', text: answer }
    }
  } catch {
    // IA apagada, sin cupo, cuenta no adulta, sin red...: Pepa sigue
    // funcionando con lo que entienden las reglas.
  }
  return { kind: 'answer', text: NOT_UNDERSTOOD }
}

export async function runTalk(text: string, deps: TalkDeps): Promise<TalkOutcome> {
  const today = deps.today()

  // Presupuestos por voz (preparar, con confirmación) antes que las consultas: son órdenes, no preguntas.
  if (deps.financeAction) {
    const action = await deps.financeAction(text)
    if (action) return action
  }

  // Economía primero: sus preguntas ("cuánto hemos gastado en Mercadona") llevan palabras que el
  // router de compra/calendario confundiría. Si no es de Economía, su contexto corto se olvida.
  if (deps.finance) {
    const finance = await deps.finance(text)
    if (finance !== null) return { kind: 'answer', text: finance }
    deps.forgetFinance?.()
  }

  const kitchen = await deps.kitchen(text)
  if (kitchen) return kitchen

  const storeNames = await deps.storeNames()
  switch (routeTalk(text, storeNames, today)) {
    case 'delete':
      return { kind: 'answer', text: DELETE_NOTICE }
    case 'ask_calendar':
      return { kind: 'answer', text: await deps.answerCalendar(text) }
    case 'ask_shopping':
      return { kind: 'answer', text: await deps.answerShopping(text, storeNames) }
    case 'add_shopping':
      return shoppingProposal(text, storeNames, deps, today)
    case 'add_calendar':
      return calendarProposal(text, deps, today)
    default:
      return askWithAi(text, deps, today)
  }
}
