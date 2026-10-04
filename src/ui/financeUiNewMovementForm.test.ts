// Candado de «Nuevo movimiento = Editar movimiento»: ambos pintan el MISMO formulario (MovementFormFields) y
// siguen las MISMAS reglas (domain/movementForm.ts); el alta guarda todo en una sola inserción. Lee el código
// real como texto (sin jsdom), mismo estilo que el resto de candados de Economía.
import { describe, expect, it } from 'vitest'

const SRC = import.meta.glob(['/src/ui/FinanceScreen.tsx', '/src/data/finance.ts', '/src/ui/AyudaScreen.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const FS = SRC['/src/ui/FinanceScreen.tsx']
const DATA = SRC['/src/data/finance.ts']

function slice(source: string, start: string, end: string): string {
  const i = source.indexOf(start)
  expect(i, `no encuentro «${start}»`).toBeGreaterThan(-1)
  const j = source.indexOf(end, i + start.length)
  expect(j, `no encuentro «${end}»`).toBeGreaterThan(i)
  return source.slice(i, j)
}

const FIELDS = slice(FS, 'function MovementFormFields(', '// Editar cualquier movimiento de la lista de Gastos')
const EDIT = slice(FS, 'function EditExpenseInline(', '// El único botón flotante de Gastos')
const CREATE = slice(FS, 'function AddExpenseToAnyCategoryInline(', '// ---------------------------------------------------------------------\n// Tickets (Skill 10)')
const MODAL = slice(FS, 'function NewMovementModal(', 'function AddExpenseToAnyCategoryInline(')

describe('Un solo formulario para crear y editar (anti-divergencia)', () => {
  it('Nuevo y Editar usan el MISMO componente de campos, solo cambia el modo', () => {
    expect(CREATE).toContain('<MovementFormFields mode="create"')
    expect(EDIT).toContain('<MovementFormFields')
    expect(EDIT).toContain('mode="edit"')
    expect((FS.match(/function MovementFormFields\(/g) ?? []).length).toBe(1)
  })
  it('ni Nuevo ni Editar tienen campos propios: ninguno de los dos declara selects/inputs de movimiento', () => {
    for (const body of [CREATE, EDIT]) {
      expect(body).not.toMatch(/<select|<input|CategorySelect|TagSelect|Establecimiento|Clasificación \(opcional\)|Concepto \(opcional\)/)
    }
  })
  it('las reglas (cambio de categoría, Gasto↔Ingreso, valores guardados) vienen del dominio compartido', () => {
    expect(FIELDS).toContain('changeExpenseCategory(draft, v, categories)')
    expect(FIELDS).toContain('switchMovementType(draft, true)')
    expect(CREATE).toContain('buildNewExpenseInput(draft, categories)')
    expect(EDIT).toContain('movementFieldValues(draft)')
  })
})

describe('A/B. Campos del formulario compartido', () => {
  it('A. Gasto: categoría, fecha + importe en la misma fila, establecimiento, clasificación, etiqueta, concepto y Necesito (en este orden)', () => {
    const order = ['Categoría', 'Fecha', 'Importe (€)', 'Establecimiento (opcional)', 'Clasificación (opcional)', 'Etiqueta (opcional)', 'Concepto (opcional)', 'Según categoría', 'Fijo', 'Variable']
    let last = -1
    for (const marker of order) {
      const idx = FIELDS.indexOf(marker, last + 1)
      expect(idx, marker).toBeGreaterThan(last)
      last = idx
    }
    expect(FIELDS).toContain('<div className="inline-fields">')
  })
  it('B. Ingreso: sin establecimiento, clasificación ni Necesito (guardas !draft.isIncome); sí etiqueta y concepto', () => {
    expect(FIELDS).toContain('{!draft.isIncome && (\n        <label>\n          Establecimiento (opcional)')
    expect(FIELDS).toContain('const classificationKind: ClassificationKind | null = draft.isIncome ? null :')
    expect(FIELDS).toContain('{!draft.isIncome && (\n        <>\n          <p className="muted"')
    expect(FIELDS).toContain('Etiqueta (opcional)')
    expect(FIELDS).toContain('Concepto (opcional)')
  })
  it('el selector Gasto/Ingreso solo existe al crear', () => {
    expect(FIELDS).toContain("{mode === 'create' && (\n        <div className=\"filter-row\">")
    expect(CREATE).toContain("draft.isIncome ? 'Apuntar ingreso' : 'Apuntar gasto'")
  })
})

describe('Clasificación, etiquetas, concepto y Necesito', () => {
  it('C. la lista de clasificaciones depende de la categoría elegida y se recarga al cambiarla (y si cambian las clases)', () => {
    expect(FIELDS).toContain('classificationKindFor(draft.expenseCategory, categories)')
    expect(FIELDS).toContain('listFamilyFoodTypes(classificationKind)')
    expect(FIELDS).toContain('[classificationKind, classesVersion]')
  })
  it('se conserva el texto explicativo de Clasificación', () => {
    expect(FIELDS).toContain('Solo hace falta si este movimiento no tiene ticket con productos detrás — para que cuente en "Reparto por')
    expect(FIELDS).toContain('clasificación" de Estadística compras.')
  })
  it('R/S. Gestionar etiquetas sigue accesible y la lista de etiquetas del alta se recarga cuando cambian (sin cerrar el formulario)', () => {
    expect(FS).toContain('⚙️ Gestionar etiquetas')
    expect(FS).toContain("onClick={() => openManager('etiquetas')}")
    expect(MODAL).toContain('return onManagersChanged(load)')
    expect(MODAL).toContain('listTags()')
    expect(MODAL).toContain('<AddExpenseToAnyCategoryInline categories={categories} tags={tags} onAdded={onAdded} />')
  })
  it('K. el texto de Necesito y «Según categoría» salen de la categoría (dinámico) y se conserva la nota informativa', () => {
    expect(FIELDS).toContain('resolveCategoryClassification(draft.isIncome ? null : draft.expenseCategory, categories)')
    expect(FIELDS).toContain("Según categoría{classification.isFixed != null ? ` (${classification.isFixed ? 'Fijo' : 'Variable'})` : ''}")
    expect(FIELDS).toContain('según la categoría, editable en el botón flotante "🗂️ Categorías".')
    expect(FIELDS).not.toMatch(/Según categoría \(Variable\)/)
  })
  it('«Según categoría» (null) es la opción por defecto', () => {
    expect(FIELDS).toContain('draft.isFixedOverride === null ? \' chip-active\'')
  })
})

describe('Persistencia — una sola operación (15)', () => {
  it('al crear se hace UNA inserción con todos los campos; no hay un segundo update para completar', () => {
    expect(CREATE).toContain('await addExpense(buildNewExpenseInput(draft, categories))')
    expect(CREATE).not.toMatch(/updateExpense|classifyPurchase/)
    const add = slice(DATA, 'export async function addExpense(', 'export async function deleteExpense')
    for (const column of ['notes: input.notes ?? null', 'is_fixed_override: input.isFixedOverride ?? null', 'product_classification: input.productClassification ?? null', 'tag_id: input.tagId ?? null']) {
      expect(add).toContain(column)
    }
    expect((add.match(/\.insert\(/g) ?? []).length).toBe(1)
  })
  it('Editar sigue funcionando igual: classify_purchase para el cambio de categoría de un gasto y updateExpense con los mismos campos (Q)', () => {
    expect(EDIT).toContain('classifyPurchase({ expenseId: expense.id, category })')
    expect(EDIT).toContain('await updateExpense(expense.id, {')
    for (const field of ['tagId: values.tagId', 'isFixedOverride: values.isFixedOverride', 'notes: values.notes', 'productClassification: values.productClassification']) expect(EDIT).toContain(field)
    expect(EDIT).toContain('...(expense.isIncome ? {} : { store: values.store })')
    expect(EDIT).toContain('🔮 Añadir a Previsión')
  })
  it('Editar conserva un gasto pendiente de clasificar (categoría null) sin inventar una', () => {
    expect(EDIT).toContain('expenseCategory: expense.isIncome ? defaultExpenseCategory(categories) : expense.category,')
  })
  it('P. los valores iniciales de Editar salen del movimiento guardado: lo creado al dar de alta se reabre idéntico', () => {
    for (const init of ['date: expense.expenseDate', 'amount: String(expense.amount)', "store: expense.store ?? ''", "productClassification: expense.productClassification ?? ''", "tagId: expense.tagId ?? ''", "notes: expense.notes ?? ''", 'isFixedOverride: expense.isFixedOverride']) {
      expect(EDIT).toContain(init)
    }
  })
})

describe('Móvil y uso', () => {
  it('Fecha e Importe comparten fila con etiquetas (inline-fields) y el formulario vive en un modal con scroll propio', () => {
    expect(FIELDS).toContain('<div className="inline-fields">')
    expect(MODAL).toContain('className="modal-sheet"')
  })
})

describe('No regresión', () => {
  it('el alta de tickets, la conciliación y Previsión no se tocan: addExpense mantiene su firma anterior (campos nuevos opcionales)', () => {
    const add = slice(DATA, 'export async function addExpense(', 'export async function deleteExpense')
    expect(add).toContain('notes?: string | null')
    expect(add).toContain('isFixedOverride?: boolean | null')
    expect(add).toContain('productClassification?: string | null')
    expect(add).toContain("source: input.source ?? 'manual'")
  })
})
