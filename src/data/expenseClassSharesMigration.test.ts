// Contrato de la migración 0332 (reparto de un gasto entre varias clasificaciones de Compras, CLASIF-1). Se ensaya entera en una transacción REVERTIDA sobre la base real
// antes de aplicarla; aquí se fijan sus garantías (misma forma que 0322, etiquetas con reparto).
import { describe, expect, it } from 'vitest'

const FILES = import.meta.glob(['/supabase/pending-migrations/0332_expense_class_shares.sql', '/supabase/migrations/0332_expense_class_shares.sql', '/supabase/rollbacks/0332_expense_class_shares_down.sql'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const UP = Object.entries(FILES).find(([k]) => k.endsWith('0332_expense_class_shares.sql'))?.[1] as string
const DOWN = Object.entries(FILES).find(([k]) => k.endsWith('0332_expense_class_shares_down.sql'))?.[1] as string
const code = (sql: string) => sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n')

describe('migración 0332 · clasificaciones con reparto', () => {
  it('existe con su reversión y los delimitadores $$ están emparejados', () => {
    expect(UP).toBeTruthy()
    expect(DOWN).toBeTruthy()
    for (const sql of [UP, DOWN]) expect((code(sql).match(/\$\$/g) ?? []).length % 2).toBe(0)
  })

  it('es aditiva: no borra ni altera datos, no reclasifica el histórico y no toca políticas de otras tablas', () => {
    const c = code(UP)
    expect(c).not.toMatch(/drop table|truncate|alter table public\.expenses/i)
    expect(c).not.toMatch(/update public\.expenses set product_classification = null\s*;/i)
    expect(c).not.toMatch(/create policy[^;]*on public\.(expenses|family_food_types)\b/i)
    // el único borrado de un gasto es el del apunte duplicado del banco al vincular (ya existía en 0318/0322)
    expect(c.match(/delete from public\.expenses/gi)).toHaveLength(1)
  })

  it('la tabla de reparto cae con el gasto y se lee con la visibilidad del propio gasto (RLS); nadie escribe directamente', () => {
    expect(UP).toContain('references public.expenses(id) on delete cascade')
    expect(UP).toContain('alter table public.expense_class_shares enable row level security')
    expect(UP).toMatch(/using \(family_id = \(select private\.current_family_id\(\)\) and exists \(select 1 from public\.expenses e where e\.id = expense_id\)\)/)
    expect(UP).toContain('revoke all on public.expense_class_shares from public, anon, authenticated;')
    expect(UP).toContain('grant select on public.expense_class_shares to authenticated;')
    expect(UP).toContain('revoke all on public.expense_class_shares_archive from public, anon, authenticated;')
  })

  it('set_expense_classes valida todo antes de escribir: acceso, gasto tocable, clasificaciones de la familia, sin repetidas, suma exacta y sin ticket clasificado', () => {
    const fn = UP.slice(UP.indexOf('function public.set_expense_classes'), UP.indexOf('function private.expense_class_shares_sync'))
    expect(fn).toContain("private.has_section_access('dinero')")
    expect(fn).toContain('private.expense_touchable(p_expense)')
    expect(fn).toContain('t.family_id = v_family and t.name = v_name')
    expect(fn).toContain('una clasificación solo puede aparecer una vez')
    expect(fn).toContain('round(v_sum * 100) <> round(v_exp.amount * 100)')
    // un ticket con productos clasificados manda: no se admite el reparto manual (no se cuenta dos veces)
    expect(fn).toContain('join public.product_prices pr on pr.receipt_id = r.id where r.expense_id = p_expense')
    expect(fn.indexOf('no suma el importe')).toBeLessThan(fn.indexOf('insert into public.expense_class_shares'))
    expect(fn.indexOf('ya tiene sus productos clasificados')).toBeLessThan(fn.indexOf('insert into public.expense_class_shares'))
    // una sola clasificación no crea filas de reparto; la principal es la de mayor parte
    expect(fn).toContain('if v_n >= 2 then')
    expect(fn).toContain('if v_amount > v_main_amount then')
    expect(fn).toContain('product_classification = case when v_n = 0 then null else v_main end')
  })

  it('si el importe cambia por otra vía el reparto se reescala (suma exacta); si cambia la clasificación única manda esa y el reparto se retira', () => {
    const fn = UP.slice(UP.indexOf('function private.expense_class_shares_sync'), UP.indexOf('drop trigger if exists expense_class_shares_sync'))
    expect(fn).toContain('if old.product_classification is distinct from new.product_classification then')
    expect(fn).toContain('delete from public.expense_class_shares where expense_id = new.id;')
    expect(fn).toContain('v_new_cents - v_assigned')
    expect(UP).toContain('when (old.amount is distinct from new.amount or old.product_classification is distinct from new.product_classification)')
    // el propio RPC no dispara el reescalado ni el borrado
    expect(UP).toContain("coalesce(current_setting('pepa.class_shares_rpc', true), '0') = '1'")
  })

  it('borrar un gasto guarda su reparto y volver a insertarlo (Deshacer) lo recupera solo si sigue sumando', () => {
    expect(UP).toContain('before delete on public.expenses')
    expect(UP).toContain('after insert on public.expenses')
    expect(UP).toContain('<> round(new.amount * 100)')
  })

  it('vincular compra ↔ cargo del banco: mantiene lo de 0322 (etiquetas) y añade que el reparto de clasificaciones pasa a la compra solo si ella no tenía clasificación ni reparto ni ticket clasificado y el importe coincide al céntimo', () => {
    const fn = UP.slice(UP.indexOf('function public.link_purchase_to_bank_expense'))
    expect(fn).toContain('v_keep.tag_id is null') // lo de 0322 se conserva
    expect(fn).toContain('insert into public.expense_tag_shares')
    expect(fn).toContain('v_keep.product_classification is null')
    expect(fn).toContain('not exists (select 1 from public.expense_class_shares s where s.expense_id = p_purchase_expense)')
    expect(fn).toContain('not exists (select 1 from public.receipts r join public.product_prices pr on pr.receipt_id = r.id where r.expense_id = p_purchase_expense)')
    expect(fn).toContain('insert into public.expense_class_shares')
    expect(fn).not.toMatch(/delete from public\.bank_transactions|insert into public\.expenses/)
  })

  it('la reversión quita lo nuevo y vuelve a la versión de 0322 de vincular', () => {
    expect(DOWN).toContain('drop table if exists public.expense_class_shares;')
    expect(DOWN).toContain('drop function if exists public.set_expense_classes(uuid, jsonb);')
    expect(DOWN).toContain('create or replace function public.link_purchase_to_bank_expense(')
    expect(DOWN).toContain('insert into public.expense_tag_shares') // versión de 0322
    expect(DOWN).not.toContain('expense_class_shares s')
  })
})
