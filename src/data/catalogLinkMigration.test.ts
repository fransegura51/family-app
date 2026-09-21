import { describe, expect, it } from 'vitest'

// Guardas de la FASE 2 (catálogo base ↔ familias ↔ create_family). La migración es la fuente; aquí se lee como texto.
const FILES = import.meta.glob(['/supabase/migrations/0141_catalog_link_families.sql', '/supabase/rollbacks/0141_catalog_link_families_down.sql'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0141_catalog_link_families.sql']
const ROLLBACK = FILES['/supabase/rollbacks/0141_catalog_link_families_down.sql']
const APP = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const SPLIT = MIGRATION.indexOf('create or replace function public.create_family')
const BEFORE_CREATE_FAMILY = MIGRATION.slice(0, SPLIT)
const CREATE_FAMILY = MIGRATION.slice(SPLIT)
const PROTECTED = ['products', 'product_prices', 'receipts', 'expenses', 'budgets', 'families', 'family_members', 'profiles', 'tags', 'shopping_stores']

describe('Fase 2: vinculación al catálogo', () => {
  it('añade solo dos columnas catalog_key NULLABLES (categorías y clases de la familia)', () => {
    expect(MIGRATION).toMatch(/alter table public\.budget_categories add column catalog_key text;/)
    expect(MIGRATION).toMatch(/alter table public\.family_food_types add column catalog_key text;/)
    expect(MIGRATION.match(/add column/g)).toHaveLength(2)
    expect(MIGRATION).not.toMatch(/catalog_key text not null/i)
  })

  it('claves foráneas a la key estable del catálogo, sin borrado en cascada; una fila por elemento del catálogo y familia', () => {
    expect(MIGRATION).toMatch(/foreign key \(catalog_key\) references public\.catalog_categories \(key\) on update cascade on delete restrict/)
    expect(MIGRATION).toMatch(/foreign key \(catalog_key\) references public\.catalog_food_types \(key\) on update cascade on delete restrict/)
    expect(MIGRATION).toMatch(/budget_categories_family_catalog_key_uidx[\s\S]*?\(family_id, catalog_key\) where catalog_key is not null/)
    expect(MIGRATION).toMatch(/family_food_types_family_catalog_key_uidx[\s\S]*?\(family_id, catalog_key\) where catalog_key is not null/)
  })

  it('solo PEPA gestiona catalog_key: trigger de protección y coherencia con el grupo/tipo', () => {
    expect(MIGRATION).toContain("current_user in ('authenticated', 'anon')")
    expect(MIGRATION).toContain('budget_categories_guard_catalog_key')
    expect(MIGRATION).toContain('family_food_types_guard_catalog_key')
    expect(MIGRATION).toMatch(/el grupo del catálogo/)
    expect(MIGRATION).toMatch(/el tipo del catálogo/)
  })

  it('el mapeo de familias existentes solo asigna catalog_key: no borra, renombra ni reclasifica', () => {
    const updates = [...MIGRATION.matchAll(/update public\.(\w+)\s+(?:\w+\s+)?set ([^\n]+)/gi)].map((m) => `${m[1]}: ${m[2].trim()}`)
    expect(updates).toEqual(['budget_categories: catalog_key = cand.cand_key', 'family_food_types: catalog_key = cand.cand_key'])
    expect(MIGRATION).not.toMatch(/\bdelete from\b|\btruncate\b|\bdrop table\b|set name\b/i)
  })

  it('el mapeo exige correspondencia inequívoca (una candidata, sin duplicados y con el mismo padre)', () => {
    expect(MIGRATION).toMatch(/cand\.n_cand = 1 and cand\.parent_ok and dup\.n = 1/)
    expect(MIGRATION).toMatch(/cand\.n_cand = 1 and dup\.n = 1/)
    // Jardin -> other.jardin por el nombre legacy aprobado, sin renombrar nada.
    expect(MIGRATION).toContain('f.name = any (c.legacy_names)')
  })

  it('unicidad normalizada por familia y grupo/tipo (Movimientos internos puede estar en generales e ingresos)', () => {
    expect(MIGRATION).toMatch(/budget_categories_family_group_normname_uidx[\s\S]*?\(family_id, budget_group, public\.catalog_norm_name\(name\)\)/)
    expect(MIGRATION).toMatch(/family_food_types_family_kind_normname_uidx[\s\S]*?\(family_id, kind, public\.catalog_norm_name\(name\)\)/)
  })

  it('no toca datos de negocio fuera de create_family', () => {
    for (const table of PROTECTED) {
      expect(BEFORE_CREATE_FAMILY, table).not.toMatch(new RegExp(`(?:insert into|update|delete from|alter table)\\s+(?:public\\.)?${table}\\b`, 'i'))
    }
    expect(BEFORE_CREATE_FAMILY).not.toMatch(/classification_source|class_confirmed_at|store_chains|shared_product_learning/i)
  })
})

describe('Fase 2: create_family v2', () => {
  it('construye las categorías y clases desde el catálogo aprobado, con su catalog_key', () => {
    expect(CREATE_FAMILY).toContain('from catalog_categories c')
    expect(CREATE_FAMILY).toContain('from catalog_food_types t')
    expect(CREATE_FAMILY.match(/status = 'approved'/g)?.length).toBeGreaterThanOrEqual(3)
    expect(CREATE_FAMILY.match(/catalog_key/g)?.length).toBeGreaterThanOrEqual(5)
  })

  it('ya no depende de ninguna familia plantilla ni copia datos personales', () => {
    expect(CREATE_FAMILY).not.toMatch(/is_seed_template|v_template|template|hepburn/i)
    expect(CREATE_FAMILY).not.toMatch(/from budget_categories where family_id = v_template/i)
    for (const table of ['products', 'product_prices', 'receipts', 'expenses', 'budgets', 'tags', 'shopping_stores']) {
      expect(CREATE_FAMILY, table).not.toMatch(new RegExp(`(?:insert into|from)\\s+${table}\\b`, 'i'))
    }
  })

  it('falla la creación si el catálogo no se copia entero', () => {
    expect(CREATE_FAMILY).toContain('el catálogo base no se ha copiado completo')
  })

  it('conserva el resto del alta: acceso, perfil, miembro e invitación', () => {
    for (const piece of ["family_signup_code", 'insert into families', 'insert into profiles', 'insert into family_members', 'update family_invites', 'Código de acceso incorrecto']) {
      expect(CREATE_FAMILY, piece).toContain(piece)
    }
  })
})

describe('Fase 2: rollback y aislamiento', () => {
  it('el rollback restaura create_family anterior y solo quita lo añadido; no borra filas', () => {
    expect(ROLLBACK).toContain('select id into v_template_family_id from families where is_seed_template limit 1;')
    for (const dropped of ['budget_categories_guard_catalog_key', 'family_food_types_guard_catalog_key', 'budget_categories_family_group_normname_uidx', 'family_food_types_family_kind_normname_uidx', 'budget_categories_family_catalog_key_uidx', 'family_food_types_family_catalog_key_uidx', 'budget_categories_catalog_key_fkey', 'family_food_types_catalog_key_fkey']) {
      expect(ROLLBACK, dropped).toContain(dropped)
    }
    expect(ROLLBACK.match(/drop column if exists catalog_key/g)).toHaveLength(2)
    expect(ROLLBACK).not.toMatch(/\bdelete from\b|\btruncate\b|\bdrop table\b|catalog_categories|catalog_food_types/i)
  })

  it('la app todavía no usa catalog_key (fase de datos: sin cambios de comportamiento)', () => {
    const users = Object.entries(APP)
      .filter(([, text]) => /catalog_key|catalogKey/.test(text))
      .map(([file]) => file)
    expect(users).toEqual([])
  })
})
