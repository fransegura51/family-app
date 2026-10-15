// INC-20: lógica pura del atrapa-foco del panel de avisos.
import { describe, expect, it } from 'vitest'
import { FOCUSABLE_SELECTOR, trapFocusTarget, unreadAnnouncement } from './focusTrap'

describe('trapFocusTarget (Tab y Mayús+Tab dentro del diálogo)', () => {
  it('Tab en el último vuelve al primero; Mayús+Tab en el primero salta al último', () => {
    expect(trapFocusTarget(5, 4, false)).toBe(0)
    expect(trapFocusTarget(5, 0, true)).toBe(4)
  })

  it('en medio, el navegador sigue su camino (null)', () => {
    for (let i = 0; i < 5; i++) {
      if (i !== 4) expect(trapFocusTarget(5, i, false), `Tab desde ${i}`).toBeNull()
      if (i !== 0) expect(trapFocusTarget(5, i, true), `Mayús+Tab desde ${i}`).toBeNull()
    }
  })

  it('con el foco en el propio panel (o fuera de la lista) se entra por el primero o por el último', () => {
    expect(trapFocusTarget(5, -1, false)).toBe(0)
    expect(trapFocusTarget(5, -1, true)).toBe(4)
    expect(trapFocusTarget(5, 99, false)).toBe(0)
  })

  it('con un solo elemento, Tab y Mayús+Tab se quedan en él', () => {
    expect(trapFocusTarget(1, 0, false)).toBe(0)
    expect(trapFocusTarget(1, 0, true)).toBe(0)
  })

  it('sin nada enfocable, el foco se queda en el propio diálogo (-1)', () => {
    expect(trapFocusTarget(0, -1, false)).toBe(-1)
    expect(trapFocusTarget(0, 0, true)).toBe(-1)
  })

  it('el foco nunca puede salir: recorrer N pulsaciones de Tab siempre queda dentro de 0..N-1', () => {
    const n = 4
    let at = -1
    for (let step = 0; step < 20; step++) {
      const target = trapFocusTarget(n, at, false)
      at = target === null ? at + 1 : target
      expect(at).toBeGreaterThanOrEqual(0)
      expect(at).toBeLessThan(n)
    }
    for (let step = 0; step < 20; step++) {
      const target = trapFocusTarget(n, at, true)
      at = target === null ? at - 1 : target
      expect(at).toBeGreaterThanOrEqual(0)
      expect(at).toBeLessThan(n)
    }
  })
})

describe('selector de elementos enfocables', () => {
  it('incluye botones, enlaces y campos activos y excluye lo desactivado', () => {
    for (const part of ['a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])', 'textarea:not([disabled])']) {
      expect(FOCUSABLE_SELECTOR).toContain(part)
    }
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])')
  })
})

describe('anuncio del número de avisos sin leer', () => {
  it('singular, plural y cero', () => {
    expect(unreadAnnouncement(0)).toBe('No tienes avisos sin leer.')
    expect(unreadAnnouncement(1)).toBe('Tienes 1 aviso sin leer.')
    expect(unreadAnnouncement(7)).toBe('Tienes 7 avisos sin leer.')
  })
})
