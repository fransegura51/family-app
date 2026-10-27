// Migración 0336: identidad del producto confirmada por la familia. Aditiva, con reversión y sin tocar políticas ni datos.
import { describe, expect, it } from 'vitest'
import { CATALOG_ENTRIES } from '@/domain/catalog/catalogData'

const raw = (glob: Record<string, string>) => Object.values(glob)[0] ?? ''
const UP = raw(import.meta.glob('/supabase/migrations/0336_products_catalog_product_key.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
const DOWN = raw(import.meta.glob('/supabase/rollbacks/0336_products_catalog_product_key_down.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)

describe('migración 0336 · products.catalog_product_key', () => {
  const code = UP.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  it('solo añade una columna opcional con su comprobación', () => {
    expect(code).toMatch(/alter table public\.products add column if not exists catalog_product_key text;/)
    expect(code).not.toMatch(/not null|\bdelete\b|\bdrop table\b|\bupdate\b|\binsert\b|policy|truncate/i)
  })
  it('no cambia ningún precio, ticket ni nombre', () => {
    expect(code).not.toMatch(/product_prices|receipts|expenses|display_name|normalized_name/)
  })
  it('se puede revertir quitando solo la columna', () => {
    expect(DOWN).toMatch(/drop column if exists catalog_product_key/)
    expect(DOWN).not.toMatch(/\bdelete from\b|\btruncate\b|\bdrop table\b/i)
  })
  it('todas las claves del catálogo cumplen la comprobación de la columna', () => {
    for (const e of CATALOG_ENTRIES) expect(e.key, e.key).toMatch(/^[a-z0-9_.]{2,80}$/)
  })
})
