import { describe, expect, it } from 'vitest'

// Guardas de la FASE 6C.2D: el webhook de Amazon deja de usar una categoría financiera («Amazon») y escribe NULL («Pendiente de
// clasificar»); la categoría personal «Amazon» de Familia Hepburn se retira (migración 0151) con precondiciones exactas y reversibles.
const APP = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const FUNCTIONS = import.meta.glob('/supabase/functions/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const AMAZON = FUNCTIONS['/supabase/functions/amazon-order-webhook/index.ts']
const MERCADONA = FUNCTIONS['/supabase/functions/mercadona-ticket-webhook/index.ts']
const BANK = FUNCTIONS['/supabase/functions/enable-banking-sync-transactions/index.ts']
const ROLLBACKS = import.meta.glob('/supabase/rollbacks/0151_retire_amazon_financial_category_down.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const RETIRE = MIGRATIONS['/supabase/migrations/0151_retire_amazon_financial_category.sql'].replace(/--[^\n]*/g, '')
const RETIRE_ROLLBACK = ROLLBACKS['/supabase/rollbacks/0151_retire_amazon_financial_category_down.sql']

describe('A/B/C/D/E. webhook de Amazon: pedido nuevo → «Pendiente de clasificar», no una categoría inventada', () => {
  it('A/B. el gasto y el ticket se insertan con category: null (nunca "Amazon", "Otros" ni ninguna otra)', () => {
    expect(AMAZON).toContain('category: null,')
    expect((AMAZON.match(/category: null,/g) ?? []).length).toBe(2)
    expect(AMAZON).not.toMatch(/category:\s*"(Amazon|Otros|Regalos y compras varias|Alimentación)"/)
  })

  it('C. la tienda sigue siendo literalmente "Amazon" en el gasto, el ticket y cada precio', () => {
    expect((AMAZON.match(/store: "Amazon",/g) ?? []).length).toBe(3)
  })

  it('D. el ticket sigue enlazado al gasto por expense_id (mismo mecanismo que antes)', () => {
    expect(AMAZON).toContain('expense_id: expenseId,')
  })

  it('E. el importe total no cambia: sigue siendo `total`, igual que antes', () => {
    expect(AMAZON).toContain('amount: total,')
    expect(AMAZON).toContain('total_amount: total,')
  })

  it('R. nunca se persiste el texto "Pendiente de clasificar" como VALOR de category: solo aparece en comentarios explicativos', () => {
    expect(AMAZON).not.toMatch(/category:\s*['"]Pendiente de clasificar['"]/i)
  })

  it('2/3. no clasifica el gasto a partir de los productos del pedido (aunque sean café, ropa...); no toca products.category/non_food', () => {
    const code = AMAZON.replace(/\/\/[^\n]*/g, '') // fuera de los comentarios explicativos (que sí mencionan classify_purchase como referencia)
    expect(code).not.toMatch(/non_food|class_confirmed_at|resolveProductClass|\.classify\(/i)
    // el upsert de producto solo lleva identidad, igual que antes de 6C.2D
    expect(AMAZON).toMatch(/family_id[^{}]*normalized_name[^{}]*display_name/s)
  })

  it('23. autenticación y resolución de familia intactas: token uuid, families.amazon_webhook_token, sin JWT', () => {
    expect(AMAZON).toContain('UUID_RE.test(token)')
    expect(AMAZON).toContain('.eq("amazon_webhook_token", token)')
    expect(AMAZON).toContain('missing token')
  })
})

describe('S. código activo: Amazon ya no es un fallback de categoría financiera', () => {
  it('ningún archivo activo asigna la categoría financiera "Amazon" a un gasto o un ticket', () => {
    const offenders = Object.entries({ ...APP, ...FUNCTIONS }).filter(([, t]) => /category:\s*"Amazon"|category:\s*'Amazon'/.test(t))
    expect(offenders.map(([f]) => f)).toEqual([])
  })

  it('ninguna regla activa equivale a store Amazon → categoría financiera, ni Amazon → non_food/FOOD/OTHER', () => {
    const rule = /amazon[^\n]{0,80}(=>|:)\s*['"](Amazon|Otros|Regalos y compras varias|Alimentación)['"]/i
    expect(Object.values(APP).some((t) => rule.test(t))).toBe(false)
    expect(Object.values(FUNCTIONS).some((t) => rule.test(t))).toBe(false)
    expect(Object.values(APP).some((t) => /store\s*!==?\s*'amazon'|store\.trim\(\)\.toLowerCase\(\)\s*!==\s*'amazon'/i.test(t))).toBe(false)
  })

  it('distingue histórico de código activo: ninguna migración nueva CREA o ASIGNA la categoría financiera Amazon (salvo 0148/0151, ya cerradas)', () => {
    for (const [file, sql] of Object.entries(MIGRATIONS)) {
      if (/014[8]|0151/.test(file)) continue
      const code = sql.replace(/--[^\n]*/g, '')
      expect(code, file).not.toMatch(/insert\s+into\s+public\.budget_categories[^;]*'Amazon'/i)
      expect(code, file).not.toMatch(/set\s+category\s*=\s*'Amazon'/i)
    }
  })
})

describe('T/U/V/W. no se toca lo que no toca esta fase', () => {
  it('T. Mercadona sigue escribiendo "Alimentación" literal en gasto y ticket', () => {
    expect((MERCADONA.match(/category: "Alimentación"/g) ?? []).length).toBe(2)
    expect(MERCADONA).not.toMatch(/category:\s*null/)
  })

  it('U. el banco no cambia: mismo fallback "Otros", mismas reglas, Repsol intacto, sin category: null', () => {
    expect(BANK).toContain('return familyCategoryNames.has("Otros") ? "Otros" : [...familyCategoryNames][0] ?? "Otros"')
    expect(BANK).toContain('{ keywords: ["repsol", "cepsa", "galp", "shell", "gasolinera", "estacion de servicio", "petroprix", "ballenoil"], category: "Combustible" }')
    expect(BANK).not.toMatch(/category:\s*null/)
  })

  it('V. la evidencia transitoria ticket_alimentacion (6C.2B) sigue en el resolutor de naturaleza de producto', () => {
    const products = APP['/src/domain/products.ts']
    expect(products).toContain("basis: 'ticket_alimentacion'")
  })

  it('W. el histórico ya cerrado (0148) no se toca: sigue siendo la única migración que reclasifica filas concretas de Amazon', () => {
    expect(MIGRATIONS['/supabase/migrations/0148_amazon_food_kind_cleanup.sql']).toContain("c_receipt constant uuid := '02c189b8-35a0-4502-91e9-0947d68004ff'")
  })
})

describe('X/Y/Z. retirada de la categoría financiera Amazon (migración 0151)', () => {
  it('X. localiza la fila exacta de Hepburn por id y exige 0 referencias antes de borrar (expenses, receipts, budgets, event_budget_items)', () => {
    expect(RETIRE).toContain("c_family constant uuid := '011429a4-4fd8-4341-9c04-ec6b2f585196'")
    expect(RETIRE).toContain("c_id constant uuid := '01c117c1-c867-4180-b0ad-887de57a3501'")
    for (const table of ['expenses', 'receipts', 'budgets', 'event_budget_items']) {
      expect(RETIRE, table).toContain(`from public.${table} where family_id = c_family and category = 'Amazon'`)
    }
    expect(RETIRE).toContain('v_row.catalog_key is not null') // no es una categoría del catálogo estándar
    expect(RETIRE).toContain('delete from public.budget_categories where id = c_id;')
  })

  it('no borra por nombre global: el DELETE va por id, nunca "where name = \'Amazon\'" sin más', () => {
    const deletes = [...RETIRE.matchAll(/delete\s+from\s+([^\s;]+)[^;]*;/gi)].map((m) => m[0].replace(/\s+/g, ' '))
    expect(deletes).toEqual(["delete from public.budget_categories where id = c_id;"])
  })

  it('Z. Familia Demo queda intacta: la migración comprueba explícitamente que su categoría Amazon sigue existiendo', () => {
    expect(RETIRE).toContain("where family_id = (select id from public.families where name = 'Familia Demo') and name = 'Amazon'")
    expect(RETIRE).not.toMatch(/update\s+public\.budget_categories[^;]*Demo/i)
  })

  it('copia antes de borrar (reversibilidad) y las únicas escrituras son el log y el borrado de esa fila', () => {
    expect(RETIRE.indexOf('insert into public.amazon_category_retirement_log')).toBeLessThan(RETIRE.indexOf('delete from public.budget_categories'))
    expect(RETIRE).not.toMatch(/\b(insert\s+into\s+public\.budget_categories|update\s+public\.budget_categories)\b/i)
  })

  it('Y. el rollback restaura la fila EXACTA (mismo id, sin generar uno nuevo) y solo la de Hepburn', () => {
    expect(RETIRE_ROLLBACK).toContain('jsonb_populate_record(null::public.budget_categories, l.before)')
    expect(RETIRE_ROLLBACK).toContain("where l.family_id = '011429a4-4fd8-4341-9c04-ec6b2f585196'")
    expect(RETIRE_ROLLBACK).toContain('on conflict (id) do nothing')
    expect(RETIRE_ROLLBACK).not.toMatch(/gen_random_uuid|default\s+gen_random_uuid/i)
    // el rollback no ESCRIBE nada de Familia Demo (el comentario explicativo sí la menciona)
    const code = RETIRE_ROLLBACK.replace(/--[^\n]*/g, '')
    expect(code).not.toMatch(/Demo/i)
  })

  it('nada del código de la aplicación necesita ya la categoría Amazon (no hay referencia activa a esa fila ni a su nombre como fallback)', () => {
    expect(Object.values(APP).some((t) => /budget_categories[^\n]*Amazon|Amazon[^\n]*budget_categories/i.test(t))).toBe(false)
  })
})
