import { describe, expect, it } from 'vitest'

// PEPA-CARRERA-DECOR — cableado de la decoración mensual en la Carrera real. El dibujo de cada mes se prueba en
// raceDecor/raceDecor.test.mjs; aquí, que la Carrera sigue siendo la de siempre cuando no hay decoración, que la pantalla de
// Puntos solo la pasa en modo Carrera y que el mes sale de la fecha de España.
const files = import.meta.glob(['/src/ui/RaceTrack.tsx', '/src/ui/RewardsScreen.tsx', '/src/ui/MiCamino.tsx', '/src/ui/raceDecor/index.js'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const RACE = files['/src/ui/RaceTrack.tsx']
const SCREEN = files['/src/ui/RewardsScreen.tsx']
const MI_CAMINO = files['/src/ui/MiCamino.tsx']
const DECOR = files['/src/ui/raceDecor/index.js']

describe('Decoración mensual — la Carrera sin decorador es la de siempre', () => {
  it('el decorador es un parámetro OPCIONAL y todos los ganchos son opcionales', () => {
    expect(RACE).toContain('decorator?: RaceDecorator')
    expect(RACE).toContain('decoratorRef.current?.drawHills?.(ctx!, curEnv)')
    expect(RACE).toContain('decoratorRef.current?.drawScenery?.(ctx!, curEnv)')
    expect(RACE).toContain('if (decor && env) decor.drawGround?.(ctx!, env)')
    expect(RACE).toContain('if (decor && env) decor.drawBack(ctx!, env)')
    expect(RACE).toContain('if (decorFront && env) decorFront.drawFront(ctx!, env)')
  })
  it('la Carrera no importa nada de la decoración (solo recibe el objeto): sigue siendo independiente', () => {
    expect(RACE).not.toContain("from '@/ui/raceDecor")
    expect(RACE).not.toContain('supabase')
  })
  it('los puntos, los corredores y su cálculo no se tocan: la decoración solo lee tamaño, tiempo y líneas del paisaje', () => {
    const env = RACE.slice(RACE.indexOf('const env = decor'), RACE.indexOf('curEnv = env'))
    expect(env).toContain('runnerCount: runnersRef.current.length')
    expect(env).not.toContain('points')
    expect(env).not.toContain('member')
  })
  it('las dos correcciones del paisaje real: nubes separadas y «reducir movimiento» ya no deja el lienzo en blanco', () => {
    expect(RACE).toContain('(W + 260)) / 5 + 53 - t * 2.6')
    expect(RACE).toContain('if (reduced) draw()')
  })
})

describe('Decoración mensual — dónde se usa', () => {
  it('solo en el modo Carrera; Mi Camino (modo Camino) no la usa ni se toca', () => {
    expect(SCREEN).toContain("mode === 'camino' ? <MiCamino runners={raceRunners} /> : <RaceTrack runners={raceRunners} decorator={raceDecorator} />")
    expect(MI_CAMINO).not.toContain('raceDecor')
  })
  it('el mes lo decide la fecha de España, nadie lo elige, y se revisa cada media hora', () => {
    expect(SCREEN).toContain('const [raceDecorator] = useState(() => createRaceDecorator())')
    expect(SCREEN).toContain('raceDecorator.setMonth(currentMonthInSpain(), januaryVariantInSpain())')
    expect(SCREEN).toContain('30 * 60 * 1000')
    expect(DECOR).toContain("timeZone: 'Europe/Madrid'")
  })
  it('la decoración nunca lee datos de la familia ni escribe nada', () => {
    expect(DECOR).not.toMatch(/supabase|fetch\(|localStorage|@\/data/)
  })
})
