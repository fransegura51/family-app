import { describe, expect, it } from 'vitest'
import { errorMessage } from '@/domain/errorMessage'

describe('errorMessage', () => {
  it('un Error de verdad: su mensaje', () => {
    expect(errorMessage(new Error('No autenticado'), 'genérico')).toBe('No autenticado')
  })
  it('un error de Supabase (objeto plano con message): su mensaje — el caso que se perdía', () => {
    const supabaseError = { code: 'P0001', details: null, hint: null, message: 'Código de acceso incorrecto' }
    expect(errorMessage(supabaseError, 'Error al crear la familia')).toBe('Código de acceso incorrecto')
  })
  it('un string suelto: tal cual', () => {
    expect(errorMessage('Sin red', 'genérico')).toBe('Sin red')
  })
  it('sin mensaje útil: el texto genérico', () => {
    expect(errorMessage(null, 'genérico')).toBe('genérico')
    expect(errorMessage(undefined, 'genérico')).toBe('genérico')
    expect(errorMessage({ code: 500 }, 'genérico')).toBe('genérico')
    expect(errorMessage({ message: '' }, 'genérico')).toBe('genérico')
    expect(errorMessage(new Error(''), 'genérico')).toBe('genérico')
  })
})
