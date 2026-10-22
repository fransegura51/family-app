// Guarda contra el fallo que tenía el mecanismo anterior: una preferencia sincronizable escrita con `localStorage.setItem` directamente NO se sube a la cuenta
// (ni avisa a las pantallas). Toda escritura de una clave de la lista cerrada debe pasar por `prefSet` (state/prefs/prefsWrite.ts).
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isSyncedPrefKey } from '@/state/prefs/prefsRegistry'

const SRC = path.resolve(__dirname, '../..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

// Archivos que SÍ pueden escribir en localStorage directamente: el propio sistema de preferencias y el mecanismo anterior (apagado por el interruptor).
const ALLOWED = new Set(['state/prefsSyncLegacy.ts', 'state/prefs/prefsWrite.ts', 'state/prefs/prefsRuntime.ts'].map((f) => path.join(SRC, f)))

function resolveKeyExpr(expr: string, source: string): string | null {
  const literal = /^(['"`])(.*)\1$/.exec(expr.trim())
  if (literal) return literal[2].replace(/\$\{[^}]*\}/g, 'x')
  const name = expr.trim()
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    const decl = new RegExp(`(?:const|let)\\s+${name}\\s*=\\s*(['"\`])([^'"\`]*)\\1`).exec(source)
    if (decl) return decl[2].replace(/\$\{[^}]*\}/g, 'x')
    const fn = new RegExp(`const\\s+${name}\\s*=\\s*\\([^)]*\\)\\s*=>\\s*\`([^\`]*)\``).exec(source)
    if (fn) return fn[1].replace(/\$\{[^}]*\}/g, 'x')
  }
  const call = /^([A-Za-z_][A-Za-z0-9_]*)\(/.exec(name)
  if (call) {
    const fn = new RegExp(`(?:const|function)\\s+${call[1]}\\b[^=]*(?:=\\s*)?[^\`]*\`([^\`]*)\``).exec(source)
    if (fn) return fn[1].replace(/\$\{[^}]*\}/g, 'x')
  }
  return null
}

describe('escrituras de preferencias sincronizables', () => {
  it('ninguna clave de la lista cerrada se escribe con localStorage.setItem directamente fuera del sistema de preferencias', () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      if (ALLOWED.has(file)) continue
      const source = fs.readFileSync(file, 'utf8')
      const re = /(?:window\.)?localStorage\.setItem\(\s*([^,]+?)\s*,/g
      for (const m of source.matchAll(re)) {
        const key = resolveKeyExpr(m[1], source)
        if (key !== null && isSyncedPrefKey(key)) offenders.push(`${path.relative(SRC, file)}: localStorage.setItem(${m[1]}, …) → usa prefSet`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('el detector funciona: reconoce una escritura directa de una clave sincronizable y deja pasar las del dispositivo', () => {
    expect(resolveKeyExpr("'familyapp:color-theme'", '')).toBe('familyapp:color-theme')
    expect(isSyncedPrefKey(resolveKeyExpr('KEY', "const KEY = 'familyapp:compras-menu-layout'") as string)).toBe(true)
    expect(isSyncedPrefKey(resolveKeyExpr('KEY', "const KEY = 'familyapp:location-sharing-member-id'") as string)).toBe(false)
  })

  it('las preferencias del menú inferior y compañía escriben con prefSet', () => {
    const tab = fs.readFileSync(path.join(SRC, 'state/tabOrder.ts'), 'utf8')
    expect(tab).toContain('prefSet(storageKey(key)')
    expect(tab).not.toContain('localStorage.setItem')
  })
})
