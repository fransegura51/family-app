// Pide a la IA que ESTRUCTURE (no que calcule) una pregunta de Economía que las reglas no han sabido
// entender. Pasa por la capa central de IA (función "finance-intent"): adultos, interruptor, tope y
// contadores incluidos.
//
// Qué viaja: SOLO la frase de la persona (con los nombres de familiares cambiados por alias) y la fecha de
// hoy. Ningún movimiento, importe, saldo, categoría, tienda ni dato de otros módulos. Lo que vuelve se valida
// con el mismo núcleo que usa el servidor (listas cerradas, y el filtro tiene que estar en la frase), y
// después el código lo resuelve contra los datos reales.
//
// Si la IA no está disponible o su respuesta no es válida, devuelve null y PEPA lo dice sin adivinar.
import { toDateStr } from '@/domain/dateRanges'
import { validateIntentOutput, type IntentOutput } from '../../supabase/functions/_shared/ai/purposes/financeIntentCore.ts'
import { callAiFunction, loadAliasMap } from '@/services/aiClient'

export async function classifyFinanceIntent(text: string, today: Date): Promise<IntentOutput | null> {
  try {
    const alias = await loadAliasMap()
    const sent = alias.aliasize(text.replace(/\s+/g, ' ').trim())
    const json = await callAiFunction('finance-intent', { text: sent, today: toDateStr(today) })
    const valid = validateIntentOutput(json, sent)
    if (!valid) return null
    // Un filtro que sea un alias ("Persona A") no significa nada fuera de la frase: se devuelve con el nombre real.
    return valid.filter ? { ...valid, filter: alias.restore(valid.filter) } : valid
  } catch {
    return null
  }
}
