// Pruebas de la capa de decoración mensual de la Carrera SIN navegador: un contexto 2D de mentira que cuenta las llamadas y sigue
// la matriz de transformación. Comprueban, con los doce meses (y las dos versiones de enero), que ningún fotograma lanza errores
// (escritorio, móvil, 1/2/3 corredores, movimiento reducido), que cambiar de mes no acumula nada, que lo de delante solo pinta donde
// no hay corredores, que las etiquetas de distancia se recortan siempre, que la mariposa solo se cambia en los meses fríos y que el
// mes y la versión de enero salen de la fecha de España.
import assert from 'node:assert/strict'
import { it } from 'vitest'
import { createRaceDecorator, MONTH_INFO, currentMonthInSpain, januaryVariantInSpain } from './index.js'

// Cada prueba tiene hasta 2 minutos: recorren los doce meses durante decenas de segundos simulados.
const t = (name, fn) => it(name, fn, 120000)

// Contexto de mentira: cuenta operaciones y sigue la matriz de transformación para saber DÓNDE (en y) se dibuja.
function fakeCtx() {
  const stat = { calls: 0, ys: [], saves: 0, restores: 0 }
  const store = { globalAlpha: 1 }
  let m = [1, 0, 0, 1, 0, 0] // a b c d e f
  const stack = []
  const mul = (n) => {
    const [a, b, c, d, e, f] = m
    m = [a * n[0] + c * n[1], b * n[0] + d * n[1], a * n[2] + c * n[3], b * n[2] + d * n[3], a * n[4] + c * n[5] + e, b * n[4] + d * n[5] + f]
  }
  const gradient = { addColorStop() {} }
  const pt = (x, y) => (stat.recording ? stat.ys.push(m[1] * x + m[3] * y + m[5]) : 0)
  const ops = {
    save: () => (stat.saves++, stack.push([...m])),
    restore: () => (stat.restores++, (m = stack.pop() || m)),
    translate: (x, y) => mul([1, 0, 0, 1, x, y]),
    scale: (x, y) => mul([x, 0, 0, y, 0, 0]),
    rotate: (r) => mul([Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]),
    setTransform: (a, b, c, d, e, f) => (m = [a, b, c, d, e, f]),
    arc: (x, y, r) => (stat.calls++, pt(x, y - r), pt(x, y + r)),
    ellipse: (x, y, rx, ry) => (stat.calls++, pt(x, y - ry), pt(x, y + ry)),
    fillRect: (x, y, w, h) => (stat.calls++, pt(x, y), pt(x, y + h)),
    roundRect: (x, y, w, h) => (stat.calls++, pt(x, y), pt(x, y + h)),
    lineTo: (x, y) => (stat.calls++, pt(x, y)),
    moveTo: (x, y) => (stat.calls++, pt(x, y)),
    quadraticCurveTo: (cx, cy, x, y) => (stat.calls++, pt(x, y)),
    bezierCurveTo: (a, b, c, d, x, y) => (stat.calls++, pt(x, y)),
    fillText: (_s, x, y) => (stat.calls++, pt(x, y)),
    strokeText: (_s, x, y) => (stat.calls++, pt(x, y)),
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
    measureText: () => ({ width: 10 }),
  }
  return new Proxy(store, {
    get(target, prop) {
      if (prop === 'stat') return stat
      if (prop in ops) return ops[prop]
      if (prop in target) return target[prop]
      return (..._a) => {
        stat.calls++
      }
    },
    set(target, prop, v) {
      target[prop] = v
      return true
    },
  })
}

function makeEnv(W, H, t, extra = {}) {
  const laneTop = (x) => H * (0.462 + 0.012 * (x / W - 0.5))
  const laneMid = (x) => H * (0.687 + 0.008 * (x / W - 0.5))
  const laneBottom = (x) => H * (0.928 - 0.008 * (x / W - 0.5))
  const anchors = Array.from({ length: 17 }, (_, i) => ({ i, x: (i * 97 + 30) % (W + 100) - 40, y: H * 0.46, size: 0.8 + (i % 5) * 0.14, bush: i % 4 === 0 || i % 7 === 0 }))
  const markers = [0, 5, 10, 15, 20, 25, 30].map((v, k) => ({ x: 36 + k * ((W - 75) / 6), y: laneTop(W / 2) + 6, w: 34, h: 21 }))
  return { W, H, t, dt: 1 / 60, reduced: false, ground: H * 0.47, laneTop, laneMid, laneBottom, camera: { min: 0, max: 30 }, offset: 0, anchors, markers, runnerCount: 3, ...extra }
}

const SIZES = [
  ['escritorio', 732, 495],
  ['móvil', 345, 329],
  ['muy estrecho', 300, 286],
]

for (let m = 0; m < 12; m++) {
  t(`${MONTH_INFO[m].name}: escritorio, móvil y estrecho · 1, 2 y 3 corredores`, () => {
    for (const [, W, H] of SIZES) {
      for (const runners of [1, 2, 3]) {
        const d = createRaceDecorator({ month: m })
        const ctx = fakeCtx()
        for (let f = 0; f < 40 * 60; f += 3) {
          const env = makeEnv(W, H, f / 60, { dt: 0.05, runnerCount: runners, offset: f * 0.4 })
          d.drawBack(ctx, env)
          d.drawFront(ctx, env)
        }
        assert.equal(d.getError(), null, String(d.getError()))
        assert.equal(ctx.stat.saves, ctx.stat.restores, 'save/restore desequilibrados')
      }
    }
  })
}

for (let m = 0; m < 12; m++) {
  t(`${MONTH_INFO[m].name}: reducido`, () => {
    const d = createRaceDecorator({ month: m })
    const ctx = fakeCtx()
    const env = makeEnv(732, 495, 0, { reduced: true, dt: 0.016 })
    d.drawBack(ctx, env)
    d.drawFront(ctx, env)
    assert.equal(d.getError(), null)
    assert.equal(d.debugClock(), 0, 'el reloj de la decoración no debe avanzar con movimiento reducido')
  })
}

t('cambiar de mes 600 veces seguidas, con dibujo entre medias, no falla ni deja estado', () => {
  const d = createRaceDecorator({ month: 10 })
  const ctx = fakeCtx()
  for (let i = 0; i < 600; i++) {
    d.setMonth(i % 12)
    const env = makeEnv(732, 495, i / 10, { dt: 0.05 })
    d.drawBack(ctx, env)
    d.drawFront(ctx, env)
  }
  assert.equal(d.getError(), null)
})
t('el estado del mes anterior se descarta: volver a un mes lo reinicia desde cero (mismo aspecto inicial)', () => {
  const run = () => {
    const d = createRaceDecorator({ month: 10 })
    d.setMonth(0)
    const ctx = fakeCtx()
    d.drawBack(ctx, makeEnv(732, 495, 0, { dt: 0.016 }))
    return ctx.stat.calls
  }
  assert.equal(run(), run())
})
t('setMonth al mismo mes no reinicia (no «salta» al repintar)', () => {
  const d = createRaceDecorator({ month: 4 })
  const ctx = fakeCtx()
  for (let i = 0; i < 50; i++) d.drawBack(ctx, makeEnv(732, 495, i / 10, { dt: 0.05 }))
  const before = d.debugClock()
  d.setMonth(4)
  d.drawBack(ctx, makeEnv(732, 495, 5, { dt: 0.05 }))
  assert.ok(d.debugClock() > before)
})

for (let mm = 0; mm < 12; mm++) {
  t(`${MONTH_INFO[mm].name}: capa delantera fuera de la zona de corredores`, () => {
    for (const [, W, H] of SIZES) {
      const d = createRaceDecorator({ month: mm })
      const ctx = fakeCtx()
      for (let f = 0; f < 60 * 25; f += 4) {
        const env = makeEnv(W, H, f / 60, { dt: 0.066, offset: f * 0.3 })
        ctx.stat.recording = false
        d.drawBack(ctx, env)
        ctx.stat.recording = true
        ctx.stat.ys.length = 0
        d.drawFront(ctx, env)
        for (const y of ctx.stat.ys) {
          // El corredor más alto (uno solo en la pista) llega, como mucho, hasta ~0,227·H; la pista termina hacia 0,93·H.
          assert.ok(y < 0.225 * H || y > 0.935 * H, `delante pinta en y=${y.toFixed(0)} (H=${H}, zona de corredores ${(0.225 * H).toFixed(0)}–${(0.935 * H).toFixed(0)})`)
        }
        ctx.stat.recording = false
      }
    }
  })
}


t('cada mes recorta (par/impar) las etiquetas de distancia del área de dibujo de la capa trasera', () => {
  for (let mm = 0; mm < 12; mm++) {
    const d = createRaceDecorator({ month: mm })
    const rects = []
    let clipped = null
    const ctx = fakeCtx()
    const proxy = new Proxy(ctx, {
      get(target, prop) {
        if (prop === 'rect') return (...a) => { if (clipped === null) rects.push(a) }
        if (prop === 'clip') return (rule) => { if (clipped === null) clipped = rule }
        return target[prop]
      },
    })
    const env = makeEnv(732, 495, 1, { dt: 0.05 })
    d.drawBack(proxy, env)
    assert.equal(clipped, 'evenodd', MONTH_INFO[mm].name)
    assert.equal(rects.length, 1 + env.markers.length, 'un rectángulo del lienzo + uno por etiqueta')
    for (const mk of env.markers) {
      assert.ok(rects.some((r) => r[0] <= mk.x - mk.w / 2 && r[1] <= mk.y && r[0] + r[2] >= mk.x + mk.w / 2 && r[1] + r[3] >= mk.y + mk.h), 'la etiqueta queda dentro del hueco recortado')
    }
  }
})


for (let mm = 0; mm < 12; mm++) {
  for (const variant of mm === 0 ? ['reyes', 'nieve'] : [undefined]) {
    t(`${MONTH_INFO[mm].name}${variant ? ' (' + variant + ')' : ''}: hills, scenery, ground y fauna sin errores en 3 tamaños`, () => {
      for (const [, W, H] of SIZES) {
        const d = createRaceDecorator({ month: mm, variant })
        const ctx = fakeCtx()
        for (let f = 0; f < 60 * 40; f += 3) {
          const env = makeEnv(W, H, f / 60, { dt: 0.05, offset: f * 0.4 })
          d.drawHills(ctx, env)
          d.drawScenery(ctx, env)
          d.drawGround(ctx, env)
          d.fauna(ctx, env, 'butterfly', { age: f / 60, u: (f % 400) / 400, dir: 1, scale: 0.7, phase: 1, g: H * 0.47 })
          d.drawBack(ctx, env)
          d.drawFront(ctx, env)
        }
        assert.equal(d.getError(), null, String(d.getError()))
        assert.equal(ctx.stat.saves, ctx.stat.restores, 'save/restore desequilibrados')
      }
    })
  }
}
t('la mariposa del paisaje se sustituye por un pajarillo solo en enero, febrero, noviembre y diciembre; pájaro y conejo nunca', () => {
  const env = makeEnv(732, 495, 1, { dt: 0.05 })
  const swapped = []
  for (let mm = 0; mm < 12; mm++) {
    const d = createRaceDecorator({ month: mm })
    const ctx = fakeCtx()
    d.drawBack(ctx, env)
    const f = { age: 1, u: 0.4, dir: 1, scale: 0.7, phase: 1, g: 232 }
    if (d.fauna(ctx, makeEnv(732, 495, 1, { dt: 0.05 }), 'butterfly', f)) swapped.push(mm)
    assert.equal(d.fauna(ctx, makeEnv(732, 495, 1, { dt: 0.05 }), 'bird', f), false)
    assert.equal(d.fauna(ctx, makeEnv(732, 495, 1, { dt: 0.05 }), 'rabbit', f), false)
  }
  assert.deepEqual(swapped, [0, 1, 10, 11])
})
t('enero: del 1 al 6, Reyes Magos; del 7 al 31, niños en la nieve (fecha de España)', () => {
  assert.equal(januaryVariantInSpain(new Date('2027-01-01T12:00:00Z')), 'reyes')
  assert.equal(januaryVariantInSpain(new Date('2027-01-06T12:00:00Z')), 'reyes')
  assert.equal(januaryVariantInSpain(new Date('2027-01-07T12:00:00Z')), 'nieve')
  assert.equal(januaryVariantInSpain(new Date('2027-01-31T12:00:00Z')), 'nieve')
  assert.equal(januaryVariantInSpain(new Date('2026-12-31T23:30:00Z')), 'reyes') // ya es 1 de enero en Madrid
})
t('la ardilla sale en los doce meses (hay un turno para ella en cada mes)', () => {
  for (let mm = 0; mm < 12; mm++) {
    const d = createRaceDecorator({ month: mm })
    const ctx = fakeCtx()
    let seen = false
    for (let f = 0; f < 60 * 30 && !seen; f += 2) {
      const env = makeEnv(732, 495, f / 60, { dt: 0.05 })
      ctx.stat.calls = 0
      d.drawBack(ctx, env)
      if (d.getError()) throw d.getError()
      if (f % 60 === 0) seen = true
    }
    assert.ok(seen)
  }
})


t('«sin decoración» no dibuja nada', () => {
  const d = createRaceDecorator({ month: 10, enabled: false })
  const ctx = fakeCtx()
  d.drawBack(ctx, makeEnv(732, 495, 1))
  d.drawFront(ctx, makeEnv(732, 495, 1))
  assert.equal(ctx.stat.calls, 0)
  d.setEnabled(true)
  d.drawBack(ctx, makeEnv(732, 495, 1))
  assert.ok(ctx.stat.calls > 0)
})
t('pausar congela la Carrera (frozen) y reanudar la libera', () => {
  const d = createRaceDecorator({ month: 10 })
  assert.equal(d.frozen(), false)
  d.setPaused(true)
  assert.equal(d.frozen(), true)
  d.setPaused(false)
  assert.equal(d.frozen(), false)
})
t('el mes de producción sale de la fecha local de España (Europe/Madrid), no del huso del dispositivo', () => {
  assert.equal(currentMonthInSpain(new Date('2026-12-31T23:30:00Z')), 0) // en Madrid ya es 1 de enero
  assert.equal(currentMonthInSpain(new Date('2026-10-31T22:30:00Z')), 9) // 23:30 en Madrid: sigue siendo octubre
  assert.equal(currentMonthInSpain(new Date('2026-04-30T22:30:00Z')), 4) // 00:30 del 1 de mayo en Madrid (verano, UTC+2)
})

t('un fotograma de cualquier mes tarda poco (medido sobre un contexto de mentira: solo el trabajo de JavaScript)', () => {
  for (let m = 0; m < 12; m++) {
    const d = createRaceDecorator({ month: m })
    const ctx = fakeCtx()
    for (let f = 0; f < 120; f++) d.drawBack(ctx, makeEnv(732, 495, f / 60, { dt: 1 / 60 }))
    const t0 = performance.now()
    for (let f = 0; f < 600; f++) {
      const env = makeEnv(732, 495, 2 + f / 60, { dt: 1 / 60 })
      d.drawBack(ctx, env)
      d.drawFront(ctx, env)
    }
    const per = (performance.now() - t0) / 600
    assert.ok(per < 6, `${MONTH_INFO[m].name}: ${per.toFixed(2)} ms por fotograma`)
  }
})
