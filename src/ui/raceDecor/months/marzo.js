// MARZO — primavera: pétalos cayendo, árboles en flor, flores en el prado, mariposas y pájaros que cruzan, y un sol
// alegre con cara sonriente en la parte derecha del cielo (donde no hay árbol; va detrás de los árboles si coincide).
import { at, circle, clamp, eventScheduler, fallSystem, unit } from '../toolkit.js'
import { base, cross, drawMeadow, eachBush, eachTree, makeMeadow, onScreen, squirrelEvent, stripY } from '../common.js'
import * as N from '../partsNature.js'

export function marzo(seed) {
  return base(seed, (S, rng) => {
    const petals = fallSystem(
      {
        count: 20,
        speed: [16, 30],
        sway: 20,
        swaySpeed: 1.2,
        size: [0.7, 1.3],
        spin: 2,
        make: (p) => {
          p.color = rng.pick(['#ffb3c8', '#ffc0d4', '#ffa6bf', '#ffd0de'])
        },
        draw: (p, env, u) => {
          env.ctx.scale(u * 1.15, u * 1.15)
          N.petal(p.color)
        },
      },
      rng,
    )
    const flowers = makeMeadow(rng, 13, (i) => i % 3)
    const events = eventScheduler(
      [
        {
          id: 'butterflies',
          first: 4,
          gap: [12, 20],
          duration: 9,
          draw: (ctx, env, u, age, E) => {
            const cols = [['#ee92d4', '#f8c7e9'], ['#7fb6ff', '#cfe3ff'], ['#ffc14d', '#ffe6a8']]
            for (let k = 0; k < 3; k++) {
              const uu = clamp(u - k * 0.05, 0, 1)
              if (uu <= 0 || uu >= 1) continue
              const x = cross(env, uu, E.dir, 30)
              const y = env.H * 0.3 + Math.sin(age * 2.4 + k * 2) * 18 * unit(env) - k * 14
              at(x, y, unit(env) * 0.78, () => N.butterfly(cols[k][0], cols[k][1], age + k), 0, E.dir)
            }
          },
        },
        {
          id: 'birds',
          first: 13,
          gap: [14, 22],
          duration: 8,
          draw: (ctx, env, u, age, E) => {
            for (let k = 0; k < 2; k++) {
              const uu = clamp(u - k * 0.04, 0, 1)
              const x = cross(env, uu, E.dir, 40)
              const y = env.H * (0.14 + k * 0.05) + Math.sin(age * 2 + k) * 6
              at(x, y, unit(env) * 0.85, () => N.smallBird(age + k * 0.4, k ? '#e0a23a' : '#4e93bb'), 0, E.dir)
            }
            const x = cross(env, u, E.dir, 40)
            ctx.save()
            ctx.globalAlpha *= 0.75 * Math.abs(Math.sin(age * 3))
            ctx.fillStyle = '#fff'
            ctx.font = `700 ${12 * unit(env)}px system-ui`
            ctx.fillText('♪', x + 14 * E.dir, env.H * 0.1)
            ctx.restore()
          },
        },
        squirrelEvent(9),
      ],
      rng,
    )
    return {
      update: (dt, env) => {
        petals.update(dt, env)
        events.update(dt, env)
      },
      // sol alegre en la parte derecha, detrás de los árboles y de las nubes
      hills: (ctx, env) => {
        const u = unit(env)
        at(env.W * 0.9, env.H * 0.14, u * 0.95, () => N.sun(S.t, 24))
      },
      back: (ctx, env) => {
        env.ctx = ctx
        const t = S.t
        eachTree(env, (a) => {
          if (!onScreen(env, a.x, 90) || a.kind === 2) return
          for (let k = 0; k < 11; k++) {
            const ang = k * 2.4 + a.i
            const rx = (a.kind === 1 ? 17 : 24) * a.s
            const ry = (a.kind === 1 ? 26 : 17) * a.s
            at(a.x + Math.cos(ang) * rx * ((k % 4) / 4 + 0.35), a.ty + Math.sin(ang) * ry * ((k % 3) / 3 + 0.3) - (a.kind === 1 ? 7 : 0), 0.55 * a.s + 0.35, () => N.blossom(k % 2 ? '#ffc0d4' : '#fff4f8', '#f2a2bd', 5), ang)
          }
        })
        eachBush(env, (b) => {
          if (!onScreen(env, b.x, 60)) return
          for (let k = 0; k < 5; k++) circle(b.x - b.rr * 0.8 + k * b.rr * 0.4, b.y - b.rr * 0.7 - (k % 2) * 3, 2.4, k % 2 ? '#ffc0d4' : '#fff')
        })
        drawMeadow(env, flowers, (it, tt) => {
          const sw = Math.sin(tt * 1.6 + it.ph) * 1.6
          if (it.kind === 0) N.daisy('#fff', '#f0c33a', sw, 16)
          else if (it.kind === 1) N.tulip(['#ef5f7e', '#ffb33d', '#b57bff'][it.i % 3], sw, 19)
          else N.daisy('#ffd7e4', '#f0a33a', sw, 13)
        }, t)
        petals.draw(ctx, env)
        events.draw(ctx, env)
      },
      front: (ctx, env) => {
        env.ctx = ctx
        const u = unit(env)
        for (let k = 0; k < 9; k++) {
          const x = (((k * 131 + 20 - env.offset * 0.6) % (env.W + 100)) + env.W + 100) % (env.W + 100) - 50
          at(x, stripY(env), u * 0.7, () => N.daisy(k % 2 ? '#fff' : '#ffd7e4', '#f0c33a', Math.sin(S.t * 1.5 + k) * 1.2, 8))
        }
      },
      reset: () => petals.reset(),
    }
  })
}
