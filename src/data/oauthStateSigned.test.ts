// Seguridad del `state` de los retornos OAuth (banco y Google): firmado, con caducidad y ligado a usuario y familia.
// Antes era solo base64 de un JSON y se podia fabricar con el familyId de otra familia.
import { describe, expect, it } from 'vitest'
import { OAUTH_STATE_TTL_SECONDS, signOAuthState, timingSafeEqual, verifyOAuthState } from '../../supabase/functions/_shared/oauthState'

const FUNCTIONS = import.meta.glob('/supabase/functions/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const src = (name: string) => FUNCTIONS[`/supabase/functions/${name}/index.ts`]

const SECRET = 'secreto-de-prueba-solo-para-tests-0123456789'
const OTHER_SECRET = 'otro-secreto-de-prueba-distinto-9876543210'
const NOW = Date.UTC(2026, 9, 24, 12, 0, 0)
const A = { familyId: 'fam-A', profileId: 'user-A', memberId: 'mem-A' }

const forge = (obj: unknown) => btoa(JSON.stringify(obj)) // formato antiguo, sin firma

describe('state firmado: casos de uso', () => {
  it('acepta una firma valida y devuelve familia, usuario y miembro', async () => {
    const t = await signOAuthState({ purpose: 'google', ...A, app: true }, SECRET, NOW)
    const r = await verifyOAuthState(t, 'google', SECRET, NOW + 5_000)
    expect(r).toEqual({ ok: true, payload: { purpose: 'google', ...A, app: true } })
  })

  it('rechaza un state manipulado (cambiar la familia dentro del payload)', async () => {
    const t = await signOAuthState({ purpose: 'bank', familyId: 'fam-A', profileId: 'user-A' }, SECRET, NOW)
    const [v, payload, sig] = t.split('.')
    const body = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    body.f = 'fam-VICTIMA'
    const tampered = btoa(JSON.stringify(body)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const r = await verifyOAuthState(`${v}.${tampered}.${sig}`, 'bank', SECRET, NOW)
    expect(r).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('rechaza un state firmado con otro secreto (atacante que no conoce el del servidor)', async () => {
    const t = await signOAuthState({ purpose: 'bank', familyId: 'fam-VICTIMA', profileId: 'user-X' }, OTHER_SECRET, NOW)
    expect((await verifyOAuthState(t, 'bank', SECRET, NOW)).ok).toBe(false)
  })

  it('rechaza un state caducado (mas de 10 minutos) y acepta justo antes', async () => {
    const t = await signOAuthState({ purpose: 'bank', familyId: 'fam-A', profileId: 'user-A' }, SECRET, NOW)
    expect((await verifyOAuthState(t, 'bank', SECRET, NOW + (OAUTH_STATE_TTL_SECONDS - 1) * 1000)).ok).toBe(true)
    expect(await verifyOAuthState(t, 'bank', SECRET, NOW + (OAUTH_STATE_TTL_SECONDS + 2) * 1000)).toEqual({ ok: false, reason: 'expired' })
  })

  it('no sirve un state de banco en el callback de Google, ni al reves', async () => {
    const bank = await signOAuthState({ purpose: 'bank', familyId: 'fam-A', profileId: 'user-A' }, SECRET, NOW)
    const google = await signOAuthState({ purpose: 'google', ...A }, SECRET, NOW)
    expect(await verifyOAuthState(bank, 'google', SECRET, NOW)).toEqual({ ok: false, reason: 'wrong_purpose' })
    expect(await verifyOAuthState(google, 'bank', SECRET, NOW)).toEqual({ ok: false, reason: 'wrong_purpose' })
  })

  it('no se puede mezclar el payload de otra familia con la firma de la propia', async () => {
    const mine = await signOAuthState({ purpose: 'bank', familyId: 'fam-A', profileId: 'user-A' }, SECRET, NOW)
    const theirs = await signOAuthState({ purpose: 'bank', familyId: 'fam-B', profileId: 'user-B' }, SECRET, NOW)
    const [v, , sigMine] = mine.split('.')
    const [, payloadTheirs] = theirs.split('.')
    expect((await verifyOAuthState(`${v}.${payloadTheirs}.${sigMine}`, 'bank', SECRET, NOW)).ok).toBe(false)
    const ok = await verifyOAuthState(theirs, 'bank', SECRET, NOW)
    expect(ok.ok && ok.payload.familyId === 'fam-B' && ok.payload.profileId === 'user-B').toBe(true) // cada state lleva SU usuario y SU familia
  })

  it('RECHAZA el formato antiguo sin firma (base64 de JSON)', async () => {
    const old = forge({ familyId: 'fam-VICTIMA', memberId: 'mem-V', profileId: 'user-V' })
    expect(await verifyOAuthState(old, 'google', SECRET, NOW)).toEqual({ ok: false, reason: 'malformed' })
    expect((await verifyOAuthState(old, 'bank', SECRET, NOW)).ok).toBe(false)
  })

  it('rechaza vacio, basura y cabecera de version falsa', async () => {
    for (const bad of [null, undefined, '', 'a.b', 'v1..', 'v2.abc.def', 'v1.%%%.@@@', '....']) {
      expect((await verifyOAuthState(bad as string, 'bank', SECRET, NOW)).ok).toBe(false)
    }
  })

  it('sin secreto configurado (o corto) no firma ni acepta nada', async () => {
    await expect(signOAuthState({ purpose: 'bank', familyId: 'f', profileId: 'u' }, undefined, NOW)).rejects.toThrow()
    await expect(signOAuthState({ purpose: 'bank', familyId: 'f', profileId: 'u' }, 'corto', NOW)).rejects.toThrow()
    const t = await signOAuthState({ purpose: 'bank', familyId: 'f', profileId: 'u' }, SECRET, NOW)
    expect(await verifyOAuthState(t, 'bank', undefined, NOW)).toEqual({ ok: false, reason: 'not_configured' })
  })

  it('el state de Google exige memberId', async () => {
    const t = await signOAuthState({ purpose: 'google', familyId: 'f', profileId: 'u' }, SECRET, NOW)
    expect(await verifyOAuthState(t, 'google', SECRET, NOW)).toEqual({ ok: false, reason: 'malformed' })
  })

  it('timingSafeEqual: iguales, distintos y de distinta longitud', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true)
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false)
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 0]))).toBe(false)
  })
})

describe('state firmado: las 4 funciones lo usan de verdad', () => {
  it('los dos callbacks verifican la firma y ya no decodifican el state a mano', () => {
    for (const name of ['enable-banking-auth-callback', 'google-calendar-oauth-callback']) {
      const s = src(name)
      expect(s, name).toContain('verifyOAuthState(')
      expect(s, name).not.toMatch(/JSON\.parse\(atob\(/)
    }
  })
  it('los dos start firman el state y ya no lo arman con btoa', () => {
    for (const name of ['enable-banking-auth-start', 'google-calendar-oauth-start']) {
      const s = src(name)
      expect(s, name).toContain('signOAuthState(')
      expect(s, name).not.toMatch(/state\s*=\s*btoa\(/)
      expect(s, name).toContain('OAUTH_STATE_SECRET')
    }
  })
  it('los callbacks comprueban que el usuario del state pertenece a esa familia', () => {
    expect(src('enable-banking-auth-callback')).toMatch(/initiator\.family_id !== familyId/)
    expect(src('google-calendar-oauth-callback')).toMatch(/\.eq\("linked_profile_id", profileId\)/)
  })
})
