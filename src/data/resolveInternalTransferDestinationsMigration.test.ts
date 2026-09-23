import { describe, expect, it } from 'vitest'

// Fase 1F.B — "Dinero destinado a cuentas de ahorro" (Resumen): resolve_internal_transfer_destinations
// (0161) resuelve la pata de SALIDA de un traspaso interno leyendo bank_transactions.raw->creditor_
// account->>iban (el IBAN destino que ya trae el banco, Enable Banking/PSD2) y cruzándolo contra
// bank_accounts.iban — nunca texto de tienda/etiqueta/nombre, nunca IA. Auditado contra datos reales de
// producción antes de aplicar (rehearsal BEGIN/ROLLBACK con un JWT simulado): devuelve exactamente los 7
// traspasos reales de Familia Hepburn, sin fuga entre familias pese a que el mismo IBAN existe en más de
// una familia (cuentas de prueba que comparten banco real a propósito).
const FILES = import.meta.glob(
  ['/supabase/migrations/0161_resolve_internal_transfer_destinations.sql', '/supabase/rollbacks/0161_resolve_internal_transfer_destinations_down.sql'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0161_resolve_internal_transfer_destinations.sql']
const ROLLBACK = FILES['/supabase/rollbacks/0161_resolve_internal_transfer_destinations_down.sql']
const SQL = MIGRATION.replace(/--[^\n]*/g, '')

describe('0161 — resolve_internal_transfer_destinations', () => {
  it('resuelve por IBAN: creditor_account->>iban de bank_transactions.raw cruzado contra bank_accounts.iban', () => {
    expect(SQL).toContain(`dst.iban = (bt.raw -> 'creditor_account' ->> 'iban')`)
    expect(SQL).toContain(`(bt.raw -> 'creditor_account' ->> 'iban') is not null`)
  })

  it('nunca usa texto de tienda/descripción/etiqueta ni IA para identificar el destino', () => {
    expect(SQL).not.toMatch(/\bstore\b/)
    expect(SQL).not.toMatch(/\bdescription\b/)
    expect(SQL).not.toMatch(/\btag_id\b/)
    expect(SQL).not.toMatch(/gemini|ai_|openai/i)
  })

  it('solo salidas (DBIT) y solo con owner_member_id de la cuenta destino — nunca inventa un destinatario', () => {
    expect(SQL).toContain(`bt.credit_debit = 'DBIT'`)
    expect(SQL).toContain('dst.owner_member_id is not null')
  })

  it('SECURITY INVOKER, nunca DEFINER — reutiliza la RLS ya certificada de bank_transactions/bank_accounts/bank_connections/expenses en vez de reimplementarla', () => {
    expect(SQL).toContain('security invoker')
    expect(SQL).not.toContain('security definer')
  })

  it('exige explícitamente que el origen y el destino sean de la MISMA familia — cinturón y tirantes sobre la RLS, nunca una coincidencia de IBAN entre familias', () => {
    expect(SQL).toContain('dst_conn.family_id = src_conn.family_id')
  })

  it('nunca devuelve iban ni ningún otro campo del banco — solo expense_id/destination_member_id/amount/expense_date', () => {
    const returnsIdx = SQL.indexOf('returns table')
    const asIdx = SQL.indexOf('as $$')
    const signature = SQL.slice(returnsIdx, asIdx)
    expect(signature).toContain('expense_id uuid')
    expect(signature).toContain('destination_member_id uuid')
    expect(signature).toContain('amount numeric')
    expect(signature).toContain('expense_date date')
    expect(signature).not.toMatch(/\biban\b/)
  })

  it('distinct on (bt.id): como mucho una fila por transacción — nunca duplica un importe si dos bank_accounts compartieran IBAN', () => {
    expect(SQL).toContain('distinct on (bt.id)')
  })

  it('revoca de public/anon/authenticated y vuelve a conceder solo a authenticated — mismo patrón que el resto de funciones RPC del proyecto', () => {
    expect(SQL).toContain('revoke execute on function resolve_internal_transfer_destinations() from public, anon, authenticated')
    expect(SQL).toContain('grant execute on function resolve_internal_transfer_destinations() to authenticated')
  })

  it('nunca borra, actualiza ni recategoriza ningún dato existente — solo crea la función de lectura', () => {
    expect(SQL).not.toMatch(/\bdelete from\b|\bupdate expenses\b|\bupdate bank_transactions\b|\btruncate\b/i)
    expect(SQL).not.toMatch(/^\s*insert into/im)
  })

  it('el rollback elimina exactamente esta función, sin tocar ninguna tabla', () => {
    expect(ROLLBACK).toContain('drop function if exists resolve_internal_transfer_destinations()')
    expect(ROLLBACK).not.toMatch(/\bdrop table\b|\balter table\b/i)
  })
})

describe('interfaz: la capa de datos llama a la RPC tal cual, sin pedir/reenviar ningún IBAN', () => {
  it('listResolvedInternalTransferDestinations llama a la RPC y solo mapea los 4 campos que devuelve', () => {
    const APP = import.meta.glob('/src/data/finance.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const src = APP['/src/data/finance.ts']
    const fnIdx = src.indexOf('export async function listResolvedInternalTransferDestinations')
    expect(fnIdx).toBeGreaterThan(-1)
    const fnBody = src.slice(fnIdx, src.indexOf('\n}', fnIdx) + 2)
    expect(fnBody).toContain("supabase.rpc('resolve_internal_transfer_destinations')")
    expect(fnBody).toContain('expenseId: r.expense_id')
    expect(fnBody).toContain('destinationMemberId: r.destination_member_id')
    expect(fnBody).toContain('expenseDate: r.expense_date')
    expect(fnBody).not.toMatch(/\biban\b/i)
    expect(fnBody).toContain('if (error) throw error')
  })
})
