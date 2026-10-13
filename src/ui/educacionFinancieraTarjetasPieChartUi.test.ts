import { describe, expect, it } from 'vitest'

// PG-PUNTOS-FINANZAS (Parte B4) — las 4 tarjetas ilustradas pasan de "imagen + teaser" a "imagen +
// título + cifra real + dónut del reparto + botón 'Nuevo X'", reutilizando SvgDonut (ya con el
// atenuado de porciones no resaltadas) en vez de dibujar un gráfico nuevo.
const UI = (import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
// .replace: un checkout en Windows puede guardar el archivo con CRLF; los \n literales de abajo
// deben seguir encontrándolo igual.
const FS = UI['/src/ui/FinanceScreen.tsx'].replace(/\r\n/g, '\n')

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('WALLET_TABS — títulos renombrados (Parte B4): Recibido/Ahorro/Para gastar/Impuestos', () => {
  const block = window_(FS, 'const WALLET_TABS: ', '\nexport function KidsFinanceTab(')

  it('ya no usa los verbos antiguos como título de tarjeta', () => {
    expect(block).toContain("label: 'Recibido'")
    expect(block).toContain("label: 'Ahorro'")
    expect(block).toContain("label: 'Para gastar'")
    expect(block).toContain("label: 'Impuestos'")
    expect(block).not.toContain("label: 'Recibir'")
    expect(block).not.toContain("label: 'Ahorrar'")
    expect(block).not.toContain("label: 'Gastar'")
  })
})

describe('WALLET_SPLIT_HIGHLIGHT — qué porción resalta cada tarjeta, nunca un reparto distinto por tarjeta', () => {
  const block = window_(FS, 'const WALLET_SPLIT_HIGHLIGHT: ', '\nexport function KidsFinanceTab(')

  it('"Recibido" no resalta ninguna porción (se ve el reparto completo)', () => {
    expect(block).toContain('ingreso: null')
  })
  it('Ahorro/Impuestos resaltan su propia porción del reparto', () => {
    expect(block).toContain("ahorro: 'ahorro'")
    expect(block).toContain("impuesto: 'impuesto'")
  })
  it('"Para gastar" resalta "disponible", no es una porción del reparto en sí (gastar no reparte dinero nuevo)', () => {
    expect(block).toContain("gasto: 'disponible'")
  })
})

describe('Las 4 tarjetas grandes — cifra real + dónut del reparto en vivo + "+ Nuevo X" (Parte B4)', () => {
  const body = window_(FS, 'export function KidsFinanceTab(', '\nfunction GoalCard(')
  const grid = window_(body, 'className="card-grid" style={{ marginTop: 8 }}', '\n    </div>\n  )\n}')

  it('"Para gastar" usa balance (disponible real), nunca el total histórico de gasto', () => {
    expect(grid).toContain("const cardTotal = t.key === 'gasto' ? balance : walletCategoryTotal(activeMemberId, t.key, transactions)")
  })
  it('el dónut usa el reparto configurado en vivo (activeSplitConfig), nunca un % fijo ni un importe real', () => {
    expect(grid).toContain('activeSplitConfig.ahorroPct')
    expect(grid).toContain('activeSplitConfig.impuestoPct')
    expect(grid).not.toMatch(/total:\s*60\b/)
    expect(grid).not.toMatch(/total:\s*20\b/)
  })
  it('reutiliza SvgDonut (atenuado ya existente), compacto para no desplazar la ilustración', () => {
    expect(grid).toContain('<SvgDonut')
    expect(grid).toContain('highlightedKey={highlightedKey}')
    expect(grid).toContain('size={68}')
  })
  it('tocar la imagen/el dónut navega al detalle (setOpenCard); "+ Nuevo {formLabel}" abre el modal real (setAddModalType), nunca el mismo destino', () => {
    expect(grid).toContain('+ Nuevo {t.formLabel}')
    expect(grid).toContain('onClick={() => setOpenCard(t.key)}')
    expect(grid).toContain('onClick={() => setAddModalType(t.key)}')
    expect(grid).not.toContain('<AddTransactionForm')
  })
  it('el botón que envolvía toda la tarjeta ahora solo envuelve la imagen (ya no puede anidar otro botón dentro)', () => {
    expect(grid).toContain('className="wallet-type-card-tap"')
    expect(grid).not.toContain('<button key={t.key} type="button" className="card event-module-card home-card-photo"')
  })
})

describe('SvgDonut — unidad del centro configurable (Parte B4), sin tocar los usos existentes en €', () => {
  const fn = window_(FS, 'function SvgDonut({', '\nfunction useOutsideClickReset(')

  it('por defecto sigue siendo €, el resto de llamadas existentes no cambian de comportamiento', () => {
    expect(fn).toContain("centerUnit = '€'")
  })
  it('cuando el centro es un %, no repite el mismo dato dos veces entre paréntesis', () => {
    expect(fn).toContain("centerUnit === '€' &&")
  })
})
