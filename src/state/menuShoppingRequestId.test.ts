import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPendingMenuShoppingRequestId, pendingMenuShoppingRequestId } from '@/state/menuShoppingRequestId'

function fakeStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

afterEach(() => vi.unstubAllGlobals())

// Bloque D (compra del menú): el requestId de add_menu_shopping_lines (idempotente en servidor, migración
// 0203) ya no vive solo en memoria — persiste por evento, para distinguir "estoy reintentando la misma
// confirmación" (reutiliza el id) de "quiero otra compra nueva" (id distinto, tras liberar el anterior).
describe('identidad persistente de la confirmación de compra', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage())
  })

  it('mismo evento, sin confirmar aún: devuelve siempre el mismo id (reintento, nunca duplica)', () => {
    const a = pendingMenuShoppingRequestId('evento-1')
    const b = pendingMenuShoppingRequestId('evento-1')
    expect(a).toBe(b)
  })

  it('eventos distintos: ids distintos, nunca se mezclan', () => {
    const a = pendingMenuShoppingRequestId('evento-1')
    const b = pendingMenuShoppingRequestId('evento-2')
    expect(a).not.toBe(b)
  })

  it('tras liberar (confirmación resuelta con éxito), la siguiente compra del mismo evento es una operación nueva', () => {
    const first = pendingMenuShoppingRequestId('evento-1')
    clearPendingMenuShoppingRequestId('evento-1')
    const second = pendingMenuShoppingRequestId('evento-1')
    expect(second).not.toBe(first)
  })

  it('simula cierre de la app justo tras confirmar y volver a abrir: antes de liberar, sigue siendo el mismo id (reintento por respuesta perdida)', () => {
    const first = pendingMenuShoppingRequestId('evento-1')
    // "Vuelve a abrir la app" = nueva llamada, sin haber podido limpiar nada porque no llegó respuesta.
    const retry = pendingMenuShoppingRequestId('evento-1')
    expect(retry).toBe(first)
  })

  it('si localStorage lanza (privado/bloqueado), no rompe: genera un id igualmente (sin persistencia entre cierres)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    })
    expect(() => pendingMenuShoppingRequestId('evento-1')).not.toThrow()
    expect(() => clearPendingMenuShoppingRequestId('evento-1')).not.toThrow()
  })
})

const MODAL = (import.meta.glob('/src/ui/MenuShoppingModal.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/MenuShoppingModal.tsx']

describe('MenuShoppingModal usa la identidad persistente, no un id en memoria suelto', () => {
  it('pide el id persistente al montar, por evento', () => {
    expect(MODAL).toContain('const [requestId] = useState(() => pendingMenuShoppingRequestId(eventId))')
    expect(MODAL).not.toContain('crypto.randomUUID()')
  })
  it('libera el id SOLO tras confirmar con éxito (antes de avisar y cerrar), nunca antes', () => {
    const body = MODAL.slice(MODAL.indexOf('async function confirm()'), MODAL.indexOf('async function confirm()') + 600)
    const addIdx = body.indexOf('await addMenuShoppingLines(')
    const clearIdx = body.indexOf('clearPendingMenuShoppingRequestId(eventId)')
    expect(addIdx).toBeGreaterThan(-1)
    expect(clearIdx).toBeGreaterThan(addIdx)
  })
})
