// Contrato de la migración PREPARADA 0323 (formato del envase en product_prices, COMP-2). Se ensayó en una transacción REVERTIDA sobre la base real:
// 1.188 precios con huella idéntica antes y después, formato válido aceptado, formato a medias / cantidad cero / unidad desconocida rechazados.
import { describe, expect, it } from 'vitest'

const FILES = import.meta.glob(['/supabase/pending-migrations/0323_product_price_pack_format.sql', '/supabase/migrations/0323_product_price_pack_format.sql', '/supabase/rollbacks/0323_product_price_pack_format_down.sql'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const UP = Object.entries(FILES).find(([k]) => k.endsWith('0323_product_price_pack_format.sql'))?.[1] as string
const DOWN = Object.entries(FILES).find(([k]) => k.endsWith('0323_product_price_pack_format_down.sql'))?.[1] as string
const code = (sql: string) => sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n')

describe('migración 0323 · formato del envase', () => {
  it('existe con su reversión', () => {
    expect(UP).toBeTruthy()
    expect(DOWN).toBeTruthy()
  })
  it('es aditiva: solo columnas opcionales nuevas y una comprobación; no toca precios, políticas ni datos', () => {
    const c = code(UP)
    expect(c).not.toMatch(/drop table|truncate|delete from|update public\.product_prices|create policy|drop column/i)
    for (const col of ['pack_count numeric(8, 3)', 'pack_amount numeric(12, 3)', 'pack_unit text', 'pack_source text']) expect(c).toContain(`add column if not exists ${col}`)
    expect(c).not.toMatch(/not null/i)
  })
  it('o están los cuatro datos o ninguno, con unidades y orígenes conocidos y cantidades positivas', () => {
    expect(UP).toContain("pack_unit in ('g', 'kg', 'ml', 'l', 'ud')")
    expect(UP).toContain("pack_source in ('ticket', 'nombre', 'recordado', 'manual')")
    expect(UP).toContain('pack_count > 0 and pack_amount > 0')
    expect(UP).toContain('pack_count is null and pack_amount is null and pack_unit is null and pack_source is null')
  })
  it('la reversión solo quita lo nuevo', () => {
    expect(DOWN).toContain('drop column if exists pack_count')
    expect(DOWN).not.toMatch(/delete from|truncate|drop table/i)
  })
})
