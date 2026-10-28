// La hoja de estilos tiene todas sus llaves cerradas. Una llave sin cerrar (se coló en la fusión de NORM-2) hace que el navegador anide TODAS las reglas siguientes dentro de la
// anterior y, en la práctica, no se aplique ninguna: los botones salían pegados y sin formato.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('styles.css', () => {
  it('cada «{» tiene su «}» (ignorando comentarios y textos)', () => {
    const css = readFileSync(join(process.cwd(), 'src/ui/styles.css'), 'utf8')
    let depth = 0
    let line = 1
    let comment = false
    let quote: string | null = null
    for (let i = 0; i < css.length; i++) {
      const c = css[i]
      if (c === '\n') line += 1
      if (comment) {
        if (c === '*' && css[i + 1] === '/') {
          comment = false
          i += 1
        }
        continue
      }
      if (c === '/' && css[i + 1] === '*') {
        comment = true
        i += 1
        continue
      }
      if (quote) {
        if (c === quote) quote = null
        continue
      }
      if (c === '"' || c === "'") {
        quote = c
        continue
      }
      if (c === '{') depth += 1
      if (c === '}') {
        depth -= 1
        expect(depth, `«}» de más en la línea ${line}`).toBeGreaterThanOrEqual(0)
      }
    }
    expect(depth, 'quedan llaves sin cerrar al final de la hoja').toBe(0)
  })
})
