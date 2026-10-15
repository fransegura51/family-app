// Enlace público estable para compartir una publicación.
import { describe, expect, it } from 'vitest'
import { buildShareUrl } from '@/ui/community/communityShare'

describe('enlace para compartir', () => {
  it('usa el origen y la base de la aplicación', () => {
    expect(buildShareUrl({ origin: 'https://app.example.com', baseUrl: '/', id: 'abc' })).toBe('https://app.example.com/comunidad/p/abc')
    expect(buildShareUrl({ origin: 'https://user.github.io', baseUrl: '/family-app/', id: 'abc' })).toBe('https://user.github.io/family-app/comunidad/p/abc')
    expect(buildShareUrl({ origin: 'https://x.com', baseUrl: '/family-app', id: 'abc' })).toBe('https://x.com/family-app/comunidad/p/abc')
  })
  it('si hay un dominio público configurado, manda ese', () => {
    expect(buildShareUrl({ origin: 'https://app.example.com', baseUrl: '/family-app/', publicBase: 'https://pepafamilyapp.es/c/', id: 'abc' })).toBe('https://pepafamilyapp.es/c/p/abc')
    expect(buildShareUrl({ origin: 'https://a', baseUrl: '/', publicBase: '  ', id: 'abc' })).toBe('https://a/comunidad/p/abc')
  })
})
