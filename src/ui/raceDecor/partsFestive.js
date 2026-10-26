// Piezas festivas y temáticas: muñecos de nieve, regalos, árboles de Navidad, calabazas, fantasmas, murciélagos,
// máscaras, globos, cometas, material escolar, helados, playa, sandía, avioncitos de papel y el trineo de Papá Noel.
// Mismas reglas que partsNature.js: origen (0,0), mirando a la derecha, de pie sobre y=0, estilo plano.
import { TAU, at, circle, curve, ellipse, glint, line, poly, rounded, star, ctx2d } from './toolkit.js'

// ---------------------------------------------------------------------------------------------- invierno
export function snowman(t = 0, scarf = '#e0453a', hat = '#33406b', wave = false) {
  ellipse(0, -1, 12, 3, 'rgba(140,170,210,.25)')
  circle(0, -9, 10, '#fff')
  circle(-2, -11, 7, 'rgba(225,238,255,.7)')
  circle(0, -24, 7.6, '#fff')
  circle(-1.6, -25.6, 5.2, 'rgba(225,238,255,.7)')
  // brazos
  const a = wave ? Math.sin(t * 6) * 0.35 : 0
  line(-6, -14, -15, -19 + a * 8, '#7a5230', 1.6)
  line(6, -14, 15, -18 - a * 8, '#7a5230', 1.6)
  line(-15, -19 + a * 8, -17.5, -22 + a * 8, '#7a5230', 1)
  // carita
  circle(-2.6, -25.6, 0.95, '#2a2a33')
  circle(2.6, -25.6, 0.95, '#2a2a33')
  poly([[0, -24.2], [6.6, -23.2], [0, -22.4]], '#ee8a2e')
  for (let i = 0; i < 5; i++) circle(Math.cos(0.5 + i * 0.55) * 4.2, -21.4 + Math.sin(0.5 + i * 0.55) * 1.4, 0.55, '#2a2a33')
  // botones, bufanda y sombrero
  circle(0, -11, 1.1, '#2a2a33')
  circle(0, -7, 1.1, '#2a2a33')
  rounded(-7, -19.6, 14, 3.2, 1.6, scarf)
  rounded(3.4, -19, 3.2, 8, 1.4, scarf)
  rounded(-5.4, -33.4, 10.8, 6, 1.4, hat)
  rounded(-8, -31, 16, 2.4, 1.2, hat)
  rounded(-5.4, -29.6, 10.8, 1.2, 0, '#e0b83a')
}
export function snowPatch(w) {
  ellipse(0, 0, w, w * 0.2, 'rgba(255,255,255,.95)')
  ellipse(-w * 0.2, -w * 0.05, w * 0.6, w * 0.1, 'rgba(255,255,255,1)')
  ellipse(w * 0.1, w * 0.04, w * 0.7, w * 0.07, 'rgba(205,225,250,.55)')
}
export function snowCap(rx, ry) {
  ellipse(0, 0, rx, ry, 'rgba(255,255,255,.95)')
  ellipse(-rx * 0.3, ry * 0.5, rx * 0.35, ry * 0.5, 'rgba(255,255,255,.95)')
  ellipse(rx * 0.35, ry * 0.45, rx * 0.3, ry * 0.45, 'rgba(255,255,255,.95)')
  ellipse(-rx * 0.1, -ry * 0.2, rx * 0.5, ry * 0.45, '#fff')
}
export function gift(body = '#e0453a', ribbon = '#ffd24a', bowT = 0) {
  rounded(-8, -12, 16, 12, 1.6, body)
  rounded(-9, -15, 18, 4.4, 1.6, body)
  rounded(-1.6, -15, 3.2, 15, 0, ribbon)
  rounded(-9, -13.6, 18, 1.8, 0, 'rgba(255,255,255,.18)')
  const k = 1 + Math.sin(bowT * 3) * 0.04
  ellipse(-3.6, -17.4, 3.8 * k, 2.4, ribbon, -0.4)
  ellipse(3.6, -17.4, 3.8 * k, 2.4, ribbon, 0.4)
  circle(0, -16.2, 1.5, ribbon)
}
export function xmasTree(t = 0, phase = 0) {
  rounded(-2.4, -5, 4.8, 5, 1, '#7a5230')
  const tiers = [[-4, 15, 14], [-13, 12, 11.4], [-21.4, 9.4, 9]]
  tiers.forEach(([y, hw, h], i) => poly([[0, y - h], [-hw, y], [hw, y]], i % 2 ? '#2f8a4c' : '#379a56'))
  // nieve en las ramas
  ellipse(-7, -3.6, 4.4, 1.6, 'rgba(255,255,255,.85)')
  ellipse(6, -12, 3.6, 1.4, 'rgba(255,255,255,.85)')
  // estrella
  star(0, -32, 4.4, 2, 5, '#ffd24a', 0.2 + Math.sin(t * 2) * 0.1)
  glint(0, -32, 7 + Math.sin(t * 3 + phase) * 1.6, 'rgba(255,238,160,.8)', 0.7)
  // bolas y luces que parpadean
  const bulbs = [[-6, -6, '#e0453a'], [6, -7, '#4dabf7'], [0, -12, '#ffd24a'], [-5, -15, '#e0453a'], [5.4, -17, '#ffd24a'], [-2, -23, '#4dabf7'], [2.4, -26, '#e0453a']]
  bulbs.forEach(([x, y, col], i) => {
    const on = 0.5 + 0.5 * Math.sin(t * 3 + phase + i * 1.7)
    circle(x, y, 2, col)
    if (on > 0.55) glint(x, y, 3.4 * on, 'rgba(255,255,255,.9)', 0.9)
  })
}
export function lightsGarland(x0, x1, yAt, t, step = 26, sag = 8) {
  const c = ctx2d()
  const cols = ['#ff5a5f', '#ffd24a', '#4dabf7', '#69db7c', '#ff9ff3']
  c.strokeStyle = '#2f3a2f'
  c.lineWidth = 1.4
  c.beginPath()
  const pts = []
  for (let x = x0; x <= x1; x += 4) {
    const u = (x - x0) / (x1 - x0)
    const y = yAt(x) + Math.sin(u * Math.PI * (Math.round((x1 - x0) / step / 2))) * sag * 0.0 + Math.abs(Math.sin(((x - x0) / step) * Math.PI)) * sag
    pts.push([x, y])
    if (x === x0) c.moveTo(x, y)
    else c.lineTo(x, y)
  }
  c.stroke()
  let i = 0
  for (let x = x0 + step / 2; x <= x1; x += step) {
    const y = yAt(x) + Math.abs(Math.sin(((x - x0) / step) * Math.PI)) * sag
    const on = 0.45 + 0.55 * Math.max(0, Math.sin(t * 2.4 + i * 1.3))
    const col = cols[i % cols.length]
    line(x, y - 0.5, x, y + 2.4, '#2f3a2f', 1.2)
    ellipse(x, y + 5, 2.4, 3.4, col)
    c.save()
    c.globalAlpha *= 0.25 + 0.5 * on
    circle(x, y + 5, 6.4, col)
    c.restore()
    glint(x - 0.8, y + 4, 1.6, 'rgba(255,255,255,.9)', on)
    i++
  }
}

// ---------------------------------------------------------------------------------------------- Halloween
export function pumpkin(t = 0, glow = 0.7, face = 0) {
  const c = ctx2d()
  ellipse(0, -1, 12, 3, 'rgba(40,20,40,.18)')
  ellipse(-6, -8, 7.4, 8.6, '#e8761f')
  ellipse(6, -8, 7.4, 8.6, '#e8761f')
  ellipse(0, -8, 7, 9, '#f58a2a')
  line(-3.6, -15, -4.4, -2, 'rgba(180,80,10,.35)', 1)
  line(3.6, -15, 4.4, -2, 'rgba(180,80,10,.35)', 1)
  rounded(-1.4, -19.6, 3, 5, 1.2, '#5b7f32')
  curve([[1.4, -18], [4, -20], [6, -18]], '#5b7f32', 1.2)
  // cara: ojos y boca encendidos por dentro
  c.save()
  c.globalAlpha *= 0.35 + 0.65 * glow
  const g = '#ffe27a'
  poly([[-6.4, -11], [-2.2, -11], [-4.3, -14.6]], g)
  poly([[2.2, -11], [6.4, -11], [4.3, -14.6]], g)
  if (face === 0) {
    c.fillStyle = g
    c.beginPath()
    c.moveTo(-6.4, -6.2)
    c.quadraticCurveTo(0, -1.4, 6.4, -6.2)
    c.quadraticCurveTo(0, -4.2, -6.4, -6.2)
    c.fill()
  } else {
    rounded(-5.6, -7.4, 11.2, 3.4, 1.6, g)
    rounded(-1.6, -7.8, 3.2, 1.6, 0, '#f58a2a')
  }
  c.restore()
  circle(-1, -9, 14, 'rgba(255,200,80,' + 0.06 * glow + ')')
  void t
}
export function ghost(t = 0, alpha = 1) {
  const c = ctx2d()
  c.save()
  c.globalAlpha *= alpha
  const wob = Math.sin(t * 3) * 1.6
  c.fillStyle = 'rgba(255,255,255,.95)'
  c.beginPath()
  c.moveTo(-9, 0 + wob)
  c.quadraticCurveTo(-11, -20, 0, -21)
  c.quadraticCurveTo(11, -20, 9, 0 + wob)
  for (let i = 0; i < 4; i++) {
    const x = 9 - (i + 1) * 4.5
    c.quadraticCurveTo(9 - i * 4.5 - 2.25, 4 + wob + (i % 2 ? 2 : -1), x, 0 + wob + (i % 2 ? 0 : 1.4))
  }
  c.closePath()
  c.fill()
  ellipse(-4, -9 + wob * 0.2, 4, 7, 'rgba(210,225,250,.45)')
  circle(-3.2, -13, 1.9, '#33334a')
  circle(3.2, -13, 1.9, '#33334a')
  circle(-2.8, -13.6, 0.6, '#fff')
  circle(3.6, -13.6, 0.6, '#fff')
  ellipse(0, -8.6, 2.2, 2.8 + Math.sin(t * 3) * 0.4, '#33334a')
  ellipse(-6.6, -9.4, 1.8, 1.1, 'rgba(255,150,170,.5)')
  ellipse(6.6, -9.4, 1.8, 1.1, 'rgba(255,150,170,.5)')
  // bracitos
  ellipse(-10, -7 + Math.sin(t * 5) * 1.6, 3.2, 2, 'rgba(255,255,255,.95)', 0.5)
  ellipse(10, -7 - Math.sin(t * 5) * 1.6, 3.2, 2, 'rgba(255,255,255,.95)', -0.5)
  c.restore()
}
export function bat(t = 0, col = '#3b2a55') {
  const flap = Math.sin(t * 16)
  const wy = -3 - flap * 6
  const c = ctx2d()
  c.fillStyle = col
  for (const s of [-1, 1]) {
    c.beginPath()
    c.moveTo(s * 2, -1)
    c.quadraticCurveTo(s * 9, wy - 8, s * 18, wy - 3)
    c.quadraticCurveTo(s * 14, wy + 1, s * 12, wy + 3)
    c.quadraticCurveTo(s * 9, wy, s * 6, wy + 4)
    c.quadraticCurveTo(s * 4, 2, s * 2, 3)
    c.fill()
  }
  ellipse(0, 1, 4.4, 5.4, col)
  circle(0, -4, 3.6, col)
  poly([[-3.4, -6], [-2.4, -10], [-0.8, -6.4]], col)
  poly([[3.4, -6], [2.4, -10], [0.8, -6.4]], col)
  circle(-1.5, -4.2, 0.9, '#ffe27a')
  circle(1.5, -4.2, 0.9, '#ffe27a')
  rounded(-1.4, -2.2, 0.8, 1.2, 0, '#fff')
  rounded(0.6, -2.2, 0.8, 1.2, 0, '#fff')
}
export function spider(t = 0) {
  const c = ctx2d()
  circle(0, 0, 5.2, '#2d2540')
  circle(0, -6, 3.4, '#2d2540')
  circle(-1.2, -6.6, 1, '#fff')
  circle(1.2, -6.6, 1, '#fff')
  circle(-1.1, -6.5, 0.45, '#222')
  circle(1.3, -6.5, 0.45, '#222')
  c.strokeStyle = '#2d2540'
  c.lineWidth = 1.2
  c.lineCap = 'round'
  for (const s of [-1, 1])
    for (let i = 0; i < 4; i++) {
      const k = Math.sin(t * 4 + i) * 1.2
      c.beginPath()
      c.moveTo(s * 3.6, -1 + i * 1.2)
      c.quadraticCurveTo(s * 9, -6 + i * 3 + k, s * 11, 2 + i * 3 + k)
      c.stroke()
    }
}
export function cobweb(r, col = 'rgba(255,255,255,.55)') {
  // telaraña en una esquina (cuarto de círculo), esquina en el origen, abre hacia +x +y
  const c = ctx2d()
  c.strokeStyle = col
  c.lineWidth = 1
  c.lineCap = 'round'
  for (let i = 0; i <= 4; i++) {
    const a = (i * Math.PI) / 8
    c.beginPath()
    c.moveTo(0, 0)
    c.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    c.stroke()
  }
  for (let k = 1; k <= 4; k++) {
    const rr = (r * k) / 4.4
    c.beginPath()
    for (let i = 0; i <= 4; i++) {
      const a = (i * Math.PI) / 8
      const sag = i > 0 && i < 4 ? 0.88 : 1
      const x = Math.cos(a) * rr * sag
      const y = Math.sin(a) * rr * sag
      if (i === 0) c.moveTo(x, y)
      else c.lineTo(x, y)
    }
    c.stroke()
  }
}
export function candy(c1 = '#ff7f9e', c2 = '#ffd76c') {
  ellipse(0, 0, 6, 3.4, c1)
  poly([[-6, 0], [-10, -3.4], [-10, 3.4]], c2)
  poly([[6, 0], [10, -3.4], [10, 3.4]], c2)
  line(-2, -3, -1, 3, 'rgba(255,255,255,.7)', 1.4)
  line(2, -3, 3, 3, 'rgba(255,255,255,.7)', 1.4)
}

// ---------------------------------------------------------------------------------------------- carnaval
export function mask(c1 = '#7b4dd6', c2 = '#ffd24a', feather = '#ff5a8a') {
  line(0, 0, 0, -13, '#8a6a3f', 1.8)
  // antifaz
  const c = ctx2d()
  c.fillStyle = c1
  c.beginPath()
  c.moveTo(-12, -22)
  c.quadraticCurveTo(-6, -27, 0, -24)
  c.quadraticCurveTo(6, -27, 12, -22)
  c.quadraticCurveTo(10, -14, 4, -16)
  c.quadraticCurveTo(0, -18, -4, -16)
  c.quadraticCurveTo(-10, -14, -12, -22)
  c.fill()
  ellipse(-5.4, -21, 3.2, 2.2, '#fff6dc', -0.2)
  ellipse(5.4, -21, 3.2, 2.2, '#fff6dc', 0.2)
  circle(-5.4, -21, 1.1, '#33284a')
  circle(5.4, -21, 1.1, '#33284a')
  star(0, -24.4, 2.4, 1, 5, c2)
  star(-9, -22.4, 1.6, 0.7, 5, c2)
  star(9, -22.4, 1.6, 0.7, 5, c2)
  // plumas
  ellipse(11, -28, 2.2, 7, feather, 0.7)
  ellipse(13, -25, 2, 6, c2, 1.0)
  ellipse(-11, -28, 2.2, 7, feather, -0.7)
}
export function bunting(x0, x1, yAt, t, flag = 18, cols = ['#ff5a8a', '#ffd24a', '#4dabf7', '#69db7c', '#b57bff']) {
  const c = ctx2d()
  c.strokeStyle = 'rgba(70,60,80,.8)'
  c.lineWidth = 1.2
  c.beginPath()
  const sag = 10
  const pts = []
  for (let x = x0; x <= x1; x += 6) {
    const u = (x - x0) / (x1 - x0)
    const y = yAt(x) + Math.sin(u * Math.PI) * sag
    pts.push([x, y])
    if (x === x0) c.moveTo(x, y)
    else c.lineTo(x, y)
  }
  c.stroke()
  let i = 0
  for (let x = x0 + flag * 0.6; x <= x1 - flag * 0.6; x += flag * 1.15) {
    const u = (x - x0) / (x1 - x0)
    const y = yAt(x) + Math.sin(u * Math.PI) * sag
    const sw = Math.sin(t * 2.2 + i * 0.9) * 2
    poly([[x - flag * 0.45, y], [x + flag * 0.45, y], [x + sw, y + flag * 0.85]], cols[i % cols.length])
    i++
  }
}
export function streamer(len, col, t, wob = 6) {
  // serpentina: cinta ondulada que cae
  const c = ctx2d()
  c.strokeStyle = col
  c.lineWidth = 2.6
  c.lineCap = 'round'
  c.lineJoin = 'round'
  c.beginPath()
  for (let y = 0; y <= len; y += 3) {
    const x = Math.sin(y * 0.32 + t * 3) * wob * (0.3 + y / len)
    if (y === 0) c.moveTo(x, y)
    else c.lineTo(x, y)
  }
  c.stroke()
}
export function confettiPiece(kind, col) {
  if (kind === 0) rounded(-2.4, -1.2, 4.8, 2.4, 0.6, col)
  else if (kind === 1) circle(0, 0, 1.9, col)
  else poly([[0, -2.6], [2.4, 1.6], [-2.4, 1.6]], col)
}

// ---------------------------------------------------------------------------------------------- verano / fiesta
export function balloon(col = '#ff5a8a', t = 0, string = true) {
  if (string) {
    const c = ctx2d()
    c.strokeStyle = 'rgba(80,80,100,.7)'
    c.lineWidth = 1
    c.beginPath()
    c.moveTo(0, 8)
    c.quadraticCurveTo(Math.sin(t * 2) * 4, 18, Math.sin(t * 2 + 1) * 3, 30)
    c.stroke()
  }
  ellipse(0, 0, 8.4, 10.4, col)
  poly([[-1.8, 10], [1.8, 10], [0, 12.6]], col)
  ellipse(-3, -3.6, 2.2, 3.6, 'rgba(255,255,255,.5)', 0.4)
}
export function kite(col = '#ff5a8a', col2 = '#ffd24a', t = 0) {
  // cometa de juguete con cola
  const c = ctx2d()
  c.strokeStyle = 'rgba(70,70,90,.55)'
  c.lineWidth = 1
  c.beginPath()
  c.moveTo(0, 12)
  c.quadraticCurveTo(-8, 40, -22 + Math.sin(t) * 6, 78)
  c.stroke()
  poly([[0, -14], [10, 0], [0, 14], [-10, 0]], col)
  poly([[0, -14], [10, 0], [0, 0]], col2)
  poly([[0, 14], [-10, 0], [0, 0]], col2)
  line(0, -14, 0, 14, 'rgba(60,40,60,.5)', 1)
  line(-10, 0, 10, 0, 'rgba(60,40,60,.5)', 1)
  // cola con lacitos
  const pts = []
  for (let i = 0; i <= 6; i++) pts.push([Math.sin(t * 3 + i * 0.9) * (3 + i), 14 + i * 7])
  curve(pts, 'rgba(70,70,90,.6)', 1.2)
  for (let i = 1; i <= 6; i += 2) {
    const [x, y] = pts[i]
    poly([[x - 4, y - 2.4], [x, y], [x - 4, y + 2.4]], i % 4 === 1 ? col : col2)
    poly([[x + 4, y - 2.4], [x, y], [x + 4, y + 2.4]], i % 4 === 1 ? col : col2)
  }
}
export function firework(r, t, col) {
  const c = ctx2d()
  const n = 12
  for (let i = 0; i < n; i++) {
    const a = (i * TAU) / n
    const d = r * t
    c.save()
    c.globalAlpha *= Math.max(0, 1 - t)
    circle(Math.cos(a) * d, Math.sin(a) * d + t * t * 8, 1.8 * (1 - t * 0.5), col)
    circle(Math.cos(a) * d * 0.62, Math.sin(a) * d * 0.62 + t * t * 5, 1.2, 'rgba(255,255,255,.85)')
    c.restore()
  }
}
export function iceCream(cone = '#e0a657', scoops = ['#ff9ec4', '#fff2b3'], melt = 0) {
  poly([[-5, -13], [5, -13], [0, 0]], cone)
  line(-3, -12, 0.6, -2, 'rgba(150,90,30,.35)', 0.9)
  line(3, -12, -0.6, -2, 'rgba(150,90,30,.35)', 0.9)
  line(-4, -9, 4, -9, 'rgba(150,90,30,.3)', 0.9)
  circle(0, -15, 6.4, scoops[0])
  ellipse(-4, -14, 2.2, 3, scoops[0])
  ellipse(0, -14, 6.6, 1.8, 'rgba(255,255,255,.28)')
  circle(0, -21, 5.4, scoops[1])
  circle(-2, -22.6, 1.6, 'rgba(255,255,255,.55)')
  circle(0, -26.4, 1.8, '#e0453a')
  void melt
}
export function popsicle(col = '#4dabf7', col2 = '#ff6b8b') {
  rounded(-1.2, -6, 2.4, 7, 1, '#e8c98f')
  rounded(-5.4, -20, 10.8, 15, 4.4, col)
  rounded(-5.4, -20, 10.8, 7.4, 4.4, col2)
  rounded(-3.6, -18.6, 2, 8, 1, 'rgba(255,255,255,.4)')
}
export function beachUmbrella(t = 0) {
  line(0, 0, 1, -34, '#8a6a3f', 2.4)
  const c = ctx2d()
  for (let i = 0; i < 6; i++) {
    const a0 = Math.PI + (i * Math.PI) / 6
    const a1 = Math.PI + ((i + 1) * Math.PI) / 6
    c.fillStyle = i % 2 ? '#fff6ea' : '#ff5a6e'
    c.beginPath()
    c.moveTo(1, -34)
    c.arc(1, -30, 22, a0, a1)
    c.closePath()
    c.fill()
  }
  circle(1, -52.6, 1.6, '#ffd24a')
  ellipse(0, 1, 16, 3, 'rgba(0,0,0,.08)')
  // toalla
  poly([[8, 1], [30, 1], [27, 5], [5, 5]], '#4dabf7')
  poly([[10, 2], [14, 2], [11.5, 5], [7.5, 5]], '#fff')
  poly([[18, 2], [22, 2], [19.5, 5], [15.5, 5]], '#fff')
  void t
}
export function sandcastle() {
  rounded(-14, -10, 28, 10, 1, '#e8c783')
  rounded(-16, -20, 8, 20, 1, '#eed08f')
  rounded(8, -20, 8, 20, 1, '#eed08f')
  for (const x of [-16, -12.4, 8, 11.6]) rounded(x, -23, 3.2, 3.6, 0.4, '#eed08f')
  rounded(-5, -16, 10, 16, 1, '#f2d89c')
  for (const x of [-5, -1.6, 1.8]) rounded(x, -19, 3.2, 3.6, 0.4, '#f2d89c')
  poly([[-3, 0], [3, 0], [3, -6], [0, -9], [-3, -6]], '#a9803f')
  line(0, -23, 0, -31, '#8a6a3f', 1.2)
  poly([[0, -31], [8, -28.6], [0, -26.4]], '#e0453a')
}
export function starfish(col = '#f5a05d') {
  star(0, 0, 7, 3, 5, col, 0.2)
  circle(0, 0, 1.2, 'rgba(255,255,255,.55)')
}
export function seaShell(col = '#f6d6c4') {
  ellipse(0, 0, 6, 4.4, col)
  for (let i = -2; i <= 2; i++) line(i * 1.2, 3.6, i * 2.2, -3.6, 'rgba(190,120,100,.45)', 0.8)
}
export function seagull(t = 0) {
  const flap = Math.sin(t * 5)
  const c = ctx2d()
  c.strokeStyle = '#fff'
  c.lineWidth = 3.4
  c.lineCap = 'round'
  c.lineJoin = 'round'
  for (const s of [-1, 1]) {
    c.beginPath()
    c.moveTo(0, 0)
    c.quadraticCurveTo(s * 9, -7 - flap * 6, s * 19, -1 + flap * 5)
    c.stroke()
  }
  ellipse(0, 1, 5, 2.6, '#fff')
  circle(4.4, 0, 2, '#fff')
  poly([[6, -0.4], [8.6, 0.4], [6, 1]], '#f6b73c')
}
// La rodaja se apoya sobre su borde recto: todo queda por ENCIMA de la línea del suelo.
export function watermelon() {
  at(0, -12, 1, watermelonBody)
}
function watermelonBody() {
  const c = ctx2d()
  c.fillStyle = '#4caf55'
  c.beginPath()
  c.arc(0, -2, 13, 0, Math.PI)
  c.closePath()
  c.fill()
  c.fillStyle = '#fff2c9'
  c.beginPath()
  c.arc(0, -2, 11.4, 0, Math.PI)
  c.closePath()
  c.fill()
  c.fillStyle = '#ff5a6e'
  c.beginPath()
  c.arc(0, -2, 10, 0, Math.PI)
  c.closePath()
  c.fill()
  for (const [x, y] of [[-5, 2], [-1, 4], [3.4, 2.4], [6, 5], [-2.6, 7]]) ellipse(x, y, 0.9, 1.5, '#2a2a2a', 0.2)
}
export function sunHat() {
  ellipse(0, 0, 11, 3, '#f1d38a')
  ellipse(0, -3, 6.4, 5, '#f6dd9a')
  rounded(-6.4, -4.4, 12.8, 2.2, 0, '#ff5a6e')
}

// ---------------------------------------------------------------------------------------------- vuelta al cole
export function pencil(col = '#ffcf3d', tip = '#f1c9a0') {
  rounded(-2.8, -30, 5.6, 24, 0.6, col)
  rounded(-2.8, -30, 1.6, 24, 0, 'rgba(255,255,255,.25)')
  poly([[-2.8, -6], [2.8, -6], [0, 0]], tip)
  poly([[-1, -2.2], [1, -2.2], [0, 0]], '#33333c')
  rounded(-2.8, -34, 5.6, 4.4, 1.2, '#f08aa6')
  rounded(-2.8, -31, 5.6, 1.8, 0, '#b8b8c4')
}
export function bookStack(c1 = '#e0453a', c2 = '#4dabf7', c3 = '#69c05a') {
  rounded(-11, -6, 22, 6, 1, c1)
  rounded(-9, -6, 18, 1.4, 0, '#fff6dc')
  rounded(-9, -12, 20, 6, 1, c2)
  rounded(-7, -12, 16, 1.4, 0, '#fff6dc')
  rounded(-10.4, -18, 20, 6, 1, c3)
  rounded(-8.4, -18, 16, 1.4, 0, '#fff6dc')
  rounded(-5, -3.8, 8, 1.4, 0.6, 'rgba(255,255,255,.55)')
}
export function openBook(t = 0) {
  poly([[-12, -2], [0, -5], [12, -2], [12, 2], [0, -1], [-12, 2]], '#fff6dc')
  poly([[-12, -2], [0, -5], [0, -1], [-12, 2]], '#fffdf2')
  line(0, -5, 0, -1, '#b9a88a', 1)
  for (let i = 0; i < 3; i++) {
    line(-10, -1.2 + i * 0.9, -2, -2.6 + i * 0.9, 'rgba(120,130,170,.5)', 0.7)
    line(2, -2.6 + i * 0.9, 10, -1.2 + i * 0.9, 'rgba(120,130,170,.5)', 0.7)
  }
  void t
}
export function backpack(col = '#ff7a59', strap = '#33406b') {
  rounded(-9, -22, 18, 22, 6, col)
  rounded(-9, -22, 18, 8, 6, 'rgba(255,255,255,.14)')
  rounded(-6.4, -11, 12.8, 8.4, 2.4, 'rgba(0,0,0,.14)')
  rounded(-6.4, -12, 12.8, 3, 1.4, strap)
  rounded(-4.6, -26, 9.2, 5, 2.4, col)
  rounded(-2.4, -25, 4.8, 2.4, 1.2, 'rgba(0,0,0,.2)')
  circle(0, -7, 1.2, '#ffd24a')
  rounded(-10.6, -17, 2.4, 9, 1, strap)
  rounded(8.2, -17, 2.4, 9, 1, strap)
}
export function schoolBus() {
  rounded(-17, -15, 34, 12, 3, '#ffc928')
  rounded(-17, -17, 20, 6, 3, '#ffd84d')
  for (let i = 0; i < 4; i++) rounded(-14 + i * 6.4, -14.6, 4.6, 4.2, 1, '#a9d8f2')
  rounded(10, -14.6, 5, 4.2, 1, '#a9d8f2')
  rounded(-17, -8, 34, 1.4, 0, '#33333c')
  circle(-9, -2.6, 3.4, '#33333c')
  circle(9, -2.6, 3.4, '#33333c')
  circle(-9, -2.6, 1.4, '#cfd3dc')
  circle(9, -2.6, 1.4, '#cfd3dc')
}
export function abcLetter(ch, col, t = 0) {
  const c = ctx2d()
  c.font = '800 20px system-ui, sans-serif'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.lineWidth = 3
  c.strokeStyle = 'rgba(255,255,255,.9)'
  c.strokeText(ch, 0, 0)
  c.fillStyle = col
  c.fillText(ch, 0, 0)
  void t
}
export function paperPlane(t = 0) {
  poly([[-12, -2], [14, 0], [-12, 5]], '#fff')
  poly([[-12, -2], [14, 0], [-4, 1]], '#dbe6fb')
  poly([[-4, 1], [14, 0], [-12, 5]], '#f2f6ff')
  line(-4, 1, -12, 5, 'rgba(120,140,180,.5)', 0.8)
  void t
}

// ---------------------------------------------------------------------------------------------- Papá Noel
export function reindeer(t = 0) {
  const trot = Math.sin(t * 9)
  ellipse(0, -9, 9, 5.4, '#a8683a')
  ellipse(-2, -7, 6, 3, '#c98b52')
  for (const [x, ph] of [[-6, 0], [-2, 1.6], [4, 3.2], [7, 4.8]]) line(x, -5, x + Math.sin(t * 9 + ph) * 2.6, 2, '#8a5028', 2)
  ellipse(10, -15, 3.2, 6, '#a8683a', -0.6)
  circle(14, -19, 4, '#a8683a')
  ellipse(16, -17.6, 2.4, 1.8, '#c98b52')
  circle(18, -17.8, 1.7, '#ff3b3b')
  circle(13, -20.4, 0.9, '#2a1a10')
  // cuernos
  line(12, -22, 11, -29, '#6b4a2a', 1.4)
  line(11, -26, 8, -28, '#6b4a2a', 1.1)
  line(14.4, -22.4, 15.6, -29, '#6b4a2a', 1.4)
  line(15.2, -26, 18, -28, '#6b4a2a', 1.1)
  poly([[-9, -11], [-13, -9 + trot], [-9, -8]], '#f3e6d0')
}
export function sleigh(t = 0) {
  // trineo rojo con Papá Noel y saco de regalos
  const c = ctx2d()
  c.strokeStyle = '#b8862a'
  c.lineWidth = 2
  c.lineCap = 'round'
  c.beginPath()
  c.moveTo(-18, 4)
  c.quadraticCurveTo(-12, 6, 14, 5)
  c.quadraticCurveTo(22, 4, 22, -4)
  c.stroke()
  line(-12, 1, -12, 5, '#b8862a', 1.6)
  line(8, 1, 8, 5, '#b8862a', 1.6)
  c.fillStyle = '#d9382f'
  c.beginPath()
  c.moveTo(-20, -14)
  c.quadraticCurveTo(-19, 0, -10, 1)
  c.lineTo(18, 1)
  c.quadraticCurveTo(22, -4, 21, -12)
  c.quadraticCurveTo(10, -6, -2, -9)
  c.quadraticCurveTo(-12, -11, -20, -14)
  c.fill()
  rounded(-14, -3, 30, 2, 1, '#ffd24a')
  // saco
  ellipse(-12, -14, 8, 9, '#8a5a3a')
  ellipse(-12, -20, 5, 2.4, '#7a4c30')
  star(-13, -16, 3, 1.4, 5, '#ffd24a')
  circle(-9, -11, 2, '#ff5a8a')
  // Papá Noel
  ellipse(6, -11, 6, 7, '#e0301f')
  circle(6, -21, 4.4, '#f3c9a0')
  ellipse(6, -17.6, 4.6, 3, '#fff')
  poly([[1.6, -22], [10.4, -22], [9, -30], [3, -29.4]], '#e0301f')
  circle(10, -30, 2, '#fff')
  rounded(1.4, -23, 9, 2.2, 1, '#fff')
  circle(7.6, -21.4, 0.7, '#2a1a10')
  circle(4.6, -21.4, 0.7, '#2a1a10')
  ellipse(10, -9 + Math.sin(t * 4) * 1.4, 3.2, 2, '#e0301f', -0.5)
  void t
}
export { glint }

// Rudolph, de pie en el suelo y a la escala del paisaje: reno entero con bufanda y su nariz roja que brilla y late.
export function rudolph(t = 0) {
  const c = ctx2d()
  const pulse = 0.5 + 0.5 * Math.sin(t * 3)
  const nod = Math.sin(t * 1.1) * 0.8
  // patas quietas
  for (const x of [-6.4, -2.8, 4.6, 8]) {
    line(x, -5, x, -0.6, '#8a5028', 2.1)
    ellipse(x + 0.4, -0.5, 1.7, 0.9, '#3b2a1c')
  }
  // cuerpo, pecho claro y cola
  ellipse(0, -9, 9.6, 5.6, '#a8683a')
  ellipse(1.2, -6.8, 6.2, 3.2, '#d9b280')
  poly([[-9, -11], [-12.4, -9.4], [-9, -8]], '#f3e6d0')
  // cuello con bufanda roja y cabeza
  poly([[6, -12], [9.6, -17.4 + nod], [12.6, -16.6 + nod], [9.4, -9.6]], '#a8683a')
  rounded(6, -12.4 + nod * 0.4, 7, 2.8, 1.4, '#d9242c')
  rounded(7, -11, 2.4, 5, 1, '#d9242c')
  circle(13.2, -20 + nod, 4.1, '#a8683a')
  ellipse(15.6, -18.6 + nod, 2.7, 2.1, '#c98b52')
  circle(12.2, -21 + nod, 0.9, '#1d1612')
  ellipse(10.2, -25 + nod, 1.4, 2.8, '#a8683a', -0.5)
  // astas
  line(12, -24 + nod, 10.6, -30 + nod, '#6b4a2a', 1.3)
  line(10.9, -28 + nod, 8, -30.4 + nod, '#6b4a2a', 1)
  line(11.6, -26.6 + nod, 12.6, -31 + nod, '#6b4a2a', 1)
  line(14.2, -24.2 + nod, 16.2, -30 + nod, '#6b4a2a', 1.3)
  line(15.6, -28 + nod, 18.6, -30 + nod, '#6b4a2a', 1)
  // nariz roja luminosa
  c.save()
  c.globalAlpha *= 0.22 + 0.26 * pulse
  circle(17.6, -18.6 + nod, 4.6 + pulse * 1.4, '#ff4a4a')
  c.restore()
  circle(17.6, -18.6 + nod, 2.2, '#ff2b3a')
  circle(17, -19.2 + nod, 0.7, '#ffd0d0')
  glint(17.6, -18.6 + nod, 3.8 + pulse * 1.8, 'rgba(255,230,230,.9)', 0.55 + 0.4 * pulse)
}

// Regalo en miniatura para la franja de abajo (distintos colores y alturas).
export function giftSmall(body = '#e0453a', ribbon = '#ffd24a', h = 9) {
  rounded(-h * 0.5, -h, h, h, 1.2, body)
  rounded(-h * 0.5 - 0.6, -h - 2.2, h + 1.2, 3, 1.2, body)
  rounded(-0.9, -h - 2.2, 1.8, h + 2.2, 0, ribbon)
  ellipse(-1.8, -h - 3.4, 2, 1.3, ribbon, -0.4)
  ellipse(1.8, -h - 3.4, 2, 1.3, ribbon, 0.4)
}
