import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fase 3 Bloque 3 (2026-09-27) — bug REPRODUCIDO EN VIVO (no solo sospechado): se movió/hizo zoom a una
// plantilla importada, se guardó, se comprobó en la base de datos que canvas_json SÍ tenía
// backgroundOffsetX/Y/backgroundScale correctos, y al reabrir el editor mostraba 0/0/1 — mapInvitation
// (data/events.ts) descartaba esos 3 campos al leer, aunque saveEventInvitation los guarda tal cual (el
// objeto InvitationCanvas completo va a canvas_json, sin allowlist). Corregido incluyéndolos en el objeto
// que reconstruye `canvas`.
const { maybeSingle } = vi.hoisted(() => ({ maybeSingle: vi.fn() }))
vi.mock('@/data/supabaseClient', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) },
}))

const { getEventInvitation } = await import('@/data/events')

function row(canvasJson: Record<string, unknown>) {
  return {
    id: 'inv1',
    event_id: 'e1',
    family_id: 'f1',
    template_key: 'floral_jardin',
    canvas_json: canvasJson,
    background_image_path: 'f1/e1/fondo.jpg',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

beforeEach(() => {
  maybeSingle.mockReset()
})

describe('getEventInvitation — persistencia de backgroundOffsetX/Y/backgroundScale (plantilla importada)', () => {
  it('reconstruye los 3 campos guardados — antes SIEMPRE se perdían, aunque estuvieran en canvas_json', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: row({ backgroundGradient: '', layers: [], backgroundOffsetX: 0.131195, backgroundOffsetY: -0.010933, backgroundScale: 1.8 }),
      error: null,
    })
    const invitation = await getEventInvitation('e1')
    expect(invitation?.canvas.backgroundOffsetX).toBeCloseTo(0.131195, 5)
    expect(invitation?.canvas.backgroundOffsetY).toBeCloseTo(-0.010933, 5)
    expect(invitation?.canvas.backgroundScale).toBe(1.8)
  })

  it('offsetX/Y en 0 (posición real, no "sin valor") no se confunde con ausente — sigue siendo 0, no cae a otro default', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: row({ backgroundGradient: '', layers: [], backgroundOffsetX: 0, backgroundOffsetY: 0, backgroundScale: 2.4 }),
      error: null,
    })
    const invitation = await getEventInvitation('e1')
    expect(invitation?.canvas.backgroundOffsetX).toBe(0)
    expect(invitation?.canvas.backgroundOffsetY).toBe(0)
    expect(invitation?.canvas.backgroundScale).toBe(2.4)
  })

  it('una invitación guardada ANTES de que existieran estos 3 campos sigue abriendo bien (undefined, sin lanzar error)', async () => {
    maybeSingle.mockResolvedValueOnce({ data: row({ backgroundGradient: '', layers: [] }), error: null })
    const invitation = await getEventInvitation('e1')
    expect(invitation?.canvas.backgroundOffsetX).toBeUndefined()
    expect(invitation?.canvas.backgroundOffsetY).toBeUndefined()
    expect(invitation?.canvas.backgroundScale).toBeUndefined()
    // El editor (InvitationDesigner.tsx) hace `?? 0`/`?? 1` sobre justo estos undefined — encaja de fondo fijo, sin zoom, como siempre.
  })

  it('sigue reconstruyendo backgroundGradient y layers como antes (no se ha roto nada de lo que ya funcionaba)', async () => {
    const layers = [{ id: 'l1', type: 'text' as const, x: 0.5, y: 0.5, rotation: 0, scale: 1, zIndex: 1, text: 'Hola' }]
    maybeSingle.mockResolvedValueOnce({ data: row({ backgroundGradient: 'linear-gradient(red, blue)', layers }), error: null })
    const invitation = await getEventInvitation('e1')
    expect(invitation?.canvas.backgroundGradient).toBe('linear-gradient(red, blue)')
    expect(invitation?.canvas.layers).toEqual(layers)
  })
})
