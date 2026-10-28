// @vitest-environment jsdom
// Previsión de pagos (28/10/2026) — el formulario REAL: editar una previsión guardada (cuadro de amortización de 6 pagos, total 658,75 €) y cambiar «Estado del importe TOTAL»
// no puede tocar ningún importe ni fecha. Y si se cambia algo estructural con pagos personalizados, no se sobrescriben sin que la persona elija.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildForecastRecurrenceRule, computeInstallmentPlanUntil, type ForecastOccurrenceOverride } from '@/domain/forecast'
import { buildFinitePlanSubmission } from '@/domain/forecastInstallmentPlanForm'

vi.mock('@/data/supabaseClient', () => ({ supabase: new Proxy({}, { get: () => () => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }) }) }) }))

import { ForecastPaymentForm } from '@/ui/FinanceScreen'

afterEach(cleanup)

const AMOUNTS = [116.21, 107.93, 108.21, 108.52, 108.81, 109.07]
const DATES = ['2026-11-20', '2026-12-21', '2027-01-20', '2027-02-22', '2027-03-22', '2027-04-20']

function savedPlan(status: 'known' | 'estimated') {
  const lines = AMOUNTS.map((a, i) => ({ date: DATES[i], amountStatus: status, amount: String(a), amountEstimatedBasis: status === 'estimated' ? 'Importe leído de un documento importado' : '' }))
  const submission = buildFinitePlanSubmission('2026-11-20', 'MONTHLY', 1, lines, status, 658.75, status === 'estimated' ? 'Importe leído de un documento importado' : null, 'total')
  const until = computeInstallmentPlanUntil('2026-11-20', 'MONTHLY', 1, 6)
  const payment = {
    id: 'fp1',
    familyId: 'f1',
    title: 'Cuadro de amortización',
    categoryId: null,
    provider: null,
    notes: null,
    amountStatus: submission.parentAmountStatus,
    amount: submission.parentAmount,
    amountEstimatedBasis: submission.parentAmountEstimatedBasis,
    currency: 'EUR',
    dueDate: '2026-11-20',
    expectedPaymentDate: null,
    recurrenceRule: buildForecastRecurrenceRule('custom', { freq: 'MONTHLY', interval: 1, until }),
    bankAccountId: null,
    ownerMemberId: null,
    showInCalendar: true,
    calendarEventId: null,
    active: true,
    sourceStoragePath: null,
    installments: [],
    reminders: [],
  }
  const overrides = submission.overrides.map((o, i) => ({
    id: `o${i}`,
    forecastPaymentId: 'fp1',
    occurrenceDate: o.occurrenceDate,
    installmentSequenceIndex: null,
    dueDateOverride: o.dueDateOverride,
    amountStatus: o.amountStatus,
    amount: o.amount,
    amountEstimatedBasis: o.amountEstimatedBasis,
  })) as unknown as ForecastOccurrenceOverride[]
  return { payment, overrides }
}

function mount(status: 'known' | 'estimated') {
  const { payment, overrides } = savedPlan(status)
  render(<ForecastPaymentForm categories={[]} members={[]} accounts={[]} payment={payment as never} overrides={overrides} prefill={null} onSaved={() => undefined} />)
}

const summaryText = () => document.body.textContent ?? ''
const expectIntactPlan = (statusLabel: string) => {
  const t = summaryText()
  for (const a of AMOUNTS) expect(t, String(a)).toContain(`${a.toFixed(2)} €`)
  expect(t).toContain(`(${statusLabel})`)
  expect(t).not.toContain('109.79') // el reparto uniforme de 658,75 € entre 6 (lo que hacía el bug)
}

describe('cambiar el estado del importe TOTAL en una previsión guardada', () => {
  it('Estimado → Conocido → Estimado → Conocido: los seis importes distintos se conservan siempre', () => {
    mount('estimated')
    expectIntactPlan('Estimado')
    const select = screen.getByLabelText(/Estado del importe TOTAL/) as HTMLSelectElement

    fireEvent.change(select, { target: { value: 'known' } })
    expectIntactPlan('Conocido')

    fireEvent.change(select, { target: { value: 'estimated' } })
    expect((screen.getByPlaceholderText(/recibo del año pasado/) as HTMLInputElement).value).not.toBe('')
    expectIntactPlan('Estimado')

    fireEvent.change(select, { target: { value: 'known' } })
    expectIntactPlan('Conocido')
    // el total sigue siendo el del documento y no aparece ningún aviso de «recálculo»
    expect((screen.getByLabelText(/Importe TOTAL/) as HTMLInputElement).value).toBe('658.75')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('con el estado ya en Conocido tampoco cambia nada al volver a Estimado', () => {
    mount('known')
    expectIntactPlan('Conocido')
    fireEvent.change(screen.getByLabelText(/Estado del importe TOTAL/), { target: { value: 'estimated' } })
    expectIntactPlan('Estimado')
  })

  it('cambiar el concepto o escribir en «en qué se basa» tampoco redistribuye los pagos', () => {
    mount('estimated')
    fireEvent.change(screen.getByLabelText('Concepto'), { target: { value: 'Otro nombre' } })
    fireEvent.change(screen.getByPlaceholderText(/recibo del año pasado/), { target: { value: 'Cuadro oficial del acreedor' } })
    expectIntactPlan('Estimado')
  })
})

describe('cambiar algo ESTRUCTURAL con pagos personalizados', () => {
  it('cambiar el número de pagos no sobrescribe los importes: avisa y deja elegir', () => {
    mount('known')
    fireEvent.change(screen.getByLabelText(/Número de pagos/), { target: { value: '5' } })
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('No los he tocado')
    expectIntactPlan('Conocido') // los seis pagos siguen ahí
    expect(screen.getByRole('button', { name: /Recalcular pagos/ })).toBeTruthy()
  })

  it('«Recalcular pagos» sí los sustituye, por decisión explícita', () => {
    mount('known')
    fireEvent.change(screen.getByLabelText(/Número de pagos/), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /Recalcular pagos/ }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(summaryText()).toContain('131.75 €') // 658,75 / 5
    expect(summaryText()).not.toContain('116.21 €')
  })
})
