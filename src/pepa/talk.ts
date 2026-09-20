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
import { isoDate, kitchenDateLabel } from '@/domain/kitchenQuery'
import { routeTalk } from '@/domain/talkRoute'
import { cleanShoppingText, extractTrailingStore, prepareCalendarFromText } from '@/domain/talkParse'
import type { KitchenOutcome } from '@/pepa/kitchen'
import { proposeAction } from '@/pepa/actions/registry'
import type { ActionContext, ActionProposal } from '@/pepa/actions/types'
import type { RecipeRequest } from '@/pepa/recentContext'

export type TalkOutcome =
  | { kind: 'answer'; text: string }
  | { kind: 'proposal'; text: string; proposal: ActionProposal }
  | { kind: 'focus-store'; store: string; text: string }
  // Receta que no existe: ofrece prepararla (la IA solo se llama si la persona acepta).
  | { kind: 'recipe-offer'; text: string; request: RecipeRequest }

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
  let entries = splitEntries(cleanShoppingText(rest))
  if (entries.length === 0) {
    // Solo se ha dicho la tienda ("Mercadona"): se abre su lista, sin escribir.
    if (store) return { kind: 'focus-store', store, text: `Aquí tienes la lista de la compra de ${store}.` }
    return { kind: 'answer', text: NOT_UNDERSTOOD }
  }
  // Una lista dictada de un tirón, sin comas: se prueba a separarla con IA
  // (mismo respaldo de siempre); si falla se deja como un solo producto.
  if (entries.length === 1 && entries[0].includes(' ')) {
    try {
      const split = await deps.splitWithAi(entries[0])
      if (split.length > 1) entries = split
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
