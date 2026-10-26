// Utilidades compartidas por los doce meses: geometría de la Carrera (colinas, flores y árboles del paisaje real),
// objetos que se apoyan en el borde del prado, la caja «base» de cada mes, la nieve y la ardilla (que sale todo el año).
import {
  TAU, at, clamp, edgeY, eventScheduler, fallSystem, lerp, rngFrom, smooth, unit,
} from './toolkit.js'
import * as N from './partsNature.js'

// ---------------------------------------------------------------------------------------------- tiempo y trayectos
export const cross = (env, u, dir, pad = 50) => (dir === 1 ? -pad + (env.W + pad * 2) * u : env.W + pad - (env.W + pad * 2) * u)
export const env01 = (u, a = 0.12, b = 0.12) => Math.min(1, u / a, (1 - u) / b)
export const stripY = (env) => env.H * 0.984 // «suelo» de la franja de césped bajo la pista (zona sin corredores)
export const onScreen = (env, x, pad = 60) => x > -pad && x < env.W + pad
export const wrapX = (env, x, pad = 100) => {
  const span = env.W + pad * 2
  return ((x % span) + span) % span - pad
}

// ---------------------------------------------------------------------------------------------- geometría del paisaje REAL
// Las mismas fórmulas que dibuja la Carrera (RaceTrack.scenery): las colinas del fondo y las flores del prado. Así la
// decoración se apoya exactamente donde está el paisaje, sin volver a dibujarlo.
export const hill1Y = (env, x) => env.H * 0.31 + 20 + Math.sin(x * 0.009 + 1) * 17 + Math.sin(x * 0.024) * 5
export const hill2Y = (env, x) => env.ground - 24 + Math.sin(x * 0.014 + 2) * 13
// Dónde ponen los pies las personitas del fondo: en la cresta/ladera alta de la colina cercana.
export const hillStandY = (env, x, k = 0.55) => {
  const r = hill2Y(env, x)
  // k se reparte entre la cresta (0) y el pie de la colina (1), pero solo hasta el 30%: más abajo quedarían escondidas
  // detrás de arbustos y montones de nieve. Valores negativos = por encima de la cresta (colina lejana).
  return r + (env.ground - r) * k * 0.3
}
export function sceneryFlowers(env) {
  const out = []
  for (let i = 0; i < 21; i++) {
    const x = ((((i * 71 + Math.sin(i * 8.17) * 31 - env.offset * 0.52) % (env.W + 120)) + (env.W + 120)) % (env.W + 120)) - 60
    out.push({ i, x, y: env.ground - 2 + Math.sin(i * 4.2) * 5, count: 1 + (i % 3) })
  }
  return out
}
export function eachTree(env, fn) {
  for (const a of env.anchors) {
    if (a.bush) continue
    const tall = (53 + ((a.i * 29) % 46)) * a.size
    fn({ x: a.x, y: a.y, s: a.size, tall, ty: a.y - tall, kind: a.i % 3, i: a.i })
  }
}
export function eachBush(env, fn) {
  for (const a of env.anchors) if (a.bush) fn({ x: a.x, y: a.y, s: a.size, rr: 13 + a.size * 10, i: a.i })
}

// ---------------------------------------------------------------------------------------------- objetos del prado
export function makeMeadow(rng, count, pick) {
  const items = []
  for (let i = 0; i < count; i++) items.push({ i, jx: rng.range(-18, 18), s: rng.range(0.82, 1.18), ph: rng.range(0, TAU), kind: pick ? pick(i, rng) : 0 })
  return items
}
// Objetos que se apoyan en el borde del prado y se mueven con la misma paralaje que las flores del paisaje.
//   size       tamaño relativo; sizeOf(it) lo afina por objeto (regalos de distinto tamaño…)
//   avoidTrunks los aparta (suavemente) de los troncos de los árboles para que no coincidan justo con ellos
export function drawMeadow(env, items, fn, t, factor = 0.52, size = 1.45, opts = {}) {
  const span = env.W + 280
  const u = unit(env)
  const narrow = env.W < 500 // en móvil se dibuja uno de cada dos: el prado es más corto y se amontonaría
  const trunks = opts.avoidTrunks ? env.anchors.filter((a) => !a.bush).map((a) => a.x) : null
  for (const it of items) {
    if (narrow && it.i % 2 === 1) continue
    let x = ((((it.i * span) / items.length + it.jx - env.offset * factor) % span) + span) % span - 140
    if (trunks) {
      for (const tx of trunks) {
        const d = x - tx
        const reach = opts.avoidReach ?? 17
        if (Math.abs(d) < reach) x += (d >= 0 ? 1 : -1) * (reach - Math.abs(d))
      }
    }
    if (x < -50 || x > env.W + 50) continue
    const k = opts.sizeOf ? opts.sizeOf(it) : 1
    at(x, edgeY(env, x) + 1, u * it.s * size * k, () => fn(it, t, x), 0, 1)
  }
}

// ---------------------------------------------------------------------------------------------- la caja de cada mes
// build(S, rng, env?) devuelve { update, back, front, hills, scenery, ground, fauna, reset }. Ganchos opcionales:
//   hills(ctx, env)    DETRÁS de los árboles, justo después de pintar las colinas (fondo lejano: niños, Reyes Magos, sol…)
//   scenery(ctx, env)  al terminar el paisaje (cubrir flores con nieve, velo de cielo gris o de noche…)
//   ground(ctx, env)   tras la pista y ANTES de los animales del paisaje (franja de césped de abajo)
//   fauna(ctx, env, type, f)  sustituir un animal del paisaje real (true = ya lo he dibujado yo)
export function base(seed, build, options = {}) {
  const rng = rngFrom(seed)
  const S = { t: 0, rng }
  const parts = build(S, rng, options)
  return {
    update(dt, env) {
      S.t += dt
      parts.update?.(dt, env, S)
    },
    back(ctx, env) {
      parts.back?.(ctx, env, S)
    },
    front(ctx, env) {
      parts.front?.(ctx, env, S)
    },
    hills(ctx, env) {
      env.ctx = ctx
      parts.hills?.(ctx, env, S)
    },
    scenery(ctx, env) {
      env.ctx = ctx
      parts.scenery?.(ctx, env, S)
    },
    ground(ctx, env) {
      env.ctx = ctx
      parts.ground?.(ctx, env, S)
    },
    fauna(ctx, env, type, f) {
      env.ctx = ctx
      return parts.fauna ? parts.fauna(ctx, env, type, f, S) : false
    },
    reset() {
      parts.reset?.()
    },
  }
}

// ---------------------------------------------------------------------------------------------- nieve que cae
export function snowFall(rng, count = 30) {
  return fallSystem(
    {
      count,
      speed: [22, 44],
      sway: 14,
      swaySpeed: 1.4,
      size: [0.6, 1.3],
      spin: 0.8,
      make: (p) => {
        p.kind = rng() < 0.2 ? 1 : 0
      },
      draw: (p, env, u) => {
        const ctx = env.ctx
        ctx.globalAlpha *= 0.92
        ctx.scale(u * 0.95, u * 0.95)
        if (p.kind === 1) N.snowCrystal('#fff')
        else N.snowflakeDot('#fff')
      },
    },
    rng,
  )
}

// ---------------------------------------------------------------------------------------------- la ardilla: todo el año
// Aparece de vez en cuando, cruza el borde del prado, se sienta a mordisquear una bellota y sigue su camino.
export function squirrelEvent(first = 6, gap = [26, 38]) {
  return {
    id: 'squirrel',
    first,
    gap,
    duration: 12,
    init: (E, env, r) => {
      E.stop = r.range(0.3, 0.7) * env.W
    },
    draw: (ctx, env, u, age, E) => {
      const dir = E.dir
      const startX = dir === 1 ? -30 : env.W + 30
      const endX = dir === 1 ? env.W + 30 : -30
      let x
      let mode = 'run'
      if (u < 0.34) x = lerp(startX, E.stop, smooth(u / 0.34) * 0.6 + (u / 0.34) * 0.4)
      else if (u < 0.66) {
        x = E.stop
        mode = 'sit'
      } else x = lerp(E.stop, endX, ((u - 0.66) / 0.34) ** 1.4)
      at(x, edgeY(env, x) + 3, unit(env) * 0.95, () => N.squirrel(age, mode), 0, dir)
    },
  }
}

// ---------------------------------------------------------------------------------------------- sustituir la mariposa del paisaje por un pajarillo
// La Carrera real saca, por turnos, un pájaro, un conejo y una mariposa. En los meses fríos la mariposa se cambia por un
// pajarillo (petirrojo / gorrión) que sigue EXACTAMENTE el mismo recorrido y los mismos tiempos que la mariposa.
export function swapButterflyForBird(kind = 'robin') {
  return (ctx, env, type, f) => {
    if (type !== 'butterfly') return false
    const { W } = env
    const x = f.dir === 1 ? -30 + (W + 60) * f.u : W + 30 - (W + 60) * f.u
    const y = f.g - 47 - 9 * Math.sin(f.u * Math.PI) + Math.sin(f.age * 5 + f.phase) * 10
    at(x, y, f.scale * 1.15, () => (kind === 'robin' ? N.robin(f.age * 1.1) : N.sparrow(f.age * 1.1)), 0, f.dir)
    return true
  }
}

export { TAU, clamp }
