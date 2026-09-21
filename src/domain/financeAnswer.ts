// Punto único de respuesta de Economía (SOLO LECTURA) para 💬 Hablar con PEPA — y para cualquier otra
// pantalla que quiera lo mismo (Economía → Conclusiones de PEPA): recibe una consulta ya entendida y
// devuelve el texto. Decide por reglas quién responde y CÓMO lo cuenta:
//
//   - Cifras sueltas (gasto, ingresos, comparar, precios...): financeCompute. Cero IA. Son preguntas de
//     cantidad: ya contestan con la cifra.
//   - Análisis y explicaciones (dónde se va el dinero, qué ha cambiado, ahorro, qué revisar, qué llama la
//     atención, "¿por qué?", "explícamelo más sencillo"): financeAnalysis calcula TODO; la presentación es
//       · BREVE por defecto (financeBrief): corta, natural, casi sin cifras;
//       · COMPLETA bajo petición ("dame las cifras", "¿cuánto exactamente?"): importes, diferencias,
//         porcentajes y desglose. Es el mismo cálculo, con el texto de siempre.
//   - SOLO el análisis abierto ("analiza…", "conclusiones", "qué está pasando"), en su versión breve, puede
//     pedir a la IA que seleccione y redacte, con hechos AGREGADOS y referencias; si la IA no está, falla o
//     devuelve algo no válido, contesta el análisis breve hecho por código. Siempre hay respuesta.
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
  topIncreaseFindings,
  whereMoneyFindings,
  type AnalysisFact,
  type Finding,
} from '@/domain/financeAnalysis'
import { composeAiAnalysis, type AiAnalysisOutput } from '@/domain/financeAnalysisAi'
import { budgetLeft } from '@/domain/financeBudget'
import {
  briefAttention,
  briefCategoryFocus,
  briefChanges,
  briefCuts,
  briefOverview,
  briefSavingsTrend,
  briefSimpler,
  briefTopIncrease,
  briefWhereMoney,
  briefWhyChanged,
  briefWhyCuts,
  type BriefAnswer,
} from '@/domain/financeBrief'
import { answerFinanceQuery, resolveTarget, type FinanceData } from '@/domain/financeCompute'
import { resolvePeriod, type PeriodSpec } from '@/domain/financePeriod'
import { ANALYSIS_METRICS, type AnalysisFocus, type FinanceQuery } from '@/domain/financeQuery'

// Quién pide la redacción con IA: recibe SOLO hechos agregados; devuelve la respuesta ya validada, o
// null si no hay IA (apagada, sin cupo, sin red, respuesta no válida...).
export type AiAnalyzer = (focus: AnalysisFocus, facts: AnalysisFact[], detail: 'brief' | 'full') => Promise<AiAnalysisOutput | null>

export interface FinanceRun {
  text: string
  // La consulta ya resuelta (periodo y filtros): es lo que se recuerda para las continuaciones.
  query: FinanceQuery
  usedAi: boolean
  // Qué función de PEPA ha respondido (para los contadores; nunca el texto de la conversación).
  fn: string
  // Lo que se ha nombrado por orden (categorías): para "¿y cuál es la segunda?".
  items?: string[]
}

const DEFAULT_PERIOD: PeriodSpec = { t: 'month', offset: 0 }

function analysisNeedsIa(a: { expenses: { total: number } }): boolean {
  // Sin gasto no hay nada que redactar: el propio texto de código ya lo dice.
  return a.expenses.total > 0
}

export async function runFinanceQuery(query: FinanceQuery, data: FinanceData, today: Date, ai?: AiAnalyzer): Promise<FinanceRun> {
  // Presupuestos: cuánto queda de los del mes (lo calcula el código con la misma regla que la pantalla).
  if (query.metric === 'budget_left') {
    const left = budgetLeft(query.target, data)
    return { text: left.text, query, usedAi: false, fn: 'finance.budget_left', items: left.items }
  }

  const brief = query.detail !== 'full'
  const isAnalysis = ANALYSIS_METRICS.includes(query.metric)

  // Cifras sueltas: como siempre. "¿Por qué ha cambiado mi gasto?" cuenta como explicación: breve por defecto.
  if (!isAnalysis && !(query.metric === 'why_changed' && brief)) {
    const answer = answerFinanceQuery(query, data, today)
    return { text: answer.text, query: answer.query, usedAi: false, fn: `finance.${query.metric}` }
  }

  const spec = query.period ?? DEFAULT_PERIOD
  const resolved = resolvePeriod(spec, today, data.monthStartDay)
  const baseline = query.baseline ? resolvePeriod(query.baseline, today, data.monthStartDay) : undefined
  const remembered: FinanceQuery = { ...query, period: spec }
  const done = (findings: Finding[]): FinanceRun => ({ text: renderFindings(findings), query: remembered, usedAi: false, fn: `finance.${query.metric}` })
  const doneBrief = (answer: BriefAnswer, usedAi = false): FinanceRun => ({
    text: answer.text,
    query: remembered,
    usedAi,
    fn: `finance.${query.metric}`,
    items: answer.items,
  })

  // Un filtro de categoría/tienda/concepto dicho tras un análisis ("¿y solo alimentación?", "¿y la segunda?").
  if (query.metric === 'category_focus') {
    const target = query.target ? resolveTarget(query.target, data) : ({ kind: 'none' } as const)
    // Una tienda o un concepto no tienen "subcategorías": se contesta con la cifra de gasto de siempre.
    if (target.kind === 'store' || target.kind === 'concept') {
      const answer = answerFinanceQuery({ ...query, metric: 'spent', period: spec }, data, today)
      return { text: answer.text, query: answer.query, usedAi: false, fn: 'finance.spent' }
    }
    if (target.kind !== 'category') {
      const text =
        target.kind === 'ambiguous'
          ? `«${query.target}» puede ser varias cosas: ${target.options.join(', ')}. ¿Cuál quieres?`
          : `No encuentro ninguna categoría, tienda ni concepto llamado «${query.target}» en tus datos, así que no lo calculo.`
      return { text, query: remembered, usedAi: false, fn: 'finance.category_focus' }
    }
    const a = buildAnalysis(data, resolved, today, { baseline, full: query.full })
    const focused = { ...remembered, target: target.name }
    if (brief) return { ...doneBrief(briefCategoryFocus(a, target.name, data)), query: focused }
    return { text: renderFindings(categoryFocusFindings(a, target.name, data)), query: focused, usedAi: false, fn: 'finance.category_focus' }
  }

  const a = buildAnalysis(data, resolved, today, { baseline, full: query.full })

  switch (query.metric) {
    // "Explícamelo más sencillo": siempre una frase.
    case 'simpler':
      return doneBrief(briefSimpler(a))

    // "¿Por qué?": explicación conceptual breve (sin importes).
    case 'why_changed':
      return doneBrief(briefWhyChanged(a, query.premise))
    case 'why_cuts':
      return brief ? doneBrief(briefWhyCuts(a)) : done(cutsFindings(a))

    case 'where_money':
      return brief ? doneBrief(briefWhereMoney(a)) : done(whereMoneyFindings(a))
    case 'top_increase':
      return brief ? doneBrief(briefTopIncrease(a)) : done(topIncreaseFindings(a))
    case 'changes':
      return brief ? doneBrief(briefChanges(a)) : done(changesFindings(a))
    case 'savings_trend':
    case 'why_savings':
      return brief ? doneBrief(briefSavingsTrend(a, query.premise)) : done(savingsTrendFindings(a, query.premise))
    case 'cuts':
      return brief ? doneBrief(briefCuts(a)) : done(cutsFindings(a))
    case 'attention':
      return brief ? doneBrief(briefAttention(a)) : done(attentionFindings(a))

    case 'analyze': {
      // Detalle completo: el análisis de código de siempre, sin gastar una llamada de IA.
      if (!brief) return done(overviewFindings(a))
      const fallback = briefOverview(a)
      if (ai && analysisNeedsIa(a)) {
        const facts = analysisFacts(a)
        const result = await ai(query.focus ?? 'overview', facts, 'brief').catch(() => null)
        if (result) {
          // Los avisos sobre los datos los pone SIEMPRE el código: la IA no puede ocultarlos.
          const warnings = a.dataQuality.warnings.filter((w) => w.startsWith('Hay una conexión') || w.startsWith('Menos de la mitad'))
          const composed = composeAiAnalysis(result, facts, 'brief')
          const text = [composed, ...warnings.filter((w) => !composed.includes(w))].join(' ')
          return doneBrief({ text, items: fallback.items }, true)
        }
      }
      return doneBrief(fallback)
    }
    default:
      return done(overviewFindings(a))
  }
}
