import { describe, expect, it } from 'vitest'

// Fase 3 Bloque 3 (2026-09-27) — Emoji (biblioteca+buscador+recientes), Foto (máscara círculo), Formas
// (nuevas figuras+opacidad) y orden de capas. Mismo estilo de auditoría de código fuente que el resto de
// tests de InvitationDesigner.tsx (no un test de render).
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

describe('😀 Emoji (dentro de 🖌️ Decorar) — biblioteca por categorías + buscador + recientes', () => {
  const panel = slice(DESIGNER_SRC, "decorarTab === 'emoji' && (", "decorarTab === 'forma'")

  it('el campo de texto sirve para buscar por concepto Y para pegar/escribir un emoji literal (+ Añadir)', () => {
    expect(panel).toContain('placeholder="Buscar (tarta, corazón...) o pegar un emoji"')
    expect(panel).toContain('handleInsertEmoji(em)')
  })

  it('con texto escrito, muestra los resultados de searchInvitationEmoji, no el catálogo entero', () => {
    expect(panel).toContain('searchInvitationEmoji(customEmoji)')
    expect(panel).toContain('results.map((e) =>')
  })

  it('sin texto, muestra "🕘 Recientes" (si hay) seguido de INVITATION_EMOJI_CATEGORIES', () => {
    expect(panel).toContain('🕘 Recientes')
    expect(panel).toContain('recentEmoji.map((em) =>')
    expect(panel).toContain('INVITATION_EMOJI_CATEGORIES.map((cat) =>')
  })

  it('handleInsertEmoji añade la capa (en un hueco libre, sin apilarla siempre en el centro) Y la apunta como reciente — mismo camino para búsqueda, categoría o recientes', () => {
    const fn = slice(DESIGNER_SRC, 'function handleInsertEmoji', '\n  }')
    expect(fn).toContain("makeInvitationLayer('emoji', { text: char, fontSize: 48 })")
    expect(fn).toContain('findFreeDecorationLayerPosition(layer, layers, imageAspectNumeric)')
    expect(fn).toContain('handleAddLayer({ ...layer, x, y })')
    expect(fn).toContain('recordRecentInvitationEmoji(char)')
    expect(fn).toContain('setRecentEmoji(loadRecentInvitationEmoji())')
  })

  it('long-press sobre un chip (InvitationEmojiChip) ofrece variantes de tono de piel reales de Unicode, sin apilarlas por otra ruta', () => {
    const chip = slice(DESIGNER_SRC, 'function InvitationEmojiChip', 'function InvitationCanvasEditor')
    expect(chip).toContain('invitationEmojiSkinToneVariants(char)')
    expect(chip).toContain('setTimeout(')
    expect(chip).toContain('LONG_PRESS_MS')
    expect(chip).toContain('onContextMenu={variants.length > 0 ? (e) => e.preventDefault() : undefined}')
  })

  it('importa la biblioteca y los recientes de sus módulos de dominio/estado (no datos duplicados en la UI)', () => {
    expect(DESIGNER_SRC).toContain("import { loadRecentInvitationEmoji, recordRecentInvitationEmoji } from '@/state/invitationRecentEmoji'")
    const importBlock = DESIGNER_SRC.slice(DESIGNER_SRC.indexOf('import {'), DESIGNER_SRC.indexOf("} from '@/domain/events'"))
    expect(importBlock).toContain('INVITATION_EMOJI_CATEGORIES')
    expect(importBlock).toContain('searchInvitationEmoji')
  })
})

describe('◆ Formas — rectángulo/línea/corazón renderizables, resto sin tocar', () => {
  const graphic = slice(DESIGNER_SRC, 'function InvitationShapeGraphic', 'function darkenHexColor')

  it('cada forma nueva tiene su propio case con <svg>', () => {
    expect(graphic).toContain("case 'rectangulo':")
    expect(graphic).toContain("case 'linea':")
    expect(graphic).toContain("case 'corazon':")
  })

  it('los cases ya existentes (anillo/estrella/confeti/ondas/brillos/círculo por defecto) siguen presentes', () => {
    expect(graphic).toContain("case 'anillo':")
    expect(graphic).toContain("case 'estrella':")
    expect(graphic).toContain("case 'confeti':")
    expect(graphic).toContain("case 'ondas':")
    expect(graphic).toContain("case 'brillos':")
    expect(graphic).toContain("case 'circulo':\n    default:")
  })

  it('la pestaña "Formas" (dentro de 🖌️ Decorar) sigue construyéndose a partir de INVITATION_SHAPES (las 3 nuevas aparecen solas, sin lista aparte en la UI)', () => {
    const panel = slice(DESIGNER_SRC, "decorarTab === 'forma' && (", "panel === 'datos'")
    expect(panel).toContain('INVITATION_SHAPES.map((s) =>')
    expect(panel).toContain('handleInsertShape(s.key)')
  })
})

describe('Opacidad (formas) y máscara de foto (círculo) — controles dentro de "Más", sin botones nuevos en la barra', () => {
  const masPanel = slice(DESIGNER_SRC, "panel === 'mas' && selected && (", '</div>\n              )}\n\n              <div className="invitation-toolbar">')

  it('opacidad solo aparece para selected.type === "shape", cambio continuo entre 20% y 100%', () => {
    expect(masPanel).toContain("selected.type === 'shape' && (")
    expect(masPanel).toContain("updateSelectedContinuous({ opacity: Number(e.target.value) / 100 }, 'opacity')")
    expect(masPanel).toContain('min={20}')
    expect(masPanel).toContain('max={100}')
  })

  it('el recorte de foto (Original/Círculo) solo aparece para selected.type === "photo", cambio discreto', () => {
    expect(masPanel).toContain("selected.type === 'photo' && (")
    expect(masPanel).toContain("updateSelectedDiscrete({ photoMask: 'none' })")
    expect(masPanel).toContain("updateSelectedDiscrete({ photoMask: 'circle' })")
  })

  it('no se ha tocado la barra de herramientas para foto (unificación 2026-09-28: "emoji"+"forma" se fusionan en un único panel "decorar" con pestañas, ver decorarTab)', () => {
    expect(DESIGNER_SRC).toContain("type DesignerPanel = 'plantilla' | 'datos' | 'decorar' | 'color' | 'tamano' | 'mas' | 'pepa'")
    expect(DESIGNER_SRC).toContain("type DecorarTab = 'emoji' | 'forma'")
  })
})

describe('InvitationLayerVisual respeta opacity (fuera del switch, en el <div> contenedor) y photoMask (dentro del case "photo")', () => {
  it('la foto calcula borderRadius a partir de photoMask, con "circle" -> 50%', () => {
    const block = slice(DESIGNER_SRC, "case 'photo': {", 'default:')
    expect(block).toContain("const borderRadius = layer.photoMask === 'circle' ? '50%' : 12")
    expect(block).toContain('borderRadius,')
  })

  it('el wrapper de capa (editor y vista de solo lectura) aplica opacity: layer.opacity ?? 1', () => {
    const occurrences = DESIGNER_SRC.split('opacity: layer.opacity ?? 1').length - 1
    expect(occurrences).toBe(2) // InvitationCanvasView + editor en vivo
  })
})

describe('Orden de capas — "⬆ Adelante"/"⬇ Atrás" ya disponible para foto/emoji/forma/texto por igual (no es nuevo, se confirma que sigue así)', () => {
  it('handleReorder no distingue por tipo de capa — funciona igual para cualquier selected', () => {
    const fn = slice(DESIGNER_SRC, 'function handleReorder', '\n  }')
    expect(fn).not.toMatch(/selected\.type ===/)
  })

  it('el panel "Más" (con Adelante/Atrás/Duplicar/Borrar) sigue disponible en las 2 ramas de la barra normal que le quedan: forma, y foto/emoji (el texto se reorganizó a sus propias dos filas fijas, con los mismos 4 controles integrados ahí — ver invitationTextEditModeUi.test.ts)', () => {
    const toolbar = slice(DESIGNER_SRC, '<div className="invitation-toolbar">', '</div>\n            </div>\n            )}\n          </>\n        )}')
    const masButtons = toolbar.split("togglePanel('mas')").length - 1
    expect(masButtons).toBe(2)
  })
})

describe('Duplicar sigue copiando el objeto de capa completo — cualquier propiedad nueva (opacity, photoMask) se conserva sin tocar handleDuplicate', () => {
  it('handleDuplicate no enumera campos concretos, hace spread del objeto entero', () => {
    const fn = slice(DESIGNER_SRC, 'function handleDuplicate', '\n  }')
    expect(fn).toContain('const copy: InvitationLayer = { ...selected,')
  })
})
