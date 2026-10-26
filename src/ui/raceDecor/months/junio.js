// JUNIO — inicio de verano: sol sonriente, girasoles, mariposas y una pelota de playa que rueda. (Sin cometas.)
import { TAU, at, circle, clamp, eventScheduler, glint, unit } from '../toolkit.js'
import { base, cross, drawMeadow, makeMeadow, squirrelEvent, stripY } from '../common.js'
import { edgeY } from '../toolkit.js'
import * as N from '../partsNature.js'

export function junio(seed) {
  return base(seed, (S, rng) => {
    const sunflowers = makeMeadow(rng, 6, () => 0)
    const daisies = makeMeadow(rng, 8)
    const sparkles = Array.from({ length: 9 }, () => ({ x: rng(), y: rng.range(0.04, 0.34), ph: rng.range(0, TAU), s: rng.range(0.7, 1.4) }))
    const events = eventScheduler(
      [
        {
          id: 'butterflies',
          first: 4,
          gap: [9, 15],
          duration: 9,
          draw: (ctx, env, u, age, E) => {
            const cols = [['#ffb347', '#ffe0a3'], ['#ee92d4', '#f8c7e9'], ['#7fd7ff', '#d3f1ff']]
            for (let k = 0; k < 3; k++) {
              const uu = clamp(u - k * 0.06, 0, 1)
              if (uu <= 0 || uu >= 1) continue
              const x = cross(env, uu, E.dir, 30)
              at(x, env.H * 0.28 + Math.sin(age * 2.2 + k * 1.7) * 20 * unit(env) - k * 12, unit(env) * 0.8, () => N.butterfly(cols[k][0], cols[k][1], age + k), 0, E.dir)
            }
          },
        },
        {
          id: 'ball',
          first: 12,
          gap: [18, 26],
          duration: 11,
          draw: (ctx, env, u, age, E) => {
            const x = cross(env, u, E.dir, 24)
            const r = 9 * unit(env)
            const y = edgeY(env, x) - r + 2
            ctx.save()
            ctx.translate(x, y)
            ctx.rotate(age * 4 * E.dir)
            const cols = ['#ff5a6e', '#fff', '#4dabf7', '#ffd24a', '#69c05a']
            for (let k = 0; k < 5; k++) {
              ctx.fillStyle = cols[k]
              ctx.beginPath()
              ctx.moveTo(0, 0)
              ctx.arc(0, 0, r, (k * TAU) / 5, ((k + 1) * TAU) / 5)
              ctx.fill()
            }
            circle(0, 0, r * 0.2, '#fff')
            ctx.restore()
          },
        },
        squirrelEvent(16),
      ],
      rng,
    )
    return {
      update: (dt, env) => events.update(dt, env),
      back: (ctx, env) => {
        env.ctx = ctx
        const t = S.t
        const u = unit(env)
        at(env.W * 0.87, env.H * 0.13, u * 0.95, () => N.sun(t, 24))
        for (const s of sparkles) glint(s.x * env.W, s.y * env.H, 3.2 * u * s.s, '#fff6b8', Math.max(0, Math.sin(t * 1.8 + s.ph)) * 0.9)
        drawMeadow(env, sunflowers, (it, tt) => N.sunflower(Math.sin(tt * 1.2 + it.ph) * 1.4, 32), t)
        drawMeadow(env, daisies, (it, tt) => N.daisy('#fff', '#f0c33a', Math.sin(tt * 1.5 + it.ph) * 1.4, 14), t)
        events.draw(ctx, env)
      },
      front: (ctx, env) => {
        env.ctx = ctx
        const u = unit(env)
        for (let k = 0; k < 8; k++) {
          const x = (((k * 139 + 40 - env.offset * 0.6) % (env.W + 100)) + env.W + 100) % (env.W + 100) - 50
          at(x, stripY(env), u * 0.62, () => (k % 3 === 0 ? N.sunflower(Math.sin(S.t * 1.4 + k), 14) : N.daisy('#fff', '#f0c33a', Math.sin(S.t * 1.4 + k), 8)))
        }
      },
    }
  })
}
