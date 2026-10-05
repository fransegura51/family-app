// Prueba de RENDER real (react-dom/server, sin navegador): las piezas del Menú del evento se pintan con datos
// reales sin lanzar errores y muestran lo que tienen que mostrar según el origen de la comida. Complementa los
// candados de texto fuente con comportamiento de pantalla de verdad.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))

const { MenuManager, SectionsSheet, DishSheet } = await import('@/ui/EventMenu')
const { DinersPanel } = await import('@/ui/EventMenuDiners')
const { resolveMenuSections, defaultSections } = await import('@/domain/eventMenuHub')
const { computeFoodNeedsState } = await import('@/domain/eventDietaryNeeds')
const fx = await import('@/domain/eventFoodFixtures')

import type { MenuHubData } from '@/data/eventMenuHub'
import type { MenuToolsMode } from '@/domain/eventMenuHub'
import type { EventGuest } from '@/domain/types'

const noop = () => undefined
const recipes = [{ id: 'r1', familyId: 'f1', title: 'Paella de la abuela', notes: null, imagePath: null, tags: [], ingredients: [{ id: 'i1', name: 'Arroz', quantity: '400', unit: 'g' }] }]

function hubData(over: Partial<MenuHubData> = {}): MenuHubData {
  return {
    decisions: [],
    items: [],
    guests: [],
    members: [],
    needs: [],
    options: [],
    questions: [],
    questionOptions: [],
    answers: [],
    moments: [],
    sections: null,
    recipes,
    stores: [],
    ...over,
  }
}

function renderManager(mode: MenuToolsMode, data: MenuHubData) {
  const state = computeFoodNeedsState(data.guests, data.members, data.needs)
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(MenuManager, { event: fx.makeEvent(), data, mode, needsState: state, onReload: async () => undefined, onError: noop })))
}

const dishes = [
  fx.makeMenuItem({ id: 'd1', name: 'Gamba blanca', category: 'Entrantes', preparedBy: 'proveedor' }),
  fx.makeMenuItem({ id: 'd2', name: 'Paella', category: 'Principal', recipeId: 'r1', preparedBy: 'familia' }),
  fx.makeMenuItem({ id: 'd3', name: 'Tarta', category: 'Postre', preparedBy: 'proveedor' }),
]

describe('Render real del menú (sin navegador)', () => {
  it('estado vacío: importar o escribirlo; sin secciones vacías ocupando pantalla', () => {
    const html = renderManager('familia', hubData())
    expect(html).toContain('Todavía no hay menú guardado')
    expect(html).toContain('📷 Hacer una foto · 🖼️ Elegir una foto · 📄 Subir PDF')
    expect(html).toContain('✏️ Añadirlo manualmente')
    expect(html).not.toContain('menu-section')
  })
  it('con platos: secciones con sus platos (sin receta es válido), solo las visibles', () => {
    const html = renderManager('proveedor', hubData({ items: dishes }))
    for (const text of ['Entrantes', 'Gamba blanca', 'Plato principal', 'Paella', 'Postres', 'Tarta', '+ Añadir plato', '⚙️ Gestionar secciones', '📷 Importar menú']) expect(html, text).toContain(text)
    expect(html).not.toContain('Bebidas') // sección oculta de partida
  })
  it('27/28. restaurante, catering o lugar con comida → SIN Recetas ni Lista de la compra ni 🛒', () => {
    const html = renderManager('proveedor', hubData({ items: dishes }))
    expect(html).not.toContain('📖 Recetas')
    expect(html).not.toContain('Lista de la compra')
    expect(html).not.toContain('🛒')
    expect(html).toContain('La comida la pone el restaurante, el catering o el lugar')
  })
  it('29. preparado en casa → SÍ Recetas, Lista de la compra y 🛒 en el plato con receta (y no en el que no la tiene)', () => {
    const html = renderManager('familia', hubData({ items: dishes }))
    expect(html).toContain('📖 Recetas')
    expect(html).toContain('🛒 Ir a Lista de la compra')
    expect((html.match(/Elegir ingredientes de/g) ?? []).length).toBe(1)
    expect(html).toContain('Elegir ingredientes de Paella')
    expect(html).not.toContain('Elegir ingredientes de Gamba blanca')
  })
  it('30. combinado → herramientas solo en el plato propio; cada plato muestra quién lo prepara', () => {
    const html = renderManager('mixto', hubData({ items: dishes }))
    expect(html).toContain('🏠 Nosotros')
    expect(html).toContain('🍴 Proveedor')
    expect(html).toContain('Elegir ingredientes de Paella')
    expect(html).not.toContain('Elegir ingredientes de Tarta')
    expect(html).not.toContain('Elegir ingredientes de Gamba blanca')
  })
  it('un plato de un evento mixto sin indicar quién lo prepara se marca, no se adivina', () => {
    const html = renderManager('mixto', hubData({ items: [fx.makeMenuItem({ name: 'Croquetas', category: 'Entrantes', preparedBy: null, recipeId: 'r1' })] }))
    expect(html).toContain('❔ Sin indicar quién lo prepara')
    expect(html).not.toContain('Elegir ingredientes')
  })
  it('31. todavía no sabemos → mensaje de espera, ninguna herramienta', () => {
    const html = renderManager('esperando', hubData({ items: dishes }))
    expect(html).toContain('Cuando decidáis quién se encarga de la comida')
    expect(html).not.toContain('📖 Recetas')
    expect(html).not.toContain('🛒')
  })
  it('37. con una alergia al marisco, «Gamba blanca» sale como POSIBLE conflicto (aviso, no certeza)', () => {
    const guests: EventGuest[] = [fx.makeGuest({ id: 'g1', displayName: 'Familia García', rsvpStatus: 'confirmado' })]
    const members = [fx.makeMember({ id: 'm1', guestId: 'g1', name: 'María' })]
    const needs = [fx.makeNeed({ id: 'n1', guestId: 'g1', memberId: 'm1', category: 'marisco', kind: 'alergia', originalText: 'Alergia al marisco' })]
    const html = renderManager('proveedor', hubData({ items: dishes, guests, members, needs }))
    expect(html).toContain('⚠️ Posible conflicto con una necesidad alimentaria de 1 comensal')
    expect(html).toContain('Sin marisco (alergia): María (Familia García)')
    expect(html).toContain('Es un aviso para revisar, no una certeza')
    expect(html.toLowerCase()).not.toMatch(/es seguro|es peligroso|puede comer/)
    expect((html.match(/Posible conflicto/g) ?? []).length).toBe(1) // solo la gamba
  })
  it('sin necesidades registradas no se muestra ningún aviso de conflicto', () => {
    const html = renderManager('proveedor', hubData({ items: dishes }))
    expect(html).not.toContain('Posible conflicto')
  })
})

describe('Hoja de secciones y de platos (render)', () => {
  it('12. una sección con platos NO se puede ocultar (explicación y botón desactivado); las ocultas se pueden recuperar', () => {
    const resolved = resolveMenuSections(defaultSections(false), dishes, false)
    const html = renderToStaticMarkup(createElement(SectionsSheet, { resolved, onChange: noop, onClose: noop }))
    expect(html).toContain('para ocultarla, muévelo o bórralo antes')
    expect(html).toContain('EN EL MENÚ')
    expect(html).toContain('OCULTAS (toca para volver a mostrar)')
    expect(html).toContain('+ Añadir otra sección')
    expect(html).toContain('Bebidas') // oculta, recuperable
    expect(html).toContain('Mostrar')
    expect(html).toMatch(/disabled=""[^>]*>Ocultar/) // al menos una (con platos) no se puede ocultar
  })
  it('hoja de plato: la receta solo se ofrece si lo prepara la familia; en mixto aparece el selector de origen', () => {
    const resolved = resolveMenuSections(defaultSections(false), [], false)
    const render = (mode: MenuToolsMode) => renderToStaticMarkup(createElement(DishSheet, { target: { mode: 'new', sectionLabel: 'Entrantes', kind: 'dish' }, mode, sections: resolved.visible, recipes, onClose: noop, onSave: async () => undefined }))
    expect(render('familia')).toContain('Receta (opcional)')
    expect(render('proveedor')).not.toContain('Receta (opcional)')
    expect(render('esperando')).not.toContain('Receta (opcional)')
    expect(render('mixto')).toContain('¿Quién lo prepara?')
    expect(render('mixto')).not.toContain('Receta (opcional)') // hasta que se indique que lo prepara la familia
    expect(render('familia')).not.toContain('¿Quién lo prepara?')
  })
})

describe('Render de Comensales', () => {
  const guests = [
    fx.makeGuest({ id: 'a', displayName: 'Familia A', rsvpStatus: 'confirmado', adultsCount: 2, childrenCount: 1, rsvpAdultsCount: 2, rsvpChildrenCount: 1 }),
    fx.makeGuest({ id: 'b', displayName: 'Marta', rsvpStatus: 'pendiente', adultsCount: 1, childrenCount: 0 }),
  ]
  const render = (data: MenuHubData) =>
    renderToStaticMarkup(createElement(DinersPanel, { event: fx.makeEvent(), data, state: computeFoodNeedsState(data.guests, data.members, data.needs), onChanged: noop, onDerivedDataChanged: noop }))

  it('19–22. totales, adultos/niños y pendientes con aviso de provisional; sin necesidades lo dice', () => {
    const html = render(hubData({ guests }))
    expect(html).toContain('3 confirmados')
    expect(html).toContain('2 adultos · 1 niño')
    expect(html).toContain('1 invitado todavía no ha respondido: la información es provisional.')
    expect(html).toContain('No se han indicado alergias ni necesidades alimentarias.')
    expect(html).not.toContain('Todos han respondido')
  })
  it('todos respondieron → «✓ Todos han respondido sobre comida»', () => {
    const html = render(hubData({ guests: [guests[0]] }))
    expect(html).toContain('✓ Todos han respondido sobre comida')
  })
  it('23. necesidades: resumen agrupado (el detalle con el texto original está a un toque)', () => {
    const needs = [fx.makeNeed({ id: 'n1', guestId: 'a', category: 'gluten', kind: 'celiaquia', originalText: 'Soy celíaca' })]
    const html = render(hubData({ guests: [guests[0]], needs }))
    expect(html).toContain('1 necesita comida sin gluten')
    expect(html).toContain('Añadir o revisar necesidades (1)')
  })
  it('24. menú infantil heredado de Invitados, con los niños confirmados y su estado', () => {
    const decisions = [fx.makeDecision('invitados.ninos.necesidades', { choice: 'preparar', selected: ['Menú infantil'], customItems: [] }), fx.makeDecision('comida.menu_infantil', { choice: 'pedir' })]
    const html = render(hubData({ guests, decisions }))
    expect(html).toContain('Menú infantil: 1 niño confirmado')
    expect(html).toContain('lo pediremos al proveedor')
  })
  it('25/26. elecciones de menú con cuántos eligieron cada opción', () => {
    const members = [fx.makeMember({ id: 'm1', guestId: 'a', name: 'Ana', menuOptionId: 'o1' }), fx.makeMember({ id: 'm2', guestId: 'a', name: 'Luis', menuOptionId: 'o2' }), fx.makeMember({ id: 'm3', guestId: 'a', name: 'Eva', menuOptionId: 'o1' })]
    const options = [fx.makeOption({ id: 'o1', name: 'Carne' }), fx.makeOption({ id: 'o2', name: 'Pescado' })]
    const decisions = [fx.makeDecision('invitados.menu_invitacion', { choice: 'si', wantsMenu: true })]
    const html = render(hubData({ guests: [guests[0]], members, options, decisions }))
    expect(html).toContain('ELECCIONES DE MENÚ')
    expect(html).toContain('Carne · 2')
    expect(html).toContain('Pescado · 1')
  })
  it('39. una pregunta marcada como de comida muestra sus respuestas; una sin clasificar se ofrece para clasificar (nunca se adivina)', () => {
    const questions = [
      { id: 'q1', eventId: 'e1', familyId: 'f1', prompt: 'Carne o pescado', scope: 'invitacion' as const, required: false, active: true, sortOrder: 1, createdAt: '', topic: 'comida' as const },
      { id: 'q2', eventId: 'e1', familyId: 'f1', prompt: '¿Venís en autobús?', scope: 'invitacion' as const, required: false, active: true, sortOrder: 2, createdAt: '', topic: null },
    ]
    const questionOptions = [{ id: 'o1', questionId: 'q1', eventId: 'e1', familyId: 'f1', label: 'Carne', sortOrder: 1, createdAt: '' }]
    const answers = [{ id: 'x', questionId: 'q1', eventId: 'e1', familyId: 'f1', guestId: 'a', memberId: null, optionId: 'o1', createdAt: '', updatedAt: '' }]
    const html = render(hubData({ guests: [guests[0]], questions, questionOptions, answers }))
    expect(html).toContain('CARNE O PESCADO')
    expect(html).toContain('Carne · 1')
    expect(html).toContain('Otras preguntas a los invitados (1)')
    expect(html).toContain('¿Venís en autobús?')
    expect(html).toContain('PEPA no lo adivina por el texto')
  })
})

// ---------------------------------------------------------------------
// Secuencia real del menú (el orden del documento manda, no la sección)
// ---------------------------------------------------------------------
const { REAL_MENU_IN_DOCUMENT_ORDER, REAL_MENU_SUGGESTIONS } = await import('@/domain/eventMenuRealFixture')

function realItems() {
  return REAL_MENU_IN_DOCUMENT_ORDER.map((name, i) =>
    fx.makeMenuItem({
      id: `m${i}`,
      name,
      sortOrder: (i + 1) * 1000,
      kind: REAL_MENU_SUGGESTIONS[name]?.kind ?? 'dish',
      category: REAL_MENU_SUGGESTIONS[name] ? REAL_MENU_SUGGESTIONS[name].section : 'Aperitivo / picoteo',
    }),
  )
}

describe('Render: la pantalla respeta el orden del documento (13, 14, 24)', () => {
  it('la vista principal muestra la secuencia EXACTA, con «Cambio de Tercio» como encabezado, aunque las secciones sugeridas sean Postres/Bebidas/Otro/Aperitivo', () => {
    const html = renderManager('proveedor', hubData({ items: realItems() }))
    const positions = REAL_MENU_IN_DOCUMENT_ORDER.map((name) => html.indexOf(name === 'Cambio de Tercio' ? '— Cambio de Tercio —' : name))
    expect(positions.every((p) => p > -1)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions) // aparecen en ese orden, de arriba abajo
    expect(html).toContain('Orden del menú')
    expect(html).toContain('Por secciones')
    expect(html).toContain('Este es el orden real del menú (15 platos)')
    expect(html).toContain('La sección es solo una etiqueta: cambiarla no mueve nada')
  })
  it('un encabezado se pinta como tal (no como plato): sin receta, sin 🛒 y sin «quién lo prepara», aunque la familia cocine', () => {
    const items = [
      fx.makeMenuItem({ id: 'd', name: 'Paella', sortOrder: 1000, kind: 'dish', category: 'Entrantes', recipeId: 'r1', preparedBy: 'familia' }),
      fx.makeMenuItem({ id: 'h', name: 'Cambio de Tercio', sortOrder: 2000, kind: 'heading', category: null, recipeId: 'r1', preparedBy: 'familia' }),
    ]
    const html = renderManager('mixto', hubData({ items }))
    expect(html).toContain('menu-dish-heading')
    expect(html).toContain('Encabezado / separador')
    expect((html.match(/Elegir ingredientes de/g) ?? []).length).toBe(1)
    expect(html).toContain('Elegir ingredientes de Paella')
    expect(html).not.toContain('Elegir ingredientes de Cambio de Tercio')
    expect((html.match(/🏠 Nosotros/g) ?? []).length).toBe(1)
  })
  it('12/20. un encabezado no genera avisos de necesidades aunque contenga palabras de comida', () => {
    const guests = [fx.makeGuest({ id: 'g1', displayName: 'Familia García', rsvpStatus: 'confirmado' })]
    const needs = [fx.makeNeed({ id: 'n1', guestId: 'g1', category: 'marisco', kind: 'alergia' })]
    const items = [
      fx.makeMenuItem({ id: 'h', name: 'Cóctel de gambas', sortOrder: 1000, kind: 'heading', category: null }),
      fx.makeMenuItem({ id: 'd', name: 'Gamba blanca cocida', sortOrder: 2000, kind: 'dish', category: 'Entrantes' }),
    ]
    const html = renderManager('proveedor', hubData({ items, guests, needs }))
    expect((html.match(/Posible conflicto/g) ?? []).length).toBe(1)
  })
  it('las flechas ▲▼ y el asa ☰ existen en cada elemento de la secuencia (alternativa accesible al arrastre)', () => {
    const html = renderManager('proveedor', hubData({ items: realItems() }))
    expect((html.match(/aria-label="Subir /g) ?? []).length).toBe(16)
    expect((html.match(/aria-label="Bajar /g) ?? []).length).toBe(16)
    expect((html.match(/class="drag-handle"/g) ?? []).length).toBe(16)
  })
  it('hoja de plato: el tipo se elige y un encabezado oculta sección, receta y origen', () => {
    const resolved = resolveMenuSections(defaultSections(false), [], false)
    const render = (kind: 'dish' | 'heading') =>
      renderToStaticMarkup(createElement(DishSheet, { target: { mode: 'new', sectionLabel: 'Entrantes', kind }, mode: 'familia' as MenuToolsMode, sections: resolved.visible, recipes, onClose: noop, onSave: async () => undefined }))
    const dish = render('dish')
    expect(dish).toContain('Encabezado / separador')
    expect(dish).toContain('Sección')
    expect(dish).toContain('Receta (opcional)')
    const heading = render('heading')
    expect(heading).toContain('Añadir encabezado o nota')
    expect(heading).not.toContain('Sección')
    expect(heading).not.toContain('Receta (opcional)')
    expect(heading).not.toContain('¿Quién lo prepara?')
  })
  it('27. «Ocultar» de una sección protegida se ve desactivado (disabled + aria-disabled) y con su explicación', () => {
    const resolved = resolveMenuSections(defaultSections(false), [fx.makeMenuItem({ id: 'x', name: 'Gamba', category: 'Entrantes' })], false)
    const html = renderToStaticMarkup(createElement(SectionsSheet, { resolved, onChange: noop, onClose: noop }))
    expect(html).toMatch(/<button[^>]*class="link-button"[^>]*disabled=""[^>]*aria-disabled="true"[^>]*>Ocultar<\/button>/)
    expect(html).toContain('1 plato · para ocultarla, muévelo o bórralo antes')
    expect(html).toMatch(/<button[^>]*class="link-button"[^>]*aria-disabled="false"[^>]*>Ocultar<\/button>/)
  })
})
