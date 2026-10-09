import { describe, expect, it } from 'vitest'

// «Pequeños Grandes» (prompt maestro) — Fase 7: ingresos con reparto automático 60/20/20. Construido
// desde cero (confirmado inexistente en la auditoría, Fase 1): registrar un ingreso pasa SIEMPRE por el
// RPC register_kid_income (migración 0230, atómico en el servidor) — nunca un insert directo ni 2-3
// inserts sueltos desde el cliente que pudieran quedarse a medias. Solo un adulto puede cambiar el
// reparto de un niño; un cambio afecta solo a ingresos futuros (el RPC lee la config en el momento de
// registrar, nunca recalcula el pasado).
const UI = (import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
const FS = UI['/src/ui/FinanceScreen.tsx']
const DATA_FINANCE = (import.meta.glob('/src/data/finance.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/finance.ts']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('data/finance.ts — un ingreso pasa SIEMPRE por el RPC, nunca un insert directo', () => {
  it('registerKidIncome llama a supabase.rpc("register_kid_income"), no a un insert en kid_wallet_transactions', () => {
    const fn = window_(DATA_FINANCE, 'export async function registerKidIncome(', '\n}')
    expect(fn).toContain("supabase.rpc('register_kid_income'")
    expect(fn).not.toContain(".from('kid_wallet_transactions').insert")
  })
  it('setKidIncomeSplitConfig nunca manda un "disponible_pct" — siempre es el resto, nunca una tercera cifra guardada', () => {
    const fn = window_(DATA_FINANCE, 'export async function setKidIncomeSplitConfig(', '\n}')
    expect(fn).not.toMatch(/disponible/i)
  })
})

describe('AddTransactionForm — un "ingreso" usa registerKidIncome; ahorro/gasto/impuesto manuales siguen con addWalletTransaction', () => {
  // Última función del archivo — no hay siguiente declaración que sirva de marcador final.
  const body = FS.slice(FS.indexOf('function AddTransactionForm('))

  it("type === 'ingreso' llama a registerKidIncome", () => {
    expect(body).toContain("if (type === 'ingreso') {")
    expect(body).toContain('await registerKidIncome({ memberId, amount: parsedAmount, description })')
  })
  it('cualquier otro tipo sigue con addWalletTransaction de siempre (nunca duplicado el mecanismo)', () => {
    expect(body).toContain('await addWalletTransaction({ memberId, type, amount: parsedAmount, description })')
  })
  it('muestra una vista previa del reparto (ahorro/impuesto/disponible) antes de guardar, usando splitKidIncome', () => {
    expect(body).toContain('splitKidIncome(parsedAmount, splitConfig)')
    expect(body).toContain('Se repartirá:')
  })
})

describe('IncomeSplitInfo / EditIncomeSplitForm — el reparto se ve siempre, pero solo un adulto puede cambiarlo', () => {
  const infoBody = window_(FS, 'function IncomeSplitInfo(', '\nfunction EditIncomeSplitForm(')
  const editBody = window_(FS, 'function EditIncomeSplitForm(', '\nfunction AddGoalForm(')

  it('el texto del reparto se ve para cualquiera (isAdult o no)', () => {
    expect(infoBody).toContain('Reparto automático:')
    expect(infoBody).not.toMatch(/if \(!?isAdult\)[\s\S]*return null/)
  })
  it('"✏️ Editar reparto" solo se renderiza si isAdult', () => {
    expect(infoBody).toContain('{isAdult && (')
    expect(infoBody).toContain('✏️ Editar reparto')
  })
  it('el formulario exige que ahorro + impuestos no supere 100 (el resto es disponible, nunca negativo)', () => {
    expect(editBody).toContain('ahorroNum + impuestoNum <= 100')
  })
  it('el aviso "solo afecta a ingresos futuros" está explícito en el propio formulario', () => {
    expect(editBody).toContain('Solo afecta a los ingresos a partir de ahora')
  })
})

describe('KidsFinanceTab — ahora recibe profile (para saber si isAdult puede editar el reparto)', () => {
  const PG_SCREEN = UI['/src/ui/PequenosGrandesScreen.tsx']

  it('la firma del componente exportado incluye profile', () => {
    expect(FS).toContain('export function KidsFinanceTab({ profile }: { profile: Profile }) {')
  })
  it('las 2 llamadas dentro de FinanceScreen (Economía restringida y pestaña de adulto) pasan profile', () => {
    const matches = FS.match(/<KidsFinanceTab profile=\{profile\} \/>/g) ?? []
    expect(matches.length).toBe(2)
  })
  it('la llamada desde Pequeños Grandes también pasa profile', () => {
    expect(PG_SCREEN).toContain('<KidsFinanceTab profile={profile} />')
  })
})
