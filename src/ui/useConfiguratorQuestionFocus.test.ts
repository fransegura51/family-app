import { describe, expect, it } from 'vitest'
import { questionIsVisible, stepConfiguratorFocus } from './useConfiguratorQuestionFocus'

describe('questionIsVisible — sin foco se ve todo, con foco solo la pregunta coincidente', () => {
  it('localFocus null: cualquier pregunta es visible', () => {
    expect(questionIsVisible(null, 'pareja.partner1.vestuario')).toBe(true)
    expect(questionIsVisible(null, 'otra.cosa')).toBe(true)
  })
  it('localFocus activo: solo la pregunta con esa key exacta es visible', () => {
    expect(questionIsVisible('pareja.partner1.vestuario', 'pareja.partner1.vestuario')).toBe(true)
    expect(questionIsVisible('pareja.partner1.vestuario', 'pareja.partner1.alianzas')).toBe(false)
  })
})

describe('stepConfiguratorFocus — nunca reacciona dos veces al mismo clic, pero sí a un segundo clic en la misma pregunta', () => {
  it('primera llamada (lastProcessedToken null): siempre aplica', () => {
    const step = stepConfiguratorFocus(null, { questionKey: 'a', token: 1 })
    expect(step).toEqual({ localFocus: 'a', lastProcessedToken: 1, shouldScroll: true })
  })
  it('mismo token que el último procesado: no hace nada (evita re-disparar en cada re-render normal)', () => {
    expect(stepConfiguratorFocus(1, { questionKey: 'a', token: 1 })).toBeNull()
  })
  it('token distinto, aunque sea la MISMA questionKey (clic repetido en la misma flecha): vuelve a aplicar y a pedir scroll', () => {
    const step = stepConfiguratorFocus(1, { questionKey: 'a', token: 2 })
    expect(step).toEqual({ localFocus: 'a', lastProcessedToken: 2, shouldScroll: true })
  })
  it('token distinto con otra questionKey: aplica la nueva', () => {
    const step = stepConfiguratorFocus(1, { questionKey: 'b', token: 2 })
    expect(step?.localFocus).toBe('b')
  })
})
