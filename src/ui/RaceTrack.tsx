// Carrera animada V6 (Pequeños Grandes → Puntos y recompensas) — integración de
// PEPA_Carrera_V6_Conejo_completo.html (demo aprobada) en la app real. El dibujo del paisaje, la
// pista con perspectiva, la fauna animada y el ciclo de carrera de cada corredor (24 fotogramas) se
// trasladan TAL CUAL de la demo — ningún cambio de arte ni de animación (encargo, punto 2). Lo que
// cambia es de dónde sale cada dato: los corredores son los miembros reales que participan (no "Eric"
// y "Fernando" fijos), y su posición en la pista sale de sus puntos reales del mes
// (domain/race.ts, memberLifetimePoints/monthlyRaceStandings ya calculados por el llamador).
//
// Encargo "Separar puntos de carrera y saldo de recompensas" (COR-1) — la pista YA NO dibuja los
// emojis del catálogo de recompensas en sus puntos de coste: vincular esas posiciones a la pista daba
// a entender que gastar puntos podía "retrasar" al corredor, cuando su posición sale de los puntos
// GANADOS en el mes (nunca de memberPointsBalance) y nunca baja al canjear. Las únicas marcas que
// quedan en la pista son los números de distancia (cada 5/10/25 según lo ancho que esté el tramo
// visible, raceDistanceStep) — nunca un hito del catálogo.
//
// Corrección "fotografías integradas como cabezas" — el sprite original de la V6 dibuja su propia
// cabeza como un círculo con una letra (E/F) pintada en el propio PNG; una insignia flotante aparte
// (como se hizo en la primera integración) se veía como una segunda cabeza. Ahora la foto real del
// miembro (o su color de respaldo, igual que <MemberAvatar>) se pinta DENTRO del canvas, recortada en
// círculo, en las coordenadas EXACTAS de la cabeza de ESE fotograma concreto (raceSpriteHeadAnchors.ts,
// calculado analizando los píxeles reales de cada uno de los 24 fotogramas) y con la MISMA
// transformación (x, y, escala k) que ya coloca el cuerpo — así la foto viaja pegada al cuello en toda
// la animación, sin ningún hueco, y cubre entera la cabeza original dibujada en el sprite. El nombre
// sigue en una etiqueta aparte, pero ahora solo texto (sin foto duplicada) y bajo los pies, nunca
// tapando el cuerpo, a otro corredor ni una recompensa.
import { useEffect, useMemo, useRef } from 'react'
import { getMemberPhotoUrl } from '@/data/family'
import { raceCameraRange, raceDistanceStep } from '@/domain/race'
import { raceSpriteSetA, raceSpriteSetB } from '@/ui/raceSpriteData'
import { raceHeadAnchorsA, raceHeadAnchorsB, type RaceHeadAnchor } from '@/ui/raceSpriteHeadAnchors'
import type { FamilyMember } from '@/domain/types'

export interface RaceTrackMember {
  member: FamilyMember
  points: number
}

const FRAME_COUNT = 24
const SPRITE_SETS = [raceSpriteSetA, raceSpriteSetB]
const HEAD_ANCHOR_SETS: RaceHeadAnchor[][] = [raceHeadAnchorsA, raceHeadAnchorsB]
// Un poco más grande que la cabeza original detectada, para cubrirla ENTERA (nunca un aro del dibujo
// de base asomando alrededor de la foto).
const HEAD_COVER_FACTOR = 1.2

function loadSpriteFrames(urls: string[]): HTMLImageElement[] {
  return urls.map((src) => {
    const img = new Image()
    img.src = src
    return img
  })
}

// Mismos dos diseños de corredor de la demo V6, cargados una sola vez (nunca por instancia del
// componente) y compartidos por cualquier pantalla que use RaceTrack.
const SPRITE_FRAMES = SPRITE_SETS.map(loadSpriteFrames)

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

interface PhotoCacheEntry {
  img: HTMLImageElement | null
  requestedPath: string | null
}

// Decoración mensual (opcional): una capa independiente que pinta adornos de temporada (nieve, hojas, carnaval…) sin tocar el paisaje,
// la pista, los corredores ni los puntos. Si no se pasa `decorator`, la Carrera es exactamente la de siempre. Ver src/ui/raceDecor/index.js
// (el contrato completo) y los comentarios «decoración» de abajo, donde se llama a cada gancho.
export interface RaceDecorator {
  drawBack(ctx: CanvasRenderingContext2D, env: unknown): void
  drawFront(ctx: CanvasRenderingContext2D, env: unknown): void
  drawHills?(ctx: CanvasRenderingContext2D, env: unknown): void
  drawScenery?(ctx: CanvasRenderingContext2D, env: unknown): void
  drawGround?(ctx: CanvasRenderingContext2D, env: unknown): void
  fauna?(ctx: CanvasRenderingContext2D, env: unknown, type: string, f: unknown): boolean
  frozen?(): boolean
}

export function RaceTrack({ runners, decorator }: { runners: RaceTrackMember[]; decorator?: RaceDecorator }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const badgeRefs = useRef<Record<string, HTMLDivElement | null>>({})
  // Una foto por miembro, cargada una vez y reutilizada en cada fotograma — nunca se vuelve a pedir
  // la URL firmada mientras no cambie su photoPath (igual criterio que <MemberAvatar>, pero cargada
  // como Image para poder recortarla dentro del canvas en vez de en el DOM).
  const photoCache = useRef<Record<string, PhotoCacheEntry>>({})
  function ensurePhotoLoaded(member: FamilyMember) {
    const entry = photoCache.current[member.id]
    if (entry && entry.requestedPath === member.photoPath) return
    photoCache.current[member.id] = { img: entry?.img ?? null, requestedPath: member.photoPath }
    if (!member.photoPath) return
    getMemberPhotoUrl(member.photoPath)
      .then((url) => {
        if (!url) return
        const img = new Image()
        img.onload = () => {
          photoCache.current[member.id] = { img, requestedPath: member.photoPath }
        }
        img.src = url
      })
      .catch(() => {})
  }
  // Snapshot estable de a qué corredor le toca cada diseño/carril — por ORDEN de llegada a la lista
  // de participantes, nunca recalculado al reordenar la propia lista entre renders (useMemo con la
  // clave real: los ids en el mismo orden que ya decide el llamador).
  const laneOf = useMemo(() => {
    const map: Record<string, number> = {}
    runners.forEach((r, i) => {
      map[r.member.id] = i
    })
    return map
  }, [runners.map((r) => r.member.id).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // Puntos reales viven en un ref (no en estado de React): se leen una vez por fotograma desde
  // dentro del bucle de animación, para no disparar un re-render de React 60 veces por segundo — el
  // propio canvas y la posición de las insignias DOM se actualizan directamente, sin pasar por React.
  const runnersRef = useRef(runners)
  runnersRef.current = runners
  const decoratorRef = useRef(decorator)
  decoratorRef.current = decorator

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = 800
    let H = 540
    let dpr = 1
    const display: Record<string, number> = {}
    const anchors: { i: number; x: number; y: number; size: number; bush: boolean }[] = []
    let lastDt = 1 / 60
    let curEnv: unknown = null
    const markers: { x: number; y: number; w: number; h: number }[] = []
    let camera = { min: 0, max: 30 }
    let t = 0
    let last = 0
    let raf = 0
    let destroyed = false
    const reduced = prefersReducedMotion()

    function resize() {
      const r = wrap!.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = Math.max(300, r.width)
      H = r.height
      canvas!.width = Math.round(W * dpr)
      canvas!.height = Math.round(H * dpr)
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const resizeObserver = new ResizeObserver(() => {
      resize()
      if (reduced) draw()
    })
    resizeObserver.observe(wrap)
    resize()

    function line(x1: number, y1: number, x2: number, y2: number, c: string, w = 2) {
      ctx!.strokeStyle = c
      ctx!.lineWidth = w
      ctx!.beginPath()
      ctx!.moveTo(x1, y1)
      ctx!.lineTo(x2, y2)
      ctx!.stroke()
    }
    function circle(x: number, y: number, r: number, c: string, stroke?: string, sw = 1) {
      ctx!.beginPath()
      ctx!.arc(x, y, r, 0, Math.PI * 2)
      ctx!.fillStyle = c
      ctx!.fill()
      if (stroke) {
        ctx!.strokeStyle = stroke
        ctx!.lineWidth = sw
        ctx!.stroke()
      }
    }
    function ellipse(x: number, y: number, rx: number, ry: number, c: string, angle = 0) {
      ctx!.fillStyle = c
      ctx!.beginPath()
      ctx!.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2)
      ctx!.fill()
    }
    function rounded(x: number, y: number, w: number, h: number, r: number, c: string) {
      ctx!.fillStyle = c
      ctx!.beginPath()
      ctx!.roundRect(x, y, w, h, r)
      ctx!.fill()
    }
    function text(s: string, x: number, y: number, size = 14, color = '#fff', weight = '700', align: CanvasTextAlign = 'center') {
      ctx!.font = `${weight} ${size}px system-ui, sans-serif`
      ctx!.fillStyle = color
      ctx!.textAlign = align
      ctx!.textBaseline = 'middle'
      ctx!.fillText(s, x, y)
    }

    function scenery() {
      anchors.length = 0
      const ground = H * 0.47
      const horizon = H * 0.31
      const sky = ctx!.createLinearGradient(0, 0, 0, ground)
      sky.addColorStop(0, '#77c5f8')
      sky.addColorStop(0.78, '#c9edff')
      sky.addColorStop(1, '#f3faff')
      ctx!.fillStyle = sky
      ctx!.fillRect(0, 0, W, ground)
      ctx!.fillStyle = '#a9d7a2'
      ctx!.beginPath()
      ctx!.moveTo(0, ground)
      for (let x = 0; x <= W + 12; x += 12) ctx!.lineTo(x, horizon + 20 + Math.sin(x * 0.009 + 1) * 17 + Math.sin(x * 0.024) * 5)
      ctx!.lineTo(W, ground)
      ctx!.fill()
      ctx!.fillStyle = '#7ecb7a'
      ctx!.beginPath()
      ctx!.moveTo(0, ground)
      for (let x = 0; x <= W + 12; x += 12) ctx!.lineTo(x, ground - 24 + Math.sin(x * 0.014 + 2) * 13)
      ctx!.lineTo(W, ground)
      ctx!.fill()
      decoratorRef.current?.drawHills?.(ctx!, curEnv)
      if (!reduced) {
        for (let i = 0; i < 5; i++) {
          const x = ((((i * (W + 260)) / 5 + 53 - t * 2.6) % (W + 260)) + (W + 260)) % (W + 260) - 70
          const y = 25 + ((i * 29) % 64)
          const r = 12 + ((i * 7) % 14)
          ellipse(x, y, r * 1.15, r * 0.72, '#fff')
          ellipse(x + r * 0.9, y - 4, r * 1.25, r * 0.9, '#fff')
          ellipse(x + r * 2, y + 2, r, r * 0.67, '#fff')
        }
      }
      ctx!.fillStyle = '#6fbb62'
      ctx!.fillRect(0, ground, W, H - ground)
      const offset = camera.min * 10
      for (let i = 0; i < 17; i++) {
        const seed = i * 17.37 + 3.1
        const x = (((i * 97 + Math.sin(seed) * 46 - offset * (0.23 + 0.12 * (i % 3))) % (W + 220)) + (W + 220)) % (W + 220) - 105
        const y = ground - 4 + Math.sin(seed * 2) * 5
        const size = (0.8 + (Math.sin(seed * 4) + 1) * 0.34) * (H / 380) ** 0.12
        anchors.push({ i, x, y, size, bush: i % 4 === 0 || i % 7 === 0 })
        if (i % 4 === 0 || i % 7 === 0) {
          const rr = 13 + size * 10
          ellipse(x, y - rr * 0.35, rr * 1.45, rr * 0.7, i % 2 ? '#2f9151' : '#56aa51')
          for (let j = 0; j < 4; j++) circle(x - rr * 0.9 + j * rr * 0.58, y - rr * 0.62 - ((j + i) % 3) * 3, rr * 0.44, j % 2 ? '#3c9d4e' : '#62b85c')
        } else {
          const tall = (53 + ((i * 29) % 46)) * size
          const trunk = 5 + size * 3
          line(x, y, x + Math.sin(seed) * 5, y - tall, '#785638', trunk)
          const ty = y - tall
          const palette = ['#368b53', '#489d4b', '#5aa852', '#367f60', '#6cab48']
          const col = palette[i % palette.length]
          if (i % 3 === 1) {
            ellipse(x, ty - 7, 23 * size, 33 * size, col)
            ellipse(x - 12 * size, ty + 3, 16 * size, 22 * size, '#4fa65d')
          } else if (i % 3 === 2) {
            for (let j = 0; j < 3; j++) {
              ctx!.fillStyle = j % 2 ? '#2e8553' : col
              ctx!.beginPath()
              ctx!.moveTo(x, ty - 35 * size + j * 15 * size)
              ctx!.lineTo(x - 23 * size, ty + 12 * size + j * 10 * size)
              ctx!.lineTo(x + 23 * size, ty + 12 * size + j * 10 * size)
              ctx!.fill()
            }
          } else {
            for (let j = 0; j < 5; j++) {
              const a = j * 2.4 + seed
              ellipse(x + Math.cos(a) * 17 * size, ty + Math.sin(a) * 11 * size, 18 * size, 19 * size, j % 2 ? col : '#58b763')
            }
          }
        }
      }
      for (let i = 0; i < 21; i++) {
        const x = (((i * 71 + Math.sin(i * 8.17) * 31 - offset * 0.52) % (W + 120)) + (W + 120)) % (W + 120) - 60
        const y = ground - 2 + Math.sin(i * 4.2) * 5
        const count = 1 + (i % 3)
        for (let j = 0; j < count; j++) {
          const fx = x + j * 7
          const fy = y - 5 - ((i + j) % 5) * 2
          const rr = 2.3 + ((i + j) % 3)
          line(fx, y, fx, fy, '#338c45', 1.4)
          for (let k = 0; k < 5; k++) {
            const a = (k * Math.PI * 2) / 5
            circle(fx + Math.cos(a) * rr * 1.15, fy + Math.sin(a) * rr * 1.15, rr * 0.75, ['#f6b1d1', '#fff1b5', '#f5a25f', '#dfc6fa', '#fff'][i % 5])
          }
          circle(fx, fy, rr * 0.55, '#efc74b')
        }
      }
      decoratorRef.current?.drawScenery?.(ctx!, curEnv)
    }

    function laneTop(x: number) {
      return H * (0.462 + 0.012 * (x / W - 0.5))
    }
    function laneMid(x: number) {
      return H * (0.687 + 0.008 * (x / W - 0.5))
    }
    function laneBottom(x: number) {
      return H * (0.928 - 0.008 * (x / W - 0.5))
    }
    // Carriles intermedios cuando hay más de 2 corredores — reparte el hueco entre el de arriba y el
    // de abajo en vez de amontonarlos todos en los mismos dos carriles de la demo (que solo preveía 2).
    function laneY(index: number, total: number, x: number) {
      if (total <= 1) return laneMid(x)
      const f = index / (total - 1)
      return laneTop(x) + (laneBottom(x) - laneTop(x)) * (0.18 + f * 0.72)
    }

    function coord(v: number) {
      return 36 + ((v - camera.min) / (camera.max - camera.min)) * (W - 75)
    }

    // Pinta la foto real (o el color de respaldo con la inicial, igual que <MemberAvatar>) recortada
    // en círculo, en el centro (cx,cy) y radio (r) ya convertidos a coordenadas de pantalla.
    function drawHeadPhoto(cx: number, cy: number, r: number, member: FamilyMember) {
      const entry = photoCache.current[member.id]
      ctx!.save()
      ctx!.beginPath()
      ctx!.arc(cx, cy, r, 0, Math.PI * 2)
      ctx!.closePath()
      ctx!.clip()
      if (entry?.img && entry.img.complete && entry.img.naturalWidth) {
        const iw = entry.img.naturalWidth
        const ih = entry.img.naturalHeight
        // "object-fit: cover" a mano — llena el círculo entero, recortando el sobrante, nunca
        // estirado ni con márgenes vacíos.
        const coverScale = Math.max((r * 2) / iw, (r * 2) / ih)
        const dw = iw * coverScale
        const dh = ih * coverScale
        ctx!.drawImage(entry.img, cx - dw / 2, cy - dh / 2, dw, dh)
      } else {
        ctx!.fillStyle = member.color
        ctx!.fillRect(cx - r, cy - r, r * 2, r * 2)
        text(member.name.charAt(0).toUpperCase(), cx, cy + r * 0.07, r * 1.1, '#fff', '800')
      }
      ctx!.restore()
      // Borde fino del color identificativo del miembro — igual criterio que <MemberAvatar>.
      ctx!.beginPath()
      ctx!.arc(cx, cy, r, 0, Math.PI * 2)
      ctx!.strokeStyle = member.color
      ctx!.lineWidth = Math.max(1.5, r * 0.12)
      ctx!.stroke()
    }

    function runner(x: number, baseY: number, phase: number, setIndex: number, scale: number, member: FamilyMember) {
      const lane = setIndex % SPRITE_FRAMES.length
      const frames = SPRITE_FRAMES[lane]
      const anchors = HEAD_ANCHOR_SETS[lane]
      const idx = Math.floor((((phase / (Math.PI * 2)) % 1) + 1) % 1 * FRAME_COUNT)
      const im = frames[idx]
      if (!im.complete || !im.naturalWidth) return
      // Con 1 solo corredor, el carril es la pista entera (igual de grande que en la demo V6 con 2 —
      // nunca más pequeño encima por asumir un mínimo de 2 carriles que no existen).
      const laneHeight = (H * 0.93 - H * 0.47) / Math.max(1, runnersRef.current.length)
      const k = Math.min(0.82, (laneHeight - 10) / im.height) * scale
      // Durante los primerísimos fotogramas (antes de que ResizeObserver mida el canvas de verdad),
      // H puede ser diminuto y dar una escala negativa — ctx.arc() lanza con un radio negativo
      // (drawImage simplemente lo toleraba antes de esta corrección); se salta el fotograma entero,
      // el siguiente ya llega con H real.
      if (k <= 0) return
      const destX = x - (im.width * k) / 2
      const destY = baseY - im.height * k
      ctx!.drawImage(im, destX, destY, im.width * k, im.height * k)
      // La foto se ancla con la MISMA transformación (destX/destY/k) que acaba de colocar el cuerpo
      // de ESTE fotograma concreto — nunca se desincroniza de la animación, aunque cambie de pose.
      const anchor = anchors[idx]
      const headCx = destX + anchor.cx * im.width * k
      const headCy = destY + anchor.cy * im.height * k
      const headR = anchor.r * im.width * k * HEAD_COVER_FACTOR
      drawHeadPhoto(headCx, headCy, headR, member)
    }

    function track() {
      markers.length = 0
      const poly = (a: (x: number) => number, b: (x: number) => number, color: string) => {
        ctx!.fillStyle = color
        ctx!.beginPath()
        ctx!.moveTo(0, a(0))
        ctx!.lineTo(W, a(W))
        ctx!.lineTo(W, b(W))
        ctx!.lineTo(0, b(0))
        ctx!.closePath()
        ctx!.fill()
      }
      poly(laneTop, laneBottom, '#b85c43')
      poly(laneTop, laneMid, '#d67b5b')
      poly(laneMid, laneBottom, '#c66c4f')
      ctx!.fillStyle = '#9e503e'
      ctx!.beginPath()
      ctx!.moveTo(0, laneBottom(0))
      ctx!.lineTo(W, laneBottom(W))
      ctx!.lineTo(W, laneBottom(W) + 8)
      ctx!.lineTo(0, laneBottom(0) + 8)
      ctx!.fill()
      for (const y of [laneTop, laneMid, laneBottom]) {
        ctx!.beginPath()
        ctx!.moveTo(0, y(0))
        ctx!.lineTo(W, y(W))
        ctx!.strokeStyle = '#fff0dc'
        ctx!.lineWidth = y === laneBottom ? 3.5 : 2.5
        ctx!.stroke()
      }
      ctx!.fillStyle = 'rgba(255,218,170,.14)'
      for (let i = 0; i < 75; i++) {
        const x = (i * 73.31) % W
        const y = laneTop(x) + 10 + ((i * 53.19) % (laneBottom(x) - laneTop(x) - 20))
        ctx!.fillRect(x, y, 1.7, 1)
      }
      const step = raceDistanceStep(camera)
      const start = Math.ceil(camera.min / step) * step
      for (let v = start; v <= camera.max + step; v += step) {
        const x = coord(v)
        if (x < -20 || x > W + 20) continue
        ctx!.save()
        ctx!.setLineDash([7, 7])
        line(x + 8, laneTop(x) + 8, x - 8, laneBottom(x) - 6, '#fff0dc', 1.7)
        ctx!.restore()
        rounded(x - 17, laneTop(x) + 6, 34, 21, 6, '#a74f3d')
        text(String(v), x, laneTop(x) + 16, 12, '#fff')
        markers.push({ x, y: laneTop(x) + 6, w: 34, h: 21 })
      }
      return { mid: laneMid(W / 2), bottom: laneBottom(W / 2) }
    }

    // Fauna animada — igual que la demo V6, desactivada con "reducir movimiento".
    let wildlifeEvent: { type: string; dir: number; start: number; duration: number; variant: number; phase: number } | null = null
    let nextWildlife = 2
    let animalTurn = 0
    let animalSeed = 92317
    let lastAnimalDirection = 1
    function rnd() {
      animalSeed = (1664525 * animalSeed + 1013904223) >>> 0
      return animalSeed / 4294967296
    }
    function startWildlife() {
      const type = ['bird', 'rabbit', 'butterfly'][animalTurn++ % 3]
      const dir = rnd() < 0.7 ? -lastAnimalDirection : lastAnimalDirection
      lastAnimalDirection = dir
      wildlifeEvent = { type, dir, start: t, duration: type === 'bird' ? 8 : type === 'rabbit' ? 9 : 7.5, variant: rnd(), phase: rnd() * 6.28 }
    }
    function wildlife() {
      if (reduced) return
      if (!wildlifeEvent && t >= nextWildlife) startWildlife()
      if (!wildlifeEvent) return
      const e = wildlifeEvent
      const age = t - e.start
      const u = Math.min(1, age / e.duration)
      const g = H * 0.47
      if (u >= 1) {
        wildlifeEvent = null
        nextWildlife = t + 3 + rnd() * 5
        return
      }
      const dir = e.dir
      const scale = Math.max(0.55, Math.min(0.82, W / 900))
      if (decoratorRef.current?.fauna?.(ctx!, curEnv, e.type, { age, u, dir, scale, phase: e.phase, g })) return
      ctx!.save()
      if (e.type === 'bird') {
        const x = dir === 1 ? -38 + (W + 76) * u : W + 38 - (W + 76) * u
        const y = Math.max(25, g - 134) + Math.sin(u * 7 + e.phase) * 5
        ctx!.translate(x, y)
        ctx!.scale(dir * scale, scale)
        const flap = Math.sin(age * 14)
        const lift = -7 - flap * 16
        ctx!.fillStyle = '#365e82'
        ctx!.beginPath()
        ctx!.moveTo(-13, 4)
        ctx!.lineTo(-30, 2)
        ctx!.lineTo(-23, 10)
        ctx!.lineTo(-12, 10)
        ctx!.fill()
        ctx!.fillStyle = '#4e93bb'
        ctx!.beginPath()
        ctx!.moveTo(-2, 0)
        ctx!.quadraticCurveTo(4, lift - 2, 16, lift - 17)
        ctx!.quadraticCurveTo(15, lift + 4, 5, 7)
        ctx!.closePath()
        ctx!.fill()
        ellipse(-4, 4, 16, 9, '#3684b1')
        ellipse(-1, 9, 11, 4, '#f0d8ad')
        ellipse(11, -2, 8, 8, '#3684b1')
        circle(14, -4, 1.4, '#132c38')
        ctx!.fillStyle = '#dca34b'
        ctx!.beginPath()
        ctx!.moveTo(18, -1)
        ctx!.lineTo(27, 2)
        ctx!.lineTo(18, 4)
        ctx!.fill()
        ctx!.fillStyle = '#28658e'
        ctx!.beginPath()
        ctx!.moveTo(-7, 0)
        ctx!.quadraticCurveTo(-16, lift - 3, -25, lift - 17)
        ctx!.quadraticCurveTo(-29, lift + 5, -13, 7)
        ctx!.closePath()
        ctx!.fill()
        line(-4, 12, -7, 17, '#bd844c', 1.3)
      } else if (e.type === 'rabbit') {
        const x = dir === 1 ? -40 + (W + 80) * u : W + 40 - (W + 80) * u
        const hop = Math.pow(Math.max(0, Math.sin(age * 8.3)), 1.6) * 6
        ctx!.translate(x, H * 0.967 - hop)
        ctx!.scale(dir * scale, scale)
        ellipse(-17, 0, 6, 6, '#fff7ee')
        ellipse(-2, -4, 22, 13, '#e8e1d7')
        ellipse(17, -13, 11, 10, '#f2ebe1')
        ellipse(10, -32, 4.5, 16, '#e8e1d7', -0.18)
        ellipse(23, -32, 4.5, 16, '#e8e1d7', 0.17)
        ellipse(10, -32, 2, 12, '#dfa9ae', -0.18)
        ellipse(23, -32, 2, 12, '#dfa9ae', 0.17)
        ellipse(-10, 8 + Math.sin(age * 16) * 2, 9, 4, '#d4c8ba')
        ellipse(12, 8 - Math.sin(age * 16) * 2, 9, 4, '#d4c8ba')
        circle(23, -15, 2.2, '#302b2a')
        circle(29, -9, 1.7, '#cf8b93')
      } else {
        const x = dir === 1 ? -30 + (W + 60) * u : W + 30 - (W + 60) * u
        const y = g - 47 - 9 * Math.sin(u * Math.PI) + Math.sin(age * 5 + e.phase) * 10
        ctx!.translate(x, y)
        ctx!.scale(dir * scale, scale)
        const spread = 0.25 + 0.75 * Math.abs(Math.cos(age * 12))
        ctx!.scale(spread, 1)
        for (const side of [-1, 1]) {
          ellipse(side * 10, -7, 13, 17, '#f3a344', side * 0.3)
          ellipse(side * 9, 11, 10, 11, '#f9bb66', -side * 0.3)
          ctx!.strokeStyle = '#49362b'
          ctx!.lineWidth = 2
          ctx!.beginPath()
          ctx!.ellipse(side * 10, -7, 13, 17, side * 0.3, 0, Math.PI * 2)
          ctx!.stroke()
          circle(side * 15, -12, 2.3, '#fff4d4')
          circle(side * 9, 11, 2, '#fff4d4')
        }
        ellipse(0, 2, 2.7, 15, '#44372d')
        line(-1, -10, -5, -18, '#44372d', 1)
        line(1, -10, 5, -18, '#44372d', 1)
      }
      ctx!.restore()
    }

    // Solo el NOMBRE ahora (la foto ya se pinta dentro del canvas, en la propia cabeza) — colocado
    // bajo los pies del corredor, nunca tapando su cuerpo, a otro corredor ni una recompensa (que
    // vive por encima de la pista, en track()).
    function positionBadges() {
      const list = runnersRef.current
      for (const r of list) {
        const el = badgeRefs.current[r.member.id]
        if (!el) continue
        const idx = laneOf[r.member.id] ?? 0
        const x = coord(display[r.member.id] ?? 0)
        const y = laneY(idx, list.length, x) + 2
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, 0)`
      }
    }

    function draw() {
      ctx!.clearRect(0, 0, W, H)
      const decor = decoratorRef.current
      const env = decor
        ? { W, H, t, dt: lastDt, reduced, ground: H * 0.47, laneTop, laneMid, laneBottom, camera, offset: camera.min * 10, anchors, markers, runnerCount: runnersRef.current.length }
        : null
      curEnv = env
      scenery()
      track()
      if (decor && env) decor.drawGround?.(ctx!, env)
      wildlife()
      if (decor && env) decor.drawBack(ctx!, env)
      const list = runnersRef.current
      // El número de corredores ya encoge el sprite dentro de runner() (laneHeight se reparte entre
      // todos) — aquí solo se ajusta por el ANCHO real de pantalla, nunca una segunda vez por cantidad.
      const size = Math.max(0.6, Math.min(1.0, W / 570))
      list.forEach((r, i) => {
        ensurePhotoLoaded(r.member)
        const x = coord(display[r.member.id] ?? 0)
        const y = laneY(i, list.length, x) - 5
        const phase = reduced ? 0 : t * (Math.PI * 2 / 1.44) + i * 1.15
        runner(x, y, phase, laneOf[r.member.id] ?? i, size, r.member)
      })
      const decorFront = decoratorRef.current
      if (decorFront && env) decorFront.drawFront(ctx!, env)
      positionBadges()
    }

    function tick(ms: number) {
      if (destroyed) return
      if (decoratorRef.current?.frozen?.()) {
        last = ms
        if (!reduced) raf = requestAnimationFrame(tick)
        return
      }
      if (!last) last = ms
      const dt = Math.min(0.06, (ms - last) / 1000)
      last = ms
      lastDt = dt
      if (!reduced) t += dt
      const list = runnersRef.current
      for (const r of list) {
        if (display[r.member.id] === undefined) display[r.member.id] = r.points
        display[r.member.id] += (r.points - display[r.member.id]) * Math.min(1, dt * 3.5)
      }
      const target = raceCameraRange(list.map((r) => r.points))
      const f = reduced ? 1 : Math.min(1, dt * 2.3)
      camera.min += (target.min - camera.min) * f
      camera.max += (target.max - camera.max) * f
      draw()
      if (!reduced) raf = requestAnimationFrame(tick)
    }

    if (reduced) {
      // Un único fotograma estático, en la posición real — sin bucle, sin fauna, sin nubes.
      tick(0)
    } else {
      raf = requestAnimationFrame(tick)
    }

    return () => {
      destroyed = true
      if (raf) cancelAnimationFrame(raf)
      resizeObserver.disconnect()
    }
    // El bucle lee runnersRef en cada fotograma — no hace falta reiniciarlo cuando cambian los
    // puntos, solo al montar/desmontar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="race-track-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} className="race-track-canvas" aria-label={raceTrackAriaLabel(runners)} role="img" />
      {runners.map((r) => (
        <div
          key={r.member.id}
          className="race-track-badge"
          ref={(el) => {
            badgeRefs.current[r.member.id] = el
          }}
        >
          <span className="race-track-badge-name">{r.member.name}</span>
        </div>
      ))}
    </div>
  )
}

function raceTrackAriaLabel(runners: RaceTrackMember[]): string {
  const names = runners.map((r) => `${r.member.name} (${r.points} puntos este mes)`).join(', ')
  return `Carrera animada: ${names || 'sin participantes todavía'}`
}
