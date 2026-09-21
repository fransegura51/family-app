// Pide a la IA que SELECCIONE y REDACTE un análisis de Economía a partir de hechos ya calculados por
// PEPA. Pasa por la capa central de IA (función "finance-analysis"): adultos, interruptor, tope y
// contadores incluidos.
//
// Qué viaja: SOLO la lista de hechos agregados (periodo, totales, categorías principales con sus
// importes, ahorro, avisos de calidad de datos). Nunca movimientos, conceptos bancarios, IBAN, titulares,
// tickets, comercios, productos ni datos de otros módulos. Si el nombre de una categoría llevara el de un
// familiar, se sustituye por un alias (el texto final se compone en local con los nombres reales).
//
// Si la IA no está disponible o su respuesta no supera la validación, devuelve null y PEPA contesta con el
// análisis hecho por código.
import type { AnalysisFact } from '@/domain/financeAnalysis'
import { validateAiAnalysis, type AiAnalysisOutput, type AnalysisFocus } from '@/domain/financeAnalysisAi'
import { callAiFunction, loadAliasMap } from '@/services/aiClient'

export async function requestFinanceAnalysis(focus: AnalysisFocus, facts: AnalysisFact[]): Promise<AiAnalysisOutput | null> {
  try {
    const alias = await loadAliasMap()
    const sent = facts.map((f) => (f.kind === 'text' ? { ...f, value: alias.aliasize(String(f.value)) } : f))
    const json = await callAiFunction('finance-analysis', { focus, facts: sent })
    // Segunda comprobación en la app, con el mismo núcleo que el servidor y con los hechos ORIGINALES.
    return validateAiAnalysis(json, facts)
  } catch {
    return null
  }
}
