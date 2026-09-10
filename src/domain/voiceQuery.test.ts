import { describe, expect, it } from 'vitest'
import { isUnsupportedDelete, normalize, stripWakeWord } from '@/domain/voiceQuery'

describe('normalize', () => {
  it('minúsculas y sin acentos, para comparar como habla la gente', () => {
    expect(normalize('  Qué tengo Mañana  ')).toBe('que tengo manana')
  })
})

describe('stripWakeWord', () => {
  it('quita "Pepa" (con "oye"/"vale" delante) esté donde esté', () => {
    expect(stripWakeWord('Pepa, apunta leche y pan')).toBe('apunta leche y pan')
    expect(stripWakeWord('vale Pepa, ponme en el calendario cita')).toBe('ponme en el calendario cita')
    expect(stripWakeWord('oye pepa apunta huevos')).toBe('apunta huevos')
  })
  it('sin Pepa, no toca nada', () => {
    expect(stripWakeWord('apunta leche')).toBe('apunta leche')
  })
})

describe('isUnsupportedDelete', () => {
  it('borrar/quitar una cita o evento se detecta (bug real: se creaba "Borra la cita del" como cita)', () => {
    expect(isUnsupportedDelete('Borra la cita del 9 de septiembre')).toBe(true)
    expect(isUnsupportedDelete('quita el evento de mañana')).toBe(true)
    expect(isUnsupportedDelete('Eliminar la cita del dentista')).toBe(true)
  })
  it('apuntar algo nuevo no es borrar', () => {
    expect(isUnsupportedDelete('apunta cita dentista el 25 de septiembre')).toBe(false)
    expect(isUnsupportedDelete('borra leche de la lista')).toBe(false)
  })
})
