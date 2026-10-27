// @vitest-environment jsdom
// ECO-02 — asociación manual de un pago previsto con un cargo del banco: mensaje cuando no hay coincidencia fiable, avisos antes de vincular (sin impedirlo) y
// que la acción es explícita. Más: el cableado en Economía (cadenas) para que «No es este» no sustituya el candidato por otro incompatible.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ForecastOccurrence } from '@/domain/forecast'
import type { BankMovementForMatching } from '@/domain/forecastReconciliation'
import { ForecastManualMatchSheet } from '@/ui/ForecastManualMatchSheet'
import finance from './FinanceScreen.tsx?raw'

afterEach(cleanup)

const OCCURRENCE: ForecastOccurrence = {
  forecastPaymentId: 'fp-endesa',
  title: 'ENDESA ENERGIA S.A.',
  occurrenceDate: '2026-10-23',
  installmentSequenceIndex: null,
  dueDate: '2026-10-23',
  expectedPaymentDate: '2026-10-23',
  amountStatus: 'known',
  amount: 195.33,
  currency: 'EUR',
  categoryId: null,
  matchedExpenseId: null,
}
const PAYMENT = { bankAccountId: 'acc-1', title: 'ENDESA ENERGIA S.A.', provider: null }
const mv = (id: string, description: string, amount: number, date = '2026-10-24'): BankMovementForMatching => ({
  bankTransactionId: id,
  expenseId: `exp-${id}`,
  accountId: 'acc-1',
  date,
  amount,
  currency: 'EUR',
  description,
  isIncome: false,
  category: null,
})

function mount(over: Partial<Parameters<typeof ForecastManualMatchSheet>[0]> = {}) {
  const onLink = vi.fn()
  const onClose = vi.fn()
  render(
    <ForecastManualMatchSheet
      occurrence={OCCURRENCE}
      payment={PAYMENT}
      movements={[mv('b1', 'ENDESA ENERGIA S.A.', 195.33), mv('b2', 'ASADOR SESE-RAFAL', 20.5)]}
      accountNames={new Map([['acc-1', 'Cuenta común']])}
      hasSuggestion={false}
      busy={false}
      error={null}
      onLink={onLink}
      onClose={onClose}
      {...over}
    />,
  )
  return { onLink, onClose }
}

describe('hoja «Vincular con un movimiento del banco»', () => {
  it('sin sugerencia fiable dice con claridad que no hay coincidencia y deja elegir a mano', () => {
    mount()
    expect(screen.getByText(/No hemos encontrado ningún movimiento bancario que coincida con este pago previsto/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /ASADOR SESE-RAFAL/ })).toBeTruthy()
  })

  it('con sugerencia automática no repite el mensaje de «no hemos encontrado»', () => {
    mount({ hasSuggestion: true })
    expect(screen.queryByText(/No hemos encontrado ningún movimiento/)).toBeNull()
  })

  it('un cargo coherente se vincula sin avisos; el botón solo se activa tras elegirlo', () => {
    const { onLink } = mount()
    const link = screen.getByRole('button', { name: 'Vincular' }) as HTMLButtonElement
    expect(link.disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /ENDESA ENERGIA S\.A\./ }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect((screen.getByRole('button', { name: 'Vincular' }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Vincular' }))
    expect(onLink).toHaveBeenCalledWith(expect.objectContaining({ bankTransactionId: 'b1' }))
  })

  it('un cargo que no encaja avisa (nombre e importe) pero NO impide vincular', () => {
    const { onLink } = mount()
    fireEvent.click(screen.getByRole('button', { name: /ASADOR SESE-RAFAL/ }))
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/no se parece/)
    expect(alert.textContent).toMatch(/muy distinto/)
    fireEvent.click(screen.getByRole('button', { name: 'Vincular de todos modos' }))
    expect(onLink).toHaveBeenCalledWith(expect.objectContaining({ bankTransactionId: 'b2' }))
  })

  it('el buscador filtra por comercio o importe', () => {
    mount()
    fireEvent.change(screen.getByLabelText('Buscar un movimiento'), { target: { value: 'asador' } })
    expect(screen.queryByRole('button', { name: /ENDESA ENERGIA/ })).toBeNull()
    expect(screen.getByRole('button', { name: /ASADOR SESE-RAFAL/ })).toBeTruthy()
  })

  it('un error al vincular se ve en la propia hoja y no la cierra', () => {
    const { onClose } = mount({ error: 'No se pudo conciliar' })
    expect(screen.getByText('No se pudo conciliar')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('cableado en Economía → Próximos pagos', () => {
  it('«No es este» comprueba si queda otro candidato fiable y, si no, lo dice sin ofrecer otro cargo', () => {
    expect(finance).toContain('No hemos encontrado ningún otro movimiento bancario que coincida con')
    expect(finance).toContain('findReconciliationCandidates(reconciliationCandidateInputs, reconciliationMovements, matchedExpenseIds, nextDismissed)')
  })

  it('la asociación manual está en el menú ⋯ del pago, es explícita y usa la misma conciliación (sin segundo sistema)', () => {
    expect(finance).toContain('🔗 Vincular con un movimiento del banco')
    expect(finance).toContain('await confirmCandidate({ occurrence: o, movement, score: 0, confidence:')
    expect(finance).toContain('movements={reconciliationMovements.filter((m) => !!m.expenseId && !matchedExpenseIds.has(m.expenseId))}')
  })

  it('las razones se enseñan como frase («Mismo comercio · mismo importe · …») sin porcentajes', () => {
    expect(finance).toContain("capitalizeFirst(c.reasons.map((r) => r.label).join(' · '))")
  })

  it('«Confirmar» y «No es este» solo existen dentro del mapa de candidatos reales', () => {
    const start = finance.indexOf('{reconciliationCandidates.map((c) => {')
    const end = finance.indexOf('{reconciledRecently.length > 0 && (', start)
    const block = finance.slice(start, end)
    expect(block).toContain('finance.reconcile-confirm')
    expect(block).toContain('finance.reconcile-dismiss')
    expect(finance.slice(0, start)).not.toContain('data-help-id="finance.reconcile-confirm"')
  })
})
