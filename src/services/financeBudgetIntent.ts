// Pide a la IA que ESTRUCTURE (no que ejecute) una petición de presupuesto que las reglas no han sabido
// entender. Pasa por la capa central de IA (función "finance-budget-intent"): adultos, interruptor, tope y
// contadores incluidos.
//
// Qué viaja: SOLO la frase de la persona (con los nombres de familiares cambiados por alias) y la fecha de
// hoy. Ningún movimiento, importe de la familia, saldo, categoría real ni dato de otros módulos. Lo que
// vuelve se valida con el mismo núcleo que usa el servidor (el importe tiene que ser uno de los dichos, la
// categoría tiene que estar en la frase) y después el código lo resuelve contra los datos reales.
//
// Si la IA no está disponible o su respuesta no es válida, devuelve null y PEPA lo dice sin adivinar.
import { toDateStr } from '@/domain/dateRanges'
import { validateBudgetIntentOutput, type BudgetIntentOutput } from '../../supabase/functions/_shared/ai/purposes/financeBudgetIntentCore.ts'
import { callAiFunction, loadAliasMap } from '@/services/aiClient'

export async function classifyBudgetIntent(text: string, today: Date): Promise<BudgetIntentOutput | null> {
  try {
    const alias = await loadAliasMap()
    const sent = alias.aliasize(text.replace(/\s+/g, ' ').trim())
    const json = await callAiFunction('finance-budget-intent', { text: sent, today: toDateStr(today) })
    const valid = validateBudgetIntentOutput(json, sent)
    if (!valid) return null
    return valid.category ? { ...valid, category: alias.restore(valid.category) } : valid
  } catch {
    return null
  }
}
