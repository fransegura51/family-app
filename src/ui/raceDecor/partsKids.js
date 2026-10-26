// Personitas del fondo: niños (y los tres Reyes Magos con sus camellos) en el mismo estilo plano de la Carrera.
// Se dibujan en el origen, de pie sobre y=0 (lo que sube va hacia −y), mirando a la derecha; mide ~25 unidades de alto.
// Como en el resto de piezas, la escala la pone quien las usa. Están pensadas para verse PEQUEÑAS, en las colinas del fondo.
import { TAU, at, circle, curve, ellipse, glint, line, poly, rounded, star, ctx2d } from './toolkit.js'

export const SKINS = ['#f6d2b0', '#e9b98f', '#c98d63', '#8d5a3b']
export const HAIRS = ['#3a2a20', '#6b4a2a', '#c98a3a', '#e6b84a', '#1f1a22', '#a5502a']

// Aspecto de un niño: { skin, hair, top, bottom, hat, hatCol, scarf, bag, cape, shoes }
// Pose: { t, mode } con mode en stand | walk | throw | wave | skate | kick | eat | jump | dance | cheer | carry
export function kid(look = {}, pose = {}) {
  const c = ctx2d()
  const t = pose.t ?? 0
  const mode = pose.mode ?? 'stand'
  const skin = look.skin ?? SKINS[0]
  const hair = look.hair ?? HAIRS[0]
  const top = look.top ?? '#e0453a'
  const bottom = look.bottom ?? '#33406b'

  let swing = 0
  let bob = 0
  let lean = 0
  let legSpread = 2.2
  // posición de las manos respecto a los hombros (dx, dy)
  let handL = [-1.6, 6]
  let handR = [1.6, 6]
  if (mode === 'walk') {
    const k = Math.sin(t * 7)
    swing = k * 3.4
    handL = [k * 3, 5.8]
    handR = [-k * 3, 5.8]
    bob = Math.abs(k) * 0.8
  } else if (mode === 'carry') {
    swing = Math.sin(t * 7) * 3
    handL = [4.6, 2.4]
    handR = [1.4, 6]
    bob = Math.abs(Math.sin(t * 7)) * 0.7
  } else if (mode === 'throw') {
    const k = (t * 1.4) % 1
    handL = [2, 4.4]
    handR = k < 0.5 ? [-3.2, -5.4] : [-3.2 + (k - 0.5) * 2 * 9.4, -5.4 + (k - 0.5) * 2 * 9.2]
    lean = k < 0.5 ? -0.1 : 0.12
  } else if (mode === 'wave') {
    handL = [-1.6, 6]
    handR = [3 + Math.sin(t * 8) * 1.2, -5.6]
  } else if (mode === 'skate') {
    const k = Math.sin(t * 2.4)
    swing = k * 3.2
    handL = [-6, 1.6 + k * 0.8]
    handR = [6, 1.6 - k * 0.8]
    lean = 0.22
    legSpread = 3
  } else if (mode === 'kick') {
    const k = Math.sin(t * 5)
    swing = k * 4
    handL = [-4.2, 3]
    handR = [4.2, 3]
    bob = Math.abs(k) * 0.8
  } else if (mode === 'eat') {
    handL = [-1.6, 6]
    handR = [2.4, -2.6 + Math.sin(t * 2.2) * 0.5]
    bob = Math.sin(t * 2.2) * 0.3
  } else if (mode === 'jump') {
    bob = Math.abs(Math.sin(t * 4)) * 7
    handL = [-3.2, -5.8]
    handR = [3.2, -5.8]
    swing = 2
  } else if (mode === 'dance') {
    const k = Math.sin(t * 5)
    handL = [-3.4, -5.4 + k * 1.4]
    handR = [3.4, -5.4 - k * 1.4]
    swing = k * 1.6
    lean = k * 0.1
    bob = Math.abs(k) * 1.4
  } else if (mode === 'cheer') {
    const k = Math.sin(t * 6)
    handL = [-3.2, -5.8 + k * 0.8]
    handR = [3.2, -5.8 - k * 0.8]
    bob = Math.abs(k) * 1.6
  } else {
    handL = [-1.6 + Math.sin(t * 1.3) * 0.3, 6]
    handR = [1.6 - Math.sin(t * 1.3) * 0.3, 6]
  }

  c.save()
  c.translate(0, -bob)
  if (lean) c.rotate(lean)

  // capa (vampiro, superhéroe…) y mochila van detrás del cuerpo
  if (look.cape) poly([[-4, -16], [4, -16], [7.5, -3 + Math.sin(t * 4) * 0.8], [-7.5, -3 - Math.sin(t * 4) * 0.8]], look.cape)
  if (look.bag) {
    rounded(-8, -17, 5.4, 9, 2, look.bag)
    rounded(-7.4, -12.4, 4, 2.4, 1, 'rgba(0,0,0,.18)')
  }
  // piernas
  const shoes = look.shoes ?? '#3a3340'
  for (const s of [-1, 1]) {
    const fx = s * legSpread + swing * s
    line(s * 1.6, -8, fx, -1.2, bottom, 3.4)
    ellipse(fx + 0.6, -0.6, 2.6, 1.3, shoes)
  }
  // tronco
  rounded(-4.2, -17.4, 8.4, 10.4, 3, top)
  if (look.scarf) {
    rounded(-4.6, -17.6, 9.2, 2.6, 1.3, look.scarf)
    rounded(1.2, -17, 2.4, 5.4, 1, look.scarf)
  }
  // brazos
  for (const [s, h] of [[-1, handL], [1, handR]]) {
    const sx = s * 4.2
    const sy = -16
    line(sx, sy, sx + h[0], sy + h[1], top, 2.6)
    circle(sx + h[0], sy + h[1], 1.5, skin)
  }
  if (look.hold === 'cone') at(4.2 + handR[0], -16 + handR[1], 1, () => iceCreamCone(look.coneA, look.coneB), 0.1)
  if (look.hold === 'bucket') at(-4.2 + handL[0], -16 + handL[1] + 3.6, 1, () => candyBucket(look.bucketCol))
  if (look.hold === 'snowball') at(4.2 + handR[0] + 1, -16 + handR[1] - 1.6, 1, () => snowball(1.7))
  // cabeza
  circle(0, -21.8, 4.7, skin)
  ellipse(0, -24.4, 4.9, 3, hair)
  ellipse(-3.8, -22.2, 1.4, 2.4, hair)
  ellipse(3.8, -22.2, 1.4, 2.4, hair)
  circle(-1.7, -21.6, 0.62, '#2a2230')
  circle(1.7, -21.6, 0.62, '#2a2230')
  circle(-2.7, -20.2, 0.8, 'rgba(240,120,110,.5)')
  circle(2.7, -20.2, 0.8, 'rgba(240,120,110,.5)')
  curve([[-1.2, -19.5], [0, -18.9], [1.2, -19.5]], '#8a4a3a', 0.7)
  // sombreros y complementos
  const hc = look.hatCol ?? '#4dabf7'
  if (look.hat === 'beanie') {
    ellipse(0, -25.6, 5.2, 3.6, hc)
    rounded(-5.2, -25.2, 10.4, 2, 1, 'rgba(255,255,255,.55)')
    circle(0, -29.4, 1.6, '#fff')
  } else if (look.hat === 'cap') {
    ellipse(0, -25.4, 5.1, 3, hc)
    rounded(1, -25, 6.6, 1.6, 0.8, hc)
  } else if (look.hat === 'witch') {
    ellipse(0, -25.2, 8, 1.7, '#3b2a55')
    poly([[-4, -25.4], [4, -25.4], [0.6, -35]], '#4b3570')
    rounded(-4.2, -27.6, 8.4, 1.6, 0.4, '#e8932b')
  } else if (look.hat === 'crown') {
    poly([[-4.4, -25.2], [-4.4, -30], [-2.2, -27.6], [0, -30.8], [2.2, -27.6], [4.4, -30], [4.4, -25.2]], '#f6c32d')
    circle(0, -27, 0.9, '#e0453a')
  } else if (look.hat === 'santa') {
    poly([[-4.6, -25.2], [4.6, -25.2], [3, -31], [-1, -32.6]], '#d9382f')
    rounded(-5.2, -26.4, 10.4, 2, 1, '#fff')
    circle(-1.4, -32.8, 1.5, '#fff')
  } else if (look.hat === 'clown') {
    circle(0, -20.6, 1.5, '#e0453a')
    for (const s of [-1, 1]) circle(s * 5, -24, 2.4, ['#ff5a8a', '#4dabf7'][s === 1 ? 1 : 0])
    poly([[-3.4, -25.6], [3.4, -25.6], [0, -33]], '#ffd24a')
  } else if (look.hat === 'pirate') {
    ellipse(0, -25.4, 6, 2.6, '#2a2a33')
    poly([[-6, -25.2], [6, -25.2], [0, -30]], '#2a2a33')
    circle(0, -27, 1, '#fff')
  } else if (look.hat === 'vampire') {
    poly([[-4.8, -24], [4.8, -24], [0, -27.4]], '#15131c')
    poly([[-1, -19], [-0.4, -17.6], [0.2, -19]], '#fff')
  } else if (look.hat === 'ghost') {
    // sábana: cubre cabeza y tronco
    c.fillStyle = 'rgba(255,255,255,.96)'
    c.beginPath()
    c.moveTo(-6.4, -1)
    c.quadraticCurveTo(-8, -26, 0, -27.4)
    c.quadraticCurveTo(8, -26, 6.4, -1)
    for (let i = 0; i < 4; i++) c.quadraticCurveTo(5 - i * 3.4, 1.4, 3.2 - i * 3.4, -1)
    c.fill()
    circle(-2.2, -21, 1.1, '#2a2a3a')
    circle(2.2, -21, 1.1, '#2a2a3a')
    ellipse(0, -17.6, 1.2, 1.6, '#2a2a3a')
  } else if (look.hat === 'bunny') {
    ellipse(-2.4, -30, 1.5, 4.8, '#fff', -0.15)
    ellipse(2.4, -30, 1.5, 4.8, '#fff', 0.15)
  } else if (look.hat === 'princess') {
    poly([[-3.4, -25.4], [3.4, -25.4], [0, -32]], '#ff8cc6')
    line(0, -32, 0.6, -35, '#f6c32d', 0.8)
    star(0.6, -35.4, 1.6, 0.7, 5, '#ffd24a')
  }
  c.restore()
}

// Bolsa/cubo de chuches para Halloween.
export function candyBucket(col = '#ff8a2a') {
  rounded(-3.4, -5.4, 6.8, 5.4, 1.6, col)
  curve([[-3, -5.4], [0, -9], [3, -5.4]], '#7a4a1a', 0.9)
  circle(-1, -6.4, 0.9, '#ff7f9e')
  circle(1.2, -6, 0.9, '#ffd76c')
}

export function snowball(r = 2) {
  circle(0, 0, r, '#fff')
  circle(-r * 0.3, -r * 0.3, r * 0.45, 'rgba(210,228,250,.7)')
}

export function sled(col = '#d9382f') {
  rounded(-7, -3.2, 14, 3, 1.4, col)
  line(-8, 0.4, 8, 0.4, '#7a5230', 1.2)
  curve([[8, 0.4], [10, -1], [9.4, -3]], '#7a5230', 1.2)
}

export function iceSkate() {
  // patín: cuchilla fina bajo el pie (se usa con mode 'skate')
  line(-3, 0.4, 3, 0.4, '#dfe9f4', 0.9)
}

// Pelota de juego (para los niños de julio y agosto).
export function playBall(t = 0, col = '#ff5a6e') {
  const c = ctx2d()
  c.save()
  c.rotate(t * 5)
  circle(0, 0, 2.6, '#fff')
  c.beginPath()
  c.arc(0, 0, 2.6, 0, TAU)
  c.clip()
  for (let i = 0; i < 3; i++) {
    c.fillStyle = [col, '#4dabf7', '#ffd24a'][i]
    c.beginPath()
    c.moveTo(0, 0)
    c.arc(0, 0, 2.7, (i * TAU) / 3, ((i + 0.5) * TAU) / 3)
    c.fill()
  }
  c.restore()
}

export function iceCreamCone(a = '#ff9ec4', b = '#fff2b3') {
  poly([[-1.4, -3.6], [1.4, -3.6], [0, 0]], '#e0a657')
  circle(0, -4.6, 1.9, a)
  circle(0, -6.4, 1.4, b)
}

// ---------------------------------------------------------------------------------------------- Reyes Magos y camellos
export function camel(t = 0, blanket = '#c0392b') {
  const stride = Math.sin(t * 2.6)
  // patas (par trasero y delantero a contrapaso)
  const legs = [[-9, 0], [-5.4, 1.6], [6, 3.2], [9.6, 4.8]]
  for (const [x, ph] of legs) {
    const sw = Math.sin(t * 2.6 + ph) * 2.4
    line(x, -11, x + sw, -1, '#b98a52', 2.8)
    ellipse(x + sw, -0.6, 2.2, 1.1, '#6b4a2a')
  }
  // cuerpo y joroba
  ellipse(0, -15, 12.4, 5.6, '#d2a468')
  ellipse(-1, -21, 5, 5.6, '#d2a468')
  ellipse(-1, -19.6, 4, 3, 'rgba(255,255,255,.18)')
  // manta y silla
  poly([[-7, -20], [5.6, -20], [6.8, -11], [-8, -11]], blanket)
  line(-7.6, -11.4, 7, -11.4, '#f6c32d', 1.2)
  for (let i = -3; i <= 3; i++) circle(i * 2.1, -10.4, 0.7, '#f6c32d')
  // cuello y cabeza
  const nod = Math.sin(t * 2.6) * 0.5
  curve([[9.6, -17], [13, -22 + nod], [14.4, -28 + nod]], '#d2a468', 4.6)
  ellipse(16.4, -29.6 + nod, 4.8, 2.9, '#d2a468', -0.2)
  circle(15.8, -30.6 + nod, 0.7, '#2a1a10')
  ellipse(14.2, -32 + nod, 1.1, 1.7, '#b98a52', -0.4)
  // cola
  curve([[-12, -16], [-14.6, -13], [-14, -9]], '#b98a52', 1.4)
  void stride
}

// Un rey montado: robe = color de la túnica, beard = color de la barba, skin = piel; lleva una ofrenda en la mano.
export function king(look, t = 0) {
  const s = Math.sin(t * 2.6) * 0.5
  // túnica y capa
  poly([[-4, -2], [4, -2], [5.4, -12], [-5.4, -12]], look.robe)
  poly([[-4.4, -11.4], [-6.6, -3 + s], [-3.6, -2]], look.cape)
  rounded(-4.6, -13, 9.2, 1.8, 0.9, '#f6c32d')
  // cabeza
  circle(0, -17, 4, look.skin)
  if (look.beard) ellipse(0, -14.4, 3.4, 2.8, look.beard)
  circle(-1.4, -17.4, 0.55, '#2a2230')
  circle(1.4, -17.4, 0.55, '#2a2230')
  // corona
  poly([[-3.6, -20.4], [-3.6, -24.6], [-1.8, -22.4], [0, -25.4], [1.8, -22.4], [3.6, -24.6], [3.6, -20.4]], '#f6c32d')
  circle(0, -22.2, 0.8, '#e0453a')
  // brazo con regalo
  line(3.6, -11.4, 7.4, -11 + s, look.robe, 2.4)
  rounded(6.2, -14.6 + s, 4.6, 3.6, 0.8, look.gift)
  rounded(8.1, -14.6 + s, 0.8, 3.6, 0, '#f6c32d')
}

export const KINGS = [
  { robe: '#c0392b', cape: '#8e2a20', skin: '#f0c9a2', beard: '#e9e5dc', gift: '#f1c40f' }, // Melchor (barba blanca)
  { robe: '#2f6fc0', cape: '#214f8a', skin: '#e7b88a', beard: '#7a4a2a', gift: '#8e44ad' }, // Gaspar
  { robe: '#6c3fb0', cape: '#4a2a80', skin: '#7a4a2f', beard: '#1c1418', gift: '#e67e22' }, // Baltasar
]
