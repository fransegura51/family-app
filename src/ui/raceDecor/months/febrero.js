// FEBRERO — carnaval: confeti y serpentinas, banderines, máscaras en el prado, cañón de confeti, comparsa de niños
// disfrazados bailando y una carroza que cruza despacio por la colina. Flores de después del deshielo (campanillas de
// invierno, crocus y narcisos) y almendros en flor.
import { at, clamp, eventScheduler, fallSystem, glint, TAU, unit } from '../toolkit.js'
import { base, drawMeadow, eachTree, makeMeadow, onScreen, squirrelEvent, stripY, swapButterflyForBird } from '../common.js'
import * as N from '../partsNature.js'
import * as F from '../partsFestive.js'
import { carnivalScene } from '../scenes.js'

export function febrero(seed) {
  return base(seed, (S, rng) => {
    const cols = ['#ff5a8a', '#ffd24a', '#4dabf7', '#69db7c', '#b57bff', '#ff9a3d']
    const confetti = fallSystem(
      {
        count: 40,
        speed: [30, 58],
        sway: 22,
        swaySpeed: 2,
        size: [0.8, 1.4],
        spin: 4,
        make: (p) => {
          p.kind = Math.floor(rng() * 3)
          p.color = rng.pick(cols)
        },
        draw: (p, env, u) => {
          env.ctx.scale(u * 1.55, u * 1.55)
          F.confettiPiece(p.kind, p.color)
        },
      },
      rng,
    )
    const streamers = fallSystem(
      {
        count: 6,
        speed: [22, 36],
        sway: 10,
        swaySpeed: 1,
        size: [0.9, 1.3],
        spin: 0,
        noRotate: true,
        make: (p) => {
          p.color = rng.pick(cols)
        },
        draw: (p, env, u) => {
          env.ctx.scale(u, u)
          F.streamer(34, p.color, p.phase, 7)
        },
      },
      rng,
    )
    const masks = makeMeadow(rng, 4, (i) => i)
    // flores de febrero, después del deshielo: campanillas de invierno, crocus morados y narcisos
    const flowers = makeMeadow(rng, 14, (i) => i % 4)
    const events = eventScheduler(
      [
        {
          id: 'cannon',
          first: 5,
          gap: [14, 22],
          duration: 3.4,
          init: (E, env, r) => {
            E.x = r.range(0.2, 0.8) * env.W
            E.parts = Array.from({ length: 34 }, () => ({ a: r.range(-2.5, -0.65), v: r.range(90, 230), col: r.pick(cols), k: Math.floor(r() * 3), sp: r.range(-6, 6) }))
          },
          draw: (ctx, env, u, age, E) => {
            const u0 = unit(env)
            const y0 = env.H * 0.34
            for (const p of E.parts) {
              const x = E.x + Math.cos(p.a) * p.v * age * 0.55 * u0
              const y = y0 + (Math.sin(p.a) * p.v * age + 150 * age * age) * 0.55 * u0
              ctx.save()
              ctx.globalAlpha *= clamp(1.25 - age / 3.4, 0, 1)
              ctx.translate(x, y)
              ctx.rotate(age * p.sp)
              ctx.scale(u0, u0)
              F.confettiPiece(p.k, p.col)
              ctx.restore()
            }
            if (age < 0.35) glint(E.x, y0, 18 * u0 * (1 - age / 0.35), '#fff6b0', 1 - age / 0.35)
          },
        },
        squirrelEvent(11),
      ],
      rng,
    )
    return {
      update: (dt, env) => {
        confetti.update(dt, env)
        streamers.update(dt, env)
        events.update(dt, env)
      },
      hills: (ctx, env) => carnivalScene(env, S.t),
      back: (ctx, env) => {
        env.ctx = ctx
        const t = S.t
        // almendros en flor: flores blanco-rosadas sobre la copa de algunos árboles redondos
        eachTree(env, (a) => {
          if (!onScreen(env, a.x, 90) || a.kind === 2 || a.i % 2 === 1) return
          for (let k = 0; k < 12; k++) {
            const ang = k * 2.4 + a.i
            const rx = (a.kind === 1 ? 17 : 24) * a.s
            const ry = (a.kind === 1 ? 26 : 17) * a.s
            at(a.x + Math.cos(ang) * rx * ((k % 4) / 4 + 0.35), a.ty + Math.sin(ang) * ry * ((k % 3) / 3 + 0.3) - (a.kind === 1 ? 7 : 0), 0.5 * a.s + 0.35, () => N.almondBlossom(5), ang)
          }
        })
        const mc = [['#7b4dd6', '#ffd24a', '#ff5a8a'], ['#e0453a', '#ffd24a', '#4dabf7'], ['#1fa38a', '#ffe27a', '#ff9ff3'], ['#ff8a3d', '#fff6dc', '#7b4dd6']]
        drawMeadow(env, flowers, (it, tt) => {
          const sw = Math.sin(tt * 1.5 + it.ph) * 1.4
          if (it.kind === 0) N.snowdrop(sw, 13)
          else if (it.kind === 1) N.crocus(['#9b6bd8', '#c08ae8', '#7b4dd6'][it.i % 3], sw, 11)
          else if (it.kind === 2) N.narcissus(sw, 17)
          else N.snowdrop(sw, 12)
        }, t, 0.52, 1.45)
        drawMeadow(env, masks, (it, tt) => {
          const m = mc[it.kind % 4]
          ctx.rotate(Math.sin(tt * 1.6 + it.ph) * 0.05)
          F.mask(m[0], m[1], m[2])
        }, t, 0.52, 1.5)
        streamers.draw(ctx, env)
        confetti.draw(ctx, env)
        events.draw(ctx, env)
      },
      front: (ctx, env) => {
        env.ctx = ctx
        F.bunting(-6, env.W + 6, (x) => 3 + Math.sin(x * 0.012) * 2, S.t, 15 * unit(env) * 0.9)
        const u = unit(env)
        for (let k = 0; k < 16; k++) {
          const x = (((k * 97 + 10 - env.offset * 0.6) % (env.W + 80)) + env.W + 80) % (env.W + 80) - 40
          at(x, stripY(env) - (k % 3) * 2, u * 0.8, () => F.confettiPiece(k % 3, cols[k % cols.length]), k)
        }
        // y unos cuantos narcisos y campanillas en la franja de abajo
        for (let k = 0; k < 8; k++) {
          const x = (((k * 131 + 20 - env.offset * 0.6) % (env.W + 100)) + env.W + 100) % (env.W + 100) - 50
          at(x, stripY(env), u * 0.62, () => (k % 2 ? N.narcissus(Math.sin(S.t * 1.5 + k) * 1.1, 10) : N.snowdrop(Math.sin(S.t * 1.5 + k) * 1.1, 8)))
        }
      },
      fauna: swapButterflyForBird('sparrow'),
      reset: () => {
        confetti.reset()
        streamers.reset()
      },
    }
  })
}
void TAU
