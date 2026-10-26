// JULIO — vacaciones: niños jugando en la colina del fondo (pelota, helados, corretear), sol en una zona despejada
// del cielo, sombrilla y castillos de arena, algún helado y polo, burbujas, gaviotas y conchas.
import { at, eventScheduler, fallSystem, circle, unit, TAU } from '../toolkit.js'
import { base, cross, drawMeadow, makeMeadow, squirrelEvent } from '../common.js'
import * as N from '../partsNature.js'
import * as F from '../partsFestive.js'
import { summerKidsScene } from '../scenes.js'

export function julio(seed) {
  return base(seed, (S, rng) => {
    const bubbles = fallSystem(
      {
        count: 15,
        rise: true,
        speed: [18, 32],
        sway: 12,
        swaySpeed: 1.2,
        size: [0.7, 1.5],
        spin: 0,
        noRotate: true,
        band: [0.1, 0.82],
        make: () => {},
        draw: (p, env, u) => {
          const ctx = env.ctx
          ctx.strokeStyle = 'rgba(255,255,255,.85)'
          ctx.lineWidth = 1.2
          ctx.beginPath()
          ctx.arc(0, 0, 5 * u, 0, TAU)
          ctx.stroke()
          circle(0, 0, 5 * u, 'rgba(180,225,255,.18)')
          circle(-1.8 * u, -1.8 * u, 1.2 * u, 'rgba(255,255,255,.9)')
        },
      },
      rng,
    )
    // Menos helados «en medio de la nada»: uno, un polo, y el resto de cosas de playa
    const props = makeMeadow(rng, 7, (i) => [0, 1, 2, 4, 1, 3, 5][i % 7])
    const events = eventScheduler(
      [
        {
          id: 'gull',
          first: 5,
          gap: [14, 22],
          duration: 9,
          draw: (ctx, env, u, age, E) => {
            const x = cross(env, u, E.dir, 40)
            at(x, env.H * 0.15 + Math.sin(u * 5) * 10, unit(env) * 1, () => F.seagull(age), 0, E.dir)
            const x2 = cross(env, Math.max(0, u - 0.07), E.dir, 40)
            at(x2, env.H * 0.2 + Math.sin(u * 5 + 1) * 8, unit(env) * 0.75, () => F.seagull(age + 1), 0, E.dir)
          },
        },
        squirrelEvent(12),
      ],
      rng,
    )
    return {
      update: (dt, env) => {
        bubbles.update(dt, env)
        events.update(dt, env)
      },
      // Sol y niños en el fondo, detrás de los árboles. El sol va en la zona derecha, donde el cielo está despejado.
      hills: (ctx, env) => {
        at(env.W * 0.9, env.H * 0.13, unit(env) * 0.85, () => N.sun(S.t, 24))
        summerKidsScene(env, S.t)
      },
      back: (ctx, env) => {
        env.ctx = ctx
        drawMeadow(env, props, (it, tt) => {
          if (it.kind === 0) F.beachUmbrella(tt)
          else if (it.kind === 1) F.sandcastle()
          else if (it.kind === 2) F.iceCream('#e0a657', ['#ff9ec4', '#fff2b3'])
          else if (it.kind === 3) F.popsicle('#4dabf7', '#ff6b8b')
          else if (it.kind === 4) F.sunHat()
          else F.watermelon()
        }, S.t)
        bubbles.draw(ctx, env)
        events.draw(ctx, env)
      },
      front: (ctx, env) => {
        env.ctx = ctx
        const u = unit(env)
        for (let k = 0; k < 8; k++) {
          const x = (((k * 151 + 30 - env.offset * 0.6) % (env.W + 100)) + env.W + 100) % (env.W + 100) - 50
          at(x, env.H * 0.984 - 2, u * 0.62, () => (k % 2 ? F.starfish(['#f5a05d', '#ff8a8a'][k % 3 === 0 ? 0 : 1]) : F.seaShell()), k * 0.7)
        }
      },
      reset: () => bubbles.reset(),
    }
  })
}
