import { describe, expect, it } from 'vitest'

// PG-PUNTOS-FINANZAS (Parte B1) — "mantener pantalla principal/cabecera/4 ilustraciones/selector de
// hijo/tema; quitar el enlace redundante '← Volver a Pequeños Grandes' (la miga de pan ya permite
// volver); todas las pantallas internas deben mostrar 'Pequeños Grandes / Educación financiera /
// [Sección]', totalmente navegables, sin enlaces de vuelta duplicados."
const UI_FILES = import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const FINANCE = UI_FILES['/src/ui/FinanceScreen.tsx']
const PG = UI_FILES['/src/ui/PequenosGrandesScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('B1 — "← Volver a Pequeños Grandes" eliminado de verdad, nunca solo ocultado', () => {
  it('el texto literal del botón ya no existe en PequenosGrandesScreen.tsx (ni oculto ni condicional)', () => {
    expect(PG).not.toContain('← Volver a Pequeños Grandes')
  })
  it('EducacionFinancieraTab ya no recibe ni usa un prop onBack — nada que reemplace al botón eliminado', () => {
    const fn = window_(PG, 'function EducacionFinancieraTab(', '\n}')
    expect(fn).not.toContain('onBack')
    expect(fn).toContain('<KidsFinanceTab profile={profile} standalone />')
  })
})

describe('B1 — KidsFinanceTab pinta su propia miga de pan cuando ES la pantalla entera (`standalone`)', () => {
  const kids = window_(FINANCE, 'export function KidsFinanceTab(', '\nfunction GoalCard(')

  it('el prop `standalone` existe, por defecto false (nunca rompe la pestaña dentro de Economía, que ya tiene su propia miga de pan genérica)', () => {
    expect(kids).toContain('{ profile, standalone = false }: { profile: Profile; standalone?: boolean }')
  })

  it('con una tarjeta abierta y standalone: 3 niveles — "Educación financiera" (onClick, sin ruta nueva) + la sección actual (Recibir/Ahorrar/Gastar/Impuestos)', () => {
    expect(kids).toContain("subsection={[{ label: 'Educación financiera', onClick: () => setOpenCard(null) }, { label: cardInfo.label }] satisfies BreadcrumbLevel[]}")
  })

  it('en la rejilla (sin tarjeta abierta) y standalone: 2 niveles — "Educación financiera" como nivel actual', () => {
    expect(kids).toContain('{standalone && <SectionBreadcrumb subsection="Educación financiera" />}')
  })

  it('el "← Volver" (de una tarjeta a la rejilla) solo se enseña cuando NO es standalone — en standalone el nivel intermedio de la miga de pan ya hace ese mismo trabajo, nunca dos controles duplicados para lo mismo', () => {
    const openCardBlock = window_(kids, 'if (openCard) {', '\n  return (')
    expect(openCardBlock).toContain('{!standalone && (')
    expect(openCardBlock).toContain('← Volver')
  })
})

describe('B1 — ambos puntos de acceso dedicados pasan standalone, nunca pintan su propia miga de pan aparte', () => {
  it('la vista restringida de un hijo en /dinero ya no llama a SectionBreadcrumb por su cuenta', () => {
    const block = window_(FINANCE, 'if (dineroRestricted) {', '\n  return (')
    expect(block).toContain('<KidsFinanceTab profile={profile} standalone />')
    expect(block).not.toContain('<SectionBreadcrumb')
  })
  it('el acceso desde Pequeños Grandes (/puntos) tampoco llama a SectionBreadcrumb por su cuenta', () => {
    const fn = window_(PG, 'function EducacionFinancieraTab(', '\n}')
    expect(fn).not.toContain('<SectionBreadcrumb')
  })
  it('Economía ya no tiene pestaña "Educación financiera" (2026-10-16, era una segunda puerta al mismo módulo): solo queda la vista restringida de un hijo, con standalone', () => {
    expect(FINANCE).not.toContain("{tab === 'Educación financiera'")
    expect(FINANCE.match(/<KidsFinanceTab /g)?.length).toBe(1)
    expect(FINANCE).toContain('<KidsFinanceTab profile={profile} standalone />')
  })
})
