// NOVIEMBRE — otoño: hojas cayendo, árboles dorados con el borde de las copas en marrón rojizo, setas, un búho pequeño
// posado en un árbol, ardilla, remolinos de viento, gansos que migran y, en lugar de mariposas, un petirrojo.
import { TAU, at, circle, clamp, ellipse, eventScheduler, fallSystem, line } from '../toolkit.js'
import { base, cross, drawMeadow, eachBush, eachTree, makeMeadow, onScreen, squirrelEvent, swapButterflyForBird } from '../common.js'
import * as N from '../partsNature.js'
import { unit } from '../toolkit.js'

const RIM = '#b5532f' // marrón rojizo, como las hojas secas

export function noviembre(seed) {
  return base(seed, (S, rng) => {
    const leaves = fallSystem(
      {
        count: 24,
        speed: [22, 42],
        sway: 28,
        swaySpeed: 1.6,
        size: [0.75, 1.25],
        spin: 1.7,
        make: (p) => {
          p.kind = Math.floor(rng() * 3)
          p.color = rng.pick(N.AUTUMN)
        },
        draw: (p, env, u) => {
          env.ctx.scale(u * 0.66, u * 0.66)
          N.leafKind(p.kind, p.color)
        },
      },
      rng,
    )
    const mushrooms = makeMeadow(rng, 7, (i) => i % 3)
    const piles = makeMeadow(rng, 5)
    const stripLeaves = Array.from({ length: 12 }, () => ({ x: rng(), y: rng.range(0, 1), r: rng.range(0, TAU), k: Math.floor(rng() * 3), col: rng.pick(N.AUTUMN) }))
    const events = eventScheduler(
      [
        squirrelEvent(4, [26, 38]),
        {
          id: 'gust',
          first: 12,
          gap: [22, 32],
          duration: 8.5,
          draw: (ctx, env, u, age, E) => {
            const dir = E.dir
            const cx = cross(env, u, dir, 70)
            const cy = env.H * 0.2 + Math.sin(u * 5) * 0.035 * env.H
            const k = Math.sin(u * Math.PI)
            const s = unit(env)
            ctx.save()
            ctx.globalAlpha *= k
            for (let g = 0; g < 3; g++) at(cx - dir * g * 34 * s, cy + (g - 1) * 12 * s, s * (1 - g * 0.15), () => N.gust(46, age + g), 0, dir)
            for (let n = 0; n < 11; n++) {
              const ang = age * 3.4 + n * 0.62
              const rad = (14 + n * 3.2) * s
              const lx = cx - dir * n * 11 * s + Math.cos(ang) * rad * 1.3
              const ly = cy + Math.sin(ang) * rad * 0.75
              at(lx, ly, s * 0.38, () => N.leafKind(n % 3, N.AUTUMN[n % N.AUTUMN.length]), ang * 1.6)
            }
            ctx.restore()
          },
        },
        {
          id: 'geese',
          first: 20,
          gap: [30, 42],
          duration: 14,
          draw: (ctx, env, u, age, E) => {
            const s = unit(env) * 0.55
            const cx = cross(env, u, E.dir, 70)
            const cy = env.H * 0.085
            const pts = [[0, 0], [-16, 9], [16, 9], [-32, 18], [32, 18]]
            pts.forEach(([ox, oy], k) => at(cx + ox * s * E.dir * -1, cy + oy * s + Math.sin(age * 2 + k) * 1.4, s * 0.85, () => N.smallBird(age + k * 0.3, '#5a4a4a', '#e8dcc8'), 0, E.dir))
          },
        },
      ],
      rng,
    )
    const chooseOwlTree = (env) => {
      let best = null
      eachTree(env, (a) => {
        if (a.kind === 2 || a.x < env.W * 0.4 || a.x > env.W * 0.9) return
        if (!best || a.s > best.s) best = a
      })
      if (!best)
        eachTree(env, (a) => {
          if (a.kind !== 2 && !best) best = a
        })
      return best ? best.i : -1
    }
    return {
      update: (dt, env) => {
        leaves.update(dt, env)
        events.update(dt, env)
      },
      back: (ctx, env) => {
        env.ctx = ctx
        const t = S.t
        if (S.owlTree == null) S.owlTree = chooseOwlTree(env)
        eachTree(env, (a) => {
          if (!onScreen(env, a.x, 90)) return
          const s = a.s
          const gold = N.AUTUMN_GOLD
          if (a.kind === 1) {
            // borde marrón rojizo (tapa el verde de la copa) y dentro el dorado
            ellipse(a.x, a.ty - 7, 24 * s, 34 * s, RIM)
            ellipse(a.x - 12 * s, a.ty + 3, 17 * s, 23 * s, RIM)
            ctx.save()
            ctx.globalAlpha *= 0.95
            ellipse(a.x, a.ty - 7, 20 * s, 30 * s, gold[a.i % 4])
            ellipse(a.x - 12 * s, a.ty + 3, 13.6 * s, 19.6 * s, gold[(a.i + 1) % 4])
            ctx.restore()
            for (let k = 0; k < 8; k++) circle(a.x + Math.cos(k * 2.3 + a.i) * 14 * s, a.ty - 7 + Math.sin(k * 1.9 + a.i) * 22 * s, 3.2 * s + 1, k % 2 ? '#d9822b' : '#f6c95a')
          } else if (a.kind === 0) {
            for (let j = 0; j < 5; j++) {
              const ang = j * 2.4 + (a.i * 17.37 + 3.1)
              ellipse(a.x + Math.cos(ang) * 17 * s, a.ty + Math.sin(ang) * 11 * s, 19 * s, 20 * s, RIM)
            }
            for (let j = 0; j < 5; j++) {
              const ang = j * 2.4 + (a.i * 17.37 + 3.1)
              ctx.save()
              ctx.globalAlpha *= 0.96
              ellipse(a.x + Math.cos(ang) * 17 * s, a.ty + Math.sin(ang) * 11 * s, 15 * s, 16 * s, j % 2 ? '#e89a2c' : '#f2b73f')
              ctx.restore()
            }
            for (let k = 0; k < 7; k++) circle(a.x + Math.cos(k * 2.1) * 20 * s, a.ty + Math.sin(k * 1.7) * 13 * s, 2.6 * s + 1, k % 2 ? '#d9482b' : '#f6c95a')
          } else {
            // abetos: se quedan verdes (son de hoja perenne), con alguna hojita dorada prendida
            for (let k = 0; k < 7; k++) circle(a.x + Math.cos(k * 2.7 + a.i) * 12 * s, a.ty - 22 * s + (k * 6.4 - 6) * s, 2 * s + 0.6, k % 2 ? '#f2b73f' : '#e8742b')
          }
        })
        eachBush(env, (b) => {
          if (!onScreen(env, b.x, 60)) return
          for (let k = 0; k < 6; k++) circle(b.x - b.rr * 0.9 + k * b.rr * 0.36, b.y - b.rr * 0.72 - (k % 3) * 3, b.rr * 0.28, k % 2 ? 'rgba(217,72,43,.88)' : 'rgba(242,183,63,.9)')
        })
        // el búho: la misma figura que gustó, pequeña y posada en una rama del árbol de la derecha
        eachTree(env, (a) => {
          if (a.i !== S.owlTree || !onScreen(env, a.x, 60)) return
          const k = 0.3 * a.s
          const ox = a.x + 13 * a.s
          const oy = a.ty + 24 * a.s
          line(ox - 20 * k, oy + 1.4 * k, ox + 22 * k, oy - 1 * k, '#6b4426', Math.max(2, 4.4 * k))
          at(ox, oy, k, () => N.owl(t))
        })
        drawMeadow(env, piles, (it) => {
          for (let k = 0; k < 5; k++) ellipse(-9 + k * 4.4, -2 - (k % 2) * 2, 5, 2.4, N.AUTUMN[(it.i + k) % N.AUTUMN.length], (k - 2) * 0.2)
        }, t, 0.52, 1.5)
        drawMeadow(env, mushrooms, (it) => {
          const caps = [['#e04a3a', '#fff'], ['#b9763c', '#f6e3b8'], ['#e8a24a', '#fff6dc']][it.kind]
          N.mushroom(caps[0], caps[1])
          if (it.i % 2) at(8, 0, 0.7, () => N.mushroom(caps[0], caps[1]))
        }, t, 0.52, 1.75)
        leaves.draw(ctx, env)
        events.draw(ctx, env)
      },
      front: (ctx, env) => {
        env.ctx = ctx
        const u = unit(env)
        for (const l of stripLeaves) {
          const x = (((l.x * (env.W + 100) - env.offset * 0.6) % (env.W + 100)) + env.W + 100) % (env.W + 100) - 50
          at(x, env.H * 0.984 - 4 + l.y * 2, u * 0.34, () => N.leafKind(l.k, l.col), l.r)
        }
      },
      fauna: swapButterflyForBird('robin'),
      reset: () => leaves.reset(),
    }
  })
}
void clamp
