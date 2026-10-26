// Escarcha en las esquinas superiores del cielo (zona sin corredores): degradado frío, cristales y destellos.
import { glint, TAU, unit } from './toolkit.js'

export function frostCorners(ctx, env, t) {
  const u = unit(env)
  const w = env.W
  for (const s of [-1, 1]) {
    const x0 = s === -1 ? 0 : w
    ctx.save()
    ctx.translate(x0, 0)
    ctx.scale(s === -1 ? 1 : -1, 1)
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 76 * u)
    g.addColorStop(0, 'rgba(235,246,255,.82)')
    g.addColorStop(0.55, 'rgba(210,232,255,.4)')
    g.addColorStop(1, 'rgba(210,232,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 0, 76 * u, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,.85)'
    ctx.lineWidth = 1.2
    ctx.lineCap = 'round'
    for (let k = 0; k < 6; k++) {
      const a = 0.12 + k * 0.26
      const L = (30 + (k % 3) * 11) * u
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(a) * L, Math.sin(a) * L)
      ctx.stroke()
      for (const f of [0.45, 0.72]) {
        const bx = Math.cos(a) * L * f
        const by = Math.sin(a) * L * f
        for (const d of [-0.7, 0.7]) {
          ctx.beginPath()
          ctx.moveTo(bx, by)
          ctx.lineTo(bx + Math.cos(a + d) * 7 * u, by + Math.sin(a + d) * 7 * u)
          ctx.stroke()
        }
      }
    }
    for (let k = 0; k < 4; k++) glint(Math.cos(0.4 + k) * (30 + k * 12) * u + 12, Math.sin(0.4 + k * 0.9) * (24 + k * 8) * u + 10, (2.4 + (k % 2)) * u, '#fff', 0.35 + 0.65 * Math.max(0, Math.sin(t * 2 + k * 1.7)))
    ctx.restore()
  }
}
