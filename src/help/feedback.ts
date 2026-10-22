// «¿Te ha servido?» de la Ayuda: contadores AGREGADOS por ficha y día (cuántas personas dijeron sí y cuántas no). NO se guarda quién respondió, ni la pregunta escrita, ni nada de la
// conversación: solo el identificador de la ficha y un sí/no. Necesita la migración 0306 (supabase/pending-migrations/0306_help_feedback_and_prefs.sql); hasta que esté aplicada y se
// encienda este interruptor, los botones NO se muestran y no se envía nada.
export const HELP_FEEDBACK_ENABLED = false

const CARD_ID = /^[a-z0-9:-]{3,60}$/
const DAILY_CAP = 25
const answered = new Set<string>() // en memoria: una respuesta por ficha y sesión de la app
let sentToday = 0
let sentDay = ''

export function canSendFeedback(cardId: string, today: string): boolean {
  if (sentDay !== today) {
    sentDay = today
    sentToday = 0
  }
  return CARD_ID.test(cardId) && !answered.has(cardId) && sentToday < DAILY_CAP
}

export async function recordHelpFeedback(cardId: string, useful: boolean, today = new Date().toISOString().slice(0, 10)): Promise<'sent' | 'skipped' | 'error'> {
  if (!HELP_FEEDBACK_ENABLED || !canSendFeedback(cardId, today)) return 'skipped'
  answered.add(cardId)
  sentToday += 1
  const { supabase } = await import('@/data/supabaseClient')
  const { error } = await supabase.rpc('record_help_feedback', { p_card_id: cardId, p_useful: useful })
  return error ? 'error' : 'sent'
}

// Solo para pruebas.
export function resetFeedbackForTests(): void {
  answered.clear()
  sentToday = 0
  sentDay = ''
}

// Resumen agregado para el Centro de Administración (solo propietarias; el servidor lo impone). Sin migración devuelve null.
export interface HelpFeedbackRow {
  cardId: string
  useful: number
  notUseful: number
}

export async function loadHelpFeedbackSummary(days = 30): Promise<HelpFeedbackRow[] | null> {
  const { supabase } = await import('@/data/supabaseClient')
  const { data, error } = await supabase.rpc('help_feedback_summary', { p_days: days })
  if (error) return null
  return ((data ?? []) as { card_id: string; useful: number; not_useful: number }[]).map((r) => ({ cardId: r.card_id, useful: Number(r.useful), notUseful: Number(r.not_useful) }))
}
