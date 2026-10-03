import { describe, expect, it } from 'vitest'

const SRC = (import.meta.glob('/src/ui/RsvpScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/RsvpScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('RsvpScreen — "📋 Preguntas a los invitados" ampliando el RSVP existente, nunca un segundo formulario', () => {
  it('PublicGuestQuestion distingue scope "persona"/"invitacion", con sus propias opciones y respuestas ya guardadas', () => {
    expect(SRC).toContain("scope: 'persona' | 'invitacion'")
    expect(SRC).toContain('interface PublicGuestQuestionAnswer {')
    expect(SRC).toContain('interface PublicGuestQuestionOption {')
  })

  it('scope "persona" se renderiza DENTRO de la tarjeta de cada persona, solo cuando esa persona viene — nunca para quien no viene', () => {
    const form = slice(SRC, 'function RsvpForm(', '\nfunction OpenRsvpForm(')
    expect(form).toContain("m.attending === true &&\n                  guest.questions\n                    .filter((q) => q.scope === 'persona')")
  })

  it('scope "invitacion" se renderiza una sola vez para toda la unidad, nunca repetida por persona', () => {
    const form = slice(SRC, 'function RsvpForm(', '\nfunction OpenRsvpForm(')
    expect(form).toContain("guest.questions\n          .filter((q) => q.scope === 'invitacion')")
    expect(form).toContain('questionAnswers[q.id]?.[INVITACION_ANSWER_KEY]')
  })

  it('las preguntas solo se muestran (y se envían) cuando status === "confirmado" — igual criterio que adultos/niños y menú', () => {
    const form = slice(SRC, 'function RsvpForm(', '\nfunction OpenRsvpForm(')
    expect(form).toContain("if (status === 'confirmado') {")
  })

  it('ninguna opción viene preseleccionada — el <select> siempre arranca en "Sin elegir todavía"', () => {
    const form = slice(SRC, 'function RsvpForm(', '\nfunction OpenRsvpForm(')
    const matches = form.match(/questionAnswers\[q\.id\]\?\.\[[^\]]+\] \?\? ''/g) ?? []
    expect(matches.length).toBe(2) // una para scope "persona" (por m.id), otra para "invitacion"
  })

  it('missingRequiredQuestion valida obligatoriedad en el propio formulario antes de enviar — nunca bloquea una pregunta que no se está mostrando', () => {
    const form = slice(SRC, 'function RsvpForm(', '\nfunction OpenRsvpForm(')
    expect(form).toContain('function missingRequiredQuestion(): boolean {')
    expect(form).toContain('if (status !== \'confirmado\') return false')
    expect(form).toContain('if (!q.required) continue')
  })

  it('el envío se bloquea de verdad si falta una obligatoria (handleSubmit comprueba missingRequiredQuestion antes de fetch)', () => {
    const form = slice(SRC, 'function RsvpForm(', '\nfunction OpenRsvpForm(')
    const handleSubmit = slice(form, 'async function handleSubmit(', '\n  return (')
    expect(handleSubmit).toContain('if (missingRequiredQuestion()) {')
    expect(handleSubmit.indexOf('if (missingRequiredQuestion())')).toBeLessThan(handleSubmit.indexOf('setSaving(true)'))
  })

  it('body.questionAnswers se construye a partir del estado local, con memberId null para scope "invitacion"', () => {
    const form = slice(SRC, 'function RsvpForm(', '\nfunction OpenRsvpForm(')
    expect(form).toContain("memberId: memberKey === INVITACION_ANSWER_KEY ? null : memberKey")
  })

  it('OpenRsvpForm (enlace abierto) nunca menciona preguntas personalizadas — ahí no hay invitado/personas previas a las que preguntar', () => {
    const idx = SRC.indexOf('function OpenRsvpForm(')
    expect(idx).toBeGreaterThan(-1)
    const openForm = SRC.slice(idx)
    expect(openForm).not.toContain('questionAnswers')
    expect(openForm).not.toContain('PublicGuestQuestion')
  })
})
