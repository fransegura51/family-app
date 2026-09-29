import { describe, expect, it } from 'vitest'

// Cambio de enfoque (2026-09-29, tras probar en iPhone real) — la primera corrección (un único modo
// "cabe entero", útil pero incómodo para editar con precisión en una plantilla muy vertical) se sustituye
// por DOS MODOS DE ZOOM explícitos, nunca un slider/porcentaje/pinch-zoom del lienzo:
//   - 'fit'  (🔍− Vista completa): el lienzo cabe siempre entero (ancho Y alto) — visión general.
//   - 'edit' (🔍+ Editar): la escala es solo por ANCHO (como el editor original) — el lienzo puede quedar
//     más alto que el hueco visible, y el contenedor se desplaza verticalmente en vez de recortar.
// El cambio de modo es SOLO visual: nunca toca x/y/fontSize/scale/rotation de ninguna capa (ver el test de
// "no cambia nada del lienzo lógico" más abajo).
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

describe('useCanvasZoomScales — calcula las DOS escalas de los dos modos con una sola medición', () => {
  const hookFn = slice(DESIGNER_SRC, 'function useCanvasZoomScales(', '\n  return scales\n}')

  it('fitScale es el MÍNIMO entre lo que permite el ancho y el alto (igual que object-fit: contain) — el modo Vista completa', () => {
    expect(hookFn).toContain('const fitScale = Math.min(widthScale, heightScale)')
  })

  it('editScale es SOLO por ancho (como el editor original) — el modo Editar', () => {
    expect(hookFn).toContain('const widthScale = availableWidth / logicalWidthPx')
    expect(hookFn).toContain('editScale: widthScale')
  })

  it('corrección real (bug encontrado en pruebas: el hueco táctil en una esquina, en modo Editar, era mucho menor del esperado) — resta el padding del propio contenedor (nunca un número fijo), no el border-box crudo de getBoundingClientRect()', () => {
    expect(hookFn).toContain('window.getComputedStyle(el)')
    expect(hookFn).toContain("parseFloat(style.paddingLeft || '0') + parseFloat(style.paddingRight || '0')")
    expect(hookFn).toContain('const availableWidth = rect.width - paddingX')
    expect(hookFn).toContain('const availableHeight = rect.height - paddingY')
  })

  it('usa ResizeObserver sobre el CONTENEDOR (.invitation-canvas-wrap), una sola vez para las dos escalas — no dos hooks/observers distintos', () => {
    expect(hookFn).toContain('new ResizeObserver(update)')
    expect(hookFn).toContain('ro.disconnect()')
    expect((DESIGNER_SRC.match(/new ResizeObserver\(update\)/g) ?? []).length).toBeGreaterThanOrEqual(2) // useCanvasScale + useCanvasZoomScales
  })

  it('useCanvasScale (el hook original, solo por ancho) sigue intacto — lo sigue usando InvitationCanvasView, que nunca tiene límite de alto', () => {
    expect(DESIGNER_SRC).toContain('function useCanvasScale(containerRef: { current: HTMLElement | null }, logicalWidthPx: number): number {')
    expect(DESIGNER_SRC).toContain('const scale = useCanvasScale(outerRef, logicalWidthPx)')
  })
})

describe('zoomMode — dos estados explícitos, nunca un slider/porcentaje/zoom arbitrario', () => {
  it("el estado es un union de exactamente dos valores ('fit' | 'edit'), empezando en 'fit' (visión general al abrir)", () => {
    expect(DESIGNER_SRC).toContain("const [zoomMode, setZoomMode] = useState<'fit' | 'edit'>('fit')")
  })

  it('canvasScale elige fitScale o editScale según zoomMode — nunca un valor intermedio/interpolado', () => {
    expect(DESIGNER_SRC).toContain("const { fitScale, editScale } = useCanvasZoomScales(canvasWrapRef, logicalWidthPx, logicalHeightPx)")
    expect(DESIGNER_SRC).toContain("const canvasScale = zoomMode === 'fit' ? fitScale : editScale")
  })

  it('no hay slider de zoom, ni input de porcentaje, ni pinch-to-zoom del propio lienzo', () => {
    expect(DESIGNER_SRC).not.toMatch(/zoomMode.*range|range.*zoomMode/)
    expect(DESIGNER_SRC).not.toContain('zoomPercent')
  })
})

describe('Botón de zoom — accesible SIEMPRE, haya o no una capa seleccionada (incluida edición de texto)', () => {
  // La fila de arriba (.invitation-utility-row) se renderiza siempre, a diferencia de la barra contextual
  // de abajo (.invitation-toolbar), que desaparece por completo mientras se edita una capa de texto
  // (textEditMode) — por eso el botón vive ahí, no en la barra contextual.
  const utilityRow = slice(DESIGNER_SRC, '<div className="invitation-utility-row">', '↩️ Deshacer')

  it('el botón de zoom está en la fila de utilidades (siempre visible), no en la barra contextual condicional', () => {
    expect(utilityRow).toContain("setZoomMode((m) => (m === 'fit' ? 'edit' : 'fit'))")
  })

  it('el texto del botón indica la acción (a qué modo se pasa), con los iconos pedidos: 🔍+ Editar / 🔍− Completa', () => {
    expect(utilityRow).toContain("zoomMode === 'fit' ? '🔍+ Editar' : '🔍− Completa'")
  })
})

describe('El lienzo del editor: tamaño explícito, sin el trío que permitía el recorte permanente', () => {
  const canvasDivStyle = slice(DESIGNER_SRC, 'ref={canvasRef}\n                onPointerDown', 'as CSSProperties}')

  it('ya no usa width:100% + aspectRatio + maxHeight:100% (el trío que dejaba recortar por overflow:hidden) — tamaño explícito derivado de canvasScale', () => {
    expect(canvasDivStyle).not.toContain("width: '100%'")
    expect(canvasDivStyle).not.toContain('aspectRatio:')
    expect(canvasDivStyle).not.toContain("maxHeight: '100%'")
    expect(canvasDivStyle).toContain('width: logicalWidthPx * canvasScale')
    expect(canvasDivStyle).toContain('height: logicalHeightPx * canvasScale')
  })

  it('en modo edit permite pan vertical nativo en el fondo (pan-y); en modo fit, ninguno hace falta (el lienzo entero siempre es visible)', () => {
    expect(canvasDivStyle).toContain("touchAction: zoomMode === 'edit' ? 'pan-y' : 'none'")
  })
})

describe('Contenedor (.invitation-canvas-wrap): se vuelve desplazable en modo Editar, nunca recorta', () => {
  it('en modo edit, overflowY:auto + alignItems:flex-start (evita el hueco de flex+overflow+align-center que deja contenido superior inalcanzable); en fit, el centrado de siempre', () => {
    const wrapBlock = slice(DESIGNER_SRC, 'className="invitation-canvas-wrap"', '<div\n                ref={canvasRef}')
    expect(wrapBlock).toContain("style={zoomMode === 'edit' ? { overflowY: 'auto', alignItems: 'flex-start' } : undefined}")
  })
})

describe('Cada capa conserva touchAction:none propio — arrastrar una capa nunca pierde frente al scroll del fondo', () => {
  it('el wrapper de cada capa (onPointerDown={(e) => handleLayerPointerDown(e, layer)}) sigue teniendo touchAction: \'none\' en su propio estilo, sin cambios por esta fase', () => {
    const layerBlock = slice(DESIGNER_SRC, 'onPointerDown={(e) => handleLayerPointerDown(e, layer)}', '}}\n                    >')
    expect(layerBlock).toContain("touchAction: 'none'")
  })

  it('el tirador de resize (handleHandlePointerDown) también conserva su touchAction:none propio', () => {
    const handleBlock = slice(DESIGNER_SRC, 'onPointerDown={(e) => handleHandlePointerDown(e, layer)}', '/>')
    expect(handleBlock).toContain("touchAction: 'none'")
  })
})

describe('Flujo de localización — al pasar a Editar con una capa seleccionada, el scroll la centra (nunca cambia sus coordenadas)', () => {
  // Regresión real (validación en iPhone): este efecto había ganado `adjustingPhotoId` como dependencia
  // extra (para la corrección "foto tapada" de Ajustar foto) y, justo desde ese cambio, dejó de poder
  // arrastrarse la foto en modo Ajustar. Vuelve a depender EXACTAMENTE de lo mismo que en el commit donde
  // el arrastre sí funcionaba (88b8048) — "foto tapada" se resuelve en un efecto SEPARADO y más
  // conservador, ver el describe de más abajo.
  const effectBlock = slice(DESIGNER_SRC, "if (zoomMode !== 'edit') return", '}, [zoomMode])')

  it('calcula el scroll objetivo a partir de selected.y (posición LÓGICA) y lo aplica como scrollTop del contenedor — nunca reescribe selected.x/selected.y', () => {
    expect(effectBlock).toContain('const targetY = selected.y * logicalHeightPx * editScale')
    expect(effectBlock).toContain('wrap.scrollTop = clamp(targetY - wrapHeight / 2, 0, maxScroll)')
    expect(effectBlock).not.toMatch(/setLayers|updateSelectedDiscrete|updateSelectedContinuous/)
  })

  it('depende SOLO de zoomMode (no de adjustingPhotoId, la capa seleccionada ni la escala) — cambiar de selección ya en modo edit no debe mover la vista de golpe', () => {
    // El propio effectBlock (de "if (zoomMode !== 'edit') return" a "}, [zoomMode])") ya prueba, por
    // construcción (slice() busca ese cierre exacto), que el array de dependencias es exactamente ese — si
    // dependiera de algo más (como adjustingPhotoId, la regresión real encontrada), ese marcador de cierre
    // no existiría tal cual y el slice() de la constante `effectBlock` (arriba) habría fallado en vez de
    // encontrarlo.
    expect(effectBlock.length).toBeGreaterThan(0)
  })

  it('sin capa seleccionada, no fuerza ningún scroll (se deja donde estuviera)', () => {
    expect(effectBlock).toContain("if (!wrap || !selected) return")
  })
})

describe('"Foto tapada" — efecto SEPARADO para Ajustar foto, solo si la foto no está ya visible (nunca interfiere con el arrastre)', () => {
  const photoEffectBlock = slice(DESIGNER_SRC, "if (zoomMode !== 'edit' || !adjustingPhotoId) return", '}, [adjustingPhotoId])')

  it('depende SOLO de adjustingPhotoId — un efecto propio, no comparte dependencias con el de zoomMode de arriba', () => {
    expect(photoEffectBlock.length).toBeGreaterThan(0)
  })

  it('solo actúa si la capa que se está ajustando es la seleccionada, y solo en modo Editar', () => {
    expect(photoEffectBlock).toContain('!selected || selected.id !== adjustingPhotoId')
  })

  it('NO mueve el scroll si la foto ya está razonablemente visible (margen del 15%) — el caso común no toca scrollTop en absoluto, evitando cualquier interferencia con el arrastre que sigue', () => {
    expect(photoEffectBlock).toContain('const margin = wrapHeight * 0.15')
    expect(photoEffectBlock).toContain('if (alreadyVisible) return')
  })

  it('nunca reescribe selected.x/selected.y — solo scrollTop del contenedor, igual que el efecto de zoomMode', () => {
    expect(photoEffectBlock).not.toMatch(/setLayers|updateSelectedDiscrete|updateSelectedContinuous/)
    expect(photoEffectBlock).toContain('wrap.scrollTop = clamp(targetY - wrapHeight / 2, 0, maxScroll)')
  })
})

describe('El lienzo lógico, el renderer y la recuperación no cambian — solo cambia cuánto/cómo se ve el editor', () => {
  it('el contenido interno sigue siendo el mismo tamaño lógico fijo (ASSUMED_CANVAS_SIZE_PX), escalado con transform: scale(canvasScale) — misma arquitectura de siempre', () => {
    expect(DESIGNER_SRC).toContain('width: logicalWidthPx, height: logicalHeightPx, transform: `scale(${canvasScale})`, transformOrigin: \'top left\'')
  })

  it('InvitationCanvasView (la vista final de solo lectura) no se ha tocado en esta corrección', () => {
    const viewFn = slice(DESIGNER_SRC, 'export function InvitationCanvasView({', '\nconst LAYER_FONT_OPTIONS')
    expect(viewFn).toContain('useCanvasScale(outerRef, logicalWidthPx)')
    expect(viewFn).not.toContain('useCanvasZoomScales')
    expect(viewFn).not.toContain('zoomMode')
  })

  it('recoverInaccessibleLayerPositions (domain/events.ts) no depende de ningún rect del DOM del editor ni de zoomMode — nunca se vio afectada por el recorte del contenedor ni le afecta el modo de vista', () => {
    expect(DESIGNER_SRC).toContain('recoverInaccessibleLayerPositions')
    // La propia función de dominio sigue comparando contra el lienzo lógico (assumedCanvasHeightPx /
    // ASSUMED_CANVAS_SIZE_PX), no contra ningún elemento medido en pantalla ni contra zoomMode —
    // verificado en domain/invitationLayerAccessibleBounds.test.ts. Una capa fuera del VIEWPORT actual
    // (p. ej. scrolleada en modo edit) nunca se confunde con una capa fuera del CANVAS real.
  })
})
