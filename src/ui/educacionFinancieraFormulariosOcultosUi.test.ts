import { describe, expect, it } from 'vitest'

// CORRECCIÓN REAL (incidencia 3, reportada tras comprobar la versión desplegada en un iPhone real):
// "al tocar «+ Nuevo ingreso/ahorro/gasto/impuesto» el sistema lleva a un formulario situado dentro de la
// sección — ESTO NO ES UNA VENTANA EMERGENTE". La Parte B6 (ocultar el formulario tras un botón, nunca
// siempre visible) estaba bien pero no era suficiente: un formulario desplegado DENTRO de la página nunca
// es un modal, aunque esté oculto por defecto. Ahora AddTransactionForm vive SIEMPRE dentro de
// WalletTransactionModal — una ventana real superpuesta (overlay atenuado + hoja con cabecera fija, botón
// X y cuerpo con scroll propio, clase .sheet-modal-overlay/.sheet-modal ya usada en MenuShoppingModal) —
// nunca un formulario desplegado dentro del grid ni del detalle. Los otros formularios ya correctos
// (AddGoalForm/AddTaxFundExpenseForm/EditIncomeSplitForm, con su propio toggle inline) NO forman parte de
// esta incidencia y se confirman sin tocar en el segundo describe.
const UI = (import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
const FS = UI['/src/ui/FinanceScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const kidsTabBody = window_(FS, 'export function KidsFinanceTab(', '\nfunction GoalCard(')
// WalletTransactionModal es la última función del archivo — no hay ningún "\nfunction " después, así que
// el límite es el final del propio texto.
const modalStart = FS.indexOf('function WalletTransactionModal({')
expect(modalStart, 'no se encontró "function WalletTransactionModal({"').toBeGreaterThan(-1)
const modal = FS.slice(modalStart)

describe('WalletTransactionModal — ventana real superpuesta, nunca un formulario desplegado en la página (corrección incidencia 3)', () => {
  it('overlay con fondo atenuado + hoja (mismo patrón ya probado en MenuShoppingModal), nunca inline', () => {
    expect(modal).toContain('className="sheet-modal-overlay" onClick={onClose}')
    expect(modal).toContain('className="sheet-modal" onClick={(e) => e.stopPropagation()}')
  })
  it('título correspondiente ("Nuevo {formLabel}") y botón X para cerrar', () => {
    expect(modal).toContain('<h2>Nuevo {formLabel}</h2>')
    expect(modal).toContain('className="modal-close" onClick={onClose} aria-label="Cerrar"')
  })
  it('cuerpo con scroll propio (.sheet-modal-body) — nunca el formulario desnudo contra la hoja', () => {
    expect(modal).toContain('className="sheet-modal-body"')
  })
  it('reutiliza AddTransactionForm tal cual (mismos campos/validaciones), con su propio botón Cancelar', () => {
    expect(modal).toContain('<AddTransactionForm memberId={memberId} type={type} splitConfig={splitConfig} needsApproval={needsApproval} onAdded={onAdded} onClose={onClose} />')
  })
})

describe('Los 8 accesos (4 tarjetas × grid+interior) abren el MISMO modal, nunca un formulario inline ni una navegación aparte', () => {
  it('"+ Nuevo X" de cada tarjeta de la rejilla abre el modal directamente (setAddModalType), sin pasar por el detalle', () => {
    expect(kidsTabBody).toContain('onClick={() => setAddModalType(t.key)}')
  })
  it('tocar la imagen o el dónut sigue navegando al detalle (setOpenCard) — es "mirar", no "añadir", y nunca abre el modal', () => {
    expect(kidsTabBody).toContain('onClick={() => setOpenCard(t.key)}')
    expect(kidsTabBody).not.toMatch(/wallet-type-card-tap"[^>]*onClick=\{\(\) => setAddModalType/)
  })
  it('dentro del detalle de cada tarjeta hay un botón compacto "+ Nuevo X" INMEDIATAMENTE encima del historial, que abre el mismo modal', () => {
    const beforeHistory = kidsTabBody.slice(0, kidsTabBody.indexOf('<div className="event-list">'))
    const addIdx = beforeHistory.lastIndexOf('+ Nuevo {cardInfo.formLabel}')
    expect(addIdx).toBeGreaterThan(-1)
    expect(beforeHistory.slice(addIdx - 60, addIdx)).toContain('onClick={() => setAddModalType(openCard)}')
  })
  it('el formulario YA NO se renderiza nunca desplegado dentro del detalle (ni oculto tras un toggle inline, ni siempre visible)', () => {
    expect(kidsTabBody).not.toContain('<AddTransactionForm')
    expect(kidsTabBody).not.toContain('showAddTransaction')
  })
  it('el modal se calcula una sola vez (transactionModal) y se incluye en las dos ramas de return (rejilla y detalle)', () => {
    const occurrences = kidsTabBody.split('{transactionModal}').length - 1
    expect(occurrences).toBe(2)
  })
})

describe('AddGoalForm, AddTaxFundExpenseForm y EditIncomeSplitForm — fuera del alcance de la incidencia 3, confirmados sin tocar', () => {
  it('AddGoalForm: botón "+ Nuevo objetivo de ahorro" antes de la lista, toggle showAddGoal (su propio patrón inline, no es parte de esta incidencia)', () => {
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
