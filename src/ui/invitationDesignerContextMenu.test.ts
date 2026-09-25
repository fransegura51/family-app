import { describe, expect, it } from 'vitest'

// TURNO NOCTURNO 2E — en iPhone, trabajar repetidamente sobre una capa del lienzo editable (long-press,
// doble toque) podía abrir el menú contextual nativo de iOS (Compartir / Guardar en Fotos / Copiar / Copiar
// sujeto...) por encima de los propios controles del editor. Localizado SOLO al lienzo editable
// (canvasRef), nunca a toda la app: se comprueba aquí que el bloqueo vive exactamente en ese <div> raíz y
// en las <img> que contiene, y que NO toca los manejadores de selección/arrastre/resize ya existentes.
const SRC = (import.meta.glob('/src/ui/InvitationDesigner.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/src/ui/InvitationDesigner.tsx'
]

function canvasRootBlock(): string {
  const start = SRC.indexOf('<div className="invitation-canvas-wrap">')
  const end = SRC.indexOf('{backgroundImageUrl ? (', start)
  return SRC.slice(start, end)
}

describe('2E — el lienzo editable bloquea el menú contextual nativo de iOS, localizado SOLO ahí', () => {
  it('el <div ref={canvasRef}> raíz del lienzo bloquea onContextMenu', () => {
    const block = canvasRootBlock()
    expect(block).toContain('ref={canvasRef}')
    expect(block).toContain('onContextMenu={(e) => e.preventDefault()}')
  })

  it('el mismo <div> desactiva WebkitTouchCallout (long-press de Safari) y la selección nativa (WebkitUserSelect/userSelect)', () => {
    const block = canvasRootBlock()
    expect(block).toContain("WebkitTouchCallout: 'none'")
    expect(block).toContain("WebkitUserSelect: 'none'")
    expect(block).toContain("userSelect: 'none'")
  })

  it('la imagen de fondo y la foto de una capa tienen draggable={false} (sin arrastre/drag nativo de imagen)', () => {
    const bgImgBlock = SRC.slice(SRC.indexOf('<img\n                    src={backgroundImageUrl}'), SRC.indexOf('/>', SRC.indexOf('<img\n                    src={backgroundImageUrl}')))
    expect(bgImgBlock).toContain('draggable={false}')
    expect(SRC).toContain('<img src={url} alt="" draggable={false} style={{ width: size, height: size, objectFit: \'cover\', borderRadius: 12, display: \'block\' }} />')
  })

  it('el bloqueo NO toca los manejadores de selección/arrastre/resize/edición ya existentes: siguen presentes tal cual, dentro o fuera del bloque tocado', () => {
    // Selección de capas: onPointerDown={() => selectLayer(null)} sigue en el mismo <div> raíz.
    const block = canvasRootBlock()
    expect(block).toContain('onPointerDown={() => selectLayer(null)}')
    // Arrastre de una capa y resize (el handle) siguen existiendo en el archivo, sin cambios de firma.
    expect(SRC).toContain('onPointerDown={(e) => handleLayerPointerDown(e, layer)}')
    expect(SRC).toContain('onPointerDown={(e) => handleHandlePointerDown(e, layer)}')
  })

  it('el bloqueo es LOCAL a InvitationDesigner.tsx: ningún otro archivo de ui/ desactiva el menú contextual nativo a raíz de este cambio', () => {
    const OTHER_UI = import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    for (const [path, content] of Object.entries(OTHER_UI)) {
      if (path === '/src/ui/InvitationDesigner.tsx') continue
      expect(content, `${path} no debería desactivar onContextMenu a raíz de esta corrección`).not.toContain('onContextMenu={(e) => e.preventDefault()}')
    }
  })
})
