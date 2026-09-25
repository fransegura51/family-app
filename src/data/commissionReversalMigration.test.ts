import { describe, expect, it } from 'vitest'

// Guardas de la FASE 6D.0: reclasifica EXCLUSIVAMENTE la pareja comisión de mantenimiento + su bonificación (24/06/2026, 60 €, Familia
// Hepburn) a la categoría estándar «Cobro anulado». No toca ninguna otra fila de «Devoluciones» ni de «Comisiones y cargos», no crea
// categoría, no automatiza detección futura.
const FILES = import.meta.glob(
  ['/supabase/migrations/0152_reclassify_commission_reversal_pair.sql', '/supabase/rollbacks/0152_reclassify_commission_reversal_pair_down.sql'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0152_reclassify_commission_reversal_pair.sql']
const ROLLBACK = FILES['/supabase/rollbacks/0152_reclassify_commission_reversal_pair_down.sql']
const SQL = MIGRATION.replace(/--[^\n]*/g, '')
const ROLLBACK_SQL = ROLLBACK.replace(/--[^\n]*/g, '')
const CHARGE = '75004698-08a0-4bd7-b4ce-d4d61c3f0fee'
const BONUS = 'b9bc07b6-bc49-440b-9c52-65b0ead1a8cc'
const APP = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const FUNCTIONS = import.meta.glob('/supabase/functions/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('A–F. las dos filas exactas, verificadas campo a campo antes de tocar nada', () => {
  it('A/D/E/F. localiza el cargo y la bonificación por id, con importe, signo y categoría inicial exactos', () => {
    expect(SQL).toContain(`c_charge constant uuid := '${CHARGE}'`)
    expect(SQL).toContain(`c_bonus constant uuid := '${BONUS}'`)
    expect(SQL).toContain("v_charge.amount <> 60.00 or v_charge.is_income is distinct from false or v_charge.category is distinct from 'Comisiones y cargos'")
    expect(SQL).toContain("v_bonus.amount <> 60.00 or v_bonus.is_income is distinct from true or v_bonus.category is distinct from 'Devoluciones'")
    expect(SQL).toContain("v_charge.notes is distinct from 'INTERESES Y/O COMISIONES CUENTA'")
    expect(SQL).toContain("v_bonus.notes is distinct from 'BONIFIC. COMISION MANT. CUENTA'")
  })

  it('B/C. misma cuenta y mismo día, verificados contra bank_transactions (no solo contra expenses)', () => {
    expect(SQL).toContain("c_account constant uuid := 'e1cab8aa-9209-40cf-ab66-b85fc5afba1c'")
    expect(SQL).toContain("bt.matched_expense_id = c_charge and bt.account_id = c_account and bt.transaction_date = date '2026-06-24'")
    expect(SQL).toContain("bt.matched_expense_id = c_bonus and bt.account_id = c_account and bt.transaction_date = date '2026-06-24'")
    expect(SQL).toContain("and bt.credit_debit = 'DBIT'")
    expect(SQL).toContain("and bt.credit_debit = 'CRDT'")
  })

  it('sin ambigüedad: comprueba que no existe otra pareja candidata de 60 € en esa cuenta y ventana temporal', () => {
    expect(SQL).toContain("between date '2026-06-17' and date '2026-07-01') <> 2 then")
    expect(SQL).toContain('se aborta por ambigüedad')
  })

  it('el alcance está acotado: Devoluciones debía tener exactamente 5 filas/139,26 € y Comisiones y cargos 5 filas/79,60 € antes de tocar nada', () => {
    expect(SQL).toContain("category = 'Devoluciones') <> 5")
    expect(SQL).toContain('<> 139.26')
    expect(SQL).toContain("category = 'Comisiones y cargos') <> 5")
    expect(SQL).toContain('<> 79.60')
  })
})

describe('destino: la categoría estándar existente, nunca un nombre inventado', () => {
  it('resuelve «Cobro anulado» por id + catalog_key + padre «Movimientos internos», no crea ninguna categoría', () => {
    expect(SQL).toContain("c_cobro_anulado constant uuid := '482cdfb3-1cde-422e-aa92-2104729df931'")
    expect(SQL).toContain("catalog_key = 'g.movimientos_internos.cobro_anulado'")
    expect(SQL).toContain("name = 'Movimientos internos' and budget_group = 'generales' and parent_id is null")
    expect(SQL).not.toMatch(/insert\s+into\s+public\.budget_categories/i)
  })
})

describe('G/H/K/O/P/Q/R/S. el cambio: SOLO category, en las dos filas, nada más', () => {
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

  it('la huella de TODAS las demás filas de expenses (y de las demás tablas) debe quedar idéntica', () => {
    for (const piece of ['is distinct from v_exp_h_others', '<> v_exp_n', '<> v_exp_sum', 'is distinct from v_rec_h', 'is distinct from v_prod_h', 'is distinct from v_prices_h', 'is distinct from v_budgets_h', 'is distinct from v_bcats_h', 'is distinct from v_types_h', 'is distinct from v_shared_h', 'is distinct from v_chains_h', 'is distinct from v_families_h']) {
      expect(SQL, piece).toContain(piece)
    }
  })

  it('J. invariante final: Devoluciones 4/79,26 € y Comisiones y cargos 4/19,60 €', () => {
    expect(SQL).toContain("category = 'Devoluciones') <> 4")
    expect(SQL).toContain('<> 79.26')
    expect(SQL).toContain("category = 'Comisiones y cargos') <> 4")
    expect(SQL).toContain('<> 19.60')
    expect(SQL).toContain('se revierte todo')
  })
})

describe('no automatiza nada: solo dos filas puntuales, sin tocar el sync bancario', () => {
  it('la migración no toca guessCategory, MERCHANT_CATEGORY_RULES ni la regla /^anul/ del sync', () => {
    const bank = FUNCTIONS['/supabase/functions/enable-banking-sync-transactions/index.ts']
    expect(bank).toContain('return familyCategoryNames.has("Otros") ? "Otros" : [...familyCategoryNames][0] ?? "Otros"')
    expect(bank).toContain('/^anul\\b/i')
  })

  // FASE CA-1 (posterior a esta migración 0152): el sync SÍ reconoce ahora "bonific"/"comision...mant" —
  // pero como una regla propia, estrecha y con sus propias guardas (ver
  // commissionReversalDetection.test.ts), no como un efecto colateral de esta migración puntual. Esta
  // migración en sí (el fichero SQL) sigue sin tocar el sync — eso no cambia.
  it('la mención de "bonific"/comisión en el sync, si existe, es la regla CA-1 documentada y acotada, no un atajo suelto', () => {
    const bank = FUNCTIONS['/supabase/functions/enable-banking-sync-transactions/index.ts']
    if (/bonific|comision.{0,20}mant/i.test(bank)) {
      expect(bank).toContain('COMMISSION_REVERSAL_MATCH_WINDOW_DAYS')
      expect(bank).toContain('isCommissionReversalDescription')
      expect(bank).toContain('pickUnambiguousCommissionCharge')
    }
  })

  it('no existe en el código activo ninguna regla nueva BONIFIC → Cobro anulado ni comisión → categoría', () => {
    const rule = /bonific[^\n]{0,80}(=>|:)\s*['"]Cobro anulado['"]/i
    expect(Object.values(APP).some((t) => rule.test(t))).toBe(false)
    expect(Object.values(FUNCTIONS).some((t) => rule.test(t))).toBe(false)
  })

  it('no se ha tocado isRealIncome/isInternalTransferCategory ni ningún fichero de dominio de Economía', () => {
    expect(SQL).not.toMatch(/create or replace function/i)
  })
})

describe('W. rollback restaura exactamente el estado previo', () => {
  it('devuelve el cargo a «Comisiones y cargos» y la bonificación a «Devoluciones», por id, sin pisar un cambio posterior', () => {
    expect(ROLLBACK_SQL).toContain("l.entity_id = x.id and x.category = l.after ->> 'category'")
    expect(ROLLBACK_SQL).toContain(`'${CHARGE}', '${BONUS}'`)
    expect(ROLLBACK_SQL).toContain('drop table if exists public.commission_reversal_reclass_log')
    expect(ROLLBACK_SQL).not.toMatch(/insert\s+into|delete\s+from/i)
  })
})

describe('otras familias y catálogo intactos', () => {
  it('no menciona Familia Demo ni ninguna otra familia; no modifica el catálogo ni create_family', () => {
    const code = SQL.replace(/--[^\n]*/g, '')
    expect(code).not.toMatch(/Demo/i)
    expect(code).not.toMatch(/catalog_categories|create_family/i)
    expect(code).not.toContain('72296108-f334-4098-95aa-91bf489c7ac2') // Familia Demo
  })
})
