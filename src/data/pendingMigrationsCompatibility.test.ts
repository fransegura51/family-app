// Compatibilidad de las migraciones PREPARADAS 0310 → 0311 → 0312 entre sí y con las ya aplicadas (≤ 0308). Se aplican en ese orden; 0311 y 0312
// son independientes entre sí, pero 0312 necesita 0310. Ninguna comparte nombres de objetos y todas se pueden revertir en orden inverso.
import { describe, expect, it } from 'vitest'

const ALL = import.meta.glob(
  [
    '/supabase/pending-migrations/0310_manual_purchases.sql',
    '/supabase/pending-migrations/0311_product_equivalences.sql',
    '/supabase/pending-migrations/0312_cash_wallets_payments_refunds.sql',
    '/supabase/rollbacks/0310_manual_purchases_down.sql',
    '/supabase/rollbacks/0311_product_equivalences_down.sql',
    '/supabase/rollbacks/0312_cash_wallets_payments_refunds_down.sql',
    '/supabase/migrations/0308_shared_learning_all_stores.sql',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>
const get = (name: string) => ALL[Object.keys(ALL).find((k) => k.endsWith(name)) as string]
const M = { m0308: get('0308_shared_learning_all_stores.sql'), m0309: get('0310_manual_purchases.sql'), m0310: get('0311_product_equivalences.sql'), m0311: get('0312_cash_wallets_payments_refunds.sql') }
const D = { d0309: get('0310_manual_purchases_down.sql'), d0310: get('0311_product_equivalences_down.sql'), d0311: get('0312_cash_wallets_payments_refunds_down.sql') }

function created(sql: string): string[] {
  const names: string[] = []
  for (const m of sql.matchAll(/create (?:or replace )?(?:table|view|function|trigger|index|unique index)\s+(?:if not exists\s+)?([a-z_.]+)/gi)) names.push(m[1].replace(/^public\./, ''))
  for (const m of sql.matchAll(/create policy "([^"]+)"/gi)) names.push(`policy:${m[1]}`)
  for (const m of sql.matchAll(/alter table public\.(\w+)\s+add column\s+(\w+)/gi)) names.push(`column:${m[1]}.${m[2]}`)
  return names
}

describe('orden y nombres', () => {
  it('ningún objeto se crea en dos migraciones distintas (salvo la restricción de forma de pago que 0312 sustituye a propósito)', () => {
    const seen = new Map<string, string>()
    const clashes: string[] = []
    for (const [name, sql] of Object.entries(M)) {
      for (const obj of created(sql)) {
        if (seen.has(obj) && seen.get(obj) !== name) clashes.push(`${obj}: ${seen.get(obj)} y ${name}`)
        seen.set(obj, name)
      }
    }
    expect(clashes).toEqual([])
  })
  it('0312 necesita 0310: sustituye su restricción receipts_payment_method_check, que 0310 crea', () => {
    expect(M.m0309).toContain('add constraint receipts_payment_method_check')
    expect(M.m0311).toContain('drop constraint if exists receipts_payment_method_check')
    expect(M.m0311).toContain("'otro', 'mixto'")
  })
  it('0312 y 0311 reutilizan funciones que 0308 ya dejó creadas (shared_family_hash, shared_text_key_ok) sin volver a definirlas', () => {
    expect(M.m0308).toContain('function public.shared_family_hash(')
    expect(M.m0308).toContain('function public.shared_text_key_ok(')
    expect(M.m0310).toContain('public.shared_family_hash(')
    expect(M.m0310).toContain('public.shared_text_key_ok(')
    expect(M.m0310).not.toMatch(/create or replace function public\.shared_(family_hash|text_key_ok)/)
  })
  it('0310 solo añade a receipts; 0311 a productos; 0312 a expenses/receipts y tablas nuevas: no se pisan', () => {
    expect(M.m0309.match(/alter table public\.(\w+)/g)?.map((x) => x.split('.')[1])).toEqual(['receipts', 'receipts', 'receipts'])
    expect(M.m0310).not.toMatch(/alter table public\.(receipts|expenses)/)
    expect(M.m0311).not.toMatch(/alter table public\.(products|product_equivalences)/)
  })
})

describe('reversión en orden inverso (0312 → 0311 → 0310)', () => {
  it('revertir 0312 deja receipts.payment_method exactamente como lo dejó 0310', () => {
    const originalList = M.m0309.match(/payment_method in \(([^)]*)\)/)?.[1].replace(/\s+/g, ' ')
    const restoredList = D.d0311.match(/payment_method in \(([^)]*)\)/)?.[1].replace(/\s+/g, ' ')
    expect(restoredList).toBe(originalList)
  })
  it('cada reversión borra los objetos de su migración y ninguno de las demás', () => {
    expect(D.d0311).not.toMatch(/product_equivalences|is_manual/)
    expect(D.d0310).not.toMatch(/cash_|purchase_payments|is_manual/)
    expect(D.d0309).not.toMatch(/cash_|product_equivalences|purchase_/)
  })
  it('0310 se revierte después de 0312 (0312 usa su columna payment_method)', () => {
    expect(D.d0309).toContain('drop column if exists payment_method')
    expect(D.d0311).toContain('receipts_payment_method_check')
  })
})
