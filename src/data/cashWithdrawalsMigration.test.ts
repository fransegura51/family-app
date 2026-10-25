// Contrato de la migración PREPARADA 0318 (retiradas de efectivo). Se probó entera contra la base real dentro de una transacción REVERTIDA (reparto, exceso, doble
// asignación, deshacer por partes, entrada adoptada, aislamiento entre familias, movimientos bancarios intactos); aquí se fijan sus garantías para que ninguna
// edición futura las rompa sin querer. NO está aplicada en producción.
import { describe, expect, it } from 'vitest'

const FILES = import.meta.glob(['/supabase/pending-migrations/0318_cash_withdrawals.sql', '/supabase/migrations/0318_cash_withdrawals.sql', '/supabase/rollbacks/0318_cash_withdrawals_down.sql'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const UP = Object.entries(FILES).find(([k]) => k.endsWith('0318_cash_withdrawals.sql'))?.[1] as string
const DOWN = Object.entries(FILES).find(([k]) => k.endsWith('0318_cash_withdrawals_down.sql'))?.[1] as string
const code = (sql: string) => sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n')

describe('migración 0318 · retiradas de efectivo', () => {
  it('existe con su reversión', () => {
    expect(UP).toBeTruthy()
    expect(DOWN).toBeTruthy()
  })

  it('los delimitadores $$ están emparejados y cada función se cierra con «$$;»', () => {
    for (const sql of [UP, DOWN]) {
      expect((code(sql).match(/\$\$/g) ?? []).length % 2).toBe(0)
      const opens = (code(sql).match(/\bas \$\$/g) ?? []).length
      const closes = code(sql).split('\n').filter((l) => /^\$\$;?\s*$/.test(l)).length
      expect(closes).toBe(opens)
    }
  })

  it('no toca el movimiento bancario original ni la sincronización: nada escribe en bank_transactions ni borra gastos', () => {
    const c = code(UP)
    expect(c).not.toMatch(/(insert into|update|delete from|alter table|truncate)\s+public\.bank_(transactions|accounts|connections)/i)
    expect(c).not.toMatch(/delete from public\.expenses/i)
    expect(c).not.toMatch(/drop table|truncate/i)
  })

  it('añade «Retirada de efectivo» dentro de «Movimientos internos» (catálogo + familias), sin duplicar si ya existe', () => {
    expect(UP).toContain("'g.movimientos_internos.retirada_efectivo'")
    expect(UP).toContain("'Retirada de efectivo'")
    expect(UP).toContain("p.catalog_key = 'g.movimientos_internos'")
    expect(UP).toMatch(/not exists \(select 1 from public\.catalog_categories where key = 'g\.movimientos_internos\.retirada_efectivo'\)/)
    expect(UP).toMatch(/not exists \(select 1 from public\.budget_categories c where c\.family_id = p\.family_id and c\.catalog_key = 'g\.movimientos_internos\.retirada_efectivo'\)/)
  })

  it('una retirada puede repartirse entre varias carteras, pero la misma cartera solo una vez', () => {
    expect(UP).toContain('on public.cash_movements (expense_id, wallet_id)')
    expect(UP).toContain('una cartera solo puede aparecer una vez')
  })

  it('la suma del reparto nunca supera lo retirado y la parte sin asignar se devuelve explícitamente', () => {
    expect(UP).toMatch(/if v_sum > v_exp\.amount \+ 0\.001 then raise exception/)
    expect(UP).toContain('return round(v_exp.amount - v_sum, 2)')
  })

  it('todo o nada: primero se valida cada parte y después se inserta', () => {
    const fn = UP.slice(UP.indexOf('function public.cash_assign_withdrawal'), UP.indexOf('function public.cash_adopt_entry_as_withdrawal'))
    expect(fn.indexOf('raise exception')).toBeLessThan(fn.indexOf('insert into public.cash_movements'))
    expect(fn.indexOf('v_sum > v_exp.amount')).toBeLessThan(fn.indexOf('insert into public.cash_movements'))
  })

  it('una entrada ya apuntada a mano se vincula (no se crea otra) y solo si importe y fecha coinciden', () => {
    expect(UP).toContain("v_m.kind <> 'in' or v_m.expense_id is not null or v_m.adopted_from is not null")
    expect(UP).toContain('abs(v_m.amount - v_exp.amount) > 0.01 or abs(v_m.occurred_on - v_exp.expense_date) > 7')
    expect(UP).toMatch(/update public\.cash_movements\s+set kind = 'transfer_in', expense_id = p_expense/)
    const adopt = UP.slice(UP.indexOf('function public.cash_adopt_entry_as_withdrawal'), UP.indexOf('function public.cash_unlink_bank_expense'))
    expect(adopt).not.toContain('insert into public.cash_movements')
  })

  it('desvincular: una entrada adoptada vuelve a ser entrada (el saldo no cambia) y la categoría solo se restaura cuando no queda ninguna parte', () => {
    const fn = UP.slice(UP.indexOf('function public.cash_unlink_bank_expense'))
    expect(fn).toContain('if v_m.adopted_from is not null then')
    expect(fn).toContain('set kind = v_m.adopted_from, expense_id = null')
    expect(fn).toMatch(/if not exists \(select 1 from public\.cash_movements m where m\.expense_id = v_m\.expense_id/)
  })

  it('aislamiento y permisos: todo pasa por la familia de quien llama, acceso a «dinero» y cartera escribible; sin permisos públicos', () => {
    for (const name of ['cash_assign_withdrawal', 'cash_adopt_entry_as_withdrawal']) {
      const fn = UP.slice(UP.indexOf(`function public.${name}`), UP.indexOf(`function public.${name}`) + 1800)
      expect(fn).toContain("private.has_section_access('dinero')")
      expect(fn).toContain('private.current_family_id()')
      expect(fn).toContain('private.expense_touchable(p_expense)')
    }
    expect(UP).toContain('private.cash_wallet_writable(v_wallet)')
    expect(UP).toContain('private.cash_wallet_writable(v_m.wallet_id)')
    expect(UP).toMatch(/revoke all on function public\.cash_assign_withdrawal\(uuid, jsonb\)[^;]*from public, anon;/)
  })

  it('la reversión devuelve las entradas adoptadas y no borra categorías en uso', () => {
    expect(DOWN).toContain('where adopted_from is not null')
    expect(DOWN).toMatch(/delete from public\.budget_categories[\s\S]*not exists \(select 1 from public\.expenses e where e\.family_id = c\.family_id and e\.category = c\.name\)/)
    expect(DOWN).toContain('create unique index cash_movements_bank_transfer_uidx on public.cash_movements (expense_id)')
  })
})
