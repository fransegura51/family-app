// CAT-2: la app pide la sincronización del catálogo general (migración 0338) en vez de sembrar listas fijas que nacían sin enlace.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('@/data/supabaseClient', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }))

const { catalogSyncChanged, ensureCatalogSynced, resetCatalogSyncForTests } = await import('@/data/catalogSync')
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

beforeEach(() => {
  rpc.mockReset()
  resetCatalogSyncForTests()
})

describe('ensureCatalogSynced', () => {
  it('llama a la función de la base y avisa de que cambió algo cuando enlazó, consolidó o añadió', async () => {
    rpc.mockResolvedValue({ data: { linked_classes: 20, merged_classes: 0, renamed_classes: 1, added_classes: 7, linked_categories: 0, added_categories: 4 }, error: null })
    expect(await ensureCatalogSynced()).toEqual({ changed: true })
    expect(rpc).toHaveBeenCalledWith('sync_my_family_catalog')
  })
  it('si la familia ya estaba al día, no hay nada que recargar', async () => {
    rpc.mockResolvedValue({ data: { linked_classes: 0, merged_classes: 0, renamed_classes: 0, added_classes: 0, linked_categories: 0, added_categories: 0 }, error: null })
    expect(await ensureCatalogSynced()).toEqual({ changed: false })
  })
  it('varias pantallas a la vez comparten UNA llamada, y no se repite hasta pasados 10 minutos', async () => {
    rpc.mockResolvedValue({ data: {}, error: null })
    await Promise.all([ensureCatalogSynced(), ensureCatalogSynced(), ensureCatalogSynced()])
    await ensureCatalogSynced()
    expect(rpc).toHaveBeenCalledTimes(1)
    await ensureCatalogSynced(true)
    expect(rpc).toHaveBeenCalledTimes(2)
  })
  it('nunca rompe la pantalla: un error de red o de permisos se ignora y se reintenta en la siguiente carga', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    expect(await ensureCatalogSynced()).toEqual({ changed: false })
    rpc.mockRejectedValueOnce(new Error('sin red'))
    expect(await ensureCatalogSynced()).toEqual({ changed: false })
    rpc.mockResolvedValueOnce({ data: { added_classes: 1 }, error: null })
    expect(await ensureCatalogSynced()).toEqual({ changed: true })
  })
  it('interpreta cualquier forma de respuesta sin lanzar', () => {
    for (const bad of [null, undefined, 'x', 3, [], {}, { added_classes: 'x' }, { skipped: 'sin familia' }]) expect(catalogSyncChanged(bad)).toBe(false)
  })
})

describe('Compras y Economía ya no siembran listas fijas', () => {
  const shopping = src('src/ui/ShoppingScreen.tsx')
  const finance = src('src/ui/FinanceScreen.tsx')
  const foodTypes = src('src/data/foodTypes.ts')
  it('desaparece el sembrado de clases de producto desde el cliente (causa de las 20 clases sin enlace de «Familia prueba»)', () => {
    expect(foodTypes).not.toContain('seedFamilyFoodTypes')
    expect(shopping).not.toContain('seedFamilyFoodTypes')
    expect(shopping).not.toContain('ensureFoodTypesSeeded')
    expect(shopping).toContain('ensureCatalogSynced()')
  })
  it('desaparece el sembrado de categorías de gasto e ingreso con listas fijas', () => {
    for (const gone of ['MASTER_CATEGORY_SEED', 'INCOME_CATEGORY_SEED', 'seedCategoryTree', 'createBudgetCategoriesBulk(']) expect(finance, gone).not.toContain(gone)
    expect(finance.match(/ensureCatalogSynced\(\)/g)?.length).toBeGreaterThanOrEqual(2)
  })
  it('una sincronización que cambia algo vuelve a leer las clasificaciones', () => {
    expect(shopping).toMatch(/ensureCatalogSynced\(\)\)\.changed\) \{[\s\S]{0,260}listFamilyFoodTypes\('alimentacion'\)/)
    expect(finance).toContain('if ((await ensureCatalogSynced()).changed) cats = await listBudgetCategories()')
    expect(finance).toContain('if ((await ensureCatalogSynced()).changed) c = await listBudgetCategories()')
  })
})

describe('migraciones 0338-0340: aditivas y sin pérdida de datos', () => {
  const sql = (n: string) => src(`supabase/migrations/${n}.sql`)
  const m38 = sql('0338_catalog_sync_all_families')
  const m39 = sql('0339_catalog_economy_categories')
  const m40 = sql('0340_expense_category_provenance')

  it('0338: la sincronización enlaza, consolida, renombra y añade; nunca borra categorías de gasto ni toca importes', () => {
    expect(m38).toContain('private.sync_family_catalog')
    expect(m38).not.toMatch(/delete\s+from\s+public\.budget_categories/i)
    expect(m38).not.toMatch(/update\s+public\.(expenses|receipts|budgets|product_prices)\s+set\s+(amount|total_amount|price)/i)
    // el único borrado de clases está dentro de merge_family_class, después de comprobar que no queda ninguna referencia
    const deletes = m38.match(/delete\s+from\s+public\.family_food_types/gi) ?? []
    expect(deletes).toHaveLength(1)
    const merge = m38.slice(m38.indexOf('function private.merge_family_class'), m38.indexOf('function private.sync_family_catalog'))
    expect(merge.indexOf('if v_left > 0 then')).toBeGreaterThan(0)
    expect(merge.indexOf('delete from public.family_food_types')).toBeGreaterThan(merge.indexOf('if v_left > 0 then'))
    expect(merge).toContain('category_migration_log') // guarda el estado anterior para poder revertir
  })
  it('0338: nunca fuerza una pareja dudosa (exige candidata única) y respeta lo personal', () => {
    expect(m38).toContain('n_cand = 1')
    expect(m38).toContain('exception when others then')
  })
  it('0338: cada ampliación del catálogo llega a todas las familias y la app solo puede sincronizar la suya', () => {
    expect(m38).toContain('create trigger catalog_food_types_sync_families')
    expect(m38).toContain('create trigger catalog_categories_sync_families')
    expect(m38).toContain('grant execute on function public.sync_my_family_catalog() to authenticated')
    expect(m38).toContain('revoke all on function private.sync_family_catalog(uuid) from public, anon, authenticated')
    expect(m38).toContain('select family_id into v_family from public.profiles where id = auth.uid()')
  })
  it('0339: solo añade categorías nuevas del catálogo (ni borra, ni renombra, ni reclasifica)', () => {
    expect(m39).toContain('on conflict (key) do nothing')
    expect(m39).not.toMatch(/\bdelete\b|\bdrop\b|update\s+public\./i)
    for (const key of ['electricidad', 'gas', 'agua', 'comunidad', 'medicos_dentista_optica', 'donaciones', 'pensiones_prestaciones', 'intereses_rentas']) expect(m39).toContain(key)
  })
  it('0340: las columnas son opcionales, el disparador solo marca cuando hay una PERSONA y la sincronización del banco no marca nada', () => {
    expect(m40).toContain('add column if not exists category_source text')
    expect(m40).toContain('add column if not exists category_suggestion text')
    expect(m40).toContain('if auth.uid() is null then')
    expect(m40).toContain("check (category_source is null or category_source in ('auto', 'sugerida', 'manual'))")
    expect(m40).not.toMatch(/update\s+public\.expenses/i)
  })
  it('las tres tienen su reversión', () => {
    for (const f of ['0338_catalog_sync_all_families_down', '0339_catalog_economy_categories_down', '0340_expense_category_provenance_down']) {
      expect(src(`supabase/rollbacks/${f}.sql`).length).toBeGreaterThan(100)
    }
  })
})
