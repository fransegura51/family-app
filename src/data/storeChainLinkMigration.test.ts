import { describe, expect, it } from 'vitest'

// Guardas de 0182_store_chains_logo_and_shopping_link.sql — enlaza el catálogo global de cadenas
// (store_chains, Fase 3 de 0142) con las tiendas propias de cada familia (shopping_stores), sin tocar
// ninguna fila existente ni ninguna otra tabla.
const FILES = import.meta.glob(
  ['/supabase/migrations/0182_store_chains_logo_and_shopping_link.sql', '/supabase/rollbacks/0182_store_chains_logo_and_shopping_link_down.sql'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0182_store_chains_logo_and_shopping_link.sql']
const ROLLBACK = FILES['/supabase/rollbacks/0182_store_chains_logo_and_shopping_link_down.sql']
const SQL = MIGRATION.replace(/--[^\n]*/g, '')

describe('0182: store_chains.logo_asset + shopping_stores.chain_key', () => {
  it('logo_asset es una columna nueva, nullable, en store_chains', () => {
    expect(SQL).toContain('alter table public.store_chains')
    expect(SQL).toContain('add column logo_asset text')
    expect(SQL).not.toMatch(/logo_asset text not null/)
  })

  it('chain_key es nullable, referencia store_chains(key) y actualiza en cascada por si una clave cambiara', () => {
    expect(SQL).toContain('alter table public.shopping_stores')
    expect(SQL).toContain('add column chain_key text')
    expect(SQL).toContain('references public.store_chains(key) on update cascade')
    expect(SQL).not.toMatch(/chain_key text not null/)
    expect(SQL).not.toMatch(/on delete cascade/)
  })

  it('crea un índice por chain_key', () => {
    expect(SQL).toContain('create index idx_shopping_stores_chain_key on public.shopping_stores(chain_key)')
  })

  it('no toca ninguna fila existente ni ninguna otra tabla — puramente aditiva', () => {
    // "on update cascade"/"on delete ..." son cláusulas de la FK, no sentencias UPDATE/DELETE reales —
    // se excluyen explícitamente para no dar un falso positivo.
    expect(SQL).not.toMatch(/\binsert into\b|\bdelete from\b|\btruncate\b|\bdrop\b/i)
    expect(SQL).not.toMatch(/(?<!on )\bupdate\s+(?:only\s+)?(?:public\.)?\w+\s+set\b/i)
    const altered = [...SQL.matchAll(/alter table\s+(\S+)/gi)].map((m) => m[1])
    expect(altered.every((t) => t === 'public.store_chains' || t === 'public.shopping_stores')).toBe(true)
  })

  it('el rollback quita solo lo añadido aquí', () => {
    const statements = ROLLBACK.replace(/--[^\n]*/g, '')
    expect(statements).toContain('drop index if exists public.idx_shopping_stores_chain_key')
    expect(statements).toContain('drop column if exists chain_key')
    expect(statements).toContain('drop column if exists logo_asset')
    expect(statements).not.toMatch(/drop table|delete from|truncate/i)
  })
})
