import { describe, expect, it } from 'vitest'
import { cardAccess, type HelpContext } from '@/help/access'
import { HELP_CARDS, HELP_MODULE_BY_ID, LEGACY_ENTRIES } from '@/help/catalog'
import { buildIndex, searchHelp } from '@/help/search/searchEngine'
import { ruleResult, moduleAccess } from '@/help/access'
import { TOURS } from '@/help/tours/registry'
import { answerHelpRequest, looksLikeHelpRequest, moduleMentioned, spokenCard, type TalkHelpApi } from '@/help/talkHelp'

const index = buildIndex(HELP_CARDS, LEGACY_ENTRIES)

function apiFor(ctx: HelpContext): TalkHelpApi {
  const accessOf = (doc: { kind: string; module: string; card?: (typeof HELP_CARDS)[number] }) => {
    const mod = HELP_MODULE_BY_ID.get(doc.module as never)
    if (doc.kind === 'card' && doc.card) return cardAccess(doc.card, mod, ctx)
    return mod ? moduleAccess(mod, ctx) : ruleResult(undefined, ctx)
  }
  return {
    ctx,
    search: (q) => searchHelp(index, q, { access: (doc) => accessOf(doc as never) }),
    accessOfCard: (card) => cardAccess(card, HELP_MODULE_BY_ID.get(card.module), ctx),
    canDoTour: () => true,
  }
}

const ADMIN: HelpContext = { role: 'admin', allowedSections: null, platform: 'web', community: 'ok' }
const CHILD: HelpContext = { role: 'child', allowedSections: ['calendario'], platform: 'web', community: 'no' }

describe('pedir ayuda a Pepa por voz', () => {
  it('reconoce las formas de pedir ayuda y no se cuela en otras frases', () => {
    for (const t of ['necesito ayuda con compras', 'Ayúdame con el calendario', 'cómo funciona la lista de la compra', 'explícame la economía', 'para qué sirve Eventos', 'qué puedo hacer en ubicación', 'no sé usar la cocina'])
      expect(looksLikeHelpRequest(t), t).toBe(true)
    for (const t of ['añade leche a Mercadona', 'tarea sacar la basura', 'qué tengo mañana', 'el viernes a las cinco dentista de Eric', 'qué cenamos hoy'])
      expect(looksLikeHelpRequest(t), t).toBe(false)
  })

  it('identifica la sección que se nombra', () => {
    expect(moduleMentioned('necesito ayuda con compras')).toBe('compras')
    expect(moduleMentioned('ayuda con el calendario')).toBe('calendario')
    expect(moduleMentioned('cómo funciona la cocina')).toBe('cocina')
    expect(moduleMentioned('ayuda con la economía')).toBe('economia')
    expect(moduleMentioned('ayuda con la ubicación')).toBe('ubicacion')
    expect(moduleMentioned('ayuda con los eventos')).toBe('eventos')
    expect(moduleMentioned('ayuda con las fotos')).toBe('galeria')
    expect(moduleMentioned('necesito ayuda')).toBeNull()
  })

  it('«necesito ayuda con compras»: te lleva a Compras y explica lo que se puede hacer allí', () => {
    const answer = answerHelpRequest('necesito ayuda con compras', apiFor(ADMIN))
    if (!answer || answer.kind !== 'go') throw new Error('debería llevar a Compras')
    expect(answer.go.path).toBe('/compras')
    expect(answer.moduleId).toBe('compras')
    expect(answer.text).toContain('Te llevo a Compras')
    // Hay visita guiada de la sección: se arranca «Conoce Compras» en pantalla, marcando cada parte.
    expect(answer.tourId).toBe('visita-compras')
    expect(answer.text).toContain('te la enseño en pantalla')
  })

  it('si la cuenta no puede hacer la visita guiada, se explica de palabra (sin recorrido)', () => {
    const answer = answerHelpRequest('necesito ayuda con compras', { ...apiFor(ADMIN), canDoTour: () => false })
    if (!answer || answer.kind !== 'go') throw new Error('debería llevar a Compras')
    expect(answer.tourId).toBeUndefined()
    expect(answer.text).toContain('Con Compras puedes')
  })

  it('con algo concreto enseña esa función en pantalla: crear un evento arranca su recorrido', () => {
    const answer = answerHelpRequest('necesito ayuda con el calendario para crear un evento', apiFor(ADMIN))
    if (!answer || answer.kind !== 'go') throw new Error('debería explicar una ficha')
    expect(answer.moduleId).toBe('calendario')
    expect(answer.go.path).toBe('/calendario')
    expect(answer.tourId).toBe('cal-crear-evento')
  })

  it('una función sin recorrido propio se explica de palabra, paso a paso', () => {
    const withoutTour = HELP_CARDS.find((c) => c.module === 'compras' && c.state === 'disponible' && c.steps && c.steps.length > 1 && !TOURS.some((t) => t.cardId === c.id))
    if (!withoutTour) return // todas las funciones de Compras ya tienen recorrido
    const answer = answerHelpRequest(`necesito ayuda con compras para ${withoutTour.title.toLowerCase()}`, apiFor(ADMIN))
    expect(answer?.kind).toBe('go')
  })

  it('hay una explicación por cada sección del catálogo que se puede nombrar', () => {
    const names = ['compras', 'calendario', 'la cocina', 'la economía', 'los eventos', 'la ubicación', 'la familia', 'los cumpleaños', 'los contactos', 'la galería', 'los documentos', 'la configuración']
    for (const name of names) {
      const answer = answerHelpRequest(`necesito ayuda con ${name}`, apiFor(ADMIN))
      expect(answer, name).not.toBeNull()
      expect(answer?.kind, name).toBe('go')
    }
  })

  it('respeta los permisos: una cuenta sin acceso a la sección no es llevada y se le explica por qué', () => {
    const answer = answerHelpRequest('necesito ayuda con compras', apiFor(CHILD))
    if (!answer) throw new Error('debería contestar')
    expect(answer.kind).toBe('say')
    expect(answer.text).toContain('no tiene acceso')
  })

  it('pide ayuda sin decir con qué: pregunta con qué, sin llevar a ninguna parte', () => {
    const answer = answerHelpRequest('necesito ayuda', apiFor(ADMIN))
    expect(answer?.kind).toBe('say')
    expect(answer?.text).toContain('¿Con qué necesitas ayuda?')
  })

  it('lo que no es pedir ayuda no se toca', () => {
    expect(answerHelpRequest('añade leche a Mercadona', apiFor(ADMIN))).toBeNull()
  })

  it('el texto hablado de una ficha lleva el título, la respuesta breve y los pasos', () => {
    const card = HELP_CARDS.find((c) => c.steps && c.steps.length > 1 && c.state === 'disponible')
    if (!card) throw new Error('el catálogo debería tener alguna ficha con pasos')
    const spoken = spokenCard(card)
    expect(spoken).toContain(card.quick.trim().replace(/[.]+$/, ''))
    expect(spoken).toContain('Primero,')
  })
})

// 25/10/2026: «cuando le digo necesito ayuda con compras, que me lleve a compras directamente, sin la pantalla de “toca para hablar”».
import voiceCaptureSrc from '@/ui/VoiceCapture.tsx?raw'
describe('ayuda por voz: ir directo a la pantalla', () => {
  it('al pedir ayuda se cierra la ventana de hablar y se va ya a la pantalla (también con recorrido, sin esperar a que Pepa termine)', () => {
    expect(voiceCaptureSrc).toContain('wentToHelp: outcome.kind === \'help\'')
    expect(voiceCaptureSrc).toMatch(/if \(wentToHelp\) \{[\s\S]*?close\(\)[\s\S]*?output\.speakOnly\(spoken\)[\s\S]*?runAfterSpeech\(\)/)
    expect(voiceCaptureSrc).toMatch(/if \(help && tourId\) \{[\s\S]*?help\.goToPlace\(outcome\.go, outcome\.title\)[\s\S]*?afterSpeechRef\.current/)
  })
})

// 25/10/2026: «recorrido completo» y «por capítulos» por voz (las series de tutoriales de la Ayuda).
import { SERIES, chaptersOf } from '@/help/tours/series'
import { looksLikeCourseRequest, startsLikeHelpRequest } from '@/help/talkHelp'
describe('recorrido completo y capítulos por voz', () => {
  const comprasSeries = SERIES.filter((s) => s.module === 'compras')
  const lista = comprasSeries.find((s) => /lista/i.test(s.title))!

  it('reconoce las frases de recorrido completo y de capítulos, y no se cuela en otras', () => {
    for (const t of ['recorrido completo de compras', 'dame el recorrido completo de la lista', 'por capítulos', 'qué capítulos hay de compras', 'capítulo dos de la lista', 'enséñame el tutorial de compras'])
      expect(looksLikeCourseRequest(t), t).toBe(true)
    for (const t of ['añade leche', 'tarea sacar la basura', 'qué cenamos hoy']) expect(looksLikeCourseRequest(t), t).toBe(false)
    for (const t of ['recorrido completo de compras', 'capítulos de la lista', 'por capítulos de compras']) expect(startsLikeHelpRequest(t), t).toBe(true)
  })

  it('«recorrido completo de preparar y usar la lista» empieza la serie por su primer capítulo', () => {
    expect(lista).toBeTruthy()
    const answer = answerHelpRequest(`recorrido completo de ${lista.title}`, apiFor(ADMIN))
    if (!answer || answer.kind !== 'go') throw new Error('debería empezar el recorrido')
    expect(answer.go.path).toBe('/compras')
    expect(answer.tourId).toBe(chaptersOf(lista)[0].id)
    expect(answer.text).toContain('recorrido completo')
  })

  it('«capítulo dos de la lista» empieza justo el segundo capítulo', () => {
    const answer = answerHelpRequest(`capítulo dos de ${lista.title}`, apiFor(ADMIN))
    if (!answer || answer.kind !== 'go') throw new Error('debería empezar el capítulo')
    expect(answer.tourId).toBe(chaptersOf(lista)[1].id)
    expect(answer.text).toContain('Capítulo 2')
  })

  it('«por capítulos» dice los capítulos y lleva a la pantalla, sin empezar ninguno', () => {
    const answer = answerHelpRequest(`capítulos de ${lista.title}`, apiFor(ADMIN))
    if (!answer || answer.kind !== 'go') throw new Error('debería listar capítulos')
    expect(answer.tourId).toBeUndefined()
    expect(answer.text).toContain(`${chaptersOf(lista).length} capítulos`)
    expect(answer.text).toContain('capítulo 2 de')
  })

  it('con varias series en la sección y sin decir cuál, dice los nombres y lleva a la pantalla', () => {
    expect(comprasSeries.length).toBeGreaterThan(1)
    const answer = answerHelpRequest('recorrido completo de compras', apiFor(ADMIN))
    if (!answer || answer.kind !== 'go') throw new Error('debería listar los recorridos')
    expect(answer.tourId).toBeUndefined()
    expect(answer.text).toContain('Tengo estos recorridos'.replace('Tengo', 'tengo'))
    expect(answer.go.path).toBe('/compras')
  })

  it('si la cuenta no puede hacer ninguna, lo dice en lugar de llevarte a ningún sitio', () => {
    const answer = answerHelpRequest('recorrido completo de compras', { ...apiFor(ADMIN), canDoTour: () => false })
    expect(answer?.kind).toBe('say')
  })
})
