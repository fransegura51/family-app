import { describe, expect, it } from 'vitest'

// Guardas de 0183_store_chains_catalog_expansion.sql — completa el catálogo base de cadenas
// (Carrefour, Eroski, Dia, Alcampo, El Corte Inglés, Hipercor) sin tocar ninguna fila ya sembrada por
// 0142 ni por ninguna familia.
const FILES = import.meta.glob(
  ['/supabase/migrations/0183_store_chains_catalog_expansion.sql', '/supabase/rollbacks/0183_store_chains_catalog_expansion_down.sql'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0183_store_chains_catalog_expansion.sql']
const ROLLBACK = FILES['/supabase/rollbacks/0183_store_chains_catalog_expansion_down.sql']
const SQL = MIGRATION.replace(/--[^\n]*/g, '')

describe('0183: catálogo base de cadenas', () => {
  it('añade exactamente las 6 cadenas que faltaban, todas kind=supermarket y learnable=false (sin evidencia de ticket)', () => {
    for (const key of ['carrefour', 'eroski', 'dia', 'alcampo', 'el_corte_ingles', 'hipercor']) {
      expect(SQL, key).toMatch(new RegExp(`\\('${key}',\\s*'[^']*',\\s*'supermarket',\\s*false`))
    }
  })

  it('El Corte Inglés e Hipercor son DOS cadenas independientes — ningún alias de una nombra a la otra (las notas SÍ pueden explicar la relación, eso es solo documentación)', () => {
    const aliasesBlock = SQL.slice(SQL.indexOf('insert into public.store_chain_aliases'))
    const corteInglesAlias = aliasesBlock.slice(aliasesBlock.indexOf("'el_corte_ingles'"), aliasesBlock.indexOf("'hipercor'"))
    expect(corteInglesAlias).not.toMatch(/hipercor/i)
    const hipercorAlias = aliasesBlock.slice(aliasesBlock.lastIndexOf("('hipercor'"))
    expect(hipercorAlias).not.toMatch(/corte ingles/i)
  })

  it('"Dia" no lleva alias propio (alias_norm < 4 caracteres violaría el constraint de 0142) — se documenta, no se inventa uno más largo', () => {
    const aliasesBlock = SQL.slice(SQL.indexOf('insert into public.store_chain_aliases'))
    expect(aliasesBlock).not.toMatch(/\('dia',/)
    expect(MIGRATION).toMatch(/"Dia" se queda sin alias propio a propósito/)
  })

  it('las otras 5 cadenas nuevas sí llevan un alias exacto con su propio nombre normalizado', () => {
    for (const [key, alias] of [
      ['carrefour', 'carrefour'],
      ['eroski', 'eroski'],
      ['alcampo', 'alcampo'],
      ['el_corte_ingles', 'el corte ingles'],
      ['hipercor', 'hipercor'],
    ]) {
      expect(SQL, key).toMatch(new RegExp(`\\('${key}',\\s*'${alias}',\\s*'exact'`))
    }
  })

  it('no toca ninguna cadena ya sembrada por 0142 ni ninguna otra tabla — puramente aditiva', () => {
    expect(SQL).not.toMatch(/\bupdate\s+(?:only\s+)?(?:public\.)?\w+\s+set\b/i)
    expect(SQL).not.toMatch(/\bdelete from\b|\btruncate\b|\bdrop\b|\balter table\b/i)
    for (const existing of ['mercadona', 'hiperber', 'charter', 'consum', 'aldi', 'lidl', 'repsol', 'amazon', 'macro_asia']) {
      expect(SQL, existing).not.toMatch(new RegExp(`'${existing}',\\s*'[^']*',\\s*'`))
    }
  })

  it('no toca shopping_stores — ninguna tienda ya creada a mano por una familia se ve afectada', () => {
    expect(SQL).not.toMatch(/shopping_stores/i)
  })

  it('el rollback borra solo lo añadido aquí, nunca con delete/truncate sobre otra tabla', () => {
    const statements = ROLLBACK.replace(/--[^\n]*/g, '')
    expect(statements).toContain("delete from public.store_chains where key in ('carrefour', 'eroski', 'dia', 'alcampo', 'el_corte_ingles', 'hipercor')")
    expect(statements).not.toMatch(/shopping_stores|truncate/i)
  })
})
