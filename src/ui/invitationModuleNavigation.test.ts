import { describe, expect, it } from 'vitest'

// Fase 3 — reestructuración del diseñador de invitaciones (2026-09-27, Bloque 1: A+B).
// Antes: la única forma de crear/editar el diseño en capas era el botón "🎨 Diseño de la
// invitación" dentro de Invitados (GuestsSection), mezclando "diseñar" con "enviar". Ahora:
// cada evento tiene su propio módulo 💌 Invitación (EventModuleKey ya existía en
// domain/events.ts, reservado sin usar); Invitados conserva solo el envío/RSVP.
const EVENTOS_APP = import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const EVENTOS_SRC = EVENTOS_APP['/src/ui/EventosScreen.tsx']

function window(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('Evento → 💌 Invitación (módulo propio, TEST: conecta EventModuleKey ya reservado)', () => {
  it('la rejilla de módulos ya NO salta "invitaciones" (antes: if (mod.key === \'invitaciones\') continue)', () => {
    const gridFn = window(EVENTOS_SRC, 'const moduleCards: ModuleCardDef[] = []', 'const cardColors = pastelPalette')
    expect(gridFn).not.toContain("if (mod.key === 'invitaciones') continue")
  })

  it('renderOpenModule tiene un caso "invitaciones" que abre InvitationSection', () => {
    const renderFn = window(EVENTOS_SRC, 'function renderOpenModule', '\n  if (openModule !== null)')
    expect(renderFn).toContain("case 'invitaciones':")
    expect(renderFn).toContain('<InvitationSection')
  })

  it('InvitationSection reutiliza getEventInvitation/InvitationCanvasEditor — no crea un segundo motor ni módulo independiente', () => {
    const section = window(EVENTOS_SRC, 'function InvitationSection', '\nfunction GuestsSection')
    expect(section).toContain('getEventInvitation(event.id)')
    expect(section).toContain('<InvitationCanvasEditor')
    expect(section).toContain('<InvitationCanvasView')
  })

  it('InvitationSection ofrece un CTA "Crear invitación" cuando el evento todavía no tiene diseño', () => {
    const section = window(EVENTOS_SRC, 'function InvitationSection', '\nfunction GuestsSection')
    expect(section).toContain('+ Crear invitación')
    expect(section).toContain('setShowEditor(true)')
  })

  it('InvitationSection recuerda a "👥 Invitados" para enviarla — no duplica el flujo de envío', () => {
    const section = window(EVENTOS_SRC, 'function InvitationSection', '\nfunction GuestsSection')
    expect(section).toContain('Para enviarla a los invitados, ve a 👥 Invitados.')
  })
})

describe('Evento → 👥 Invitados (TEST: conserva envío, pierde la responsabilidad de diseñar)', () => {
  it('GuestsSection ya no importa/renderiza InvitationCanvasEditor (el diseñador vivía ahí antes de Fase 3)', () => {
    const section = window(EVENTOS_SRC, 'function GuestsSection', '\nfunction EventOpenLinkBlock')
    expect(section).not.toContain('InvitationCanvasEditor')
    expect(section).not.toContain('🎨 Diseño de la invitación')
  })

  it('GuestsSection conserva el botón 💌 Invitación por invitado, que abre InvitationModal (envío/RSVP)', () => {
    const section = window(EVENTOS_SRC, 'function GuestsSection', '\nfunction EventOpenLinkBlock')
    expect(section).toContain('💌 Invitación')
    expect(section).toContain('setInvitationGuest(g)')
    expect(section).toContain('<InvitationModal')
  })

  it('GuestsSection recibe onOpenInvitation del evento y se lo pasa a InvitationModal como onCreateInvitation', () => {
    const section = window(EVENTOS_SRC, 'function GuestsSection', '\nfunction EventOpenLinkBlock')
    expect(section).toContain('onOpenInvitation: () => void')
    expect(section).toContain('onCreateInvitation={onOpenInvitation}')
  })

  it('el CTA de EventDetail hacia GuestsSection navega al módulo "invitaciones" del MISMO evento (no abre un editor aparte)', () => {
    const renderFn = window(EVENTOS_SRC, 'function renderOpenModule', '\n  if (openModule !== null)')
    expect(renderFn).toContain("<GuestsSection")
    expect(renderFn).toContain("onOpenInvitation={() => setOpenModule('invitaciones')}")
  })

  it('InvitationModal, sin invitación creada todavía, ofrece un CTA que cierra el modal y navega al módulo Invitación (no referencia ya el botón eliminado)', () => {
    const modalFn = window(EVENTOS_SRC, 'function InvitationModal', '\n// ---')
    expect(modalFn).not.toContain('Diseño de la invitación" en Invitados')
    expect(modalFn).toContain('onCreateInvitation: () => void')
    expect(modalFn).toContain('onClose()')
    expect(modalFn).toContain('onCreateInvitation()')
  })
})
