import { describe, expect, it } from 'vitest'

// Pequeños Grandes, Fases 8-11 (orden de recuperación de requisitos, autorización directa del usuario
// 2026-10-10) — autonomía y aprobaciones, conceptos con emoji, objetivos completos, fondo común.
const UI = (import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
const FS = UI['/src/ui/FinanceScreen.tsx']
const DATA_FINANCE = (import.meta.glob('/src/data/finance.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/finance.ts']
const MIG_0240 = (import.meta.glob('/supabase/migrations/0240_kid_wallet_approval.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/supabase/migrations/0240_kid_wallet_approval.sql'
]
const MIG_0241 = (
  import.meta.glob('/supabase/migrations/0241_kid_goals_photo_and_tax_fund.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
)['/supabase/migrations/0241_kid_goals_photo_and_tax_fund.sql']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('Migración 0240 — un niño que registra sobre sí mismo queda pendiente, por trigger, a prueba de insert/update crudo', () => {
  it('status/requested_by/decided_by/decided_at son aditivos, con default "aprobado" — ningún movimiento ya existente cambia', () => {
    expect(MIG_0240).toContain("add column status text not null default 'aprobado'")
  })
  it('el trigger fuerza "pendiente" en el INSERT de un niño sobre sí mismo (ingreso/gasto), nunca en ahorro/impuesto (reparto automático)', () => {
    const fn = window_(MIG_0240, 'create or replace function private.enforce_kid_wallet_status()', '\n$$;')
    expect(fn).toContain("if tg_op = 'INSERT' and new.type in ('ingreso', 'gasto') then")
    expect(fn).toContain("new.status := 'pendiente';")
  })
  it('el trigger bloquea que un niño cambie el status de su propia fila por UPDATE directo (nunca se auto-aprueba)', () => {
    const fn = window_(MIG_0240, 'create or replace function private.enforce_kid_wallet_status()', '\n$$;')
    expect(fn).toContain("elsif tg_op = 'UPDATE' and new.status is distinct from old.status then")
    expect(fn).toContain("raise exception 'not_authorized';")
  })
  it('register_kid_income solo reparte ahorro/impuesto si el ingreso quedó "aprobado" al insertarlo (lo decide el trigger, no la función)', () => {
    const fn = window_(MIG_0240, 'create or replace function public.register_kid_income(', '\n$function$;')
    expect(fn).toContain("if v_income.status = 'aprobado' then")
  })
  it('decide_kid_wallet_transaction rechaza a cualquier "child", y solo decide filas realmente pendientes (protección contra decidir dos veces)', () => {
    const fn = window_(MIG_0240, 'create or replace function public.decide_kid_wallet_transaction(', '\n$function$;')
    expect(fn).toContain("if v_role = 'child' then")
    expect(fn).toContain("raise exception 'not_authorized';")
    expect(fn).toContain("and status = 'pendiente'")
  })
})

describe('data/finance.ts — decideKidWalletTransaction pasa por el RPC, nunca un update directo', () => {
  it('llama a supabase.rpc("decide_kid_wallet_transaction")', () => {
    const fn = window_(DATA_FINANCE, 'export async function decideKidWalletTransaction(', '\n}')
    expect(fn).toContain("supabase.rpc('decide_kid_wallet_transaction'")
  })
})

describe('KidsFinanceTab — pendientes de aprobar visibles para el adulto, nunca para decidir su propia operación', () => {
  const tab = window_(FS, 'export function KidsFinanceTab({', '\n// Pequeños Grandes, Fase 10')

  it('pendingTransactions se calcula sobre TODOS los niños, no solo el activo en los chips', () => {
    expect(tab).toContain("const pendingTransactions = transactions.filter((t) => t.status === 'pendiente')")
  })
  it('el aviso de pendientes solo se muestra a un adulto (isAdult)', () => {
    expect(tab).toContain('{isAdult && pendingTransactions.length > 0 && (')
  })
  it('aprobar/rechazar llama a decideKidWalletTransaction, nunca a un update directo desde la UI', () => {
    expect(tab).toContain('async function decide(id: string, approved: boolean) {')
    expect(tab).toContain('await decideKidWalletTransaction(id, approved)')
  })
  it('un movimiento pendiente se enseña con su aviso y sin contar para el saldo (walletBalance ya filtra por aprobado en el dominio)', () => {
    expect(tab).toContain("t.status === 'pendiente' && <p className=\"muted\">⏳ Pendiente de que un adulto lo apruebe")
  })
  it('AddTransactionForm recibe needsApproval solo para ingreso/gasto y solo cuando quien registra NO es adulto', () => {
    expect(tab).toContain("needsApproval={!isAdult && (openCard === 'ingreso' || openCard === 'gasto')}")
  })
})

describe('AddTransactionForm — conceptos con emoji (Fase 9) + aviso de aprobación (Fase 8)', () => {
  // Última función del archivo — sin otra función después que sirva de marcador de cierre.
  const fullForm = FS.slice(FS.indexOf('function AddTransactionForm({'))

  it('usa conceptsForWalletType (dominio puro) — nunca reinventa el catálogo en la UI', () => {
    expect(fullForm).toContain('const concepts = conceptsForWalletType(type)')
    expect(fullForm).toContain('onClick={() => setDescription(`${c.emoji} ${c.label}`)}')
  })
  it('tocar un chip solo rellena la descripción — sigue siendo un <input> editable, nunca de solo lectura', () => {
    expect(fullForm).toContain('<input type="text" value={description} onChange={(e) => setDescription(e.target.value)} required />')
  })
  it('needsApproval avisa ANTES de guardar y confirma después, nunca dice "Registrado" sin más', () => {
    expect(fullForm).toContain('Un adulto tendrá que aprobarlo antes de que cuente.')
    expect(fullForm).toContain('⏳ Enviado — espera a que un adulto lo apruebe.')
  })
})

describe('Migración 0241 — objetivos con emoji/foto (Fase 10) y fondo común de impuestos (Fase 11)', () => {
  it('kid_goals gana emoji y foto, ambas opcionales (null), ningún objetivo existente pierde nada', () => {
    expect(MIG_0241).toContain('alter table kid_goals add column emoji text null')
    expect(MIG_0241).toContain('alter table kid_goals add column photo_storage_path text null')
  })
  it('family_tax_fund_expenses: select abierto a toda la familia, insert/delete solo para adultos', () => {
    const select = window_(MIG_0241, 'create policy "family_tax_fund_expenses: family select" on family_tax_fund_expenses', ';')
    expect(select).not.toContain("current_role_in_family())) <> 'child'")
    const insert = window_(MIG_0241, 'create policy "family_tax_fund_expenses: adult write" on family_tax_fund_expenses', ';')
    expect(insert).toContain("(select private.current_role_in_family()) <> 'child'")
  })
})

describe('GoalCard — emoji o foto, nunca los dos esperados a la vez pero ambos opcionales', () => {
  const card = window_(FS, 'function GoalCard({', '\n// Pequeños Grandes, Fase 11')
  it('la foto manda si existe; si no, el emoji; si no hay ninguno, la tarjeta se ve igual que siempre (solo título)', () => {
    expect(card).toContain('photoUrl ? (')
    expect(card).toContain(': goal.emoji ? (')
  })
})

describe('TaxFundSection — transparencia para toda la familia, gastar es cosa de adultos', () => {
  const section = window_(FS, 'function TaxFundSection({', '\nfunction AddTaxFundExpenseForm(')
  it('muestra aportado/gastado/disponible con las funciones puras del dominio', () => {
    expect(section).toContain('const contributed = taxFundContributed(transactions)')
    expect(section).toContain('const spent = taxFundSpent(expenses)')
    expect(section).toContain('const available = taxFundAvailable(transactions, expenses)')
  })
  it('"+ Gasto del fondo común" y borrar un gasto solo están disponibles para isAdult', () => {
    expect(section).toContain('{isAdult && (')
    expect(section).toContain('{isAdult && <ConfirmIconButton')
  })
})

describe('OtrosDecoracionBlock — zonas con "combinación": qué se contrata vs. qué hace la familia (Parte G5)', () => {
  const EVENTOS = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']
  const block = window_(EVENTOS, 'function OtrosDecoracionBlock({', '\nfunction ')

  it('el desglose por zona solo se muestra cuando la organización es "combinación"', () => {
    expect(block).toContain("organizacion?.choice === 'combinacion' && zonas && zonas.selected.length > 0 && (")
  })
  it('cada zona tiene sus dos opciones (contratada/nosotros), guardadas dentro de la misma decisión (assignacion), nunca una fila nueva', () => {
    expect(block).toContain("onClick={() => void saveZonas({ ...zonas, assignacion: { ...zonas.assignacion, [key]: option } })}")
  })
  it('usa decoracionZonasSinAsignar (dominio puro) para avisar de lo que falta, nunca reimplementa el cálculo en la UI', () => {
    expect(block).toContain('decoracionZonasSinAsignar(organizacion?.choice, zonas)')
  })
})
