import { describe, expect, it } from 'vitest'

// Guardas de la FASE 5 (resolutor real de clasificación): migración 0144 + cableado del código.
const FILES = import.meta.glob(['/supabase/migrations/0144_product_class_confirmed.sql', '/supabase/rollbacks/0144_product_class_confirmed_down.sql'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0144_product_class_confirmed.sql']
const ROLLBACK = FILES['/supabase/rollbacks/0144_product_class_confirmed_down.sql']
const APP = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const FUNCTIONS = import.meta.glob('/supabase/functions/**/index.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const SQL = MIGRATION.replace(/--[^\n]*/g, '')

describe('Fase 5: class_confirmed_at', () => {
  it('una sola columna nueva, NULLABLE (sin class_source: la semántica es completa con una)', () => {
    expect(SQL).toContain('alter table public.products add column class_confirmed_at timestamptz null;')
    expect(SQL.match(/add column/g)).toHaveLength(1)
    expect(SQL).not.toMatch(/class_source/)
    expect(SQL).not.toMatch(/class_confirmed_at timestamptz not null/i)
  })

  it('sin clase no puede haber confirmación (trigger silencioso: «Automático» sigue funcionando también desde un cliente antiguo)', () => {
    expect(SQL).toContain("if nullif(btrim(new.category), '') is null then")
    expect(SQL).toContain('new.class_confirmed_at := null;')
    expect(SQL).toMatch(/create trigger products_class_confirmed_guard\s+before insert or update of category, class_confirmed_at on public\.products/)
  })

  it('el backfill solo escribe class_confirmed_at: ni categorías, ni non_food, ni nombres, ni precios', () => {
    const updates = [...SQL.matchAll(/update\s+public\.(\w+)\s+(\w+)\s+set\s+([^\n]+)/gi)].map((m) => `${m[1]}: ${m[3].trim()}`)
    expect(updates).toEqual(['products: class_confirmed_at = now()'])
    expect(SQL).not.toMatch(/\bdelete from\b|\btruncate\b|\bdrop\b|set category|set non_food|set display_name|update public\.product_prices/i)
    const alters = [...SQL.matchAll(/alter table\s+(\S+)/gi)].map((m) => m[1])
    expect(alters).toEqual(['public.products'])
  })

  it('el backfill es conservador: solo Familia Hepburn, tres criterios con evidencia y las dudas quedan NULL', () => {
    expect(SQL).toContain("id = '011429a4-4fd8-4341-9c04-ec6b2f585196'::uuid and name = 'Familia Hepburn'")
    // A: inventario aprobado de la Fase 0 (aprendizaje aprobado + misma clase guardada)
    expect(SQL).toMatch(/join public\.shared_product_learning l[\s\S]*?l\.status = 'approved'/)
    expect(SQL).toMatch(/ft\.catalog_key = l\.food_type_key and ft\.name = pr\.category/)
    // B: clases de NO alimentación (ningún proceso automático las escribe), con al menos un precio y sin PARKING
    expect(SQL).toContain("ft.kind = 'no_alimentos'")
    expect(SQL).toContain("pr.n_prices > 0 and pr.normalized_name <> 'parking'")
    // C: refinamiento manual de bebida, solo esa
    expect(SQL).toContain("pr.display_name like 'NESCAF%Dolce Gusto%'")
    // nunca «porque coincide con el clasificador por reglas»
    expect(SQL.slice(SQL.indexOf('with fam as'))).not.toMatch(/classifyFoodType|guess|regla/i)
  })

  it('la propia migración falla si el backfill no es exactamente 185 (todas de Hepburn) con las 3 dudosas en NULL', () => {
    expect(SQL).toContain('v_confirmed <> 185 or v_other_families <> 0 or v_null_doubtful <> 3')
    expect(SQL).toContain("normalized_name in ('parking', 'sup.bebida fría', 'venta')")
  })
})

describe('Fase 5: RPC por lote y seguridad', () => {
  const rpc = SQL.slice(SQL.indexOf('create or replace function public.resolve_shared_product_classes'), SQL.indexOf('revoke all on function public.resolve_shared_product_classes'))

  it('reutiliza la RPC de la Fase 4 (una sola lógica), con tope de 500 y solo tienda + texto', () => {
    expect(rpc).toContain("cross join lateral public.resolve_shared_product_class(t.item ->> 'store', t.item ->> 'text')")
    expect(rpc).toContain('jsonb_array_length(p_items) > 500')
    expect(rpc).toContain("jsonb_typeof(p_items) is distinct from 'array'")
    expect(rpc).not.toMatch(/family|receipt|price|amount|expense/i)
  })

  it('security definer con search_path fijo; ejecutable solo por usuarios autenticados y service_role', () => {
    expect(rpc).toContain('security definer')
    expect(rpc).toContain('set search_path = public')
    expect(SQL).toContain('revoke all on function public.resolve_shared_product_classes(jsonb) from public, anon;')
    expect(SQL).toContain('grant execute on function public.resolve_shared_product_classes(jsonb) to authenticated, service_role;')
    expect(SQL.match(/security definer/g)).toHaveLength(1)
  })

  it('no toca el aprendizaje compartido: ni escribe en él ni lo modifica', () => {
    expect(SQL).not.toMatch(/(insert into|update|delete from|alter table|drop table)\s+(public\.)?shared_/i)
  })
})

describe('Fase 5: rollback', () => {
  it('retira la columna, el trigger y la RPC; conserva las categorías y las fases 1-4', () => {
    for (const piece of ['drop function if exists public.resolve_shared_product_classes(jsonb)', 'drop trigger if exists products_class_confirmed_guard on public.products', 'drop function if exists public.products_class_confirmed_guard()', 'alter table public.products drop column if exists class_confirmed_at']) {
      expect(ROLLBACK, piece).toContain(piece)
    }
    const statements = ROLLBACK.replace(/--[^\n]*/g, '')
    expect(statements).not.toMatch(/shared_product_learning|shared_learning_batches|store_chain|catalog_|delete from|truncate|set category|product_prices|receipt|expense|budget|drop table/i)
  })

  it('documenta qué pasa con las confirmaciones al revertir', () => {
    expect(ROLLBACK).toMatch(/marcas de tiempo class_confirmed_at se PIERDEN/)
    expect(ROLLBACK).toMatch(/cada\s+(--\s+)?products\.category se conserva intacta/)
  })
})

describe('Fase 5: un único resolutor central', () => {
  const ui = (file: string) => APP[`/src/ui/${file}`]

  it('las pantallas resuelven la clase con el resolutor central', () => {
    expect(ui('ShoppingScreen.tsx').match(/resolveProductClassSafe\(/g)?.length).toBeGreaterThanOrEqual(3) // lista, historial, «Automático»
    expect(ui('FinanceScreen.tsx').match(/resolveProductClassSafe\(/g)?.length).toBeGreaterThanOrEqual(3) // tickets + economía (alimentos y otros)
  })

  it('ya no queda el patrón antiguo «clase guardada || classifyFoodType» en ningún punto de lectura', () => {
    for (const file of ['ShoppingScreen.tsx', 'FinanceScreen.tsx']) {
      expect(ui(file), file).not.toMatch(/category\?\.trim\(\)\s*\|\|/)
      expect(ui(file), file).not.toMatch(/stored\s*\|\|\s*\(/)
    }
  })

  it('classifyFoodType solo se usa como regla dentro del resolutor y para elegir iconos en la interfaz', () => {
    const users = Object.entries(APP)
      .filter(([, text]) => /classifyFoodType\(/.test(text))
      .map(([file]) => file)
      .sort()
    expect(users).toEqual(['/src/domain/foodTypes.ts', '/src/domain/productClass.ts', '/src/ui/FinanceScreen.tsx', '/src/ui/ShoppingScreen.tsx'])
    // en la interfaz, solo su icono/etiqueta de icono, nunca para decidir el nombre de la clase
    // (Economía lo guarda en «auto» solo para elegir el icono; el nombre de la clase sale del resolutor)
    for (const file of ['ShoppingScreen.tsx', 'FinanceScreen.tsx']) {
      for (const m of ui(file).matchAll(/(const auto = )?classifyFoodType\([^)]*\)(\.\w+)?/g)) expect(m[2] === '.icon' || m[1] === 'const auto = ', m[0]).toBe(true)
    }
    expect(ui('FinanceScreen.tsx')).toMatch(/const typeName = resolveProductClassSafe\(\{[\s\S]{0,200}kind: 'alimentacion'/)
  })
})

describe('Fase 5: escritura — la clasificación automática NO se guarda como decisión de la familia', () => {
  it('products.category solo lo escribe setProductFoodType, y siempre junto con class_confirmed_at', () => {
    const writers = Object.entries(APP)
      .filter(([file, text]) => file !== '/src/data/products.ts' && /from\('products'\)[\s\S]{0,80}\.(update|upsert|insert)\(/.test(text))
      .map(([file]) => file)
    expect(writers).toEqual(['/src/data/foodTypes.ts'])
    const src = APP['/src/data/foodTypes.ts']
    expect(src).toContain('category: name, class_confirmed_at: name ? new Date().toISOString() : null')
    // el alta/compra de un producto no escribe la clase ni la confirmación
    const upsert = APP['/src/data/products.ts'].match(/\.upsert\(\s*\{[^}]*\}/)?.[0] ?? ''
    expect(upsert).toContain('display_name')
    expect(upsert).not.toMatch(/category|class_confirmed_at|non_food/)
  })

  it('guardar un ticket solo escribe la clase si la familia la eligió en esa línea (classOverride); la clase resuelta nunca se persiste', () => {
    const src = APP['/src/ui/FinanceScreen.tsx']
    expect(src).toContain('...(line.classOverride ? [setProductFoodType(productId, line.classOverride.classification || null)] : [])')
    expect(src).not.toMatch(/setProductFoodType\(productId,\s*resolved\./)
    expect(src.match(/setProductFoodType\(/g)).toHaveLength(1)
  })

  it('en Historial, elegir una clase la guarda confirmada y «Automático» la borra (restablecer)', () => {
    const src = APP['/src/ui/ShoppingScreen.tsx']
    expect(src).toContain('await setProductFoodType(detail.productId, nextType || null)')
    expect(src).toContain('classConfirmedAt: nextType ? new Date().toISOString() : null')
    expect(src.match(/setProductFoodType\(/g)).toHaveLength(1)
  })

  it('los webhooks de Mercadona y Amazon nunca escriben la clase del producto (se resuelve al leer)', () => {
    for (const [file, text] of Object.entries(FUNCTIONS)) {
      if (!/mercadona-ticket-webhook|amazon-order-webhook/.test(file)) continue
      const productUpserts = [...text.matchAll(/\.from\("products"\)[\s\S]{0,300}?\.select/g)].map((m) => m[0])
      expect(productUpserts.length, file).toBeGreaterThan(0)
      for (const call of productUpserts) expect(call, file).not.toMatch(/category|class_confirmed_at|non_food/)
    }
  })

  it('una corrección manual permanece privada: solo toca products (RLS por familia) y nunca el aprendizaje compartido', () => {
    const src = APP['/src/data/foodTypes.ts']
    expect(src).not.toMatch(/shared_|resolve_shared|rpc\(/)
    const loader = APP['/src/data/sharedClasses.ts']
    expect(loader).toContain("rpc('resolve_shared_product_classes'")
    expect(loader).not.toMatch(/\.from\(|insert|update|upsert|delete/)
  })
})

describe('Fase 5: privacidad y seguridad de lectura', () => {
  it('a la RPC solo viajan tienda y texto comercial: el cargador no conoce familias, precios, fechas ni tickets', () => {
    const code = (s: string) => s.replace(/\/\/[^\n]*/g, '').replace(/Date\.now/g, '')
    const loader = code(APP['/src/domain/sharedClassLoader.ts'])
    expect(loader).toContain('items: { store: string; text: string }[]')
    expect(loader).not.toMatch(/family|price|amount|receipt|expense|purchase|\bdate\b|recorded/i)
    expect(code(APP['/src/ui/useSharedClasses.ts'])).not.toMatch(/family|price|receipt|expense/i)
  })

  it('el interruptor de seguridad existe y las lecturas lo respetan; el módulo del interruptor no depende de nada', () => {
    expect(APP['/src/ui/useSharedClasses.ts']).toContain('isSharedClassEnabled()')
    expect(APP['/src/state/sharedClassFlag.ts']).not.toMatch(/^import /m)
  })

  it('el resolutor central es puro: no importa la capa de datos ni la interfaz', () => {
    const imports = [...APP['/src/domain/productClass.ts'].matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1])
    expect(imports).toEqual(['./foodTypes'])
    for (const file of ['/src/domain/productClass.ts', '/src/domain/sharedClassLoader.ts']) {
      expect(APP[file], file).not.toMatch(/@\/data|@\/ui|supabase/)
    }
  })
})
