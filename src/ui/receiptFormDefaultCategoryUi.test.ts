import { describe, expect, it } from 'vitest'

// Encargo "COM-01 — subcategoría predeterminada al subir tickets": "Subir ticket" partía con la
// categoría general «Alimentación» preseleccionada; ahora parte de la subcategoría real "Supermercado,
// carnicería y tiendas de alimentación" (defaultReceiptCategory, domain/movementForm.ts), sin crear
// ninguna categoría nueva. Editar un ticket existente sigue conservando su propia categoría guardada
// (receipt.category), sin tocar ese camino.
// .replace: un checkout en Windows puede guardar el archivo con CRLF; los \n literales de abajo deben
// seguir encontrándolo igual (ver feedback_no_prettier_and_git_checkout_flips_crlf).
const FINANCE_SRC = (import.meta.glob('/src/ui/FinanceScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/FinanceScreen.tsx'].replace(/\r\n/g, '\n')

function receiptFormBody(): string {
  const start = FINANCE_SRC.indexOf('function ReceiptForm({')
  expect(start, 'no se encontró ReceiptForm').toBeGreaterThan(-1)
  const end = FINANCE_SRC.indexOf('\nfunction ', start + 1)
  expect(end, 'no se encontró el final de ReceiptForm').toBeGreaterThan(start)
  return FINANCE_SRC.slice(start, end)
}

describe('COM-01 — «Subir ticket» parte de la subcategoría real, no de «Alimentación» a secas', () => {
  it('un ticket NUEVO usa defaultReceiptCategory(categories), nunca el literal "Alimentación" a mano', () => {
    const body = receiptFormBody()
    expect(body).toContain("const [category, setCategory] = useState(receipt ? (receipt.category ?? '') : defaultReceiptCategory(categories))")
    // Tampoco debe quedar el reset tras guardar con el literal antiguo.
    expect(body).not.toContain("setCategory('Alimentación')")
    expect(body).toContain('setCategory(defaultReceiptCategory(categories))')
  })

  it('editar un ticket existente sigue arrancando de su propia categoría guardada (o vacío si está pendiente) — no se toca este camino', () => {
    const body = receiptFormBody()
    expect(body).toContain("receipt ? (receipt.category ?? '')")
  })

  it('defaultReceiptCategory se importa desde domain/movementForm, el mismo sitio que el resto de valores por defecto de categoría', () => {
    expect(FINANCE_SRC).toContain('defaultReceiptCategory')
    expect(FINANCE_SRC).toMatch(/defaultExpenseCategory,\s*\n\s*defaultIncomeCategory,\s*\n\s*defaultReceiptCategory,/)
  })
})
