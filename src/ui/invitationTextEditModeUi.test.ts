import { describe, expect, it } from 'vitest'

// Corrección UX (2026-09-27, tras Fase 3 Bloque 3) — modo de edición de texto móvil, inspirado
// funcionalmente (no visualmente) en editores tipo Stories: al pulsar "✏️ Editar" sobre una capa de texto,
// las herramientas de formato (alineación/negrita/cursiva/fuente/color/tamaño) se muestran en una barra
// compacta pegada al teclado, en vez de en el popover genérico .invitation-panel. Reutiliza EXACTAMENTE las
// mismas funciones/estado que ya existían (updateSelectedDiscrete/Continuous, resolveLayerFontWeight,
// ALIGN_OPTIONS, LAYER_FONT_OPTIONS, LAYER_COLOR_PRESETS) — esto es solo una reforma de interfaz, no de
// lógica (ver Bloque 2 para esas funciones, sin cambios aquí).
// styles.css no se comprueba aquí (mismo motivo documentado en invitationDesignerContextualUi.test.ts:
// Vitest no expone su texto vía import.meta.glob(?raw) para .css en este proyecto) — las clases nuevas
// (.invitation-text-edit-bar/-btn/-done/-textarea, .invitation-font-preview-row/-btn) y su font-size: 16px
// se han verificado a mano en el propio archivo y en vivo (navegador, ver informe de la sesión).
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

const editBar = slice(DESIGNER_SRC, "textEditMode && selected && (", '{/* Barra contextual + su panel')

describe('Modo de edición de texto — se activa solo con una capa de texto seleccionada', () => {
  it('textEditMode = panel === \'texto\' && isTextLike (reutiliza el mismo estado "panel" de siempre, no uno nuevo)', () => {
    expect(DESIGNER_SRC).toContain("const textEditMode = panel === 'texto' && isTextLike")
  })

  it('mientras textEditMode está activo, la barra de herramientas y el panel genéricos NO se muestran (sustitución, no superposición)', () => {
    expect(DESIGNER_SRC).toContain('{!textEditMode && (')
  })
})

describe('✓ Terminar — acción explícita y visible, sin gestos ocultos', () => {
  it('un botón con aria-label "Terminar edición" cierra el modo (setPanel(null), igual que tocar fuera de cualquier otro panel)', () => {
    expect(editBar).toContain('aria-label="Terminar edición"')
    expect(editBar).toContain("onClick={() => setPanel(null)}")
    expect(editBar).toContain('invitation-text-edit-done')
  })
})

describe('Alineación / negrita / cursiva — mismas funciones que el Bloque 2, solo reubicadas', () => {
  it('alineación: ALIGN_OPTIONS con updateSelectedDiscrete, igual que antes', () => {
    expect(editBar).toContain('ALIGN_OPTIONS.map')
    expect(editBar).toContain('updateSelectedDiscrete({ textAlign: opt.value })')
  })

  it('negrita: invierte el peso EFECTIVO vía resolveLayerFontWeight (no un booleano ciego)', () => {
    expect(editBar).toContain('resolveLayerFontWeight(selected) === 700')
    expect(editBar).toContain('updateSelectedDiscrete({ bold: resolveLayerFontWeight(selected) !== 700 })')
  })

  it('cursiva: alterna italic, cambio discreto', () => {
    expect(editBar).toContain('updateSelectedDiscrete({ italic: !selected.italic })')
  })
})

describe('Fuente — previsualización visual real (Aa en su propia tipografía), no un <select> con el mismo texto', () => {
  it('cada opción de LAYER_FONT_OPTIONS se pinta con su propio fontFamily', () => {
    expect(editBar).toContain('LAYER_FONT_OPTIONS.map((f) =>')
    expect(editBar).toContain("style={{ fontFamily: f.value === 'inherit' ? BASE_FONT_STACK : f.value }}")
    expect(editBar).toContain('updateSelectedDiscrete({ fontFamily: f.value })')
  })

  it('la fila de fuentes es su propia clase con scroll horizontal usable (no un <select> nativo)', () => {
    expect(editBar).toContain('invitation-font-preview-row')
    expect(editBar).not.toContain('<select')
  })
})

describe('Color — reutiliza LAYER_COLOR_PRESETS y el selector nativo ya existentes, sin abandonar la edición', () => {
  it('mismos 6 presets + rueda de color nativa, mismas llamadas que el panel "color" genérico', () => {
    expect(editBar).toContain('LAYER_COLOR_PRESETS.map((c) =>')
    expect(editBar).toContain('updateSelectedDiscrete({ color: c })')
    expect(editBar).toContain("updateSelectedContinuous({ color: e.target.value }, 'color')")
    expect(editBar).toContain('className="color-wheel-input"')
  })

  it('el botón que abre/cierra el color no navega a otra pantalla — alterna textEditTool en el mismo sitio', () => {
    expect(editBar).toContain("setTextEditTool((t) => (t === 'color' ? null : 'color'))")
  })
})

describe('Tamaño — A-/A+ igual que el resto del editor, visible sin abrir nada aparte', () => {
  it('usa el mismo patrón de fontSize ± que el panel "tamano"', () => {
    expect(editBar).toContain("updateSelectedDiscrete({ fontSize: Math.max(10, (selected.fontSize ?? 16) - 2) })")
    expect(editBar).toContain('updateSelectedDiscrete({ fontSize: (selected.fontSize ?? 16) + 2 })')
  })
})

describe('Contenido — el usuario es el único que lo cambia; ningún control nuevo reescribe/corrige/resume', () => {
  it('el textarea sigue siendo el único punto de escritura, ligado 1:1 a selected.text', () => {
    expect(editBar).toContain("value={selected.text ?? ''}")
    expect(editBar).toContain("updateSelectedContinuous({ text: e.target.value }, 'text')")
  })

  it('ningún botón de esta barra llama a handlePrettify ni a ninguna función que toque layer.text', () => {
    expect(editBar).not.toContain('handlePrettify')
  })
})

describe('Teclado / iOS — zoom automático evitado, hueco del teclado medido con visualViewport', () => {
  it('el textarea de edición usa una clase propia (no la <textarea> global de 14px) — evita el zoom automático de iOS al enfocar', () => {
    expect(editBar).toContain('className="invitation-text-edit-textarea"')
  })

  it('mide el hueco del teclado con window.visualViewport (resize/scroll), no con un valor fijo', () => {
    const fn = slice(DESIGNER_SRC, 'if (typeof window === \'undefined\' || !window.visualViewport) return', 'getEventInvitation(event.id)')
    expect(fn).toContain("vv.addEventListener('resize', update)")
    expect(fn).toContain("vv.addEventListener('scroll', update)")
    expect(fn).toContain('window.innerHeight - vv.height - vv.offsetTop')
  })

  it('la hoja del editor solo cambia de alto/margen cuando el teclado tapa algo Y se está editando texto (no siempre)', () => {
    const block = slice(DESIGNER_SRC, 'className="modal-sheet invitation-designer-sheet"', '<div className="modal-header"')
    expect(block).toContain('textEditMode && keyboardInset > 0')
    expect(block).toContain('marginBottom: keyboardInset')
  })
})

describe('Desktop — no se ha creado una rama de código separada para escritorio (misma barra, comportamiento responsivo por CSS)', () => {
  it('no hay comprobación de userAgent ni de "isMobile" en el archivo', () => {
    expect(DESIGNER_SRC).not.toMatch(/userAgent|isMobile/i)
  })
})
