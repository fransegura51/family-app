import { describe, expect, it } from 'vitest'

// Fase 3 Bloque 3 (2026-09-27) — bug real encontrado probando "Plantilla importada" en vivo: un diseño
// hecho SOLO de foto de fondo (sin ninguna capa de texto/emoji/forma encima) tiene canvas.layers.length===0,
// así que tanto InvitationSection (Evento → 💌 Invitación) como InvitationModal (Invitados → 💌 Invitación,
// envío) lo trataban como "todavía no hay diseño" y ocultaban la vista previa / el botón de editar / el
// canvas personalizado al enviar — aunque el usuario SÍ tuviera un fondo propio guardado.
const EVENTOS_SRC = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/src/ui/EventosScreen.tsx'
]

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('InvitationSection.hasDesign cuenta un fondo importado sin capas como diseño real', () => {
  it('hasDesign es true con capas O con backgroundImagePath, no solo con capas', () => {
    const block = slice(EVENTOS_SRC, 'function InvitationSection', '\nfunction GuestsSection')
    expect(block).toContain("const hasDesign = !!invitation && (invitation.canvas.layers.length > 0 || !!invitation.backgroundImagePath)")
  })
})

describe('InvitationModal detecta un diseño personalizado hecho solo de fondo importado', () => {
  it('el guard de "no hay diseño todavía" ya no exige layers.length>0 en solitario', () => {
    const block = slice(EVENTOS_SRC, 'function InvitationModal', '\n// ---')
    expect(block).toContain('invitation.canvas.layers.length === 0 && !invitation.backgroundImagePath')
    expect(block).not.toContain('if (!invitation || invitation.canvas.layers.length === 0) return')
  })
})
