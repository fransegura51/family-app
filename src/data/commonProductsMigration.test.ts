// Contrato de la migración 0331 (productos comunes del comparador, COMP-3), APLICADA en producción el 27/10/2026. Se ensayó antes en una transacción REVERTIDA: un artículo solo en un
// producto común, artículo de otra familia rechazado, nombre repetido rechazado, otra familia no ve ni borra nada, borrar el grupo no toca artículos (huella de products idéntica).
import { describe, expect, it } from 'vitest'

const FILES = import.meta.glob(['/supabase/pending-migrations/0331_common_products.sql', '/supabase/migrations/0331_common_products.sql', '/supabase/rollbacks/0331_common_products_down.sql'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const UP = Object.entries(FILES).find(([k]) => k.endsWith('0331_common_products.sql'))?.[1] as string
const DOWN = Object.entries(FILES).find(([k]) => k.endsWith('0331_common_products_down.sql'))?.[1] as string
const code = (sql: string) => sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n')

describe('migración 0331 · productos comunes', () => {
  it('existe con su reversión y los $$ están emparejados', () => {
    expect(UP).toBeTruthy()
    expect(DOWN).toBeTruthy()
    for (const sql of [UP, DOWN]) expect((code(sql).match(/\$\$/g) ?? []).length % 2).toBe(0)
  })
  it('es aditiva: no borra ni altera datos, políticas ni precios existentes', () => {
    const c = code(UP)
    expect(c).not.toMatch(/drop table|truncate|delete from|update public\.|drop column/i)
    expect(c).not.toMatch(/create policy[^;]*on public\.(products|product_prices|product_equivalences)\b/i)
  })
  it('todo es de la familia: RLS en las tres tablas, política por familia y guardas que impiden unir artículos de otra familia', () => {
    for (const t of ['common_products', 'common_product_members', 'common_product_skips']) {
      expect(UP).toContain(`alter table public.${t} enable row level security`)
      expect(UP).toContain(`create policy "${t}: family crud" on public.${t}`)
    }
    expect(UP).toContain('using (family_id = (select private.current_family_id()))')
    expect(UP).toContain('el artículo no es de tu familia')
    expect(UP).toContain('el producto común no es de tu familia')
  })
  it('un artículo pertenece a un solo producto común y no hay dos productos comunes con el mismo nombre en una familia', () => {
    expect(UP).toContain('product_id uuid primary key references public.products(id) on delete cascade')
    expect(UP).toContain('unique (family_id, normalized_name)')
  })
  it('privilegios mínimos: nada para anon y solo CRUD para authenticated', () => {
    expect(UP).toContain('revoke all on public.common_products, public.common_product_members, public.common_product_skips from public, anon, authenticated;')
    expect(UP).toContain('grant select, insert, update, delete on public.common_products, public.common_product_members, public.common_product_skips to authenticated;')
  })
  it('el código de barras es opcional y solo admite 8 a 14 dígitos', () => {
    expect(UP).toContain('add column if not exists ean text')
    expect(UP).toContain("ean ~ '^[0-9]{8,14}$'")
  })
  it('la reversión quita solo lo nuevo', () => {
    expect(DOWN).toContain('drop table if exists public.common_products;')
    expect(DOWN).toContain('drop column if exists ean')
    expect(DOWN).not.toMatch(/delete from|truncate/i)
  })
})
