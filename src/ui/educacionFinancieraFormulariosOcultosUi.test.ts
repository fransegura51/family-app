import { describe, expect, it } from 'vitest'

// PG-PUNTOS-FINANZAS (Parte B6) — auditoría: ninguna sección interna de Educación financiera debe mostrar
// un formulario grande siempre visible. AddGoalForm (B2) y AddTaxFundExpenseForm (ya existía) ya seguían
// el patrón "botón + Nuevo X" → se abre → guarda/cancela → se cierra; el único hueco real era el
// formulario de nuevo movimiento del detalle de cada tarjeta (AddTransactionForm), que SIEMPRE se
// renderizaba. Esta parte lo cierra detrás del mismo patrón, sin tocar los que ya estaban bien.
const UI = (import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
const FS = UI['/src/ui/FinanceScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('AddTransactionForm (detalle de cada tarjeta) — detrás de un botón "+ Nuevo X", nunca siempre visible (Parte B6)', () => {
  const body = window_(FS, 'export function KidsFinanceTab(', '\nfunction GoalCard(')

  it('arranca oculto: un estado showAddTransaction, por defecto false', () => {
    expect(body).toContain('const [showAddTransaction, setShowAddTransaction] = useState(false)')
  })
  it('el detalle alterna entre el botón "+ Nuevo X" y el formulario, nunca los dos ni ninguno', () => {
    const detail = window_(body, 'if (openCard) {', '\n  return (\n    <div>\n      {standalone && <SectionBreadcrumb subsection="Educación financiera" />}')
    expect(detail).toContain('{showAddTransaction ? (')
    expect(detail).toContain('<AddTransactionForm')
    expect(detail).toContain('+ Nuevo {cardInfo.formLabel}')
  })
  it('openWalletCard es el único sitio que entra a una tarjeta y decide si el formulario arranca abierto o cerrado', () => {
    expect(body).toContain('function openWalletCard(key: WalletTransactionType, opts?: { addNow?: boolean })')
    expect(body).toContain('setShowAddTransaction(opts?.addNow ?? false)')
  })
  it('solo "+ Nuevo X" del grid pide el formulario abierto de entrada (addNow); tocar la imagen/el dónut no', () => {
    expect(body).toContain('openWalletCard(t.key, { addNow: true })')
    expect(body).toContain('openWalletCard(t.key)')
    expect(body).not.toContain('openWalletCard(t.key, { addNow: true })})')
  })
  it('"Ya gastado" y "Total fondo común" navegan a mirar, nunca abren el formulario de entrada', () => {
    expect(body).toContain("openWalletCard('gasto')")
    expect(body).toContain("openWalletCard('impuesto')")
    expect(body).not.toContain("openWalletCard('gasto', { addNow: true })")
    expect(body).not.toContain("openWalletCard('impuesto', { addNow: true })")
  })
  it('onAdded nunca cierra el formulario solo — needsApproval depende de que "sentNotice" se vea después de guardar', () => {
    const form = window_(body, '<AddTransactionForm', '/>')
    expect(form).toContain('onAdded={reload}')
    expect(form).toContain('onClose={() => setShowAddTransaction(false)}')
  })
})

describe('AddGoalForm y AddTaxFundExpenseForm — ya seguían el patrón correcto, confirmado sin tocarlos (Parte B6)', () => {
  it('AddGoalForm: botón "+ Nuevo objetivo de ahorro" antes de la lista, toggle showAddGoal', () => {
    expect(FS).toContain('const [showAddGoal, setShowAddGoal] = useState(false)')
    expect(FS).toContain('+ Nuevo objetivo de ahorro')
  })
  it('AddTaxFundExpenseForm (dentro de TaxFundSection): toggle showAdd, nunca siempre visible', () => {
    const section = window_(FS, 'function TaxFundSection({', '\nfunction AddTaxFundExpenseForm(')
    expect(section).toContain('const [showAdd, setShowAdd] = useState(false)')
    expect(section).toContain('showAdd ? (')
    expect(section).toContain('<AddTaxFundExpenseForm')
  })
  it('EditIncomeSplitForm (dentro de IncomeSplitInfo): toggle editing, nunca siempre visible', () => {
    const section = window_(FS, 'function IncomeSplitInfo({', '\nfunction EditIncomeSplitForm(')
    expect(section).toContain('const [editing, setEditing] = useState(false)')
    expect(section).toContain('if (editing) {')
  })
})
