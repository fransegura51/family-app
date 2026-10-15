// INC-06: el aviso del móvil lleva el id de su entrada en la campana; la app lo valida, lo marca como leído y lo quita de la dirección.
import { describe, expect, it } from 'vitest'
import indexHtml from '../../index.html?raw'
import {
  appendQueryParam,
  isUuid,
  NOTIFICATION_PARAM,
  notificationIdFromPushData,
  notificationIdFromSearch,
  searchWithoutParams,
} from './notificationDeepLink'
import { pushEntryQuery, pushEntryUrl } from './pushEntryRoute'

const ID = '3b6f7a52-0d4e-4c1a-9f0e-2a7c5d8e9b10'
const POST = '11111111-1111-4111-8111-111111111111'
const COMMENT = '22222222-2222-4222-8222-222222222222'

// Ejecuta el script REAL de index.html (el que descodifica la ruta de entrada).
function decodeWithRealIndexScript(entryUrl: string): URL {
  const script = /<script type="text\/javascript">([\s\S]*?)<\/script>/.exec(indexHtml)?.[1]
  expect(script).toBeTruthy()
  const u = new URL(entryUrl)
  let result = entryUrl
  const fakeWindow = {
    location: { search: u.search, pathname: u.pathname, hash: u.hash },
    history: { replaceState: (_a: unknown, _b: unknown, url: string) => (result = new URL(url, u.origin).href) },
  }
  new Function('window', script as string)(fakeWindow)
  return new URL(result)
}

describe('validación del id del aviso', () => {
  it('solo acepta uuid (nunca texto libre de la dirección)', () => {
    expect(isUuid(ID)).toBe(true)
    expect(isUuid(ID.toUpperCase())).toBe(true)
    for (const bad of ['', 'abc', `${ID}x`, `${ID}'; drop table user_notifications;--`, '../../x', '<script>', null, undefined, 5, {}]) expect(isUuid(bad)).toBe(false)
  })

  it('lee el id de la dirección (?aviso=) y descarta lo que no es un uuid', () => {
    expect(NOTIFICATION_PARAM).toBe('aviso')
    expect(notificationIdFromSearch(`?aviso=${ID}`)).toBe(ID)
    expect(notificationIdFromSearch(`?evento=x&aviso=${ID.toUpperCase()}&fecha=2026-10-20`)).toBe(ID)
    expect(notificationIdFromSearch('?aviso=hola')).toBeNull()
    expect(notificationIdFromSearch('?aviso=')).toBeNull()
    expect(notificationIdFromSearch('')).toBeNull()
    expect(notificationIdFromSearch('?otro=1')).toBeNull()
  })

  it('lee el id de la carga del push o de la notificación nativa (clave «n»)', () => {
    expect(notificationIdFromPushData({ url: '/calendario', n: ID })).toBe(ID)
    expect(notificationIdFromPushData({ url: '/calendario', n: 'no-es-uuid' })).toBeNull()
    expect(notificationIdFromPushData({ url: '/calendario' })).toBeNull()
    expect(notificationIdFromPushData('/calendario')).toBeNull() // aviso antiguo: solo la ruta
    expect(notificationIdFromPushData(null)).toBeNull()
  })
})

describe('parámetros de la dirección', () => {
  it('añade el parámetro con «?» o «&» según la ruta y respeta un «#»', () => {
    expect(appendQueryParam('/dinero', 'aviso', ID)).toBe(`/dinero?aviso=${ID}`)
    expect(appendQueryParam('/calendario?evento=a&fecha=b', 'aviso', ID)).toBe(`/calendario?evento=a&fecha=b&aviso=${ID}`)
    expect(appendQueryParam('/x#sec', 'aviso', ID)).toBe(`/x?aviso=${ID}#sec`)
  })

  it('quita solo los parámetros indicados y conserva el resto', () => {
    expect(searchWithoutParams(`?aviso=${ID}`, ['aviso'])).toBe('')
    expect(searchWithoutParams(`?evento=${POST}&aviso=${ID}&fecha=2026-10-20`, ['aviso'])).toBe(`?evento=${POST}&fecha=2026-10-20`)
    expect(searchWithoutParams(`?nuevos=1&c=${COMMENT}&aviso=${ID}`, ['aviso'])).toBe(`?nuevos=1&c=${COMMENT}`)
    expect(searchWithoutParams('', ['aviso'])).toBe('')
  })
})

describe('dirección de entrada con el id del aviso', () => {
  it('un aviso con id añade «aviso» a su ruta; sin id queda como siempre', () => {
    expect(pushEntryQuery({ url: '/dinero', n: ID })).toBe(`/dinero?aviso=${ID}`)
    expect(pushEntryQuery({ url: '/dinero', n: null })).toBe('/dinero')
    expect(pushEntryQuery('/dinero')).toBe('/dinero')
    expect(pushEntryUrl('/family-app/', { url: '/ubicacion', n: ID })).toBe(`/family-app/?/ubicacion?aviso=${ID}`)
  })

  it('sin ruta cae en Calendario y conserva el id', () => {
    expect(pushEntryQuery({ url: null, n: ID })).toBe(`/calendario?aviso=${ID}`)
    expect(pushEntryQuery({ url: 'https://malo.example', n: ID })).toBe(`/calendario?aviso=${ID}`)
    expect(pushEntryQuery({ n: 'x' })).toBe('/calendario')
  })

  it('no rompe «nuevos» y «c» de Comunidad: el «&» de la ruta y el del id viajan como «~and~»', () => {
    const q = pushEntryQuery({ url: `/comunidad/p/${POST}?nuevos=1&c=${COMMENT}`, n: ID })
    expect(q).toBe(`/comunidad/p/${POST}?nuevos=1~and~c=${COMMENT}~and~aviso=${ID}`)
    expect(q).not.toContain('&')
  })

  it('el descodificador REAL de index.html devuelve ruta, parámetros y aviso intactos (web/PWA, con y sin /family-app/)', () => {
    for (const base of ['https://app.example/', 'https://pepa.example/family-app/']) {
      const path = new URL(base).pathname
      const link = `/calendario?evento=${POST}&fecha=2026-10-20`
      const decoded = decodeWithRealIndexScript(new URL(pushEntryUrl(path, { url: link, n: ID }), base).href)
      expect(decoded.pathname).toBe(`${path}calendario`)
      expect(decoded.searchParams.get('evento')).toBe(POST)
      expect(decoded.searchParams.get('fecha')).toBe('2026-10-20')
      expect(decoded.searchParams.get('aviso')).toBe(ID)
      expect(notificationIdFromSearch(decoded.search)).toBe(ID)

      const community = decodeWithRealIndexScript(new URL(pushEntryUrl(path, { url: `/comunidad/p/${POST}?nuevos=1&c=${COMMENT}`, n: ID }), base).href)
      expect(community.pathname).toBe(`${path}comunidad/p/${POST}`)
      expect(community.searchParams.get('nuevos')).toBe('1')
      expect(community.searchParams.get('c')).toBe(COMMENT)
      expect(community.searchParams.get('aviso')).toBe(ID)
    }
  })

  it('una ruta sin parámetros más el aviso también sobrevive', () => {
    const decoded = decodeWithRealIndexScript(`https://pepa.example/family-app/?${pushEntryQuery({ url: '/dinero', n: ID })}`)
    expect(decoded.pathname).toBe('/family-app/dinero')
    expect(decoded.searchParams.get('aviso')).toBe(ID)
  })
})
