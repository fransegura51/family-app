import { BUDGET_GROUP, findBudget } from '@/domain/financeBudget'
import { formatEuros } from '@/domain/financeCompute'
import { defineAction, type Choice, type Selection } from '@/pepa/actions/types'
import { asRecord, isRealIsoDate, unknownKeys } from '@/pepa/actions/validators'
import { validAmount } from '../../../supabase/functions/_shared/ai/purposes/financeBudgetIntentCore.ts'

// Acciones de Economía de "Hablar con PEPA". Hoy solo una: fijar el presupuesto mensual de una categoría
// (crearlo o cambiar el importe del que ya existe). Se propone a partir de lo dicho, se enseña en la tarjeta y
// SOLO se escribe al confirmar, con las mismas funciones de datos de la pantalla de Presupuestos (mismos
// permisos: la sesión del usuario y las políticas RLS de siempre).

export interface BudgetSetActionParams {
  // Nombre REAL de la categoría; null = presupuesto general.
  category: string | null
  amount: number
  // Primer día del mes contable del presupuesto (como el de la pantalla).
  periodStart: string
  // Solo para enseñar ("septiembre de 2026").
  periodLabel: string
  // null en modo Compartido; en Separado: Individual (personal) o Común (de todos).
  scope: 'personal' | 'comun' | null
  // Lo que ya hay para esa categoría y mes, para enseñar "ahora" en la tarjeta.
  existing: { personal: number | null; comun: number | null }
}

const KEYS = ['category', 'amount', 'periodStart', 'periodLabel', 'scope', 'existing'] as const
const AMOUNT_ERROR = 'El importe no es válido: debe ser mayor que cero, con como mucho dos decimales.'

function nullableAmount(v: unknown): number | null | undefined {
  if (v === null) return null
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined
}

function typedAmount(text: string | undefined, fallback: number): number {
  if (text === undefined) return fallback
  const cleaned = text.replace(/\s|€/g, '').replace(',', '.')
  return cleaned === '' ? NaN : Number(cleaned)
}

export const budgetSetAction = defineAction<BudgetSetActionParams>({
  id: 'budget.set',

  validate(raw) {
    const rec = asRecord(raw)
    if (!rec) return { ok: false, errors: ['Petición no válida'] }
    const extra = unknownKeys(rec, KEYS)
    if (extra.length > 0) return { ok: false, errors: [`Campos no permitidos: ${extra.join(', ')}`] }
    const errors: string[] = []
    if (rec.category !== null && (typeof rec.category !== 'string' || rec.category.trim().length === 0 || rec.category.length > 80)) errors.push('La categoría no es válida')
    if (typeof rec.amount !== 'number' || !validAmount(rec.amount)) errors.push(AMOUNT_ERROR)
    if (!isRealIsoDate(rec.periodStart)) errors.push('El mes no es válido')
    if (typeof rec.periodLabel !== 'string' || rec.periodLabel.length === 0 || rec.periodLabel.length > 40) errors.push('El mes no es válido')
    if (rec.scope !== null && rec.scope !== 'personal' && rec.scope !== 'comun') errors.push('El tipo de presupuesto no es válido')
    const existing = asRecord(rec.existing)
    const personal = existing ? nullableAmount(existing.personal) : undefined
    const comun = existing ? nullableAmount(existing.comun) : undefined
    if (!existing || unknownKeys(existing, ['personal', 'comun']).length > 0 || personal === undefined || comun === undefined) errors.push('El presupuesto actual no es válido')
    if (errors.length > 0) return { ok: false, errors }
    return {
      ok: true,
      params: {
        category: rec.category === null ? null : (rec.category as string).trim(),
        amount: rec.amount as number,
        periodStart: rec.periodStart as string,
        periodLabel: rec.periodLabel as string,
        scope: rec.scope as BudgetSetActionParams['scope'],
        existing: { personal: personal as number | null, comun: comun as number | null },
      },
    }
  },

  initialSelection(params): Selection {
    return {
      choices: params.scope === null ? {} : { scope: params.scope },
      checked: [],
      values: { amount: String(params.amount).replace('.', ',') },
    }
  },

  applySelection(params, selection) {
    const scope = params.scope === null ? null : selection.choices.scope === 'comun' ? 'comun' : selection.choices.scope === 'personal' ? 'personal' : params.scope
    return { ...params, scope, amount: typedAmount(selection.values?.amount, params.amount) }
  },

  present(params) {
    const current = params.scope === 'comun' ? params.existing.comun : params.existing.personal
    const what = params.category ?? 'General (todo el gasto)'
    const lines = [`Categoría: ${what}`, `Mes: ${params.periodLabel} (mes contable)`]
    if (current !== null) lines.push(`Ahora: ${formatEuros(current)} al mes`)
    const choices: Choice[] =
      params.scope === null
        ? []
        : [
            {
              id: 'scope',
              label: 'Presupuesto',
              options: [
                { key: 'personal', label: 'Individual (tuyo)' },
                { key: 'comun', label: 'Común (de todos)' },
              ],
            },
          ]
    return {
      title: current !== null ? '💶 Cambiar presupuesto' : '💶 Nuevo presupuesto',
      lines,
      warnings: Number.isFinite(params.amount) ? [] : [AMOUNT_ERROR],
      choices,
      checks: [],
      fields: [{ id: 'amount', label: 'Importe (€ al mes)', inputMode: 'decimal' }],
      confirmLabel: 'Confirmar',
    }
  },

  async execute(params) {
    // Las funciones de datos se cargan al escribir (no al importar el registro), como el resto del acceso a Supabase.
    const { getAccountsMode } = await import('@/data/family')
    const { createBudget, listBudgetCategories, listBudgets, updateBudgetAmount } = await import('@/data/finance')
    const [categories, budgets, mode] = await Promise.all([listBudgetCategories(), listBudgets(), getAccountsMode()])
    // Se vuelve a comprobar contra lo real justo antes de escribir (por si algo cambió mientras se pensaba).
    if (params.category !== null && !categories.some((c) => c.name === params.category && c.budgetGroup === BUDGET_GROUP)) {
      throw new Error(`La categoría «${params.category}» ya no existe.`)
    }
    const scope = mode === 'separado' ? (params.scope ?? 'personal') : null
    const match = findBudget(params.category, params.periodStart, scope, budgets)
    const what = params.category ?? 'General'
    if (match) {
      if (match.amount === params.amount) return `Ya estaba así: ${what}, ${formatEuros(match.amount)} al mes (${params.periodLabel}). No he cambiado nada.`
      await updateBudgetAmount(match.id, params.amount)
      notifyChanged()
      return `Presupuesto de ${what} cambiado a ${formatEuros(params.amount)} al mes (antes ${formatEuros(match.amount)}) para ${params.periodLabel}.`
    }
    await createBudget({
      periodType: 'mensual',
      periodStart: params.periodStart,
      category: params.category ?? '',
      amount: params.amount,
      budgetGroup: BUDGET_GROUP,
      // Común = sin dueño; Individual (o modo Compartido) deja que la base de datos lo asigne, como la pantalla.
      ...(scope === 'comun' ? { ownerMemberId: null } : {}),
    })
    notifyChanged()
    return `Presupuesto creado: ${what}, ${formatEuros(params.amount)} al mes (${params.periodLabel}).`
  },
})

function notifyChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('family-app:budgets-changed'))
}
