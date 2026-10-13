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
    expect(body).toContain('className="card event-module-card home-card-photo wallet-type-card"')
    expect(body).toContain("style={{ aspectRatio: '1 / 1' }}")
    expect(body).toContain('onClick={() => setOpenCard(t.key)}')
  })
  it('el formulario de nuevo movimiento (AddTransactionForm) solo se renderiza dentro del detalle de una tarjeta abierta, nunca en el grid', () => {
    const grid = body.slice(0, body.indexOf('if (openCard)'))
    expect(grid).not.toContain('<AddTransactionForm')
    expect(body).toContain('<AddTransactionForm')
    expect(body).toContain('memberId={activeMemberId}')
    expect(body).toContain('type={openCard}')
  })
  it('"← Volver" cierra la tarjeta y vuelve al grid', () => {
    expect(body).toContain('onClick={() => setOpenCard(null)}')
  })
})

// Parte B3 (PG-PUNTOS-FINANZAS) — el par "Disponible"/"Ahorro acumulado" se sustituye por la tira
// compacta "💰 Mi dinero ahora", pero las cifras de verdad (balance/savedTotal) son EXACTAMENTE las
// mismas de siempre — walletBalance/walletCategoryTotal (domain/finance.ts) nunca se tocan, solo cambia
// cómo se presentan (ahora junto al 💸 "Ya gastado" informativo, que nunca se resta otra vez de nada).
describe('"💰 Mi dinero ahora" — sustituye a Disponible/Ahorro acumulado, mismas cifras de siempre', () => {
  const body = window_(FS, 'export function KidsFinanceTab(', '\nfunction AddGoalForm(')

  it('"Para gastar" sigue siendo walletBalance (ingreso - ahorro - gasto - impuesto), sin recalcularlo aparte', () => {
    expect(body).toContain('const balance = activeMemberId ? walletBalance(activeMemberId, transactions) : 0')
  })
  it('"Hucha" es walletCategoryTotal de tipo ahorro — un acumulado, no un 5º saldo independiente nuevo', () => {
    expect(body).toContain("const savedTotal = activeMemberId ? walletCategoryTotal(activeMemberId, 'ahorro', transactions) : 0")
    expect(body).toContain('🐷 Hucha: {savedTotal.toFixed(2)} €')
  })
  it('el total es hucha + para gastar; "Ya gastado" se enseña en negativo pero es solo informativo — balance YA tiene el gasto restado, nunca se resta dos veces', () => {
    expect(body).toContain('const moneyNow = savedTotal + balance')
    expect(body).toContain("const gastoTotal = activeMemberId ? walletCategoryTotal(activeMemberId, 'gasto', transactions) : 0")
    expect(body).toContain('💸 Ya gastado: -{gastoTotal.toFixed(2)} €')
  })
  it('el antiguo par "Disponible"/"Ahorro acumulado" ya no existe', () => {
    expect(body).not.toContain('Disponible: {balance.toFixed(2)} €')
    expect(body).not.toContain('Ahorro acumulado: {savedTotal.toFixed(2)} €')
  })
  it('ya no hay una fila con las 4 cifras en paralelo (el patrón "label total · label total · ...")', () => {
    expect(body).not.toContain("WALLET_TABS.map((t) => `${t.label} ${walletCategoryTotal")
  })
})

// Parte B2/B3 (PG-PUNTOS-FINANZAS) — "+ Nuevo objetivo de ahorro" vive en la pantalla PRINCIPAL (el
// grid), no dentro del detalle de la tarjeta Ahorrar — justo lo que exige B3 al describir su tira de
// dinero como "entre el objetivo y las 4 tarjetas". El detalle de "Ahorrar" ya no gestiona objetivos.
describe('Objetivos de ahorro — en la pantalla principal, entre el grid y la tira "Mi dinero ahora"', () => {
  const body = window_(FS, 'export function KidsFinanceTab(', '\nfunction AddGoalForm(')
  // El grid es el JSX devuelto DESPUÉS del bloque "if (openCard) { ... }" (el detalle de una tarjeta) —
  // arranca en su propio marcador único, justo al principio de ese segundo `return (`, hasta GoalCard.
  const grid = window_(body, '{standalone && <SectionBreadcrumb subsection="Educación financiera" />}', '\nfunction GoalCard(')

  it('el listado de objetivos vive en el grid principal, nunca dentro del detalle de la tarjeta Ahorrar', () => {
    expect(grid).toContain('{memberGoals.map((goal, i) => (')
    expect(body).not.toContain("openCard === 'ahorro' && (")
  })
  it('"+ Nuevo objetivo de ahorro" aparece antes de la lista de objetivos, nunca siempre visible', () => {
    const addIdx = grid.indexOf('+ Nuevo objetivo de ahorro')
    const listIdx = grid.indexOf('{memberGoals.map((goal, i) => (')
    expect(addIdx).toBeGreaterThan(-1)
    expect(listIdx).toBeGreaterThan(-1)
    expect(addIdx).toBeLessThan(listIdx)
  })
  it('los objetivos aparecen ANTES de "Mi dinero ahora", que a su vez va antes de las 4 tarjetas', () => {
    const goalsIdx = grid.indexOf('{memberGoals.map((goal, i) => (')
    const moneyIdx = grid.indexOf('💰 Mi dinero ahora')
    const cardsIdx = grid.indexOf('className="card-grid"')
    expect(goalsIdx).toBeLessThan(moneyIdx)
    expect(moneyIdx).toBeLessThan(cardsIdx)
  })
})
