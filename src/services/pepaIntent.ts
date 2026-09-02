// Respaldo con IA (Gemini, nivel gratuito) para el botón 🐣 Pepa cuando
// el reconocimiento local por patrones no entiende la pregunta —
// petición real: "que utilicen la IA que tenemos gratuita... que
// reconozca ese tipo de cosas por si cambia alguna palabra". Solo se
// llama cuando el reconocimiento local ya ha fallado.
import { supabase } from '@/data/supabaseClient'

export interface AiIntentResult {
  intent: 'tasks_today' | 'next_calendar_event' | 'shopping_list' | 'none'
  explicitDate: string | null
  when: 'today' | 'tomorrow'
  memberHint: string | null
  storeHint: string | null
  nowOnly: boolean
}

export async function classifyQuestionWithAi(text: string, today: string): Promise<AiIntentResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No autenticado')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const res = await fetch(`${supabaseUrl}/functions/v1/pepa-intent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text, today }),
  })
  if (!res.ok) throw new Error('No se pudo consultar la IA')
  const json = await res.json()
  return {
    intent: ['tasks_today', 'next_calendar_event', 'shopping_list', 'none'].includes(json.intent) ? json.intent : 'none',
    explicitDate: typeof json.explicitDate === 'string' ? json.explicitDate : null,
    when: json.when === 'tomorrow' ? 'tomorrow' : 'today',
    memberHint: typeof json.memberHint === 'string' ? json.memberHint : null,
    storeHint: typeof json.storeHint === 'string' ? json.storeHint : null,
    nowOnly: json.nowOnly === true,
  }
}
