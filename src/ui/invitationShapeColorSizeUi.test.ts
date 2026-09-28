import { describe, expect, it } from 'vitest'

// Corrección UX (2026-09-28, tras probar Decorar en iPhone) — Forma seguía con una interfaz de color y
// tamaño distinta de la ya corregida para Texto: 6 presets + una rueda aparte para color, y el antiguo
// icono de barra 🔠 (se leía como "ABCD" en el móvil) para tamaño. Ver también invitationTextEditModeUi.test.ts
// (describe "Color") para las pruebas de renderColorSwatch en sí — aquí solo se comprueba que Forma la
// REUTILIZA, sin montar un sistema de color/tamaño propio.
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

describe('Color de una forma — mismo selector directo que Texto, sin presets', () => {
  const colorPanel = slice(DESIGNER_SRC, "panel === 'color' && selected && selected.type === 'shape' && (", "panel === 'tamano' && selected && (")

  it('llama a renderColorSwatch (la misma función que usa Texto) — no monta presets ni una rueda propia', () => {
    expect(colorPanel).toContain("renderColorSwatch('invitation-toolbar-btn')")
  })

  it('LAYER_COLOR_PRESETS ha desaparecido del todo del archivo (ni presets de forma ni de texto)', () => {
    expect(DESIGNER_SRC).not.toContain('LAYER_COLOR_PRESETS')
  })
})

describe('Tamaño de una forma — mismo patrón "A±" que Texto, ya no el icono 🔠 de barra', () => {
  const shapeBranch = slice(DESIGNER_SRC, "selected.type === 'shape' ? (", "// foto | emoji — sin controles de texto/color.")

  it('el botón de barra "Tamaño" usa el texto literal "A±", no el emoji 🔠', () => {
    const sizeButton = slice(shapeBranch, "togglePanel('tamano')}>", '</button>')
    expect(sizeButton).toContain('A±')
    expect(sizeButton).not.toContain('🔠')
  })

  it('el panel de tamaño de forma sigue siendo A−/valor/A+, ahora con el mismo estilo de botón que Texto (invitation-text-edit-btn)', () => {
    const sizePanel = slice(DESIGNER_SRC, "panel === 'tamano' && selected && (", "panel === 'mas' && selected && (")
    expect(sizePanel).toContain('className="invitation-text-edit-btn"')
    expect(sizePanel).toContain('A−')
    expect(sizePanel).toContain('A+')
    expect(sizePanel).toContain('updateSelectedDiscrete({ fontSize: Math.max(10, (selected.fontSize ?? 16) - 15) })')
    expect(sizePanel).toContain('updateSelectedDiscrete({ fontSize: (selected.fontSize ?? 16) + 15 })')
  })

  it('foto/emoji conservan su control de tamaño tal cual (esta corrección solo pedía el cambio para Forma)', () => {
    const restBranch = slice(DESIGNER_SRC, '// foto | emoji — sin controles de texto/color.', ')}\n              </div>\n            </div>')
    expect(restBranch).toContain('🔠')
  })
})
