// Fotos de Comunidad: el bucket es PRIVADO. Aquí se prueba de dónde sale cada dirección (Worker o firmada), el lote de firmadas (una sola llamada), las vistas previas
// locales y que ningún sitio de la aplicación vuelve a construir una dirección pública de Supabase.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const signed = vi.fn(async (paths: string[]) => Object.fromEntries(paths.map((p) => [p, `https://abc.supabase.co/signed/${p}?token=t`])))
vi.mock('@/data/community', () => ({ createCommunityPhotoSignedUrls: (paths: string[]) => signed(paths) }))

import {
  forgetLocalPhotoPreview,
  normalizePublicBase,
  planCommunityPhoto,
  rememberLocalPhotoPreview,
  requestSignedPhotoUrl,
  resetCommunityPhotoCaches,
  resolveCommunityPhotoUrl,
  workerPhotoUrl,
} from '@/ui/community/communityPhotoUrl'

const BASE = 'https://pepafamilyapp.es/c'
const PATH = 'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb/11111111-aaaa-4bbb-8ccc-000000000001.jpg'
const PATH_2 = 'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb/11111111-aaaa-4bbb-8ccc-000000000002.jpg'

beforeEach(() => {
  signed.mockClear()
  resetCommunityPhotoCaches()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('base pública y dirección del Worker', () => {
  it('normaliza la base (sin barra final) y rechaza lo que no es http(s)', () => {
    expect(normalizePublicBase('https://pepafamilyapp.es/c/')).toBe(BASE)
    expect(normalizePublicBase('  https://pepafamilyapp.es/c  ')).toBe(BASE)
    for (const bad of ['', undefined, null, 'pepafamilyapp.es/c', 'javascript:alert(1)', 'https://a b']) expect(normalizePublicBase(bad as string | undefined)).toBeNull()
  })

  it('solo hay dirección del Worker con base configurada y una ruta con la forma exacta', () => {
    expect(workerPhotoUrl(BASE, PATH)).toBe(`${BASE}/img/${PATH}`)
    expect(workerPhotoUrl(null, PATH)).toBeNull()
    for (const bad of ['', '../x.jpg', 'a/b.jpg', `${PATH}?x=1`, 'https://evil.example/a.jpg']) expect(workerPhotoUrl(BASE, bad), bad).toBeNull()
  })
})

describe('qué dirección toca (planCommunityPhoto)', () => {
  it('contenido publicado con Worker: dirección del Worker, sin llamar a Supabase', () => {
    expect(planCommunityPhoto(PATH, 'public', BASE, 0)).toEqual({ kind: 'url', url: `${BASE}/img/${PATH}` })
  })

  it('si el Worker falla pasa a firmada, luego la renueva una vez y después se rinde (sin bucle)', () => {
    expect(planCommunityPhoto(PATH, 'public', BASE, 1)).toEqual({ kind: 'signed', refresh: false })
    expect(planCommunityPhoto(PATH, 'public', BASE, 2)).toEqual({ kind: 'signed', refresh: true })
    expect(planCommunityPhoto(PATH, 'public', BASE, 3)).toEqual({ kind: 'none' })
  })

  it('lo propio sin publicar y lo que ve la administración (acceso privado) siempre va firmado, aunque haya Worker', () => {
    expect(planCommunityPhoto(PATH, 'private', BASE, 0)).toEqual({ kind: 'signed', refresh: false })
    expect(planCommunityPhoto(PATH, 'private', BASE, 1)).toEqual({ kind: 'signed', refresh: true })
    expect(planCommunityPhoto(PATH, 'private', BASE, 2)).toEqual({ kind: 'none' })
  })

  it('sin base configurada (desarrollo) todo va firmado', () => {
    expect(planCommunityPhoto(PATH, 'public', null, 0)).toEqual({ kind: 'signed', refresh: false })
  })

  it('una ruta con forma rara nunca va por el Worker', () => {
    expect(planCommunityPhoto('perfil/viejo.jpg', 'public', BASE, 0)).toEqual({ kind: 'signed', refresh: false })
  })
})

describe('direcciones firmadas en lote', () => {
  it('varias fotos pedidas a la vez viajan en UNA sola llamada, y se recuerdan mientras valgan', async () => {
    vi.useFakeTimers()
    const a = requestSignedPhotoUrl(PATH)
    const b = requestSignedPhotoUrl(PATH_2)
    const again = requestSignedPhotoUrl(PATH) // la misma foto en la misma tanda: no se duplica
    await vi.advanceTimersByTimeAsync(50)
    expect(await a).toBe(`https://abc.supabase.co/signed/${PATH}?token=t`)
    expect(await b).toBe(`https://abc.supabase.co/signed/${PATH_2}?token=t`)
    expect(await again).toBe(await a)
    expect(signed).toHaveBeenCalledTimes(1)
    expect(signed.mock.calls[0][0].sort()).toEqual([PATH, PATH_2].sort())
    // Recordadas: otra petición no llama a Supabase.
    expect(await requestSignedPhotoUrl(PATH)).toContain(PATH)
    expect(signed).toHaveBeenCalledTimes(1)
  })

  it('pasados 9 minutos (la firmada dura 10) se pide otra', async () => {
    vi.useFakeTimers()
    const first = requestSignedPhotoUrl(PATH)
    await vi.advanceTimersByTimeAsync(50)
    await first
    vi.setSystemTime(Date.now() + 9 * 60 * 1000 + 1000)
    const second = requestSignedPhotoUrl(PATH)
    await vi.advanceTimersByTimeAsync(50)
    await second
    expect(signed).toHaveBeenCalledTimes(2)
  })

  it('«refresh» descarta la recordada y pide otra', async () => {
    vi.useFakeTimers()
    const first = requestSignedPhotoUrl(PATH)
    await vi.advanceTimersByTimeAsync(50)
    await first
    const second = requestSignedPhotoUrl(PATH, true)
    await vi.advanceTimersByTimeAsync(50)
    await second
    expect(signed).toHaveBeenCalledTimes(2)
  })

  it('si Supabase no da dirección (sin permiso, error de red) devuelve null y no se queda colgado', async () => {
    vi.useFakeTimers()
    signed.mockImplementationOnce(async () => {
      throw new Error('red caída')
    })
    const failed = requestSignedPhotoUrl(PATH)
    await vi.advanceTimersByTimeAsync(50)
    expect(await failed).toBeNull()
    signed.mockImplementationOnce(async () => ({}))
    const denied = requestSignedPhotoUrl(PATH_2)
    await vi.advanceTimersByTimeAsync(50)
    expect(await denied).toBeNull()
  })
})

describe('resolveCommunityPhotoUrl y vistas previas locales', () => {
  it('con base configurada, contenido publicado → Worker (sin red); privado → firmada', async () => {
    vi.stubEnv('VITE_COMMUNITY_PUBLIC_BASE', `${BASE}/`)
    expect(await resolveCommunityPhotoUrl(PATH)).toBe(`${BASE}/img/${PATH}`)
    expect(signed).not.toHaveBeenCalled()
    vi.useFakeTimers()
    const privateUrl = resolveCommunityPhotoUrl(PATH_2, 'private')
    await vi.advanceTimersByTimeAsync(50)
    expect(await privateUrl).toContain('/signed/')
  })

  it('la vista previa local (blob) tiene prioridad y se libera al olvidarla', async () => {
    const create = vi.fn(() => 'blob:local-1')
    const revoke = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
    try {
      rememberLocalPhotoPreview(PATH, new Blob(['x']))
      expect(await resolveCommunityPhotoUrl(PATH, 'private')).toBe('blob:local-1')
      expect(signed).not.toHaveBeenCalled()
      forgetLocalPhotoPreview(PATH)
      expect(revoke).toHaveBeenCalledWith('blob:local-1')
      forgetLocalPhotoPreview(PATH) // olvidar dos veces no falla
      expect(revoke).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('ningún sitio construye ya una dirección pública de Supabase', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
  const files = [
    'src/data/community.ts',
    'src/ui/community/PostCardView.tsx',
    'src/ui/community/PostDetailPage.tsx',
    'src/ui/community/CommentItem.tsx',
    'src/ui/community/PhotoPicker.tsx',
    'src/ui/community/admin/ModerationReports.tsx',
    'src/ui/community/recipes/recipePhotoCopy.ts',
    'src/ui/community/communityPhotoUrl.ts',
  ]

  it('sin getPublicUrl, sin /object/public y sin la antigua communityPhotoUrl de datos', () => {
    for (const f of files) {
      const src = read(f)
      expect(src, f).not.toContain('getPublicUrl')
      expect(src, f).not.toContain('/object/public')
      expect(src, f).not.toMatch(/import \{[^}]*\bcommunityPhotoUrl\b[^}]*\} from '@\/data\/community'/)
    }
  })

  it('cada pantalla que pinta fotos usa la utilidad (y la administración y el editor, acceso privado)', () => {
    expect(read('src/ui/community/PostCardView.tsx')).toContain('useCommunityPhotoUrl(item.blockedByMe ? null : item.thumbPath)')
    expect(read('src/ui/community/CommentItem.tsx')).toContain('useCommunityPhotoUrl(comment.photoPath)')
    expect(read('src/ui/community/PostDetailPage.tsx')).toContain('useCommunityPhotoUrls(photoPaths)')
    expect(read('src/ui/community/PhotoPicker.tsx')).toContain("useCommunityPhotoUrls(value, 'private')")
    expect(read('src/ui/community/PhotoPicker.tsx')).toContain('rememberLocalPhotoPreview(path, blob)')
    expect(read('src/ui/community/admin/ModerationReports.tsx')).toContain("useCommunityPhotoUrls(photoPaths, 'private')")
  })

  it('el cliente solo pide firmadas con createSignedUrls (en lote) a un único sitio de datos', () => {
    expect(read('src/data/community.ts')).toContain(".createSignedUrls(paths, COMMUNITY_SIGNED_URL_SECONDS)")
    expect(read('src/data/community.ts')).toContain('COMMUNITY_SIGNED_URL_SECONDS = 600')
  })
})
