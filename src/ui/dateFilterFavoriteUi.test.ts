import { describe, expect, it } from 'vitest'

// Cola nocturna, Bloque 5 — motor global de filtros temporales. Auditoría: DateFilterTab (el desplegable
// "📅 Fecha: ...") ya era un componente ÚNICO reutilizado en las 7 pantallas de Economía/Compras que
// filtran por fecha (nunca uno propio por pantalla) y domain/dateRanges.ts ya resolvía las fechas de forma
// compartida — lo que faltaba era un "favorito" persistido (distinto del filtro elegido para esta sesión),
// para no tener que recolocar el mismo filtro cada vez en cada pantalla. Aquí se comprueba el cableado:
// las 7 pantallas arrancan leyendo el favorito guardado (no siempre 'mes' a pelo), y el propio
// DateFilterTab ofrece marcar el filtro actual como favorito sin tocar el filtro de la sesión al hacerlo.
const SRC = (import.meta.glob('/src/ui/FinanceScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/FinanceScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('Las 7 pantallas con filtro de fecha arrancan desde el favorito guardado, no siempre "mes" a pelo', () => {
  it('ninguna pantalla inicializa ya su preset con el literal \'mes\' fijo', () => {
    expect(SRC).not.toContain("useState<SpendRangePreset>('mes')")
  })

  it('las 7 usan el mismo cargador (loadFavoriteDateFilterPreset), nunca una copia propia por pantalla', () => {
    const matches = SRC.match(/useState<SpendRangePreset>\(loadFavoriteDateFilterPreset\)/g) ?? []
    // 6x [preset, setPreset] + 1x [rangePreset, setRangePreset] (BudgetsTab) + 1x [favorite, setFavoriteState]
    // (el propio DateFilterTab, para saber qué opción ya es la favorita — ver el describe de más abajo).
    expect(matches.length).toBe(8)
    expect(SRC).toContain('const [rangePreset, setRangePreset] = useState<SpendRangePreset>(loadFavoriteDateFilterPreset)')
  })

  it('reutiliza el módulo compartido (state/dateFilterPreset.ts), no reinventa el almacenamiento aquí', () => {
    expect(SRC).toContain("import { loadFavoriteDateFilterPreset, saveFavoriteDateFilterPreset } from '@/state/dateFilterPreset'")
  })
})

describe('DateFilterTab — "☆ Marcar como favorito" no toca el filtro de la sesión, solo lo guarda como preferido', () => {
  const fn = slice(SRC, 'function DateFilterTab', '\n// Señal DISCRETA de gastos pendientes')

  it('el favorito es un estado propio del componente, inicializado leyendo el guardado — no depende del `preset` recibido por props', () => {
    expect(fn).toContain('const [favorite, setFavoriteState] = useState<SpendRangePreset>(loadFavoriteDateFilterPreset)')
  })

  it('marcar favorito llama a saveFavoriteDateFilterPreset con el preset ACTUAL de la sesión, nunca a onPresetChange (no cambia el filtro seleccionado)', () => {
    const btnBlock = slice(fn, 'disabled={favorite === preset}', '{favorite === preset ? `☆ Favorito')
    expect(btnBlock).toContain('saveFavoriteDateFilterPreset(preset)')
    expect(btnBlock).toContain('setFavoriteState(preset)')
    expect(btnBlock).not.toContain('onPresetChange(')
  })

  it('"Rango de fecha" no se puede marcar como favorito (un desde/hasta concreto no tiene sentido guardado a futuro)', () => {
    expect(fn).toContain("{preset !== 'rango' && (")
  })

  it('el botón indica con claridad si el filtro actual YA es el favorito, o invita a marcarlo', () => {
    expect(fn).toContain('favorite === preset')
    expect(fn).toContain('☆ Favorito: ')
    expect(fn).toContain('☆ Marcar "')
  })
})
