// @vitest-environment jsdom
// ECO-CLASIF / CAT-2: cambiar la categoría de un movimiento tocándola, buscador/sugerida/crear en el selector, oferta voluntaria de cambiar los anteriores,
// revisión de «Otros» y renombrar una categoría. Comportamiento real de los componentes con la base de mentira.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BudgetCategory, Expense } from '@/domain/types'

const classifyPurchase = vi.fn()
const updateExpense = vi.fn()
const setExpensesCategory = vi.fn()
const confirmExpenseCategory = vi.fn()
const createBudgetCategory = vi.fn()
const renameBudgetCategory = vi.fn()
vi.mock('@/data/classifyPurchase', () => ({ classifyPurchase: (...a: unknown[]) => classifyPurchase(...a) }))
vi.mock('@/data/errorReports', () => ({ reportClientError: vi.fn() }))
vi.mock('@/data/finance', () => ({
  updateExpense: (...a: unknown[]) => updateExpense(...a),
  setExpensesCategory: (...a: unknown[]) => setExpensesCategory(...a),
  confirmExpenseCategory: (...a: unknown[]) => confirmExpenseCategory(...a),
  createBudgetCategory: (...a: unknown[]) => createBudgetCategory(...a),
  renameBudgetCategory: (...a: unknown[]) => renameBudgetCategory(...a),
}))
vi.mock('@/state/managers', () => ({ openManager: vi.fn(), onManagersChanged: () => () => undefined }))

const { OtrosReviewCard, useQuickCategoryChange } = await import('@/ui/QuickCategoryChange')
const { CategorySelect } = await import('@/ui/CategorySelect')
const { CategoryEditInline } = await import('@/ui/CategoryEditInline')

let n = 0
const cat = (name: string, catalogKey: string | null, o: Partial<BudgetCategory> = {}): BudgetCategory => ({
  id: `c${++n}`, familyId: 'f', name, icon: '•', budgetGroup: 'generales', sortOrder: n, parentId: null, necessity: null, isFixed: null, catalogKey, ...o,
})
const vivienda = cat('Vivienda y hogar', 'g.vivienda_hogar')
const transporte = cat('Transporte y vehículo', 'g.transporte_vehiculo')
const CATS: BudgetCategory[] = [
  vivienda,
  cat('Electricidad', 'g.vivienda_hogar.electricidad', { parentId: vivienda.id, icon: '⚡' }),
  transporte,
  cat('Combustible', 'g.transporte_vehiculo.combustible', { parentId: transporte.id, icon: '⛽' }),
  cat('Otros', 'g.otros'),
  cat('Sueldo', 'i.sueldo', { budgetGroup: 'ingresos' }),
  cat('Ingreso', 'i.ingreso', { budgetGroup: 'ingresos' }),
]
const exp = (o: Partial<Expense>): Expense => ({
  id: `e${++n}`, familyId: 'f', expenseDate: '2026-10-01', amount: 10, category: 'Otros', store: null, kind: 'real', notes: null, isIncome: false, budgetGroup: 'generales',
  tagId: null, source: 'banco', isFixedOverride: null, ownerMemberId: null, shared: true, sharedFromExpenseId: null, productClassification: null, ...o,
})

beforeEach(() => {
  classifyPurchase.mockReset().mockResolvedValue({ status: 'classified', reason: null, category: null, expenseId: null, receiptId: null, changedExpense: true, changedReceipt: false, expenseCategory: null, receiptCategory: null })
  updateExpense.mockReset().mockResolvedValue(undefined)
  setExpensesCategory.mockReset().mockResolvedValue(undefined)
  confirmExpenseCategory.mockReset().mockResolvedValue(undefined)
  createBudgetCategory.mockReset().mockResolvedValue(undefined)
  renameBudgetCategory.mockReset().mockResolvedValue({ status: 'ok' })
  localStorage.clear()
})
afterEach(cleanup)

function Harness({ expenses, onChanged }: { expenses: Expense[]; onChanged: () => void }) {
  const quick = useQuickCategoryChange({ expenses, categories: CATS, onChanged })
  return (
    <div>
      {expenses.map((e) => (
        <button key={e.id} type="button" onClick={() => quick.start(e)}>
          Cambiar {e.id}
        </button>
      ))}
      {quick.dialogs}
    </div>
  )
}

describe('cambio rápido de categoría de un movimiento', () => {
  it('toca, elige la que PEPA sugiere y se guarda por la vía de siempre (classify_purchase)', async () => {
    const e = exp({ id: 'X', category: null, store: 'ENDESA ENERGIA S.A.', categorySuggestion: 'Electricidad' })
    const onChanged = vi.fn()
    render(<Harness expenses={[e]} onChanged={onChanged} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar X' }))
    fireEvent.click(screen.getByRole('button', { name: /Electricidad.*sugerida por PEPA/ }))
    await waitFor(() => expect(classifyPurchase).toHaveBeenCalledWith({ expenseId: 'X', category: 'Electricidad' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
    expect(updateExpense).not.toHaveBeenCalled()
  })

  it('si hay movimientos anteriores del mismo comercio en otra categoría, OFRECE cambiarlos (y solo lo hace si se acepta)', async () => {
    const e = exp({ id: 'X', store: 'ENDESA ENERGIA S.A.' })
    const all = [e, exp({ id: 'A', store: 'ENDESA ENERGIA S.A.' }), exp({ id: 'B', store: 'ENDESA ENERGIA SA-MADRID' }), exp({ id: 'C', store: 'ENDESA ENERGIA S.A.', categorySource: 'manual' })]
    const onChanged = vi.fn()
    render(<Harness expenses={all} onChanged={onChanged} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar X' }))
    fireEvent.change(screen.getByLabelText('Buscar categoría'), { target: { value: 'electricidad' } })
    fireEvent.click(screen.getByRole('button', { name: /Vivienda y hogar › Electricidad/ }))
    const offer = await screen.findByText('¿Cambiar también los anteriores?')
    expect(offer).toBeTruthy()
    expect(screen.getByText(/Hay 2 movimientos anteriores de «ENDESA ENERGIA S.A.»/)).toBeTruthy()
    expect(setExpensesCategory).not.toHaveBeenCalled() // todavía nada: es una opción
    expect(onChanged).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Sí, cambiar los 2' }))
    await waitFor(() => expect(setExpensesCategory).toHaveBeenCalledWith(['A', 'B'], 'Electricidad'))
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  })

  it('«No, solo este» no toca ningún movimiento anterior', async () => {
    const e = exp({ id: 'X', store: 'ENDESA ENERGIA S.A.' })
    const onChanged = vi.fn()
    render(<Harness expenses={[e, exp({ id: 'A', store: 'ENDESA ENERGIA S.A.' })]} onChanged={onChanged} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar X' }))
    fireEvent.change(screen.getByLabelText('Buscar categoría'), { target: { value: 'electricidad' } })
    fireEvent.click(screen.getByRole('button', { name: /Electricidad/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'No, solo este' }))
    expect(setExpensesCategory).not.toHaveBeenCalled()
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  })

  it('un ingreso se cambia entre las categorías de ingresos y por updateExpense', async () => {
    const e = exp({ id: 'I', isIncome: true, category: 'Ingreso', budgetGroup: 'ingresos' })
    render(<Harness expenses={[e]} onChanged={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar I' }))
    expect(screen.queryByRole('button', { name: /Combustible/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Sueldo/ }))
    await waitFor(() => expect(updateExpense).toHaveBeenCalledWith('I', { category: 'Sueldo' }))
    expect(classifyPurchase).not.toHaveBeenCalled()
  })

  it('«sugerida»: se puede dar por buena sin cambiar nada (pasa a ser decisión de la persona)', async () => {
    const e = exp({ id: 'S', category: 'Combustible', categorySource: 'sugerida', store: 'REPSOL' })
    const onChanged = vi.fn()
    render(<Harness expenses={[e]} onChanged={onChanged} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar S' }))
    fireEvent.click(screen.getByRole('button', { name: /Dejar «Combustible»/ }))
    await waitFor(() => expect(confirmExpenseCategory).toHaveBeenCalledWith('S'))
    expect(classifyPurchase).not.toHaveBeenCalled()
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  })

  it('si no se puede clasificar (ticket con otra categoría) se explica y NO se recarga ni se ofrece nada', async () => {
    classifyPurchase.mockResolvedValue({ status: 'conflict', reason: 'one_side_differs', category: null, expenseId: null, receiptId: null, changedExpense: false, changedReceipt: false, expenseCategory: null, receiptCategory: null })
    const onChanged = vi.fn()
    render(<Harness expenses={[exp({ id: 'X', store: 'LIDL' })]} onChanged={onChanged} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar X' }))
    fireEvent.click(screen.getByRole('button', { name: /Transporte y vehículo/ })) // despliega la principal
    fireEvent.click(await screen.findByRole('button', { name: /Combustible/ })) // y se elige la hija
    expect(await screen.findByText(/tienen categorías distintas/)).toBeTruthy()
    expect(onChanged).not.toHaveBeenCalled()
    expect(setExpensesCategory).not.toHaveBeenCalled()
  })

  it('el mismo comercio con la misma categoría nueva no se pide dos veces', async () => {
    const e = exp({ id: 'X', category: 'Electricidad' })
    render(<Harness expenses={[e]} onChanged={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar X' }))
    fireEvent.change(screen.getByLabelText('Buscar categoría'), { target: { value: 'electricidad' } })
    fireEvent.click(screen.getByRole('button', { name: /Electricidad/ }))
    await Promise.resolve()
    expect(classifyPurchase).not.toHaveBeenCalled()
  })
})

describe('selector de categorías (buscador, crear una propia)', () => {
  function Controlled({ onChange, onCreated }: { onChange: (v: string) => void; onCreated?: () => void }) {
    return <CategorySelect open value="" categories={CATS} onChange={onChange} onCreated={onCreated} />
  }
  it('lo de siempre sigue igual: principales, desplegar una y «sin subcategoría»', () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    expect(screen.getByText('Elige una categoría')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Vivienda y hogar/ }))
    expect(screen.getByText('‹ Volver a categorías')).toBeTruthy()
    expect(screen.getByText('(sin subcategoría)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Electricidad/ }))
    expect(onChange).toHaveBeenCalledWith('Electricidad')
  })
  it('busca por concepto: «netflix» no existe como categoría pero «endesa» lleva a Electricidad', () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Buscar categoría'), { target: { value: 'endesa' } })
    fireEvent.click(screen.getByRole('button', { name: /Electricidad.*coincide con «endesa»/ }))
    expect(onChange).toHaveBeenCalledWith('Electricidad')
  })
  it('sin resultados ofrece crear una categoría propia con ese nombre y la elige al crearla', async () => {
    const onChange = vi.fn()
    const onCreated = vi.fn()
    render(<Controlled onChange={onChange} onCreated={onCreated} />)
    fireEvent.change(screen.getByLabelText('Buscar categoría'), { target: { value: 'Mi huerto' } })
    expect(screen.getByText('No hay ninguna categoría con ese nombre.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Crear «Mi huerto»' }))
    await waitFor(() => expect(createBudgetCategory).toHaveBeenCalledWith({ name: 'Mi huerto', icon: '🏷️', budgetGroup: 'generales', parentId: null }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('Mi huerto'))
    expect(onCreated).toHaveBeenCalled()
  })
  it('dentro de una categoría principal, la nueva cuelga de ella', async () => {
    render(<Controlled onChange={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: /Vivienda y hogar/ }))
    fireEvent.click(screen.getByRole('button', { name: '＋ Crear categoría propia' }))
    fireEvent.change(screen.getByLabelText('Nombre de la categoría nueva'), { target: { value: 'Piscina' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear «Piscina»' }))
    await waitFor(() => expect(createBudgetCategory).toHaveBeenCalledWith({ name: 'Piscina', icon: '🏷️', budgetGroup: 'generales', parentId: vivienda.id }))
  })
  it('no deja crear una categoría repetida ni vacía', async () => {
    render(<Controlled onChange={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: '＋ Crear categoría propia' }))
    fireEvent.change(screen.getByLabelText('Nombre de la categoría nueva'), { target: { value: 'electricidad' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear «electricidad»' }))
    expect(await screen.findByText(/Ya existe una categoría con ese nombre/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Nombre de la categoría nueva'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /^Crear/ }))
    expect(await screen.findByText('Escribe el nombre de la categoría.')).toBeTruthy()
    expect(createBudgetCategory).not.toHaveBeenCalled()
  })
  it('Intro en el buscador no envía el formulario que haya detrás', () => {
    const submit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault())
    render(
      <form onSubmit={submit}>
        <Controlled onChange={() => undefined} />
      </form>,
    )
    fireEvent.keyDown(screen.getByLabelText('Buscar categoría'), { key: 'Enter' })
    expect(submit).not.toHaveBeenCalled()
  })
})

describe('revisión voluntaria de «Otros»', () => {
  const refs = [...CATS, cat('Salud y farmacia', 'g.salud_bienestar.salud_farmacia')]
  const rows = [exp({ id: 'A', store: 'ENDESA ENERGIA S.A.', amount: 81.2 }), exp({ id: 'B', store: 'FCIA. MORENO-ALMORADI', amount: 16 }), exp({ id: 'Z', store: 'JOSE VALERO-RAFAL' })]
  it('avisa de cuántos sabe situar y no cambia nada hasta aplicar', async () => {
    const onChanged = vi.fn()
    render(<OtrosReviewCard expenses={rows} categories={refs} memberNames={[]} onChanged={onChanged} />)
    expect(screen.getByText(/PEPA ya sabe situar/).textContent).toContain('2 movimientos')
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))
    expect(screen.getByText(/Otros → Electricidad/)).toBeTruthy()
    expect(setExpensesCategory).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('checkbox', { name: /FCIA\. MORENO/ })) // se quita una
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar a 1' }))
    await waitFor(() => expect(setExpensesCategory).toHaveBeenCalledWith(['A'], 'Electricidad'))
    expect(setExpensesCategory).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })
  it('sin nada que proponer no pinta nada, y «No mostrar más» se recuerda', () => {
    const { container, rerender } = render(<OtrosReviewCard expenses={[exp({ store: 'JOSE VALERO-RAFAL' })]} categories={refs} memberNames={[]} onChanged={() => undefined} />)
    expect(container.textContent).toBe('')
    rerender(<OtrosReviewCard expenses={rows} categories={refs} memberNames={[]} onChanged={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'No mostrar más' }))
    expect(screen.queryByText(/PEPA ya sabe situar/)).toBeNull()
    expect(localStorage.getItem('familyapp:otros-review-dismissed')).toBe('1')
  })
})

describe('cambiar nombre o icono de una categoría', () => {
  const generalCat = cat('Electricidad', 'g.vivienda_hogar.electricidad', { icon: '⚡' })
  it('guarda el nombre nuevo y avisa a la pantalla', async () => {
    const onSaved = vi.fn()
    render(<CategoryEditInline category={generalCat} onSaved={onSaved} />)
    fireEvent.click(screen.getByRole('button', { name: /Cambiar nombre o icono/ }))
    fireEvent.change(screen.getByLabelText('Nombre de la categoría'), { target: { value: 'Luz de casa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(renameBudgetCategory).toHaveBeenCalledWith(generalCat.id, { name: 'Luz de casa' }))
    expect(onSaved).toHaveBeenCalled()
  })
  it('solo manda lo que cambia (el icono)', async () => {
    render(<CategoryEditInline category={generalCat} onSaved={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: /Cambiar nombre o icono/ }))
    fireEvent.change(screen.getByLabelText('Icono de la categoría'), { target: { value: '💡' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(renameBudgetCategory).toHaveBeenCalledWith(generalCat.id, { icon: '💡' }))
  })
  it('explica por qué una categoría protegida no cambia de nombre y un nombre repetido no se acepta', async () => {
    const onSaved = vi.fn()
    render(<CategoryEditInline category={generalCat} onSaved={onSaved} />)
    fireEvent.click(screen.getByRole('button', { name: /Cambiar nombre o icono/ }))
    fireEvent.change(screen.getByLabelText('Nombre de la categoría'), { target: { value: 'Otro' } })
    renameBudgetCategory.mockResolvedValueOnce({ status: 'rejected', reason: 'protected_name' })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText(/PEPA usa esta categoría para sus cálculos/)).toBeTruthy()
    renameBudgetCategory.mockResolvedValueOnce({ status: 'rejected', reason: 'name_in_use' })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Ya tienes otra categoría con ese nombre.')).toBeTruthy()
    expect(onSaved).not.toHaveBeenCalled()
  })
  it('un nombre vacío no se envía', () => {
    render(<CategoryEditInline category={generalCat} onSaved={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: /Cambiar nombre o icono/ }))
    fireEvent.change(screen.getByLabelText('Nombre de la categoría'), { target: { value: '  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByText('El nombre no puede estar vacío.')).toBeTruthy()
    expect(renameBudgetCategory).not.toHaveBeenCalled()
  })
})
void within
