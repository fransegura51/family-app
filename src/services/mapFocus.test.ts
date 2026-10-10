import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { consumeMemberFocus, onMemberFocus, requestMemberFocus } from '@/services/mapFocus'

const focus = { memberId: 'm1', latitude: 38.1, longitude: -0.85 }

describe('mapFocus: «¿dónde está Eric?» abre el mapa centrado en esa persona', () => {
  let listeners: Array<(e: Event) => void>
  beforeEach(() => {
    listeners = []
    vi.stubGlobal('CustomEvent', class { detail: unknown; constructor(public type: string, init?: { detail?: unknown }) { this.detail = init?.detail } })
    vi.stubGlobal('window', {
      dispatchEvent: (e: { detail: unknown }) => listeners.forEach((l) => l(e as unknown as Event)),
      addEventListener: (_t: string, l: (e: Event) => void) => listeners.push(l),
      removeEventListener: (_t: string, l: (e: Event) => void) => { listeners = listeners.filter((x) => x !== l) },
    })
    consumeMemberFocus() // limpia lo que haya quedado de otra prueba
  })
  afterEach(() => vi.unstubAllGlobals())

  it('si la pantalla aún no está abierta, el aviso se queda guardado y se recoge una sola vez', () => {
    requestMemberFocus(focus)
    expect(consumeMemberFocus()).toEqual(focus)
    expect(consumeMemberFocus()).toBeNull()
  })

  it('un aviso de hace más de un minuto ya no vale (no salta al entrar a la pantalla mucho después)', () => {
    requestMemberFocus(focus)
    expect(consumeMemberFocus(Date.now() + 61_000)).toBeNull()
  })

  it('si la pantalla ya está abierta, lo recibe al momento y no se vuelve a aplicar al montar', () => {
    const seen = vi.fn()
    const off = onMemberFocus(seen)
    requestMemberFocus(focus)
    expect(seen).toHaveBeenCalledWith(focus)
    expect(consumeMemberFocus()).toBeNull()
    off()
    requestMemberFocus(focus)
    expect(seen).toHaveBeenCalledTimes(1)
  })
})
