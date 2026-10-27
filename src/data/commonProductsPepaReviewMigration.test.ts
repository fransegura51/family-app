// Contrato de la migración 0333 (agrupación automática del comparador: grupos propuestos por PEPA pendientes de revisar), APLICADA en producción el 27/10/2026.
// Se aplicó sobre la base real sin cambiar ninguna fila existente (huellas de product_prices, products y receipts idénticas antes y después).
import { describe, expect, it } from 'vitest'

const FILES = import.meta.glob(['/supabase/pending-migrations/0333_common_products_pepa_review.sql', '/supabase/migrations/0333_common_products_pepa_review.sql', '/supabase/rollbacks/0333_common_products_pepa_review_down.sql'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const UP = Object.entries(FILES).find(([k]) => k.endsWith('0333_common_products_pepa_review.sql'))?.[1] as string
const DOWN = Object.entries(FILES).find(([k]) => k.endsWith('0333_common_products_pepa_review_down.sql'))?.[1] as string
const code = (sql: string) => sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n')

describe('migración 0333 · grupos de PEPA pendientes de revisar', () => {
  it('existe con su reversión y los $$ están emparejados', () => {
    expect(UP).toBeTruthy()
    expect(DOWN).toBeTruthy()
    for (const sql of [UP, DOWN]) expect((code(sql).match(/\$\$/g) ?? []).length % 2).toBe(0)
  })
  it('es aditiva: los grupos que ya existían quedan confirmados y no se toca ningún dato ni precio', () => {
    const c = code(UP)
    expect(c).toContain("add column if not exists status text not null default 'confirmed'")
    expect(c).not.toMatch(/drop table|truncate|delete from|update public\./i)
    expect(c).not.toMatch(/product_prices|receipts|expenses/i)
  })
  it('solo permite los estados y orígenes previstos', () => {
    expect(UP).toContain("check (status in ('confirmed', 'pending'))")
    expect(UP).toContain("check (source in ('sugerido', 'manual', 'auto', 'pepa'))")
  })
  it('los rechazos son de la familia: RLS, política por familia, guarda y permisos mínimos', () => {
    expect(UP).toContain('alter table public.common_product_auto_rejects enable row level security')
    expect(UP).toContain('create policy "common_product_auto_rejects: family crud" on public.common_product_auto_rejects')
    expect(UP).toContain('using (family_id = (select private.current_family_id()))')
    expect(UP).toContain('el artículo no es de tu familia')
    expect(UP).toContain('revoke all on public.common_product_auto_rejects from public, anon, authenticated')
  })
  it('la reversión quita solo lo propuesto por PEPA y conserva los grupos de la familia', () => {
    const d = code(DOWN)
    expect(d).toContain("c.status = 'pending'")
    expect(d).toContain("where status = 'pending'")
    expect(d).toContain('drop table if exists public.common_product_auto_rejects')
    expect(d).not.toMatch(/product_prices|receipts/i)
  })
})
