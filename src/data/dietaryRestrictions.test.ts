// Capa de datos de las alergias e intolerancias: argumentos de las funciones del servidor, errores con frases fijas y nada de rastro local.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import raw from './dietaryRestrictions.ts?raw'

const rpc = vi.fn()
vi.mock('@/data/supabaseClient', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }))

import {
  addDietaryRestriction,
  deleteDietaryRestriction,
  DietaryError,
  DIETARY_ERROR_TEXT,
  grantDietaryConsent,
  hasDietaryConsent,
  loadDietaryOverview,
  restrictionsOfMember,
  revokeDietaryConsent,
  updateDietaryRestriction,
} from './dietaryRestrictions'
import { DIETARY_NOTICE_VERSION } from '@/domain/dietaryRestrictions'

const TRAP = 'ZZ_CANARIO_ALERGIA_7731'
const rawRestriction = { id: 'r1', member_id: 'm1', kind: 'alergia', allergen_key: 'leche', custom_label: null, severity: 'grave', note: null, created_at: '2026-10-16T10:00:00Z', updated_at: '2026-10-16T10:00:00Z' }

beforeEach(() => rpc.mockReset())

describe('lectura', () => {
  it('convierte la respuesta a camelCase y usa UNA sola llamada', async () => {
    rpc.mockResolvedValue({ data: { ok: true, can_manage: true, my_member_id: 'm9', consents: [{ member_id: 'm1', granted_by: 'p1', granted_at: '2026-10-16T09:00:00Z', notice_version: 'v1' }], restrictions: [rawRestriction] }, error: null })
    const o = await loadDietaryOverview()
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('dietary_list', {})
    expect(o.canManage).toBe(true)
    expect(o.myMemberId).toBe('m9')
    expect(o.restrictions[0]).toMatchObject({ id: 'r1', memberId: 'm1', allergenKey: 'leche', customLabel: null, severity: 'grave' })
    expect(o.consents[0]).toEqual({ memberId: 'm1', grantedBy: 'p1', grantedAt: '2026-10-16T09:00:00Z', noticeVersion: 'v1' })
    expect(hasDietaryConsent(o, 'm1')).toBe(true)
    expect(hasDietaryConsent(o, 'm2')).toBe(false)
    expect(restrictionsOfMember(o, 'm1')).toHaveLength(1)
    expect(restrictionsOfMember(o, 'm2')).toHaveLength(0)
  })

  it('una cuenta de niño recibe canManage=false', async () => {
    rpc.mockResolvedValue({ data: { ok: true, can_manage: false, my_member_id: 'm3', consents: [], restrictions: [] }, error: null })
    expect((await loadDietaryOverview()).canManage).toBe(false)
  })
})

describe('escritura', () => {
  it('el consentimiento lleva la versión del aviso', async () => {
    rpc.mockResolvedValue({ data: { ok: true, consent: { member_id: 'm1', granted_by: 'p1', granted_at: '2026-10-16T09:00:00Z', notice_version: DIETARY_NOTICE_VERSION } }, error: null })
    const c = await grantDietaryConsent('m1')
    expect(rpc).toHaveBeenCalledWith('dietary_grant_consent', { p_member_id: 'm1', p_notice_version: DIETARY_NOTICE_VERSION })
    expect(c.noticeVersion).toBe(DIETARY_NOTICE_VERSION)
  })

  it('revocar devuelve cuántas se borraron', async () => {
    rpc.mockResolvedValue({ data: { ok: true, deleted: 3 }, error: null })
    expect(await revokeDietaryConsent('m1')).toEqual({ deleted: 3 })
    expect(rpc).toHaveBeenCalledWith('dietary_revoke_consent', { p_member_id: 'm1' })
  })

  it('añadir valida ANTES de llamar al servidor y normaliza el texto', async () => {
    await expect(addDietaryRestriction('m1', { kind: 'alergia', allergenKey: 'platano' })).rejects.toMatchObject({ code: 'invalid' })
    await expect(addDietaryRestriction('m1', { kind: 'alergia' })).rejects.toMatchObject({ code: 'invalid' })
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockResolvedValue({ data: { ok: true, restriction: { ...rawRestriction, allergen_key: null, custom_label: 'Kiwi', kind: 'restriccion', severity: null } }, error: null })
    const r = await addDietaryRestriction('m1', { kind: 'restriccion', customLabel: '  Kiwi ' })
    expect(rpc).toHaveBeenCalledWith('dietary_add', { p_member_id: 'm1', p_kind: 'restriccion', p_allergen_key: null, p_custom_label: 'Kiwi', p_severity: null, p_note: null })
    expect(r.customLabel).toBe('Kiwi')
  })

  it('editar una de catálogo no manda texto libre; una de texto libre sí', async () => {
    rpc.mockResolvedValue({ data: { ok: true, restriction: rawRestriction }, error: null })
    await updateDietaryRestriction({ id: 'r1', allergenKey: 'leche', customLabel: null }, { kind: 'intolerancia', severity: 'leve', note: 'nota' })
    expect(rpc).toHaveBeenLastCalledWith('dietary_update', { p_id: 'r1', p_kind: 'intolerancia', p_custom_label: null, p_severity: 'leve', p_note: 'nota' })
    await updateDietaryRestriction({ id: 'r2', allergenKey: null, customLabel: 'Kiwi' }, { kind: 'restriccion', customLabel: 'Fresa', severity: null, note: null })
    expect(rpc).toHaveBeenLastCalledWith('dietary_update', { p_id: 'r2', p_kind: 'restriccion', p_custom_label: 'Fresa', p_severity: null, p_note: null })
    await expect(updateDietaryRestriction({ id: 'r1', allergenKey: 'lactosa', customLabel: null }, { kind: 'alergia', severity: null, note: null })).rejects.toMatchObject({ code: 'invalid' })
  })

  it('borrar llama a dietary_delete', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null })
    await deleteDietaryRestriction('r1')
    expect(rpc).toHaveBeenCalledWith('dietary_delete', { p_id: 'r1' })
  })
})

describe('errores', () => {
  for (const code of ['forbidden', 'not_found', 'no_consent', 'invalid', 'duplicate', 'limit'] as const) {
    it(`«${code}» del servidor se convierte en su frase fija`, async () => {
      rpc.mockResolvedValue({ data: { ok: false, error: code }, error: null })
      const e = await deleteDietaryRestriction('r1').catch((x) => x)
      expect(e).toBeInstanceOf(DietaryError)
      expect(e.code).toBe(code)
      expect(e.message).toBe(DIETARY_ERROR_TEXT[code])
    })
  }

  it('un fallo de red o un error técnico nunca arrastra el texto del servidor ni lo que se intentaba guardar', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: `duplicate key (${TRAP})`, details: TRAP } })
    const e1 = await addDietaryRestriction('m1', { kind: 'restriccion', customLabel: TRAP, note: TRAP }).catch((x) => x)
    expect(e1.code).toBe('network')
    expect(JSON.stringify([e1.message, e1.stack?.split('\n')[0]])).not.toContain(TRAP)
    rpc.mockRejectedValue(new Error(TRAP))
    const e2 = await loadDietaryOverview().catch((x) => x)
    expect(e2.code).toBe('network')
    expect(e2.message).not.toContain(TRAP)
    rpc.mockResolvedValue({ data: { ok: false, error: `raro ${TRAP}` }, error: null })
    const e3 = await deleteDietaryRestriction('r1').catch((x) => x)
    expect(e3.code).toBe('network')
    expect(e3.message).not.toContain(TRAP)
  })
})

describe('sin rastro local', () => {
  it('solo usa supabase.rpc: ninguna tabla, ni almacenamiento del navegador, ni registros, ni URLs', () => {
    const source = raw.replace(/\/\/.*$/gm, '') // sin comentarios (los comentarios sí pueden nombrar lo que NO se hace)
    expect(source).not.toMatch(/\.from\(/)
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|caches\.|document\.cookie/)
    expect(source).not.toMatch(/console\./)
    expect(source).not.toMatch(/location\.|history\.|URLSearchParams|navigator\./)
    expect(source).not.toMatch(/reportClientError|client_errors/)
    expect([...source.matchAll(/call\('([a-z_]+)'/g)].map((m) => m[1]).sort()).toEqual(['dietary_add', 'dietary_delete', 'dietary_grant_consent', 'dietary_list', 'dietary_revoke_consent', 'dietary_update'])
  })
})
