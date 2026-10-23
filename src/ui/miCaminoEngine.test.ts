import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMiCaminoEngine, PLANET_FACTS, type MiCaminoEngineHooks } from '@/ui/miCaminoEngine'
import { miCaminoFigureSlots } from '@/domain/miCamino'

// El motor dibuja en un <canvas>; aquí se usa un lienzo de mentira que acepta cualquier llamada de
// dibujo (y las cuenta), para poder recorrer los tres mundos, las transiciones y el ciclo de vida sin
// navegador. Lo que se comprueba es el comportamiento (qué mundo se enseña, qué se dibuja, que se
// limpia todo al salir), no el aspecto — el aspecto es el del prototipo aprobado, sin tocar.
function fakeContext() {
  const calls: Record<string, number> = {}
  const store: Record<string, unknown> = {}
  const gradient = { addColorStop: () => {} }
  const ctx = new Proxy(store, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => gradient
      if (prop === 'measureText') return () => ({ width: 10 })
      return (...args: unknown[]) => {
        calls[prop] = (calls[prop] ?? 0) + 1
        void args
      }
    },
    set(target, prop: string, value) {
      target[prop] = value
      return true
    },
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

function fakeCanvas() {
  const { ctx, calls } = fakeContext()
  const listeners: Record<string, ((e: unknown) => void)[]> = {}
  const canvas = {
    width: 0,
    height: 0,
    style: { cursor: '' } as Record<string, string>,
    getContext: () => ctx,
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      ;(listeners[type] ??= []).push(fn)
    },
    removeEventListener: (type: string, fn: (e: unknown) => void) => {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn)
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 720, height: 470 }),
  }
  return { canvas: canvas as unknown as HTMLCanvasElement, raw: canvas, listeners, calls }
}

let rafQueue: Map<number, (ts: number) => void>
let rafId: number
let now: number

function runFrames(n: number) {
  for (let i = 0; i < n; i++) {
    now += 16.7
    const pending = [...rafQueue.entries()]
    rafQueue.clear()
    for (const [, cb] of pending) cb(now)
  }
}

beforeEach(() => {
  rafQueue = new Map()
  rafId = 0
  now = 1000
  vi.stubGlobal('window', { devicePixelRatio: 3 })
  vi.stubGlobal('requestAnimationFrame', (cb: (ts: number) => void) => {
    rafId += 1
    rafQueue.set(rafId, cb)
    return rafId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafQueue.delete(id)
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const kid = (id: string, points: number) => ({ id, name: id.toUpperCase(), letter: id.toUpperCase(), color: '#efc63b', points })

function make(hooks: Partial<MiCaminoEngineHooks> = {}, reduced = false) {
  const f = fakeCanvas()
  const worlds: number[] = []
  const engine = createMiCaminoEngine(f.canvas, { onWorldShown: (w) => worlds.push(w), figureSlots: miCaminoFigureSlots, ...hooks }, reduced)
  return { ...f, engine, worlds }
}

describe('Mi Camino (motor) — mundos y transiciones con puntos reales', () => {
  it('empieza directamente en el mundo que corresponde a los puntos, sin recorrer el camino desde cero', () => {
    const { engine, worlds } = make()
    engine.setKids([kid('a', 320)], 'a')
    expect(worlds).toEqual([2])
    engine.destroy()
  })

  it('recorre los umbrales 149→150, 299→300 y 449→450 sin errores y avisa del mundo en cada cruce', () => {
    const errors: unknown[] = []
    const { engine, worlds } = make({ onError: (e) => errors.push(e) })
    engine.setKids([kid('a', 149)], 'a')
    engine.start()
    runFrames(60)
    expect(worlds.at(-1)).toBe(0)
    engine.setKids([kid('a', 150)], 'a')
    runFrames(200)
    expect(worlds.at(-1)).toBe(1)
    engine.setKids([kid('a', 299)], 'a')
    runFrames(30)
    engine.setKids([kid('a', 300)], 'a')
    runFrames(200)
    expect(worlds.at(-1)).toBe(2)
    engine.setKids([kid('a', 449)], 'a')
    runFrames(30)
    engine.setKids([kid('a', 450)], 'a')
    runFrames(200)
    expect(worlds.at(-1)).toBe(0) // vuelve a Golosinas (vuelta 2), sin perder los puntos
    expect(errors).toEqual([])
    engine.destroy()
  })

  it('recorre también 599→600, 749→750 y 899→900 (segunda vuelta)', () => {
    const errors: unknown[] = []
    const { engine, worlds } = make({ onError: (e) => errors.push(e) })
    engine.setKids([kid('a', 599)], 'a')
    engine.start()
    runFrames(30)
    engine.setKids([kid('a', 600)], 'a')
    runFrames(200)
    expect(worlds.at(-1)).toBe(1)
    engine.setKids([kid('a', 750)], 'a')
    runFrames(200)
    expect(worlds.at(-1)).toBe(2)
    engine.setKids([kid('a', 900)], 'a')
    runFrames(200)
    expect(worlds.at(-1)).toBe(0)
    expect(errors).toEqual([])
    engine.destroy()
  })

  it('cada niño puede estar en un mundo distinto: al elegir a otro se cambia a su escena', () => {
    const { engine, worlds } = make()
    engine.setKids([kid('a', 20), kid('b', 320)], 'a')
    engine.start()
    runFrames(30)
    expect(worlds.at(-1)).toBe(0)
    engine.select('b')
    runFrames(200)
    expect(worlds.at(-1)).toBe(2)
    engine.select('a')
    runFrames(200)
    expect(worlds.at(-1)).toBe(0)
    engine.destroy()
  })

  it('niños de la misma clase de mundo pero de vueltas distintas: el seleccionado se ve, el otro no se pide a dibujar', () => {
    const slotsSeen: number[][] = []
    const { engine } = make({
      figureSlots: (positions) => {
        slotsSeen.push([...positions])
        return miCaminoFigureSlots(positions)
      },
    })
    engine.setKids([kid('a', 20), kid('b', 470)], 'a') // ambos Golosinas, vuelta 1 y vuelta 2
    engine.start()
    runFrames(10)
    // Solo un niño en escena (el seleccionado): nunca se reparte un hueco para el de otra vuelta.
    expect(slotsSeen.at(-1)).toHaveLength(1)
    engine.destroy()
  })

  it('dos niños de la misma vuelta y mundo sí se dibujan juntos', () => {
    const slotsSeen: number[][] = []
    const { engine } = make({
      figureSlots: (positions) => {
        slotsSeen.push([...positions])
        return miCaminoFigureSlots(positions)
      },
    })
    engine.setKids([kid('a', 20), kid('b', 90)], 'a')
    engine.start()
    runFrames(10)
    expect(slotsSeen.at(-1)).toHaveLength(2)
    engine.destroy()
  })

  it('los puntos que bajan (un adulto resta puntos) tampoco rompen el dibujo', () => {
    const errors: unknown[] = []
    const { engine } = make({ onError: (e) => errors.push(e) })
    engine.setKids([kid('a', 460)], 'a')
    engine.start()
    runFrames(20)
    engine.setKids([kid('a', 100)], 'a')
    runFrames(300)
    expect(errors).toEqual([])
    engine.destroy()
  })

  it('un solo niño, ninguno y cuatro: sin errores', () => {
    const errors: unknown[] = []
    const { engine } = make({ onError: (e) => errors.push(e) })
    engine.setKids([], null)
    engine.start()
    runFrames(10)
    engine.setKids([kid('a', 5), kid('b', 5), kid('c', 6), kid('d', 5)], 'c')
    runFrames(60)
    expect(errors).toEqual([])
    engine.destroy()
  })
})

describe('Mi Camino (motor) — rendimiento y limpieza', () => {
  it('canvas con devicePixelRatio (limitado a 2) para no gastar memoria de más en móvil', () => {
    const { raw, engine } = make()
    expect(raw.width).toBe(720 * 2)
    expect(raw.height).toBe(470 * 2)
    engine.destroy()
  })

  it('en pantallas de 120 Hz avanza a ~60 pasos por segundo (salta un fotograma de cada dos)', () => {
    const { engine, calls } = make()
    engine.setKids([kid('a', 20)], 'a')
    engine.start()
    const before = calls.setTransform ?? 0 // una vez por pasada de dibujo
    // 60 avisos del navegador separados 8,3 ms = 0,5 s → unas 30 pasadas de dibujo, no 60.
    for (let i = 0; i < 60; i++) {
      now += 8.3
      const pending = [...rafQueue.entries()]
      rafQueue.clear()
      for (const [, cb] of pending) cb(now)
    }
    const passes = (calls.setTransform ?? 0) - before
    expect(passes).toBeGreaterThanOrEqual(28)
    expect(passes).toBeLessThanOrEqual(32)
    engine.destroy()
  })

  it('stop() detiene el bucle y start() lo reanuda (pausa cuando no se ve)', () => {
    const { engine } = make()
    engine.setKids([kid('a', 20)], 'a')
    engine.start()
    expect(rafQueue.size).toBe(1)
    engine.stop()
    expect(rafQueue.size).toBe(0)
    runFrames(5)
    expect(rafQueue.size).toBe(0)
    engine.start()
    expect(rafQueue.size).toBe(1)
    engine.destroy()
  })

  it('start() repetido no apila bucles', () => {
    const { engine } = make()
    engine.setKids([kid('a', 20)], 'a')
    engine.start()
    engine.start()
    engine.start()
    expect(rafQueue.size).toBe(1)
    engine.destroy()
  })

  it('destroy() cancela el bucle y quita el listener del lienzo', () => {
    const { engine, listeners } = make()
    engine.setKids([kid('a', 20)], 'a')
    engine.start()
    expect(listeners.click).toHaveLength(1)
    engine.destroy()
    expect(listeners.click).toHaveLength(0)
    expect(rafQueue.size).toBe(0)
    runFrames(5)
    expect(rafQueue.size).toBe(0)
    // Y ya no se puede reanudar un motor destruido.
    engine.start()
    expect(rafQueue.size).toBe(0)
  })

  it('movimiento reducido: ningún bucle, un único fotograma estático que se actualiza al cambiar los datos', () => {
    const { engine, worlds, calls } = make({}, true)
    engine.setKids([kid('a', 20)], 'a')
    engine.start()
    expect(rafQueue.size).toBe(0)
    const drawn = calls.fillRect ?? 0
    expect(drawn).toBeGreaterThan(0)
    engine.setKids([kid('a', 320)], 'a')
    expect(worlds.at(-1)).toBe(2)
    expect(rafQueue.size).toBe(0)
    engine.destroy()
  })

  it('si el dibujo lanza un error, el bucle se detiene (no se repite el fallo 60 veces por segundo)', () => {
    const errors: unknown[] = []
    const { engine } = make({
      onError: (e) => errors.push(e),
      figureSlots: () => {
        throw new Error('fallo de prueba')
      },
    })
    engine.setKids([kid('a', 20)], 'a')
    engine.start()
    runFrames(5)
    expect(errors).toHaveLength(1)
    expect(rafQueue.size).toBe(0)
    engine.destroy()
  })
})

describe('Mi Camino (motor) — planetas pulsables', () => {
  it('pulsar el Sol del mundo espacial avisa con su nombre; fuera de ese mundo no hace nada', () => {
    const picked: string[] = []
    const { engine, listeners } = make({ onPlanet: (n) => picked.push(n) })
    engine.setKids([kid('a', 20)], 'a')
    engine.start()
    runFrames(5)
    // En Golosinas pulsar donde estaría el Sol no hace nada.
    listeners.click[0]({ clientX: 82, clientY: 72 })
    expect(picked).toEqual([])
    engine.setKids([kid('a', 320)], 'a')
    runFrames(300)
    listeners.click[0]({ clientX: 82, clientY: 72 })
    expect(picked).toEqual(['Sol'])
    engine.destroy()
  })

  it('hay una ficha educativa para cada planeta y para el Sol', () => {
    for (const name of ['Mercurio', 'Venus', 'Tierra', 'Marte', 'Júpiter', 'Saturno', 'Urano', 'Neptuno', 'Sol']) {
      expect(PLANET_FACTS[name]?.length, name).toBeGreaterThanOrEqual(3)
    }
  })
})
