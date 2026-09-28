import { describe, expect, it } from 'vitest'

// Corrección (2026-09-28, tras probar Decorar en iPhone) — bug real: arrastrar una capa (reproducido con
// formas de corazón) hasta el borde/esquina del lienzo dejaba su centro exactamente en el límite (0 o 1)
// sin tener en cuenta su propio tamaño — el lienzo recorta (overflow:hidden) todo lo que se sale, así que
// el resto visible podía ser un cuadrado de menos de 30×30px: una capa persistente pero inaccesible (no
// se podía volver a seleccionar, mover ni borrar). Ver domain/invitationLayerAccessibleBounds.test.ts para
// las pruebas de la lógica de dominio (clampLayerCenterAccessible/recoverInaccessibleLayerPositions) —
// aquí solo se comprueba que la UI las usa donde debe, en el único punto común (sin parche por tipo).
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

describe('handleDragPointerMove — arrastre consciente del tamaño real de la capa, mismo motor para las 5 capas', () => {
  const fn = slice(DESIGNER_SRC, 'function handleDragPointerMove', 'function handleDragPointerUp')
  const moveMode = slice(DESIGNER_SRC, "if (d.mode === 'move') {", "} else {")

  it('importa clampLayerCenterAccessible/estimateLayerBoxFraction/recoverInaccessibleLayerPositions de domain/events (no reimplementa el cálculo)', () => {
    const importBlock = DESIGNER_SRC.slice(DESIGNER_SRC.indexOf('import {'), DESIGNER_SRC.indexOf("} from '@/domain/events'"))
    expect(importBlock).toContain('clampLayerCenterAccessible')
    expect(importBlock).toContain('estimateLayerBoxFraction')
    expect(importBlock).toContain('recoverInaccessibleLayerPositions')
  })

  it('ya no usa el clamp ciego a [0,1] — el modo "move" pasa por clampLayerCenterAccessible con el tamaño real de la capa', () => {
    expect(fn).not.toContain('clamp(d.x0! + dx, 0, 1)')
    expect(fn).not.toContain('clamp(d.y0! + dy, 0, 1)')
    expect(moveMode).toContain('estimateLayerBoxFraction(l, zoneWidthFrac, imageAspectNumeric)')
  })

  it('corrección real (seguía fallando en iPhone real): el umbral se compara contra el tamaño REAL en pantalla del lienzo (d.rectW/d.rectH, medido al empezar este arrastre), no contra el lienzo lógico fijo — si el lienzo ha tenido que encogerse más en este dispositivo/plantilla, "36px lógicos" ya no equivalen a 36px reales, y el hueco dejaba de ser tocable de verdad', () => {
    expect(moveMode).toContain('clampLayerCenterAccessible(d.x0! + dx, box.halfWidth * scale, d.rectW!)')
    expect(moveMode).toContain('clampLayerCenterAccessible(d.y0! + dy, box.halfHeight * scale, d.rectH!)')
    // Ni ASSUMED_CANVAS_SIZE_PX ni logicalHeightPx (el lienzo lógico de referencia) en el propio cálculo
    // del clamp — solo el rect real capturado en handleLayerPointerDown.
    expect(moveMode).not.toContain('ASSUMED_CANVAS_SIZE_PX)')
    expect(moveMode).not.toContain('logicalHeightPx)')
  })

  it('sin ninguna rama por layer.type — mismo cálculo para texto/datos/foto/emoji/forma (si hiciera falta un parche por tipo, el bug pediría arreglarlo en un solo punto común, no aquí)', () => {
    expect(moveMode).not.toMatch(/l\.type ===|layer\.type ===/)
  })

  it('el modo "transform" (pellizcar para rotar/escalar) no se ha tocado — el bug era de posición (move), no de escala/rotación', () => {
    const transformMode = slice(DESIGNER_SRC, "} else {\n      const dx = e.clientX - d.centerPx", 'function handleDragPointerUp')
    expect(transformMode).toContain("clamp(d.scale0! * (dist / d.dist0!), 0.3, 3)")
  })
})

describe('Recuperación al abrir una invitación guardada — capas ya inaccesibles se recolocan lo mínimo necesario', () => {
  const loadEffect = slice(DESIGNER_SRC, 'getEventInvitation(event.id)', 'setBackgroundOffsetX(loadedOffsetX)')

  it('usa recoverInaccessibleLayerPositions al fijar las capas cargadas, con el imageAspect real de esa invitación (plantilla o foto de fondo)', () => {
    expect(loadEffect).toContain('setLayers(recoverInaccessibleLayerPositions(invitation.canvas.layers, loadedImageAspect))')
    expect(loadEffect).not.toContain('setLayers(invitation.canvas.layers)')
  })

  it('savedSnapshotRef sigue comparando contra lo que de verdad hay guardado (canvas.layers SIN recuperar) — una recuperación real se ve como "cambios sin guardar", nunca se reescribe la base de datos en silencio', () => {
    const snapshotCall = slice(DESIGNER_SRC, 'savedSnapshotRef.current = comparableSnapshotKey({\n            layers:', '})')
    expect(snapshotCall).toContain('layers: invitation.canvas.layers,')
    expect(snapshotCall).not.toContain('recoverInaccessibleLayerPositions')
  })
})
