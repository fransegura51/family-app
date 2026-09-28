import { describe, expect, it } from 'vitest'

// Corrección (2026-09-29, aprobada explícitamente — única parte del sistema WYSIWYG que se toca en esta
// fase) — bug real: useCanvasScale (el hook original) solo ajustaba la escala por ANCHO disponible. En el
// EDITOR (a diferencia de InvitationCanvasView, que nunca tiene límite de alto), eso significaba que una
// plantilla vertical con poco alto disponible cabía de sobra por ancho pero el navegador RECORTABA
// (overflow:hidden) la parte de abajo del lienzo lógico — invisible e intocable de verdad, con cualquier
// capa ahí dentro geométricamente válida pero inalcanzable, sin que el clamp de arrastre pudiera hacer
// nada (el recorte pasaba antes, a nivel de contenedor). useFitCanvasScale corrige esto calculando la
// escala como el mínimo entre lo que permite el ancho Y el alto — el lienzo completo cabe siempre entero.
const DESIGNER_SRC = (import.meta.glob('/src/ui/InvitationDesigner.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/src/ui/InvitationDesigner.tsx'
]

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('useFitCanvasScale — el lienzo del editor cabe SIEMPRE entero (ancho Y alto), nunca se recorta', () => {
  const hookFn = slice(DESIGNER_SRC, 'function useFitCanvasScale(', '\n  return scale\n}')

  it('calcula la escala como el MÍNIMO entre lo que permite el ancho y lo que permite el alto (igual que object-fit: contain)', () => {
    expect(hookFn).toContain('Math.min(rect.width / logicalWidthPx, rect.height / logicalHeightPx)')
  })

  it('usa ResizeObserver sobre el elemento medido (arquitectura estable ya existente, no un hook nuevo tipo polling)', () => {
    expect(hookFn).toContain('new ResizeObserver(update)')
    expect(hookFn).toContain('ro.disconnect()')
  })

  it('useCanvasScale (el hook original, solo por ancho) sigue intacto — lo sigue usando InvitationCanvasView, que nunca tiene límite de alto', () => {
    expect(DESIGNER_SRC).toContain('function useCanvasScale(containerRef: { current: HTMLElement | null }, logicalWidthPx: number): number {')
    expect(DESIGNER_SRC).toContain('const scale = useCanvasScale(outerRef, logicalWidthPx)')
  })
})

describe('InvitationCanvasEditor — usa useFitCanvasScale midiendo el CONTENEDOR (.invitation-canvas-wrap), no el propio lienzo', () => {
  it('un ref nuevo (canvasWrapRef) va en .invitation-canvas-wrap, distinto de canvasRef (el lienzo)', () => {
    expect(DESIGNER_SRC).toContain('const canvasWrapRef = useRef<HTMLDivElement>(null)')
    expect(DESIGNER_SRC).toContain('<div className="invitation-canvas-wrap" ref={canvasWrapRef}>')
  })

  it('canvasScale sale de useFitCanvasScale(canvasWrapRef, ...), con el ancho Y el alto lógicos — no el useCanvasScale de solo ancho', () => {
    expect(DESIGNER_SRC).toContain('const canvasScale = useFitCanvasScale(canvasWrapRef, logicalWidthPx, logicalHeightPx)')
  })

  it('el <div ref={canvasRef}> ya NO usa width:100% + aspectRatio + maxHeight:100% (el trío que permitía el recorte) — tamaño explícito derivado de canvasScale', () => {
    const canvasDivStyle = slice(DESIGNER_SRC, 'ref={canvasRef}\n                onPointerDown', 'as CSSProperties}')
    expect(canvasDivStyle).not.toContain("width: '100%'")
    expect(canvasDivStyle).not.toContain('aspectRatio:')
    expect(canvasDivStyle).not.toContain("maxHeight: '100%'")
    expect(canvasDivStyle).toContain('width: logicalWidthPx * canvasScale')
    expect(canvasDivStyle).toContain('height: logicalHeightPx * canvasScale')
    // overflow:hidden se conserva como red de seguridad, aunque ya no debería recortar nada en uso normal.
    expect(canvasDivStyle).toContain("overflow: 'hidden'")
  })
})

describe('El lienzo lógico y el renderer no cambian — solo cambia cuánto se escala visualmente el editor', () => {
  it('el contenido interno sigue siendo el mismo tamaño lógico fijo (ASSUMED_CANVAS_SIZE_PX), escalado con transform: scale(canvasScale) — misma arquitectura de siempre', () => {
    expect(DESIGNER_SRC).toContain('width: logicalWidthPx, height: logicalHeightPx, transform: `scale(${canvasScale})`, transformOrigin: \'top left\'')
  })

  it('InvitationCanvasView (la vista final de solo lectura) no se ha tocado en esta corrección', () => {
    const viewFn = slice(DESIGNER_SRC, 'export function InvitationCanvasView({', '\nconst LAYER_FONT_OPTIONS')
    expect(viewFn).toContain('useCanvasScale(outerRef, logicalWidthPx)')
    expect(viewFn).not.toContain('useFitCanvasScale')
  })

  it('recoverInaccessibleLayerPositions (domain/events.ts) no depende de ningún rect del DOM del editor — nunca se vio afectada por el recorte del contenedor, así que no hace falta tocarla', () => {
    expect(DESIGNER_SRC).toContain('recoverInaccessibleLayerPositions')
    // La propia función de dominio sigue comparando contra el lienzo lógico (assumedCanvasHeightPx /
    // ASSUMED_CANVAS_SIZE_PX), no contra ningún elemento medido en pantalla — verificado en
    // domain/invitationLayerAccessibleBounds.test.ts.
  })
})
