import { describe, expect, it } from 'vitest'

// Eventos — Parte B (encargo "TENEMOS TRES TRABAJOS CONCRETOS"): el RSVP público amplía el flujo de
// token EXISTENTE (nunca el de enlace abierto, que no tiene event_guest_members todavía) para que, cuando
// la unidad invitada tiene personas desglosadas, cada una registre su propia asistencia y, si la decisión
// "¿elegirán menú en la invitación?" está en "sí" y ya hay opciones (event_menu_options, migración 0189),
// su propio menú. Mismas convenciones de test que eventRsvpMomentsFunction.test.ts: se lee el código real
// de la función (no hay runtime Deno en este suite).
const FUNCTIONS = import.meta.glob('/supabase/functions/event-rsvp/index.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SRC = FUNCTIONS['/supabase/functions/event-rsvp/index.ts']

describe('event-rsvp — GET (flujo con token): members + menuOptions en la respuesta', () => {
  it('lee event_guest_members de ESTE invitado (g.id), nunca de todo el evento', () => {
    expect(SRC).toContain('.from("event_guest_members")')
    expect(SRC).toContain('.select("id, name, person_type, rsvp_attending, menu_option_id")')
    expect(SRC).toContain('.eq("guest_id", g.id)')
  })

  it('la decisión "¿elegirán menú?" se lee de event_decisions por event_id + block_key + question_key, nunca por texto libre', () => {
    expect(SRC).toContain('.from("event_decisions")')
    expect(SRC).toContain('.eq("event_id", ev.id)')
    expect(SRC).toContain('.eq("block_key", "invitados")')
    expect(SRC).toContain('.eq("question_key", "invitados.menu_invitacion")')
  })

  it('ajuste de UX — "sí" sin más ya no implica menú: solo cuando wantsMenu no es explícitamente false (compatibilidad con filas guardadas ANTES de este ajuste, que nunca tenían wantsMenu y significaban "sí" = menú sin ambigüedad)', () => {
    expect(SRC).toContain('const menuAnswer = menuDecision?.answer as { choice?: string; wantsMenu?: boolean } | null')
    expect(SRC).toContain('const menuChoiceActive = menuAnswer?.choice === "si" && menuAnswer?.wantsMenu !== false')
  })

  it('solo pide event_menu_options cuando la decisión está en "sí" Y hay personas desglosadas — nunca inventa opciones ni bloquea sin ellas', () => {
    const idx = SRC.indexOf('if (menuChoiceActive && members.length > 0) {')
    expect(idx).toBeGreaterThan(-1)
    const body = SRC.slice(idx, SRC.indexOf('\n    }', idx))
    expect(body).toContain('.from("event_menu_options")')
    expect(body).toContain('.select("id, name")')
    expect(body).toContain('.eq("event_id", ev.id)')
  })

  it('el guest público devuelve members y menuOptions ya mapeados a camelCase, sin exponer columnas internas de más', () => {
    const idx = SRC.lastIndexOf('guest: {')
    const body = SRC.slice(idx, SRC.indexOf('\n      },', idx))
    expect(body).toContain('members: members.map((m) => ({ id: m.id, name: m.name, personType: m.person_type, rsvpAttending: m.rsvp_attending, menuOptionId: m.menu_option_id }))')
    expect(body).toContain('menuOptions: menuOptions.map((o) => ({ id: o.id, name: o.name }))')
  })

  it('el flujo de enlace abierto (open_rsvp_token) no toca members/menuOptions — ahí nunca hay personas desglosadas todavía', () => {
    const openIdx = SRC.indexOf('if (openToken) {')
    const openBody = SRC.slice(openIdx, SRC.indexOf('\n    const { data: guest }', openIdx))
    expect(openBody).not.toContain('event_guest_members')
    expect(openBody).not.toContain('event_menu_options')
  })
})

describe('event-rsvp — POST (flujo con token): elección por persona validada a mano (rol de servicio, sin RLS)', () => {
  it('solo procesa body.members cuando es un array no vacío — nunca lo exige', () => {
    expect(SRC).toContain('if (Array.isArray(body.members) && body.members.length > 0) {')
  })

  it('cada member_id se comprueba contra las personas de ESTE invitado antes de escribir nada (nunca confía en el id que manda el cliente) — resolveOwnMemberIds se calcula una sola vez y la reutilizan tanto el menú por persona como las preguntas personalizadas', () => {
    const fnIdx = SRC.indexOf('async function resolveOwnMemberIds(')
    const fnBody = SRC.slice(fnIdx, SRC.indexOf('\n      }\n\n      // Elección por persona', fnIdx))
    expect(fnBody).toContain('.from("event_guest_members").select("id").eq("guest_id", g.id)')
    const membersIdx = SRC.indexOf('if (Array.isArray(body.members)')
    const membersBody = SRC.slice(membersIdx, SRC.indexOf('\n      }\n\n      // "📋 Preguntas a los invitados"', membersIdx))
    expect(membersBody).toContain('const own = await resolveOwnMemberIds()')
    expect(membersBody).toContain('if (!memberId || !own.has(memberId)) continue')
  })

  it('un menu_option_id que no pertenece a ESTE evento se descarta (se guarda null), nunca se escribe tal cual', () => {
    const idx = SRC.indexOf('if (Array.isArray(body.members)')
    const body = SRC.slice(idx, SRC.indexOf('\n      }\n\n      // "📋 Preguntas a los invitados"', idx))
    expect(body).toContain('.from("event_menu_options").select("id").eq("event_id", ev.id)')
    expect(body).toContain('if (!validOptionIds.has(menuOptionId)) menuOptionId = null')
  })

  it('escribe rsvp_attending/menu_option_id en event_guest_members por id, nunca en lote sin condición', () => {
    expect(SRC).toContain('await admin.from("event_guest_members").update({ rsvp_attending: attending, menu_option_id: menuOptionId }).eq("id", memberId)')
  })
})

describe('event-rsvp — superficie pública sigue sin ampliarse a datos privados', () => {
  it('nunca se seleccionan presupuesto/pagos/regalos recibidos/proveedores, tampoco en el código nuevo de Parte B', () => {
    expect(SRC).not.toMatch(/event_budget_items|event_payments|event_gifts_received|event_providers/)
  })
})
