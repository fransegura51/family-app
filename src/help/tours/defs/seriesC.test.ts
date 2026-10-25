// Familia, La cocina de Pepa y Pequeños Grandes: los tutoriales principales («series») con sus capítulos. Esta prueba comprueba lo que NO cubre la estructura general (series.test.ts) ni la de
// controles/avisos (tourDefs.test.ts): quién ve cada capítulo, que los capítulos que dependen de datos lo declaran, que ningún capítulo hace por la persona lo que decide ella y que los textos
// corregidos de la Ayuda dicen lo mismo que el código.
import { describe, expect, it } from 'vitest'
import { HELP_CARD_BY_ID } from '@/help/catalog'
import { EXPLAINER_BY_ID } from '@/help/explainers'
import { TOUR_ALIASES } from '@/help/tours/aliases'
import { PLANNED_SERIES } from '@/help/tours/planned'
import { getTour } from '@/help/tours/registry'
import { SERIES_BY_ID } from '@/help/tours/series'
import type { TourDef } from '@/help/tours/types'

const SOURCES = import.meta.glob(['/src/ui/**/*.tsx', '/src/help/ui/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const CORPUS = Object.values(SOURCES).join('\n')
const markExists = (id: string) => CORPUS.includes(`data-help-id="${id}"`) || CORPUS.includes(`'data-help-id': '${id}'`) || CORPUS.includes(`helpId="${id}"`)

const SERIES_IDS = ['ser-familia-fichas', 'ser-familia-peso', 'ser-cocina-menu', 'ser-cocina-recetas', 'ser-cocina-que-cocino', 'ser-pequenos-puntos', 'ser-pequenos-deseos']
const chapters = (id: string): TourDef[] => SERIES_BY_ID.get(id)!.chapters.map((c) => getTour(c)!)

describe('series de Familia, Cocina y Pequeños Grandes', () => {
  it('existen las siete series y sus capítulos se enseñan en el orden pensado', () => {
    for (const id of SERIES_IDS) expect(SERIES_BY_ID.has(id), id).toBe(true)
    expect(SERIES_BY_ID.get('ser-familia-fichas')!.chapters).toEqual(['fam-anadir-miembro', 'tut-familia-editar-ficha', 'tut-familia-secciones', 'tut-familia-codigo-acceso'])
    expect(SERIES_BY_ID.get('ser-pequenos-puntos')!.chapters[0]).toBe('tut-pequenos-dar-puntos')
  })

  it('el piloto «Añadir un miembro» conserva su identificador y es el capítulo 1 de las fichas', () => {
    expect(SERIES_BY_ID.get('ser-familia-fichas')!.chapters[0]).toBe('fam-anadir-miembro')
  })

  it('«Educación financiera» no es una serie real: está planificada hasta que sus formularios tengan marcas de Ayuda', () => {
    expect(SERIES_BY_ID.has('ser-pequenos-educacion')).toBe(false)
    const p = PLANNED_SERIES.find((x) => x.id === 'ser-pequenos-educacion')
    expect(p?.module).toBe('pequenos')
    expect(p?.blockedBy).toMatch(/FinanceScreen/)
  })

  it('los identificadores antiguos fusionados resuelven a un recorrido que existe', () => {
    expect(TOUR_ALIASES['tut-pequenos-mi-camino']).toBe('tut-pequenos-camino-carrera')
    for (const old of ['tut-familia-actividad', 'tut-pequenos-mi-camino', 'tut-pequenos-monedero']) expect(getTour(old), old).toBeTruthy()
  })
})

describe('quién ve cada capítulo (access) — nunca se ofrece lo que no va a funcionar', () => {
  const access = (id: string) => getTour(id)!.access
  it('Familia: añadir y elegir secciones son de la administración; editar y dar acceso, de personas adultas (una madre/padre vinculado puede dar acceso a su hijo/a)', () => {
    expect(access('fam-anadir-miembro')).toEqual({ familyAdmin: true })
    expect(access('tut-familia-secciones')).toEqual({ familyAdmin: true })
    expect(access('tut-familia-editar-ficha')).toEqual({ adultsOnly: true })
    expect(access('tut-familia-codigo-acceso')).toEqual({ adultsOnly: true })
    expect(access('tut-familia-peso-medidas')).toBeUndefined()
  })
  it('Pequeños Grandes: dar puntos, crear recompensas, aprobar y los ajustes son de adultos; pedir una recompensa y la lista de deseos, de toda la familia', () => {
    for (const id of ['tut-pequenos-dar-puntos', 'tut-pequenos-recompensa-crear', 'tut-pequenos-aprobar', 'tut-pequenos-camino-carrera']) expect(access(id), id).toEqual({ adultsOnly: true })
    for (const id of ['tut-pequenos-solicitar', 'tut-pequenos-lista-deseos', 'tut-pequenos-regalo-anadir', 'tut-pequenos-regalo-reservar', 'tut-pequenos-lista-compartir-editar']) expect(access(id), id).toBeUndefined()
  })
})

describe('capítulos que dependen de datos que pueden no existir', () => {
  const NEEDS = ['tut-familia-secciones', 'tut-cocina-menu-a-compras', 'tut-cocina-receta-usar', 'tut-pequenos-dar-puntos', 'tut-pequenos-solicitar', 'tut-pequenos-aprobar', 'tut-pequenos-regalo-anadir', 'tut-pequenos-regalo-reservar', 'tut-pequenos-lista-compartir-editar']
  it('declaran `needs` con una marca que existe y un mensaje que dice qué hace falta; su primer paso no es opcional', () => {
    for (const id of NEEDS) {
      const t = getTour(id)!
      expect(t.needs?.length ?? 0, `${id}: falta needs`).toBeGreaterThan(0)
      for (const n of t.needs!) {
        expect(markExists(n.target), `${id}: ${n.target}`).toBe(true)
        expect(n.message.length, id).toBeGreaterThan(30)
      }
      expect(t.steps[0].optional, `${id}: el primer paso no puede ser opcional`).toBeFalsy()
    }
  })
  it('todas las marcas de readyOn existen en las pantallas', () => {
    for (const id of SERIES_IDS.flatMap((s) => chapters(s)).map((t) => t.id)) for (const m of getTour(id)!.readyOn ?? []) expect(markExists(m), `${id}: ${m}`).toBe(true)
  })
})

describe('seguridad: lo que guarda lo decide la persona', () => {
  it('ningún paso de estos capítulos espera un clic en un control que borra, comparte, invita o aprueba', () => {
    const FORBIDDEN = ['family.generate-code', 'family.give-access', 'pequenos.lista-compartir', 'cocina.receta-acciones', 'cocina.menu-acciones']
    for (const t of SERIES_IDS.flatMap((s) => chapters(s))) {
      for (const s of t.steps) {
        const clicks = s.completeOn.filter((c) => c.type === 'click').map((c) => (c as { target: string }).target)
        for (const f of FORBIDDEN) expect(clicks, `${t.id}/${s.id}: no debe esperar el clic en ${f}`).not.toContain(f)
      }
    }
  })
  it('un paso que aprueba, rechaza o guarda espera el aviso de la pantalla (sensible) y no ofrece «Siguiente»', () => {
    const decide = getTour('tut-pequenos-aprobar')!.steps.find((s) => s.id === 'decidir')!
    expect(decide.sensitive).toBe(true)
    expect(decide.completeOn).toEqual([{ type: 'event', name: 'pequenos.request-decided' }])
    const goal = getTour('tut-familia-peso-objetivo')!.steps.find((s) => s.id === 'guardar')!
    expect(goal.sensitive).toBe(true)
    expect(goal.completeOn).toEqual([{ type: 'event', name: 'body.goal-saved' }])
  })
  it('compartir la lista con invitados solo se explica: ni se pulsa ni se espera', () => {
    const share = getTour('tut-pequenos-lista-compartir-editar')!.steps.find((s) => s.id === 'compartir')!
    expect(share.completeOn).toEqual([])
    expect(share.manualNext).toBe(true)
    expect(share.sensitive).toBeFalsy()
  })
  it('dar acceso solo se señala: nunca se espera la creación de la invitación', () => {
    const t = getTour('tut-familia-codigo-acceso')!
    expect(t.steps.some((s) => s.sensitive)).toBe(false)
    expect(t.steps.some((s) => s.completeOn.some((c) => c.type === 'event'))).toBe(false)
  })
  it('la foto de una ficha permite continuar sin foto y no es un paso sensible', () => {
    const s = getTour('tut-familia-editar-ficha')!.steps.find((x) => x.id === 'foto')!
    expect(s.skipLabel).toBe('Continuar sin foto')
    expect(s.native).toBe(true)
    expect(s.sensitive).toBeFalsy()
  })
})

describe('los textos dicen lo mismo que el código', () => {
  const textOf = (t: TourDef) => [t.title, t.summary ?? '', t.finishText, ...t.steps.map((s) => s.text)].join('\n')
  it('La cocina: cinco comidas (con Snack) y cambio de semana, en el menú y en la visita', () => {
    expect(textOf(getTour('visita-cocina')!)).toMatch(/Snack/)
    expect(textOf(getTour('tut-cocina-menu-plato')!)).toMatch(/Desayuno, Comida, Merienda, Cena y Snack/)
    expect(textOf(getTour('tut-cocina-menu-plato')!)).toMatch(/Volver a hoy/)
    expect(CORPUS).toContain("{ value: 'snack', label: 'Snack' }")
    expect(CORPUS).toContain('Semana siguiente')
  })
  it('La cocina: la ficha de receta ya no dice que no recalcula raciones y el visor tiene − / +', () => {
    expect(HELP_CARD_BY_ID.get('coc-receta')!.limits ?? '').not.toMatch(/no recalculan/)
    expect(CORPUS).toContain('Una ración menos')
    expect(textOf(getTour('tut-cocina-receta-usar')!)).toMatch(/− y \+/)
  })
  it('Pequeños Grandes: se avisa a los adultos al pedir una recompensa (0316), en el capítulo, la ficha y la explicación', () => {
    expect(textOf(getTour('tut-pequenos-solicitar')!)).toMatch(/avisa a las personas adultas/)
    expect(HELP_CARD_BY_ID.get('pg-puntos')!.limits ?? '').not.toMatch(/no ven aviso/)
    const exp = EXPLAINER_BY_ID.get('exp-pequenos-puntos-recompensas')!
    expect(exp.limits.join(' ')).not.toMatch(/no hay un aviso aparte/)
    expect(JSON.stringify(exp.sections)).toMatch(/avisa a las personas adultas/)
  })
  it('Pequeños Grandes: las reservas de las cuentas de niño se cuentan sin inventar (puede reservar, la pantalla no enseña reservas)', () => {
    expect(textOf(getTour('tut-pequenos-regalo-reservar')!)).toMatch(/puedes reservar, pero la pantalla no enseña las reservas/)
  })
  it('Familia: la entrada de la otra persona es «Tengo una invitación»: primero la invitación y luego la cuenta', () => {
    const t = textOf(getTour('tut-familia-codigo-acceso')!)
    expect(t).toMatch(/Tengo una invitación/)
    expect(t).toMatch(/Primero escribe el código y después crea su correo/)
    expect(CORPUS).toContain('¿No tienes cuenta? Tengo una invitación')
    expect(t).not.toMatch(/Generar código de acceso/) // el método antiguo no se enseña
  })
  it('Familia: «Es mi hijo/a» es una declaración que PEPA no comprueba, y no hace falta administrar para dar acceso a un hijo menor', () => {
    const hijo = getTour('tut-familia-codigo-acceso')!.steps.find((s) => s.id === 'hijo')!
    expect(hijo.text).toMatch(/declaración/)
    expect(hijo.text).toMatch(/no comprueba/)
    expect(hijo.text).toMatch(/aunque no administres/)
  })
})
