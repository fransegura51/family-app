// Paisaje nevado (diciembre y enero): colinas blancas detrás de los árboles, flores del paisaje tapadas con nieve,
// nieve en las copas y en las ramas, franja blanca bajo la pista. Todo son capas por encima del paisaje real:
// el dibujo de la Carrera no se toca.
import { at, ellipse, poly, unit } from './toolkit.js'
import { eachBush, eachTree, hill1Y, hill2Y, onScreen, sceneryFlowers } from './common.js'
import * as F from './partsFestive.js'

// Las dos colinas del fondo, en blanco (mismas formas que el paisaje real).
export function snowHills(ctx, env) {
  const { W, ground } = env
  ctx.fillStyle = '#e8f1fa'
  ctx.beginPath()
  ctx.moveTo(0, ground)
  for (let x = 0; x <= W + 12; x += 12) ctx.lineTo(x, hill1Y(env, x))
  ctx.lineTo(W, ground)
  ctx.fill()
  ctx.fillStyle = '#fbfdff'
  ctx.beginPath()
  ctx.moveTo(0, ground)
  for (let x = 0; x <= W + 12; x += 12) ctx.lineTo(x, hill2Y(env, x))
  ctx.lineTo(W, ground)
  ctx.fill()
  // un poco de relieve azulado en las crestas
  ctx.strokeStyle = 'rgba(176,204,232,.6)'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  for (let x = 0; x <= W + 12; x += 12) (x === 0 ? ctx.moveTo(x, hill2Y(env, x) + 3) : ctx.lineTo(x, hill2Y(env, x) + 3))
  ctx.stroke()
  ctx.strokeStyle = 'rgba(190,214,238,.55)'
  ctx.beginPath()
  for (let x = 0; x <= W + 12; x += 12) (x === 0 ? ctx.moveTo(x, hill1Y(env, x) + 2) : ctx.lineTo(x, hill1Y(env, x) + 2))
  ctx.stroke()
}

// Al terminar el paisaje: las flores de siempre quedan tapadas por montoncitos de nieve (en invierno no hay flores a la
// vista); los troncos y arbustos asoman por encima.
export function snowOverFlowers(ctx, env, withPoinsettias = false, t = 0) {
  const u = unit(env)
  for (const f of sceneryFlowers(env)) {
    if (f.x < -50 || f.x > env.W + 50) continue
    const rx = (11 + f.count * 5) * Math.max(0.8, u * 0.9)
    ellipse(f.x + f.count * 3, f.y - 3, rx, 12 * Math.max(0.8, u * 0.85), '#fbfdff')
    ellipse(f.x + f.count * 3 + rx * 0.2, f.y + 1, rx * 0.8, 5, 'rgba(190,214,238,.55)')
  }
  void withPoinsettias
  void t
}

// Nieve sobre árboles y arbustos: casquete en lo alto, nieve en los hombros de las copas y sobre cada rama de los abetos.
export function treeSnow(ctx, env) {
  eachTree(env, (a) => {
    if (!onScreen(env, a.x, 90)) return
    const s = a.s
    if (a.kind === 2) {
      // abeto: cada piso con su capa blanca (la mitad de arriba) y bolsitas en las puntas de las ramas
      for (let j = 0; j < 3; j++) {
        const top = a.ty - 35 * s + j * 15 * s
        const hw = 23 * s - (2 - j) * 0 // la base de cada piso del paisaje real mide 23·s a cada lado
        const baseY = a.ty + 12 * s + j * 10 * s
        const h = baseY - top
        const k = 0.46
        at(a.x, top, 1, () => {
          poly([[0, 0], [-hw * k, h * k], [hw * k, h * k]], 'rgba(255,255,255,.97)')
          ellipse(-hw * k, h * k, 6.2 * s, 2.6 * s, '#fff')
          ellipse(hw * k, h * k, 6.2 * s, 2.6 * s, '#fff')
          ellipse(-hw * 0.82, h * 0.86, 5.4 * s, 2.2 * s, 'rgba(255,255,255,.95)')
          ellipse(hw * 0.82, h * 0.86, 5.4 * s, 2.2 * s, 'rgba(255,255,255,.95)')
          ellipse(0, h * 0.99, hw * 0.9, 2 * s, 'rgba(255,255,255,.8)')
        })
      }
    } else if (a.kind === 1) {
      at(a.x, a.ty - 7 - 28 * s, 1, () => F.snowCap(16 * s, 7 * s))
      ellipse(a.x - 17 * s, a.ty - 12 * s, 6 * s, 3.2 * s, '#fff')
      ellipse(a.x + 17 * s, a.ty - 6 * s, 6 * s, 3.2 * s, '#fff')
      ellipse(a.x - 21 * s, a.ty + 6 * s, 5 * s, 2.6 * s, 'rgba(255,255,255,.95)')
      ellipse(a.x + 20 * s, a.ty + 8 * s, 5 * s, 2.6 * s, 'rgba(255,255,255,.95)')
    } else {
      at(a.x, a.ty - 24 * s, 1, () => F.snowCap(24 * s, 8 * s))
      // los cinco racimos de la copa redonda llevan su nieve en la parte de arriba
      for (let j = 0; j < 5; j++) {
        const ang = j * 2.4 + (a.i * 17.37 + 3.1)
        const cx = a.x + Math.cos(ang) * 17 * s
        const cy = a.ty + Math.sin(ang) * 11 * s
        ellipse(cx, cy - 14 * s, 10 * s, 4.4 * s, 'rgba(255,255,255,.95)')
      }
    }
    // el tronco también lleva un poco de nieve
    ellipse(a.x, a.y - 8 * s, 6 * s, 2.4 * s, 'rgba(255,255,255,.85)')
  })
  eachBush(env, (b) => {
    if (onScreen(env, b.x, 60)) at(b.x, b.y - b.rr * 0.85, 1, () => F.snowCap(b.rr * 1.1, b.rr * 0.4))
  })
}

// Franja de césped de debajo de la pista, blanca (se pinta ANTES de los animales del paisaje: el conejo corre por encima).
export function snowGround(ctx, env) {
  const { W, H, laneBottom } = env
  ctx.fillStyle = '#f4f9fe'
  ctx.beginPath()
  ctx.moveTo(0, laneBottom(0) + 8)
  ctx.lineTo(W, laneBottom(W) + 8)
  ctx.lineTo(W, H)
  ctx.lineTo(0, H)
  ctx.fill()
  ctx.fillStyle = 'rgba(190,214,238,.5)'
  ctx.fillRect(0, H * 0.985, W, H * 0.015)
}
