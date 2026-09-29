import { describe, expect, it } from 'vitest'

// Auditoría real (petición del usuario): "Total Registrado en Compras" (1.662,30 €) y "Gasto mensual"/
// "Reparto por tienda" (1.311 €, mismo periodo) no cuadraban — reconciliado con SQL directo contra los
// datos reales de Familia Hepburn: la diferencia (~351 €) son compras pagadas con tarjeta/banco SIN ningún
// ticket subido — "Total Registrado" las cuenta (sale de `expenses`, con o sin ticket, ver
// FinanceScreen.tsx:7129), "Gasto mensual"/"Reparto por tienda" no (son solo tickets, como ya decía su
// propio título "solo con ticket"). No es un bug, son universos de registros distintos — pero "lo
// preguntarán más de una vez", así que se aclara en LAS DOS secciones, no solo en una: el aviso de abajo
// (junto a "Solo con ticket subido") ya existía; este cambio añade el mismo aviso, mirando en la otra
// dirección, junto al propio "Total Registrado en Compras" de arriba.
const SRC = (import.meta.glob('/src/ui/FinanceScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/FinanceScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('Estadística compras — el aviso "solo con ticket" existe en las DOS secciones, no solo en una', () => {
  it('junto a "Total Registrado en Compras" (arriba) avisa de que más abajo los totales pueden salir más bajos', () => {
    const card = slice(SRC, '<strong>Total Registrado en Compras</strong>', '\n      )}')
    expect(card).toContain('compras pagadas con tarjeta o banco sin ticket subido')
    expect(card).toContain('Reparto por tienda')
    expect(card).toContain('Gasto mensual')
  })

  it('junto a "Reparto por tienda — solo con ticket" (abajo) sigue avisando de que no es igual al total de arriba', () => {
    expect(SRC).toContain('Solo con ticket subido')
    const noticeBlock = slice(SRC, 'Solo con ticket subido', '<StoreBreakdownChart')
    expect(noticeBlock).toContain('Total Registrado en Compras')
    expect(noticeBlock).toContain('parecido pero NO igual')
  })

  it('ambos avisos son coherentes entre sí — mencionan el nombre exacto de la sección del otro lado', () => {
    // El de arriba nombra literalmente las dos piezas de abajo ("Reparto por tienda", "Gasto mensual");
    // el de abajo nombra literalmente el total de arriba ("Total Registrado en Compras") — así cualquiera
    // de los dos avisos, se lea el que se lea primero, apunta al otro lado de la comparación.
    const topCard = slice(SRC, '<strong>Total Registrado en Compras</strong>', '\n      )}')
    const bottomNotice = slice(SRC, 'Solo con ticket subido', '<StoreBreakdownChart')
    expect(topCard).toContain('Reparto por tienda')
    expect(bottomNotice).toContain('Total Registrado en Compras')
  })
})
