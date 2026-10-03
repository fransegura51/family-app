import { describe, expect, it } from 'vitest'

// Eventos — "📋 Preguntas a los invitados" (reajuste de "Momentos especiales"): el RSVP público amplía el
// flujo de token EXISTENTE (nunca el de enlace abierto) para exponer las preguntas ACTIVAS de un evento
// con sus opciones y la respuesta ya guardada, y para aceptar nuevas respuestas validadas a mano (rol de
// servicio, sin RLS). Deliberadamente aparte de la elección de menú (migración 0189) — mismas convenciones
// de test que eventRsvpMenuChoiceFunction.test.ts: se lee el código real de la función.
const FUNCTIONS = import.meta.glob('/supabase/functions/event-rsvp/index.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SRC = FUNCTIONS['/supabase/functions/event-rsvp/index.ts']

describe('event-rsvp — GET (flujo con token): preguntas activas + opciones + respuesta ya guardada', () => {
  it('solo pide preguntas con active = true — una pregunta desactivada nunca llega al invitado', () => {
    const idx = SRC.indexOf("const { data: guestQuestionsData } = await admin")
    const body = SRC.slice(idx, SRC.indexOf('\n    const guestQuestions', idx))
    expect(body).toContain('.from("event_guest_questions")')
    expect(body).toContain('.eq("event_id", ev.id)')
    expect(body).toContain('.eq("active", true)')
  })

  it('opciones y respuestas se piden con .in("question_id", questionIds) — nunca una consulta por pregunta', () => {
    const idx = SRC.indexOf('if (guestQuestions.length > 0) {')
    const body = SRC.slice(idx, SRC.indexOf('\n    }\n\n    return json({', idx))
    expect(body).toContain('.from("event_guest_question_options")')
    expect(body).toContain('.in("question_id", questionIds)')
    expect(body).toContain('.from("event_guest_question_answers")')
    expect(body).toContain('.eq("guest_id", g.id)')
  })

  it('el guest público devuelve "questions" con prompt/scope/required/options/answers, nunca más columnas internas', () => {
    const idx = SRC.indexOf('questions: guestQuestions.map((q) => (')
    const body = SRC.slice(idx, SRC.indexOf('\n        })),', idx))
    expect(body).toContain('prompt: q.prompt')
    expect(body).toContain('scope: q.scope')
    expect(body).toContain('required: q.required')
    expect(body).toContain('options: guestQuestionOptions.filter((o) => o.question_id === q.id).map((o) => ({ id: o.id, label: o.label }))')
    expect(body).toContain('answers: guestQuestionAnswers.filter((a) => a.question_id === q.id).map((a) => ({ memberId: a.member_id, optionId: a.option_id }))')
  })

  it('el flujo de enlace abierto (open_rsvp_token) no toca event_guest_questions — ahí no hay invitado al que preguntarle nada todavía', () => {
    const openIdx = SRC.indexOf('if (openToken) {')
    const openBody = SRC.slice(openIdx, SRC.indexOf('\n    const { data: guest }', openIdx))
    expect(openBody).not.toContain('event_guest_questions')
  })
})

describe('event-rsvp — POST (flujo con token): respuestas validadas a mano, sin confiar en lo que manda el cliente', () => {
  it('solo procesa body.questionAnswers cuando es un array no vacío — nunca lo exige', () => {
    expect(SRC).toContain('if (Array.isArray(body.questionAnswers) && body.questionAnswers.length > 0) {')
  })

  it('solo se aceptan preguntas de ESTE evento Y activas — una pregunta de otro evento o ya desactivada se descarta en silencio', () => {
    const idx = SRC.indexOf('if (Array.isArray(body.questionAnswers)')
    const body = SRC.slice(idx, SRC.indexOf('\n      }\n\n      return json({ ok: true })', idx))
    expect(body).toContain('.from("event_guest_questions").select("id, scope, required").eq("event_id", ev.id).eq("active", true)')
    expect(body).toContain('if (!question) continue')
  })

  it('la opción elegida se revalida contra question_id — una opción de otra pregunta (aunque del mismo evento) se descarta', () => {
    const idx = SRC.indexOf('if (Array.isArray(body.questionAnswers)')
    const body = SRC.slice(idx, SRC.indexOf('\n      }\n\n      return json({ ok: true })', idx))
    expect(body).toContain('.from("event_guest_question_options").select("id").eq("id", optionId).eq("question_id", question.id)')
    expect(body).toContain('if (!validOption) continue')
  })

  it('scope "persona" exige un member_id de ESTE invitado (resolveOwnMemberIds); scope "invitacion" nunca lleva member_id', () => {
    const idx = SRC.indexOf('if (Array.isArray(body.questionAnswers)')
    const body = SRC.slice(idx, SRC.indexOf('\n      }\n\n      return json({ ok: true })', idx))
    expect(body).toContain('if (question.scope === "persona") {')
    expect(body).toContain('if (!candidate || !own.has(candidate)) continue')
  })

  it('upsert manual (select + update/insert) en vez de .upsert() — correcto con los índices únicos PARCIALES de la migración 0190', () => {
    const idx = SRC.indexOf('if (Array.isArray(body.questionAnswers)')
    const body = SRC.slice(idx, SRC.indexOf('\n      }\n\n      return json({ ok: true })', idx))
    expect(body).toContain('existingQuery = memberId ? existingQuery.eq("member_id", memberId) : existingQuery.is("member_id", null).eq("guest_id", g.id)')
    expect(body).toContain('.from("event_guest_question_answers").update({ option_id: optionId, updated_at: new Date().toISOString() })')
    expect(body).toContain('.from("event_guest_question_answers").insert({')
  })

  it('nunca escribe family_id/event_id a partir de lo que manda el cliente — siempre ev.id/ev.family_id del lado del servidor', () => {
    const idx = SRC.indexOf('if (Array.isArray(body.questionAnswers)')
    const body = SRC.slice(idx, SRC.indexOf('\n      }\n\n      return json({ ok: true })', idx))
    expect(body).toContain('event_id: ev.id,')
    expect(body).toContain('family_id: ev.family_id,')
  })
})

describe('event-rsvp — "📋 Preguntas a los invitados" nunca genera Preparativo/Presupuesto/Proveedor — solo recoge información', () => {
  it('el bloque de preguntas personalizadas no menciona event_tasks/event_budget_items/event_providers', () => {
    const idx = SRC.indexOf('if (Array.isArray(body.questionAnswers)')
    const body = SRC.slice(idx, SRC.indexOf('\n      }\n\n      return json({ ok: true })', idx))
    expect(body).not.toMatch(/event_tasks|event_budget_items|event_providers/)
  })
})
