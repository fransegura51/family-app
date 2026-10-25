// Motor de los capítulos: reintento, «solo leyendo», volver al principio, contador sin pasos omitidos, adelantarse con un aviso de «guardado» y colocación de la tarjeta (planPanel).
import { describe, expect, it } from 'vitest'
import { previousIndex, reduceTour, startState, stepNumbers } from '@/help/tours/engine'
import { COMPACT_HEIGHT, PILL_HEIGHT, planPanel } from '@/help/tours/viewport'
import type { ObservedSignal, TourDef, TourState } from '@/help/tours/types'

const tour: TourDef = {
  id: 'cap',
  version: 1,
  title: 'Capítulo',
  cardId: 'c',
  durationSec: 60,
  startPath: '/x',
  steps: [
    { id: 'uno', text: 'uno', target: 'x.uno', completeOn: [{ type: 'click', target: 'x.uno' }] },
    { id: 'dos', text: 'dos', target: 'x.dos', completeOn: [], manualNext: true, optional: true },
    { id: 'tres', text: 'tres', target: 'x.tres', completeOn: [], manualNext: true },
    { id: 'cuatro', text: 'cuatro', target: 'x.cuatro', completeOn: [{ type: 'click', target: 'x.cuatro' }] },
    { id: 'guardar', text: 'guarda', target: 'x.save', completeOn: [{ type: 'event', name: 'x.saved' }], sensitive: true },
  ],
  finishText: 'fin',
}
const run = (actions: Parameters<typeof reduceTour>[2][], from: TourState = startState(tour)) => actions.reduce((s, a) => reduceTour(tour, s, a), from)
const sig = (signal: ObservedSignal) => ({ type: 'signal' as const, signal })

describe('reintento y «solo leyendo»', () => {
  it('«volver a mirar» saca del estado sin control sin perder el sitio', () => {
    const broken = run([sig({ type: 'click', target: 'x.uno' }), { type: 'skip' }, { type: 'next' }, { type: 'target-missing' }])
    expect(broken.status).toBe('broken')
    const again = run([{ type: 'retry' }], broken)
    expect(again.status).toBe('running')
    expect(again.index).toBe(broken.index)
  })

  it('solo leyendo: «Siguiente» avanza por todos los pasos (también los que esperan una acción), pero las señales no cuentan y el control que falta no rompe nada', () => {
    let s = run([{ type: 'read-only' }])
    expect(s.readOnly).toBe(true)
    expect(run([sig({ type: 'click', target: 'x.uno' })], s).index).toBe(0)
    expect(run([{ type: 'target-missing' }], s).status).toBe('running')
    for (let i = 0; i < tour.steps.length; i++) s = run([{ type: 'next' }], s)
    expect(s.status).toBe('completed')
  })

  it('solo leyendo desde «roto» vuelve a mostrarse el paso', () => {
    const broken = run([{ type: 'target-missing' }])
    expect(broken.status).toBe('broken')
    expect(run([{ type: 'read-only' }], broken).status).toBe('running')
  })
})

describe('navegación dentro del capítulo', () => {
  it('se puede volver al primer paso en cualquier momento', () => {
    const s = run([sig({ type: 'click', target: 'x.uno' }), { type: 'next' }, { type: 'next' }])
    expect(s.index).toBe(3)
    const first = run([{ type: 'back', to: 0 }], s)
    expect(first.index).toBe(0)
    expect(first.status).toBe('running')
    expect(first.skipped).toEqual([])
  })

  it('«Atrás» no salta a un paso omitido, salvo que su control ya esté en pantalla', () => {
    const s = run([sig({ type: 'click', target: 'x.uno' }), { type: 'skip' }, { type: 'next' }])
    expect(s.skipped).toEqual([1])
    expect(s.index).toBe(3) // tras omitir el 2.º y avanzar el 3.º
    expect(previousIndex(s)).toBe(2)
    const s2 = run([sig({ type: 'click', target: 'x.uno' }), { type: 'skip' }], startState(tour))
    expect(previousIndex(s2)).toBe(0)
    expect(previousIndex(s2, (i) => i === 1)).toBe(1) // el control llegó tarde: se puede recuperar
  })

  it('el contador cuenta solo los pasos que se muestran (los omitidos no cuentan, ni antes ni después)', () => {
    const s = run([sig({ type: 'click', target: 'x.uno' }), { type: 'skip' }])
    expect(s.index).toBe(2)
    expect(stepNumbers(tour, s)).toEqual({ k: 2, n: 4 })
    expect(stepNumbers(tour, startState(tour))).toEqual({ k: 1, n: 5 })
  })

  it('«Siguiente» tras «Atrás» en un paso con acción solo vale si no es sensible', () => {
    const back = { ...startState(tour), index: 3, skipped: [] } as TourState
    expect(run([{ type: 'next' }], back).index).toBe(3) // sin force no avanza
    expect(run([{ type: 'next', force: true }], back).index).toBe(4)
    const sensitive = { ...startState(tour), index: 4 } as TourState
    expect(run([{ type: 'next', force: true }], sensitive).index).toBe(4)
    expect(run([{ type: 'next', afterBack: true }], sensitive).status).toBe('completed')
  })
})

describe('adelantarse', () => {
  it('guardar antes de llegar al paso de guardar lo da por conseguido; los pasos de en medio se cuentan como omitidos', () => {
    const s = run([sig({ type: 'event', name: 'x.saved' })])
    expect(s.status).toBe('completed')
    expect(s.skipped).toEqual([0, 1, 2, 3])
  })

  it('un aviso que no es de un paso posterior no hace nada', () => {
    expect(run([sig({ type: 'event', name: 'otro' })]).index).toBe(0)
  })
})

describe('planPanel: dónde y cómo se pinta la tarjeta', () => {
  const base = { areaHeight: 700, fullHeight: 260, bottomOffset: 100, guard: [] as { top: number; bottom: number }[], current: 'bottom' as const }

  it('sin nada que proteger se queda abajo y completa', () => {
    expect(planPanel({ ...base, protect: [] })).toEqual({ side: 'bottom', mode: 'full', unsatisfiable: false })
  })

  it('si el control está abajo, la tarjeta sube; si está arriba, baja', () => {
    expect(planPanel({ ...base, protect: [{ top: 500, bottom: 560 }] }).side).toBe('top')
    expect(planPanel({ ...base, current: 'top', protect: [{ top: 30, bottom: 90 }] }).side).toBe('bottom')
  })

  it('nunca tapa lo protegido: si la completa no cabe, usa la compacta y después la píldora', () => {
    // Zona protegida en el centro: ni arriba ni abajo cabe una tarjeta completa de 260 px.
    const mid = planPanel({ ...base, areaHeight: 560, fullHeight: 300, protect: [{ top: 190, bottom: 370 }] })
    expect(mid.mode).not.toBe('full')
    const tight = planPanel({ ...base, areaHeight: 300, fullHeight: 300, bottomOffset: 8, protect: [{ top: 70, bottom: 240 }] })
    expect(tight.mode).toBe('pill')
  })

  it('respeta las hojas propias abiertas (guard) igual que lo protegido', () => {
    const p = planPanel({ ...base, protect: [], guard: [{ top: 380, bottom: 700 }] })
    expect(p.side).toBe('top')
  })

  it('lado elegido a mano: solo se prueba ese lado', () => {
    const p = planPanel({ ...base, protect: [{ top: 40, bottom: 120 }], manual: 'top' })
    expect(p.side).toBe('top')
    expect(p.mode).not.toBe('full')
  })

  it('cuando nada sirve, devuelve píldora marcada como no satisfecha', () => {
    const p = planPanel({ ...base, areaHeight: 200, fullHeight: 260, bottomOffset: 8, protect: [{ top: 0, bottom: 200 }] })
    expect(p.mode).toBe('pill')
    expect(p.unsatisfiable).toBe(true)
  })

  it('las alturas de modo son coherentes', () => {
    expect(PILL_HEIGHT).toBeLessThan(COMPACT_HEIGHT)
  })
})
