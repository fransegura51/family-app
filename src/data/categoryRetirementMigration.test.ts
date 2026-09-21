import { describe, expect, it } from 'vitest'

// Guardas de la FASE 6B (retirar Taller y migrar Gasolinera → Combustible en Familia Hepburn).
const FILES = import.meta.glob(
  [
    '/supabase/migrations/0139_catalog_base.sql',
    '/supabase/migrations/0141_catalog_link_families.sql',
    '/supabase/migrations/0146_retire_taller_migrate_gasolinera.sql',
    '/supabase/rollbacks/0146_retire_taller_migrate_gasolinera_down.sql',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>
const CATALOG = FILES['/supabase/migrations/0139_catalog_base.sql']
const LINK = FILES['/supabase/migrations/0141_catalog_link_families.sql']
const MIGRATION = FILES['/supabase/migrations/0146_retire_taller_migrate_gasolinera.sql']
const ROLLBACK = FILES['/supabase/rollbacks/0146_retire_taller_migrate_gasolinera_down.sql']
const APP = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const FUNCTIONS = import.meta.glob('/supabase/functions/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const SQL = MIGRATION.replace(/--[^\n]*/g, '')
const ROLLBACK_SQL = ROLLBACK.replace(/--[^\n]*/g, '')
const HEPBURN = "'011429a4-4fd8-4341-9c04-ec6b2f585196'"

describe('Fase 6B: alcance — solo Familia Hepburn, solo lo inequívoco', () => {
  it('trabaja únicamente sobre Familia Hepburn (id + nombre comprobados); no toca Demo ni otras familias', () => {
    expect(SQL).toContain(`c_family constant uuid := ${HEPBURN}`)
    expect(SQL).toContain("where id = c_family and name = 'Familia Hepburn'")
    for (const other of ['72296108-f334-4098-95aa-91bf489c7ac2', '223ea7b0-bd93-4e6d-9acb-46d4aa60817b', 'e98546ca-3240-48db-bf7b-c64e548de8b0']) expect(SQL).not.toContain(other)
    // los datos de otras familias tienen que quedar idénticos: se comprueban por huella dentro de la propia migración
    expect(SQL).toContain('where x.family_id <> c_family')
    expect(SQL).toContain('v_exp_others_h')
    expect(SQL).toContain('v_cats_others_h')
  })

  it('las ÚNICAS escrituras: expenses.category de los 2 gastos, el borrado de Taller y el registro de reversibilidad', () => {
    const updates = [...SQL.matchAll(/update\s+public\.(\w+)\s+set\s+([^;]+);/gi)].map((m) => `${m[1]}: ${m[2].replace(/\s+/g, ' ').trim()}`)
    expect(updates).toEqual(["expenses: category = 'Combustible' where id = any (v_gas_ids)"])
    const deletes = [...SQL.matchAll(/delete from\s+(public\.\w+)[^;]*;/gi)].map((m) => m[0].replace(/\s+/g, ' '))
    expect(deletes).toEqual(['delete from public.budget_categories where id = v_taller.id;'])
    const inserts = [...SQL.matchAll(/insert into\s+(public\.\w+)/gi)].map((m) => m[1])
    expect(inserts).toEqual(['public.category_migration_log', 'public.category_migration_log'])
    expect(SQL).not.toMatch(/\btruncate\b|\bdrop\b/i)
  })

  it('NO toca receipts, budgets, productos, precios, clases, catálogo, cadenas ni aprendizaje compartido', () => {
    expect(SQL).not.toMatch(/(update|delete from|insert into|alter table)\s+public\.(receipts|budgets|products|product_prices|family_food_types|catalog_\w+|store_chain\w*|shared_\w+|families|profiles|tags|event_budget_items)\b/i)
    expect(SQL).not.toMatch(/create_family|class_confirmed_at|classification/i)
  })

  it('el ticket de Repsol (bombona) NO se modifica: se comprueba que sigue como estaba y la fila Gasolinera se conserva', () => {
    expect(SQL).not.toMatch(/update\s+public\.receipts/i)
    expect(SQL).toContain("category = 'Gasolinera' and store = 'Repsol'")
    // la fila Gasolinera solo se comprueba (debe seguir existiendo), nunca se borra ni se renombra
    expect(SQL).toContain("(select count(*) from public.budget_categories where family_id = c_family and name = 'Gasolinera') <> 1")
    expect(SQL).not.toMatch(/delete from public\.budget_categories where[^;]*v_gas/i)
    expect(SQL).not.toMatch(/set name\b/i)
  })

  it('los 2 movimientos son exactamente FOOTWORK-EL BADEN y E S THADER-MURCIA (bancarios, 100 € en total, sin ticket enlazado)', () => {
    expect(SQL).toContain("store not in ('FOOTWORK-EL BADEN', 'E S THADER-MURCIA')")
    expect(SQL).toContain("source <> 'banco'")
    expect(SQL).toContain('<> 100')
    expect(SQL).toContain('coalesce(cardinality(v_gas_ids), 0) <> 2')
    expect(SQL).toContain('where expense_id = any (v_gas_ids)')
  })
})

describe('Fase 6B: invariantes que abortan la migración', () => {
  it('destinos estándar comprobados: existen una sola vez, con su catalog_key, padre y grupo; el catálogo base no cambia', () => {
    expect(SQL).toContain("v_comb.catalog_key is distinct from 'g.transporte_vehiculo.combustible'")
    expect(SQL).toContain("v_mant.catalog_key is distinct from 'g.transporte_vehiculo.mantenimiento_reparaciones'")
    expect(SQL).toContain("(select count(*) from public.budget_categories where family_id = c_family and name = 'Combustible') <> 1")
    expect(SQL).toContain("(select count(*) from public.budget_categories where family_id = c_family and name = 'Mantenimiento y reparaciones') <> 1")
    expect(SQL).toContain("public.catalog_norm_name(name) in ('gasolinera', 'taller')")
    expect(SQL).toContain('falta la categoría estándar Transporte y vehículo')
  })

  it('Gasolinera y Taller deben ser las personales históricas (sin catalog_key, bajo Transporte, sin subcategorías)', () => {
    expect(SQL).toContain('v_gas.catalog_key is not null')
    expect(SQL).toContain('v_taller.catalog_key is not null')
    expect(SQL).toContain('parent_id in (v_gas.id, v_taller.id)')
  })

  it('Taller solo se retira si no tiene NINGUNA referencia (gastos, tickets, presupuestos, eventos, contactos, inventario, documentos, menús)', () => {
    for (const table of ['expenses', 'receipts', 'budgets', 'event_budget_items', 'contacts', 'inventory_items', 'member_documents', 'event_menu_items']) {
      expect(SQL, table).toMatch(new RegExp(`from public\\.${table} where[^;]*category[^;]*'Taller'`))
    }
    expect(SQL).toContain('ningún presupuesto debe usarlas')
  })

  it('comprobación final: mismos totales, mismo contenido salvo la categoría, Combustible +2 y +100 €, Gasolinera sin gastos, nada más cambia', () => {
    for (const piece of [
      '(select count(*) from public.expenses) <> v_exp_n',
      '(select sum(amount) from public.expenses) <> v_exp_sum',
      "(to_jsonb(x) - 'category')",
      '<> v_comb_n + 2',
      '<> v_comb_sum + 100',
      "exists (select 1 from public.expenses where family_id = c_family and category = 'Gasolinera')",
      '(select count(*) from public.activity_log) <> v_activity',
      'se revierte todo',
    ]) {
      expect(SQL, piece).toContain(piece)
    }
  })

  it('el registro de actividad se suspende solo dentro de la transacción y se vuelve a activar', () => {
    const disable = SQL.indexOf('alter table public.expenses disable trigger trg_log_expenses')
    const update = SQL.indexOf("update public.expenses set category = 'Combustible'")
    const enable = SQL.indexOf('alter table public.expenses enable trigger trg_log_expenses')
    expect(disable).toBeGreaterThan(-1)
    expect(disable).toBeLessThan(update)
    expect(update).toBeLessThan(enable)
  })
})

describe('Fase 6B: reversibilidad', () => {
  it('antes de cambiar copia cada fila (gastos y categoría retirada) a un registro no expuesto a los usuarios', () => {
    expect(SQL.indexOf("insert into public.category_migration_log (phase, entity, entity_id, before, after)\n  select '6B', 'expense'")).toBeLessThan(SQL.indexOf("update public.expenses set category"))
    expect(SQL.indexOf("values ('6B', 'budget_category'")).toBeLessThan(SQL.indexOf('delete from public.budget_categories where id = v_taller.id'))
    expect(SQL).toContain('alter table public.category_migration_log enable row level security;')
    expect(SQL).toContain('revoke all on public.category_migration_log from public, anon, authenticated;')
    expect(SQL).not.toMatch(/create policy/i)
  })

  it('el rollback recrea Taller con sus mismas propiedades e id y devuelve los gastos a Gasolinera (sin pisar cambios posteriores)', () => {
    expect(ROLLBACK_SQL).toContain('jsonb_populate_record(null::public.budget_categories, l.before)')
    expect(ROLLBACK_SQL).toContain("set category = l.before ->> 'category'")
    expect(ROLLBACK_SQL).toContain("e.category = l.after ->> 'category'")
    expect(ROLLBACK_SQL).toContain('alter table public.expenses disable trigger trg_log_expenses')
    expect(ROLLBACK_SQL).toContain('alter table public.expenses enable trigger trg_log_expenses')
    expect(ROLLBACK_SQL.indexOf('drop table if exists public.category_migration_log')).toBeGreaterThan(ROLLBACK_SQL.indexOf('insert into public.budget_categories'))
    expect(ROLLBACK_SQL).not.toMatch(/delete from|truncate|receipts|budgets|products|catalog_|shared_/i)
  })
})

describe('Fase 6B: catálogo base y familias nuevas', () => {
  it('el catálogo base sigue teniendo Combustible y Mantenimiento y reparaciones bajo Transporte y vehículo, y NO tiene Gasolinera ni Taller', () => {
    expect(CATALOG).toContain("'g.transporte_vehiculo.combustible'")
    expect(CATALOG).toContain("'g.transporte_vehiculo.mantenimiento_reparaciones'")
    expect(CATALOG).toMatch(/'Combustible'/)
    expect(CATALOG).toMatch(/'Mantenimiento y reparaciones'/)
    expect(CATALOG).not.toMatch(/'Gasolinera'|'Taller'/)
  })

  it('create_family (v2, de la Fase 2) no menciona Gasolinera ni Taller y la Fase 6B no lo modifica', () => {
    const fn = LINK.slice(LINK.indexOf('create or replace function public.create_family'))
    expect(fn).not.toMatch(/Gasolinera|Taller/)
    expect(SQL).not.toMatch(/create or replace function|create_family/i)
  })
})

describe('Fase 6B: NO hay asociaciones automáticas por comercio (Repsol != Combustible)', () => {
  it('esta fase no introduce ninguna regla comercio → categoría (la migración solo trabaja con ids y nombres de la propia familia)', () => {
    // la única mención a Repsol es la comprobación de que ese ticket es el esperado (y sus mensajes de error): nunca una asignación
    const sqlWithoutChecks = SQL.replace(/category = 'Gasolinera' and store = 'Repsol'/g, '').replace(/raise exception '[^']*'/g, '')
    expect(sqlWithoutChecks).not.toMatch(/repsol/i)
    expect(SQL).not.toMatch(/store\s*(=|in|like)[^;]*'Repsol'[^;]*(set|update)|update[^;]*store\s*=\s*'Repsol'/i)
    for (const brand of ['cepsa', 'galp', 'shell', 'petroprix', 'ballenoil']) expect(SQL.toLowerCase()).not.toContain(brand)
  })

  it('la ÚNICA regla comercio → Combustible del proyecto es la importación bancaria PREVIA a esta fase, sin cambios; no hay otra en la app', () => {
    const mapping = /keywords:\s*\[[^\]]*\]\s*,\s*category:\s*["']Combustible["']/
    const inFunctions = Object.entries(FUNCTIONS)
      .filter(([, text]) => mapping.test(text))
      .map(([file]) => file)
    expect(inFunctions).toEqual(['/supabase/functions/enable-banking-sync-transactions/index.ts'])
    const rule = FUNCTIONS['/supabase/functions/enable-banking-sync-transactions/index.ts'].match(/\{ keywords: \[[^\]]*\], category: "Combustible" \}/g)
    expect(rule).toEqual(['{ keywords: ["repsol", "cepsa", "galp", "shell", "gasolinera", "estacion de servicio", "petroprix", "ballenoil"], category: "Combustible" }'])
    const inApp = Object.entries(APP)
      .filter(([, text]) => mapping.test(text) || /(repsol|gasolinera)[^\n]{0,60}(=>|:)\s*['"]Combustible['"]/i.test(text))
      .map(([file]) => file)
    expect(inApp).toEqual([])
  })

  it('las cadenas, el aprendizaje compartido y la clasificación de productos siguen sin asociar cadena con categoría', () => {
    for (const file of ['/src/domain/sharedLearning.ts', '/src/domain/productClass.ts', '/src/domain/ticketLines.ts']) {
      expect(APP[file], file).not.toMatch(/Combustible/)
    }
    expect(APP['/src/domain/storeChains.ts']).toContain('Repsol != Combustible')
  })
})
