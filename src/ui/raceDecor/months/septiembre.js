// SEPTIEMBRE — vuelta al cole: lápices gigantes (nunca verdes y apartados de los troncos), libros, mochilas, letras
// cayendo, avioncitos de papel, el autobús escolar y, en la colina del fondo, un colegio con niños que llegan con su mochila.
import { at, clamp, eventScheduler, fallSystem, unit } from '../toolkit.js'
import { base, cross, drawMeadow, makeMeadow, squirrelEvent, stripY } from '../common.js'
import { edgeY } from '../toolkit.js'
import * as F from '../partsFestive.js'
import { schoolScene } from '../scenes.js'

export function septiembre(seed) {
  return base(seed, (S, rng) => {
    const letters = fallSystem(
      {
        count: 9,
        speed: [14, 24],
        sway: 18,
        swaySpeed: 1,
        size: [0.8, 1.2],
        spin: 0.5,
        make: (p) => {
          p.ch = rng.pick(['A', 'B', 'C', '1', '2', '3', '+', 'a', 'b'])
          p.color = rng.pick(['#e0453a', '#4dabf7', '#ff5a8a', '#ff9a3d', '#b57bff'])
        },
        draw: (p, env, u) => {
          env.ctx.scale(u * 0.8, u * 0.8)
          F.abcLetter(p.ch, p.color)
        },
      },
      rng,
    )
    const props = makeMeadow(rng, 11, (i) => [0, 1, 2, 0, 3, 2, 0, 1, 2, 0, 4][i % 11])
    const events = eventScheduler(
      [
        {
          id: 'planes',
          first: 4,
          gap: [12, 18],
          duration: 9,
          draw: (ctx, env, u, age, E) => {
            for (let k = 0; k < 2; k++) {
              const uu = clamp(u - k * 0.1, 0, 1)
              const x = cross(env, uu, E.dir, 30)
              const y = env.H * (0.2 + k * 0.06) + Math.sin(age * 1.6 + k * 2) * 14 * unit(env)
              at(x, y, unit(env) * (1 - k * 0.15), () => F.paperPlane(age), Math.cos(age * 1.6 + k * 2) * 0.28, E.dir)
            }
          },
        },
        {
          id: 'bus',
          first: 12,
          gap: [24, 34],
          duration: 16,
          draw: (ctx, env, u, age, E) => {
            const x = cross(env, u, E.dir, 40)
            at(x, edgeY(env, x) - 2 + Math.sin(age * 12) * 0.5, unit(env) * 0.78, () => F.schoolBus(), 0, E.dir)
          },
        },
        squirrelEvent(9),
      ],
      rng,
    )
    return {
      update: (dt, env) => {
        letters.update(dt, env)
        events.update(dt, env)
      },
      hills: (ctx, env) => schoolScene(env, S.t),
      back: (ctx, env) => {
        env.ctx = ctx
        // colores: nada de verde (ya hay mucho y no resaltaría)
        const pc = ['#ffcf3d', '#4dabf7', '#ff7a59', '#b57bff', '#ff5a8a', '#e0453a']
        const bc = [['#e0453a', '#4dabf7', '#ff9a3d'], ['#b57bff', '#ffcf3d', '#ff7a59']]
        const bk = ['#ff7a59', '#4dabf7', '#b57bff', '#ff5a8a']
        drawMeadow(env, props, (it, tt) => {
          if (it.kind === 0) F.pencil(pc[it.i % pc.length])
          else if (it.kind === 1) F.bookStack(...bc[it.i % 2])
          else if (it.kind === 2) F.backpack(bk[it.i % bk.length])
          else if (it.kind === 3) F.openBook(tt)
          else F.pencil('#ffcf3d')
        }, S.t, 0.52, 1.45, { avoidTrunks: true })
        letters.draw(ctx, env)
        events.draw(ctx, env)
      },
      front: (ctx, env) => {
        env.ctx = ctx
        const u = unit(env)
        for (let k = 0; k < 7; k++) {
          const x = (((k * 163 + 40 - env.offset * 0.6) % (env.W + 100)) + env.W + 100) % (env.W + 100) - 50
          at(x, stripY(env), u * 0.5, () => F.pencil(['#ffcf3d', '#4dabf7', '#ff7a59'][k % 3]), k % 2 ? 1.25 : 1.9)
        }
      },
      reset: () => letters.reset(),
    }
  })
}
