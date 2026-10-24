// Comprobaciones de sintaxis BÁSICA de las migraciones preparadas, para que un error de edición no llegue a producción.
// (Motivo: el 24/10/2026 una edición automática dejó `$` en vez de `$$` en una función de 0312 y habría fallado al aplicarla.)
import { describe, expect, it } from 'vitest'

const FILES = import.meta.glob('/supabase/{pending-migrations,rollbacks}/03{10,11,12}_*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('migraciones preparadas (0310, 0311, 0312) y sus reversiones', () => {
  it('hay seis archivos', () => {
    expect(Object.keys(FILES)).toHaveLength(6)
  })

  for (const [path, sql] of Object.entries(FILES)) {
    const name = path.split('/').pop() as string

    it(`${name}: los delimitadores $$ están emparejados y cada cuerpo de función se cierra con $$;`, () => {
      const lines = sql.split('\n')
      const loose = lines.filter((l) => l.includes('$') && !l.includes('$$'))
      expect(loose, 'líneas con $ suelto').toEqual([])
      const total = (sql.match(/\$\$/g) ?? []).length
      expect(total % 2, 'número impar de $$').toBe(0)
      const opens = (sql.match(/\bas \$\$/g) ?? []).length
      const closes = lines.filter((l) => /^\$\$;\s*$/.test(l)).length
      expect(closes, 'cada «as $$» debe cerrarse con una línea «$$;»').toBe(opens)
    })

    it(`${name}: los paréntesis y las comillas simples están equilibrados fuera de los comentarios`, () => {
      const code = sql
        .split('\n')
        .map((l) => l.replace(/--.*$/, ''))
        .join('\n')
      // las comillas simples van por pares (se descartan las dobles escapadas '')
      const quotes = (code.replace(/''/g, '').match(/'/g) ?? []).length
      expect(quotes % 2, 'comillas simples impares').toBe(0)
      const open = (code.match(/\(/g) ?? []).length
      const close = (code.match(/\)/g) ?? []).length
      expect(open).toBe(close)
    })

    it(`${name}: cada sentencia termina en punto y coma`, () => {
      // Se quitan comentarios y cuerpos entre $$ y se comprueba que el resto termina en ';'
      const stripped = sql
        .replace(/\$\$[\s\S]*?\$\$/g, '$$$$')
        .split('\n')
        .map((l) => l.replace(/--.*$/, '').trimEnd())
        .filter((l) => l.trim() !== '')
      expect(stripped.length).toBeGreaterThan(0)
      expect(stripped[stripped.length - 1].endsWith(';'), 'el archivo debe acabar en ;').toBe(true)
    })
  }
})
