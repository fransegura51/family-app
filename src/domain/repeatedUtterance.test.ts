import { describe, expect, it } from 'vitest'
import { isRepeatedUtterance, REPEATED_UTTERANCE_WINDOW_MS, type LastUtterance } from './repeatedUtterance'

describe('isRepeatedUtterance', () => {
  it('la misma frase dos veces seguidas es una repetición', () => {
    const last: { current: LastUtterance | null } = { current: null }
    expect(isRepeatedUtterance(last, 'Tarea sacar la basura', 1000)).toBe(false)
    expect(isRepeatedUtterance(last, 'tarea sacar la basura.', 1800)).toBe(true)
  })
  it('da igual mayúsculas, tildes y signos', () => {
    const last: { current: LastUtterance | null } = { current: null }
    isRepeatedUtterance(last, 'Llamar al médico', 0)
    expect(isRepeatedUtterance(last, '¡llamar al medico!', 100)).toBe(true)
  })
  it('pasado el margen es una orden nueva', () => {
    const last: { current: LastUtterance | null } = { current: null }
    isRepeatedUtterance(last, 'sacar la basura', 0)
    expect(isRepeatedUtterance(last, 'sacar la basura', REPEATED_UTTERANCE_WINDOW_MS + 1)).toBe(false)
  })
  it('otra frase distinta nunca es repetición', () => {
    const last: { current: LastUtterance | null } = { current: null }
    isRepeatedUtterance(last, 'sacar la basura', 0)
    expect(isRepeatedUtterance(last, 'añade leche a Mercadona', 100)).toBe(false)
  })
  it('una frase vacía no cuenta', () => {
    expect(isRepeatedUtterance({ current: null }, '  ', 0)).toBe(false)
  })
})
