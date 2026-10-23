// Contrato de las migraciones PREPARADAS 0309 (compras manuales) y 0310 (equivalencias de productos). Están en supabase/pending-migrations hasta
// que se autorice aplicarlas. Su comportamiento real (con la base de datos de producción, dentro de una transacción revertida) está en
// docs/PEPA_CONTROL_REQUISITOS.md (COM-1 y COMP-1); aquí se fijan sus reglas de seguridad para que no se deshagan sin querer.
import { describe, expect, it } from 'vitest'
import receiptsSource from '../ui/FinanceScreen.tsx?raw'

const FILES = import.meta.glob(
  ['/supabase/pending-migrations/0309_manual_purchases.sql', '/supabase/pending-migrations/0310_product_equivalences.sql', '/supabase/rollbacks/0309_manual_purchases_down.sql', '/supabase/rollbacks/0310_product_equivalences_down.sql'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>
const M0309 = FILES['/supabase/pending-migrations/0309_manual_purchases.sql']
const M0310 = FILES['/supabase/pending-migrations/0310_product_equivalences.sql']
const D0309 = FILES['/supabase/rollbacks/0309_manual_purchases_down.sql']
const D0310 = FILES['/supabase/rollbacks/0310_product_equivalences_down.sql']

describe('0309 — compras manuales', () => {
  it('es aditiva: solo añade columnas, una restricción y un disparador; no borra ni reescribe datos', () => {
    expect(M0309).toContain('add column is_manual boolean not null default false')
    expect(M0309).toContain('add column payment_method text')
    expect(M0309).not.toMatch(/\b(drop|truncate|delete from)\b/i)
    expect(M0309).not.toMatch(/\bupdate\s+public\./i)
  })
  it('las formas de pago son una lista cerrada', () => {
    expect(M0309).toContain("payment_method in ('efectivo', 'tarjeta', 'bizum', 'transferencia', 'otro')")
  })
  it('quien pagó debe ser de la misma familia que la compra (aislamiento)', () => {
    expect(M0309).toContain('m.family_id = new.family_id')
    expect(M0309).toContain('revoke all on function public.receipts_check_purchaser_family()')
  })
  it('tiene reversión', () => {
    expect(D0309).toContain('drop column if exists is_manual')
    expect(D0309).toContain('drop column if exists payment_method')
  })
})

describe('0310 — equivalencias de productos', () => {
  it('las decisiones de la familia son privadas: RLS por family_id y productos de la misma familia', () => {
    expect(M0310).toContain('alter table public.product_equivalences enable row level security')
    expect(M0310).toContain('family_id = (select private.current_family_id())')
    expect(M0310).toContain('p.family_id = new.family_id')
  })
  it('lo compartido son solo nombres normalizados y un hash; sin precios, tiendas, fechas ni compras', () => {
    const shared = M0310.slice(M0310.indexOf('create table public.shared_equivalence_votes'), M0310.indexOf('create or replace function public.product_equivalences_vote'))
    expect(shared).toContain('family_hash text not null')
    expect(shared).not.toMatch(/family_id|price|store|receipt|quantity|date\b/i)
    expect(M0310).toContain('revoke all on public.shared_equivalence_votes from public, anon, authenticated')
  })
  it('la RPC devuelve solo (key_a, key_b, level): ni votos, ni familias, ni cuántas', () => {
    expect(M0310).toContain('returns table (key_a text, key_b text, level text)')
    expect(M0310).not.toMatch(/returns table[^)]*family_hash/)
  })
  it('tres niveles: provisional (1 familia), validada (2+ sin objeción), bloqueada (discrepancia)', () => {
    expect(M0310).toContain("when a.df >= 2 or (a.df >= 1 and a.eq >= 1) then 'blocked'")
    expect(M0310).toContain("when a.eq >= 2 then 'validated'")
    expect(M0310).toContain("else 'provisional'")
  })
  it('un solo «no» de una familia no bloquea a las demás', () => {
    expect(M0310).toContain('where a.eq >= 1 or a.df >= 2')
  })
  it('solo se comparten textos que pasan la validación de privacidad de CAT-1', () => {
    expect(M0310).toContain('public.shared_text_key_ok(v_a) and public.shared_text_key_ok(v_b)')
  })
  it('tiene reversión y no toca productos ni precios', () => {
    expect(D0310).toContain('drop table if exists public.product_equivalences')
    expect(M0310).not.toMatch(/\b(delete from|update)\s+public\.(products|product_prices|receipts|expenses)/i)
  })
})

describe('compras manuales y tickets comparten el mismo camino de productos y precios', () => {
  it('guardar una compra con productos (con o sin ticket) usa saveLines → recordProductPurchase, el mismo que alimenta Historial y el comparador', () => {
    const submit = receiptsSource.slice(receiptsSource.indexOf('async function handleSubmit(e: FormEvent)'))
    const addBranch = submit.slice(0, submit.indexOf('} else if (receipt) {'))
    expect(addBranch).toContain('await saveLines(receiptId)')
    expect(addBranch).toContain('isManual: noTicket')
    expect(receiptsSource).toContain('const { productId } = await recordProductPurchase({')
  })
  it('el justificante posterior reutiliza la misma compra: attachReceiptFile y no uploadReceipt', () => {
    const submit = receiptsSource.slice(receiptsSource.indexOf('async function handleSubmit(e: FormEvent)'))
    const attach = submit.slice(submit.indexOf('if (mode === \'add\' && attachTo)'), submit.indexOf('} else if (mode === \'add\') {'))
    expect(attach).toContain('attachReceiptFile(attachTo.id, file!)')
    expect(attach).not.toContain('uploadReceipt(')
  })
})
