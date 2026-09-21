// Punto único de respuesta de Economía (SOLO LECTURA) para 💬 Hablar con PEPA — y para cualquier otra
// pantalla que quiera lo mismo (Economía → Conclusiones de PEPA): recibe una consulta ya entendida y
// devuelve el texto. Decide por reglas quién responde:
//
//   - Cifras sueltas (gasto, ingresos, comparar, precios...): financeCompute. Cero IA.
//   - Análisis (dónde se va el dinero, qué ha cambiado, ahorro, qué revisar, qué llama la atención,
//     "explícamelo más sencillo"): financeAnalysis, en código. Cero IA.
//   - SOLO el análisis abierto ("analiza nuestros gastos", "dame tus conclusiones", "qué está pasando"):
//     puede pedir a la IA que seleccione y redacte, con hechos AGREGADOS y referencias; si la IA no está,
//     falla o devuelve algo no válido, contesta el mismo análisis hecho por código. Siempre hay respuesta.
import {
  analysisFacts,
  attentionFindings,
  buildAnalysis,
  categoryFocusFindings,
  changesFindings,
  cutsFindings,
  overviewFindings,
  renderFindings,
  savingsTrendFindings,
  simplerFindings,
  topIncreaseFindings,
  whereMoneyFindings,
  type Analysis,
  type AnalysisFact,
  type Finding,
} from '@/domain/financeAnalysis'
import { composeAiAnalysis, type AiAnalysisOutput } from '@/domain/financeAnalysisAi'
import { answerFinanceQuery, resolveTarget, type FinanceData } from '@/domain/financeCompute'
import { resolvePeriod, type PeriodSpec } from '@/domain/financePeriod'
import { ANALYSIS_METRICS, type AnalysisFocus, type FinanceQuery } from '@/domain/financeQuery'

// Quién pide la redacción con IA: recibe SOLO hechos agregados; devuelve la respuesta ya validada, o
// null si no hay IA (apagada, sin cupo, sin red, respuesta no válida...).
export type AiAnalyzer = (focus: AnalysisFocus, facts: AnalysisFact[]) => Promise<AiAnalysisOutput | null>

export interface FinanceRun {
  text: string
  // La consulta ya resuelta (periodo y filtros): es lo que se recuerda para las continuaciones.
  query: FinanceQuery
  usedAi: boolean
  // Qué función de PEPA ha respondido (para los contadores; nunca el texto de la conversación).
  fn: string
}

const DEFAULT_PERIOD: PeriodSpec = { t: 'month', offset: 0 }

function analysisNeedsIa(a: Analysis): boolean {
  // Sin gasto no hay nada que redactar: el propio texto de código ya lo dice.
  return a.expenses.total > 0
}

export async function runFinanceQuery(query: FinanceQuery, data: FinanceData, today: Date, ai?: AiAnalyzer): Promise<FinanceRun> {
  if (!ANALYSIS_METRICS.includes(query.metric)) {
    const answer = answerFinanceQuery(query, data, today)
    return { text: answer.text, query: answer.query, usedAi: false, fn: `finance.${query.metric}` }
  }

  const spec = query.period ?? DEFAULT_PERIOD
  const resolved = resolvePeriod(spec, today, data.monthStartDay)
  const baseline = query.baseline ? resolvePeriod(query.baseline, today, data.monthStartDay) : undefined
  const remembered: FinanceQuery = { ...query, period: spec }
  const done = (findings: Finding[], usedAi = false, text?: string): FinanceRun => ({
    text: text ?? renderFindings(findings),
    query: remembered,
    usedAi,
    fn: `finance.${query.metric}`,
  })

  // Un filtro de categoría/tienda dicho tras un análisis ("¿y solo alimentación?").
  if (query.metric === 'category_focus') {
    const target = query.target ? resolveTarget(query.target, data) : ({ kind: 'none' } as const)
    if (target.kind === 'store') {
      const answer = answerFinanceQuery({ ...query, metric: 'spent', period: spec }, data, today)
      return { text: answer.text, query: { ...remembered, metric: 'spent', target: target.name }, usedAi: false, fn: 'finance.spent' }
    }
    if (target.kind !== 'category') {
      const text =
        target.kind === 'ambiguous'
          ? `«${query.target}» puede ser varias cosas: ${target.options.join(', ')}. ¿Cuál quieres?`
          : `No encuentro ninguna categoría ni tienda llamada «${query.target}» en tus datos, así que no lo calculo.`
      return { text, query: remembered, usedAi: false, fn: 'finance.category_focus' }
    }
    const a = buildAnalysis(data, resolved, today, { baseline, full: query.full })
    return { text: renderFindings(categoryFocusFindings(a, target.name, data)), query: { ...remembered, target: target.name }, usedAi: false, fn: 'finance.category_focus' }
  }

  const a = buildAnalysis(data, resolved, today, { baseline, full: query.full })

  switch (query.metric) {
    case 'where_money':
      return done(whereMoneyFindings(a))
    case 'top_increase':
      return done(topIncreaseFindings(a))
    case 'changes':
      return done(changesFindings(a))
    case 'savings_trend':
    case 'why_savings':
      return done(savingsTrendFindings(a, query.premise))
    case 'cuts':
      return done(cutsFindings(a))
    case 'attention':
      return done(attentionFindings(a))
    case 'simpler':
      return done(simplerFindings(a))
    case 'analyze': {
      const codeFindings = overviewFindings(a)
      if (ai && analysisNeedsIa(a)) {
        const facts = analysisFacts(a)
        const result = await ai(query.focus ?? 'overview', facts).catch(() => null)
        if (result) {
          // Los avisos sobre los datos los pone SIEMPRE el código: la IA no puede ocultarlos.
          const warnings = a.dataQuality.warnings.filter((w) => w.startsWith('Hay una conexión') || w.startsWith('No hay tickets') || w.startsWith('Menos de la mitad'))
          const composed = composeAiAnalysis(result, facts)
          // Sin repetir un aviso que la IA ya ha explicado con las mismas palabras.
          const text = [composed, ...warnings.filter((w) => !composed.includes(w))].join('\n')
          return done(codeFindings, true, text)
        }
      }
      return done(codeFindings)
    }
    default:
      return done(overviewFindings(a))
  }
}
