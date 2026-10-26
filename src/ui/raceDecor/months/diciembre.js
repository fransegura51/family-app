// DICIEMBRE — Navidad: paisaje nevado (colinas blancas con muñecos de nieve a lo lejos), nieve cayendo, árboles con nieve
// también en las ramas, flores de Pascua en lugar de las flores, luces parpadeantes, árboles decorados, regalos de
// distintos tamaños (también abajo), Rudolph de pie entre los arbustos y, de vez en cuando, el trineo de Papá Noel con
// los renos DELANTE.
import { TAU, at, eventScheduler, glint, line, unit } from '../toolkit.js'
import { base, drawMeadow, eachBush, hillStandY, makeMeadow, onScreen, sceneryFlowers, snowFall, squirrelEvent, stripY, swapButterflyForBird } from '../common.js'
import { edgeY, lerp } from '../toolkit.js'
import * as F from '../partsFestive.js'
import * as N from '../partsNature.js'
import { snowGround, snowHills, snowOverFlowers, treeSnow } from '../snow.js'
import { cross } from '../common.js'

export function diciembre(seed) {
  return base(seed, (S, rng) => {
    const snow = snowFall(rng, 30)
    const trees = makeMeadow(rng, 4, (i) => i)
    // regalos: tamaños muy distintos y separaciones irregulares
    const gifts = makeMeadow(rng, 9, (i) => i)
    for (const g of gifts) {
      g.jx = rng.range(-70, 70)
      g.s = rng.range(0.5, 1.55)
    }
    const patches = makeMeadow(rng, 6)
    const events = eventScheduler(
      [
        {
          id: 'santa',
          first: 5,
          gap: [34, 46],
          duration: 11,
          draw: (ctx, env, u, age, E) => {
            const s = unit(env)
            const x = cross(env, u, E.dir, 150)
            const y = env.H * 0.17 + Math.sin(u * 7) * 9 * s - u * 10 * s
            for (let k = 0; k < 9; k++) glint(x - E.dir * (50 + k * 14) * s, y + 4 * s + Math.sin(age * 5 + k) * 3 * s, (3.4 - k * 0.28) * s, k % 2 ? '#fff6b0' : '#ffd24a', 0.9 - k * 0.09)
            // En el sentido de la marcha (+x local): primero los renos, delante; detrás, el trineo con Papá Noel.
            at(x, y, s * 0.82, () => {
              line(20, -8, 40, -11, 'rgba(80,50,30,.75)', 1)
              line(58, -11, 76, -11, 'rgba(80,50,30,.75)', 1)
              at(86, 0, 1, () => F.reindeer(age + 1))
              at(48, 0, 1, () => F.reindeer(age))
              F.sleigh(age)
            }, Math.sin(age * 2) * 0.03, E.dir)
          },
        },
        squirrelEvent(14),
      ],
      rng,
    )
    // Rudolph se queda entre dos arbustos (se elige una sola vez, al primer fotograma)
    const chooseRudolph = (env) => {
      const list = []
      eachBush(env, (b) => list.push(b))
      list.sort((a, b) => a.x - b.x)
      const lo = env.W * 0.25
      const hi = env.W * 0.85
      for (let k = 0; k + 1 < list.length; k++) if (list[k].x > lo && list[k + 1].x < hi && list[k + 1].x - list[k].x < 180) return [list[k].i, list[k + 1].i]
      const one = list.find((b) => b.x > lo && b.x < hi)
      return one ? [one.i, one.i] : null
    }
    return {
      update: (dt, env) => {
        snow.update(dt, env)
        events.update(dt, env)
      },
      hills: (ctx, env) => {
        snowHills(ctx, env)
        // muñecos de nieve a lo lejos, sobre la colina
        const u = unit(env)
        ;[0.16, 0.5, 0.87].forEach((fx, i) => {
          const x = fx * env.W
          at(x, hillStandY(env, x, 0.35 + (i % 2) * 0.2), u * 0.8, () => F.snowman(S.t + i, ['#e0453a', '#2f9d6a', '#e8932b'][i], ['#33406b', '#7b4dd6', '#33406b'][i], false))
        })
      },
      scenery: (ctx, env) => {
        snowOverFlowers(ctx, env)
        // sobre cada montoncito de nieve, una flor de Pascua (poinsettia) de cada dos
        const u = unit(env)
        for (const f of sceneryFlowers(env)) {
          if (f.i % 2 === 1 || f.x < -40 || f.x > env.W + 40) continue
          at(f.x + f.count * 3, f.y - 4, u * (0.95 + f.count * 0.12), () => N.poinsettia(S.t, Math.sin(S.t + f.i)))
        }
      },
      ground: (ctx, env) => snowGround(ctx, env),
      back: (ctx, env) => {
        env.ctx = ctx
        const t = S.t
        const u = unit(env)
        treeSnow(ctx, env)
        // lucecitas en las copas
        for (const a of env.anchors) {
          if (a.bush || !onScreen(env, a.x, 80)) continue
          const tall = (53 + ((a.i * 29) % 46)) * a.size
          const ty = a.y - tall
          if (a.i % 3 !== 2) for (let k = 0; k < 4; k++) glint(a.x + Math.cos(k * 1.7 + a.i) * 16 * a.size, ty + Math.sin(k * 2.3 + a.i) * 12 * a.size, 2.6 * u, ['#ff5a5f', '#ffd24a', '#4dabf7', '#69db7c'][k], 0.25 + 0.75 * Math.max(0, Math.sin(t * 2.2 + k * 1.8 + a.i)))
        }
        drawMeadow(env, patches, (it) => F.snowPatch(14 + (it.i % 3) * 5), t)
        drawMeadow(env, trees, (it, tt) => F.xmasTree(tt, it.ph), t)
        const gc = [['#e0453a', '#ffd24a'], ['#4dabf7', '#fff'], ['#2f9d6a', '#ff5a8a'], ['#b57bff', '#ffd24a'], ['#ff9a3d', '#fff']]
        drawMeadow(env, gifts, (it, tt) => F.gift(gc[it.i % gc.length][0], gc[it.i % gc.length][1], tt + it.ph), t)
        // Rudolph: entero, de pie en el suelo entre los arbustos, a la escala del paisaje
        if (S.rudolph === undefined) S.rudolph = chooseRudolph(env)
        if (S.rudolph) {
          const bs = env.anchors.filter((a) => a.bush && (a.i === S.rudolph[0] || a.i === S.rudolph[1]))
          if (bs.length) {
            const x = bs.reduce((s, b) => s + b.x, 0) / bs.length
            if (onScreen(env, x, 40)) at(x, edgeY(env, x) + 1, u * 1.25, () => F.rudolph(t))
          }
        }
        snow.draw(ctx, env)
        events.draw(ctx, env)
      },
      front: (ctx, env) => {
        env.ctx = ctx
        F.lightsGarland(-4, env.W + 4, (x) => 2 + Math.sin(x * 0.01) * 1.5, S.t, 28 * unit(env) * 0.9, 9 * unit(env) * 0.8)
        const u = unit(env)
        // la franja de abajo: regalitos de distintos colores y tamaños
        const gc = [['#e0453a', '#ffd24a'], ['#4dabf7', '#e0453a'], ['#2f9d6a', '#ffd24a'], ['#b57bff', '#ffd24a'], ['#ff9a3d', '#2f6fc0']]
        for (let k = 0; k < 7; k++) {
          const x = (((k * 197 + 30 - env.offset * 0.6) % (env.W + 120)) + env.W + 120) % (env.W + 120) - 60
          const h = [7, 11, 8, 13, 9, 6, 10][k]
          at(x, stripY(env) + 1, u * 0.95, () => F.giftSmall(gc[k % gc.length][0], gc[k % gc.length][1], h))
        }
      },
      fauna: swapButterflyForBird('robin'),
      reset: () => snow.reset(),
    }
  })
}
void TAU
void lerp
