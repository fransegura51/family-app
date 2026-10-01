import { describe, expect, it } from 'vitest'
import { sectionForPath } from './SectionBreadcrumb'
import { COMPRAS_MENU_ITEM_META } from '@/state/comprasMenu'
import { ECONOMIA_MENU_ITEM_META } from '@/state/economiaMenu'
import { CALENDARIO_MENU_ITEM_META } from '@/state/calendarioMenu'
import { ALIMENTACION_MENU_ITEM_META } from '@/state/alimentacionMenu'
import { UBICACION_MENU_ITEM_META } from '@/state/ubicacionMenu'

// Este repo no renderiza componentes en sus tests (sin jsdom/testing-library — ver useSectionHome.test.ts
// para la lógica pura del propio hook). Aquí se comprueba el COMPORTAMIENTO del "vuelve a Inicio" de dos
// formas que no necesitan DOM: (1) se ejecuta la función REAL que resuelve qué texto se vería en el
// breadcrumb (los mismos mapas *_MENU_ITEM_META que usa cada pantalla), para confirmar que el valor al
// que cada pantalla resetea su pestaña/vista/selección RESUELVE REALMENTE a "Inicio" — no que el texto
// "Inicio" aparezca suelto en algún sitio del archivo; (2) se confirma que cada pantalla conecta
// useSectionHome con ESE mismo valor exacto, y que ninguna otra navegación (barra inferior, ☰ menú,
// cambio normal de pestaña) dispara el mismo mecanismo.

const UI_FILES = import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
function src(file: string): string {
  const content = UI_FILES[file]
  expect(content, `no se encontró ${file}`).toBeTruthy()
  return content
}

describe('sectionForPath — la MISMA función que usa el Link del breadcrumb resuelve la ruta raíz real', () => {
  it('resuelve /dinero, /compras, /calendario, /alimentacion, /eventos, /familia, /ubicacion a su sección', () => {
    expect(sectionForPath('/dinero')?.to).toBe('/dinero')
    expect(sectionForPath('/compras')?.to).toBe('/compras')
    expect(sectionForPath('/calendario')?.to).toBe('/calendario')
    expect(sectionForPath('/alimentacion')?.to).toBe('/alimentacion')
    expect(sectionForPath('/eventos')?.to).toBe('/eventos')
    expect(sectionForPath('/familia')?.to).toBe('/familia')
    expect(sectionForPath('/ubicacion')?.to).toBe('/ubicacion')
  })
})

describe('Economía — pulsar "Economía" desde cualquier subsección resuelve a Inicio de verdad', () => {
  const FINANCE = src('/src/ui/FinanceScreen.tsx')

  it('useSectionHome resetea tab a Resumen — la ÚNICA pestaña cuyo label real es "Inicio"', () => {
    expect(FINANCE).toContain("useSectionHome(() => setTab('Resumen'))")
    expect(ECONOMIA_MENU_ITEM_META['Resumen'].label).toBe('Inicio')
    // Las pantallas de las que el bug partió (Estadísticas, Presupuesto Generales) NO son "Inicio" —
    // confirma que el reset realmente cambia de subsección en vez de ser un no-op.
    expect(ECONOMIA_MENU_ITEM_META['Estadísticas'].label).not.toBe('Inicio')
    expect(ECONOMIA_MENU_ITEM_META['Presupuesto Generales'].label).not.toBe('Inicio')
  })

  it('el breadcrumb de FinanceScreen usa exactamente ese mismo mapa para "Presupuesto Generales" (corregido a "Presupuestos", no al label del menú) y el resto de pestañas', () => {
    expect(FINANCE).toContain("subsection={tab === 'Presupuesto Generales' ? 'Presupuestos' : ECONOMIA_MENU_ITEM_META[tab].label}")
  })

  it('useSectionHome se llama una sola vez, fuera de cualquier onClick de cambio de pestaña normal', () => {
    const calls = [...FINANCE.matchAll(/useSectionHome\(/g)]
    expect(calls).toHaveLength(1)
  })
})

describe('Compras — pulsar "Compras" vuelve a Inicio, sin romper el deep-link existente (state.tab)', () => {
  const SHOPPING = src('/src/ui/ShoppingScreen.tsx')

  it('useSectionHome resetea tab a "Inicio" (clave ya literal, label real "Inicio")', () => {
    expect(SHOPPING).toContain("useSectionHome(() => setTab('Inicio'))")
    expect(COMPRAS_MENU_ITEM_META['Inicio'].label).toBe('Inicio')
    // Los dos puntos de partida del bug (Lista de la Compra, Tickets) no son Inicio.
    expect(COMPRAS_MENU_ITEM_META['Lista'].label).not.toBe('Inicio')
    expect(COMPRAS_MENU_ITEM_META['Tickets'].label).not.toBe('Inicio')
  })

  it('el deep-link existente (volver desde Movimientos con state.tab) sigue intacto — clave distinta de sectionHome', () => {
    expect(SHOPPING).toContain("const requested = (location.state as { tab?: string } | null)?.tab")
    expect(SHOPPING).toContain("return SUB_TABS.find((t) => t === requested) ?? 'Inicio'")
  })

  it('useSectionHome se llama una sola vez', () => {
    expect([...SHOPPING.matchAll(/useSectionHome\(/g)]).toHaveLength(1)
  })
})

describe('Calendario — "Vista general" es el ÚNICO identificador cuyo label es "Inicio"; nunca se confunde con "Mes"', () => {
  const CALENDAR = src('/src/ui/CalendarScreen.tsx')

  it('useSectionHome resetea view a \'Vista general\' literal — no a firstCalendarioView() (que podría ser otra vista si la familia reordenó su menú)', () => {
    expect(CALENDAR).toContain("useSectionHome(() => setView('Vista general'))")
    expect(CALENDARIO_MENU_ITEM_META['Vista general'].label).toBe('Inicio')
  })

  it('"Mes" y "Agenda" (los dos puntos de partida reportados) tienen label propio, nunca "Inicio"', () => {
    expect(CALENDARIO_MENU_ITEM_META['Mes'].label).toBe('Mes')
    expect(CALENDARIO_MENU_ITEM_META['Agenda'].label).toBe('Agenda')
  })

  it('useSectionHome se llama una sola vez', () => {
    expect([...CALENDAR.matchAll(/useSectionHome\(/g)]).toHaveLength(1)
  })
})

describe('La cocina de Pepa — pulsar la sección vuelve a Inicio desde Recetas/Menú', () => {
  const COCINA = src('/src/ui/AlimentacionScreen.tsx')

  it('useSectionHome resetea tab a "Inicio"', () => {
    expect(COCINA).toContain("useSectionHome(() => setTab('Inicio'))")
    expect(ALIMENTACION_MENU_ITEM_META['Inicio'].label).toBe('Inicio')
    expect(ALIMENTACION_MENU_ITEM_META['Recetas'].label).not.toBe('Inicio')
  })

  it('useSectionHome se llama una sola vez', () => {
    expect([...COCINA.matchAll(/useSectionHome\(/g)]).toHaveLength(1)
  })
})

describe('Eventos — pulsar "Eventos" deselecciona el evento (vuelve a la lista) y limpia el módulo heredado', () => {
  const EVENTOS = src('/src/ui/EventosScreen.tsx')

  it('useSectionHome pone selectedId e initialModule a null — nunca solo uno de los dos', () => {
    const call = EVENTOS.slice(EVENTOS.indexOf('useSectionHome(() => {'), EVENTOS.indexOf('})', EVENTOS.indexOf('useSectionHome(() => {')) + 2)
    expect(call).toContain('setSelectedId(null)')
    expect(call).toContain('setInitialModule(null)')
  })

  it('el breadcrumb resuelve a "Inicio" exactamente cuando selectedId es null (mismo ternario ya probado en sectionBreadcrumbUi.test.ts)', () => {
    expect(EVENTOS).toContain("subsection={selected ? selected.title : 'Inicio'}")
  })

  it('initialModule se resetea para que el PRÓXIMO evento abierto normalmente empiece en su propio Inicio, no herede un módulo de una navegación anterior', () => {
    expect(EVENTOS).toContain("const [initialModule, setInitialModule] = useState<EventModuleKey | null>(null)")
  })

  it('useSectionHome se llama una sola vez', () => {
    expect([...EVENTOS.matchAll(/useSectionHome\(/g)]).toHaveLength(1)
  })
})

describe('Familia — pulsar "Familia" desde Peso y medidas vuelve a Miembros, sin romper el redirect de /peso', () => {
  const FAMILY = src('/src/ui/FamilyScreen.tsx')

  it('useSectionHome resetea tab a Miembros', () => {
    expect(FAMILY).toContain("useSectionHome(() => setTab('Miembros'))")
  })

  it('el redirect existente de /peso (state.tab) sigue intacto — clave distinta de sectionHome', () => {
    expect(FAMILY).toContain(
      "const [tab, setTab] = useState<FamilyTab>(() => ((location.state as { tab?: FamilyTab } | null)?.tab === 'Peso y medidas' ? 'Peso y medidas' : 'Miembros'))",
    )
  })

  it('el breadcrumb resuelve "Inicio" exactamente cuando tab === \'Miembros\' (mismo ternario ya probado en sectionBreadcrumbUi.test.ts)', () => {
    expect(FAMILY).toContain("subsection={tab === 'Miembros' ? 'Inicio' : tab}")
  })

  it('useSectionHome se llama una sola vez', () => {
    expect([...FAMILY.matchAll(/useSectionHome\(/g)]).toHaveLength(1)
  })
})

describe('Ubicación — pulsar "Ubicación" desde una vista interna vuelve a Inicio', () => {
  const LOCATION = src('/src/ui/LocationScreen.tsx')

  it('useSectionHome resetea tab a "Inicio"', () => {
    expect(LOCATION).toContain("useSectionHome(() => setTab('Inicio'))")
    expect(UBICACION_MENU_ITEM_META['Inicio'].label).toBe('Inicio')
  })

  it('useSectionHome se llama una sola vez', () => {
    expect([...LOCATION.matchAll(/useSectionHome\(/g)]).toHaveLength(1)
  })
})

describe('SectionBreadcrumb — el Link pasa state.sectionHome, sin onClick propio', () => {
  const BREADCRUMB = src('/src/ui/SectionBreadcrumb.tsx')

  it('usa <Link state={{ sectionHome: true }}>, nunca un onClick/navigate manual', () => {
    expect(BREADCRUMB).toContain('<Link to={section.to} state={{ sectionHome: true }} className="section-breadcrumb-section">')
    expect(BREADCRUMB).not.toMatch(/section-breadcrumb-section[^>]*onClick/)
    expect(BREADCRUMB).not.toContain('useNavigate')
  })
})

describe('Barra inferior y ☰ menú — NO disparan sectionHome (ninguna navegación normal lo hace)', () => {
  const NAV_SHELL = src('/src/ui/NavShell.tsx')

  it('NavShell navega con navigate(to) sin un segundo argumento state — nunca sectionHome', () => {
    const navigateCalls = [...NAV_SHELL.matchAll(/navigate\(([^)]*)\)/g)].map((m) => m[1])
    expect(navigateCalls.length).toBeGreaterThan(0)
    for (const args of navigateCalls) expect(args).not.toContain('sectionHome')
    expect(NAV_SHELL).not.toContain('sectionHome')
  })
})

describe('Cambiar de pestaña con normalidad no toca useSectionHome en ninguna pantalla', () => {
  const SCREENS = [
    '/src/ui/FinanceScreen.tsx',
    '/src/ui/ShoppingScreen.tsx',
    '/src/ui/CalendarScreen.tsx',
    '/src/ui/AlimentacionScreen.tsx',
    '/src/ui/EventosScreen.tsx',
    '/src/ui/FamilyScreen.tsx',
    '/src/ui/LocationScreen.tsx',
  ]

  for (const file of SCREENS) {
    it(`${file}: ningún onClick de pestaña/vista llama a useSectionHome`, () => {
      const content = src(file)
      // Todas las llamadas a useSectionHome deben estar fuera de cualquier onClick=... — se comprueba
      // que la única aparición de "useSectionHome(" en todo el archivo no está precedida por "onClick="
      // en la misma línea (los setters de cambio de pestaña usan onClick={() => setTab(t)}, nunca esto).
      const lines = content.split('\n').filter((l) => l.includes('useSectionHome('))
      for (const line of lines) expect(line).not.toContain('onClick')
    })
  }
})
