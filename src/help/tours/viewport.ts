// Geometría del tutorial frente al teclado y la barra del navegador (B4-UX01). Funciones puras (se prueban sin navegador) más la lectura de `visualViewport`.
//
// El problema en iOS Safari / app instalada: al abrirse el teclado la altura del "viewport de diseño" (window.innerHeight) NO cambia; lo que cambia es el "viewport visual" (visualViewport:
// altura menor y, a veces, un desplazamiento offsetTop). Lo que está `position: fixed` sigue anclado al viewport de diseño, así que un panel anclado «abajo» queda detrás del teclado y
// un marco calculado con valores antiguos se queda desalineado. Por eso la capa del tutorial se ajusta al viewport visual y todo se mide respecto a él.

export interface VisibleArea {
  /** Esquina del área visible, en coordenadas del viewport de diseño (las de getBoundingClientRect). */
  top: number
  left: number
  width: number
  height: number
  /** Hay un teclado (u otra barra) tapando la parte baja del viewport de diseño. */
  keyboard: boolean
  /** Espacio escaso: el panel debe ser más compacto. */
  compact: boolean
}

const KEYBOARD_MIN_COVER = 100 // px que debe tapar algo para considerarlo un teclado (las barras de Safari mueven menos)
const COMPACT_BELOW = 520 // altura visible por debajo de la cual el panel se compacta

export function readVisibleArea(): VisibleArea {
  const w = typeof window === 'undefined' ? { innerWidth: 1024, innerHeight: 768, visualViewport: null } : window
  const vv = w.visualViewport
  if (!vv) return { top: 0, left: 0, width: w.innerWidth, height: w.innerHeight, keyboard: false, compact: w.innerHeight < COMPACT_BELOW }
  const zoomed = vv.scale > 1.05 // con el zoom de pellizco la altura visual también baja: no es un teclado
  const covered = w.innerHeight - (vv.height + vv.offsetTop)
  const keyboard = !zoomed && covered > KEYBOARD_MIN_COVER
  return {
    top: vv.offsetTop,
    left: vv.offsetLeft,
    width: vv.width,
    height: vv.height,
    keyboard,
    compact: keyboard || vv.height < COMPACT_BELOW,
  }
}

export function sameArea(a: VisibleArea, b: VisibleArea): boolean {
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height && a.keyboard === b.keyboard && a.compact === b.compact
}

export interface Span {
  top: number
  bottom: number
}

const overlap = (a: Span, b: Span) => Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))

/**
 * Decide en qué lado va el panel para NO tapar el control resaltado. Coordenadas relativas al área visible.
 * `bottomOffset`: hueco que el panel deja por abajo (la barra de navegación, o casi nada con el teclado). Si el lado actual no tapa el control se mantiene (sin saltos).
 */
export function choosePanelSide(ring: Span | null, areaHeight: number, panelHeight: number, bottomOffset: number, current: 'top' | 'bottom' = 'bottom', margin = 8): 'top' | 'bottom' {
  if (!ring) return current
  const top: Span = { top: margin, bottom: margin + panelHeight }
  const bottom: Span = { top: areaHeight - bottomOffset - panelHeight, bottom: areaHeight - bottomOffset }
  const oTop = overlap(ring, top)
  const oBottom = overlap(ring, bottom)
  if ((current === 'top' ? oTop : oBottom) === 0) return current
  if (oTop === 0 && oBottom === 0) return current
  if (oTop === oBottom) return (ring.top + ring.bottom) / 2 > areaHeight / 2 ? 'top' : 'bottom'
  return oTop < oBottom ? 'top' : 'bottom'
}

/**
 * Cuánto hay que desplazar el contenido (px; positivo = hacia abajo en la página, es decir, el control sube) para que el control quede entero dentro de la zona libre
 * (el área visible menos el panel). 0 si ya se ve. Si no cabe entero, se prioriza ver su parte de arriba.
 */
export function scrollDeltaToReveal(ring: Span, freeTop: number, freeBottom: number, margin = 8): number {
  const top = freeTop + margin
  const bottom = freeBottom - margin
  if (ring.top < top) return ring.top - top
  if (ring.bottom > bottom) return Math.min(ring.bottom - bottom, ring.top - top)
  return 0
}

/** Zona libre (relativa al área visible) que deja el panel, según el lado y su altura. */
export function freeZone(side: 'top' | 'bottom', areaHeight: number, panelHeight: number, bottomOffset: number, margin = 8): Span {
  return side === 'top' ? { top: margin * 2 + panelHeight, bottom: areaHeight } : { top: 0, bottom: areaHeight - bottomOffset - panelHeight - margin }
}

export type PanelMode = 'full' | 'compact' | 'pill'
export const COMPACT_HEIGHT = 170
export const PILL_HEIGHT = 56

export interface PanelPlanInput {
  areaHeight: number
  /** Altura de la tarjeta COMPLETA (medida). */
  fullHeight: number
  bottomOffset: number
  /** Zonas (relativas al área visible) que la tarjeta NO puede tapar: el control resaltado y los `keepVisible`. */
  protect: Span[]
  /** Zonas de hojas o diálogos propios de la app abiertos que no son el objetivo (sus opciones deben seguir pulsables). */
  guard: Span[]
  current: 'top' | 'bottom'
  /** Lado elegido a mano con «↕ Mover» para este paso. */
  manual?: 'top' | 'bottom' | null
  margin?: number
}

export interface PanelPlan {
  side: 'top' | 'bottom'
  mode: PanelMode
  /** Ninguna colocación evita taparlo todo: se usa la menos mala (píldora) y queda el botón «↕ Mover». */
  unsatisfiable: boolean
}

/**
 * Dónde y cómo se pinta la tarjeta del tutorial. Función pura. Prueba, en este orden, y se queda con la PRIMERA que no tapa nada de lo que hay que dejar a la vista:
 * lado actual completa → otro lado completa → lado actual compacta → otro compacta → píldora en cada lado. Con un lado elegido a mano solo se prueba ese lado (completa, compacta, píldora).
 * Si ninguna sirve, devuelve la que menos tapa (la píldora) con `unsatisfiable: true`.
 */
export function planPanel(i: PanelPlanInput): PanelPlan {
  const margin = i.margin ?? 8
  const heights: Record<PanelMode, number> = { full: Math.max(i.fullHeight, 1), compact: Math.min(Math.max(i.fullHeight, 1), COMPACT_HEIGHT), pill: PILL_HEIGHT }
  const rectOf = (side: 'top' | 'bottom', mode: PanelMode): Span =>
    side === 'top' ? { top: margin, bottom: margin + heights[mode] } : { top: i.areaHeight - i.bottomOffset - heights[mode], bottom: i.areaHeight - i.bottomOffset }
  const cost = (side: 'top' | 'bottom', mode: PanelMode) => [...i.protect, ...i.guard].reduce((n, s) => n + overlap(rectOf(side, mode), s), 0)
  const other = i.current === 'top' ? 'bottom' : 'top'
  const modes: PanelMode[] = ['full', 'compact', 'pill']
  const candidates: Array<['top' | 'bottom', PanelMode]> = i.manual
    ? modes.map((m) => [i.manual as 'top' | 'bottom', m])
    : [
        [i.current, 'full'],
        [other, 'full'],
        [i.current, 'compact'],
        [other, 'compact'],
        [i.current, 'pill'],
        [other, 'pill'],
      ]
  for (const [side, mode] of candidates) if (cost(side, mode) === 0) return { side, mode, unsatisfiable: false }
  // Ninguna vale: la píldora que menos tape.
  const pills = candidates.filter(([, m]) => m === 'pill')
  const best = pills.reduce((a, b) => (cost(b[0], 'pill') < cost(a[0], 'pill') ? b : a), pills[0])
  return { side: best[0], mode: 'pill', unsatisfiable: true }
}

function isScrollable(el: HTMLElement): boolean {
  const oy = window.getComputedStyle(el).overflowY
  return (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1
}

/** Desplaza el contenedor con scroll más cercano al control (o la página) `dy` px. No toca el control ni nada del formulario. */
export function scrollContentBy(el: HTMLElement, dy: number): void {
  if (!dy) return
  for (let p: HTMLElement | null = el.parentElement; p && p !== document.body; p = p.parentElement) {
    if (isScrollable(p)) {
      p.scrollTop += dy
      return
    }
  }
  window.scrollBy?.(0, dy)
}
