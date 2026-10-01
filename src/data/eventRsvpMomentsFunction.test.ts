import { describe, expect, it } from 'vitest'

// Eventos — Cierre de Fase 2: la función pública event-rsvp pasa a leer event_moments cuando el evento ya
// los tiene. Guardas de seguridad/compatibilidad leyendo el código real de la función (no hay runtime Deno
// en este suite) — mismo patrón que el resto de tests de migraciones/funciones de este proyecto.
const FUNCTIONS = import.meta.glob('/supabase/functions/event-rsvp/index.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SRC = FUNCTIONS['/supabase/functions/event-rsvp/index.ts']

describe('event-rsvp — fallback heredado intacto', () => {
  it('locationLines (camino heredado) no se ha tocado: sigue leyendo directamente ceremony_location_label/celebration_location_label', () => {
    expect(SRC).toContain('function locationLines(event: EventRow, guest: Pick<GuestRow, "invite_scope"> | null)')
    expect(SRC).toContain('event.ceremony_location_label')
    expect(SRC).toContain('event.celebration_location_label')
  })

  it('resolveLocationLines cae a locationLines() sin cambios cuando el evento no tiene event_moments', () => {
    const idx = SRC.indexOf('async function resolveLocationLines(')
    const body = SRC.slice(idx, SRC.indexOf('\n}', idx))
    expect(body).toContain('if (moments.length === 0) return locationLines(event, guest)')
  })
})

describe('event-rsvp — moments-first, nunca identifica un momento por su título libre', () => {
  it('momentsLocationLines solo construye texto a partir de los campos del propio momento', () => {
    const idx = SRC.indexOf('function momentsLocationLines(')
    const body = SRC.slice(idx, SRC.indexOf('\n}', idx + 1))
    expect(body).not.toMatch(/m\.title\s*===/)
  })

  it('visibleMomentsForGuest SÍ compara título, pero únicamente en la rama de compatibilidad con invite_scope (ya aprobada en Fase 1) — nunca para el camino con enlaces explícitos', () => {
    const idx = SRC.indexOf('function visibleMomentsForGuest(')
    const body = SRC.slice(idx, SRC.indexOf('\n}', idx))
    expect(body).toContain('if (guestMomentIds && guestMomentIds.size > 0) return moments.filter((m) => guestMomentIds.has(m.id))')
    expect(body).toContain('m.title === "Ceremonia"')
    expect(body).toContain('m.title === "Celebración"')
  })
})

describe('event-rsvp — superficie pública sin ampliar', () => {
  it('MomentRow solo expone título/fecha/hora/lugar — nunca coordenadas ni ningún campo interno', () => {
    const idx = SRC.indexOf('interface MomentRow {')
    const body = SRC.slice(idx, SRC.indexOf('}', idx))
    expect(body).toContain('title: string')
    expect(body).toContain('moment_date: string | null')
    expect(body).toContain('moment_time: string | null')
    expect(body).toContain('location_label: string | null')
    expect(body).not.toMatch(/latitude|longitude|decision_id|family_id/)
  })

  it('la consulta a event_moments/event_guest_moments pide solo esas columnas, nunca "*"', () => {
    expect(SRC).toContain('.select("id, title, moment_date, moment_time, location_label")')
    expect(SRC).toContain('.select("moment_id")')
    expect(SRC).not.toMatch(/\.from\("event_moments"\)\s*\n?\s*\.select\("\*"\)/)
  })
})

describe('event-rsvp — seguridad sin cambios (tokens, RLS, rol de servicio)', () => {
  it('sigue usando el mismo cliente de rol de servicio ya creado al principio de la función — no crea uno nuevo ni abre nada a anon', () => {
    const resolveIdx = SRC.indexOf('async function resolveLocationLines(')
    const resolveBody = SRC.slice(resolveIdx, SRC.indexOf('\n}', resolveIdx))
    expect(resolveBody).not.toMatch(/createClient\(/)
    expect(SRC).not.toMatch(/\banon\b/)
  })

  it('no se ha tocado la generación/verificación de tokens (rsvp_token, open_rsvp_token) ni verify_jwt', () => {
    expect(SRC).toContain('.eq("rsvp_token", token)')
    expect(SRC).toContain('.eq("open_rsvp_token", openToken)')
    expect(SRC).toContain('verify_jwt = false a propósito')
  })

  it('nunca se seleccionan presupuesto/pagos/regalos recibidos/notas internas de otros invitados', () => {
    expect(SRC).not.toMatch(/event_budget_items|event_payments|event_gifts_received|event_providers/)
  })
})
