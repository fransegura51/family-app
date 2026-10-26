// OCTUBRE — Halloween simpático, de noche (cielo violeta, sin llegar a oscuro): menos calabazas y más personajes
// (fantasmas, brujas, vampiros), cuencos y bolsas de chuches, murciélagos, telarañas, arañita colgando y, en la colina
// del fondo, grupitos de niños disfrazados que van a pedir caramelos a una casita encendida.
import { TAU, at, circle, clamp, eventScheduler, fallSystem, glint, line, rounded, unit } from '../toolkit.js'
import { base, cross, drawMeadow, makeMeadow, squirrelEvent, stripY } from '../common.js'
import * as N from '../partsNature.js'
import * as F from '../partsFestive.js'
import { kid } from '../partsKids.js'
import { halloweenScene } from '../scenes.js'

function witch(t) {
  at(0, 0, 1, () => kid({ top: '#6b3fa0', bottom: '#6b3fa0', hat: 'witch', skin: '#cfe6b8', hair: '#2a1a3a', shoes: '#2a1a3a' }, { t, mode: 'stand' }))
  // escoba apoyada
  line(11, 1, 9, -30, '#7a5230', 1.8)
  rounded(6.4, 0, 6.4, 8, 2, '#d9a84a')
}
function vampire(t) {
  at(0, 0, 1, () => kid({ top: '#15131c', bottom: '#15131c', hat: 'vampire', cape: '#b01a2a', skin: '#e8e0d8', hair: '#15131c' }, { t, mode: 'wave' }))
}
function ghostKid(t) {
  F.ghost(t, 1)
}
function candyBowl() {
  const c = ['#ff7f9e', '#ffd76c', '#7edfe8', '#b57bff', '#ff9a3d']
  for (let i = 0; i < 7; i++) circle(-6 + i * 2, -7 - (i % 2) * 1.6, 1.9, c[i % 5])
  rounded(-8, -6, 16, 6, 2.4, '#7b4dd6')
  rounded(-9, -7, 18, 2, 1, '#9b6bd8')
}
function candyBag() {
  rounded(-5.4, -13, 10.8, 13, 2.4, '#ff8a2a')
  rounded(-5.4, -13, 10.8, 3, 1.4, '#e8761f')
  line(-3, -14, 3, -14, '#7a4a1a', 1.2)
  circle(0, -6, 2.6, '#fff')
  circle(-0.8, -6.6, 0.5, '#2a1a10')
  circle(0.8, -6.6, 0.5, '#2a1a10')
  line(-1.2, -4.8, 1.2, -4.8, '#2a1a10', 0.7)
  circle(-6, -2.4, 1.3, '#ff7f9e')
  circle(5.6, -1.8, 1.3, '#ffd76c')
}

export function octubre(seed) {
  return base(seed, (S, rng) => {
    const candies = fallSystem(
      {
        count: 7,
        speed: [24, 40],
        sway: 12,
        swaySpeed: 1.2,
        size: [0.8, 1.2],
        spin: 2,
        make: (p) => {
          p.c1 = rng.pick(['#ff7f9e', '#ff9a3d', '#b57bff'])
          p.c2 = rng.pick(['#ffd76c', '#fff', '#7edfe8'])
        },
        draw: (p, env, u) => {
          env.ctx.scale(u * 0.7, u * 0.7)
          F.candy(p.c1, p.c2)
        },
      },
      rng,
    )
    const leaves = fallSystem(
      {
        count: 8,
        speed: [22, 38],
        sway: 22,
        swaySpeed: 1.5,
        size: [0.7, 1.1],
        spin: 1.5,
        make: (p) => {
          p.kind = Math.floor(rng() * 3)
          p.color = rng.pick(['#e8742b', '#c4472f', '#b9552d'])
        },
        draw: (p, env, u) => {
          env.ctx.scale(u * 0.48, u * 0.48)
          N.leafKind(p.kind, p.color)
        },
      },
      rng,
    )
    // 0 calabaza · 1 bruja · 2 fantasma · 3 vampiro · 4 cuenco de chuches · 5 bolsa de chuches (sólo 3 calabazas)
    const KINDS = [0, 1, 2, 4, 3, 0, 2, 5, 1, 0, 3]
    const props = makeMeadow(rng, KINDS.length, (i) => KINDS[i])
    const ghosts = [0, 1].map((i) => ({ i, fx: i ? 0.74 : 0.26, fy: i ? 0.19 : 0.27, ph: rng.range(0, TAU) }))
    const stars = Array.from({ length: 16 }, () => ({ x: rng(), y: rng.range(0.03, 0.27), ph: rng.range(0, TAU), s: rng.range(0.6, 1.3) }))
    const events = eventScheduler(
      [
        {
          id: 'bats',
          first: 4,
          gap: [12, 20],
          duration: 8,
          draw: (ctx, env, u, age, E) => {
            for (let k = 0; k < 3; k++) {
              const uu = clamp(u - k * 0.05, 0, 1)
              const x = cross(env, uu, E.dir, 30)
              const y = env.H * (0.12 + k * 0.045) + Math.sin(age * 3 + k * 2) * 12 * unit(env)
              at(x, y, unit(env) * (0.95 - k * 0.1), () => F.bat(age + k * 0.7), 0, E.dir)
            }
          },
        },
        squirrelEvent(10),
      ],
      rng,
    )
    return {
      update: (dt, env) => {
        candies.update(dt, env)
        leaves.update(dt, env)
        events.update(dt, env)
      },
      hills: (ctx, env) => halloweenScene(env, S.t),
      // Noche suave: velo violeta sobre el cielo, las colinas, las nubes y los árboles; luna y estrellas.
      scenery: (ctx, env) => {
        const g = ctx.createLinearGradient(0, 0, 0, env.ground)
        g.addColorStop(0, 'rgba(36,18,84,.66)')
        g.addColorStop(0.6, 'rgba(74,42,122,.5)')
        g.addColorStop(1, 'rgba(108,66,148,.38)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, env.W, env.ground)
        const u = unit(env)
        for (const s of stars) glint(s.x * env.W, s.y * env.H, 3.4 * u * s.s, '#fff6c8', 0.25 + 0.75 * Math.max(0, Math.sin(S.t * 1.6 + s.ph)))
        // luna con su halo
        const mx = env.W * 0.14
        const my = env.H * 0.13
        const hg = ctx.createRadialGradient(mx, my, 4, mx, my, 44 * u)
        hg.addColorStop(0, 'rgba(255,244,190,.55)')
        hg.addColorStop(1, 'rgba(255,244,190,0)')
        ctx.fillStyle = hg
        ctx.beginPath()
        ctx.arc(mx, my, 44 * u, 0, TAU)
        ctx.fill()
        circle(mx, my, 15 * u, '#fff3c4')
        circle(mx - 4 * u, my - 3 * u, 3 * u, 'rgba(225,205,150,.7)')
        circle(mx + 5 * u, my + 4 * u, 2.2 * u, 'rgba(225,205,150,.7)')
      },
      back: (ctx, env) => {
        env.ctx = ctx
        const t = S.t
        const u = unit(env)
        drawMeadow(env, props, (it, tt) => {
          const k = it.kind
          if (k === 0) F.pumpkin(tt, 0.65 + 0.35 * Math.sin(tt * 5 + it.ph) * Math.sin(tt * 2.3 + it.ph), it.i % 2)
          else if (k === 1) witch(tt + it.ph)
          else if (k === 2) ghostKid(tt + it.ph)
          else if (k === 3) vampire(tt + it.ph)
          else if (k === 4) candyBowl()
          else candyBag()
        }, t, 0.52, 1.45, { sizeOf: (it) => (it.kind === 1 || it.kind === 3 ? 1.0 : it.kind === 2 ? 1.1 : it.kind === 4 || it.kind === 5 ? 1.35 : 1.0) })
        // fantasmas simpáticos en el cielo: aparecen y desaparecen con un fundido suave
        for (const g of ghosts) {
          const a = Math.max(0, Math.sin(t * 0.32 + g.ph * 2)) ** 0.7
          if (a < 0.02) continue
          const x = env.W * g.fx + Math.sin(t * 0.6 + g.ph) * 18 * u
          const y = env.H * g.fy + Math.sin(t * 1.3 + g.ph) * 7 * u
          at(x, y, u * 1.15, () => F.ghost(t + g.ph, 0.92 * a), Math.sin(t * 0.9 + g.ph) * 0.06)
        }
        leaves.draw(ctx, env)
        candies.draw(ctx, env)
        events.draw(ctx, env)
      },
      front: (ctx, env) => {
        env.ctx = ctx
        const u = unit(env)
        at(0, 0, u, () => F.cobweb(56))
        at(env.W, 0, u, () => F.cobweb(56), 0, -1)
        const sx = env.W * 0.16
        const drop = (22 + (Math.sin(S.t * 0.9) * 0.5 + 0.5) * 26) * u
        line(sx, 0, sx, drop, 'rgba(255,255,255,.7)', 1)
        at(sx, drop, u * 0.62, () => F.spider(S.t))
        // la franja de abajo: calabacitas, cuencos y bolsas de chuches
        for (let k = 0; k < 8; k++) {
          const x = (((k * 167 + 40 - env.offset * 0.6) % (env.W + 100)) + env.W + 100) % (env.W + 100) - 50
          const kind = k % 4
          at(x, stripY(env), u * 0.5, () => (kind === 0 ? F.pumpkin(S.t, 0.8, k % 3 === 0 ? 1 : 0) : kind === 1 ? candyBowl() : kind === 2 ? F.candy(['#ff7f9e', '#b57bff', '#ff9a3d'][k % 3], '#ffd76c') : candyBag()), 0)
        }
      },
      reset: () => {
        candies.reset()
        leaves.reset()
      },
    }
  })
}
