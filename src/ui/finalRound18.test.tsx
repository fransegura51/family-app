// Ronda final 18/10/2026: tienda de destino en todos los envíos a Compras, menú semanal por bloques, botón ☰ Menú fijo, «No leídas primero» al volver, «Propón un tema» y áreas seguras.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import type { CommunityCardItem } from '@/domain/community'
import { clearOpenedLocally, markOpenedLocally, sortUnreadFirst } from '@/domain/communityRead'
import { postCrumbs, rememberSectionQuery, savedSectionQuery } from '@/ui/community/communityNav'
import { menuFabTop } from '@/ui/KitchenHeaderWithMenu'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const sheet = read('src/ui/ShoppingLinesSheet.tsx')
const pick = read('src/ui/PickIngredientsModal.tsx')
const menuModal = read('src/ui/MenuShoppingModal.tsx')
const choice = read('src/ui/ShoppingStoreChoice.tsx')
const eventos = read('src/ui/EventosScreen.tsx')
const dialog = read('src/ui/AddToShoppingStoreDialog.tsx')
const alim = read('src/ui/AlimentacionScreen.tsx')
const css = read('src/ui/styles.css')
const menuCss = read('src/ui/community/menu/communityMenu.css')
const propose = read('src/ui/community/ProposeTopicDialog.tsx')
const tab = read('src/ui/community/admin/TopicProposalsTab.tsx')
const eventsData = read('src/data/events.ts')

describe('tienda de destino en TODOS los envíos a Compras (selector compartido)', () => {
  it('las hojas de revisión usan el mismo selector: tienda para todo + «Repartir entre varias tiendas» + tienda por producto', () => {
    for (const src of [sheet, pick, menuModal]) {
      expect(src).toContain('StoreChoiceBar')
      expect(src).toContain('RowStoreSelect')
      expect(src).toContain('storeForRow(')
    }
    expect(choice).toContain('Repartir entre varias tiendas')
    expect(choice).toContain('Sin tienda')
    expect(choice).toContain('Como el resto')
  })
  it('las tiendas salen de las tiendas habituales de la familia (no hay catálogo aparte)', () => {
    expect(choice).toContain("from '@/data/shoppingStores'")
    expect(choice).toContain('listShoppingStores()')
    expect(choice).not.toMatch(/Consum|Hiperber|Mercadona/)
  })
  it('lo elegido se guarda en cada producto (store) en una única confirmación y sin tocar otros productos de Compras', () => {
    expect(sheet).toContain('store: storeForRow(choice, r.line.key, stores)')
    expect(pick).toContain('store: storeForRow(choice, ingredientId, stores)')
    expect(menuModal).toContain('store: storeForRow(choice, r.id, stores)')
    // Solo se insertan filas nuevas: nunca se actualizan ni se fusionan las que ya existen.
    expect(sheet).not.toContain('updateShoppingItem')
  })
  it('lo que ya está en Compras se avisa con su tienda y no se marca por defecto ni se sobrescribe', () => {
    expect(sheet).toContain('r.inListStores')
    expect(sheet).toContain('Ya está en tu lista')
  })
  it('Eventos: decoración y material de actividades preguntan la tienda antes de apuntarlo', () => {
    expect(eventos).toContain('AddToShoppingStoreDialog')
    expect((eventos.match(/<AddToShoppingStoreDialog/g) ?? []).length).toBe(2)
    expect(eventsData).toContain('transferDecorationItemToShopping(item: EventDecorationItem, store: string | null = null)')
    expect(eventsData).toContain('transferActivityMaterialsToShopping(activity: EventActivity, store: string | null = null)')
    expect(dialog).toContain('canonicalStore(stores, store)')
    expect(dialog).toContain('Sin tienda')
  })
})

describe('Cocina · menú semanal por bloques', () => {
  it('etiqueta de comida arriba a la derecha, nombre en su línea, iconos debajo a la derecha y acompañamientos colgados del plato', () => {
    expect(alim).toContain('menu-slot-meal')
    expect(alim).toContain('menu-slot-name')
    expect(alim).toContain('menu-slot-actions')
    expect(alim).toContain('menu-slot-extras')
    expect(css).toMatch(/\.menu-slot-meal \{[^}]*align-self: flex-end/)
    expect(css).toMatch(/\.menu-slot-actions \{[^}]*justify-content: flex-end/)
  })
  it('se conservan la navegación a la receta, el texto libre, «+ Añadir» y los carritos de día y semana', () => {
    expect(alim).toContain('setViewRecipeId(r.id)')
    expect(alim).toContain('<span>{e.freeText}</span>')
    expect(alim).toContain('+ Añadir')
    expect(alim).toContain('Añadir semana a Compras')
    expect(alim).toContain('Añadir a Compras los ingredientes de ${dayLabel}')
  })
  it('los iconos mantienen un toque de 40 px aunque se vean pequeños y llevan etiqueta accesible', () => {
    expect(css).toMatch(/\.menu-icon-btn \{[^}]*width: 40px;[^}]*height: 40px/)
    expect(alim).toContain('aria-label={`Editar ${label}`}')
    expect(alim).toContain('Quitar ${label} del menú')
  })
})

describe('botón «☰ Menú» fijo en pantalla', () => {
  it('queda a media altura de la cabecera con la página arriba y nunca por encima de la zona segura + fila de Pepa', () => {
    // Cabecera de 130 px que empieza en 74 px: mitad = 139 → botón de 36 px centrado en 121.
    expect(menuFabTop(74, 130, 0)).toBe(121)
    // iPhone con 47 px de zona segura: la cabecera baja 47 px y el botón con ella.
    expect(menuFabTop(74 + 47, 130, 47)).toBe(121 + 47)
    // Una cabecera pequeña pegada arriba no sube del mínimo (zona segura + 58 px, justo debajo de los botones de Pepa).
    expect(menuFabTop(10, 40, 47)).toBe(47 + 58)
  })
  it('las cinco secciones lo pintan con el mismo componente, aparte de la página (en <body>), sin copias superpuestas', () => {
    const comp = read('src/ui/KitchenHeaderWithMenu.tsx')
    expect(comp).toContain('createPortal(')
    expect(comp).toContain('document.body')
    for (const f of ['AlimentacionScreen', 'CalendarScreen', 'FinanceScreen', 'LocationScreen', 'ShoppingScreen']) {
      const src = read(`src/ui/${f}.tsx`)
      expect(src, f).toContain('<KitchenHeaderWithMenu')
      expect(src, f).not.toContain('className="kitchen-header-menu-fab')
    }
    expect(css).toContain('.kitchen-header-menu-fab.menu-fab-portal')
  })
})

const card = (id: string, createdAt: string, readState: 'read' | 'updated' | null): CommunityCardItem => ({ id, createdAt, readState }) as unknown as CommunityCardItem

describe('«No leídas primero» al volver de un artículo', () => {
  it('el artículo recién abierto pasa al grupo de leídas sin perder el orden cronológico dentro de cada grupo', () => {
    clearOpenedLocally()
    const list = [card('a', '2026-10-17T10:00:00Z', null), card('b', '2026-10-16T10:00:00Z', null), card('c', '2026-10-15T10:00:00Z', 'read'), card('d', '2026-10-14T10:00:00Z', null)]
    markOpenedLocally('a')
    expect(sortUnreadFirst(list).map((x) => x.id)).toEqual(['b', 'd', 'a', 'c'])
    clearOpenedLocally()
  })
  it('una publicación actualizada cuenta como no leída', () => {
    expect(sortUnreadFirst([card('a', '2026-10-17T10:00:00Z', 'read'), card('b', '2026-10-16T10:00:00Z', 'updated')]).map((x) => x.id)).toEqual(['b', 'a'])
  })
  // Almacenamiento de sesión simulado (el entorno de pruebas no tiene navegador).
  const mem = new Map<string, string>()
  vi.stubGlobal('window', { sessionStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } })
  afterAll(() => vi.unstubAllGlobals())
  it('la miga de la sección en una publicación vuelve con el orden, los temas y el tipo elegidos y recupera la lista', () => {
    rememberSectionQuery('recetas', 'orden=no_leidas&tema=recetas-faciles&tema=trucos-de-cocina&tipo=receta')
    expect(savedSectionQuery('recetas')).toBe('?orden=no_leidas&tema=recetas-faciles&tema=trucos-de-cocina&tipo=receta')
    const crumb = postCrumbs('recetas').find((c) => c.label === 'Recetas y cocina')
    expect(crumb?.to).toBe('/comunidad/s/recetas?orden=no_leidas&tema=recetas-faciles&tema=trucos-de-cocina&tipo=receta')
    expect(crumb?.state).toEqual({ restoreList: true })
    // Entrar de nuevo por el menú empieza limpio: al limpiar los filtros se olvida lo guardado.
    rememberSectionQuery('recetas', '')
    expect(savedSectionQuery('recetas')).toBe('')
    expect(postCrumbs('hogar').find((c) => c.label === 'Hogar y familia')?.to).toBe('/comunidad/s/hogar')
  })
  it('la lista de sección recupera lo cargado también al llegar por esa miga', () => {
    const section = read('src/ui/community/CommunitySectionPage.tsx')
    expect(section).toContain('restoreList')
    expect(section).toContain('sortUnreadFirst(list.items)')
  })
})

describe('«Propón un tema»', () => {
  it('mensaje de agradecimiento nuevo, sin promesas de fecha ni de publicación', () => {
    for (const t of ['💡 ¡Gracias por tu idea!', 'Nos encanta que nos ayudes a hacer crecer la Comunidad PEPA. ❤️', 'El equipo revisará tu propuesta e intentará incluirla entre los próximos artículos programados lo antes posible.', '¡Las mejores ideas nacen de las propias familias!']) expect(propose).toContain(t)
    expect(propose).not.toContain('decidir si escribir')
    expect(propose).toContain('Cerrar')
  })
  it('casilla de agradecimiento público desmarcada por defecto y enviada con la propuesta', () => {
    expect(propose).toContain('useState(false)')
    expect(propose).toContain('podéis agradecerme la propuesta mencionando mi alias público')
    expect(propose).toContain('proposeTopic(topic, text.trim(), credit)')
  })
  it('el Centro de Mando enlaza, desenlaza y añade el agradecimiento solo con consentimiento; sin revelar quién propone', () => {
    for (const t of ['adminLinkTopicProposals', 'adminUnlinkTopicProposals', 'adminAddCredit', 'Añadir agradecimiento al borrador', 'Enlazar con un artículo', 'acepta']) expect(tab).toContain(t)
    expect(tab).not.toMatch(/\.alias|aliases/)
  })
})

describe('áreas seguras de los modales «Añadir a Compras»', () => {
  it('la hoja no sube por debajo de la hora y los indicadores; el pie respeta la zona segura de abajo', () => {
    expect(menuCss).toMatch(/\.community-menu-sheet \{[^}]*max-height: calc\(100dvh - env\(safe-area-inset-top, 0px\) - 16px\)/)
    expect(menuCss).toContain('env(safe-area-inset-bottom, 0px)')
  })
})
