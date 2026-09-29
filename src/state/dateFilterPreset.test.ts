import { describe, expect, it } from 'vitest'

// "Configuración → Filtros temporales" — el favorito pasó de localStorage (por dispositivo) a `profiles`
// (por usuario real, ver data/family.ts/data/family.test.ts) tras la validación real en iPhone: cambiar de
// móvil perdía el favorito, y no había ninguna forma visible de administrarlo salvo un texto tocable oculto
// dentro del propio desplegable. useDateFilterPreset es ahora solo la comodidad de arranque de cada
// pantalla — no hay jsdom/react-testing-library en este proyecto (mismo motivo documentado en otros
// hooks/componentes), así que se comprueba aquí, de forma estructural, el contrato exacto del hook.
const SRC = (import.meta.glob('/src/state/dateFilterPreset.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/state/dateFilterPreset.ts']

describe('useDateFilterPreset — arranca en "mes" y solo se actualiza si hay un favorito real', () => {
  it('el valor inicial es "mes" (mismo comportamiento de siempre antes de que existiera esta preferencia)', () => {
    expect(SRC).toContain("useState<SpendRangePreset>('mes')")
  })

  it('reutiliza getDateFilterPreferences (data/family.ts) — no reimplementa la lectura aquí', () => {
    expect(SRC).toContain("import { getDateFilterPreferences } from '@/data/family'")
    expect(SRC).toContain('getDateFilterPreferences()')
  })

  it('solo actualiza el preset si favorite existe — sin favorito marcado, se queda en el valor por defecto', () => {
    expect(SRC).toContain('if (favorite) setPreset(favorite)')
  })

  it('un fallo al leer (sin sesión, red...) no rompe nada — cae en el mismo valor por defecto de siempre', () => {
    expect(SRC).toContain('.catch(() => {')
  })

  it('se lee UNA sola vez al montar — el array de dependencias del efecto está vacío, nunca depende de `preset`', () => {
    expect(SRC).toContain('}, [])')
  })

  it('devuelve [preset, setPreset] como una pareja normal — la pantalla sigue pudiendo cambiar el filtro de su sesión libremente, sin que vuelva a sobrescribirse con el favorito', () => {
    expect(SRC).toContain('return [preset, setPreset]')
  })
})
