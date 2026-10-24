// Contrato de la migración PREPARADA 0311 (efectivo, pagos mixtos, devoluciones, vínculo con el banco) y de los cambios PREPARADOS (sin desplegar) del
// sincronizador bancario. Su comportamiento real está probado contra la base de datos de producción dentro de una transacción REVERTIDA
// (docs/PEPA_CONTROL_REQUISITOS.md, EFE-1 y ECO-1). Aquí se fijan las reglas de seguridad para que no se deshagan sin querer.
import { describe, expect, it } from 'vitest'
import sync from '../../supabase/functions/enable-banking-sync-transactions/index.ts?raw'

const FILES = import.meta.glob(['/supabase/pending-migrations/0311_cash_wallets_payments_refunds.sql', '/supabase/rollbacks/0311_cash_wallets_payments_refunds_down.sql'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const UP = FILES['/supabase/pending-migrations/0311_cash_wallets_payments_refunds.sql']
const DOWN = FILES['/supabase/rollbacks/0311_cash_wallets_payments_refunds_down.sql']

describe('0311 — aditiva y reversible', () => {
  it('no borra ni reescribe datos existentes por sí misma; los borrados solo ocurren dentro de las funciones de borrado seguro', () => {
    expect(UP).not.toMatch(/\btruncate\b/i)
    expect(UP).not.toMatch(/\bdrop table\b/i)
    expect(UP).not.toMatch(/\bupdate\s+public\.(products|product_prices|bank_accounts|budgets)\b/i)
    // Los movimientos bancarios importados y las cuentas NO se borran en ningún sitio de la migración.
    expect(UP).not.toMatch(/\bdelete from\s+public\.(bank_transactions|bank_accounts|bank_connections|products|product_prices)\b/i)
    // Fuera de delete_purchase, remove_duplicate_expense, set_purchase_payments y link_purchase_to_bank_expense no se borran compras.
    const outside = UP.replace(/create or replace function public\.(delete_purchase|restore_economy_log|remove_duplicate_expense|set_purchase_payments|link_purchase_to_bank_expense|cash_unlink_bank_expense)[\s\S]*?\n\$\$;/g, '')
    expect(outside).not.toMatch(/\bdelete from\s+public\.(receipts|expenses)\b/i)
  })
  it('añade una columna nullable a expenses y no cambia ninguna otra', () => {
    expect(UP).toContain('alter table public.expenses add column payment_method text;')
    expect(UP.match(/alter table public\.expenses/g)?.length).toBe(2) // la columna y su restricción
  })
  it('tiene reversión que retira todo lo creado', () => {
    for (const t of ['cash_movements', 'cash_wallets', 'purchase_payments', 'purchase_refunds', 'purchase_duplicate_decisions']) expect(DOWN).toContain(`drop table if exists public.${t}`)
    for (const f of ['cash_transfer', 'cash_link_bank_expense', 'cash_unlink_bank_expense', 'set_purchase_payments', 'register_purchase_refund', 'link_purchase_to_bank_expense']) expect(DOWN).toContain(f)
  })
})

describe('0311 — seguridad y aislamiento', () => {
  it('RLS activada en todas las tablas nuevas', () => {
    for (const t of ['cash_wallets', 'cash_movements', 'purchase_payments', 'purchase_refunds', 'purchase_duplicate_decisions']) expect(UP).toContain(`alter table public.${t} enable row level security`)
  })
  it('las carteras respetan la sección «dinero» y el modo de cuentas igual que bank_accounts', () => {
    const policy = UP.slice(UP.indexOf('create policy "cash_wallets: select"'), UP.indexOf('create policy "cash_wallets: insert"'))
    expect(policy).toContain("has_section_access('dinero')")
    expect(policy).toContain("current_accounts_mode()) = 'compartido'")
    expect(policy).toContain('owner_member_id = (select private.current_member_id())')
  })
  it('una cartera personal solo la escribe su dueña; los movimientos gestionados (pagos, devoluciones, traspasos) no se borran a mano', () => {
    expect(UP).toContain("kind in ('in', 'out', 'adjust')")
    const del = UP.slice(UP.indexOf('create policy "cash_movements: delete manual"'), UP.indexOf('grant select, insert, update on public.cash_wallets'))
    expect(del).toContain("kind in ('in', 'out', 'adjust')")
    expect(del).not.toContain("'payment'")
  })
  it('las funciones que escriben varias filas comprueban permisos y familia explícitamente', () => {
    for (const fn of ['cash_transfer', 'cash_link_bank_expense', 'set_purchase_payments', 'register_purchase_refund', 'link_purchase_to_bank_expense']) {
      const body = UP.slice(UP.indexOf(`function public.${fn}(`), UP.indexOf('$$;', UP.indexOf(`function public.${fn}(`)))
      expect(body, fn).toContain('private.current_family_id()')
    }
    expect(UP).toContain('private.cash_wallet_writable(')
    expect(UP).toContain('private.expense_touchable(')
  })
  it('sin permisos públicos sobre las funciones: solo usuarios autenticados', () => {
    expect(UP).toContain('revoke all on function public.cash_transfer(uuid, uuid, numeric, date, text)')
    expect(UP).toMatch(/grant execute on function public\.cash_transfer[\s\S]*to authenticated;/)
    expect(UP).not.toMatch(/to anon/)
  })
  it('los datos de las familias no cruzan: cada tabla enlaza solo filas de la misma familia', () => {
    for (const g of ['cash_wallets_guard', 'cash_movements_guard', 'purchase_payments_guard']) expect(UP).toContain(g)
    expect(UP).toContain('m.family_id = new.family_id')
  })
})

describe('0311 — reglas económicas', () => {
  it('un traspaso son dos movimientos emparejados y no crea ingresos ni gastos', () => {
    const body = UP.slice(UP.indexOf('function public.cash_transfer('), UP.indexOf('$$;', UP.indexOf('function public.cash_transfer(')))
    expect(body).toContain("'transfer_out'")
    expect(body).toContain("'transfer_in'")
    expect(body).not.toMatch(/insert into public\.expenses/)
  })
  it('la retirada del banco reutiliza «Movimientos internos» (la categoría que ya excluye de gastos e ingresos)', () => {
    expect(UP).toContain("'g.movimientos_internos.transferencias_propias'")
    expect(UP).toContain("'i.movimientos_internos'")
  })
  it('un saldo puede quedar en negativo: no hay ninguna restricción de saldo mínimo', () => {
    expect(UP).not.toMatch(/balance\s*>=\s*0|saldo insuficiente/i)
  })
  it('pagos mixtos: la suma debe ser el total y la compra sigue teniendo un solo gasto', () => {
    const body = UP.slice(UP.indexOf('function public.set_purchase_payments('), UP.indexOf('$$;', UP.indexOf('function public.set_purchase_payments(')))
    expect(body).toContain('abs(v_sum - v_total) > 0.005')
    expect(body).not.toMatch(/insert into public\.expenses/)
    expect(body).toContain("'mixto'")
  })
  it('devoluciones: no superan lo pagado, usan la categoría estándar y no tocan el gasto original', () => {
    const body = UP.slice(UP.indexOf('function public.register_purchase_refund('), UP.indexOf('$$;', UP.indexOf('function public.register_purchase_refund(')))
    expect(body).toContain('p_amount > v_total - v_refunded + 0.005')
    expect(body).toContain("'i.ingreso.devoluciones'")
    expect(body).not.toMatch(/update public\.expenses/)
    expect(body).not.toMatch(/delete from/)
  })
  it('vincular con el banco exige importe coincidente, conserva el movimiento bancario y no retira apuntes con datos propios', () => {
    const body = UP.slice(UP.indexOf('function public.link_purchase_to_bank_expense('), UP.indexOf('$$;', UP.indexOf('function public.link_purchase_to_bank_expense(')))
    expect(body).toContain('abs(v_bank.amount - v_expected) > 0.01')
    expect(body).toContain('update public.bank_transactions set matched_expense_id')
    expect(body).toContain('public.purchase_refunds f where f.expense_id = p_bank_expense')
    expect(body).toContain("v_bank.source <> 'banco'")
  })
})

describe('sincronizador bancario (cambios preparados, sin desplegar)', () => {
  it('un gasto pagado en efectivo o mixto no es candidato a unirse a un cargo del banco', () => {
    expect(sync).toContain('.or("payment_method.is.null,payment_method.not.in.(efectivo,mixto)")')
    const candidates = sync.slice(sync.indexOf('.in("source", ["ticket", "manual"])'))
    expect(candidates.indexOf('payment_method.not.in.(efectivo,mixto)')).toBeLessThan(candidates.indexOf('.gte("expense_date"'))
  })
  it('la parte de tarjeta de un pago mixto se une a SU compra y nunca crea otro gasto; con más de una candidata no elige', () => {
    expect(sync).toContain('async function findPaymentLegMatch(')
    expect(sync).toContain('return inWindow.length === 1 ? inWindow[0] : null')
    const idx = sync.indexOf('const legMatch = await findPaymentLegMatch(')
    expect(sync.slice(idx, idx + 700)).toContain('continue')
  })
  it('la devolución registrada a mano se une al abono del banco (±14 días, una sola candidata, nunca en efectivo)', () => {
    expect(sync).toContain('async function findManualRefundMatch(')
    expect(sync).toContain('.or("payment_method.is.null,payment_method.neq.efectivo")')
    expect(sync).toContain('if (same.length !== 1) return null')
  })
  it('la regla de devolución explícita DEV-1 sigue sin hacer consultas (el vínculo va aparte, antes)', () => {
    const start = sync.indexOf('// DEVOLUCIONES (0311)')
    const dev1 = sync.indexOf('// FASE DEV-1 — devolución bancaria explícita')
    expect(start).toBeGreaterThan(0)
    expect(start).toBeLessThan(dev1)
  })
  it('la lógica antigua de unir tickets y gastos a mano con el cargo del banco sigue intacta para lo no pagado en efectivo', () => {
    expect(sync).toContain('.in("source", ["ticket", "manual"])')
    expect(sync).toContain('source: "ticket_banco"')
  })
})

describe('ECO-1j — borrar una compra sin dejar movimientos huérfanos', () => {
  const fn = (name: string) => UP.slice(UP.indexOf(`function public.${name}(`), UP.indexOf('$$;', UP.indexOf(`function public.${name}(`)))

  it('anota una foto ANTES de borrar nada y la guarda en un registro que los usuarios solo pueden leer', () => {
    const body = fn('delete_purchase')
    expect(body.indexOf('insert into public.purchase_audit_log')).toBeGreaterThan(0)
    expect(body.indexOf('insert into public.purchase_audit_log')).toBeLessThan(body.indexOf('delete from public.cash_movements'))
    expect(body.indexOf('insert into public.purchase_audit_log')).toBeLessThan(body.indexOf('delete from public.receipts'))
    expect(UP).toContain('alter table public.purchase_audit_log enable row level security')
    expect(UP).not.toMatch(/create policy "purchase_audit_log: (insert|update|delete)/)
    expect(UP).toContain('grant select on public.purchase_audit_log to authenticated')
    expect(UP).not.toMatch(/grant (insert|update|delete)[^;]*purchase_audit_log/)
  })

  it('las carteras quedan coherentes: se retiran los movimientos de pago y de devolución de esa compra, y solo esos', () => {
    const body = fn('delete_purchase')
    expect(body).toContain('m.payment_id in (select p.id from public.purchase_payments p where p.receipt_id = p_receipt) or m.expense_id = any (v_refund_exp_ids)')
    expect(body).toContain('delete from public.cash_movements where id = any (v_cash_ids)')
    expect(body).toContain('delete from public.expenses where id = any (v_refund_exp_ids)')
  })

  it('protege a las carteras de otras personas: exige poder escribir cada cartera afectada', () => {
    expect(fn('delete_purchase')).toContain('private.cash_wallet_writable(v_w)')
  })

  it('los movimientos bancarios originales NUNCA se borran: se re-apuntan a un apunte económico del banco recreado', () => {
    const body = fn('delete_purchase')
    expect(body).not.toMatch(/delete from public\.bank_transactions/)
    expect(body).toContain('update public.bank_transactions set matched_expense_id = v_new')
    expect(body).toContain("'banco'")
    expect(body).toContain('esta compra está enlazada al banco; hace falta acceso a Economía')
  })

  it('el saldo de una cartera nunca bloquea el borrado: no hay ninguna comprobación de saldo mínimo', () => {
    expect(fn('delete_purchase')).not.toMatch(/balance|saldo insuficiente/i)
  })

  it('se puede deshacer una sola vez, restaurando compra, gasto, pagos, devoluciones, carteras, líneas y vínculos bancarios', () => {
    const body = fn('restore_economy_log')
    expect(body).toContain("if v_l.restored_at is not null then raise exception 'restore_economy_log: ya se deshizo'")
    expect(body).toContain('for update')
    for (const t of ['expenses', 'receipts', 'purchase_payments', 'purchase_refunds', 'cash_movements', 'product_prices']) expect(body).toContain(`insert into public.${t} select * from jsonb_populate_record(null::public.${t}`)
    expect(body).toContain("(v_s -> 'receipt') || jsonb_build_object('storage_path', null)") // la foto no se recupera
    expect(body).toContain('w.archived_at is null') // una cartera archivada se omite y se cuenta
  })

  it('un registro solo lo puede deshacer su familia', () => {
    expect(fn('restore_economy_log')).toContain('l.family_id = v_family')
  })
})

describe('vincular y retirar duplicados: solo el registro económico, con anotación y deshacer', () => {
  const fn = (name: string) => UP.slice(UP.indexOf(`function public.${name}(`), UP.indexOf('$$;', UP.indexOf(`function public.${name}(`)))
  it('vincular con el banco devuelve el id de la anotación, conserva el movimiento bancario y solo retira el apunte económico duplicado', () => {
    const body = fn('link_purchase_to_bank_expense')
    expect(UP).toContain('returns uuid')
    expect(body).toContain("'bank_expense_merged'")
    expect(body).toContain('insert into public.purchase_audit_log')
    expect(body).not.toMatch(/delete from public\.bank_transactions/)
    expect(body).toContain('delete from public.expenses where id = p_bank_expense')
  })
  it('retirar un duplicado: nunca un apunte del banco ni uno con datos enlazados', () => {
    const body = fn('remove_duplicate_expense')
    expect(body).toContain("v_rm.source not in ('manual', 'ticket')")
    expect(body).toContain('select 1 from public.bank_transactions bt where bt.matched_expense_id = p_remove')
    expect(body).toContain("'duplicate_removed'")
  })
})
