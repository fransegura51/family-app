import { describe, expect, it } from 'vitest'

// Fase 3 Bloque 2 (2026-09-27) — 🔤 Texto (alineación/negrita/cursiva) y 📋 Datos reales del evento.
// Mismo estilo que el resto de tests de InvitationDesigner.tsx (invitationDesignerLineHeight.test.ts,
// invitationDesignerContextualUi.test.ts...): auditoría del código fuente real, no un test de render.
const FILES = import.meta.glob(['/src/ui/InvitationDesigner.tsx', '/src/domain/events.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const DESIGNER_SRC = FILES['/src/ui/InvitationDesigner.tsx']
const EVENTS_SRC = FILES['/src/domain/events.ts']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('InvitationLayerVisual — fontWeight/fontStyle/textAlign vienen de la capa, no hardcodeados', () => {
  it('ya no queda ningún fontWeight hardcodeado por tipo (layer.type === \'text\' ? 700 : 400) en este archivo', () => {
    expect(DESIGNER_SRC).not.toContain("layer.type === 'text' ? 700 : 400")
  })

  it('usa resolveLayerFontWeight(layer), importado de @/domain/events (una sola regla, no duplicada)', () => {
    const importBlock = DESIGNER_SRC.slice(DESIGNER_SRC.indexOf('import {'), DESIGNER_SRC.indexOf("} from '@/domain/events'"))
    expect(importBlock).toContain('resolveLayerFontWeight')
    const block = slice(DESIGNER_SRC, 'function InvitationLayerVisual', "case 'emoji':")
    expect(block).toContain('const fontWeight = resolveLayerFontWeight(layer)')
  })

  it('resolveLayerFontWeight vive en domain/events.ts y respeta bold explícito con default compatible por tipo', () => {
    expect(EVENTS_SRC).toContain('export function resolveLayerFontWeight(layer: Pick<InvitationLayer, \'type\' | \'bold\'>): number {')
    expect(EVENTS_SRC).toContain("if (layer.bold !== undefined) return layer.bold ? 700 : 400")
    expect(EVENTS_SRC).toContain("return layer.type === 'text' ? 700 : 400")
  })

  it('fontStyle se deriva de layer.italic (nunca hardcodeado a "normal")', () => {
    const block = slice(DESIGNER_SRC, 'function InvitationLayerVisual', "case 'emoji':")
    expect(block).toContain("const fontStyle = layer.italic ? 'italic' : 'normal'")
    expect(block).toContain('fontStyle,') // aplicado en el <div> del texto no curvado
    expect(block).toContain('fontStyle={fontStyle}') // aplicado también en el <text> SVG (curvado)
  })

  it('textAlign se deriva de layer.textAlign con default "center" (compatible con invitaciones antiguas sin la propiedad)', () => {
    const block = slice(DESIGNER_SRC, 'function InvitationLayerVisual', "case 'emoji':")
    expect(block).not.toContain("textAlign: 'center',")
    expect(block).toContain("const textAlign = layer.textAlign ?? 'center'")
    expect(block).toContain('textAlign,')
  })
})

// Corrección UX (2026-09-27, posterior al Bloque 3) — el modo de edición de texto dejó de vivir dentro del
// .invitation-panel genérico: ahora es su propia barra (.invitation-text-edit-bar, ver
// invitationTextEditModeUi.test.ts) pegada al teclado. Los tests de alineación/negrita/cursiva se movieron
// ahí; este archivo conserva solo lo que NO cambió con esa corrección.
describe('Panel de color/tamaño ya existentes — sin tocar para formas/fotos (reorganización 2026-09-28: Fuente/Efecto de texto ya no son paneles aparte, viven en el menú de texto — ver invitationTextEditModeUi.test.ts)', () => {
  it('siguen presentes tal cual para lo que no es texto', () => {
    expect(DESIGNER_SRC).toContain("panel === 'color' && selected && selected.type === 'shape'")
    expect(DESIGNER_SRC).toContain("panel === 'tamano' && selected")
    // Fuente/Efecto como PANEL (no como herramienta del menú de texto) ya no existen — eran una duplicidad.
    expect(DESIGNER_SRC).not.toContain("panel === 'fuente'")
    expect(DESIGNER_SRC).not.toContain("panel === 'efecto'")
  })
})

describe('📋 Datos — panel real con los campos existentes del evento, ya no un botón que inserta todo el párrafo', () => {
  it('"datos" es un DesignerPanel de verdad (togglePanel), no una acción directa de un solo toque', () => {
    expect(DESIGNER_SRC).toContain("type DesignerPanel = 'plantilla' | 'datos' | 'emoji' | 'forma' | 'color' | 'tamano' | 'mas' | 'pepa'")
    expect(DESIGNER_SRC).toContain("onClick={() => togglePanel('datos')}")
  })

  it('ya NO inserta buildInvitationMessage(event) de un solo toque (ese comportamiento se sustituye por el panel)', () => {
    expect(DESIGNER_SRC).not.toContain('buildInvitationMessage')
  })

  it('el panel lee los campos de buildInvitationDataFields(event) — no una lista hardcodeada en la UI', () => {
    const panel = slice(DESIGNER_SRC, "panel === 'datos' && (", '{panel === \'mas\'')
    expect(panel).toContain('invitationDataFields.map')
    expect(DESIGNER_SRC).toContain('const invitationDataFields = useMemo(() => buildInvitationDataFields(event), [event])')
  })

  it('insertar un dato crea una capa event_data normal (editable como cualquier otra), no un tipo bloqueado especial', () => {
    const panel = slice(DESIGNER_SRC, "panel === 'datos' && (", '{panel === \'mas\'')
    expect(panel).toContain('handleAddLayer(')
    expect(panel).toContain("makeInvitationLayer('event_data'")
    expect(panel).toContain('text: f.value')
    expect(panel).toContain("color: '#ffffff'")
    expect(panel).toContain('fontSize: 14')
  })

  it('Fase 3 Bloque 5B — la capa insertada a mano lleva procedencia (source) hacia el campo del evento del que nació', () => {
    const panel = slice(DESIGNER_SRC, "panel === 'datos' && (", '{panel === \'mas\'')
    expect(panel).toContain("source: { kind: 'event_field', field: toEventFieldKey(f.key), valueAtInsertion: f.value }")
  })

  it('indica discretamente qué datos ya se han insertado, sin bloquear insertarlos de nuevo', () => {
    const panel = slice(DESIGNER_SRC, "panel === 'datos' && (", '{panel === \'mas\'')
    expect(panel).toContain('const alreadyInserted = layers.some((l) => l.text === f.value)')
  })

  it('si el evento no tiene ningún dato real todavía, no inventa nada — muestra un aviso en vez de una lista vacía silenciosa', () => {
    const panel = slice(DESIGNER_SRC, "panel === 'datos' && (", '{panel === \'mas\'')
    expect(panel).toContain('invitationDataFields.length === 0')
  })
})

describe('buildInvitationDataFields vive en domain/ (dominio puro), no duplicado en la UI', () => {
  it('está exportado desde domain/events.ts junto a InvitationDataField', () => {
    expect(EVENTS_SRC).toContain('export interface InvitationDataField {')
    expect(EVENTS_SRC).toContain('export function buildInvitationDataFields(event: FamilyEvent): InvitationDataField[] {')
  })

  it('no inventa un campo "edad" fuera de cumpleaños, ni ubicación fuera de lo realmente puesto', () => {
    expect(EVENTS_SRC).toContain("event.type === 'cumpleanos' && typeof event.details.ageTurning === 'number'")
  })
})
