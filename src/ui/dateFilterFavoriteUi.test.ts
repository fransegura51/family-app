import { describe, expect, it } from 'vitest'

// "Configuración → Filtros temporales" — validación real en iPhone tras el Bloque 5: "☆ Favorito: Mes
// contable" aparecía dentro del desplegable "📅 Fecha" SIN ninguna forma clara/evidente de cambiarlo (un
// texto tocable oculto), y el favorito vivía en localStorage (por dispositivo, no por usuario real).
// Rediseño: el favorito se administra SOLO desde Configuración → Filtros temporales
// (MenuSettingsScreen.tsx) — DateFilterTab (compartido por las 7 pantallas de Economía/Compras) solo
// SELECCIONA el filtro de la sesión y enseña el favorito como información, nunca como botón. Persistencia
// movida a `profiles` (por usuario real, mismo patrón que finance_month_start_day).
const SRC = (import.meta.glob('/src/ui/FinanceScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/FinanceScreen.tsx']
const SETTINGS_SRC = (import.meta.glob('/src/ui/MenuSettingsScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/MenuSettingsScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('Las 7 pantallas con filtro de fecha arrancan desde el favorito real (profiles), no siempre "mes" a pelo', () => {
  it('ninguna pantalla inicializa ya su preset con el literal \'mes\' fijo a mano', () => {
    expect(SRC).not.toContain("useState<SpendRangePreset>('mes')")
  })

  it('las 7 usan el mismo hook compartido (useDateFilterPreset), nunca una copia propia por pantalla', () => {
    const matches = SRC.match(/= useDateFilterPreset\(\)/g) ?? []
    // 6x [preset, setPreset] + 1x [rangePreset, setRangePreset] (BudgetsTab).
    expect(matches.length).toBe(7)
    expect(SRC).toContain('const [rangePreset, setRangePreset] = useDateFilterPreset()')
  })

  it('reutiliza el módulo compartido (state/dateFilterPreset.ts), no reinventa la carga aquí', () => {
    expect(SRC).toContain("import { useDateFilterPreset } from '@/state/dateFilterPreset'")
  })
})

describe('DateFilterTab — el favorito se ENSEÑA (información), nunca se EDITA desde aquí', () => {
  const fn = slice(SRC, 'function DateFilterTab', '\n// Señal DISCRETA de gastos pendientes')

  it('lee las preferencias reales (favorito + desactivados) de profiles, vía data/family.ts — no localStorage', () => {
    expect(fn).toContain('const [prefs, setPrefs] = useState<DateFilterPreferences>({ favorite: null, disabled: [] })')
    expect(fn).toContain('getDateFilterPreferences()')
    // "localStorage" solo aparece en el comentario histórico explicando el rediseño — nunca como código real
    // (ninguna llamada real usaría "localStorage." con punto, para leer/escribir algo).
    expect(fn).not.toContain('localStorage.')
  })

  it('el favorito se muestra como texto informativo, nunca como <button> — no hay ninguna acción de "marcar" aquí', () => {
    const favoriteBlock = slice(fn, '{prefs.favorite && (', '</p>\n          )}')
    expect(favoriteBlock).toContain('<p className="muted"')
    expect(favoriteBlock).not.toContain('<button')
    expect(favoriteBlock).not.toContain('onClick')
    expect(favoriteBlock).toContain('☆ Favorito: ')
    // Apunta a dónde SÍ se puede cambiar, para que no parezca una acción muerta.
    expect(favoriteBlock).toContain('Configuración → Filtros temporales')
  })

  it('el desplegable filtra los presets desactivados (Configuración → Filtros temporales), pero nunca oculta "rango" ni el preset ya seleccionado', () => {
    expect(fn).toContain("const presets = ALL_SPEND_RANGE_PRESETS.filter((p) => p === 'rango' || p === preset || !prefs.disabled.includes(p))")
  })
})

describe('Configuración → Filtros temporales — favorito y activar/desactivar, por usuario real', () => {
  const fn = slice(SETTINGS_SRC, 'function DateFilterSettingsSection', '\n// Piso compartido')

  it('carga y guarda vía data/family.ts (profiles), mismo patrón que AccountingMonthSection (mes contable)', () => {
    expect(fn).toContain('getDateFilterPreferences()')
    expect(fn).toContain('updateDateFilterFavorite(')
    expect(fn).toContain('updateDateFilterDisabled(')
  })

  it('marcar favorito nunca toca la lista de desactivados, y viceversa — son dos preferencias independientes', () => {
    const favFn = slice(fn, 'async function handleFavorite', '\n\n  // "Desactivar"')
    expect(favFn).not.toContain('disabled:')
    const toggleFn = slice(fn, 'async function handleToggleActive', '\n\n  if (loading)')
    expect(toggleFn).not.toContain('favorite:')
  })

  it('tocar el favorito ya marcado lo desmarca (null) — favorito es opcional, no obligatorio tener uno', () => {
    expect(fn).toContain("const next = prefs.favorite === preset ? null : preset")
  })

  it('"rango" nunca aparece en la lista de presets configurables (DISABLEABLE_SPEND_RANGE_PRESETS ya lo excluye)', () => {
    expect(fn).toContain('DISABLEABLE_SPEND_RANGE_PRESETS.map(')
  })

  it('desactivar un preset lo oculta (se añade a la lista), nunca lo borra de ningún catálogo — reactivarlo (quitarlo de la lista) lo devuelve igual', () => {
    const toggleFn = slice(fn, 'async function handleToggleActive', '\n\n  if (loading)')
    expect(toggleFn).toContain('prefs.disabled.filter((p) => p !== preset)')
    expect(toggleFn).toContain('[...prefs.disabled, preset]')
  })
})

describe('Catálogo compartido — un único origen de presets/etiquetas, nunca listas repetidas por pantalla', () => {
  it('DateFilterTab y Configuración recorren el mismo ALL_SPEND_RANGE_PRESETS/DISABLEABLE_SPEND_RANGE_PRESETS (domain/dateRanges.ts)', () => {
    expect(SRC).toContain("import { ") // sanity: el import existe
    expect(SRC).toContain('ALL_SPEND_RANGE_PRESETS')
    expect(SETTINGS_SRC).toContain('DISABLEABLE_SPEND_RANGE_PRESETS')
  })
})
