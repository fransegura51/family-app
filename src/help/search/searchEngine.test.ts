// Buscador local de la Ayuda: sinónimos, errores de escritura, plurales, permisos y respuestas basadas SOLO en fichas verificadas.
import { describe, expect, it } from 'vitest'
import { cardAccess, type HelpContext } from '@/help/access'
import { HELP_CARDS, HELP_MODULE_BY_ID, LEGACY_ENTRIES } from '@/help/catalog'
import { buildIndex, searchHelp, tokenSimilarity, type SearchDoc } from '@/help/search/searchEngine'
import { editDistance, normalizeText, significantTokens } from '@/help/search/normalize'

const INDEX = buildIndex(HELP_CARDS, LEGACY_ENTRIES)
const ADULT: HelpContext = { role: 'adult', allowedSections: null, platform: 'web', community: 'ok' }

function accessFor(ctx: HelpContext) {
  return (doc: SearchDoc) => {
    if (doc.kind === 'legacy') return { status: 'allowed' as const }
    return cardAccess(doc.card, HELP_MODULE_BY_ID.get(doc.card.module), ctx)
  }
}
const ask = (q: string, ctx: HelpContext = ADULT) => searchHelp(INDEX, q, { access: accessFor(ctx) })
const topCard = (q: string, ctx?: HelpContext) => {
  const t = ask(q, ctx).hits[0]?.doc
  return t && t.kind === 'card' ? t.card.id : t?.id
}

describe('normalización', () => {
  it('quita tildes, signos y mayúsculas', () => {
    expect(normalizeText('¿Cómo cambio la CONTRASEÑA?')).toBe('como cambio la contrasena')
    expect(significantTokens('¿Qué quieres hacer o saber?')).toEqual([])
  })
  it('distancia de edición con transposición y tope', () => {
    expect(editDistance('calendario', 'calendaio', 2)).toBe(1)
    expect(editDistance('calendario', 'calenadrio', 2)).toBe(1)
    expect(editDistance('abc', 'xyzxyz', 1)).toBe(2)
  })
  it('plurales y prefijos cuentan como parecidos; palabras distintas no', () => {
    expect(tokenSimilarity('codigos', 'codigo')).toBeGreaterThan(0.9)
    expect(tokenSimilarity('notifica', 'notificaciones')).toBeGreaterThan(0.7)
    expect(tokenSimilarity('banco', 'tienda')).toBe(0)
    expect(tokenSimilarity('apunto', 'puntos')).toBe(0)
    expect(tokenSimilarity('apunto', 'apuntar')).toBeGreaterThan(0.8)
  })
})

describe('encuentra la ficha correcta con las palabras de la gente', () => {
  const cases: [string, string][] = [
    ['cómo apunto una cita', 'cal-crear-evento'],
    ['quiero crear un evento en el calendario', 'cal-crear-evento'],
    ['añadir leche a la lista de la compra', 'com-anadir-producto'],
    ['como cambio la contraseña', 'cue-correo-contrasena'],
    ['borrar mi cuenta', 'cue-borrar-cuenta'],
    ['he olvidado el pin', 'cue-olvide-pin'],
    ['no me llegan las notificaciones', 'not-activar'],
    ['donde esta mi hijo', 'ubi-ver'],
    ['apuntar un gasto', 'eco-nuevo-movimiento'],
    ['dar acceso a mi pareja', 'fam-codigo-acceso'],
    ['añadir un hijo a la familia', 'fam-anadir-miembro'],
    ['subir el ticket del super', 'com-ticket'],
    ['cambiar los colores', 'cfg-colores'],
    ['invitar a mis amigos', 'cue-invitar-amigos'],
    ['que pepa no hable', 'pepa-modo-respuesta'],
    ['conectar google calendar', 'cal-google'],
  ]
  for (const [q, id] of cases) {
    it(`«${q}» → ${id}`, () => {
      expect(topCard(q)).toBe(id)
    })
  }
})

describe('tolera errores de escritura y expresiones coloquiales', () => {
  it('con faltas de ortografía', () => {
    expect(topCard('crear un evneto en el calendaio')).toBe('cal-crear-evento')
    expect(topCard('contrasenia')).toBe('cue-correo-contrasena')
    // Una sola palabra es ambigua (avisos del móvil o recordatorio de un evento): basta con que la ficha buscada esté entre las primeras.
    expect(ask('notificasiones').hits.slice(0, 3).map((h) => h.doc.id)).toContain('not-activar')
  })
  it('sinónimos: «agendar una reunión» encuentra el evento; «mover tarjetas» el orden de Inicio', () => {
    expect(topCard('agendar una reunion')).toBe('cal-crear-evento')
    expect(topCard('mover las tarjetas de inicio')).toBe('ini-organizar')
  })
  it('una pregunta sin nada que ver no devuelve resultados claros', () => {
    const r = ask('cotización del bitcoin en bolsa')
    expect(r.confidence).not.toBe('clear')
  })
  it('una pregunta vacía o solo de relleno no devuelve nada', () => {
    expect(ask('').hits).toEqual([])
    expect(ask('¿qué quieres hacer o saber?').hits).toEqual([])
    expect(ask('').confidence).toBe('none')
  })
})

describe('respuestas basadas en información verificada', () => {
  it('todo resultado sale del catálogo: una ficha del catálogo o un apartado de la explicación histórica', () => {
    for (const q of ['calendario', 'compras', 'economia', 'eventos', 'ubicacion']) {
      for (const h of ask(q).hits) {
        if (h.doc.kind === 'card') expect(HELP_CARDS).toContain(h.doc.card)
        else expect(LEGACY_ENTRIES).toContain(h.doc.entry)
      }
    }
  })
  it('una función desactivada se encuentra pero se explica como desactivada (no se ofrece como función)', () => {
    const r = ask('alergias en las recetas')
    const hit = r.hits.find((h) => h.doc.kind === 'card' && h.doc.card.id === 'coc-alergias')
    expect(hit).toBeTruthy()
    expect(hit!.doc.kind === 'card' && hit!.doc.card.state).toBe('desactivada')
  })
  it('las fichas curadas puntúan por encima del texto histórico equivalente', () => {
    const first = ask('crear un evento').hits[0].doc
    expect(first.kind).toBe('card')
  })
})

describe('permisos: el buscador no enseña lo que esa persona no puede ver', () => {
  const MINOR: HelpContext = { role: 'child', allowedSections: ['calendario'], platform: 'web', community: 'no' }
  it('Comunidad: sin acceso (menor de 18, sin fecha, cerrada o sin comprobar) no aparece NINGUNA ficha de uso de Comunidad', () => {
    for (const community of ['no', 'unknown'] as const) {
      const ctx: HelpContext = { ...ADULT, community }
      const ids = ask('publicar en comunidad receta alias denunciar', ctx).hits.filter((h) => h.doc.kind === 'card').map((h) => (h.doc as { card: { id: string } }).card.id)
      for (const hidden of ['com2-publicar', 'com2-alias', 'com2-recetas', 'com2-denunciar', 'com2-ia']) expect(ids, `${community}: ${hidden}`).not.toContain(hidden)
    }
    const ok = ask('publicar en comunidad', ADULT).hits.map((h) => (h.doc.kind === 'card' ? h.doc.card.id : ''))
    expect(ok).toContain('com2-publicar')
  })
  it('las fichas generales de Comunidad (quién puede entrar) las ve todo el mundo, también quien no tiene acceso', () => {
    const ids = ask('por que no puedo entrar en comunidad', MINOR).hits.map((h) => (h.doc.kind === 'card' ? h.doc.card.id : ''))
    expect(ids).toContain('com2-sin-acceso')
  })
  it('lo que solo hace la administración de la familia sigue encontrándose, pero para otros es una explicación sin botones', () => {
    const doc = ask('añadir un miembro', MINOR).hits.find((h) => h.doc.kind === 'card' && h.doc.card.id === 'fam-anadir-miembro')
    expect(doc).toBeTruthy()
    const a = cardAccess((doc!.doc as { card: (typeof HELP_CARDS)[number] }).card, HELP_MODULE_BY_ID.get('familia'), MINOR)
    expect(a.status).toBe('restricted')
    expect(a.reason).toContain('administración de tu familia')
  })
  it('el permiso de Android no se enseña en la web ni en iPhone', () => {
    const web = ask('permitir siempre ubicacion android', ADULT).hits.map((h) => (h.doc.kind === 'card' ? h.doc.card.id : ''))
    expect(web).not.toContain('ubi-permiso-android')
    const android = ask('permitir siempre ubicacion android', { ...ADULT, platform: 'android' }).hits.map((h) => (h.doc.kind === 'card' ? h.doc.card.id : ''))
    expect(android).toContain('ubi-permiso-android')
  })
  it('una secciónbloqueada para esa cuenta se explica (restringida), no se ofrece «Llévame»', () => {
    const doc = HELP_CARDS.find((c) => c.id === 'com-anadir-producto')!
    const a = cardAccess(doc, HELP_MODULE_BY_ID.get('compras'), MINOR)
    expect(a.status).toBe('restricted')
  })
})
