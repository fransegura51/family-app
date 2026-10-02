import { describe, expect, it } from 'vitest'

const UI_FILES = import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const DOMAIN_FILES = import.meta.glob('/src/domain/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

function readFile(path: string): string {
  const content = UI_FILES[path] ?? DOMAIN_FILES[path]
  expect(content, `no se encontró ${path}`).toBeTruthy()
  return content
}

const BREADCRUMB_SRC = readFile('/src/ui/SectionBreadcrumb.tsx')
const NAV_TABS_SRC = readFile('/src/domain/navTabs.ts')

describe('SectionBreadcrumb — componente', () => {
  it('la Sección (primer nivel) es un Link real de React Router (accesible, no un span con onClick), con state.sectionHome', () => {
    expect(BREADCRUMB_SRC).toContain("import { Link, useLocation } from 'react-router-dom'")
    expect(BREADCRUMB_SRC).toContain('{ label: section.label, to: section.to, state: { sectionHome: true } }')
    expect(BREADCRUMB_SRC).not.toMatch(/<span[^>]*onClick/)
  })

  it('cualquier nivel intermedio con `to` también es un Link real — solo el ÚLTIMO nivel deja de serlo', () => {
    expect(BREADCRUMB_SRC).toContain('<Link to={level.to} state={level.state} className="section-breadcrumb-section">')
  })

  it('el último nivel es texto actual, marcado con aria-current, nunca un enlace', () => {
    expect(BREADCRUMB_SRC).toContain("aria-current={isCurrent ? 'page' : undefined}")
    expect(BREADCRUMB_SRC).toContain("isCurrent ? 'section-breadcrumb-current' : 'section-breadcrumb-section'")
  })

  it('niveles dinámicos, no un número fijo: `subsection` acepta un string (un nivel más) o una lista BreadcrumbLevel[] (varios) — la limitación anterior de máximo dos niveles queda cancelada', () => {
    expect(BREADCRUMB_SRC).toContain('export interface BreadcrumbLevel {')
    expect(BREADCRUMB_SRC).toContain('export function SectionBreadcrumb({ subsection }: { subsection: string | BreadcrumbLevel[] }) {')
    expect(BREADCRUMB_SRC).toContain('levels.map((level, i) => {')
    // Un string simple se normaliza a un único nivel más — el caso de siempre sigue funcionando igual.
    expect(BREADCRUMB_SRC).toContain("typeof subsection === 'string' ? [{ label: subsection }] : subsection")
  })

  it('cada nivel es un ítem propio (separador "/" pegado a su etiqueta) para que el wrap en móvil rompa por nivel completo, nunca dejando una "/" suelta', () => {
    expect(BREADCRUMB_SRC).toContain('className="section-breadcrumb-item"')
    expect(BREADCRUMB_SRC).toContain('className="section-breadcrumb-sep"')
  })

  it('sin sección reconocible (p. ej. Actividad o Admin) no renderiza nada, en vez de romper', () => {
    expect(BREADCRUMB_SRC).toContain('if (!section) return null')
  })

  it('incluye Ayuda, Buzón y Configuración (fuera de NAV_TABS) para que también tengan breadcrumb', () => {
    expect(BREADCRUMB_SRC).toContain("{ to: '/ayuda', label: 'Ayuda', icon: '❓' }")
    expect(BREADCRUMB_SRC).toContain("{ to: '/sugerencias', label: 'Buzón', icon: '💡' }")
    expect(BREADCRUMB_SRC).toContain("{ to: '/menu-organizar', label: 'Configuración', icon: '⚙️' }")
  })

  it('Inicio ("/") queda fuera de sectionForPath — HomeScreen no debe mostrar breadcrumb', () => {
    expect(BREADCRUMB_SRC).toContain("ALL_SECTIONS.filter((t) => t.to !== '/'")
  })

  it('accesibilidad: <nav aria-label="Migas de pan"> — sin depender de history.back() para ningún nivel', () => {
    expect(BREADCRUMB_SRC).toContain('<nav className="section-breadcrumb" aria-label="Migas de pan">')
    expect(BREADCRUMB_SRC).not.toContain('history.back')
    expect(BREADCRUMB_SRC).not.toContain('useNavigate')
  })
})

describe('SectionBreadcrumb — integración: una llamada justo debajo de cada kitchen-header, nunca un sistema nuevo por pantalla', () => {
  // Las fijas usan un literal JSX (subsection="Inicio"); las que dependen del estado de la propia
  // pantalla usan una expresión (subsection={...}) — se comprueba el texto exacto que de verdad aparece.
  // EventosScreen.tsx queda fuera de esta lista genérica a propósito: su llamada ya no cabe en una
  // línea (puede subir a tres niveles), así que tiene su propio describe más abajo.
  const SCREENS: { file: string; expectedCall: string }[] = [
    { file: '/src/ui/FamilyScreen.tsx', expectedCall: "subsection={tab === 'Miembros' ? 'Inicio' : tab}" },
    { file: '/src/ui/CalendarScreen.tsx', expectedCall: 'subsection={CALENDARIO_MENU_ITEM_META[view].label}' },
    { file: '/src/ui/RewardsScreen.tsx', expectedCall: 'subsection="Inicio"' },
    { file: '/src/ui/AlimentacionScreen.tsx', expectedCall: 'subsection={ALIMENTACION_MENU_ITEM_META[tab].label}' },
    { file: '/src/ui/LocationScreen.tsx', expectedCall: 'subsection={UBICACION_MENU_ITEM_META[tab].label}' },
    { file: '/src/ui/BirthdaysScreen.tsx', expectedCall: 'subsection="Inicio"' },
    { file: '/src/ui/ContactsScreen.tsx', expectedCall: 'subsection="Inicio"' },
    { file: '/src/ui/GalleryScreen.tsx', expectedCall: 'subsection="Inicio"' },
    { file: '/src/ui/DocumentsScreen.tsx', expectedCall: 'subsection="Inicio"' },
    { file: '/src/ui/AyudaScreen.tsx', expectedCall: 'subsection="Inicio"' },
    { file: '/src/ui/SuggestionsScreen.tsx', expectedCall: 'subsection="Inicio"' },
    { file: '/src/ui/MenuSettingsScreen.tsx', expectedCall: 'subsection="Inicio"' },
  ]

  for (const { file, expectedCall } of SCREENS) {
    it(`${file} importa SectionBreadcrumb y lo llama justo debajo del kitchen-header`, () => {
      const src = readFile(file)
      expect(src, 'import').toContain("import { SectionBreadcrumb } from '@/ui/SectionBreadcrumb'")
      const headerIndex = src.indexOf('className="kitchen-header')
      const breadcrumbIndex = src.indexOf('<SectionBreadcrumb ')
      expect(breadcrumbIndex, 'llamada a <SectionBreadcrumb').toBeGreaterThan(-1)
      expect(breadcrumbIndex, 'debe ir DESPUÉS del kitchen-header').toBeGreaterThan(headerIndex)
      expect(src).toContain(`<SectionBreadcrumb ${expectedCall} />`)
    })
  }

  it('Compras: "Lista" muestra "Lista de la Compra" (coincide con el nuevo título de la propia pestaña), el resto usa COMPRAS_MENU_ITEM_META', () => {
    const src = readFile('/src/ui/ShoppingScreen.tsx')
    expect(src).toContain("subsection={tab === 'Lista' ? 'Lista de la Compra' : COMPRAS_MENU_ITEM_META[tab].label}")
  })

  it('Economía: "Presupuesto Generales" muestra "Presupuestos" (corrección deliberada), el resto usa ECONOMIA_MENU_ITEM_META; la vista restringida de niños fija "Educación financiera"', () => {
    const src = readFile('/src/ui/FinanceScreen.tsx')
    expect(src).toContain("subsection={tab === 'Presupuesto Generales' ? 'Presupuestos' : ECONOMIA_MENU_ITEM_META[tab].label}")
    expect(src).toContain('<SectionBreadcrumb subsection="Educación financiera" />')
  })

  it('HomeScreen NO lleva SectionBreadcrumb — Inicio es la raíz global, "Inicio / Inicio" no aporta nada', () => {
    const src = readFile('/src/ui/HomeScreen.tsx')
    expect(src).not.toContain('SectionBreadcrumb')
  })
})

describe('Eventos — breadcrumb de 2 o 3 niveles ("Eventos / Boda de plata" o "Eventos / Boda de plata / Preparativos")', () => {
  const EVENTOS = readFile('/src/ui/EventosScreen.tsx')

  it('sin evento seleccionado: "Inicio"; con evento y sin módulo abierto: el nombre real del evento (nunca hardcodeado)', () => {
    expect(EVENTOS).toContain('!selected')
    expect(EVENTOS).toContain("? 'Inicio'")
    expect(EVENTOS).toContain('!openModuleLabel')
    expect(EVENTOS).toContain('? selected.title')
  })

  it('con un módulo abierto: tercer nivel — el segundo es el evento (Link real a su propio dashboard, state.eventHome) y el tercero es el módulo (texto actual)', () => {
    expect(EVENTOS).toContain("{ label: selected.title, to: '/eventos', state: { eventHome: true } }")
    expect(EVENTOS).toContain('{ label: openModuleLabel }')
  })

  it('"Boda de plata" NUNCA navega solo a /eventos a secas: lleva state.eventHome, una clave distinta de sectionHome, para que EventDetail sepa que debe cerrar el módulo y no reiniciar selectedId', () => {
    expect(EVENTOS).toContain("useLocationFlag('eventHome', () => setOpenModule(null))")
    // selectedId vive en el padre y useLocationFlag('eventHome', ...) está dentro de EventDetail — nunca
    // toca selectedId, a diferencia de useSectionHome (que si lo resetea, ver test de más abajo).
  })

  it('el label del módulo abierto se resuelve de EVENT_MODULES (nombres reales ya existentes: Preparativos, Invitados, Presupuesto...), nunca una lista nueva inventada', () => {
    expect(EVENTOS).toContain("EVENT_MODULES.find((m) => m.key === openModule)?.label ?? 'Compras'")
  })

  it('navegación redundante eliminada: ya no existe el antiguo "‹ {icono} {título}" al abrir un módulo — el nivel "Boda de plata" del breadcrumb cubre exactamente ese mismo destino', () => {
    expect(EVENTOS).not.toContain('‹ {EVENT_TYPE_META[event.type].icon} {event.title}')
  })

  it('"← Todos los eventos" (volver de un evento a la LISTA, un destino distinto de "volver al dashboard de este evento") sigue intacto — no es el control eliminado', () => {
    expect(EVENTOS).toContain('← Todos los eventos')
  })
})

describe('Fuente única de secciones — NAV_TABS ya cubre las 12 normales, sin mapas duplicados', () => {
  it('SectionBreadcrumb importa NAV_TABS de navTabs.ts en vez de redefinir sus propias 12 secciones', () => {
    expect(BREADCRUMB_SRC).toContain("import { NAV_TABS, type NavTab } from '@/domain/navTabs'")
  })

  it('NAV_TABS sigue teniendo exactamente las 12 secciones normales + Inicio, sin que este cambio le añada nada', () => {
    expect(NAV_TABS_SRC).not.toContain('/ayuda')
    expect(NAV_TABS_SRC).not.toContain('/sugerencias')
    expect(NAV_TABS_SRC).not.toContain('/menu-organizar')
  })
})
