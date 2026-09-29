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

describe('Color — corrección real (probado en iPhone real: el panel salía en blanco y no reaccionaba al toque), sin fila de presets', () => {
  // Unificación de color (2026-09-28) — el swatch (antes en línea aquí mismo) se extrajo a una única
  // función compartida, renderColorSwatch, reutilizada también por Forma (ver
  // invitationShapeColorSizeUi.test.ts) — "un único sistema de selección de color" para las dos.
  //
  // Corrección real (2026-09-28) — el primer intento (input invisible opacity:0 superpuesto a un swatch
  // decorativo) no era fiable en Safari/iOS: el toque no siempre llegaba al input real. Se sustituye por
  // el <input type="color"> VISIBLE de siempre (.color-wheel-input, el mismo patrón que ya tenía Forma
  // antes de esta fase y que nunca se reportó roto) — el propio input es el botón.
  const swatchFn = slice(DESIGNER_SRC, 'function renderColorSwatch() {', '\n  return (\n    <>')

  it('la barra de texto llama a renderColorSwatch (no monta su propio <input type="color"> en línea)', () => {
    expect(editBar).toContain('renderColorSwatch()')
    expect(editBar).not.toContain('LAYER_COLOR_PRESETS')
    expect(editBar).not.toContain('colorInputRef.current?.click()')
  })

  it('renderColorSwatch: el <input type="color"> es VISIBLE y ES el propio botón — nunca opacity:0 superpuesto a otro elemento decorativo (eso es justo lo que fallaba en Safari/iOS real)', () => {
    expect(swatchFn).toContain('type="color"')
    expect(swatchFn).toContain('className="invitation-color-swatch-input"')
    expect(swatchFn).toContain('aria-label="Color"')
    expect(swatchFn).not.toContain('opacity: 0')
    expect(swatchFn).not.toContain("position: 'absolute'")
    expect(swatchFn).not.toContain('pointerEvents')
    expect(swatchFn).not.toContain('colorInputRef')
  })

  it('corrección visual (2026-09-29) — la píldora del color usa el mismo tamaño/forma que los demás botones (B, I, Aa, A±), nunca el antiguo aro multicolor grande', () => {
    expect(swatchFn).not.toContain('color-wheel-input"')
  })

  // Segunda corrección visual (validación real en iPhone: "todavía aparece como una pastilla grande
  // rellena del color, p. ej. negro → botón entero negro") — .invitation-color-swatch-btn es un <span>
  // puramente decorativo (tamaño/fondo/borde de botón normal, SIEMPRE neutro) que envuelve al <input> real;
  // el input pasa a medir pequeño por sí mismo (width/height directos en el CSS, no por padding), así el
  // relleno de color nunca puede desbordar más allá de la muestra interior, sea cual sea el navegador.
  it('el <input> real va envuelto en un <span> decorativo (invitation-color-swatch-btn) que aporta el tamaño/fondo del botón — el input en sí ya no lleva el tamaño del botón entero', () => {
    expect(swatchFn).toContain('<span className="invitation-color-swatch-btn">')
    expect(swatchFn).toContain('</span>')
  })

  it('renderColorSwatch llama a las mismas funciones que el resto del editor (updateSelectedContinuous + commit al soltar)', () => {
    expect(swatchFn).toContain("updateSelectedContinuous({ color: e.target.value }, 'color')")
    expect(swatchFn).toContain('onBlur={commitContinuousEdit}')
  })

  it('color y efectos aparecen juntos, en la segunda fila (Fase 4: "deben aparecer juntos visualmente")', () => {
    const row2 = slice(editBar, 'GRUPO 4 — apariencia', 'GRUPO 6 — capas/objeto')
    expect(row2).toContain('renderColorSwatch()')
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

  it('corrección real: el botón que abre el desplegable ya no usa el emoji 🔠 (se leía como "ABCD" en el móvil) — usa el texto literal "A±", igual en cualquier plataforma', () => {
    const row1 = slice(editBar, 'GRUPO 3 — tipografía', 'GRUPO 4 — apariencia')
    expect(row1).toContain('aria-label="Tamaño"')
    expect(row1).toContain('A±')
    expect(row1).not.toContain('🔠')
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

  it('corrección real: "Traer adelante"/"Enviar atrás" ya no usan flechas ⬆/⬇ (se confundían con mover el objeto en el lienzo, que ya existe por arrastre) — dos cuadrados superpuestos, sin ninguna flecha, con aria-label Y title accesibles', () => {
    const row2 = slice(editBar, 'GRUPO 6 — capas/objeto', '</div>\n              </div>\n            )}')
    expect(row2).not.toMatch(/>\s*⬆\s*</)
    expect(row2).not.toMatch(/>\s*⬇\s*</)
    expect(row2).toContain('aria-label="Traer adelante"')
    expect(row2).toContain('title="Traer adelante"')
    expect(row2).toContain('aria-label="Enviar atrás"')
    expect(row2).toContain('title="Enviar atrás"')
    // El icono es geométrico (cuadrados con currentColor via CSS), no un carácter: ambos botones montan al
    // menos 2 <span> propios (el contenedor + los dos cuadrados superpuestos).
    const frontIcon = slice(row2, 'aria-label="Traer adelante"', '</button>')
    const backIcon = slice(row2, 'aria-label="Enviar atrás"', '</button>')
    for (const icon of [frontIcon, backIcon]) {
      expect(icon.match(/<span/g)?.length).toBeGreaterThanOrEqual(3)
      expect(icon).toContain('background: \'currentColor\'')
      expect(icon).toContain("border: '1.5px solid currentColor'")
    }
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
