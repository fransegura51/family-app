import { describe, expect, it } from 'vitest'

// PARTE DE LA COLA NOCTURNA (continuación) — Bloque A: "Ajustar foto" extiende a las capas de foto el
// mismo concepto de encuadre reversible que ya tenía el fondo ("🔧 Ajustar fondo") — desplazamiento +
// escala guardados como datos (photoOffsetX/Y, photoScale en InvitationLayer), NUNCA un recorte físico
// (nunca se genera ni se sube una segunda imagen a Storage). Sin pinch (petición real explícita: "no
// necesito pinch-to-zoom") — un dedo desplaza, un slider hace zoom. MOVER CAPA y AJUSTAR CONTENIDO deben
// quedar completamente separados: mientras se ajusta, el toque en la foto nunca mueve la capa.
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

describe('Modelo — photoOffsetX/Y/Scale opcionales y retrocompatibles (domain/types.ts)', () => {
  const TYPES_SRC = (import.meta.glob('/src/domain/types.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/domain/types.ts']

  it('los tres campos son opcionales — una invitación guardada antes de este bloque no los lleva', () => {
    expect(TYPES_SRC).toContain('photoOffsetX?: number')
    expect(TYPES_SRC).toContain('photoOffsetY?: number')
    expect(TYPES_SRC).toContain('photoScale?: number')
  })

  it('el canvas se guarda como JSON completo (canvas_json) — un campo opcional nuevo no necesita ninguna migración de base de datos', () => {
    const DATA_SRC = (import.meta.glob('/src/data/events.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/events.ts']
    expect(DATA_SRC).toContain('canvas_json SÍ guarda backgroundOffsetX/Y/backgroundScale (saveEventInvitation serializa el objeto')
  })
})

describe('Render — InvitationLayerVisual interpreta el encuadre SIEMPRE igual (editor, vista final y exportación PNG)', () => {
  const fn = slice(DESIGNER_SRC, "case 'photo': {", '\n    default:')

  it('ausentes (photoOffsetX/Y=0, photoScale=1) pintan translate(0%,0%) scale(1) — un no-op idéntico a la foto suelta de siempre', () => {
    expect(fn).toContain('const offsetX = layer.photoOffsetX ?? 0')
    expect(fn).toContain('const offsetY = layer.photoOffsetY ?? 0')
    expect(fn).toContain('const photoScale = layer.photoScale ?? 1')
    expect(fn).toContain('transform: `translate(${offsetX * 100}%, ${offsetY * 100}%) scale(${photoScale})`')
  })

  it('el marco recorta con overflow:hidden — desplazar/ampliar la imagen nunca se sale de su tamaño/máscara', () => {
    expect(fn).toContain("overflow: 'hidden'")
  })

  it('InvitationCanvasView (solo lectura, y la exportación PNG que la reutiliza) no pasa photoAdjust — se renderiza el mismo encuadre sin ninguna interactividad', () => {
    const viewCallIdx = DESIGNER_SRC.indexOf('export function InvitationCanvasView(')
    const viewCall = DESIGNER_SRC.slice(viewCallIdx, DESIGNER_SRC.indexOf('InvitationLayerVisual', viewCallIdx) + 200)
    expect(viewCall).toContain('<InvitationLayerVisual layer={layer} photoUrls={photoUrls} />')
    expect(viewCall).not.toContain('photoAdjust')
  })
})

describe('Modo "🔧 Ajustar foto" — entrar/salir explícito, por capa (nunca un booleano único global)', () => {
  it('adjustingPhotoId guarda el ID de la capa (null = ninguna), no un booleano compartido por todas', () => {
    expect(DESIGNER_SRC).toContain("const [adjustingPhotoId, setAdjustingPhotoId] = useState<string | null>(null)")
  })

  it('cambiar de selección sale del modo siempre (selectLayer resetea adjustingPhotoId)', () => {
    const fn = slice(DESIGNER_SRC, 'function selectLayer(id: string | null) {', '\n  function togglePanel')
    expect(fn).toContain('setAdjustingPhotoId(null)')
  })

  // Corrección real (validación en iPhone): el panel "Más" completo tapaba media pantalla al ajustar una
  // foto colocada en la mitad inferior de la invitación. Ahora, mientras adjustingPhotoId === selected.id,
  // el panel "Más" se reduce a un bloque compacto (Original/Círculo/Listo + Zoom, nada más); entrar en el
  // modo es un botón aparte en el panel NORMAL (ver el segundo test de este describe).
  const compactPanel = slice(
    DESIGNER_SRC,
    "panel === 'mas' && selected && selected.type === 'photo' && adjustingPhotoId === selected.id ? (",
    '\n                  ) : (',
  )

  it('el panel compacto de Ajustar foto solo tiene Original/Círculo/Listo y Zoom — nada de Adelante/Atrás/Duplicar/Eliminar ni el texto instructivo largo', () => {
    expect(compactPanel).toContain('onClick={() => setAdjustingPhotoId(null)}')
    expect(compactPanel).toContain('✓ Listo')
    expect(compactPanel).toContain('Original')
    expect(compactPanel).toContain('⚪ Círculo')
    expect(compactPanel).not.toContain('⬆ Adelante')
    expect(compactPanel).not.toContain('⬇ Atrás')
    expect(compactPanel).not.toContain('⧉ Duplicar')
    expect(compactPanel).not.toContain('Borrar elemento')
    expect(compactPanel).not.toContain('Arrastra la foto en el lienzo')
  })

  it('el botón para ENTRAR en Ajustar foto vive en el panel normal (rama else), separado del panel compacto', () => {
    const normalPanel = slice(DESIGNER_SRC, "panel === 'mas' &&\n                    selected && (", '</div>\n              )}\n\n              <div className="invitation-toolbar">')
    expect(normalPanel).toContain("onClick={() => setAdjustingPhotoId(selected.id)}")
    expect(normalPanel).toContain('🔧 Ajustar foto')
  })

  it('el zoom es un slider (nunca pinch/gesto), acotado 100%-300% igual que el rango de escala del fondo', () => {
    expect(compactPanel).toContain('type="range"')
    expect(compactPanel).toContain('min={100}')
    expect(compactPanel).toContain('max={300}')
    expect(compactPanel).toContain("updateSelectedContinuous({ photoScale: Number(e.target.value) / 100 }, 'photoScale')")
  })

  it('mientras se ajusta la foto, el tirador de tamaño/rotación de la capa se oculta (dos modos distintos, nunca a la vez)', () => {
    expect(DESIGNER_SRC).toContain('{layer.id === selectedId && adjustingPhotoId !== layer.id && (')
  })
})

describe('MOVER CAPA vs AJUSTAR CONTENIDO — separación real de gestos (nunca un toque hace las dos cosas)', () => {
  const fn = slice(DESIGNER_SRC, 'function handlePhotoAdjustPointerDown(', '\n  function handlePrettify')

  it('handlePhotoAdjustPointerDown/Move/Up existen y usan setPointerCapture, igual que el resto de gestos del editor', () => {
    expect(fn).toContain('e.currentTarget.setPointerCapture(e.pointerId)')
  })

  it('el desplazamiento se mide contra el marco de LA PROPIA FOTO (su getBoundingClientRect), no contra el lienzo entero — proporcional al tamaño real en pantalla', () => {
    expect(fn).toContain('const rect = e.currentTarget.getBoundingClientRect()')
    expect(fn).toContain('const dx = (e.clientX - drag.startClientX) / drag.frameW')
    expect(fn).toContain('const dy = (e.clientY - drag.startClientY) / drag.frameH')
  })

  it('e.stopPropagation() en down/move es lo que impide que el wrapper de la capa (mover/rotar) reciba el mismo toque', () => {
    expect(fn).toContain('e.stopPropagation()')
    const moveFn = slice(fn, 'function handlePhotoAdjustPointerMove(', '\n  function handlePhotoAdjustPointerUp')
    expect(moveFn).toContain('e.stopPropagation()')
  })

  it('el offset queda acotado igual que el del fondo (-0.5..0.5) — nunca se puede perder la imagen fuera del marco sin límite', () => {
    expect(fn).toContain('clamp(drag.startOffsetX + dx, -0.5, 0.5)')
    expect(fn).toContain('clamp(drag.startOffsetY + dy, -0.5, 0.5)')
  })

  it('el <img> solo recibe los handlers de ajuste cuando photoAdjust.active es true para ESA capa concreta — las demás capas de foto (o la misma fuera de este modo) no los reciben', () => {
    const visualCallBlock = slice(DESIGNER_SRC, 'photoAdjust={\n                            layer.type === \'photo\'', '\n                        />')
    expect(visualCallBlock).toContain('active: adjustingPhotoId === layer.id')
  })
})
