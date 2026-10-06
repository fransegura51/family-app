import { beforeEach, describe, expect, it } from 'vitest'
import { loadConfiguratorOpen, loadStoredConfiguratorOpen, saveConfiguratorOpen } from '@/state/eventPlanningConfiguratorState'

// Memoria mínima de localStorage para el entorno de test (sin depender de jsdom).
const store = new Map<string, string>()
const fakeStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
}
Object.defineProperty(globalThis, 'localStorage', { value: fakeStorage, configurable: true })

beforeEach(() => store.clear())

describe('loadStoredConfiguratorOpen — solo lo guardado', () => {
  it('devuelve null si el bloque nunca se ha tocado (para que el primer bloque empiece plegado)', () => {
    expect(loadStoredConfiguratorOpen('ev1', 'celebracion')).toBeNull()
  })

  it('devuelve el valor exacto guardado tras cerrar o abrir', () => {
    saveConfiguratorOpen('ev1', 'celebracion', false)
    expect(loadStoredConfiguratorOpen('ev1', 'celebracion')).toBe(false)
    saveConfiguratorOpen('ev1', 'celebracion', true)
    expect(loadStoredConfiguratorOpen('ev1', 'celebracion')).toBe(true)
  })

  it('el estado de un evento no afecta a otro evento', () => {
    saveConfiguratorOpen('ev1', 'celebracion', true)
    expect(loadStoredConfiguratorOpen('ev2', 'celebracion')).toBeNull()
  })
})

describe('loadConfiguratorOpen — comportamiento anterior intacto para los demás bloques', () => {
  it('sigue abriendo por defecto cuando no hay nada guardado', () => {
    expect(loadConfiguratorOpen('ev1', 'pareja')).toBe(true)
    expect(loadConfiguratorOpen('ev1')).toBe(true)
  })
})
