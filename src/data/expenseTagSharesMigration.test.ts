// Contrato de la migración 0322 (APLICADA en producción el 26/10/2026) (varias etiquetas por movimiento con reparto, ETQ-1). Se ensayó entera en una transacción REVERTIDA sobre la base real
// (reparto de 3 etiquetas, suma incorrecta rechazada, etiqueta repetida/ajena rechazada, cambio de importe reescala, cambio de etiqueta única retira el reparto,
// borrar + volver a insertar recupera el reparto, aislamiento entre familias, vincular compra ↔ cargo con reparto y Deshacer); aquí se fijan sus garantías.
import { describe, expect, it } from 'vitest'

const FILES = import.meta.glob(['/supabase/pending-migrations/0322_expense_tag_shares.sql', '/supabase/migrations/0322_expense_tag_shares.sql', '/supabase/rollbacks/0322_expense_tag_shares_down.sql'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const UP = Object.entries(FILES).find(([k]) => k.endsWith('0322_expense_tag_shares.sql'))?.[1] as string
const DOWN = Object.entries(FILES).find(([k]) => k.endsWith('0322_expense_tag_shares_down.sql'))?.[1] as string
const code = (sql: string) => sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n')

describe('migración 0322 · etiquetas con reparto', () => {
  it('existe con su reversión', () => {
    expect(UP).toBeTruthy()
    expect(DOWN).toBeTruthy()
  })

  it('los delimitadores $$ están emparejados', () => {
    for (const sql of [UP, DOWN]) expect((code(sql).match(/\$\$/g) ?? []).length % 2).toBe(0)
  })

  it('es aditiva: no borra ni altera datos existentes, no toca políticas de otras tablas y las etiquetas actuales se conservan (tag_id sigue siendo la principal)', () => {
    const c = code(UP)
    expect(c).not.toMatch(/drop table|truncate|alter table public\.(expenses|tags)\s+(drop|alter)/i)
    expect(c).not.toMatch(/delete from public\.(tags|bank_transactions)/i)
    // el único borrado de un gasto es el del apunte duplicado del banco al vincular (ya existía en 0318)
    expect(c.match(/delete from public\.expenses/gi)).toHaveLength(1)
    expect(c).not.toMatch(/create policy[^;]*on public\.(expenses|tags)\b/i)
    expect(c).not.toMatch(/update public\.expenses set tag_id = null\s*;/i)
  })

  it('la tabla de reparto cae con el movimiento o la etiqueta y se lee con la visibilidad del propio movimiento (RLS)', () => {
    expect(UP).toContain('references public.expenses(id) on delete cascade')
    expect(UP).toContain('references public.tags(id) on delete cascade')
    expect(UP).toContain('alter table public.expense_tag_shares enable row level security')
    expect(UP).toMatch(/using \(family_id = \(select private\.current_family_id\(\)\) and exists \(select 1 from public\.expenses e where e\.id = expense_id\)\)/)
    // nadie escribe directamente: solo select a authenticated
    expect(UP).toContain('revoke all on public.expense_tag_shares from public, anon, authenticated;')
    expect(UP).toContain('grant select on public.expense_tag_shares to authenticated;')
  })

  it('set_expense_tags valida todo antes de escribir: acceso, movimiento tocable, etiquetas de la familia, sin repetidas y suma exacta al céntimo', () => {
    const fn = UP.slice(UP.indexOf('function public.set_expense_tags'), UP.indexOf('function private.expense_tag_shares_sync'))
    expect(fn).toContain("private.has_section_access('dinero')")
    expect(fn).toContain('private.expense_touchable(p_expense)')
    expect(fn).toContain('t.family_id = v_family')
    expect(fn).toContain('una etiqueta solo puede aparecer una vez')
    expect(fn).toContain('round(v_sum * 100) <> round(v_exp.amount * 100)')
    expect(fn.indexOf('no suma el importe')).toBeLessThan(fn.indexOf('insert into public.expense_tag_shares'))
    // una sola etiqueta no crea filas de reparto; la principal es la de mayor parte
    expect(fn).toContain('if v_n >= 2 then')
    expect(fn).toContain('if v_amount > v_main_amount then')
  })

  it('si el importe cambia por otra vía el reparto se reescala (suma exacta); si cambia la etiqueta única manda esa y el reparto se retira', () => {
    const fn = UP.slice(UP.indexOf('function private.expense_tag_shares_sync'), UP.indexOf('drop trigger if exists expense_tag_shares_sync'))
    expect(fn).toContain('if old.tag_id is distinct from new.tag_id then')
    expect(fn).toContain('delete from public.expense_tag_shares where expense_id = new.id;')
    expect(fn).toContain('v_new_cents - v_assigned')
    expect(UP).toContain('when (old.amount is distinct from new.amount or old.tag_id is distinct from new.tag_id)')
  })

  it('borrar un movimiento guarda su reparto y volver a insertarlo (Deshacer) lo recupera solo si sigue sumando', () => {
    expect(UP).toContain('before delete on public.expenses')
    expect(UP).toContain('after insert on public.expenses')
    expect(UP).toContain('<> round(new.amount * 100)')
  })

  it('vincular compra ↔ cargo del banco: el reparto del cargo pasa a la compra solo si ella no tenía etiqueta ni reparto y el importe coincide al céntimo', () => {
    const fn = UP.slice(UP.indexOf('function public.link_purchase_to_bank_expense'))
    expect(fn).toContain('v_keep.tag_id is null')
    expect(fn).toContain('round(v_bank.amount * 100) = round(v_keep.amount * 100)')
    expect(fn).toContain('tag_id = coalesce(tag_id, v_bank.tag_id)') // lo de 0318 se conserva
    expect(fn).not.toMatch(/delete from public\.bank_transactions|insert into public\.expenses/)
  })

  it('la reversión quita lo nuevo y vuelve a la versión de 0318 de vincular', () => {
    expect(DOWN).toContain('drop table if exists public.expense_tag_shares;')
    expect(DOWN).toContain('drop function if exists public.set_expense_tags(uuid, jsonb);')
    expect(DOWN).toContain('create or replace function public.link_purchase_to_bank_expense(')
    expect(DOWN).not.toContain('expense_tag_shares s')
  })
})
