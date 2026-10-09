import { describe, expect, it } from 'vitest'

// «Pequeños Grandes» (prompt maestro) — Fase 2: sustituye la tarjeta "Puntos" del Inicio por un hub con
// tres accesos. REGLA CRÍTICA DE SEGURIDAD DE DATOS: el id/ruta de sección sigue siendo 'puntos' — los
// permisos de menor/invitado ya guardados (profiles.allowed_sections) y el orden de tarjetas de Inicio
// guardado por dispositivo usan ese id tal cual; cambiarlo revocaría acceso en silencio a quien ya lo
// tuviera concedido.
const UI = (import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
const NAV_TABS_SRC = (import.meta.glob('/src/domain/navTabs.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/domain/navTabs.ts']
const HOME_SCREEN = UI['/src/ui/HomeScreen.tsx']
const APP_SRC = (import.meta.glob('/src/App.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/App.tsx']
const PG_SCREEN = UI['/src/ui/PequenosGrandesScreen.tsx']

describe('navTabs.ts — "puntos" sigue siendo el id/ruta de sección, solo cambia el nombre visible', () => {
  it('la ruta sigue siendo /puntos (nunca renombrada) — romper esto revocaría permisos ya concedidos en silencio', () => {
    expect(NAV_TABS_SRC).toContain("{ to: '/puntos', label: 'Pequeños Grandes', icon: '⭐' }")
  })
})

describe('HomeScreen — el subtítulo de la tarjeta Pequeños Grandes es el nuevo, sin tocar su id ni su color', () => {
  it('HOME_CARD_BODY.puntos es la nueva frase, bajo la misma clave "puntos"', () => {
    expect(HOME_SCREEN).toContain("puntos: 'Aprender, jugar y soñar',")
  })
  it('el color sigue calculándose con el mismo sistema de siempre (pastelPalette por índice) — nunca un amarillo fijo que rompa Pastel/Vivo/Neutro', () => {
    expect(HOME_SCREEN).toContain('NAV_SECTION_COLORS.get(id)')
    expect(HOME_SCREEN).not.toMatch(/puntos.*#f[ce]/i)
  })
})

describe('App.tsx — la ruta /puntos ahora monta PequenosGrandesScreen, no RewardsScreen directamente', () => {
  it('el componente del hub está importado y montado en /puntos', () => {
    expect(APP_SRC).toContain("const PequenosGrandesScreen = lazy(() => import('@/ui/PequenosGrandesScreen')")
    expect(APP_SRC).toContain('<Route path="/puntos" element={<PequenosGrandesScreen profile={profile} />} />')
  })
  it('ya no queda ninguna referencia a RewardsScreen en App.tsx (reemplazada, no duplicada)', () => {
    expect(APP_SRC).not.toContain('RewardsScreen')
  })
})

describe('PequenosGrandesScreen — hub con tres accesos, ninguno muestra saldos en esta pantalla', () => {
  it('no se muestra ningún importe/saldo en el propio hub (solo título y subtítulo por tarjeta)', () => {
    expect(PG_SCREEN).not.toMatch(/€|balance|saldo/i)
  })
  it('"Puntos y recompensas" reutiliza RewardsScreen tal cual, sin un segundo mecanismo de puntos', () => {
    expect(PG_SCREEN).toContain("import { RewardsScreen } from '@/ui/RewardsScreen'")
    expect(PG_SCREEN).toContain("if (openModule === 'recompensas') return <RewardsScreen profile={profile} />")
  })
  it('"Educación financiera" enlaza a donde el módulo vive hoy (Economía) — la Fase 5 es quien lo traslada de verdad, nunca se duplica aquí', () => {
    expect(PG_SCREEN).toContain('<Link to="/dinero"')
  })
  it('"Lista de deseos" es un hueco honesto (en construcción), nunca una función fingida ni un enlace roto', () => {
    expect(PG_SCREEN).toContain('ListaDeseosComingSoon')
    expect(PG_SCREEN).toContain('todavía se está construyendo')
  })
  it('volver a la sección (useSectionHome) resetea el hub al grid de tarjetas, mismo patrón que Eventos', () => {
    expect(PG_SCREEN).toContain('useSectionHome(() => setOpenModule(null))')
  })
})
