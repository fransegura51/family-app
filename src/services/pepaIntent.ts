// Respaldo con IA (Gemini, nivel gratuito) para el botón 🐣 Pepa cuando el
// reconocimiento local por patrones no entiende la pregunta — petición
// real: "que utilicen la IA que tenemos gratuita... que reconozca ese tipo
// de cosas por si cambia alguna palabra". Solo se llama cuando el
// reconocimiento local ya ha fallado. Los nombres de la familia viajan como
// alias.
import { callAiFunction, loadAliasMap } from '@/services/aiClient'

export interface AiIntentResult {
  intent: 'tasks_today' | 'next_calendar_event' | 'shopping_list' | 'weather' | 'none'
  explicitDate: string | null
  when: 'today' | 'tomorrow'
  memberHint: string | null
  storeHint: string | null
  nowOnly: boolean
  // Solo para intent="weather" — el sitio del que se pregunta, tal como se ha dicho.
  placeHint: string | null
}

export async function classifyQuestionWithAi(text: string, today: string): Promise<AiIntentResult> {
  const alias = await loadAliasMap()
  const json = (await callAiFunction('pepa-intent', { text: alias.aliasize(text), today })) as Record<string, unknown>
  return {
    intent: ['tasks_today', 'next_calendar_event', 'shopping_list', 'weather', 'none'].includes(json.intent as string)
      ? (json.intent as AiIntentResult['intent'])
      : 'none',
    explicitDate: typeof json.explicitDate === 'string' ? json.explicitDate : null,
    when: json.when === 'tomorrow' ? 'tomorrow' : 'today',
    memberHint: typeof json.memberHint === 'string' ? alias.restore(json.memberHint) : null,
    storeHint: typeof json.storeHint === 'string' ? json.storeHint : null,
    nowOnly: json.nowOnly === true,
    placeHint: typeof json.placeHint === 'string' ? alias.restore(json.placeHint) : null,
  }
}
