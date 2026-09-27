import { describe, expect, it } from 'vitest'
import { INVITATION_TEMPLATES } from '@/domain/events'
import { classifyTemplateGeometry, composeInvitationForMe, type AutoComposeResult, type AutoComposeStyle } from '@/domain/invitationAutoCompose'
import type { FamilyEvent } from '@/domain/types'

// Fase 3 Bloque 5A, sección 38 — recorre las 100 plantillas reales para las 3 recetas, con un fixture de
// contenido razonablemente completo. Esto NO sustituye la certificación visual de navegador (sección 39,
// verificada aparte con el Canvas real) — detecta automáticamente casos claramente incompatibles con el
// heurístico Node (ver sección 23: el TextMeasurer real de Canvas puede aceptar algo que este fallback
// rechaza, nunca al revés en la práctica, porque el heurístico de caracteres es más conservador).

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

// Fixture "razonablemente completo" (título + fecha + hora + lugar + edad) para Clásica/Divertida.
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
  let accepted = 0,
    fallback = 0,
    fail = 0
  for (const r of rows) {
    if (r.result.status === 'fail') fail++
    else if (r.result.status === 'success') {
      if (r.result.acceptedRecipe === r.result.initialRecipe) accepted++
      else fallback++
    }
  }
  return { accepted, fallback, fail, total: rows.length }
}

describe('Matriz de las 100 plantillas — 📝 Clásica', () => {
  const rows = runMatrix('clasica')
  const summary = summarize(rows)

  it('todas las 100 dan un resultado (success o fail), nunca lanzan', () => {
    expect(rows.length).toBe(100)
    for (const r of rows) expect(['success', 'fail']).toContain(r.result.status)
  })

  it(`informe real (sin falsear): aceptadas=${summary.accepted} fallback=${summary.fallback} fail=${summary.fail} de 100`, () => {
     
    console.log('CLÁSICA:', summary, 'FAILs:', rows.filter((r) => r.result.status === 'fail').map((r) => r.key))
    expect(summary.accepted + summary.fallback + summary.fail).toBe(100)
  })

  it('every FAIL de verdad agotó su cadena completa de fallback (no se rinde a la primera)', () => {
    for (const r of rows) {
      if (r.result.status === 'fail') {
        const last = r.result.attemptedRecipes[r.result.attemptedRecipes.length - 1]
        expect(['C2']).toContain(last) // C2 es siempre el final de la cadena de Clásica
      }
    }
  })
})

describe('Matriz de las 100 plantillas — 📷 Con foto', () => {
  const rows = runMatrix('con_foto', TEST_PHOTO_PATH)
  const summary = summarize(rows)

  it('todas las 100 dan un resultado, nunca lanzan, y ninguna es needs_photo (se dio photoPath)', () => {
    expect(rows.length).toBe(100)
    for (const r of rows) expect(['success', 'fail']).toContain(r.result.status)
  })

  it(`informe real: aceptadas=${summary.accepted} fallback=${summary.fallback} fail=${summary.fail} de 100`, () => {
     
    console.log('CON FOTO:', summary, 'FAILs:', rows.filter((r) => r.result.status === 'fail').map((r) => r.key))
    expect(summary.accepted + summary.fallback + summary.fail).toBe(100)
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

describe('Matriz de las 100 plantillas — 🎉 Divertida', () => {
  const rows = runMatrix('divertida')
  const summary = summarize(rows)

  it('todas las 100 dan un resultado, nunca lanzan', () => {
    expect(rows.length).toBe(100)
    for (const r of rows) expect(['success', 'fail']).toContain(r.result.status)
  })

  it(`informe real: aceptadas=${summary.accepted} fallback=${summary.fallback} fail=${summary.fail} de 100`, () => {
     
    console.log('DIVERTIDA:', summary, 'FAILs:', rows.filter((r) => r.result.status === 'fail').map((r) => r.key))
    expect(summary.accepted + summary.fallback + summary.fail).toBe(100)
  })
})

describe('Conservación de datos en las 100 (para las que aceptan alguna receta)', () => {
  it('el título siempre sobrevive en las 3 recetas, en las 100 plantillas donde hay éxito', () => {
    for (const style of ['clasica', 'con_foto', 'divertida'] as const) {
      const rows = runMatrix(style, TEST_PHOTO_PATH)
      for (const r of rows) {
        if (r.result.status !== 'success') continue
        expect(r.result.layers.some((l) => l.text === FULL_EVENT.title), `${style}/${r.key}`).toBe(true)
      }
    }
  })
})
