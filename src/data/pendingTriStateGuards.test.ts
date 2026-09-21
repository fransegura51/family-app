import { describe, expect, it } from 'vitest'

// Guardas de la FASE 6C.2B: «Pendiente de clasificar» (categoría financiera NULL) y triestado de producto (comida / no comida / desconocido).
const APP = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const FUNCTIONS = import.meta.glob('/supabase/functions/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const FINANCE_SCREEN = APP['/src/ui/FinanceScreen.tsx']
const SHOPPING_SCREEN = APP['/src/ui/ShoppingScreen.tsx']
const PRODUCTS = APP['/src/domain/products.ts']

describe('«Pendiente de clasificar» no es una categoría', () => {
  it('ninguna migración crea una categoría, un gasto o un ticket con ese nombre', () => {
    for (const [file, sql] of Object.entries(MIGRATIONS)) {
      const code = sql.replace(/--[^\n]*/g, '').replace(/comment on column[^;]*;/gi, '')
      expect(code, file).not.toMatch(/insert\s+into[^;]*Pendiente de clasificar/i)
      expect(code, file).not.toMatch(/(update|set)\s+[^;]*category\s*=\s*'Pendiente de clasificar'/i)
    }
  })

  it('el código nunca guarda el texto en expenses.category / receipts.category / budget_categories', () => {
    for (const [file, text] of [...Object.entries(APP), ...Object.entries(FUNCTIONS)]) {
      expect(text, file).not.toMatch(/category:\s*(?:PENDING_LABEL|['"]Pendiente de clasificar['"])/)
      expect(text, file).not.toMatch(/name:\s*(?:PENDING_LABEL|['"]Pendiente de clasificar['"])/)
    }
  })

  it('la definición de NULL vive en un solo módulo; se reutiliza en presupuestos, cálculo, análisis y Economía', () => {
    expect(APP['/src/domain/pending.ts']).toContain('export function isPendingCategory')
    for (const f of ['/src/domain/finance.ts', '/src/domain/financeCompute.ts', '/src/domain/financeAnalysis.ts', '/src/ui/FinanceScreen.tsx']) {
      expect(APP[f], f).toMatch(/from '@\/domain\/pending'/)
    }
  })

  it('el presupuesto General cuenta los pendientes y los de categoría / Alimentación quedan antes, sin contarlos', () => {
    const src = APP['/src/domain/finance.ts']
    const body = src.slice(src.indexOf('export function budgetSpent'))
    expect(body.indexOf('if (budget.category)')).toBeLessThan(body.indexOf('isPendingCategory(e.category)'))
    expect(body.indexOf("budget.budgetGroup === 'alimentacion'")).toBeLessThan(body.indexOf('isPendingCategory(e.category)'))
    expect(body).toContain('inOwnGroup(e) || isFood(e) || isPendingCategory(e.category)')
  })

  it('PEPA: una consulta de pendientes es una métrica propia, no una búsqueda contra categorías', () => {
    expect(APP['/src/domain/financeQuery.ts']).toContain("| 'pending'")
    expect(APP['/src/domain/financeCompute.ts']).toContain("case 'pending':")
    // la IA no clasifica pendientes ni recibe una categoría inventada
    expect(APP['/src/domain/financeIntent.ts']).not.toMatch(/pending/i)
  })
})

describe('triestado de producto: comida / no comida / DESCONOCIDO', () => {
  it('existe una única semántica explícita, no un booleano', () => {
    expect(PRODUCTS).toContain("export type ProductNature = 'alimentacion' | 'no_alimentos' | 'desconocido'")
    expect(PRODUCTS).toContain('export function resolvePurchaseNature')
  })

  it('ningún consumidor trata «no es comida» como «Otros» con !isFoodPurchase: un desconocido no es Otros', () => {
    const offenders = Object.entries(APP).filter(([, t]) => /!\s*isFoodPurchase\(/.test(t) || /isFoodPurchase\([^)]*\)\s*===\s*\(?\s*mode/.test(t))
    expect(offenders.map(([f]) => f)).toEqual([])
  })

  it('Economía separa el desconocido de Alimentos y Otros («Productos sin clasificar»); no lo suma a Otros', () => {
    expect(FINANCE_SCREEN).toContain("if (nature === 'desconocido')")
    expect(FINANCE_SCREEN).toContain('const sinClasificarTotal = splits.reduce')
    expect(FINANCE_SCREEN).toContain('const comprasTotal = alimentacionTotal + noAlimentosTotal + sinClasificarTotal')
    // el resto sin desglosar de un gasto pendiente tampoco se atribuye a Otros
    expect(FINANCE_SCREEN).toContain('unknownAmount += remainder')
  })

  it('Historial no cuenta los desconocidos en los totales de Otros (solo los enseña, bajo «Sin clasificar»)', () => {
    expect(SHOPPING_SCREEN).toContain("purchaseNature(p, foodReceiptIds, nonFoodProductIds, foodProductIds) !== 'desconocido'")
    expect(SHOPPING_SCREEN).toContain("mode === 'alimentacion' ? nature === 'alimentacion' : nature !== 'alimentacion'")
  })

  it('«no comida» explicativo (alimentación oculta) solo cuenta lo que se SABE que no es comida', () => {
    expect(FINANCE_SCREEN).toContain("=== 'no_alimentos')")
  })

  it('la TIENDA no decide la naturaleza ni la marca non_food: ni el borrador de ticket ni el guardado usan Amazon/tienda', () => {
    expect(FINANCE_SCREEN).not.toContain('defaultIsFood')
    expect(FINANCE_SCREEN).not.toMatch(/ticketStore\.trim\(\)\.toLowerCase\(\)\s*!==\s*'amazon'/)
    const nature = PRODUCTS.slice(PRODUCTS.indexOf('export function resolvePurchaseNature'), PRODUCTS.indexOf('export function purchaseNature'))
    expect(nature).not.toMatch(/\bstore\b|amazon/i)
  })

  it('non_food solo se guarda con EVIDENCIA (elección de la familia o aprendizaje compartido), nunca por una suposición por defecto', () => {
    expect(FINANCE_SCREEN).toContain("resolved.kindSource === 'shared' || (resolved.kindSource === 'override' && !explicitClass)")
    expect(FINANCE_SCREEN).not.toMatch(/setProductNonFood\(productId,\s*resolved\.kind === 'no_alimentos'\),\s*\n\s*\]\)/)
    expect((FINANCE_SCREEN.match(/setProductNonFood\(/g) ?? []).length).toBe(1) // una sola llamada, la condicionada
  })

  it('una categoría financiera genérica del ticket no prueba «no alimentos»: solo «Alimentación» aporta evidencia (histórica, identificada)', () => {
    const nature = PRODUCTS.slice(PRODUCTS.indexOf('export function resolvePurchaseNature'), PRODUCTS.indexOf('export function purchaseNature'))
    expect(nature).toContain("basis: 'ticket_alimentacion'")
    // ninguna rama devuelve 'no_alimentos' por el ticket
    const noAlimentosLines = nature.split('\n').filter((l) => l.includes("nature: 'no_alimentos'"))
    expect(noAlimentosLines).toHaveLength(1)
    expect(noAlimentosLines[0]).toContain('nonFoodProductIds')
  })
})
