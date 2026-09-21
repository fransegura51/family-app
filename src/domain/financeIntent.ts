// De lo que la IA ha ESTRUCTURADO a una consulta de Economía. La IA solo clasifica (intención, periodo,
// filtro); aquí se traduce a la misma FinanceQuery que produce el analizador de reglas y, a partir de ahí,
// EL CÓDIGO resuelve el filtro contra los datos reales y hace todos los cálculos.
import type { PeriodSpec } from '@/domain/financePeriod'
import { baseQuery, type FinanceMetric, type FinanceQuery } from '@/domain/financeQuery'
import type { FinanceIntentName, IntentOutput, IntentPeriod } from '../../supabase/functions/_shared/ai/purposes/financeIntentCore.ts'

const METRIC_OF_INTENT: Record<Exclude<FinanceIntentName, 'none'>, FinanceMetric> = {
  finance_spend_query: 'spent',
  finance_income_query: 'income',
  finance_savings_query: 'saved',
  finance_top_categories: 'top_categories',
  finance_compare: 'compare',
  finance_why: 'why_changed',
  finance_analysis: 'analyze',
  finance_cuts: 'cuts',
  finance_changes: 'changes',
  finance_attention: 'attention',
  finance_savings_trend: 'savings_trend',
  finance_price_up: 'price_up',
  finance_price_down: 'price_down',
  finance_cheapest_store: 'cheapest_store',
}

function periodSpec(period: IntentPeriod | null, month: number | null, year: number | null, today: Date): PeriodSpec | null {
  switch (period) {
    case null:
      return null
    case 'today':
      return { t: 'day', offset: 0 }
    case 'yesterday':
      return { t: 'day', offset: -1 }
    case 'this_week':
      return { t: 'week', offset: 0 }
    case 'last_week':
      return { t: 'week', offset: -1 }
    case 'this_month':
      return { t: 'month', offset: 0 }
    case 'last_month':
      return { t: 'month', offset: -1 }
    case 'this_year':
      return { t: 'year', offset: 0 }
    case 'last_year':
      return { t: 'year', offset: -1 }
    case 'last_30_days':
      return { t: 'last_days', n: 30 }
    case 'last_3_months':
      return { t: 'last_months', n: 3 }
    case 'named_month':
    case 'since_month': {
      if (month === null) return null
      const month0 = month - 1
      // Mismo criterio que las reglas: el mes más reciente que no sea futuro.
      const resolvedYear = year ?? (month0 <= today.getMonth() ? today.getFullYear() : today.getFullYear() - 1)
      return period === 'named_month' ? { t: 'month_named', month0, year: resolvedYear } : { t: 'since_month', month0, year: resolvedYear }
    }
  }
}

export function queryFromIntent(out: IntentOutput, today: Date): FinanceQuery | null {
  if (out.intent === 'none') return null
  const metric = METRIC_OF_INTENT[out.intent]
  const period = periodSpec(out.period, out.month, out.year, today)
  const filter = out.filter
  return baseQuery(metric, {
    period,
    // Solo las preguntas de gasto llevan filtro; el filtro se resuelve después contra los datos reales.
    target: metric === 'spent' ? filter : null,
    product: metric === 'cheapest_store' ? filter : null,
    premise: metric === 'savings_trend' || metric === 'why_savings' ? out.premise : null,
    focus: metric === 'analyze' ? 'overview' : null,
  })
}
