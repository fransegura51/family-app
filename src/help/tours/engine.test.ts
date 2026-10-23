// Motor de los tutoriales «Enséñame»: reglas de avance, pausa, retroceso, reinicio y salida; seguridad de los pasos sensibles; control que falta. Código puro, sin pantalla.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { canGoNext, reduceTour, signalMatches, startState, stepAdvancesOn } from '@/help/tours/engine'
import type { ObservedSignal, TourDef, TourState } from '@/help/tours/types'

const tour: TourDef = {
  id: 't',
  version: 1,
  title: 'T',
  cardId: 'c',
  durationSec: 10,
  startPath: '/x',
  steps: [
    { id: 'abrir', text: 'abre', target: 'a.open', completeOn: [{ type: 'click', target: 'a.open' }, { type: 'appear', target: 'a.field' }] },
    { id: 'escribe', text: 'escribe', target: 'a.field', completeOn: [{ type: 'filled', target: 'a.field', min: 3 }] },
    { id: 'info', text: 'mira', target: 'a.field', completeOn: [], manualNext: true },
    { id: 'opcional', text: 'opcional', target: 'a.extra', completeOn: [], manualNext: true, optional: true },
    { id: 'guardar', text: 'guarda', target: 'a.save', completeOn: [{ type: 'event', name: 'a.saved' }], sensitive: true },
  ],
  finishText: 'fin',
}
const run = (actions: Parameters<typeof reduceTour>[2][], from: TourState = startState(tour)) => actions.reduce((s, a) => reduceTour(tour, s, a), from)
const sig = (signal: ObservedSignal) => ({ type: 'signal' as const, signal })

describe('señales', () => {
  it('cada tipo de señal solo coincide con lo suyo', () => {
    expect(signalMatches({ type: 'click', target: 'a' }, { type: 'click', target: 'a' })).toBe(true)
    expect(signalMatches({ type: 'click', target: 'a' }, { type: 'click', target: 'b' })).toBe(false)
    expect(signalMatches({ type: 'click', target: 'a' }, { type: 'change', target: 'a' })).toBe(false)
    expect(signalMatches({ type: 'filled', target: 'a', min: 3 }, { type: 'filled', target: 'a', length: 2 })).toBe(false)
    expect(signalMatches({ type: 'filled', target: 'a', min: 3 }, { type: 'filled', target: 'a', length: 3 })).toBe(true)
    expect(signalMatches({ type: 'filled', target: 'a' }, { type: 'filled', target: 'a', length: 1 })).toBe(true)
    expect(signalMatches({ type: 'event', name: 'x' }, { type: 'event', name: 'x' })).toBe(true)
    expect(signalMatches({ type: 'route', path: '/a' }, { type: 'route', path: '/b' })).toBe(false)
  })
})

describe('avance', () => {
  it('avanza cuando se cumple CUALQUIERA de las señales del paso, y no con señales de otro control', () => {
    expect(run([sig({ type: 'click', target: 'otro' })]).index).toBe(0)
    expect(run([sig({ type: 'click', target: 'a.open' })]).index).toBe(1)
    expect(run([sig({ type: 'appear', target: 'a.field' })]).index).toBe(1) // abrió el formulario por otro camino
  })
  it('el campo exige el mínimo de caracteres', () => {
    const s1 = run([sig({ type: 'click', target: 'a.open' }), sig({ type: 'filled', target: 'a.field', length: 2 })])
    expect(s1.index).toBe(1)
    expect(run([sig({ type: 'click', target: 'a.open' }), sig({ type: 'filled', target: 'a.field', length: 3 })]).index).toBe(2)
  })
  it('un paso informativo solo avanza con «Siguiente»', () => {
    const s = run([sig({ type: 'click', target: 'a.open' }), sig({ type: 'filled', target: 'a.field', length: 5 })])
    expect(s.index).toBe(2)
    expect(run([sig({ type: 'click', target: 'a.field' })], s).index).toBe(2)
    expect(run([{ type: 'next' }], s).index).toBe(3)
  })
  it('al completar el último paso el tutorial queda completado', () => {
    const s = run([{ type: 'skip' }, { type: 'skip' }, { type: 'skip' }, { type: 'skip' }, sig({ type: 'event', name: 'a.saved' })])
    expect(s.status).toBe('completed')
    expect(s.index).toBe(tour.steps.length)
  })
})

describe('seguridad: pasos sensibles (guardar, borrar, enviar…)', () => {
  const atSave: TourState = { ...startState(tour), index: 4 }
  it('un clic en «Guardar» NUNCA completa el paso (un clic no garantiza que se haya guardado)', () => {
    expect(stepAdvancesOn(tour.steps[4], { type: 'click', target: 'a.save' })).toBe(false)
    expect(run([sig({ type: 'click', target: 'a.save' })], atSave).index).toBe(4)
    expect(run([sig({ type: 'click', target: 'a.save' })], atSave).status).toBe('running')
  })
  it('solo avanza cuando la aplicación confirma el guardado', () => {
    expect(run([sig({ type: 'event', name: 'otro.evento' })], atSave).status).toBe('running')
    expect(run([sig({ type: 'event', name: 'a.saved' })], atSave).status).toBe('completed')
  })
  it('no ofrece «Siguiente» ni se puede saltar con la acción «next»', () => {
    expect(canGoNext(tour.steps[4])).toBe(false)
    expect(run([{ type: 'next' }], atSave).index).toBe(4)
  })
  it('incluso un paso sensible que (por error) incluyera un clic en sus señales lo ignora el motor', () => {
    const bad: TourDef = { ...tour, steps: [{ id: 'x', text: 'x', target: 'a.save', completeOn: [{ type: 'click', target: 'a.save' }], sensitive: true }] }
    const s = reduceTour(bad, startState(bad), sig({ type: 'click', target: 'a.save' }))
    expect(s.status).toBe('running')
  })
})

describe('retroceder, pausar, continuar, reiniciar y salir', () => {
  it('atrás vuelve un paso (nunca por debajo de 0) y no deshace nada de la persona', () => {
    const s = run([sig({ type: 'click', target: 'a.open' }), { type: 'back' }, { type: 'back' }])
    expect(s.index).toBe(0)
    expect(s.status).toBe('running')
  })
  it('pausa: ignora señales hasta continuar; continuar retoma en el mismo paso', () => {
    let s = run([{ type: 'pause' }])
    expect(s.status).toBe('paused')
    s = run([sig({ type: 'click', target: 'a.open' })], s)
    expect(s.index).toBe(0)
    s = run([{ type: 'resume' }], s)
    expect(s.status).toBe('running')
    expect(s.index).toBe(0)
  })
  it('reiniciar vuelve al primer paso desde cualquier estado, incluso completado', () => {
    const done = run([{ type: 'skip' }, { type: 'skip' }, { type: 'skip' }, { type: 'skip' }, sig({ type: 'event', name: 'a.saved' })])
    expect(run([{ type: 'restart' }], done)).toEqual(startState(tour))
    expect(run([{ type: 'restart' }], run([{ type: 'exit' }]))).toEqual(startState(tour))
  })
  it('salir cierra el tutorial y nada más lo reabre (solo reiniciar)', () => {
    const s = run([{ type: 'exit' }, sig({ type: 'click', target: 'a.open' }), { type: 'next' }, { type: 'resume' }])
    expect(s.status).toBe('exited')
    expect(s.index).toBe(0)
  })
})

describe('pantalla distinta y control que falta: nunca bloquea', () => {
  it('si la persona sale de la pantalla se pausa y al volver se reanuda en el mismo paso', () => {
    let s = run([sig({ type: 'click', target: 'a.open' }), { type: 'off-route' }])
    expect(s).toMatchObject({ status: 'paused', reason: 'off-route', index: 1 })
    s = run([{ type: 'on-route' }], s)
    expect(s).toMatchObject({ status: 'running', index: 1 })
  })
  it('una pausa manual no se reanuda sola al volver a la pantalla', () => {
    const s = run([{ type: 'pause' }, { type: 'on-route' }])
    expect(s.status).toBe('paused')
  })
  it('un control NECESARIO que no existe deja el tutorial «roto» (con salida comprensible), no bloqueado: reiniciar, salir o recuperarse si el control aparece', () => {
    let s = run([{ type: 'target-missing' }])
    expect(s).toMatchObject({ status: 'broken', reason: 'target-missing', index: 0 })
    expect(run([{ type: 'exit' }], s).status).toBe('exited')
    expect(run([{ type: 'restart' }], s).status).toBe('running')
    s = run([{ type: 'target-found' }], s)
    expect(s.status).toBe('running')
  })
  it('un paso OPCIONAL cuyo control no existe se omite solo (otra cuenta, otra plataforma) y queda constancia', () => {
    const atOpt: TourState = { ...startState(tour), index: 3 }
    const s = run([{ type: 'target-missing' }], atOpt)
    expect(s.index).toBe(4)
    expect(s.skipped).toEqual([3])
    expect(s.status).toBe('running')
  })
})

describe('el motor no ejecuta nada', () => {
  it('no hay ninguna acción de pulsar, escribir ni enviar: el tipo de acciones solo describe lo que se OBSERVA', () => {
    const src = readFileSync('src/help/tours/engine.ts', 'utf8')
    expect(src).not.toMatch(/\.click\(|dispatchEvent|\.value\s*=|submit\(|fetch\(|supabase/)
  })
})
