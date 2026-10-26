// ENERO — mismo paisaje nevado que diciembre (colinas blancas, árboles nevados, flores tapadas).
//   variant 'reyes'  → 1-6 de enero: los Reyes Magos con sus camellos cruzan despacio la colina del fondo.
//   variant 'nieve'  → 7-31 de enero: niños jugando en la nieve (bolas, muñeco, trineo) y patinando en un lago helado.
import { at, eventScheduler, glint, unit } from '../toolkit.js'
import { base, cross, drawMeadow, makeMeadow, snowFall, squirrelEvent, stripY, swapButterflyForBird } from '../common.js'
import * as N from '../partsNature.js'
import * as F from '../partsFestive.js'
import { snowGround, snowHills, snowOverFlowers, treeSnow } from '../snow.js'
import { reyesScene, snowKidsScene } from '../scenes.js'
import { frostCorners } from '../frost.js'

export function enero(seed, { variant = 'reyes' } = {}) {
  return base(seed, (S, rng) => {
    const snow = snowFall(rng, 34)
    const men = makeMeadow(rng, 3, (i) => i)
    const events = eventScheduler(
      [
        {
          id: 'cardinal',
          first: 7,
          gap: [18, 28],
          duration: 8,
          draw: (ctx, env, u, age, E) => {
            const x = cross(env, u, E.dir, 30)
            const y = env.H * 0.2 + Math.sin(u * 6) * 8
            at(x, y, unit(env) * 0.95, () => N.smallBird(age, '#d9382f', '#f5c9b0'), 0, E.dir)
          },
        },
        squirrelEvent(5),
      ],
      rng,
    )
    return {
      update: (dt, env) => {
        snow.update(dt, env)
        events.update(dt, env)
      },
      hills: (ctx, env) => {
        snowHills(ctx, env)
        if (variant === 'reyes') reyesScene(env, S.t)
        else snowKidsScene(env, S.t)
      },
      scenery: (ctx, env) => snowOverFlowers(ctx, env),
      ground: (ctx, env) => snowGround(ctx, env),
      back: (ctx, env) => {
        env.ctx = ctx
        const t = S.t
        const u = unit(env)
        treeSnow(ctx, env)
        drawMeadow(env, men, (it, tt) => F.snowman(tt, ['#e0453a', '#2f9d6a', '#e8932b'][it.kind % 3], ['#33406b', '#7b4dd6', '#33406b'][it.kind % 3], Math.sin(tt * 0.5 + it.ph) > 0.82), t, 0.52)
        // destellos sobre la nieve
        for (let k = 0; k < 6; k++) {
          const x = (((k * 137 + 40 - env.offset * 0.4) % (env.W + 80)) + env.W + 80) % (env.W + 80) - 40
          glint(x, env.laneTop(x) - 4 - (k % 3) * 4, (2 + (k % 2)) * u, '#fff', Math.max(0, Math.sin(t * 2.2 + k * 2.1)))
        }
        snow.draw(ctx, env)
        events.draw(ctx, env)
      },
      front: (ctx, env) => {
        env.ctx = ctx
        frostCorners(ctx, env, S.t)
        const u = unit(env)
        for (let k = 0; k < 7; k++) {
          const x = (((k * 211 + 30 - env.offset * 0.6) % (env.W + 120)) + env.W + 120) % (env.W + 120) - 60
          at(x, stripY(env), u * 0.6, () => F.snowPatch(14 + (k % 3) * 5))
        }
      },
      fauna: swapButterflyForBird('robin'),
      reset: () => snow.reset(),
    }
  })
}
