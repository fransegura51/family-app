import { describe, expect, it } from 'vitest'
import {
  SIGNUP_GUIDE_KEY,
  SIGNUP_ORIGIN_KEY,
  forgetSignupOrigin,
  parseSignupGuide,
  parseSignupOrigin,
  recallSignupGuide,
  recallSignupOrigin,
  rememberSignupOrigin,
  signupMetadata,
} from './signupOrigin'

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

describe('parseSignupGuide', () => {
  it('reconoce la guía solo junto a origen=demo', () => {
    expect(parseSignupGuide('?origen=demo&guia=calendario-familiar-sin-olvidos')).toBe('calendario-familiar-sin-olvidos')
    expect(parseSignupGuide('?guia=calendario-familiar-sin-olvidos')).toBeNull()
    expect(parseSignupGuide('?origen=otro&guia=algo')).toBeNull()
  })

  it('solo acepta formato de slug (nada de texto libre ni de tamaño exagerado)', () => {
    for (const guia of ['Mi Guía', 'a b', '<script>alert(1)</script>', 'a/b', '-x', 'x-', 'a--b', '../etc', "x'; drop table users;--", 'a'.repeat(61), '']) {
      expect(parseSignupGuide(`?origen=demo&guia=${encodeURIComponent(guia)}`), guia).toBeNull()
    }
    expect(parseSignupGuide(`?origen=demo&guia=${'a'.repeat(60)}`)).toBe('a'.repeat(60))
  })
})

describe('recordar y olvidar el origen', () => {
  it('lo guarda al llegar con ?origen=demo y se puede recuperar', () => {
    const s = fakeStorage()
    rememberSignupOrigin('?origen=demo', s)
    expect(s.data[SIGNUP_ORIGIN_KEY]).toBe('demo')
    expect(recallSignupOrigin(s)).toBe('demo')
    expect(recallSignupGuide(s)).toBeNull()
  })

  it('guarda también la guía de origen', () => {
    const s = fakeStorage()
    rememberSignupOrigin('?origen=demo&guia=reparto-tareas-casa-justo', s)
    expect(s.data[SIGNUP_GUIDE_KEY]).toBe('reparto-tareas-casa-justo')
    expect(recallSignupGuide(s)).toBe('reparto-tareas-casa-justo')
  })

  it('llegar de nuevo sin guía borra la guía anterior (no se atribuye mal)', () => {
    const s = fakeStorage({ [SIGNUP_ORIGIN_KEY]: 'demo', [SIGNUP_GUIDE_KEY]: 'guia-vieja' })
    rememberSignupOrigin('?origen=demo', s)
    expect(recallSignupGuide(s)).toBeNull()
    expect(recallSignupOrigin(s)).toBe('demo')
  })

  it('no guarda nada si la URL no trae un origen válido', () => {
    const s = fakeStorage()
    rememberSignupOrigin('?origen=hack&guia=algo', s)
    rememberSignupOrigin('?guia=algo', s)
    rememberSignupOrigin('', s)
    expect(s.data).toEqual({})
    expect(recallSignupOrigin(s)).toBeNull()
  })

  it('valores manipulados en el almacenamiento no se aceptan', () => {
    const s = fakeStorage({ [SIGNUP_ORIGIN_KEY]: 'lo-que-sea', [SIGNUP_GUIDE_KEY]: '<b>x</b>' })
    expect(recallSignupOrigin(s)).toBeNull()
    expect(recallSignupGuide(s)).toBeNull()
    expect(signupMetadata(s)).toBeUndefined()
  })

  it('se olvida todo tras registrarse', () => {
    const s = fakeStorage({ [SIGNUP_ORIGIN_KEY]: 'demo', [SIGNUP_GUIDE_KEY]: 'una-guia' })
    forgetSignupOrigin(s)
    expect(s.data).toEqual({})
  })

  it('sin almacenamiento disponible no rompe nada', () => {
    expect(() => rememberSignupOrigin('?origen=demo', null)).not.toThrow()
    expect(recallSignupOrigin(null)).toBeNull()
    expect(recallSignupGuide(null)).toBeNull()
    expect(signupMetadata(null)).toBeUndefined()
    expect(() => forgetSignupOrigin(null)).not.toThrow()
    const boom = () => {
      throw new Error('bloqueado')
    }
    const broken = { getItem: boom, setItem: boom, removeItem: boom }
    expect(() => rememberSignupOrigin('?origen=demo', broken)).not.toThrow()
    expect(recallSignupOrigin(broken)).toBeNull()
    expect(signupMetadata(broken)).toBeUndefined()
    expect(() => forgetSignupOrigin(broken)).not.toThrow()
  })
})

describe('signupMetadata (lo que se manda al registrarse)', () => {
  it('sin origen: undefined, así el registro normal no cambia en nada', () => {
    expect(signupMetadata(fakeStorage())).toBeUndefined()
  })

  it('solo origen', () => {
    expect(signupMetadata(fakeStorage({ [SIGNUP_ORIGIN_KEY]: 'demo' }))).toEqual({ signup_origin: 'demo' })
  })

  it('origen y guía', () => {
    expect(signupMetadata(fakeStorage({ [SIGNUP_ORIGIN_KEY]: 'demo', [SIGNUP_GUIDE_KEY]: 'una-guia' }))).toEqual({
      signup_origin: 'demo',
      signup_guide: 'una-guia',
    })
  })

  it('no manda nunca la guía sin origen', () => {
    expect(signupMetadata(fakeStorage({ [SIGNUP_GUIDE_KEY]: 'una-guia' }))).toBeUndefined()
  })
})
