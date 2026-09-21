// La IA NO escribe cifras. Recibe hechos agregados con una referencia ("expenses.total") y contesta
// con un JSON donde cada cifra, nombre o periodo aparece como una referencia entre llaves dobles
// ("{{expenses.total}}"). Este módulo:
//   1. valida esa respuesta con EL MISMO núcleo que usa el servidor (formato, referencias que existen,
//      ningún dígito suelto, nada de juicios ni de órdenes financieras);
//   2. compone el texto final poniendo los valores REALES calculados por PEPA.
// Si algo no cuadra, se descarta la respuesta de la IA y PEPA contesta con el texto de código.
import { formatEuros, formatPercent, signedEuros } from '@/domain/financeCompute'
import {
  numericRefsOf,
  tokensIn,
  validateAnalysisOutput,
  type AiAnalysisOutput,
  type AiFinding,
  type AnalysisFact,
  type AnalysisFocus,
  type FindingType,
} from '../../supabase/functions/_shared/ai/purposes/financeAnalysisCore.ts'

export { FINDING_TYPES } from '../../supabase/functions/_shared/ai/purposes/financeAnalysisCore.ts'
export type { AiAnalysisOutput, AiFinding, AnalysisFocus, FindingType }
export { tokensIn }

export function validateAiAnalysis(raw: unknown, facts: AnalysisFact[]): AiAnalysisOutput | null {
  return validateAnalysisOutput(raw, new Set(facts.map((f) => f.ref)), numericRefsOf(facts))
}

export function formatFactValue(fact: AnalysisFact): string {
  const v = fact.value
  if (typeof v === 'string') return v
  switch (fact.kind) {
    case 'eur':
      return formatEuros(v)
    case 'eur_signed':
      return signedEuros(v)
    case 'pct':
      return `${String(Math.round(v * 10) / 10).replace('.', ',')} %`
    case 'pct_signed':
      return formatPercent(v)
    case 'num':
      return String(Math.round(v))
    case 'text':
      return String(v)
  }
}

function fill(text: string, byRef: Map<string, AnalysisFact>): string {
  const filled = text.replace(/\{\{\s*([a-z0-9_.]{1,40})\s*\}\}/g, (_, ref: string) => {
    const fact = byRef.get(ref)
    return fact ? formatFactValue(fact) : ''
  })
  // Un periodo o una categoría al principio de la frase va con mayúscula ("este mes" -> "Este mes").
  // Contracciones y puntuación que pueden quedar al insertar los valores ("a el mismo tramo", "parcial..").
  const tidy = filled.replace(/\bde el\b/g, 'del').replace(/\ba el\b/g, 'al').replace(/\.\.(?!\.)/g, '.')
    .replace(/\b(este|esta|estos|estas|el|la|los|las) \1\b/gi, '$1')
  return tidy.charAt(0).toUpperCase() + tidy.slice(1)
}

// El texto final: la IA aporta la selección y la redacción; las cifras las pone el código.
export function composeAiAnalysis(output: AiAnalysisOutput, facts: AnalysisFact[]): string {
  const byRef = new Map(facts.map((f) => [f.ref, f]))
  const lines: string[] = [fill(output.summary, byRef)]
  for (const f of output.findings.slice(0, 4)) lines.push(`• ${fill(f.title, byRef)}: ${fill(f.explanation, byRef)}`)
  if (output.suggestions.length > 0) {
    lines.push('Para tener en cuenta (solo como algo que revisar):')
    for (const s of output.suggestions.slice(0, 2)) lines.push(`• ${fill(s, byRef)}`)
  }
  return lines.join('\n')
}
