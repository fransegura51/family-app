// AGOSTO — fiesta de verano: banderines, globos que suben, cometas de juguete, sandías, fuegos artificiales pequeños y,
// en la colina del fondo, los niños de julio y un lago donde se bañan y saltan.
import { at, eventScheduler, fallSystem, glint, lerp, unit } from '../toolkit.js'
import { base, drawMeadow, makeMeadow, squirrelEvent, stripY } from '../common.js'
import * as F from '../partsFestive.js'
import { lakeScene, summerKidsScene } from '../scenes.js'
import * as N from '../partsNature.js'

export function agosto(seed) {
  return base(seed, (S, rng) => {
    const cols = ['#ff5a8a', '#ffd24a', '#4dabf7', '#69db7c', '#b57bff', '#ff9a3d']
    const balloons = fallSystem(
      {
        count: 9,
        rise: true,
        speed: [20, 34],
        sway: 14,
        swaySpeed: 0.9,
        size: [0.9, 1.3],
        spin: 0,
        noRotate: true,
        band: [0.04, 0.9],
        make: (p) => {
          p.color = rng.pick(cols)
        },
        draw: (p, env, u) => {
          env.ctx.scale(u, u)
          F.balloon(p.color, p.phase)
        },
      },
      rng,
    )
    const melons = makeMeadow(rng, 4, (i) => i % 2)
    const events = eventScheduler(
      [
        {
          id: 'fireworks',
          first: 5,
          gap: [12, 18],
          duration: 3.6,
          init: (E, env, r) => {
            E.x = r.range(0.2, 0.8) * env.W
            E.y = env.H * r.range(0.14, 0.24)
            E.col = r.pick(cols)
            E.col2 = r.pick(cols)
          },
          draw: (ctx, env, u, age, E) => {
            if (age < 1.2) {
              const k = age / 1.2
              glint(E.x, lerp(env.H * 0.34, E.y, k), 4 * unit(env), '#fff6b0', 0.9)
              return
            }
            const t = (age - 1.2) / 2.4
            at(E.x, E.y, unit(env), () => {
              F.firework(46, t, E.col)
              F.firework(26, t, E.col2)
            })
          },
        },
        squirrelEvent(12),
      ],
      rng,
    )
    return {
      update: (dt, env) => {
        balloons.update(dt, env)
        events.update(dt, env)
      },
      hills: (ctx, env) => {
        at(env.W * 0.9, env.H * 0.13, unit(env) * 0.85, () => N.sun(S.t, 24))
        summerKidsScene(env, S.t, { lake: true })
        lakeScene(env, S.t)
      },
      back: (ctx, env) => {
        env.ctx = ctx
        const t = S.t
        const u = unit(env)
        const kx = [0.2, 0.8]
        kx.forEach((fx, k) => {
          const x = env.W * fx + Math.sin(t * 0.7 + k * 2) * 12 * u
          const y = env.H * (0.15 + k * 0.03) + Math.sin(t * 0.9 + k) * 6 * u
          at(x, y, u * 0.9, () => F.kite(k ? '#4dabf7' : '#ff5a8a', k ? '#ffd24a' : '#fff2b3', t + k), Math.sin(t * 0.8 + k) * 0.12)
        })
        drawMeadow(env, melons, (it) => (it.kind ? F.sunHat() : F.watermelon()), t)
        balloons.draw(ctx, env)
        events.draw(ctx, env)
      },
      front: (ctx, env) => {
        env.ctx = ctx
        F.bunting(-6, env.W + 6, (x) => 3 + Math.cos(x * 0.011) * 2, S.t, 14 * unit(env) * 0.9, ['#ff9a3d', '#ffd24a', '#4dabf7', '#ff5a8a', '#69db7c'])
        const u = unit(env)
        for (let k = 0; k < 6; k++) {
          const x = (((k * 181 + 50 - env.offset * 0.6) % (env.W + 100)) + env.W + 100) % (env.W + 100) - 50
          at(x, stripY(env) - 1, u * 0.55, () => F.watermelon())
        }
      },
      reset: () => balloons.reset(),
    }
  })
}
