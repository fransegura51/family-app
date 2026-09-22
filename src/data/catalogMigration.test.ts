import { describe, expect, it } from 'vitest'

// Guardas de la FASE 1 (catálogo base PEPA): el contenido de la migración es el aprobado en la Fase 0 y la app
// todavía no depende de estas tablas. La migración es la fuente; aquí se lee como texto.
const FILES = import.meta.glob(['/supabase/migrations/0139_catalog_base.sql', '/supabase/rollbacks/0139_catalog_base_down.sql'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0139_catalog_base.sql']
const ROLLBACK = FILES['/supabase/rollbacks/0139_catalog_base_down.sql']
const APP = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const norm = (s: string) =>
  s
    .replace(/[ÁÉÍÓÚÜÑáéíóúüñ]/g, (c) => 'AEIOUUNaeiouun'['ÁÉÍÓÚÜÑáéíóúüñ'.indexOf(c)])
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

interface Cat {
  key: string
  group: string
  parent: string | null
  name: string
}
const CATEGORY_ROW = /^\s*\('([a-z0-9_.]+)',\s*'(generales|ingresos)',\s*(null|'[a-z0-9_.]+'),\s*'([^']+)',/gm
const CATS: Cat[] = [...MIGRATION.matchAll(CATEGORY_ROW)].map((m) => ({ key: m[1], group: m[2], parent: m[3] === 'null' ? null : m[3].slice(1, -1), name: m[4] }))

interface Cls {
  key: string
  kind: string
  name: string
  legacy: string
}
const CLASS_ROW = /^\s*\('((?:food|other)\.[a-z0-9_]+)',\s*'(alimentacion|no_alimentos)',\s*'([^']+)',\s*'(\{[^}]*\})',/gm
const CLASSES: Cls[] = [...MIGRATION.matchAll(CLASS_ROW)].map((m) => ({ key: m[1], kind: m[2], name: m[3], legacy: m[4] }))

describe('Fase 1: catálogo base — categorías financieras', () => {
  it('exactamente 56 (16 principales + 40 hijas; 51 de gasto y 5 de ingresos)', () => {
    expect(CATS).toHaveLength(56)
    expect(CATS.filter((c) => !c.parent)).toHaveLength(16)
    expect(CATS.filter((c) => c.parent)).toHaveLength(40)
    expect(CATS.filter((c) => c.group === 'generales')).toHaveLength(51)
    expect(CATS.filter((c) => c.group === 'ingresos')).toHaveLength(5)
  })

  it('keys únicas y jerarquía válida: sin huérfanas, dos niveles y mismo grupo', () => {
    const byKey = new Map(CATS.map((c) => [c.key, c]))
    expect(byKey.size).toBe(CATS.length)
    for (const c of CATS.filter((x) => x.parent)) {
      const p = byKey.get(c.parent as string)
      expect(p, `${c.key} sin principal`).toBeDefined()
      expect(p?.parent, `${c.key} cuelga de una hija`).toBeNull()
      expect(p?.group).toBe(c.group)
      expect(c.key.startsWith(`${c.parent}.`), `${c.key} no hereda la key de su principal`).toBe(true)
    }
  })

  it('nombres normalizados sin duplicados dentro de cada grupo (Movimientos internos sí está en los dos grupos)', () => {
    for (const group of ['generales', 'ingresos']) {
      const names = CATS.filter((c) => c.group === group).map((c) => norm(c.name))
      expect(new Set(names).size, group).toBe(names.length)
    }
    expect(CATS.filter((c) => norm(c.name) === 'movimientos internos').map((c) => c.group).sort()).toEqual(['generales', 'ingresos'])
  })

  it('exclusiones e inclusiones aprobadas', () => {
    const names = new Set(CATS.map((c) => norm(c.name)))
    for (const out of ['gasolinera', 'taller', 'amazon']) expect(names.has(out), out).toBe(false)
    for (const key of ['g.educacion', 'g.otros.imprevistos', 'i.ingreso.devoluciones', 'i.movimientos_internos', 'g.transporte_vehiculo.combustible', 'g.transporte_vehiculo.mantenimiento_reparaciones', 'g.movimientos_internos.cobro_anulado']) {
      expect(CATS.some((c) => c.key === key), key).toBe(true)
    }
    expect(CATS.find((c) => c.key === 'i.ingreso.devoluciones')).toMatchObject({ name: 'Devoluciones', parent: 'i.ingreso', group: 'ingresos' })
  })
})

describe('Fase 1: catálogo base — clases de producto', () => {
  it('exactamente 27 (14 Alimentación + 13 Otros), keys y nombres únicos por conjunto', () => {
    expect(CLASSES).toHaveLength(27)
    expect(CLASSES.filter((c) => c.kind === 'alimentacion')).toHaveLength(14)
    expect(CLASSES.filter((c) => c.kind === 'no_alimentos')).toHaveLength(13)
    expect(new Set(CLASSES.map((c) => c.key)).size).toBe(27)
    for (const kind of ['alimentacion', 'no_alimentos']) {
      const names = CLASSES.filter((c) => c.kind === kind).map((c) => norm(c.name))
      expect(new Set(names).size, kind).toBe(names.length)
    }
  })

  it('Jardín con tilde, key other.jardin y legacy "Jardin"; las 5 clases vacías presentes', () => {
    expect(CLASSES.find((c) => c.key === 'other.jardin')).toMatchObject({ name: 'Jardín', legacy: '{Jardin}', kind: 'no_alimentos' })
    expect(CLASSES.filter((c) => c.legacy !== '{}').map((c) => c.key)).toEqual(['other.jardin'])
    for (const name of ['Postres', 'Farmacia y salud', 'Juguetes', 'Mascotas', 'Papelería y oficina']) {
      expect(CLASSES.some((c) => c.name === name), name).toBe(true)
    }
  })
})

describe('Fase 1: aislada y reversible', () => {
  it('la migración solo crea objetos catalog_*: no altera ni toca tablas de familias ni create_family', () => {
    expect(MIGRATION).not.toMatch(/alter table\s+(?!public\.catalog_)\S+/i)
    expect(MIGRATION).not.toMatch(/create(?: or replace)? function\s+public\.create_family/i)
    for (const table of ['budget_categories', 'family_food_types', 'products', 'product_prices', 'receipts', 'expenses', 'budgets', 'families']) {
      expect(MIGRATION, table).not.toMatch(new RegExp(`(?:insert into|update|delete from|alter table)\\s+(?:public\\.)?${table}\\b`, 'i'))
    }
    expect(MIGRATION).not.toMatch(/catalog_key|class_confirmed_at|classification_source|store_chains|shared_product_learning/i)
  })

  it('RLS: lectura solo para authenticated; sin políticas de escritura; auditoría sin acceso de usuarios', () => {
    expect(MIGRATION.match(/enable row level security/g)).toHaveLength(4)
    expect(MIGRATION.match(/create policy/g)).toHaveLength(3)
    expect(MIGRATION).not.toMatch(/create policy[^;]*for (insert|update|delete|all)/i)
    expect(MIGRATION).toMatch(/grant select on public\.catalog_release, public\.catalog_categories, public\.catalog_food_types to authenticated;/)
    expect(MIGRATION).not.toMatch(/grant[^;]*catalog_audit/i)
    expect(MIGRATION).not.toMatch(/grant (insert|update|delete|all)/i)
  })

  it('el rollback solo borra los objetos del catálogo', () => {
    const drops = [...ROLLBACK.matchAll(/^drop (?:table|function) if exists public\.(\w+)/gm)].map((m) => m[1]).sort()
    expect(drops).toEqual(['catalog_audit', 'catalog_categories', 'catalog_categories_check_parent', 'catalog_food_types', 'catalog_norm_name', 'catalog_release'])
    expect(ROLLBACK).not.toMatch(/budget_categories|family_food_types|products|expenses|families/)
  })

  it('la app no lee directamente las tablas del catálogo (solo cita su nombre en un comentario explicativo, Fase 6D.1)', () => {
    const users = Object.entries(APP)
      .filter(([, text]) => /catalog_categories|catalog_food_types|catalog_release|catalog_audit|catalog_norm_name/.test(text))
      .map(([file]) => file)
    // domain/refunds.ts documenta de dónde sale REFUND_CATALOG_KEY (catalog_categories) en un comentario; no la consulta desde el
    // cliente — sigue sin haber ningún .from('catalog_...') ni RPC directa a esas tablas.
    expect(users).toEqual(['/src/domain/refunds.ts'])
    for (const [file, text] of Object.entries(APP)) {
      if (users.includes(file)) expect(text, file).not.toMatch(/from\(['"]catalog_/)
    }
  })
})
