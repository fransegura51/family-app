// Escenas del FONDO (en las colinas, detrás de los árboles): niños jugando en la nieve y patinando, los Reyes Magos con
// sus camellos, niños de verano jugando a la pelota o comiendo helado, bañistas en un lago, el cole con niños llegando,
// comparsa de carnaval y niños de Halloween pidiendo chuches. Todo pequeño, en bucle y sin tocar el paisaje.
// Las colinas del paisaje real NO se mueven con la cámara, así que estas escenas tampoco: están fijas en el fondo.
import {
  TAU, at, circle, clamp, curve, ellipse, glint, lerp, line, poly, rounded, star, unit,
} from './toolkit.js'
import { camel, candyBucket, iceCreamCone, king, KINGS, kid, playBall, sled, snowball } from './partsKids.js'
import { hill1Y, hillStandY, wrapX } from './common.js'
import { snowman } from './partsFestive.js'

const kidU = (env) => unit(env) * 1.2 // las personitas del fondo, un poco mayores que el tamaño base de la decoración
const pick = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length]
const put = (env, fx, k, s, fn, dir = 1, rot = 0) => {
  const x = fx * env.W
  at(x, hillStandY(env, x, k), kidU(env) * s, fn, rot, dir)
}
const putAt = (env, x, k, s, fn, dir = 1) => at(x, hillStandY(env, x, k), kidU(env) * s, fn, 0, dir)

const WINTER = [
  { top: '#e0453a', bottom: '#33406b', hat: 'beanie', hatCol: '#4dabf7', scarf: '#ffd24a' },
  { top: '#2f9d6a', bottom: '#2a3560', hat: 'beanie', hatCol: '#ff5a8a', scarf: '#fff' },
  { top: '#4dabf7', bottom: '#33406b', hat: 'beanie', hatCol: '#e0453a', scarf: '#e0453a' },
  { top: '#b57bff', bottom: '#2a3560', hat: 'beanie', hatCol: '#ffd24a', scarf: '#ff9a3d' },
  { top: '#ff9a3d', bottom: '#33406b', hat: 'beanie', hatCol: '#7b4dd6', scarf: '#fff' },
]
const SUMMER = [
  { top: '#ff5a6e', bottom: '#4dabf7', hat: 'cap', hatCol: '#ffd24a' },
  { top: '#4dabf7', bottom: '#ffd24a', hat: null },
  { top: '#ffd24a', bottom: '#2f6fc0', hat: 'cap', hatCol: '#ff5a6e' },
  { top: '#ff9a3d', bottom: '#33406b', hat: null },
  { top: '#b57bff', bottom: '#ffffff', hat: 'cap', hatCol: '#4dabf7' },
  { top: '#ff8cc6', bottom: '#4dabf7', hat: null },
]
const withLook = (base, i, extra = {}) => ({ ...base, skin: ['#f6d2b0', '#e9b98f', '#c98d63', '#8d5a3b'][i % 4], hair: ['#3a2a20', '#6b4a2a', '#c98a3a', '#e6b84a', '#1f1a22'][i % 5], ...extra })

// ---------------------------------------------------------------------------------------------- invierno: nieve (enero, 7-31)
export function snowKidsScene(env, t) {
  // 1) guerra de bolas de nieve entre dos niños
  {
    const x1 = env.W * 0.1
    const x2 = x1 + 38 * kidU(env)
    const phase = (t * 0.85) % 2
    const leftTurn = phase < 1
    const u = phase % 1
    const y = hillStandY(env, x1, 0.55)
    at(x1, y, kidU(env), () => kid(withLook(WINTER[0], 0, { hold: leftTurn ? 'snowball' : null }), { t: t + 0.2, mode: leftTurn ? 'throw' : 'stand' }))
    at(x2, y, kidU(env), () => kid(withLook(WINTER[1], 1, { hold: leftTurn ? null : 'snowball' }), { t: t + 0.7, mode: leftTurn ? 'stand' : 'throw' }), 0, -1)
    const bx = leftTurn ? lerp(x1 + 8 * kidU(env), x2 - 8 * kidU(env), u) : lerp(x2 - 8 * kidU(env), x1 + 8 * kidU(env), u)
    const by = y - 17 * kidU(env) - Math.sin(u * Math.PI) * 15 * kidU(env)
    at(bx, by, kidU(env), () => snowball(1.7))
  }
  // 2) muñeco de nieve a medio hacer con una niña animando
  {
    const x = env.W * 0.27
    const y = hillStandY(env, x, 0.6)
    at(x, y, kidU(env) * 0.95, () => snowman(t, '#e0453a', '#33406b', false))
    at(x + 22 * kidU(env), y, kidU(env), () => kid(withLook(WINTER[2], 2), { t, mode: 'cheer' }), 0, -1)
    at(x - 20 * kidU(env), y, kidU(env), () => kid(withLook(WINTER[3], 3), { t: t + 1, mode: 'wave' }))
  }
  // 3) lago helado con patinadores
  {
    const cx = env.W * 0.56
    const cy = hillStandY(env, cx, -4.4)
    const rx = env.W * 0.13
    const ry = 13 * kidU(env)
    const c = env.ctx
    c.save()
    ellipse(cx, cy + 3, rx + 5, ry + 3, 'rgba(255,255,255,.95)')
    ellipse(cx, cy + 2, rx, ry, '#8ccdf0')
    ellipse(cx - rx * 0.25, cy, rx * 0.5, ry * 0.4, 'rgba(255,255,255,.6)')
    c.strokeStyle = 'rgba(255,255,255,.7)'
    c.lineWidth = 1
    c.beginPath()
    c.moveTo(cx - rx * 0.6, cy + 4)
    c.quadraticCurveTo(cx - rx * 0.1, cy + 7, cx + rx * 0.5, cy + 3)
    c.stroke()
    c.restore()
    const skaters = [0, 1, 2]
      .map((i) => {
        const a = t * (0.45 + i * 0.08) * (i % 2 ? -1 : 1) + i * 2.1
        return { i, x: cx + Math.cos(a) * rx * 0.72, y: cy + 2 + Math.sin(a) * ry * 0.62, dir: Math.sin(a) * (i % 2 ? 1 : -1) >= 0 ? 1 : -1 }
      })
      .sort((p, q) => p.y - q.y)
    for (const s of skaters) at(s.x, s.y, kidU(env) * 0.9, () => kid(withLook(WINTER[(s.i + 1) % 5], s.i + 2), { t: t + s.i, mode: 'skate' }), 0, s.dir)
  }
  // 4) trineo cuesta abajo
  {
    const period = 6
    const u = (t % period) / period
    const x = lerp(env.W * 0.78, env.W * 0.92, u)
    const y = hillStandY(env, x, 0.3 + 0.35 * u) + 1
    const a = clamp(Math.min(u / 0.1, (1 - u) / 0.12), 0, 1)
    env.ctx.save()
    env.ctx.globalAlpha *= a
    at(x, y, kidU(env) * 0.95, () => {
      sled('#d9382f')
      at(-1, -3, 1, () => kid(withLook(WINTER[4], 4), { t, mode: 'cheer' }))
    })
    env.ctx.restore()
    // y otro niño esperando arriba
    at(env.W * 0.76, hillStandY(env, env.W * 0.76, 0.3), kidU(env) * 0.9, () => kid(withLook(WINTER[0], 5), { t: t + 2, mode: 'wave' }))
  }
}

// ---------------------------------------------------------------------------------------------- invierno: Reyes Magos (1-6 de enero)
export function reyesScene(env, t) {
  const u = kidU(env)
  const period = 110 // 80 s de recorrido + pausa fuera de pantalla
  const travel = 80
  const e = env.reduced ? 0.45 * travel : t % period
  if (e > travel) return
  const prog = e / travel
  const sc = 0.78 * u
  const spacing = 56 * sc
  const lead = lerp(-70, env.W + 160, prog)
  // Estrella de Belén guiando, sobre el primer rey
  const sx = lead + 30 * sc
  const sy = env.H * 0.12 + Math.sin(t * 0.8) * 3
  glint(sx, sy, 15 * u, '#fff6b8', 0.95)
  glint(sx, sy, 8 * u, '#ffffff', 1)
  for (let k = 1; k <= 5; k++) glint(sx - k * 11 * u, sy + k * 4 * u, (3.4 - k * 0.45) * u, '#ffe27a', 0.75 - k * 0.12)
  // Cresta de la colina lejana: ahí caminan, despacio
  for (let i = 0; i < 3; i++) {
    const x = lead - i * spacing
    if (x < -50 || x > env.W + 60) continue
    const y = hill1Y(env, x) + 7 * u
    at(x, y, sc, () => {
      camel(t + i * 0.9, ['#c0392b', '#2f6fc0', '#6c3fb0'][i])
      at(-1, -22, 1, () => king(KINGS[i], t + i * 0.9))
    })
  }
}

// ---------------------------------------------------------------------------------------------- verano: pelota y helados (julio y agosto)
export function summerKidsScene(env, t, { lake = false } = {}) {
  const U = kidU(env)
  // pelota que pasa entre tres niños (pase triangular)
  const pass = (fx, ids) => {
    const xs = [0, 30, 15].map((d, k) => fx * env.W + d * U + (k === 2 ? 0 : 0))
    const ys = [0.52, 0.52, 0.7].map((k, j) => hillStandY(env, xs[j], k))
    const phase = (t * 0.6) % 3
    const seg = Math.floor(phase)
    const u2 = phase - seg
    const a = seg % 3
    const b = (seg + 1) % 3
    xs.forEach((x, j) => at(x, ys[j], U * 0.95, () => kid(withLook(SUMMER[ids[j] % 6], ids[j]), { t: t + j * 0.6, mode: j === a ? 'kick' : 'stand' }), 0, x < xs[b] && j === a ? 1 : j === a ? -1 : j === 0 ? 1 : -1))
    const bx = lerp(xs[a], xs[b], u2)
    const by = lerp(ys[a], ys[b], u2) - 4 * U - Math.sin(u2 * Math.PI) * 14 * U
    at(bx, by, U, () => playBall(t, ['#ff5a6e', '#4dabf7'][a % 2]))
  }
  pass(0.09, [0, 1, 2])
  // helados: dos niños comiendo
  const ice = (fx, ids) => {
    ids.forEach((id, j) => {
      const x = fx * env.W + j * 20 * U
      at(x, hillStandY(env, x, 0.6), U * 0.95, () => kid(withLook(SUMMER[id % 6], id, { hold: 'cone', coneA: ['#ff9ec4', '#9be0c4', '#b49bff'][id % 3], coneB: '#fff2b3' }), { t: t + j, mode: 'eat' }), 0, j ? -1 : 1)
    })
  }
  ice(lake ? 0.3 : 0.31, [3, 4])
  // corretón: dos niños que se persiguen
  if (!lake) {
    const run = (t * 0.35) % 2
    const x1 = lerp(env.W * 0.47, env.W * 0.6, run < 1 ? run : 2 - run)
    const dir = run < 1 ? 1 : -1
    putAt(env, x1, 0.62, 0.95, () => kid(withLook(SUMMER[1], 5), { t: t * 1.4, mode: 'walk' }), dir)
    putAt(env, x1 - dir * 15 * U, 0.62, 0.95, () => kid(withLook(SUMMER[2], 6), { t: t * 1.4 + 1, mode: 'walk' }), dir)
  }
  // pareja jugando a la pelota con las manos + niños animando
  const hands = (fx) => {
    const x1 = fx * env.W
    const x2 = x1 + 36 * U
    const y = hillStandY(env, x1, 0.56)
    const ph = (t * 0.7) % 2
    const lt = ph < 1
    const u3 = ph % 1
    at(x1, y, U * 0.95, () => kid(withLook(SUMMER[4], 7), { t: t + 0.3, mode: lt ? 'throw' : 'stand' }))
    at(x2, y, U * 0.95, () => kid(withLook(SUMMER[5], 8), { t: t + 0.9, mode: lt ? 'stand' : 'throw' }), 0, -1)
    const bx = lt ? lerp(x1 + 6 * U, x2 - 6 * U, u3) : lerp(x2 - 6 * U, x1 + 6 * U, u3)
    at(bx, y - 16 * U - Math.sin(u3 * Math.PI) * 13 * U, U, () => playBall(t, '#ffd24a'))
  }
  hands(lake ? 0.74 : 0.8)
  if (!lake) {
    // salto de comba / aplausos
    putAt(env, env.W * 0.93, 0.6, 0.95, () => kid(withLook(SUMMER[0], 9), { t, mode: 'jump' }))
    putAt(env, env.W * 0.97, 0.6, 0.95, () => kid(withLook(SUMMER[3], 10), { t: t + 0.8, mode: 'cheer' }), 1)
  }
}

// ---------------------------------------------------------------------------------------------- agosto: lago con bañistas
export function lakeScene(env, t) {
  const U = kidU(env)
  const cx = env.W * 0.5
  const cy = hillStandY(env, cx, -4.4)
  const rx = env.W * 0.15
  const ry = 11 * U
  const c = env.ctx
  ellipse(cx, cy + 3, rx + 6, ry + 3.5, '#e9d9a8') // orilla de arena
  ellipse(cx, cy + 2, rx, ry, '#4aa8d8')
  ellipse(cx - rx * 0.2, cy, rx * 0.55, ry * 0.45, 'rgba(255,255,255,.28)')
  c.save()
  c.strokeStyle = 'rgba(255,255,255,.55)'
  c.lineWidth = 1
  for (let k = 0; k < 4; k++) {
    const wx = cx + (k - 1.5) * rx * 0.42 + Math.sin(t * 0.8 + k) * 3
    c.beginPath()
    c.arc(wx, cy + 3 + (k % 2) * 3, 4, Math.PI * 1.1, Math.PI * 1.9)
    c.stroke()
  }
  c.restore()
  // bañistas: cabeza, brazos y salpicaduras (el cuerpo queda bajo el agua)
  const swimmers = [0, 1, 2, 3].map((i) => ({ i, x: cx + Math.sin(t * 0.5 + i * 1.7) * rx * 0.6, y: cy + 3 + (i % 3) * 3 - 2 + Math.sin(t * 1.4 + i) * 1 }))
  swimmers.sort((a, b) => a.y - b.y)
  for (const s of swimmers) {
    const skin = ['#f6d2b0', '#e9b98f', '#c98d63', '#f6d2b0'][s.i]
    const hair = ['#3a2a20', '#c98a3a', '#1f1a22', '#a5502a'][s.i]
    at(s.x, s.y, U, () => {
      ellipse(0, 1.2, 5, 1.8, 'rgba(255,255,255,.55)')
      const stroke = Math.sin(t * 5 + s.i) * 3
      line(-2, -1.5, -6 + stroke, -4 - Math.abs(stroke) * 0.4, skin, 1.8)
      line(2, -1.5, 6 - stroke, -4 - Math.abs(stroke) * 0.4, skin, 1.8)
      circle(0, -4, 3.7, skin)
      ellipse(0, -6.4, 3.9, 2.3, hair)
      circle(-1.3, -4.2, 0.5, '#2a2230')
      circle(1.3, -4.2, 0.5, '#2a2230')
      ellipse(0, 0.6, 6, 1.2, 'rgba(255,255,255,.7)')
    })
  }
  // niño que salta desde la orilla al agua
  const period = 5
  const u = (t % period) / period
  const bx = cx - rx * 0.92
  const by = cy + 1
  if (u < 0.55) {
    const k = u / 0.55
    const x = lerp(bx, cx - rx * 0.5, k)
    const y = by - Math.sin(k * Math.PI) * 18 * U + k * 3
    at(x, y, U * 0.95, () => kid(withLook(SUMMER[0], 12), { t: t * 1.5, mode: 'jump' }))
  } else {
    const k = (u - 0.55) / 0.45
    const sx = cx - rx * 0.5
    c.save()
    c.globalAlpha *= 1 - k
    for (let n = 0; n < 7; n++) {
      const a = -Math.PI * (0.15 + 0.7 * (n / 6))
      circle(sx + Math.cos(a) * k * 14 * U, by + 4 + Math.sin(a) * k * 15 * U + k * k * 12 * U, 1.7 * U * (1 - k * 0.4), '#fff')
    }
    ellipse(sx, by + 4, 6 * U * (0.4 + k), 1.7 * U, 'rgba(255,255,255,.7)')
    c.restore()
  }
  // niños en la orilla mirando / haciendo tobogán de agua
  at(cx + rx * 1.05, hillStandY(env, cx + rx * 1.05, 0.6), U * 0.95, () => kid(withLook(SUMMER[2], 13), { t, mode: 'cheer' }), 0, -1)
  at(cx + rx * 1.2 + 12 * U, hillStandY(env, cx + rx * 1.2, 0.6), U * 0.95, () => kid(withLook(SUMMER[5], 14, { hold: 'cone', coneA: '#ff9ec4', coneB: '#fff2b3' }), { t, mode: 'eat' }), 0, -1)
}

// ---------------------------------------------------------------------------------------------- septiembre: el cole
function schoolBuilding(t) {
  // edificio sencillo: cuerpo, tejado, torrecilla con reloj, puerta y ventanas, bandera
  rounded(-30, -22, 60, 22, 1.4, '#e8a35a')
  rounded(-30, -22, 60, 4, 0.8, '#c9803a')
  poly([[-33, -22], [33, -22], [27, -29], [-27, -29]], '#b84a3a')
  rounded(-9, -42, 18, 15, 1.2, '#e8a35a')
  poly([[-11, -42], [11, -42], [0, -50]], '#b84a3a')
  circle(0, -35, 4.2, '#fff')
  line(0, -35, 0, -37.6, '#33406b', 0.9)
  line(0, -35, 2, -34.4, '#33406b', 0.9)
  rounded(-5, -15, 10, 15, 1.6, '#7a4a2a')
  circle(3, -7.6, 0.7, '#f6c32d')
  for (const x of [-24, -17, 11, 18]) {
    rounded(x - 2.6, -17, 5.2, 7.2, 0.8, '#a9d8f2')
    line(x, -17, x, -9.8, '#e8a35a', 0.7)
  }
  line(22, -42, 22, -62, '#8a8a95', 1.1)
  poly([[22, -62], [32, -59.4 + Math.sin(t * 3) * 1.4], [22, -56.8]], '#e0453a')
}
const SCHOOL_BAGS = ['#ff7a59', '#4dabf7', '#b57bff', '#ff5a8a', '#ffb42a', '#2f6fc0']
export function schoolScene(env, t) {
  const U = kidU(env)
  const dx = env.W * 0.62
  const dy = hillStandY(env, dx, -0.7)
  at(dx, dy, U * 1.3, () => schoolBuilding(t))
  const door = { x: dx, y: dy }
  // niños llegando desde todas las direcciones con su mochila
  const starts = [0.02, 0.17, 0.3, 0.44, 0.82, 0.96, 0.9]
  const period = 24
  starts.forEach((fx, i) => {
    const u = ((t + i * 3.7) % period) / period
    const x0 = fx * env.W
    const y0 = hillStandY(env, x0, 0.6 + (i % 3) * 0.08)
    const k = clamp(u / 0.82, 0, 1)
    const x = lerp(x0, door.x, k)
    const y = lerp(y0, door.y + 2, k)
    const alpha = clamp(Math.min(u / 0.06, (1 - u) / 0.1, (0.82 - u + 0.1) / 0.1), 0, 1)
    if (alpha <= 0.01 || u > 0.92) return
    const dir = door.x >= x0 ? 1 : -1
    env.ctx.save()
    env.ctx.globalAlpha *= alpha
    at(x, y, U * 0.85 * (0.96 + 0.04 * k), () => kid(withLook({ top: pick(['#ffd24a', '#ff8cc6', '#4dabf7', '#ff9a3d', '#e0453a'], i), bottom: pick(['#33406b', '#5a4a8a', '#2f4f6a'], i), hat: null, bag: SCHOOL_BAGS[i % SCHOOL_BAGS.length] }, i + 3), { t: t * 1.1 + i, mode: 'walk' }), 0, dir)
    env.ctx.restore()
  })
  // dos niños charlando en la puerta
  at(dx - 18 * U, dy + 3, U * 0.85, () => kid(withLook({ top: '#ff8cc6', bottom: '#5a4a8a', bag: '#b57bff' }, 20), { t, mode: 'wave' }))
  at(dx + 20 * U, dy + 3, U * 0.85, () => kid(withLook({ top: '#4dabf7', bottom: '#33406b', bag: '#ff7a59' }, 21), { t: t + 1, mode: 'stand' }), 0, -1)
}

// ---------------------------------------------------------------------------------------------- febrero: comparsa de carnaval
function carroza(t) {
  rounded(-26, -12, 52, 6, 1.4, '#7b4dd6')
  rounded(-26, -8, 52, 2, 0, '#ffd24a')
  circle(-16, -3, 4.2, '#33333c')
  circle(16, -3, 4.2, '#33333c')
  circle(-16, -3, 1.6, '#cfd3dc')
  circle(16, -3, 1.6, '#cfd3dc')
  // adornos: arco de globos, cabezudo y banderines
  const cols = ['#ff5a8a', '#ffd24a', '#4dabf7', '#69db7c', '#b57bff']
  for (let i = 0; i < 5; i++) {
    const a = Math.PI + (i * Math.PI) / 4
    const bx = Math.cos(a) * 20
    const by = -12 + Math.sin(a) * 19 - 4 + Math.sin(t * 2 + i) * 1.2
    line(bx, by + 6, bx * 0.9, -12, 'rgba(60,60,80,.55)', 0.7)
    ellipse(bx, by, 3.8, 4.8, cols[i])
  }
  circle(0, -24, 7.2, '#f6c8a0')
  ellipse(0, -28, 8.2, 4.4, '#e0453a')
  circle(-2.6, -24.6, 1.1, '#33284a')
  circle(2.6, -24.6, 1.1, '#33284a')
  circle(0, -21.6, 2.4, '#e0453a')
  rounded(-30, -22, 3, 10, 1, '#ffd24a')
  poly([[-27, -22], [-14, -19.6], [-27, -17]], '#ff5a8a')
}
const COSTUMES = [
  { top: '#e0453a', bottom: '#ffd24a', hat: 'clown' },
  { top: '#ff8cc6', bottom: '#ff8cc6', hat: 'princess' },
  { top: '#2f6fc0', bottom: '#e0453a', hat: null, cape: '#e0453a' },
  { top: '#33333c', bottom: '#33333c', hat: 'pirate' },
  { top: '#69c05a', bottom: '#33406b', hat: 'bunny' },
]
export function carnivalScene(env, t) {
  const U = kidU(env)
  // comparsa bailando
  ;[0.14, 0.2, 0.26, 0.32].forEach((fx, i) => put(env, fx, 0.56 + (i % 2) * 0.1, 0.95, () => kid(withLook(COSTUMES[i], i + 1), { t: t + i * 0.7, mode: 'dance' }), i % 2 ? -1 : 1))
  // carroza que cruza despacio con dos niños empujando
  const period = 90
  const prog = (t % period) / period
  const x = lerp(-60, env.W + 60, prog)
  const y = hillStandY(env, x, 0.5)
  if (x > -50 && x < env.W + 50) {
    at(x, y, U * 0.8, () => carroza(t))
    at(x - 36 * U, y, U * 0.8, () => kid(withLook(COSTUMES[4], 6), { t: t * 1.2, mode: 'walk' }))
    at(x + 34 * U, y, U * 0.8, () => kid(withLook(COSTUMES[2], 7), { t: t * 1.2 + 1, mode: 'walk' }), 0, -1)
  }
  // otro grupito más lejos, bailando
  ;[0.66, 0.72].forEach((fx, i) => put(env, fx, 0.6, 0.9, () => kid(withLook(COSTUMES[(i + 2) % 5], i + 9), { t: t + i, mode: 'cheer' })))
}

// ---------------------------------------------------------------------------------------------- octubre: Halloween
function cuteHouse(t) {
  rounded(-17, -20, 34, 20, 1.2, '#4a3a68')
  poly([[-21, -20], [21, -20], [0, -38]], '#2f2548')
  rounded(-13, -35, 4, 10, 0.6, '#4a3a68')
  for (const x of [-9, 8]) {
    const f = 0.75 + 0.25 * Math.sin(t * 6 + x)
    rounded(x - 3.2, -16, 6.4, 7.6, 1, `rgba(255,214,90,${f})`)
    line(x, -16, x, -8.4, '#4a3a68', 0.8)
  }
  rounded(-3.6, -12, 7.2, 12, 1.6, '#7a4a2a')
  circle(1.8, -6, 0.7, '#ffd24a')
  circle(-0.2, -26, 3.4, '#ffd24a')
}
const HALLOWEEN = [
  { top: '#6b3fa0', bottom: '#6b3fa0', hat: 'witch', hold: 'bucket', bucketCol: '#ff8a2a' },
  { top: '#15131c', bottom: '#15131c', hat: 'vampire', cape: '#b01a2a', skin: '#e8e0d8', hold: 'bucket', bucketCol: '#ff8a2a' },
  { top: '#fff', bottom: '#fff', hat: 'ghost', hold: 'bucket', bucketCol: '#ff8a2a' },
  { top: '#ff8a2a', bottom: '#33333c', hat: 'pirate', hold: 'bucket', bucketCol: '#7b4dd6' },
  { top: '#69c05a', bottom: '#33406b', hat: 'bunny', hold: 'bucket', bucketCol: '#ff8a2a' },
]
export function halloweenScene(env, t) {
  const U = kidU(env)
  // casita encendida en el centro del fondo
  const hx = env.W * 0.5
  const hy = hillStandY(env, hx, 0.5)
  at(hx, hy, U * 1.05, () => cuteHouse(t))
  // grupitos de niños disfrazados que van a pedir chuches (en los dos sentidos)
  const groups = [
    { dir: 1, off: 0, ids: [0, 1, 2], y: 0.62 },
    { dir: -1, off: 0.5, ids: [3, 4], y: 0.7 },
  ]
  groups.forEach((g, gi) => {
    const u = ((t / 70 + g.off) % 1 + 1) % 1
    const x0 = g.dir === 1 ? -70 : env.W + 70
    const x1 = g.dir === 1 ? env.W + 70 : -70
    const lead = lerp(x0, x1, u)
    g.ids.forEach((id, j) => {
      const x = lead - g.dir * j * 20 * U
      if (x < -30 || x > env.W + 30) return
      const walkMode = Math.abs(x - hx) < 24 * U ? 'wave' : 'walk'
      at(x, hillStandY(env, x, g.y), U * 0.92, () => kid(withLook(HALLOWEEN[id], id + gi * 3 + 2), { t: t * 1.0 + j * 0.8, mode: walkMode }), 0, g.dir)
    })
  })
  // dos peques fijos con su bolsa, más cerca de la casa
  at(hx - 30 * U, hy + 5, U * 0.9, () => kid(withLook(HALLOWEEN[2], 30), { t, mode: 'cheer' }))
  at(hx + 28 * U, hy + 5, U * 0.9, () => kid(withLook(HALLOWEEN[0], 31), { t: t + 1, mode: 'jump' }), 0, -1)
}
export { candyBucket, iceCreamCone, TAU, curve, star, wrapX }
