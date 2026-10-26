// MAYO — flores por todo el prado, abejas que revolotean, mariquitas paseando y alguna mariposa.
import { TAU, at, circle, eventScheduler, fallSystem, lerp, unit } from '../toolkit.js'
import { base, cross, drawMeadow, env01, makeMeadow, onScreen, squirrelEvent, stripY } from '../common.js'
import { edgeY } from '../toolkit.js'
import * as N from '../partsNature.js'

export function mayo(seed) {
  return base(seed, (S, rng) => {
    const flowers = makeMeadow(rng, 15, (i) => i % 4)
    const pollen = fallSystem(
      {
        count: 12,
        speed: [6, 14],
        sway: 16,
        swaySpeed: 1.1,
        size: [0.6, 1.1],
        spin: 0,
        noRotate: true,
        band: [0.08, 0.5],
        make: () => {},
        draw: (p, env, u) => {
          circle(0, 0, 1.6 * u, 'rgba(255,230,120,.9)')
          circle(0, 0, 3.4 * u, 'rgba(255,230,120,.25)')
        },
      },
      rng,
    )
    const bugs = [0, 1, 2].map((i) => ({ i, x: rng.range(0.1, 0.9), v: rng.range(2.2, 4.2) * (i % 2 ? -1 : 1), ph: rng.range(0, TAU) }))
    const events = eventScheduler(
      [
        {
          id: 'eight',
          first: 7,
          gap: [14, 22],
          duration: 9,
          draw: (ctx, env, u, age, E) => {
            const cx = lerp(env.W * 0.15, env.W * 0.85, E.dir === 1 ? u : 1 - u)
            const cy = env.H * 0.27
            const rx = 44 * unit(env)
            const a = age * 2.2
            ctx.save()
            ctx.setLineDash([3, 5])
            ctx.strokeStyle = 'rgba(80,60,40,.45)'
            ctx.lineWidth = 1.2
            ctx.beginPath()
            for (let k = 0; k < 40; k++) {
              const aa = a - k * 0.06
              const x = cx + Math.sin(aa) * rx
              const y = cy + Math.sin(aa * 2) * 14 * unit(env)
              if (k === 0) ctx.moveTo(x, y)
              else ctx.lineTo(x, y)
            }
            ctx.stroke()
            ctx.restore()
            at(cx + Math.sin(a) * rx, cy + Math.sin(a * 2) * 14 * unit(env), unit(env) * 1.15, () => N.bee(age), 0, Math.cos(a) >= 0 ? 1 : -1, env01(u, 0.1, 0.1))
          },
        },
        {
          id: 'butterfly',
          first: 15,
          gap: [16, 24],
          duration: 8,
          draw: (ctx, env, u, age, E) => {
            const x = cross(env, u, E.dir, 30)
            at(x, env.H * 0.32 + Math.sin(age * 2.6) * 16, unit(env) * 0.8, () => N.butterfly('#ffb347', '#ffe0a3', age), 0, E.dir)
          },
        },
        squirrelEvent(11),
      ],
      rng,
    )
    return {
      update: (dt, env) => {
        pollen.update(dt, env)
        events.update(dt, env)
        for (const b of bugs) b.x += (b.v * dt * unit(env)) / env.W
      },
      back: (ctx, env) => {
        env.ctx = ctx
        const t = S.t
        const u = unit(env)
        drawMeadow(env, flowers, (it, tt) => {
          const sw = Math.sin(tt * 1.7 + it.ph) * 1.5
          if (it.kind === 0) N.poppy('#e84b3c', sw, 17)
          else if (it.kind === 1) N.daisy('#fff', '#f0c33a', sw, 16)
          else if (it.kind === 2) N.tulip(['#ffb33d', '#ef5f7e', '#b57bff'][it.i % 3], sw, 19)
          else N.daisy('#ffe27a', '#e8932b', sw, 14)
        }, t)
        const span = env.W + 280
        for (let k = 0; k < 3; k++) {
          const it = flowers[k * 4 + 1]
          const fx = ((((it.i * span) / flowers.length + it.jx - env.offset * 0.52) % span) + span) % span - 140
          if (!onScreen(env, fx, 30)) continue
          const a = t * 2.1 + k * 2
          at(fx + Math.cos(a) * 15 * u, edgeY(env, fx) - 30 * u + Math.sin(a * 1.7) * 7 * u, u * 0.85, () => N.bee(t + k), 0, Math.sin(a) > 0 ? 1 : -1)
        }
        for (const b of bugs) {
          const x = (((b.x % 1) + 1) % 1) * env.W
          at(x, edgeY(env, x) + 1, u * 0.95, () => N.ladybug(t * 8 + b.ph), 0, b.v >= 0 ? 1 : -1)
        }
        pollen.draw(ctx, env)
        events.draw(ctx, env)
      },
      front: (ctx, env) => {
        env.ctx = ctx
        const u = unit(env)
        for (let k = 0; k < 10; k++) {
          const x = (((k * 119 + 20 - env.offset * 0.6) % (env.W + 100)) + env.W + 100) % (env.W + 100) - 50
          at(x, stripY(env), u * 0.62, () => (k % 2 ? N.poppy('#e84b3c', Math.sin(S.t * 1.6 + k) * 1.2, 9) : N.daisy('#fff', '#f0c33a', Math.sin(S.t * 1.6 + k) * 1.2, 9)))
        }
      },
      reset: () => pollen.reset(),
    }
  })
}
