import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadRecentInvitationEmoji, recordRecentInvitationEmoji } from '@/state/invitationRecentEmoji'

// Fase 3 Bloque 3 — "🕘 Recientes" del panel de emoji, localStorage por dispositivo (mismo patrón que
// sharedClassFlag.ts/tabOrder.ts, sin backend nuevo). Entorno de test sin DOM real (node) — se simula
// localStorage con vi.stubGlobal, mismo patrón que sharedClassFlag.test.ts.
function fakeStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('invitationRecentEmoji', () => {
  it('sin nada guardado, devuelve una lista vacía', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    expect(loadRecentInvitationEmoji()).toEqual([])
  })

  it('recordar un emoji lo deja como el más reciente (primero)', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    recordRecentInvitationEmoji('🎂')
    recordRecentInvitationEmoji('❤️')
    expect(loadRecentInvitationEmoji()).toEqual(['❤️', '🎂'])
  })

  it('recordar el mismo emoji otra vez lo mueve al principio, sin duplicarlo', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    recordRecentInvitationEmoji('🎂')
    recordRecentInvitationEmoji('❤️')
    recordRecentInvitationEmoji('🎂')
    expect(loadRecentInvitationEmoji()).toEqual(['🎂', '❤️'])
  })

  it('no crece sin límite — se queda con los 12 más recientes', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    for (let i = 0; i < 20; i++) recordRecentInvitationEmoji(`emoji-${i}`)
    const recent = loadRecentInvitationEmoji()
    expect(recent.length).toBe(12)
    expect(recent[0]).toBe('emoji-19')
  })

  it('si localStorage no está disponible (modo privado/bloqueado), no lanza error — solo se pierde recordar recientes', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
    })
    expect(loadRecentInvitationEmoji()).toEqual([])
    expect(() => recordRecentInvitationEmoji('🎂')).not.toThrow()
  })
})
