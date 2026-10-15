// INC-04: al tocar el aviso de un comentario nuevo se perdían «nuevos» y «c» (el «&» se convertía en «?»).
import { describe, expect, it } from 'vitest'
import indexHtml from '../../index.html?raw'
import swSource from '../sw.ts?raw'
import nativePushSource from '../services/nativePush.ts?raw'
import { isInternalPushPath, pushEntryQuery, pushEntryUrl } from './pushEntryRoute'

// Ejecuta el script REAL de index.html (el que descodifica la ruta de entrada) sobre una dirección dada.
function decodeWithRealIndexScript(entryUrl: string): string {
  const script = /<script type="text\/javascript">([\s\S]*?)<\/script>/.exec(indexHtml)?.[1]
  expect(script).toBeTruthy()
  const u = new URL(entryUrl)
  let result = entryUrl
  const fakeWindow = {
    location: { search: u.search, pathname: u.pathname, hash: u.hash },
    history: {
      replaceState: (_a: unknown, _b: unknown, url: string) => {
        result = new URL(url, u.origin).href
      },
    },
  }
  // El script usa `window` y se auto-invoca con `window.location`.
  new Function('window', script as string)(fakeWindow)
  return result
}

const POST = '11111111-1111-4111-8111-111111111111'
const COMMENT = '22222222-2222-4222-8222-222222222222'
const SERVER_URL = `/comunidad/p/${POST}?nuevos=1&c=${COMMENT}` // lo que genera 0271_community_notifications.sql

describe('dirección de entrada de los avisos', () => {
  it('codifica el «&» de la ruta como «~and~»', () => {
    expect(pushEntryQuery(SERVER_URL)).toBe(`/comunidad/p/${POST}?nuevos=1~and~c=${COMMENT}`)
    expect(pushEntryUrl('/family-app/', SERVER_URL)).toBe(`/family-app/?/comunidad/p/${POST}?nuevos=1~and~c=${COMMENT}`)
  })

  it('rutas sin «&» quedan igual que siempre', () => {
    expect(pushEntryUrl('/', '/dinero')).toBe('/?/dinero')
    expect(pushEntryUrl('/', '/comunidad/novedades')).toBe('/?/comunidad/novedades')
  })

  it('sin ruta o con ruta no interna cae en Calendario', () => {
    expect(pushEntryUrl('/', undefined)).toBe('/?/calendario')
    expect(pushEntryUrl('/', null)).toBe('/?/calendario')
    expect(pushEntryUrl('/', 'https://malo.example/x')).toBe('/?/calendario')
    expect(pushEntryUrl('/', '//malo.example')).toBe('/?/calendario')
    expect(pushEntryUrl('/', '/a\\b')).toBe('/?/calendario')
    expect(isInternalPushPath('/ok')).toBe(true)
    expect(isInternalPushPath(5)).toBe(false)
  })

  it('el descodificador real de index.html devuelve ruta, nuevos y c intactos (web/PWA)', () => {
    for (const base of ['https://app.example/', 'https://pepa.example/family-app/']) {
      const entry = new URL(pushEntryUrl(new URL(base).pathname, SERVER_URL), base).href
      const decoded = new URL(decodeWithRealIndexScript(entry))
      expect(decoded.pathname).toBe(`${new URL(base).pathname}comunidad/p/${POST}`)
      expect(decoded.searchParams.get('nuevos')).toBe('1')
      expect(decoded.searchParams.get('c')).toBe(COMMENT)
    }
  })

  it('REPRODUCCIÓN del fallo anterior: sin codificar, «nuevos» valía «1?c=…» y «c» desaparecía', () => {
    const roto = decodeWithRealIndexScript(`https://app.example/?${SERVER_URL}`)
    const u = new URL(roto)
    expect(u.searchParams.get('c')).toBeNull()
    expect(u.searchParams.get('nuevos')).toContain('?c=')
  })

  it('el service worker y la app nativa usan la función común (no vuelven a construir la dirección a mano)', () => {
    expect(swSource).toContain('pushEntryQuery(event.notification.data)')
    expect(swSource).not.toMatch(/scopeUrl\(`\?\$\{path\}`\)/)
    expect(nativePushSource).toContain('pushEntryUrl(import.meta.env.BASE_URL, data)')
  })
})
