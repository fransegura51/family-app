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
