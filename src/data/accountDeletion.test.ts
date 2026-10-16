// Borrar la cuenta desde dentro de la app (Apple 5.1.1(v)): reglas del servidor, conexión de la pantalla y la base de datos. Se leen los textos de la migración y la función.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decideDeletion } from '../../supabase/functions/_shared/accountDeletion.ts'
import fn from '../../supabase/functions/delete-account/index.ts?raw'
import migration from '../../supabase/migrations/0256_account_deletion.sql?raw'
import card from '@/ui/DeleteAccountCard.tsx?raw'
import settings from '@/ui/MenuSettingsScreen.tsx?raw'

const base = { scope: 'me', confirm: 'BORRAR', role: 'adult', otherAdmins: 1, otherProfiles: 2 }

describe('decideDeletion: quién puede borrar qué', () => {
  it('sin escribir BORRAR nunca se borra nada', () => {
    for (const confirm of [undefined, '', 'borrar', 'Borrar', 'SI', null]) {
      expect(decideDeletion({ ...base, confirm }), String(confirm)).toEqual({ ok: false, status: 400, error: 'confirm_required' })
    }
  })

  it('el alcance tiene que ser «me» o «family»', () => {
    for (const scope of [undefined, '', 'all', 'ME', 42]) expect(decideDeletion({ ...base, scope })).toMatchObject({ ok: false, error: 'invalid_scope' })
  })

  it('cualquier cuenta puede borrar solo la suya si queda alguien más (también un menor)', () => {
    expect(decideDeletion(base)).toEqual({ ok: true })
    expect(decideDeletion({ ...base, role: 'child', otherAdmins: 1 })).toEqual({ ok: true })
  })

  it('la única administradora no puede irse dejando a más gente sin administradora', () => {
    expect(decideDeletion({ ...base, role: 'admin', otherAdmins: 0, otherProfiles: 2 })).toEqual({ ok: false, status: 409, error: 'last_admin' })
    expect(decideDeletion({ ...base, role: 'admin', otherAdmins: 1 })).toEqual({ ok: true })
  })

  it('la única cuenta de la familia tiene que borrar la familia entera (si no, quedarían datos huérfanos)', () => {
    expect(decideDeletion({ ...base, otherProfiles: 0, otherAdmins: 0 })).toEqual({ ok: false, status: 409, error: 'only_account' })
    expect(decideDeletion({ ...base, scope: 'family', role: 'admin', otherProfiles: 0, otherAdmins: 0 })).toEqual({ ok: true })
  })

  it('borrar la familia entera: solo administradoras', () => {
    expect(decideDeletion({ ...base, scope: 'family', role: 'admin' })).toEqual({ ok: true })
    expect(decideDeletion({ ...base, scope: 'family', role: 'adult' })).toEqual({ ok: false, status: 403, error: 'admin_only' })
    expect(decideDeletion({ ...base, scope: 'family', role: 'child' })).toMatchObject({ ok: false, status: 403 })
  })
})

describe('la función de servidor delete-account', () => {
  it('decide con la sesión de quien llama, nunca con un identificador que mande la app', () => {
    expect(fn).toContain('userClient.auth.getUser()')
    expect(fn).toContain('const userId = userData.user.id')
    expect(fn).not.toMatch(/body\.(profile|user|family)Id/)
    expect(fn).toContain('decideDeletion({')
  })

  it('borra los archivos de la familia, cierra los consentimientos del banco y borra los accesos', () => {
    expect(fn).toContain('family_storage_paths')
    expect(fn).toContain('enable-banking-disconnect')
    expect(fn).toContain('admin.auth.admin.deleteUser(')
    expect(fn).toContain('admin.from("families").delete().eq("id", familyId)')
  })

  it('con «solo mi cuenta» se prepara la familia antes de borrar el acceso', () => {
    expect(fn.indexOf('delete_account_prepare')).toBeGreaterThan(0)
    expect(fn.indexOf('delete_account_prepare')).toBeLessThan(fn.indexOf('deleteUser(userId)'))
  })
})

describe('0256: las funciones de la base solo las puede llamar el servidor', () => {
  it('nadie desde la app: ni anónimos ni cuentas con sesión', () => {
    for (const f of ['delete_account_prepare(uuid)', 'family_storage_paths(uuid)']) {
      expect(migration).toContain(`revoke execute on function public.${f} from public, anon, authenticated;`)
      expect(migration).toContain(`grant execute on function public.${f} to service_role;`)
    }
    expect((migration.match(/security definer/g) ?? []).length).toBe(2)
    expect((migration.match(/set search_path = ''/g) ?? []).length).toBe(2)
  })

  it('pasa lo creado a otra persona de la familia y borra todo el rastro de ubicación', () => {
    expect(migration).toContain('update public.events set created_by = v_heir where created_by = p_profile;')
    for (const table of ['member_locations', 'member_location_history', 'location_sharing_consent']) expect(migration).toContain(`delete from public.${table} where member_id = v_member;`)
    expect(migration).toContain('update public.location_device_tokens set revoked_at = now()')
    expect(migration).toContain("'only_account'")
  })
})

describe('la pantalla', () => {
  it('Configuración (tema «Mi cuenta») tiene «Borrar mi cuenta» y solo ofrece borrar la familia entera a las administradoras', () => {
    expect(settings).toContain("<DeleteAccountCard isAdmin={profile.role === 'admin'} />")
    expect(card).toContain('{isAdmin && (')
    expect(card).toContain('Borrar toda la familia')
  })

  it('hay que escribir BORRAR, y al acabar se cierra la sesión y se apaga el envío de ubicación', () => {
    expect(card).toContain('word !== CONFIRM_WORD')
    expect(card).toContain('await disableNativeUpload()')
    expect(card).toContain("supabase.auth.signOut({ scope: 'local' })")
  })
})

describe('deleteAccount (cliente)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
  })
  afterEach(() => {
    vi.doUnmock('@/data/supabaseClient')
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  async function load(response: { ok: boolean; body?: unknown }) {
    vi.doMock('@/data/supabaseClient', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } } }))
    const fetchMock = vi.fn().mockResolvedValue({ ok: response.ok, json: async () => response.body ?? {} })
    vi.stubGlobal('fetch', fetchMock)
    const mod = await import('@/data/accountDeletion')
    return { ...mod, fetchMock }
  }

  it('manda el alcance y la palabra de confirmación con la sesión', async () => {
    const { deleteAccount, fetchMock } = await load({ ok: true })
    await deleteAccount('family')
    expect(fetchMock).toHaveBeenCalledWith('https://x.supabase.co/functions/v1/delete-account', expect.objectContaining({ method: 'POST', body: JSON.stringify({ scope: 'family', confirm: 'BORRAR' }) }))
    expect((fetchMock.mock.calls[0][1] as { headers: Record<string, string> }).headers.Authorization).toBe('Bearer tok')
  })

  it('traduce los motivos del servidor a frases claras', async () => {
    const lastAdmin = await load({ ok: false, body: { error: 'last_admin' } })
    await expect(lastAdmin.deleteAccount('me')).rejects.toThrow('nombra a otra administradora')
    const only = await load({ ok: false, body: { error: 'only_account' } })
    await expect(only.deleteAccount('me')).rejects.toThrow('Borrar toda la familia')
    const unknown = await load({ ok: false, body: {} })
    await expect(unknown.deleteAccount('me')).rejects.toThrow('No he podido borrar la cuenta')
  })
})
