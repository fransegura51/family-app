import { describe, expect, it } from 'vitest'
import { INVITATION_TEMPLATES } from '@/domain/events'
import { classifyTemplateGeometry, composeInvitationForMe, type AutoComposeResult, type AutoComposeStyle } from '@/domain/invitationAutoCompose'
import type { FamilyEvent } from '@/domain/types'

// Fase 3 Bloque 5A, sección 38, evolucionado 2026-09-28 — recorre las 100 plantillas reales para los 2
// estilos (con y sin foto), con un fixture de contenido razonablemente completo. Esto NO sustituye la
// certificación visual de navegador — detecta automáticamente casos claramente incompatibles con el
// heurístico Node (el TextMeasurer real de Canvas puede aceptar algo que este fallback rechaza, nunca al
// revés en la práctica, porque el heurístico de caracteres es más conservador).

function makeEvent(overrides: Partial<FamilyEvent>): FamilyEvent {
  return {
    id: 'e1', familyId: 'f1', type: 'cumpleanos', subtype: null, title: 'Evento', dateStatus: 'confirmada',
    eventDate: null, eventTime: null, venueLabel: null, venueType: null, venueLatitude: null, venueLongitude: null,
    ceremonyLocationLabel: null, ceremonyLocationLatitude: null, ceremonyLocationLongitude: null, ceremonyTime: null,
    celebrationLocationLabel: null, celebrationLocationLatitude: null, celebrationLocationLongitude: null,
    theme: null, details: {}, enabledModules: [], status: 'planificacion', tagId: null, calendarEventId: null,
    rsvpDeadline: null, rsvpDeadlineCalendarEventId: null, openRsvpToken: null, createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...overrides,
  }
}

// Fixture "razonablemente completo" (título + fecha + hora + lugar + edad).
const FULL_EVENT = makeEvent({
  type: 'cumpleanos',
  title: 'Cumpleaños de Valentina',
  eventDate: '2026-11-14',
  eventTime: '18:00',
  venueLabel: 'Salón de fiestas Arcoíris',
  details: { ageTurning: 8 },
})
const TEST_PHOTO_PATH = 'familia-test/evento-test/foto-referencia.jpg'

function runMatrix(style: AutoComposeStyle, photoPath?: string) {
  const rows: { key: string; family: number; result: AutoComposeResult }[] = []
  for (const t of INVITATION_TEMPLATES) {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: t, style, photoPath })
    rows.push({ key: t.key, family: classifyTemplateGeometry(t), result })
  }
  return rows
}

function summarize(rows: { result: AutoComposeResult }[]) {
  let success = 0,
    fail = 0
  for (const r of rows) {
    if (r.result.status === 'fail') fail++
    else success++
  }
  return { success, fail, total: rows.length }
}

describe('Matriz de las 100 plantillas — 📝 Clásico (sin foto)', () => {
  const rows = runMatrix('clasico')
  const summary = summarize(rows)

  it('todas las 100 dan un resultado (success o fail), nunca lanzan', () => {
    expect(rows.length).toBe(100)
    for (const r of rows) expect(['success', 'fail']).toContain(r.result.status)
  })

  it(`informe real (sin falsear): success=${summary.success} fail=${summary.fail} de 100`, () => {

    console.log('CLÁSICO:', summary, 'FAILs:', rows.filter((r) => r.result.status === 'fail').map((r) => r.key))
    expect(summary.success + summary.fail).toBe(100)
  })

  it('every FAIL de verdad agotó toda su secuencia de adaptación (nunca se rinde a la primera)', () => {
    for (const r of rows) {
      if (r.result.status === 'fail') expect(r.result.attemptsTried).toBeGreaterThan(1)
    }
  })
})

describe('Matriz de las 100 plantillas — 📝 Clásico con foto', () => {
  const rows = runMatrix('clasico', TEST_PHOTO_PATH)
  const summary = summarize(rows)

  it('todas las 100 dan un resultado, nunca lanzan', () => {
    expect(rows.length).toBe(100)
    for (const r of rows) expect(['success', 'fail']).toContain(r.result.status)
  })

  it(`informe real: success=${summary.success} fail=${summary.fail} de 100`, () => {

    console.log('CLÁSICO CON FOTO:', summary, 'FAILs:', rows.filter((r) => r.result.status === 'fail').map((r) => r.key))
    expect(summary.success + summary.fail).toBe(100)
  })

  it('la foto nunca invade el texto en ninguna de las 100 (banda de foto siempre por encima de la banda de texto)', () => {
    for (const r of rows) {
      if (r.result.status !== 'success') continue
      const photoLayer = r.result.layers.find((l) => l.type === 'photo')!
      const textLayers = r.result.layers.filter((l) => l.type === 'text' || l.type === 'event_data')
      for (const t of textLayers) expect(t.y, `${r.key}: texto por encima de la foto`).toBeGreaterThan(photoLayer.y)
    }
  })
})

describe('Matriz de las 100 plantillas — 🎉 Divertido', () => {
  const rows = runMatrix('divertido')
  const summary = summarize(rows)

  it('todas las 100 dan un resultado, nunca lanzan', () => {
    expect(rows.length).toBe(100)
    for (const r of rows) expect(['success', 'fail']).toContain(r.result.status)
  })

  it(`informe real: success=${summary.success} fail=${summary.fail} de 100`, () => {

    console.log('DIVERTIDO:', summary, 'FAILs:', rows.filter((r) => r.result.status === 'fail').map((r) => r.key))
    expect(summary.success + summary.fail).toBe(100)
  })
})

describe('Conservación de datos en las 100 (para las que aceptan alguna presentación)', () => {
  it('el título siempre sobrevive en los 2 estilos, con y sin foto, en las 100 plantillas donde hay éxito', () => {
    for (const style of ['clasico', 'divertido'] as const) {
      for (const photoPath of [undefined, TEST_PHOTO_PATH]) {
        const rows = runMatrix(style, photoPath)
        for (const r of rows) {
          if (r.result.status !== 'success') continue
          expect(r.result.layers.some((l) => l.text === FULL_EVENT.title), `${style}/${photoPath ?? 'sin foto'}/${r.key}`).toBe(true)
        }
      }
    }
  })
})
