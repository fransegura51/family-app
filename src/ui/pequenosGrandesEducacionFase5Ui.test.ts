import { describe, expect, it } from 'vitest'

// «Pequeños Grandes» (prompt maestro) — Fase 5: Educación financiera se reorganiza. El punto de acceso
// principal pasa a vivir en el hub (/puntos), reutilizando KidsFinanceTab tal cual (nunca un segundo
// mecanismo ni datos duplicados): la pantalla sigue leyendo exactamente family_members/
// kid_wallet_transactions/kid_goals de siempre (ver src/data/finance.ts), y esas dos últimas tablas
// tienen su propia RLS (migración 0097) totalmente independiente de 'dinero' — nunca tocan
// bank_accounts/bank_connections/bank_transactions. Un hijo con Economía bloqueada (allowed_sections sin
// 'dinero') ahora SÍ pierde el acceso a Economía por completo (antes había una excepción en NavShell
// solo para que pudiera llegar a Educación financiera desde ahí).
const UI = (import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
const PG_SCREEN = UI['/src/ui/PequenosGrandesScreen.tsx']
const FINANCE_SCREEN = UI['/src/ui/FinanceScreen.tsx']
const NAV_SHELL = UI['/src/ui/NavShell.tsx']
const REWARDS_SCREEN = UI['/src/ui/RewardsScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

// El detalle de la firma (profile como prop, Fase 7) se cubre en kidsIncomeSplitFase7Ui.test.ts — aquí
// solo se comprueba que sigue siendo la MISMA función exportada, reutilizada en los 3 sitios de siempre.
//
// PG-PUNTOS-FINANZAS (Parte B1) — de los 3 sitios de siempre, los DOS donde KidsFinanceTab ES la
// pantalla entera (vista restringida de un hijo en /dinero, y el acceso desde /puntos) ahora pasan
// `standalone` para que sea el propio componente quien pinte su miga de pan de 2/3 niveles (nunca dos
// migas de pan a la vez) — el tercero (pestaña de un adulto dentro de Economía, que ya tiene su propia
// miga de pan genérica) sigue sin él, sin cambios.
describe('FinanceScreen — KidsFinanceTab se exporta para reutilizarse, nunca se duplica', () => {
  it('sigue siendo la misma función, ahora exportada', () => {
    expect(FINANCE_SCREEN).toContain('export function KidsFinanceTab(')
  })
  it('dentro de Economía solo queda la vista restringida de un hijo (con standalone): la pestaña de adulto se quitó el 2026-10-16 por ser una segunda puerta al mismo módulo', () => {
    expect(FINANCE_SCREEN).toContain('<KidsFinanceTab profile={profile} standalone />')
    expect(FINANCE_SCREEN).not.toContain("{tab === 'Educación financiera'")
  })
})

describe('PequenosGrandesScreen — Educación financiera reutiliza KidsFinanceTab como punto de acceso principal', () => {
  it('importa KidsFinanceTab de FinanceScreen, nunca un enlace a /dinero ni una copia', () => {
    expect(PG_SCREEN).toContain("import { KidsFinanceTab } from '@/ui/FinanceScreen'")
    expect(PG_SCREEN).toContain('<KidsFinanceTab profile={profile} standalone />')
  })
  it('la tarjeta del hub abre el módulo "educacion"', () => {
    expect(PG_SCREEN).toContain("{ key: 'educacion', label: 'Educación financiera'")
    expect(PG_SCREEN).toContain("if (openModule === 'educacion') return <EducacionFinancieraTab")
  })
})

describe('Breadcrumb — un nivel real, nunca "Pequeños Grandes" repetido (la Sección ya la añade sola SectionBreadcrumb)', () => {
  it('Educación financiera (Parte B1): ya no la pinta PequenosGrandesScreen por su cuenta — la pinta KidsFinanceTab (standalone), con 2 o 3 niveles según haya o no una tarjeta abierta', () => {
    expect(PG_SCREEN).not.toContain('<SectionBreadcrumb subsection="Educación financiera" />')
    expect(FINANCE_SCREEN).toContain('{standalone && <SectionBreadcrumb subsection="Educación financiera" />}')
  })
  it('Lista de deseos (WishlistScreen.tsx, construida 2026-10-10) tampoco repite "Pequeños Grandes" como nivel extra', () => {
    const wishlistScreen = UI['/src/ui/WishlistScreen.tsx']
    expect(wishlistScreen).toContain('<SectionBreadcrumb subsection="Lista de deseos" />')
    expect(wishlistScreen).not.toContain("subsection={[{ label: 'Pequeños Grandes'")
  })
  it('Puntos y recompensas (RewardsScreen) ya no dice "Inicio" estando dentro del hub — nombra su propio módulo', () => {
    expect(REWARDS_SCREEN).toContain('<SectionBreadcrumb subsection="Puntos y recompensas" />')
  })
})

describe('NavShell — bloquear "dinero" ahora bloquea Economía del todo para un hijo (ya no hace falta la excepción)', () => {
  it('ya no existe la excepción que mantenía /dinero visible solo por Educación financiera', () => {
    expect(NAV_SHELL).not.toContain("profile.role === 'child' && t.to === '/dinero'")
  })
  it('el filtro de pestañas visibles vuelve a ser el genérico de allowedSections, sin casos especiales', () => {
    const fn = window_(NAV_SHELL, 'const visibleTabs = order', '\n  const pinned')
    expect(fn).toContain("profile.allowedSections.includes(navSectionId(t))")
    expect(fn).not.toContain('child')
  })
})
