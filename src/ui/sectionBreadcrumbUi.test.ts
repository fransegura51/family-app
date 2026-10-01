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
  it('la sección es un Link real de React Router (accesible, no un span con onClick)', () => {
    expect(BREADCRUMB_SRC).toContain("import { Link, useLocation } from 'react-router-dom'")
    expect(BREADCRUMB_SRC).toContain('<Link to={section.to} state={{ sectionHome: true }} className="section-breadcrumb-section">')
    expect(BREADCRUMB_SRC).not.toMatch(/<span[^>]*onClick/)
  })

  it('la subsección es texto actual, marcado con aria-current, nunca un enlace', () => {
    expect(BREADCRUMB_SRC).toContain('<span className="section-breadcrumb-current" aria-current="page">')
  })

  it('máximo dos niveles: solo recibe `subsection`, la sección se resuelve sola de la ruta — ninguna prop de un tercer nivel', () => {
    expect(BREADCRUMB_SRC).toContain('export function SectionBreadcrumb({ subsection }: { subsection: string }) {')
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
})

describe('SectionBreadcrumb — integración: una llamada justo debajo de cada kitchen-header, nunca un sistema nuevo por pantalla', () => {
  // Las fijas usan un literal JSX (subsection="Inicio"); las que dependen del estado de la propia
  // pantalla usan una expresión (subsection={...}) — se comprueba el texto exacto que de verdad aparece.
  const SCREENS: { file: string; expectedCall: string }[] = [
    { file: '/src/ui/FamilyScreen.tsx', expectedCall: "subsection={tab === 'Miembros' ? 'Inicio' : tab}" },
    { file: '/src/ui/CalendarScreen.tsx', expectedCall: 'subsection={CALENDARIO_MENU_ITEM_META[view].label}' },
    { file: '/src/ui/EventosScreen.tsx', expectedCall: "subsection={selected ? selected.title : 'Inicio'}" },
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

  it('Eventos nunca muestra un tercer nivel: dentro de un módulo abierto, la subsección sigue siendo solo el nombre del evento', () => {
    const src = readFile('/src/ui/EventosScreen.tsx')
    // El propio onBack de un módulo (setOpenModule(null)) no toca SectionBreadcrumb — la prop sigue
    // atada solo a `selected`, nunca a `openModule`.
    expect(src).not.toMatch(/subsection=\{[^}]*openModule/)
  })

  it('HomeScreen NO lleva SectionBreadcrumb — Inicio es la raíz global, "Inicio / Inicio" no aporta nada', () => {
    const src = readFile('/src/ui/HomeScreen.tsx')
    expect(src).not.toContain('SectionBreadcrumb')
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
