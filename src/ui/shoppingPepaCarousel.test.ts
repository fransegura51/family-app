import { describe, expect, it } from 'vitest'

// Inciso Compras — Parte A: "PEPA analiza tus compras" (PepaComprasWidget,
// ShoppingScreen.tsx). La lógica pura de los 8 hallazgos se prueba en
// src/domain/shoppingInsights.test.ts; aquí se comprueba el cableado del
// carrusel en sí: selección inicial, swipe, "+info" y que no duplica
// "¿Por qué ha cambiado mi compra?".
const APP = import.meta.glob('/src/ui/ShoppingScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SRC = APP['/src/ui/ShoppingScreen.tsx']

function window(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const WIDGET = window(SRC, 'function PepaComprasWidget', '\n// Fase 1F.D — mudado desde Economía')

describe('selección inicial (TEST: selección inicial válida)', () => {
  it('el índice inicial es aleatorio entre los hallazgos disponibles, calculado UNA sola vez con el inicializador perezoso de useState (no en cada render)', () => {
    expect(WIDGET).toContain('useState(() => Math.floor(Math.random() * Math.max(insights.length, 1)))')
  })

  it('un efecto corrige el índice si insights se queda más corto que el índice actual (mismo guard que PepaConclusionsWidget)', () => {
    const body = window(WIDGET, 'useEffect(() => {\n    if (index >= insights.length)', '}, [insights.length, index])')
    expect(body).toContain('setIndex(0)')
  })
})

describe('swipe (TEST: swipe no altera datos)', () => {
  it('el swipe solo cambia el índice mostrado (setIndex), nunca recalcula ni muta los insights recibidos', () => {
    const body = window(WIDGET, 'function handleTouchEnd', 'return (')
    expect(body).toContain('go(dx < 0 ? 1 : -1)')
    expect(body).not.toMatch(/buildShoppingInsights|setInsights|\.sort\(|\.filter\(/)
  })

  it('mismo umbral que PepaConclusionsWidget: arrastre horizontal >= 50px y más horizontal que vertical', () => {
    const body = window(WIDGET, 'function handleTouchEnd', 'return (')
    expect(body).toContain('Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy)')
  })

  it('go() envuelve el índice de forma circular sin depender de datos externos', () => {
    expect(WIDGET).toContain('setIndex((i) => (i + delta + insights.length) % insights.length)')
  })
})

describe('indicadores (puntos)', () => {
  it('reutiliza home-photo-banner-dot(-active), igual que Economía, solo si hay más de un hallazgo', () => {
    expect(WIDGET).toContain('insights.length > 1 &&')
    expect(WIDGET).toContain("'home-photo-banner-dot' + (i === index ? ' home-photo-banner-dot-active' : '')")
  })
})

describe('+info (TEST: +info solo cuando existe destino válido)', () => {
  it('el botón "+info →" solo se pinta cuando el hallazgo trae moreInfo (nunca un botón muerto)', () => {
    expect(WIDGET).toContain('{current.moreInfo && (')
  })

  it('al pulsarlo, guarda el enlace pendiente y navega a Historial — destino real, no una URL inventada', () => {
    const body = window(WIDGET, 'onClick={(e) => {', '+info →')
    expect(body).toContain('setPendingProductHistoryLink(current.moreInfo!)')
    expect(body).toContain('onNavigateToHistory()')
  })

  it('HistoryTab consume el enlace pendiente una sola vez, cuando los datos ya están cargados, y ajusta el chip Alimentos/Otros + el buscador', () => {
    const body = window(SRC, 'const link = takePendingProductHistoryLink()', 'foodProductIds])')
    expect(body).toContain('pendingLinkAppliedRef.current = true')
    // El chip se decide con purchaseNature (naturaleza real, ligada a los tickets), no adivinando por classKind a ciegas.
    expect(body).toContain("purchaseNature(productPrice, foodReceiptIds, nonFoodProductIds, foodProductIds)")
    expect(body).toContain("setMode(nature === 'alimentacion' ? 'alimentacion' : 'no_alimentos')")
    expect(body).toContain('setQuery(link.productName)')
  })
})

describe('estado sin datos suficientes', () => {
  it('con insights.length === 0 muestra un estado sencillo de Pepa, nunca inventa una conclusión', () => {
    const body = window(WIDGET, 'if (insights.length === 0) {', '}\n  const current = insights[index]')
    expect(body).toContain('Todavía necesito más tickets o compras registradas para detectar patrones.')
  })
})

describe('no duplica "¿Por qué ha cambiado mi compra?" (TEST: no solapamiento con Por qué ha cambiado mi compra)', () => {
  it('PepaComprasWidget se pinta ANTES del bloque de PorQueHaCambiadoMiCompra, ambos visibles, sin fusionarse', () => {
    const body = window(SRC, '<PepaComprasWidget', '<PorQueHaCambiadoMiCompra')
    expect(body).toBeTruthy()
  })

  it('PepaComprasWidget no recibe ni usa purchases/RawPurchase (el input de decomposeSpendChange/compareMonths)', () => {
    expect(WIDGET).not.toMatch(/RawPurchase|decomposeSpendChange|compareMonths/)
  })
})

describe('carga de datos: hábitos sobre TODO (Alimentos + Otros), no solo la cesta de alimentación', () => {
  it('insights se calcula con allPrices/allProductsForInsights (sin filtrar por isFoodPurchase), aparte de purchases (filtrado, para el bloque de abajo)', () => {
    const body = window(SRC, 'const insights = useMemo(', '[allPrices, allProductsForInsights],')
    expect(body).toContain('buildShoppingInsights({ prices: allPrices, products: allProductsForInsights })')
  })
})
