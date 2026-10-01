import { describe, expect, it } from 'vitest'
import { INITIAL_SECTION_HOME_TRACKER, stepSectionHome, type SectionHomeTrackerState } from './useSectionHome'

// Este proyecto no usa un DOM real en sus tests (sin jsdom/testing-library — ver el resto del repo), así
// que useSectionHome se diseñó con su lógica de decisión separada del useEffect/useRef de React
// (stepSectionHome, puro) precisamente para poder probar el COMPORTAMIENTO real — la secuencia de
// navegaciones y cuándo dispara el reset — sin depender de renderizar nada. Esto es lo mismo que hace
// `reorderShoppingItems`/`resolveStoreChain` en el resto del repo: la parte con efectos es un envoltorio
// fino sobre una función pura, y es la función pura la que se examina a fondo aquí.

function run(steps: { key: string; sectionHome?: boolean }[]): boolean[] {
  let tracker: SectionHomeTrackerState = INITIAL_SECTION_HOME_TRACKER
  const fired: boolean[] = []
  for (const step of steps) {
    const result = stepSectionHome(tracker, step.key, step.sectionHome)
    tracker = result.tracker
    fired.push(result.shouldFireHome)
  }
  return fired
}

describe('stepSectionHome — cuándo dispara "volver a Inicio" y cuándo no', () => {
  it('una navegación nueva con sectionHome:true dispara el reset exactamente una vez', () => {
    expect(run([{ key: 'a' }, { key: 'b', sectionHome: true }])).toEqual([false, true])
  })

  it('re-renders normales con la MISMA location.key (sin navegación nueva) nunca vuelven a disparar', () => {
    expect(
      run([
        { key: 'b', sectionHome: true },
        { key: 'b', sectionHome: true },
        { key: 'b', sectionHome: true },
      ]),
    ).toEqual([true, false, false])
  })

  it('una navegación normal (sin sectionHome en el state) nunca dispara el reset — pestañas/vistas normales no se tocan', () => {
    expect(
      run([
        { key: 'a' },
        { key: 'b' },
        { key: 'c', sectionHome: false },
      ]),
    ).toEqual([false, false, false])
  })

  it('dos "vuelve a Inicio" seguidas (dos clics reales en el breadcrumb, cada uno con su propia key) disparan las dos — no es un disparo de una sola vez para siempre', () => {
    expect(
      run([
        { key: 'a', sectionHome: true },
        { key: 'b' },
        { key: 'c', sectionHome: true },
      ]),
    ).toEqual([true, false, true])
  })

  it('no hay doble disparo ni bucle: la MISMA key nunca produce un segundo shouldFireHome aunque se evalúe muchas veces', () => {
    const fired = run(Array.from({ length: 20 }, () => ({ key: 'same', sectionHome: true })))
    expect(fired.filter(Boolean)).toHaveLength(1)
  })
})
