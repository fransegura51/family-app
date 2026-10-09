import { describe, expect, it } from 'vitest'

// «Pequeños Grandes» (prompt maestro) — Fase 6: Educación financiera, rediseño amigable para niños. Las
// 4 pestañas pequeñas (chips) se sustituyen por 4 tarjetas grandes con imagen real del usuario (Recibir/
// Ahorrar/Gastar/Impuestos), patrón toca-para-ver-detalle (nunca un formulario grande siempre visible).
// Los conceptos de contabilidad internos NO cambian: walletBalance/walletCategoryTotal (domain/finance.ts)
// siguen siendo la única fuente de los números, solo cambia cómo se presentan.
const UI = (import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
const FS = UI['/src/ui/FinanceScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('WALLET_TABS — 4 tarjetas con imagen real, nunca un color pastel inventado', () => {
  const block = window_(FS, 'const WALLET_TABS: ', '\nexport function KidsFinanceTab(')

  it('importa las 4 imágenes reales (Recibir/Ahorrar/Gastar/Impuestos)', () => {
    expect(FS).toContain("import walletRecibirImg from '@/assets/puntos/educacion/recibir.jpg'")
    expect(FS).toContain("import walletAhorrarImg from '@/assets/puntos/educacion/ahorrar.jpg'")
    expect(FS).toContain("import walletGastarImg from '@/assets/puntos/educacion/gastar.jpg'")
    expect(FS).toContain("import walletImpuestosImg from '@/assets/puntos/educacion/impuestos.jpg'")
  })
  it('las 4 entradas mantienen exactamente los mismos 4 tipos de siempre (ingreso/ahorro/gasto/impuesto)', () => {
    expect(block).toContain("key: 'ingreso'")
    expect(block).toContain("key: 'ahorro'")
    expect(block).toContain("key: 'gasto'")
    expect(block).toContain("key: 'impuesto'")
  })
  it('cada tarjeta lleva su imagen, un teaser corto SIN cifra en € y una explicación larga en lenguaje de niño', () => {
    expect(block).toContain('img: walletRecibirImg')
    expect(block).toContain('img: walletAhorrarImg')
    expect(block).toContain('img: walletGastarImg')
    expect(block).toContain('img: walletImpuestosImg')
    expect(block).toContain("teaser: 'Cuando te dan dinero'")
    expect(block).not.toMatch(/teaser:[^,]*€/)
  })
})

describe('KidsFinanceTab — grid de 4 tarjetas grandes, toca para ver el detalle (nunca un formulario siempre visible)', () => {
  const body = window_(FS, 'export function KidsFinanceTab(', '\nfunction AddGoalForm(')

  it('el estado openCard sustituye al antiguo walletTab — null es el grid, no una pestaña por defecto', () => {
    expect(body).toContain('useState<WalletTransactionType | null>(null)')
    expect(body).not.toContain("useState<WalletTransactionType>('ingreso')")
  })
  it('el grid usa el mismo patrón visual que el hub de Pequeños Grandes (home-card-photo), cuadrado 1:1', () => {
    expect(body).toContain('className="card event-module-card home-card-photo"')
    expect(body).toContain("style={{ aspectRatio: '1 / 1' }}")
    expect(body).toContain('onClick={() => setOpenCard(t.key)}')
  })
  it('el formulario de nuevo movimiento (AddTransactionForm) solo se renderiza dentro del detalle de una tarjeta abierta, nunca en el grid', () => {
    const grid = body.slice(0, body.indexOf('if (openCard)'))
    expect(grid).not.toContain('<AddTransactionForm')
    expect(body).toContain('<AddTransactionForm memberId={activeMemberId} type={openCard} formLabel={cardInfo.formLabel} splitConfig={openCard === \'ingreso\' ? activeSplitConfig : null} onAdded={reload} />')
  })
  it('"← Volver" cierra la tarjeta y vuelve al grid', () => {
    expect(body).toContain('onClick={() => setOpenCard(null)}')
  })
})

describe('Disponible vs Ahorro acumulado — las 2 cifras que importan, nunca 4 saldos en fila como antes', () => {
  const body = window_(FS, 'export function KidsFinanceTab(', '\nfunction AddGoalForm(')

  it('"Disponible" sigue siendo walletBalance (ingreso - ahorro - gasto - impuesto), sin recalcularlo aparte', () => {
    expect(body).toContain('const balance = activeMemberId ? walletBalance(activeMemberId, transactions) : 0')
  })
  it('"Ahorro acumulado" es walletCategoryTotal de tipo ahorro — un acumulado, no un 5º saldo independiente nuevo', () => {
    expect(body).toContain("const savedTotal = activeMemberId ? walletCategoryTotal(activeMemberId, 'ahorro', transactions) : 0")
    expect(body).toContain('Ahorro acumulado: {savedTotal.toFixed(2)} €')
  })
  it('ya no hay una fila con las 4 cifras en paralelo (el patrón "label total · label total · ...")', () => {
    expect(body).not.toContain("WALLET_TABS.map((t) => `${t.label} ${walletCategoryTotal")
  })
})

describe('Objetivos de ahorro — se conservan tal cual, solo dentro del detalle de la tarjeta Ahorrar', () => {
  it('AddGoalForm y el listado de objetivos siguen reutilizándose sin cambios de lógica', () => {
    const body = window_(FS, 'export function KidsFinanceTab(', '\nfunction AddGoalForm(')
    expect(body).toContain("openCard === 'ahorro' && (")
    expect(body).toContain('<AddGoalForm memberId={activeMemberId} onAdded={reload} />')
  })
})
