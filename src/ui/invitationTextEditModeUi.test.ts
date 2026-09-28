import { describe, expect, it } from 'vitest'

// Corrección UX (2026-09-27, tras Fase 3 Bloque 3) — modo de edición de texto móvil: al seleccionar una
// capa de texto/dato, las herramientas de formato se muestran en una barra compacta pegada al teclado, en
// vez de en el popover genérico .invitation-panel.
//
// Reorganización (2026-09-28, "Pepa: mejora del editor de invitaciones") — dos cambios estructurales sobre
// esa barra, ambos aprobados explícitamente por el usuario vía AskUserQuestion:
//  1) Las herramientas pasan a DOS FILAS FIJAS agrupadas por familia (alineación/formato/tipografía/
//     apariencia/transformación/capas), siempre visibles mientras haya una capa de texto seleccionada — ya
//     no hace falta pulsar "Editar" para verlas, solo para escribir. Fuente y Tamaño existen UNA sola vez
//     en todo el editor (antes se repetían en el panel inferior genérico "mas").
//  2) El contenido ahora se edita EN EL LIENZO (textarea in-place, en el sitio real de la capa), no en un
//     textarea aparte pegado abajo — ese campo duplicado desaparece. "Editar" (✏️/✓) solo activa/desactiva
//     textEditingActive; no cierra el modo de edición de texto en sí (eso solo ocurre al deseleccionar).
//  3) Color abre DIRECTAMENTE el selector nativo (input type="color" oculto, click() programático) — ya no
//     hay fila de presets: Fase 4 la elimina explícitamente ("un único sistema de selección de color").
//
// Reutiliza EXACTAMENTE las mismas funciones/estado que ya existían (updateSelectedDiscrete/Continuous,
// resolveLayerFontWeight, ALIGN_OPTIONS, LAYER_FONT_OPTIONS, TEXT_STYLE_OPTIONS) — esto sigue siendo una
// reforma de interfaz, no de lógica.
// styles.css no se comprueba aquí (mismo motivo documentado en invitationDesignerContextualUi.test.ts:
// Vitest no expone su texto vía import.meta.glob(?raw) para .css en este proyecto) — las clases nuevas
// (.invitation-text-toolbar-row/-sep, .invitation-inplace-textarea) se han verificado a mano en styles.css.
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
  it('textEditMode = isTextLike && !!selected (ya no depende de panel === \'texto\': las dos filas se ven en cuanto hay selección, sin paso "Editar" intermedio)', () => {
    expect(DESIGNER_SRC).toContain('const textEditMode = isTextLike && !!selected')
  })

  it('mientras textEditMode está activo, la barra de herramientas y el panel genéricos NO se muestran (sustitución, no superposición)', () => {
    expect(DESIGNER_SRC).toContain('{!textEditMode && (')
  })
})

describe('✏️ Editar contenido — separado de la selección: seleccionar para mover/formatear nunca abre el teclado por sorpresa', () => {
  it('un botón alterna textEditingActive (no cierra textEditMode ni llama a setPanel)', () => {
    expect(editBar).toContain('onClick={() => setTextEditingActive((v) => !v)}')
    expect(editBar).toContain("aria-label={textEditingActive ? 'Terminar edición del texto' : 'Editar texto'}")
  })

  it('el icono refleja el estado (✏️ para entrar, ✓ para terminar) y el botón se resalta mientras está activo', () => {
    expect(editBar).toContain("{textEditingActive ? '✓' : '✏️'}")
    expect(editBar).toContain("(textEditingActive ? ' invitation-text-edit-btn-active' : '')")
  })

  it('desactivar textEditingActive es automático al perder textEditMode (deseleccionar), vía el mismo efecto que resetea textEditTool', () => {
    const fn = slice(DESIGNER_SRC, 'useEffect(() => {\n    if (!textEditMode) {', '}, [textEditMode])')
    expect(fn).toContain('setTextEditTool(null)')
    expect(fn).toContain('setTextEditingActive(false)')
  })
})

describe('Alineación / negrita / cursiva — mismas funciones que antes, solo reubicadas en la fila 1', () => {
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

describe('Fuente — previsualización visual real (Aa en su propia tipografía), una sola vez en todo el editor', () => {
  it('cada opción de LAYER_FONT_OPTIONS se pinta con su propio fontFamily', () => {
    expect(editBar).toContain('LAYER_FONT_OPTIONS.map((f) =>')
    expect(editBar).toContain("style={{ fontFamily: f.value === 'inherit' ? BASE_FONT_STACK : f.value }}")
    expect(editBar).toContain('updateSelectedDiscrete({ fontFamily: f.value })')
  })

  it('la fila de fuentes es su propia clase con scroll horizontal usable (no un <select> nativo)', () => {
    expect(editBar).toContain('invitation-font-preview-row')
    expect(editBar).not.toContain('<select')
  })

  it('se abre como textEditTool (fila justo encima de las dos filas fijas), no como panel aparte', () => {
    expect(editBar).toContain("onClick={() => setTextEditTool((t) => (t === 'font' ? null : 'font'))}")
    expect(editBar).toContain("textEditTool === 'font' && (")
  })
})

describe('Color — Fase 4: abre DIRECTAMENTE el selector nativo, sin fila de presets (único sistema de selección)', () => {
  it('ya no hay LAYER_COLOR_PRESETS en la barra de texto — el botón "Color" hace click() sobre un <input type="color"> oculto', () => {
    expect(editBar).not.toContain('LAYER_COLOR_PRESETS')
    expect(editBar).toContain('onClick={() => colorInputRef.current?.click()}')
    expect(editBar).toContain('aria-label="Color"')
  })

  it('el input de color sigue llamando a las mismas funciones que el resto del editor (updateSelectedContinuous + commit al soltar)', () => {
    expect(editBar).toContain('ref={colorInputRef}')
    expect(editBar).toContain('type="color"')
    expect(editBar).toContain("updateSelectedContinuous({ color: e.target.value }, 'color')")
    expect(editBar).toContain('onBlur={commitContinuousEdit}')
  })

  it('color y efectos aparecen juntos, en la segunda fila (Fase 4: "deben aparecer juntos visualmente")', () => {
    const row2 = slice(editBar, 'GRUPO 4 — apariencia', 'GRUPO 6 — capas/objeto')
    expect(row2).toContain('onClick={() => colorInputRef.current?.click()}')
    expect(row2).toContain("setTextEditTool((t) => (t === 'effect' ? null : 'effect'))")
  })
})

describe('Efectos — TEXT_STYLE_OPTIONS completo, comportamiento actual sin tocar (Fase 3: "no hace falta arreglar aún Purpurina")', () => {
  it('se abre como textEditTool (misma familia que Fuente/Tamaño/Curvar), pinta TEXT_STYLE_OPTIONS como chips', () => {
    expect(editBar).toContain("textEditTool === 'effect' && (")
    expect(editBar).toContain('TEXT_STYLE_OPTIONS.map((opt) =>')
    expect(editBar).toContain("updateSelectedDiscrete({ textStyle: (selected.textStyle ?? 'normal') === opt.value ? 'normal' : opt.value })")
  })
})

describe('Tamaño — A-/A+ igual que el resto del editor, una sola vez en todo el editor', () => {
  it('usa el mismo patrón de fontSize ± que antes, dentro de textEditTool === \'size\'', () => {
    expect(editBar).toContain("textEditTool === 'size' && (")
    expect(editBar).toContain("updateSelectedDiscrete({ fontSize: Math.max(10, (selected.fontSize ?? 16) - 2) })")
    expect(editBar).toContain('updateSelectedDiscrete({ fontSize: (selected.fontSize ?? 16) + 2 })')
  })
})

describe('Curvar — solo el slider existente, solo para texto de una línea (no event_data)', () => {
  it('se abre como textEditTool, gated a selected.type === \'text\', mismo <input type="range"> que antes', () => {
    expect(editBar).toContain("textEditTool === 'curve' && selected.type === 'text' && (")
    expect(editBar).toContain("updateSelectedContinuous({ curve: Number(e.target.value) }, 'curve')")
  })

  it('el botón que abre Curvar en la fila 2 también está gated a selected.type === \'text\' (event_data no lo muestra)', () => {
    const row2 = slice(editBar, 'GRUPO 4 — apariencia', 'GRUPO 6 — capas/objeto')
    expect(row2).toContain("selected.type === 'text' && (")
    expect(row2).toContain("setTextEditTool((t) => (t === 'curve' ? null : 'curve'))")
  })
})

describe('Capas/objeto (GRUPO 6) — adelante/atrás/duplicar/borrar integrados en la fila 2, mismas funciones', () => {
  it('reutiliza handleReorder/handleDuplicate/handleDeleteSelected, sin lógica nueva', () => {
    const row2 = slice(editBar, 'GRUPO 6 — capas/objeto', '</div>\n              </div>\n            )}')
    expect(row2).toContain('onClick={() => handleReorder(1)}')
    expect(row2).toContain('onClick={() => handleReorder(-1)}')
    expect(row2).toContain('onClick={handleDuplicate}')
  })

  it('borrar sigue pasando por ConfirmIconButton (tap-to-confirm), no un botón directo', () => {
    expect(editBar).toContain('<ConfirmIconButton icon="✕" className="invitation-text-edit-btn" ariaLabel="Borrar elemento" onConfirm={handleDeleteSelected} />')
  })
})

describe('Contenido — edición EN EL LIENZO (in-place), ya no un textarea aparte pegado abajo (duplicidad eliminada)', () => {
  it('el textarea in-place solo se monta para la capa seleccionada mientras textEditingActive está activo, en su sitio real dentro del bucle de capas', () => {
    const block = slice(
      DESIGNER_SRC,
      "textEditingActive && layer.id === selectedId && (layer.type === 'text' || layer.type === 'event_data') ? (",
      ') : ('
    )
    expect(block).toContain('ref={inPlaceTextareaRef}')
    expect(block).toContain("value={selected?.text ?? ''}")
    expect(block).toContain("updateSelectedContinuous({ text: e.target.value }, 'text')")
    expect(block).toContain('onBlur={commitContinuousEdit}')
    expect(block).toContain('className="invitation-inplace-textarea"')
  })

  it('cuando no se está editando, se renderiza InvitationLayerVisual como siempre (sin cambios en el resto de capas)', () => {
    expect(DESIGNER_SRC).toContain('<InvitationLayerVisual layer={layer} photoUrls={photoUrls} />')
  })

  it('el textarea in-place ignora pointerdown (no interfiere con arrastrar/redimensionar la capa) y ajusta su alto automáticamente al escribir', () => {
    const block = slice(
      DESIGNER_SRC,
      "textEditingActive && layer.id === selectedId && (layer.type === 'text' || layer.type === 'event_data') ? (",
      ') : ('
    )
    expect(block).toContain('onPointerDown={(e) => e.stopPropagation()}')
    expect(block).toContain("el.style.height = 'auto'")
    expect(block).toContain("el.style.height = `${el.scrollHeight}px`")
  })

  it('se autoenfoca al activar textEditingActive (mismo criterio que el textarea anterior, ahora explícito vía useEffect)', () => {
    const fn = slice(DESIGNER_SRC, 'if (textEditingActive) inPlaceTextareaRef.current?.focus()', '}, [textEditingActive])')
    expect(fn).toBeDefined()
  })

  it('ningún botón de esta barra llama a handlePrettify ni a ninguna función que toque layer.text', () => {
    expect(editBar).not.toContain('handlePrettify')
  })
})

describe('Teclado / iOS — hueco del teclado medido con visualViewport (sin cambios respecto a antes)', () => {
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
