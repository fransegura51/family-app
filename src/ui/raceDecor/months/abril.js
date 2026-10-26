// ABRIL — aguaceros de primavera: una nubecita pasa, el cielo entero se nubla en gris (también las nubes blancas del
// fondo), llueve suave, se forman charcos, sale el arcoíris y luego vuelve a despejarse.
import { at, clamp, eventScheduler, fallSystem, lerp } from '../toolkit.js'
import { base, drawMeadow, makeMeadow, squirrelEvent, stripY } from '../common.js'
import * as N from '../partsNature.js'
import { edgeY, unit } from '../toolkit.js'

export function abril(seed) {
  const CYCLE = 36
  return base(seed, (S, rng) => {
    const rain = fallSystem(
      {
        count: 46,
        speed: [250, 340],
        sway: 0,
        size: [0.8, 1.2],
        spin: 0,
        noRotate: true,
        make: () => {},
        draw: (p, env, u) => {
          env.ctx.scale(u, u)
          N.raindrop(9)
        },
      },
      rng,
    )
    const puddles = makeMeadow(rng, 5)
    const tulips = makeMeadow(rng, 6, (i) => i)
    const events = eventScheduler(
      [
        {
          id: 'snail',
          first: 27,
          gap: [30, 40],
          duration: 14,
          draw: (ctx, env, u, age, E) => {
            const x = lerp(env.W * 0.15, env.W * 0.85, E.dir === 1 ? u : 1 - u)
            at(x, edgeY(env, x) + 2, unit(env) * 0.8, () => N.snail('#e7b777', '#d7ad89', age), 0, E.dir)
          },
        },
        squirrelEvent(9),
      ],
      rng,
    )
    const phase = () => (S.t + 6) % CYCLE
    // 0-8 sol · 8-12 llega la nube · 12-23 llueve · 23-26 escampa · 24-34 arcoíris y charcos
    const cloudA = (p) => clamp(Math.min((p - 6) / 3, (26 - p) / 3), 0, 1)
    const rainK = (p) => clamp(Math.min((p - 12) / 2.5, (23 - p) / 3), 0, 1)
    const wet = (p) => (p < 13 ? 0 : p < 24 ? clamp((p - 13) / 6, 0, 1) : clamp(1 - (p - 24) / 11, 0, 1))
    const bow = (p) => clamp(Math.min((p - 24) / 2.5, (CYCLE - 1 - p) / 3), 0, 1)
    // cuánto se nubla todo el cielo: crece con la nube gris y se va al escampar (con el arcoíris ya casi despejado)
    const overcast = (p) => clamp(Math.min((p - 7) / 5, (25 - p) / 3.5), 0, 1)
    return {
      update: (dt, env) => {
        rain.update(dt, env)
        events.update(dt, env)
      },
      // Al terminar el paisaje: un velo gris sobre el cielo (y las nubes blancas del fondo), las colinas y los árboles.
      scenery: (ctx, env) => {
        const k = overcast(phase())
        if (k < 0.01) return
        const g = ctx.createLinearGradient(0, 0, 0, env.ground)
        g.addColorStop(0, `rgba(96,110,134,${0.66 * k})`)
        g.addColorStop(0.7, `rgba(122,136,158,${0.5 * k})`)
        g.addColorStop(1, `rgba(140,152,170,${0.34 * k})`)
        ctx.fillStyle = g
        ctx.fillRect(0, 0, env.W, env.ground)
      },
      back: (ctx, env) => {
        env.ctx = ctx
        const p = phase()
        const u = unit(env)
        const rk = rainK(p)
        const ca = cloudA(p)
        const w = wet(p)
        const ba = bow(p)
        if (ba > 0.01) N.rainbow(env.W * 0.5, env.H * 0.36, Math.min(env.W * 0.4, env.H * 0.46), 0.5 * ba)
        if (ca > 0.01) {
          const cx = lerp(-40, env.W * 0.55, clamp((p - 6) / 14, 0, 1.2))
          ctx.save()
          ctx.globalAlpha *= ca
          at(cx, env.H * 0.11, u * 1.25, () => N.rainCloud())
          at(cx + 54 * u, env.H * 0.15, u * 0.9, () => N.rainCloud())
          ctx.restore()
        }
        drawMeadow(env, tulips, (it, tt) => N.tulip(['#ef5f7e', '#ffb33d', '#b57bff', '#ff8a8a'][it.i % 4], Math.sin(tt * 1.5 + it.ph) * 1.3, 17), S.t)
        if (w > 0.02) {
          drawMeadow(env, puddles, (it, tt) => {
            ctx.save()
            ctx.globalAlpha *= w
            N.puddle((11 + (it.i % 3) * 4) * (0.55 + 0.45 * w), rk > 0.1 ? (tt * 0.9 + it.ph) % 1 : 0)
            ctx.restore()
          }, S.t)
        }
        if (rk > 0.02) {
          ctx.save()
          ctx.globalAlpha *= rk
          rain.draw(ctx, env)
          ctx.restore()
        }
        events.draw(ctx, env)
      },
      front: (ctx, env) => {
        env.ctx = ctx
        const w = wet(phase())
        if (w > 0.02) {
          const u = unit(env)
          for (let k = 0; k < 5; k++) {
            const x = (((k * 173 + 50 - env.offset * 0.6) % (env.W + 100)) + env.W + 100) % (env.W + 100) - 50
            at(x, stripY(env) - 1, u * 0.7, () => {
              ctx.globalAlpha *= w
              N.puddle(14 + (k % 3) * 4, rainK(phase()) > 0.1 ? (S.t * 0.8 + k * 0.3) % 1 : 0)
            })
          }
        }
      },
      reset: () => rain.reset(),
    }
  })
}
