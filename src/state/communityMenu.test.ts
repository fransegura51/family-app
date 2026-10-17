import { beforeEach, describe, expect, it } from 'vitest'
import {
  activeCommunityMenuKey,
  loadCommunityMenuOrder,
  loadCommunityPinned,
  moveMenuKey,
  sanitizeCommunityMenuOrder,
  sanitizeCommunityPinned,
  saveCommunityMenuOrder,
  saveCommunityPinned,
} from '@/state/communityMenu'

// localStorage mínimo (el entorno de pruebas no trae navegador).
function installStorage(): Record<string, string> {
  const store: Record<string, string> = {}
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v
    },
    removeItem: (k: string) => {
      delete store[k]
    },
    clear: () => undefined,
    key: () => null,
    length: 0,
  } as Storage
  return store
}

describe('menú de Comunidad (☰ Menú)', () => {
  beforeEach(() => {
    installStorage()
  })

  it('por defecto: Portada, Recetas y cocina, Hogar y familia y nada «sacado» a la pantalla', () => {
    expect(loadCommunityMenuOrder()).toEqual(['portada', 'recetas', 'hogar'])
    expect(loadCommunityPinned()).toEqual([])
  })

  it('lo guardado dañado o incompleto se completa y se limpia', () => {
    expect(sanitizeCommunityMenuOrder(['hogar', 'raro', 'hogar'])).toEqual(['hogar', 'portada', 'recetas'])
    expect(sanitizeCommunityMenuOrder('no')).toEqual(['portada', 'recetas', 'hogar'])
    expect(sanitizeCommunityPinned(['recetas', 'recetas', 'x'])).toEqual(['recetas'])
    expect(sanitizeCommunityPinned(null)).toEqual([])
  })

  it('el orden y los accesos sacados se guardan en este móvil (sin consultas al servidor)', () => {
    saveCommunityMenuOrder(['recetas', 'hogar', 'portada'])
    saveCommunityPinned(['hogar'])
    expect(loadCommunityMenuOrder()).toEqual(['recetas', 'hogar', 'portada'])
    expect(loadCommunityPinned()).toEqual(['hogar'])
  })

  it('marca el destino de la dirección actual y ninguno en las demás pantallas', () => {
    expect(activeCommunityMenuKey('/comunidad')).toBe('portada')
    expect(activeCommunityMenuKey('/comunidad/')).toBe('portada')
    expect(activeCommunityMenuKey('/comunidad/s/recetas')).toBe('recetas')
    expect(activeCommunityMenuKey('/comunidad/s/hogar')).toBe('hogar')
    expect(activeCommunityMenuKey('/comunidad/p/abc')).toBeNull()
    expect(activeCommunityMenuKey('/comunidad/buscar')).toBeNull()
  })

  it('subir y bajar un destino; en los extremos no hace nada', () => {
    const o = ['portada', 'recetas', 'hogar'] as const
    expect(moveMenuKey(o, 'hogar', -1)).toEqual(['portada', 'hogar', 'recetas'])
    expect(moveMenuKey(o, 'portada', -1)).toEqual([...o])
    expect(moveMenuKey(o, 'hogar', 1)).toEqual([...o])
  })
})
