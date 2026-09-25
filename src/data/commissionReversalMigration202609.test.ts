import { describe, expect, it } from 'vitest'

// FASE CA-4 — corrección histórica puntual de la pareja comisión+bonificación del 24/09/2026 (Familia
// Hepburn), igual que 0152 hizo para la del 24/06/2026. Mismo motivo de fondo: la Fase CA-1 solo detecta
// automáticamente movimientos NUEVOS (matched_expense_id IS NULL) — esta pareja ya estaba sincronizada, así
// que no la toca. Ver informe de la fase para la verificación previa/posterior real contra producción.
const FILES = import.meta.glob(
  ['/supabase/migrations/0167_reclassify_commission_reversal_pair_202609.sql', '/supabase/rollbacks/0167_reclassify_commission_reversal_pair_202609_down.sql'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0167_reclassify_commission_reversal_pair_202609.sql']
const ROLLBACK = FILES['/supabase/rollbacks/0167_reclassify_commission_reversal_pair_202609_down.sql']
const SQL = MIGRATION.replace(/--[^\n]*/g, '')
const ROLLBACK_SQL = ROLLBACK.replace(/--[^\n]*/g, '')
const CHARGE = '9d2747d2-9857-4f50-9728-34a4141039aa'
const BONUS = 'df534f42-198c-445b-9d61-bdc734faf56c'

describe('localiza el cargo y la bonificación exactos, por id, con importe/signo/categoría inicial reales', () => {
  it('ids, cuenta e importes exactos', () => {
    expect(SQL).toContain(`c_charge constant uuid := '${CHARGE}'`)
    expect(SQL).toContain(`c_bonus constant uuid := '${BONUS}'`)
    expect(SQL).toContain("c_account constant uuid := 'e1cab8aa-9209-40cf-ab66-b85fc5afba1c'")
    expect(SQL).toContain("c_cobro_anulado constant uuid := '482cdfb3-1cde-422e-aa92-2104729df931'")
  })

  it('el cargo debe estar en «Otros» (no «Comisiones y cargos» como en el caso de junio) y la bonificación en «Devoluciones»', () => {
    expect(SQL).toContain("v_charge.amount <> 60.00 or v_charge.is_income is distinct from false or v_charge.category is distinct from 'Otros'")
    expect(SQL).toContain("v_bonus.amount <> 60.00 or v_bonus.is_income is distinct from true or v_bonus.category is distinct from 'Devoluciones'")
    expect(SQL).toContain("v_charge.notes is distinct from 'INTERESES Y/O COMISIONES CUENTA'")
    expect(SQL).toContain("v_bonus.notes is distinct from 'BONIFIC. COMISION MANT. CUENTA'")
  })

  it('misma cuenta y mismo día, verificados contra bank_transactions, sin ambigüedad en la ventana', () => {
    expect(SQL).toContain("bt.matched_expense_id = c_charge and bt.account_id = c_account and bt.transaction_date = date '2026-09-24'")
    expect(SQL).toContain("bt.matched_expense_id = c_bonus and bt.account_id = c_account and bt.transaction_date = date '2026-09-24'")
    expect(SQL).toContain("and bt.credit_debit = 'DBIT'")
    expect(SQL).toContain("and bt.credit_debit = 'CRDT'")
    expect(SQL).toContain("between date '2026-09-17' and date '2026-10-01') <> 2 then")
    expect(SQL).toContain('se aborta por ambigüedad')
  })

  it('el alcance está acotado: «Otros» debía tener exactamente 2 filas/100,00€ y «Devoluciones» 6 filas/179,25€ antes de tocar nada', () => {
    expect(SQL).toContain("category = 'Otros') <> 2")
    expect(SQL).toContain('<> 100.00')
    expect(SQL).toContain("category = 'Devoluciones') <> 6")
    expect(SQL).toContain('<> 179.25')
  })
})

describe('destino: la misma categoría estándar que 0152, nunca un nombre inventado ni una categoría nueva', () => {
  it('resuelve «Cobro anulado» por id + catalog_key + padre «Movimientos internos», no crea ninguna categoría', () => {
    expect(SQL).toContain("catalog_key = 'g.movimientos_internos.cobro_anulado'")
    expect(SQL).toContain("name = 'Movimientos internos' and budget_group = 'generales' and parent_id is null")
    expect(SQL).not.toMatch(/insert\s+into\s+public\.budget_categories/i)
  })

  it('reutiliza commission_reversal_reclass_log (create table IF NOT EXISTS) — no la duplica ni la recrea desde cero', () => {
    expect(SQL).toContain('create table if not exists public.commission_reversal_reclass_log')
  })
})

describe('el cambio: SOLO category, en las dos filas, nada más', () => {
  it('las ÚNICAS escrituras son category=\'Cobro anulado\' en esas dos filas (y el registro de reversibilidad)', () => {
    const updates = [...SQL.matchAll(/update\s+public\.(\w+)\s+set\s+([^;]+);/gi)].map((m) => `${m[1]}: ${m[2].replace(/\s+/g, ' ').trim()}`)
    expect(updates).toEqual(["expenses: category = 'Cobro anulado' where id = c_charge", "expenses: category = 'Cobro anulado' where id = c_bonus"])
    expect(SQL).not.toMatch(/\b(delete\s+from|truncate|drop\s+table)\b/i)
    expect([...SQL.matchAll(/insert into\s+(public\.\w+)/gi)].map((m) => m[1])).toEqual(['public.commission_reversal_reclass_log', 'public.commission_reversal_reclass_log'])
  })

  it('nunca toca amount, expense_date, is_income, store, notes, owner_member_id, budget_group, tag_id ni ninguna otra columna', () => {
    const writes = SQL.slice(SQL.indexOf('-- ── El cambio'))
    expect(writes).not.toMatch(/set\s+[^;]*\b(amount|expense_date|is_income|store|notes|owner_member_id|budget_group|tag_id)\s*=/i)
  })

  it('invariante final: «Otros» 1/40,00€ y «Devoluciones» 5/119,25€', () => {
    expect(SQL).toContain("category = 'Otros') <> 1")
    expect(SQL).toContain('<> 40.00')
    expect(SQL).toContain("category = 'Devoluciones') <> 5")
    expect(SQL).toContain('<> 119.25')
    expect(SQL).toContain('se revierte todo')
  })
})

describe('alcance exclusivo: solo esta pareja, ninguna otra familia/cuenta/importe', () => {
  it('no menciona Familia Demo ni ninguna otra familia; no modifica el catálogo ni create_family', () => {
    expect(SQL).not.toMatch(/Demo/i)
    expect(SQL).not.toMatch(/catalog_categories|create_family/i)
    expect(SQL).not.toContain('72296108-f334-4098-95aa-91bf489c7ac2') // Familia Demo
  })

  it('no toca la pareja de junio (0152) ni reutiliza sus ids', () => {
    expect(SQL).not.toContain('75004698-08a0-4bd7-b4ce-d4d61c3f0fee')
    expect(SQL).not.toContain('b9bc07b6-bc49-440b-9c52-65b0ead1a8cc')
  })
})

describe('rollback: restaura exactamente el estado previo sin afectar al log de junio', () => {
  it('devuelve el cargo a «Otros» y la bonificación a «Devoluciones», por id, sin pisar un cambio posterior', () => {
    expect(ROLLBACK_SQL).toContain("l.entity_id = x.id and x.category = l.after ->> 'category'")
    expect(ROLLBACK_SQL).toContain(`'${CHARGE}', '${BONUS}'`)
    expect(ROLLBACK_SQL).not.toMatch(/drop table/i)
    expect(ROLLBACK_SQL).toContain('delete from public.commission_reversal_reclass_log')
  })

  it('el rollback no borra la tabla compartida (la pareja de junio, 0152, sigue necesitándola)', () => {
    expect(ROLLBACK_SQL).not.toMatch(/drop\s+table\s+if\s+exists\s+public\.commission_reversal_reclass_log/i)
  })
})
