import { describe, expect, it } from 'vitest'
import { SIGNUP_ORIGIN_KEY, forgetSignupOrigin, parseSignupOrigin, recallSignupOrigin, rememberSignupOrigin } from './signupOrigin'

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v
    },
    removeItem: (k: string) => {
      delete data[k]
    },
  }
}

describe('parseSignupOrigin', () => {
  it('reconoce ?origen=demo', () => {
    expect(parseSignupOrigin('?origen=demo')).toBe('demo')
    expect(parseSignupOrigin('?a=1&origen=demo&b=2')).toBe('demo')
  })

  it('ignora cualquier valor que no esté en la lista cerrada', () => {
    expect(parseSignupOrigin('?origen=otra-cosa')).toBeNull()
    expect(parseSignupOrigin('?origen=DEMO')).toBeNull()
    expect(parseSignupOrigin('?origen=')).toBeNull()
    expect(parseSignupOrigin('?origen=<script>alert(1)</script>')).toBeNull()
    expect(parseSignupOrigin('?origen=' + 'a'.repeat(5000))).toBeNull()
  })

  it('sin parámetro, o con otro nombre, es null', () => {
    expect(parseSignupOrigin('')).toBeNull()
    expect(parseSignupOrigin('?rsvp=abc')).toBeNull()
    expect(parseSignupOrigin('?origin=demo')).toBeNull()
  })
})

describe('recordar y olvidar el origen', () => {
  it('lo guarda al llegar con ?origen=demo y se puede recuperar', () => {
    const s = fakeStorage()
    rememberSignupOrigin('?origen=demo', s)
    expect(s.data[SIGNUP_ORIGIN_KEY]).toBe('demo')
    expect(recallSignupOrigin(s)).toBe('demo')
  })

  it('no guarda nada si la URL no trae un origen válido', () => {
    const s = fakeStorage()
    rememberSignupOrigin('?origen=hack', s)
    rememberSignupOrigin('', s)
    expect(s.data).toEqual({})
    expect(recallSignupOrigin(s)).toBeNull()
  })

  it('un valor manipulado en el almacenamiento no se acepta', () => {
    expect(recallSignupOrigin(fakeStorage({ [SIGNUP_ORIGIN_KEY]: 'lo-que-sea' }))).toBeNull()
  })

  it('se olvida tras registrarse', () => {
    const s = fakeStorage({ [SIGNUP_ORIGIN_KEY]: 'demo' })
    forgetSignupOrigin(s)
    expect(recallSignupOrigin(s)).toBeNull()
  })

  it('sin almacenamiento disponible no rompe nada', () => {
    expect(() => rememberSignupOrigin('?origen=demo', null)).not.toThrow()
    expect(recallSignupOrigin(null)).toBeNull()
    expect(() => forgetSignupOrigin(null)).not.toThrow()
    const broken = {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
      removeItem: () => {
        throw new Error('bloqueado')
      },
    }
    expect(() => rememberSignupOrigin('?origen=demo', broken)).not.toThrow()
    expect(recallSignupOrigin(broken)).toBeNull()
    expect(() => forgetSignupOrigin(broken)).not.toThrow()
  })
})
