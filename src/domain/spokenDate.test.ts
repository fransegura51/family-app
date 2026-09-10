import { describe, expect, it } from 'vitest'
import { extractSpokenDate } from '@/domain/spokenDate'

// El texto llega ya normalizado (minúsculas, sin acentos), como en la app.
const today = new Date(2026, 8, 11) // 11 sept 2026

describe('extractSpokenDate', () => {
  it('reconoce la fecha en medio de la frase, con o sin "el"/"el dia"', () => {
    expect(extractSpokenDate('que tengo el dia 25 de septiembre', today)).toEqual({ date: '2026-09-25', matchText: 'el dia 25 de septiembre' })
    expect(extractSpokenDate('que hay el 25 de septiembre por la tarde', today)?.date).toBe('2026-09-25')
    expect(extractSpokenDate('25 de septiembre', today)?.date).toBe('2026-09-25')
  })

  it('números en palabras, incluido "treinta y uno"', () => {
    expect(extractSpokenDate('el quince de marzo', today)?.date).toBe('2027-03-15')
    expect(extractSpokenDate('el treinta y uno de octubre', today)?.date).toBe('2026-10-31')
    expect(extractSpokenDate('veintiocho de febrero', today)?.date).toBe('2027-02-28')
  })

  it('si la fecha ya pasó este año, es la del año que viene', () => {
    expect(extractSpokenDate('el 9 de septiembre', today)?.date).toBe('2027-09-09')
    // Hoy mismo cuenta como hoy, no como el año que viene.
    expect(extractSpokenDate('el 11 de septiembre', today)?.date).toBe('2026-09-11')
  })

  it('sin fecha o con un día imposible, null (nunca inventa)', () => {
    expect(extractSpokenDate('que tengo mañana', today)).toBeNull()
    expect(extractSpokenDate('el 32 de enero', today)).toBeNull()
    expect(extractSpokenDate('el 5 de marzoo', today)).toBeNull()
  })
})
