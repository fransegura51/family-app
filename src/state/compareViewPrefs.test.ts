// @vitest-environment jsdom
// Preferencias del Comparador de precios (modo y ordenación): valores por defecto, persistencia local y la dependencia del interruptor con la migración 0343.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMPARE_MODE_KEY, COMPARE_SORT_KEY, readCompareMode, readCompareSort } from '@/state/compareViewPrefs'
import { COMPARE_PREFS_SYNC_ENABLED, FAMILY_PREF_PATTERN_SOURCES, isSyncedPrefKey } from '@/state/prefs/prefsRegistry'

const root = process.cwd()

describe('preferencias del Comparador', () => {
  it('por defecto: productos idénticos y por categoría; los valores raros se ignoran', () => {
    localStorage.clear()
    expect(readCompareMode()).toBe('identicos')
    expect(readCompareSort()).toBe('categoria')
    localStorage.setItem(COMPARE_MODE_KEY, 'alternativas')
    localStorage.setItem(COMPARE_SORT_KEY, 'precio')
    expect(readCompareMode()).toBe('alternativas')
    expect(readCompareSort()).toBe('precio')
    localStorage.setItem(COMPARE_MODE_KEY, 'otra-cosa')
    expect(readCompareMode()).toBe('identicos')
    localStorage.clear()
  })
  it('las dos claves cumplen el patrón que acepta el servidor (familiares, migración 0343)', () => {
    const re = FAMILY_PREF_PATTERN_SOURCES.map((s) => new RegExp(s))
    for (const k of [COMPARE_MODE_KEY, COMPARE_SORT_KEY]) expect(re.some((r) => r.test(k)), k).toBe(true)
    expect(re.some((r) => r.test('familyapp:compras-compare-otra'))).toBe(false)
  })
  it('no viajan entre dispositivos hasta aplicar la migración 0343: el interruptor depende de que esté entre las aplicadas', () => {
    const applied = existsSync(join(root, 'supabase/migrations/0343_family_prefs.sql'))
    if (COMPARE_PREFS_SYNC_ENABLED) {
      expect(applied, 'interruptor encendido sin la migración 0343 aplicada').toBe(true)
      expect(isSyncedPrefKey(COMPARE_MODE_KEY)).toBe(true)
    } else {
      expect(existsSync(join(root, 'supabase/pending-migrations/0343_family_prefs.sql'))).toBe(true)
      expect(isSyncedPrefKey(COMPARE_MODE_KEY)).toBe(false)
    }
    expect(existsSync(join(root, 'supabase/rollbacks/0343_family_prefs_down.sql'))).toBe(true)
  })
})
