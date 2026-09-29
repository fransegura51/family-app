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

  // Validación real en iPhone: el arrastre dentro de "Ajustar foto" no movía nada (zoom y Original/Círculo
  // sí funcionaban). Causa real encontrada tras comparar con el arrastre de la CAPA (que sí funciona,
  // ver handleLayerPointerDown sobre un <div>): un <img> tiene su propio reconocedor de gesto nativo de
  // WebKit ("arrastrar para copiar la imagen"), distinto de touch-action (que solo gobierna scroll/zoom
  // de página) y de draggable={false} (que solo afecta al drag&drop HTML5 de ratón) — sin desactivarlo,
  // Safari puede quedarse con el gesto y dejar de entregar pointermove a React. Se aplica siempre (no solo
  // con photoAdjust activo) porque no afecta a ningún otro comportamiento de la foto.
  it('-webkit-user-drag:none en el <img> — higiene (evita el callout nativo de guardar/copiar imagen), descartado como causa raíz del arrastre en la 2ª validación real', () => {
    expect(fn).toContain("WebkitUserDrag: 'none'")
    expect(fn).toContain("WebkitTouchCallout: 'none'")
  })

  // 2ª validación real en iPhone: -webkit-user-drag NO resolvió el arrastre — el gesto vertical lo seguía
  // capturando el lienzo scrollable de debajo (canvasRef, touch-action:'pan-y' en modo 'edit'). Causa real:
  // el MARCO (<div> overflow:hidden que envuelve el <img>) era el único elemento de la cadena capa→foto sin
  // su propio touch-action:none explícito — el wrapper de la capa y el <img> sí lo tenían, pero quedaba ese
  // hueco intermedio. Se cierra aquí, y además los handlers llaman a e.preventDefault() — refuerzo directo
  // por si WebKit no respeta touch-action:none de un descendiente por encima del pan-y del ancestro.
  it('el marco (<div> overflow:hidden) también lleva touch-action:none mientras se ajusta — cierra el hueco de la cadena capa→foto→<img>', () => {
    const frameDiv = slice(fn, "return url ? (", '<img\n            src={url}')
    expect(frameDiv).toContain("touchAction: photoAdjust?.active ? 'none' : undefined")
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

  // 2ª validación real: el gesto vertical seguía siendo capturado por canvasRef (touch-action:'pan-y' en
  // modo 'edit') a pesar de touch-action:none en toda la cadena. e.preventDefault() en down/move refuerza
  // directamente (vía Pointer Events, no listeners pasivos) contra ese pan-y del ancestro — solo existe
  // dentro de estos handlers, que solo se activan mientras adjustingPhotoId apunta a esta capa, así que el
  // scroll del editor fuera de este gesto (o sobre cualquier otra capa/zona) sigue funcionando igual.
  it('e.preventDefault() en down/move — refuerzo directo contra el pan-y del lienzo ancestro (canvasRef) cuando WebKit no respeta touch-action:none del descendiente', () => {
    expect(fn).toContain('e.preventDefault()')
    const moveFnPD = slice(fn, 'function handlePhotoAdjustPointerMove(', '\n  function handlePhotoAdjustPointerUp')
    expect(moveFnPD).toContain('e.preventDefault()')
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
