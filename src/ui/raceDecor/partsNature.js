// Piezas de naturaleza para las decoraciones: hojas, nieve, flores, bichitos, aves, setas, ardilla, sol, nube, arcoíris.
// Todas se dibujan en el origen (0,0), mirando a la derecha y «de pie» sobre y=0 (lo que sube va hacia −y), con la
// misma técnica plana de la Carrera (elipses y círculos, sin contornos). La escala la pone quien las usa.
import { TAU, at, circle, curve, ellipse, glint, line, poly, rounded, setCtx, star, ctx2d } from './toolkit.js'

export const AUTUMN = ['#e8742b', '#d9482b', '#f2b73f', '#b9552d', '#d99a2b', '#c4472f']
export const AUTUMN_GOLD = ['#f2b73f', '#f6c95a', '#e89a2c', '#d9822b']

// ---------------------------------------------------------------------------------------------- hojas
export function mapleLeaf(col, vein = 'rgba(120,50,20,.45)') {
  poly(
    [[0, -11], [2.5, -6.5], [7, -8.5], [5.6, -2.4], [11, -1], [6.2, 3], [8, 8.5], [2.2, 5.6], [1.2, 11], [-1.2, 11], [-2.2, 5.6], [-8, 8.5], [-6.2, 3], [-11, -1], [-5.6, -2.4], [-7, -8.5], [-2.5, -6.5]],
    col,
  )
  line(0, 9, 0, -7, vein, 1)
  line(0, 2, 5, -2, vein, 0.8)
  line(0, 2, -5, -2, vein, 0.8)
  line(0, 11, 0, 14, '#8a5a2f', 1.4)
}
export function oakLeaf(col, vein = 'rgba(110,60,20,.4)') {
  ellipse(0, 0, 5.6, 9.6, col)
  ellipse(-4, -3, 3, 3.4, col)
  ellipse(4, 2, 3, 3.4, col)
  ellipse(-4, 4, 3, 3.2, col)
  ellipse(4, -4, 3, 3.2, col)
  line(0, 9, 0, -8, vein, 1)
  line(0, 11, 0, 14, '#8a5a2f', 1.3)
}
export function teardropLeaf(col, vein = 'rgba(90,50,20,.4)') {
  const c = ctx2d()
  c.fillStyle = col
  c.beginPath()
  c.moveTo(0, -10)
  c.quadraticCurveTo(9, -2, 0, 10)
  c.quadraticCurveTo(-9, -2, 0, -10)
  c.fill()
  line(0, 9, 0, -6, vein, 1)
}
export function leafKind(kind, col) {
  if (kind === 0) mapleLeaf(col)
  else if (kind === 1) oakLeaf(col)
  else teardropLeaf(col)
}

// ---------------------------------------------------------------------------------------------- nieve
export function snowflakeDot(col = '#fff') {
  circle(0, 0, 3, col)
}
export function snowCrystal(col = '#fff') {
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3
    const x = Math.cos(a) * 6
    const y = Math.sin(a) * 6
    line(-x, -y, x, y, col, 1.4)
    for (const s of [-1, 1]) {
      const bx = Math.cos(a) * 3.4 * s
      const by = Math.sin(a) * 3.4 * s
      line(bx, by, bx + Math.cos(a + 0.9) * 2.2 * s, by + Math.sin(a + 0.9) * 2.2 * s, col, 1)
      line(bx, by, bx + Math.cos(a - 0.9) * 2.2 * s, by + Math.sin(a - 0.9) * 2.2 * s, col, 1)
    }
  }
}

// ---------------------------------------------------------------------------------------------- flores
export function daisy(petal = '#fff', center = '#f0c33a', sway = 0, h = 14) {
  const c = ctx2d()
  line(0, 0, sway, -h, '#3b9a4a', 1.6)
  ellipse(sway * 0.4 + 3, -h * 0.4, 3.4, 1.7, '#4caf55', -0.5)
  const hx = sway
  const hy = -h
  for (let k = 0; k < 8; k++) {
    const a = (k * TAU) / 8
    ellipse(hx + Math.cos(a) * 3.6, hy + Math.sin(a) * 3.6, 2.6, 1.5, petal, a)
  }
  circle(hx, hy, 2.4, center)
  void c
}
export function tulip(col = '#ef5f7e', sway = 0, h = 17) {
  line(0, 0, sway, -h, '#3b9a4a', 1.8)
  ellipse(-3.5 + sway * 0.3, -h * 0.35, 1.8, 6, '#4caf55', -0.4)
  ellipse(3.5 + sway * 0.3, -h * 0.3, 1.8, 5, '#4caf55', 0.4)
  const hx = sway
  const hy = -h
  ellipse(hx - 2, hy - 1, 2.6, 4.6, col, -0.2)
  ellipse(hx + 2, hy - 1, 2.6, 4.6, col, 0.2)
  ellipse(hx, hy - 2, 2.4, 5, col)
}
export function poppy(col = '#e84b3c', sway = 0, h = 15) {
  line(0, 0, sway, -h, '#3b9a4a', 1.5)
  const hx = sway
  const hy = -h
  circle(hx - 2.6, hy, 4, col)
  circle(hx + 2.6, hy, 4, col)
  circle(hx, hy - 2.6, 4, col)
  circle(hx, hy + 1.8, 3.6, col)
  circle(hx, hy, 1.8, '#3a2a2a')
}
export function sunflower(sway = 0, h = 30) {
  line(0, 0, sway, -h, '#3f9b4a', 2.4)
  ellipse(-5 + sway * 0.2, -h * 0.4, 4.4, 2.2, '#4caf55', -0.6)
  ellipse(5 + sway * 0.2, -h * 0.55, 4.4, 2.2, '#4caf55', 0.6)
  const hx = sway
  const hy = -h
  for (let k = 0; k < 14; k++) {
    const a = (k * TAU) / 14
    ellipse(hx + Math.cos(a) * 7, hy + Math.sin(a) * 7, 4.4, 2.1, '#f6bf24', a)
  }
  circle(hx, hy, 5.2, '#7a4a22')
  circle(hx - 1.2, hy - 1.2, 2, '#9a6030')
}
export function blossom(col = '#ffc0d4', center = '#f2a2bd', r = 4) {
  for (let k = 0; k < 5; k++) {
    const a = (k * TAU) / 5
    circle(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7, r * 0.62, col)
  }
  circle(0, 0, r * 0.35, center)
}
export function petal(col = '#ffc0d4') {
  ellipse(0, 0, 2.8, 4.6, col, 0.3)
  ellipse(-0.6, -0.8, 1.2, 2.4, 'rgba(255,255,255,.45)', 0.3)
}

// ---------------------------------------------------------------------------------------------- bichitos y aves
export function butterfly(c1 = '#ee92d4', c2 = '#f8c7e9', t = 0) {
  const w = 5 + Math.abs(Math.sin(t * 9)) * 9
  ellipse(-w * 0.55, -4, w * 0.75, 9, c1)
  ellipse(w * 0.55, -4, w * 0.75, 9, c1)
  ellipse(-w * 0.5, 5, w * 0.55, 5.4, c2)
  ellipse(w * 0.5, 5, w * 0.55, 5.4, c2)
  line(0, -6, 0, 8, '#6b4a62', 2)
  line(0, -6, -2.6, -11, '#6b4a62', 0.9)
  line(0, -6, 2.6, -11, '#6b4a62', 0.9)
}
export function smallBird(t = 0, body = '#4e93bb', belly = '#f0d8ad') {
  const flap = Math.sin(t * 13)
  ellipse(0, 0, 8, 4.6, body)
  ellipse(1, 2.4, 5.5, 2.2, belly)
  circle(6, -1.6, 3.6, body)
  circle(7.2, -2.4, 0.8, '#12222c')
  poly([[9.4, -1.8], [13, -0.8], [9.4, 0]], '#dca34b')
  poly([[-7, 0], [-14, -1.2], [-12, 2.4]], '#2f6f99')
  ellipse(-1, -2 - flap * 4, 5, 3.4 + Math.abs(flap) * 3.2, '#3684b1', -0.3 + flap * 0.5)
}
export function bee(t = 0) {
  const flap = Math.abs(Math.sin(t * 40))
  ellipse(-1, -4, 3.6, 2 + flap * 2.6, 'rgba(235,248,255,.85)', -0.5)
  ellipse(2, -4.2, 3.6, 2 + flap * 2.6, 'rgba(235,248,255,.85)', 0.4)
  ellipse(0, 0, 6, 4.2, '#f6c21c')
  const c = ctx2d()
  c.save()
  c.beginPath()
  c.ellipse(0, 0, 6, 4.2, 0, 0, TAU)
  c.clip()
  rounded(-3, -5, 2, 10, 0, '#33281c')
  rounded(1, -5, 2, 10, 0, '#33281c')
  c.restore()
  circle(5.4, -0.6, 2.6, '#33281c')
  circle(6.2, -1.2, 0.7, '#fff')
  poly([[-6, 0], [-9, -0.6], [-9, 0.6]], '#33281c')
}
export function ladybug(legT = 0) {
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) line(-2 + i * 2.6, 1, -3 + i * 2.6 + s * 0 + Math.sin(legT + i) * 1.1, 3.4, '#2a2a2a', 0.8)
  const c = ctx2d()
  c.save()
  c.beginPath()
  c.ellipse(0, -0.5, 5.6, 4.4, 0, 0, TAU)
  c.clip()
  circle(0, -0.5, 6, '#e63a2e')
  line(0, -5, 0, 4, '#2a2a2a', 0.9)
  circle(-2.4, -1.8, 1, '#2a2a2a')
  circle(2.4, -1.8, 1, '#2a2a2a')
  circle(-2.6, 1.6, 0.9, '#2a2a2a')
  circle(2.6, 1.6, 0.9, '#2a2a2a')
  c.restore()
  circle(5.2, -0.4, 2.2, '#2a2a2a')
}
export function snail(shell = '#e7b777', body = '#d7ad89', t = 0) {
  ellipse(0, -1, 9, 2.6, body)
  circle(8, -3, 2.6, body)
  line(8.4, -5, 10.4 + Math.sin(t * 3) * 0.8, -9, body, 1)
  line(7.4, -5, 8 + Math.sin(t * 3 + 1) * 0.8, -9.4, body, 1)
  circle(-1.5, -6, 6.2, shell)
  circle(-1.5, -6, 3.8, 'rgba(160,100,60,.45)')
  circle(-1.5, -6, 1.6, shell)
}
export function mushroom(cap = '#e04a3a', dots = '#fff', stem = '#f6ecda') {
  rounded(-2.2, -8, 4.4, 8, 2, stem)
  ellipse(0, -8, 8.4, 5.4, cap)
  ellipse(0, -5.5, 8.6, 1.4, 'rgba(255,255,255,.18)')
  circle(-3, -9.4, 1.3, dots)
  circle(2.4, -10.4, 1.5, dots)
  circle(4.6, -7.8, 1, dots)
}
export function acorn() {
  ellipse(0, 0, 3.4, 4.2, '#c98b45')
  ellipse(0, -3, 4, 2.2, '#7a5230')
  line(0, -5, 0, -6.6, '#7a5230', 1)
}

// ---------------------------------------------------------------------------------------------- ardilla (se sienta y mordisquea una bellota)
export function squirrel(t = 0, mode = 'run') {
  const run = mode === 'run'
  const bob = run ? Math.abs(Math.sin(t * 9)) * 2.4 : 0
  // cola esponjosa
  const wag = Math.sin(t * (run ? 9 : 2.4)) * (run ? 0.12 : 0.22)
  at(-9, -9 - bob, 1, () => {
    ellipse(0, -8, 5.5, 12, '#c8702d', wag)
    ellipse(0.5, -12, 3.6, 7.5, '#e7a35d', wag)
  })
  // cuerpo
  ellipse(0, -8 - bob, 9, 6.4, '#b8602a')
  ellipse(2, -6 - bob, 5.6, 3.8, '#f3d9b0')
  // patas
  if (run) {
    const s = Math.sin(t * 9)
    ellipse(-4 + s * 2, -2 - bob * 0.3, 4.2, 2, '#9a4d22')
    ellipse(5 - s * 2, -2 - bob * 0.3, 3.6, 1.8, '#9a4d22')
  } else {
    ellipse(-4, -2, 5, 2.4, '#9a4d22')
    ellipse(5, -3, 2.6, 2.8, '#c8702d')
  }
  // cabeza
  circle(8, -14 - bob, 5, '#b8602a')
  ellipse(10, -12.4 - bob, 2.6, 2, '#f3d9b0')
  circle(11.4, -13 - bob, 0.9, '#2a1a10')
  circle(8.6, -15.4 - bob, 0.9, '#2a1a10')
  ellipse(6.2, -19 - bob, 1.9, 3.4, '#b8602a', -0.2)
  ellipse(10, -19.4 - bob, 1.9, 3.4, '#b8602a', 0.2)
  if (!run) at(11.6, -8, 0.95, () => acorn(), 0.4)
}

// ---------------------------------------------------------------------------------------------- cielo
export function sun(t = 0, r = 26) {
  const c = ctx2d()
  const pulse = 1 + Math.sin(t * 1.4) * 0.04
  const g = c.createRadialGradient(0, 0, 2, 0, 0, r * 2.6)
  g.addColorStop(0, 'rgba(255,238,160,.55)')
  g.addColorStop(1, 'rgba(255,238,160,0)')
  c.fillStyle = g
  c.beginPath()
  c.arc(0, 0, r * 2.6, 0, TAU)
  c.fill()
  c.save()
  c.rotate(t * 0.18)
  for (let i = 0; i < 12; i++) {
    c.save()
    c.rotate((i * TAU) / 12)
    ellipse(r * 1.42 * pulse, 0, r * (i % 2 ? 0.22 : 0.36), r * 0.1, '#ffd34a')
    c.restore()
  }
  c.restore()
  circle(0, 0, r, '#ffd84d')
  circle(-r * 0.2, -r * 0.2, r * 0.7, '#ffe27a')
  // carita alegre
  circle(-r * 0.3, -r * 0.1, r * 0.09, '#8a5a1f')
  circle(r * 0.3, -r * 0.1, r * 0.09, '#8a5a1f')
  ellipse(-r * 0.5, r * 0.18, r * 0.14, r * 0.09, 'rgba(255,140,100,.55)')
  ellipse(r * 0.5, r * 0.18, r * 0.14, r * 0.09, 'rgba(255,140,100,.55)')
  curve([[-r * 0.28, r * 0.2], [-r * 0.1, r * 0.38], [r * 0.1, r * 0.38], [r * 0.28, r * 0.2]], '#8a5a1f', Math.max(1.2, r * 0.07))
}
export function cloud(col = '#fff', shade = 'rgba(120,150,190,.18)') {
  ellipse(0, 3, 24, 8, shade)
  ellipse(-12, -1, 13, 9, col)
  ellipse(2, -6, 15, 12, col)
  ellipse(15, -1, 12, 8, col)
  ellipse(2, 3, 24, 7, col)
}
export function rainCloud() {
  cloud('#aab6c8', 'rgba(70,90,120,.25)')
  ellipse(2, -8, 9, 5, 'rgba(255,255,255,.18)')
}
export function rainbow(cx, cy, r, alpha) {
  const c = ctx2d()
  const cols = ['#ff6b6b', '#ffa94d', '#ffe066', '#69db7c', '#4dabf7', '#9775fa']
  c.save()
  c.globalAlpha *= alpha
  c.lineCap = 'butt'
  const w = Math.max(3, r * 0.075)
  cols.forEach((col, i) => {
    c.strokeStyle = col
    c.lineWidth = w + 0.6
    c.beginPath()
    c.arc(cx, cy, r - i * w, Math.PI, TAU)
    c.stroke()
  })
  c.restore()
}
export function raindrop(len = 8, col = 'rgba(120,170,225,.75)') {
  line(0, -len / 2, -len * 0.18, len / 2, col, 1.4)
}
export function puddle(w, ripple = 0, col = 'rgba(120,175,225,.62)') {
  ellipse(0, 0, w, w * 0.22, col)
  ellipse(-w * 0.28, -w * 0.04, w * 0.42, w * 0.07, 'rgba(255,255,255,.45)')
  if (ripple > 0) {
    const c = ctx2d()
    c.strokeStyle = `rgba(255,255,255,${0.55 * (1 - ripple)})`
    c.lineWidth = 1
    c.beginPath()
    c.ellipse(0, 0, w * 0.25 + w * 0.5 * ripple, (w * 0.25 + w * 0.5 * ripple) * 0.24, 0, 0, TAU)
    c.stroke()
  }
}
export function gust(len, t) {
  // remolino de viento: curva con espiral al final
  const c = ctx2d()
  c.strokeStyle = 'rgba(255,255,255,.78)'
  c.lineWidth = 2.2
  c.lineCap = 'round'
  c.beginPath()
  c.moveTo(0, 0)
  c.bezierCurveTo(len * 0.3, -6, len * 0.6, 6, len, 0)
  c.stroke()
  c.beginPath()
  for (let a = 0; a < 9; a += 0.25) {
    const rr = 1.5 + a * 1.6
    const x = len + Math.cos(a + t * 4) * rr
    const y = Math.sin(a + t * 4) * rr * 0.8
    if (a === 0) c.moveTo(x, y)
    else c.lineTo(x, y)
  }
  c.stroke()
}
export { glint, star, setCtx }

// ---------------------------------------------------------------------------------------------- pajarillos de invierno
// Petirrojo (pecho naranja) y gorrión: sustituyen a la mariposa del paisaje en los meses fríos.
export function robin(t = 0) {
  const flap = Math.sin(t * 13)
  ellipse(0, 0, 7.6, 4.6, '#7a5a3f')
  ellipse(1.6, 1.6, 5.2, 3.2, '#f0763a')
  circle(6, -1.4, 3.6, '#7a5a3f')
  ellipse(7.2, -0.2, 2.4, 2.2, '#f0763a')
  circle(7.2, -2.2, 0.8, '#1d1612')
  poly([[9.4, -1.8], [12.6, -0.8], [9.4, 0]], '#e0b04a')
  poly([[-7, 0.2], [-13.4, -1.2], [-12, 2.6]], '#5a412c')
  ellipse(-1, -2 - flap * 4, 4.8, 3.2 + Math.abs(flap) * 3.2, '#8a6a4a', -0.3 + flap * 0.5)
}
export function sparrow(t = 0) {
  const flap = Math.sin(t * 14)
  ellipse(0, 0, 7.4, 4.4, '#9a7a56')
  ellipse(1, 1.8, 5, 2.8, '#e8dcc4')
  circle(5.8, -1.4, 3.5, '#8a6a46')
  ellipse(5.4, -3.4, 3.2, 1.3, '#6b4a2a')
  circle(7, -2, 0.8, '#1d1612')
  poly([[9, -1.6], [12, -0.6], [9, 0.2]], '#d9a84a')
  poly([[-7, 0.2], [-13, -1], [-11.6, 2.6]], '#6b4a2a')
  ellipse(-1, -2 - flap * 4, 4.6, 3.2 + Math.abs(flap) * 3.2, '#a8875e', -0.3 + flap * 0.5)
}

// ---------------------------------------------------------------------------------------------- búho (la figura de la propuesta, a escala de árbol)
// Mismo dibujo que gustó: cuerpo pardo, barriga crema, ojos grandes y pico naranja. Se posa sobre una rama (y=0 = patas).
export function owl(t = 0) {
  const bob = Math.sin(t * 0.7) * 0.8
  const blink = Math.sin(t * 0.9) > 0.97 ? 0.15 : 1
  ellipse(0, -30 + bob, 22, 26, '#a66a3b')
  ellipse(0, -24 + bob, 16, 18, '#e9bb77')
  ellipse(-10, -43 + bob, 11, 11 * blink + 1, '#fff2d4')
  ellipse(10, -43 + bob, 11, 11 * blink + 1, '#fff2d4')
  circle(-10, -43 + bob, 4 * blink + 0.4, '#473626')
  circle(10, -43 + bob, 4 * blink + 0.4, '#473626')
  poly([[-5, -33 + bob], [5, -33 + bob], [0, -25 + bob]], '#edaa40')
  poly([[-17, -52 + bob], [-9, -50 + bob], [-15, -44 + bob]], '#8a5530')
  poly([[17, -52 + bob], [9, -50 + bob], [15, -44 + bob]], '#8a5530')
  line(-12, -8, -12, -1, '#85522d', 3)
  line(12, -8, 12, -1, '#85522d', 3)
}

// ---------------------------------------------------------------------------------------------- flores de invierno / febrero
export function snowdrop(sway = 0, h = 13) {
  // campanilla de invierno (Galanthus): flor blanca colgante
  line(0, 0, sway, -h, '#3b9a4a', 1.4)
  ellipse(-2.4, -2, 1, 5, '#4caf55', -0.25)
  ellipse(2.4, -2, 1, 5, '#4caf55', 0.25)
  const hx = sway + 1.4
  const hy = -h + 3
  line(sway, -h, hx, hy - 1, '#3b9a4a', 1)
  ellipse(hx, hy + 2.4, 2.2, 3.4, '#fff')
  ellipse(hx - 1.6, hy + 3, 1.2, 2.6, '#f4f9ff', 0.3)
  ellipse(hx + 1.6, hy + 3, 1.2, 2.6, '#f4f9ff', -0.3)
  circle(hx, hy + 5, 0.8, '#9ccf86')
}
export function crocus(col = '#9b6bd8', sway = 0, h = 11) {
  ellipse(-2, -3, 0.9, 5.4, '#4caf55', -0.3)
  ellipse(2, -3, 0.9, 5.4, '#4caf55', 0.3)
  ellipse(sway - 1.8, -h, 1.9, 4.4, col, -0.2)
  ellipse(sway + 1.8, -h, 1.9, 4.4, col, 0.2)
  ellipse(sway, -h - 0.8, 2, 4.8, col)
  line(sway, -h + 1, sway, -h + 3, '#f0a02a', 1)
}
export function narcissus(sway = 0, h = 17) {
  // narciso: seis pétalos amarillos y trompeta naranja
  line(0, 0, sway, -h, '#3b9a4a', 1.6)
  ellipse(-3, -4, 1.2, 7, '#4caf55', -0.3)
  ellipse(3, -3, 1.2, 6.4, '#4caf55', 0.3)
  const hx = sway
  const hy = -h
  for (let k = 0; k < 6; k++) {
    const a = (k * TAU) / 6
    ellipse(hx + Math.cos(a) * 3.8, hy + Math.sin(a) * 3.8, 3, 1.8, '#ffe14a', a)
  }
  ellipse(hx + 1.2, hy, 2.4, 2, '#f6a22a')
  ellipse(hx + 2.4, hy, 0.8, 1.6, '#c97a1a')
}
export function poinsettia(t = 0, sway = 0) {
  // flor de Pascua: brácteas rojas en estrella con hojas verdes y centro amarillo
  line(0, 0, sway * 0.4, -5, '#3b8a4a', 1.8)
  for (let k = 0; k < 6; k++) {
    const a = (k * TAU) / 6 + 0.3
    ellipse(Math.cos(a) * 5.4, -9 + Math.sin(a) * 3.4, 5.4, 2.1, k % 2 ? '#2f8a4c' : '#379a56', a)
  }
  for (let k = 0; k < 7; k++) {
    const a = (k * TAU) / 7 + t * 0.05
    ellipse(Math.cos(a) * 4.2, -9.4 + Math.sin(a) * 2.8, 4.6, 1.9, k % 2 ? '#d9242c' : '#e8363f', a)
  }
  circle(0, -9.4, 1.8, '#f6c32d')
  circle(-0.9, -9.8, 0.5, '#e8932b')
  circle(1, -9, 0.5, '#e8932b')
}
export function almondBlossom(r = 4) {
  // flor de almendro: pétalos blanco-rosados con el centro rosa fuerte
  for (let k = 0; k < 5; k++) {
    const a = (k * TAU) / 5
    circle(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, r * 0.62, k % 2 ? '#fff' : '#ffe3ec')
  }
  circle(0, 0, r * 0.36, '#f08aa8')
}
