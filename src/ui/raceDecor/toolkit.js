// Caja de herramientas común de la capa de decoración mensual: dibujo plano con el mismo estilo que la Carrera
// (elipses, círculos, trazos redondeados, sin contornos), un generador aleatorio con semilla (cada mes se ve igual
// en cada visita), y los DOS motores reutilizables que usan los doce meses:
//   · fallSystem  — partículas que caen/suben con vaivén (nieve, hojas, pétalos, confeti, lluvia, burbujas, globos…)
//   · eventScheduler — apariciones ocasionales y espaciadas (ardilla, trineo, murciélagos, cometas…), de una en una.
// Nada de aquí conoce la competición: solo recibe el «entorno» de dibujo (tamaño, tiempo, líneas del paisaje).

let c = null // contexto 2D del fotograma en curso
export function setCtx(ctx) {
  c = ctx
}
export const ctx2d = () => c

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
export const lerp = (a, b, u) => a + (b - a) * u
export const smooth = (u) => u * u * (3 - 2 * u)
export const TAU = Math.PI * 2

// Generador con semilla (mulberry32): mismo mes → mismas posiciones, siempre.
export function rngFrom(seed) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  next.range = (lo, hi) => lo + next() * (hi - lo)
  next.pick = (arr) => arr[Math.floor(next() * arr.length)]
  return next
}

// ---------------------------------------------------------------------------------------------- dibujo plano
export function circle(x, y, r, col) {
  c.fillStyle = col
  c.beginPath()
  c.arc(x, y, r, 0, TAU)
  c.fill()
}
export function ellipse(x, y, rx, ry, col, rot = 0) {
  c.fillStyle = col
  c.beginPath()
  c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU)
  c.fill()
}
export function rounded(x, y, w, h, r, col) {
  c.fillStyle = col
  c.beginPath()
  c.roundRect(x, y, w, h, r)
  c.fill()
}
export function line(x1, y1, x2, y2, col, w = 2) {
  c.strokeStyle = col
  c.lineWidth = w
  c.lineCap = 'round'
  c.beginPath()
  c.moveTo(x1, y1)
  c.lineTo(x2, y2)
  c.stroke()
}
export function poly(pts, col) {
  c.fillStyle = col
  c.beginPath()
  c.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1])
  c.closePath()
  c.fill()
}
export function star(x, y, r, ri, n, col, rot = 0) {
  c.fillStyle = col
  c.beginPath()
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n - Math.PI / 2
    const d = i % 2 ? ri : r
    if (i === 0) c.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d)
    else c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d)
  }
  c.closePath()
  c.fill()
}
export function curve(pts, col, w = 2) {
  c.strokeStyle = col
  c.lineWidth = w
  c.lineCap = 'round'
  c.lineJoin = 'round'
  c.beginPath()
  c.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1])
  c.stroke()
}
// Dibuja `fn` trasladado, escalado y girado; `dir` = -1 la voltea (animales que van hacia la izquierda).
export function at(x, y, s, fn, rot = 0, dir = 1, alpha = 1) {
  c.save()
  c.translate(x, y)
  if (rot) c.rotate(rot)
  c.scale(s * dir, s)
  if (alpha !== 1) c.globalAlpha *= alpha
  fn()
  c.restore()
}

// ---------------------------------------------------------------------------------------------- geometría de la Carrera
// Escala general de los adornos (la Carrera se ve más grande en escritorio que en móvil).
export const unit = (env) => clamp(env.H / 380, 0.62, 1.7)
// Línea donde «se apoyan» las cosas del prado: justo en el borde superior de la pista.
export const edgeY = (env, x) => env.laneTop(x) - 1
// Posición horizontal con la misma paralaje que las flores del paisaje real (se mueven con la cámara).
export function meadowX(env, i, base, factor = 0.52, pad = 140) {
  const span = env.W + pad * 2
  return ((((i * base - env.offset * factor) % span) + span) % span) - pad
}

// ---------------------------------------------------------------------------------------------- motor de partículas
// Reutilizado por nieve, hojas, pétalos, confeti, serpentinas, lluvia, burbujas y globos.
//   opts.count      cuántas a la vez en pantalla de 720 px de ancho (se reduce solo en móvil)
//   opts.rise       true = sube en vez de caer
//   opts.speed      [mín, máx] px/s a escala 1
//   opts.sway       amplitud lateral (px) y opts.swaySpeed (rad/s)
//   opts.spin       giro máximo (rad/s)
//   opts.size       [mín, máx] tamaño base
//   opts.make(p,i)  rellena p.kind, p.color… al (re)crear cada partícula
//   opts.draw(p,env,u) dibuja una partícula (ya trasladada a su posición y girada; u = escala)
//   opts.band       [y0,y1] en fracción de H entre las que viven (por defecto del borde superior al final de la pista)
export function fallSystem(opts, rng) {
  const parts = []
  let n = 0
  const make = (p, env, initial) => {
    const u = unit(env)
    p.x = rng.range(-20, env.W + 20)
    const y0 = opts.band ? opts.band[0] * env.H : -12 * u
    const y1 = opts.band ? opts.band[1] * env.H : env.laneBottom(p.x) - 4
    p.y0 = y0
    p.y1 = y1
    p.y = initial ? rng.range(y0, y1) : opts.rise ? y1 : y0
    if (opts.rise && !initial) p.y = y1
    p.vy = rng.range(opts.speed[0], opts.speed[1])
    p.phase = rng.range(0, TAU)
    p.sway = rng.range(0.4, 1) * (opts.sway ?? 0)
    p.swaySpeed = rng.range(0.7, 1.3) * (opts.swaySpeed ?? 1.4)
    p.size = rng.range(opts.size[0], opts.size[1])
    p.rot = rng.range(0, TAU)
    p.spin = rng.range(-1, 1) * (opts.spin ?? 0)
    p.drift = (opts.drift ?? 0) * rng.range(0.6, 1.2)
    p.alive = true
    if (opts.make) opts.make(p, parts.indexOf(p))
  }
  return {
    update(dt, env) {
      const want = Math.max(4, Math.round(opts.count * clamp(env.W / 720, 0.45, 1)))
      while (parts.length < want) {
        const p = {}
        parts.push(p)
        make(p, env, true)
      }
      if (parts.length > want) parts.length = want
      n = want
      const u = unit(env)
      for (const p of parts) {
        p.phase += dt * p.swaySpeed
        p.rot += dt * p.spin
        p.x += (Math.sin(p.phase) * p.sway + p.drift) * dt * u
        p.y += (opts.rise ? -1 : 1) * p.vy * dt * u
        const out = opts.rise ? p.y < p.y0 : p.y > p.y1
        if (out || p.x < -40 || p.x > env.W + 40) make(p, env, false)
      }
    },
    draw(ctx, env) {
      const u = unit(env)
      for (let i = 0; i < n; i++) {
        const p = parts[i]
        // Entra y sale con suavidad (nunca «pop»).
        const span = Math.max(1, Math.abs(p.y1 - p.y0))
        const travelled = opts.rise ? (p.y1 - p.y) / span : (p.y - p.y0) / span
        const fade = Math.min(1, travelled / 0.07, (1 - travelled) / 0.14)
        if (fade <= 0.02) continue
        ctx.save()
        ctx.globalAlpha *= clamp(fade, 0, 1) * (opts.alpha ?? 1)
        ctx.translate(p.x, p.y)
        if (p.rot && !opts.noRotate) ctx.rotate(p.rot)
        opts.draw(p, env, u * p.size)
        ctx.restore()
      }
    },
    reset() {
      parts.length = 0
    },
  }
}

// ---------------------------------------------------------------------------------------------- apariciones ocasionales
// defs: [{ id, first, gap:[min,max], duration, init?(E,env,rng), draw(ctx,env,u,age,E) }] — dibuja UNA a la vez y deja
// pasar tiempo entre una y otra (como la fauna de la Carrera original). u = progreso 0..1.
export function eventScheduler(defs, rng, { cooldown = [2.5, 6] } = {}) {
  const next = {}
  defs.forEach((d, i) => (next[d.id] = d.first ?? 3 + i * 2))
  let active = null
  let clock = 0
  let idle = 0
  let turn = 0
  return {
    update(dt, env) {
      clock += dt
      if (!active) {
        idle += dt
        // La que lleva más tiempo esperando y ya le toca (turnos, no azar puro: variedad garantizada).
        const ready = defs.filter((d) => clock >= next[d.id])
        if (ready.length && idle >= 0) {
          const d = ready[turn++ % ready.length]
          const E = { def: d, start: clock, seed: rng(), dir: rng() < 0.5 ? 1 : -1 }
          if (d.init) d.init(E, env, rng)
          active = E
        }
      } else {
        const d = active.def
        if (clock - active.start >= d.duration) {
          next[d.id] = clock + rng.range(d.gap[0], d.gap[1])
          idle = -rng.range(cooldown[0], cooldown[1])
          active = null
        }
      }
    },
    draw(ctx, env) {
      if (!active) return
      const d = active.def
      const age = clock - active.start
      d.draw(ctx, env, clamp(age / d.duration, 0, 1), age, active)
    },
    reset() {
      active = null
      clock = 0
      idle = 0
    },
  }
}

// Destello de brillo (estrellita de cuatro puntas) para escarcha, purpurina, luces…
export function glint(x, y, r, col, alpha = 1) {
  c.save()
  c.globalAlpha *= alpha
  c.fillStyle = col
  c.beginPath()
  c.moveTo(x, y - r)
  c.quadraticCurveTo(x + r * 0.16, y - r * 0.16, x + r, y)
  c.quadraticCurveTo(x + r * 0.16, y + r * 0.16, x, y + r)
  c.quadraticCurveTo(x - r * 0.16, y + r * 0.16, x - r, y)
  c.quadraticCurveTo(x - r * 0.16, y - r * 0.16, x, y - r)
  c.fill()
  c.restore()
}
