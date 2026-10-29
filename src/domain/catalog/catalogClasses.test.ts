// Las clases CAT-1 del catálogo maestro (classes.ts) son un ESPEJO de la tabla del catálogo base: aquí se comprueba contra las migraciones reales (0139, 0294 y la
// 0334 preparada) que claves, nombres, conjuntos e iconos coinciden, y que la 0334 es aditiva y reversible.
import { describe, expect, it } from 'vitest'
import { CATALOG_CLASSES, CLASS_CODES } from './classes'

const FILES = import.meta.glob(
  ['/supabase/migrations/0139_catalog_base.sql', '/supabase/migrations/0294_split_lacteos_huevos.sql', '/supabase/migrations/0334_catalog_master_classes.sql', '/supabase/pending-migrations/0334_catalog_master_classes.sql', '/supabase/rollbacks/0334_catalog_master_classes_down.sql', '/supabase/migrations/0344_catalog_furniture_crafts.sql', '/supabase/rollbacks/0344_catalog_furniture_crafts_down.sql'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>
const find = (suffix: string) => Object.entries(FILES).find(([k]) => k.endsWith(suffix))?.[1] as string
const BASE = find('0139_catalog_base.sql')
const SPLIT = find('0294_split_lacteos_huevos.sql')
const NEW = find('0334_catalog_master_classes.sql')
const DOWN = find('0334_catalog_master_classes_down.sql')
const COR06 = find('0344_catalog_furniture_crafts.sql')
const COR06_DOWN = find('0344_catalog_furniture_crafts_down.sql')
const code = (sql: string) => sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n')

interface Row {
  key: string
  kind: string
  name: string
  icon: string
}

function rows(sql: string): Row[] {
  return [...sql.matchAll(/\(\s*'((?:food|other)\.[a-z_]+)',\s*'(alimentacion|no_alimentos)',\s*'([^']+)',\s*'[^']*',\s*'([^']+)'/g)].map((m) => ({ key: m[1], kind: m[2], name: m[3], icon: m[4] }))
}

describe('clases del catálogo maestro ↔ migraciones', () => {
  const fromSql = new Map<string, Row>()
  for (const r of [...rows(BASE), ...rows(SPLIT), ...rows(NEW), ...rows(COR06)]) fromSql.set(r.key, r)
  // 0294 renombra «Lácteos y huevos» a «Lácteos» (la clave no cambia).
  const final = new Map(fromSql)
  final.set('food.lacteos_huevos', { ...(fromSql.get('food.lacteos_huevos') as Row), name: 'Lácteos' })

  it('cada clase de classes.ts existe en las migraciones con el mismo conjunto, nombre e icono', () => {
    for (const c of CATALOG_CLASSES) {
      const sql = final.get(c.key)
      expect(sql, c.key).toBeDefined()
      expect({ kind: c.kind, name: c.name, icon: c.icon }, c.key).toEqual({ kind: sql?.kind, name: sql?.name, icon: sql?.icon })
    }
  })
  it('y no falta ninguna: todas las clases de las migraciones están en classes.ts', () => {
    expect([...final.keys()].sort()).toEqual(CATALOG_CLASSES.map((c) => c.key).sort())
  })
  it('los códigos cortos del catálogo apuntan solo a clases que existen', () => {
    for (const key of Object.values(CLASS_CODES)) expect(final.has(key), key).toBe(true)
  })
})

describe('migración 0334 · tres clases nuevas', () => {
  it('existe con su reversión y los $$ están emparejados', () => {
    expect(NEW).toBeTruthy()
    expect(DOWN).toBeTruthy()
    for (const sql of [NEW, DOWN]) expect((code(sql).match(/\$\$/g) ?? []).length % 2).toBe(0)
  })
  it('crea exactamente Alimentación infantil, Platos preparados e Higiene y cuidado del bebé', () => {
    expect(rows(NEW).map((r) => r.key).sort()).toEqual(['food.alimentacion_infantil', 'food.platos_preparados', 'other.cuidado_bebe'])
  })
  it('es aditiva: no borra, no renombra ni toca productos, tickets, gastos ni presupuestos', () => {
    const c = code(NEW)
    expect(c).not.toMatch(/drop table|truncate|delete from/i)
    expect(c).not.toMatch(/update public\.(products|expenses|receipts|product_prices|budget_categories)/i)
    // la única actualización de datos de familia es enlazar con el catálogo una clase propia del mismo nombre
    expect(c).toContain('set catalog_key = v_row.key')
    expect(c).not.toMatch(/set name\b/i)
  })
  it('es idempotente (on conflict / not exists en cada alta)', () => {
    const c = code(NEW)
    expect(c).toContain('on conflict (key) do nothing')
    expect(c).toMatch(/not exists \(select 1 from public\.family_food_types x where x\.family_id = f\.family_id and x\.catalog_key = v_row\.key\)/)
  })
  it('respeta la unicidad de nombre de la familia (no crea una clase cuyo nombre ya existe)', () => {
    expect(code(NEW)).toContain('lower(x.name) = lower(v_row.name)')
  })
  it('la reversión solo quita lo que ningún producto ni gasto usa', () => {
    const d = code(DOWN)
    expect(d).toContain('not exists (select 1 from public.products p')
    expect(d).toContain('not exists (select 1 from public.expenses e')
    expect(d).not.toMatch(/delete from public\.(products|expenses|receipts)/i)
  })
})

describe('migración 0344 · COR-06 muebles y manualidades', () => {
  it('existe con su reversión y los $$ están emparejados', () => {
    expect(COR06).toBeTruthy()
    expect(COR06_DOWN).toBeTruthy()
    for (const sql of [COR06, COR06_DOWN]) expect((code(sql).match(/\$\$/g) ?? []).length % 2).toBe(0)
  })
  it('crea exactamente Muebles y organización y Manualidades y creatividad (no hay una segunda clase de bebé: se reutiliza «Higiene y cuidado del bebé»)', () => {
    expect(rows(COR06).map((r) => r.key).sort()).toEqual(['other.manualidades_creatividad', 'other.muebles_organizacion'])
    expect(CATALOG_CLASSES.filter((c) => /bebé/i.test(c.name)).map((c) => c.name)).toEqual(['Higiene y cuidado del bebé'])
  })
  it('añade la categoría de Economía Vivienda y hogar → Muebles y organización', () => {
    expect(code(COR06)).toContain("'g.vivienda_hogar.muebles_organizacion', 'generales', 'g.vivienda_hogar', 'Muebles y organización'")
  })
  it('es aditiva e idempotente: no borra, no renombra ni toca productos, tickets, gastos ni presupuestos', () => {
    const c = code(COR06)
    expect(c).not.toMatch(/drop table|truncate|delete from|set name/i)
    expect(c).not.toMatch(/update public\./i)
    expect(c).toContain('on conflict (key) do nothing')
  })
  it('la reversión solo quita lo que ningún producto, gasto ni presupuesto usa', () => {
    const d = code(COR06_DOWN)
    expect(d).toContain('not exists (select 1 from public.products p')
    expect(d).toContain('not exists (select 1 from public.expenses e')
    expect(d).not.toMatch(/delete from public\.(products|expenses|receipts)/i)
  })
})
