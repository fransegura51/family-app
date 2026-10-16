// Aviso de alergias e intolerancias en recetas de Cocina (datos de salud, RGPD art. 9): niveles, descargos, permisos y coste (una sola lectura compartida).
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authCallbacks: ((event: string) => void)[] = []
vi.mock('@/data/supabaseClient', () => ({
  supabase: { rpc: vi.fn(), auth: { onAuthStateChange: (cb: (event: string) => void) => { authCallbacks.push(cb); return { data: { subscription: { unsubscribe: () => undefined } } } } } },
}))
const loadMock = vi.fn()
vi.mock('@/data/dietaryRestrictions', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/data/dietaryRestrictions')>()
  return { ...original, loadDietaryOverview: (...args: unknown[]) => loadMock(...args) }
})

import { a11yProblems } from '@/domain/staticA11y'
import { DIETARY_GENERAL_DISCLAIMER, NO_MATCH_DISCLAIMER, type DietaryRestriction } from '@/domain/dietaryRestrictions'
import { DietaryError, DIETARY_ERROR_TEXT, type DietaryOverview } from '@/data/dietaryRestrictions'
import { DietaryWarnings, DietaryWarningsView } from '@/ui/DietaryWarnings'
import { ensureFamilyDietaryLoaded, getFamilyDietaryState, reloadFamilyDietary, resetFamilyDietary, updateFamilyDietaryOverview } from '@/ui/useFamilyDietary'
import * as T from '@/ui/familyDietaryText'

const TRAP_LABEL = 'ZZ_ETIQUETA_TRAMPA_5521'
const TRAP_NOTE = 'ZZ_NOTA_TRAMPA_8842'
const NOW = Date.parse('2026-10-16T10:00:00Z')

function r(over: Partial<DietaryRestriction> = {}): DietaryRestriction {
  return { id: 'r1', memberId: 'm1', kind: 'alergia', allergenKey: 'leche', customLabel: null, severity: 'grave', note: TRAP_NOTE, createdAt: '2026-10-16T10:00:00Z', updatedAt: '2026-10-16T10:00:00Z', ...over }
}
function overview(over: Partial<DietaryOverview> = {}): DietaryOverview {
  return { canManage: true, myMemberId: 'm9', consents: [{ memberId: 'm1', grantedBy: 'p1', grantedAt: '2026-10-16T09:00:00Z', noticeVersion: 'v1' }], restrictions: [r()], ...over }
}
const ing = (...names: string[]) => names.map((name) => ({ name }))
const render = (o: DietaryOverview | null, ingredients: { name: string }[], extra: { loadFailed?: boolean } = {}) =>
  renderToStaticMarkup(<DietaryWarningsView overview={o} ingredients={ingredients} {...extra} />)
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ')

describe('niveles de aviso', () => {
  it('conflicto: el ingrediente y el motivo, sin nombres de persona', () => {
    const html = render(overview(), ing('Queso rallado', 'Harina de arroz'))
    const t = text(html)
    expect(t).toContain('Revisa antes de cocinar')
    expect(t).toContain(T.WARN_LEVEL_LABELS.conflicto)
    expect(t).toContain('Queso rallado')
    expect(t).toContain('Contiene')
    expect(t).toContain(T.WARN_WHO)
    expect(t).toContain('Alguien de tu familia')
    expect(t).toContain('Alergia · grave')
    expect(t).toContain(DIETARY_GENERAL_DISCLAIMER)
    expect(t).not.toContain('Harina de arroz')
    expect(a11yProblems(html)).toEqual([])
  })

  it('conviene revisar: producto compuesto que puede llevarlo sin decirlo', () => {
    const html = render(overview({ restrictions: [r({ severity: null, kind: 'intolerancia', allergenKey: 'lactosa' })] }), ing('Salsa', 'Arroz'))
    const t = text(html)
    expect(t).toContain(T.WARN_LEVEL_LABELS.revisar)
    expect(t).not.toContain(T.WARN_LEVEL_LABELS.conflicto)
    expect(t).toContain('puede llevar')
    expect(t).toContain('Intolerancia')
  })

  it('sin datos suficientes: receta sin ingredientes, sin decir que no hay nada', () => {
    const html = render(overview(), [])
    const t = text(html)
    expect(t).toContain('No se puede comprobar')
    expect(t).toContain(T.WARN_LEVEL_LABELS.sin_datos)
    expect(t).toContain('no tiene ingredientes anotados')
    expect(t).not.toContain(NO_MATCH_DISCLAIMER)
  })

  it('sin coincidencias: descargo fijo, nunca «segura», sin lista de hallazgos ni insignia verde', () => {
    const html = render(overview(), ing('Arroz', 'Tomate', 'Aceite de oliva'))
    const t = text(html)
    expect(t).toContain(NO_MATCH_DISCLAIMER)
    expect(t).not.toContain(T.WARN_LEVEL_LABELS.conflicto)
    expect(html).not.toMatch(/green|verde|✅|✔|✓/i)
    expect(html).not.toContain('<ul')
    expect(a11yProblems(html)).toEqual([])
  })

  it('con conflicto y con revisión a la vez enseña los dos grupos, el de conflicto primero', () => {
    const t = text(render(overview(), ing('Salsa', 'Queso')))
    expect(t.indexOf(T.WARN_LEVEL_LABELS.conflicto)).toBeGreaterThan(-1)
    expect(t.indexOf(T.WARN_LEVEL_LABELS.conflicto)).toBeLessThan(t.indexOf(T.WARN_LEVEL_LABELS.revisar))
  })
})

describe('cuándo NO se pinta nada (la receta se comporta como hoy)', () => {
  it('sin restricciones registradas', () => {
    expect(render(overview({ restrictions: [], consents: [] }), ing('Queso'))).toBe('')
  })
  it('cuenta que no puede ver las de toda la familia (niño o invitado), aunque tenga algo suyo', () => {
    expect(render(overview({ canManage: false }), ing('Queso'))).toBe('')
  })
  it('todavía sin datos (cargando) o sin lectura', () => {
    expect(render(null, ing('Queso'))).toBe('')
  })
  it('si la lectura falló se dice con una frase fija, sin datos de nadie', () => {
    const html = render(null, ing('Queso'), { loadFailed: true })
    expect(text(html)).toContain(T.WARN_LOAD_ERROR)
    expect(html).not.toContain('Queso')
  })
})

describe('privacidad del aviso', () => {
  const restrictions = [r({ allergenKey: null, customLabel: TRAP_LABEL, note: TRAP_NOTE, id: 'r2' }), r()]
  const html = render(overview({ restrictions }), ing(`Salsa ${TRAP_LABEL}`, 'Queso'))
  it('no enseña el texto libre ni la nota que se escribió en la ficha, ni ningún nombre', () => {
    expect(html).not.toContain(TRAP_LABEL.toLowerCase())
    expect(html).not.toContain(TRAP_NOTE)
    expect(html).not.toMatch(/Lucía|Eric|Fernando|Jennifer|Paco/)
  })
  it('la restricción de texto libre avisa con un motivo fijo', () => {
    expect(text(html)).toContain('Coincide con lo que escribiste tú en la ficha')
  })
})

describe('lenguaje: nunca «segura», «libre de», «apta para» ni «sin alérgenos» (salvo la frase negativa fija)', () => {
  const FORBIDDEN = /segur[oa]s?\b|libre de|apt[oa]s? para|sin al[eé]rgenos/i
  const cases: [string, DietaryOverview | null, { name: string }[], boolean?][] = [
    ['conflicto', overview(), ing('Queso')],
    ['revisar', overview(), ing('Salsa')],
    ['sin datos', overview(), []],
    ['sin coincidencias', overview(), ing('Arroz')],
    ['fallo de lectura', null, ing('Arroz'), true],
  ]
  for (const [name, o, ingredients, failed] of cases) {
    it(`${name}`, () => {
      const html = render(o, ingredients, { loadFailed: failed })
      const t = text(html).split(NO_MATCH_DISCLAIMER).join('')
      expect(t).not.toMatch(FORBIDDEN)
    })
  }
  it('el único texto fijo que dice «segura» es la negación del descargo', () => {
    expect(NO_MATCH_DISCLAIMER).toMatch(/no garantiza que la receta sea segura/)
  })
})

describe('coste: una sola lectura compartida', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    loadMock.mockReset()
    loadMock.mockResolvedValue(overview())
    resetFamilyDietary()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('muchas peticiones a la vez (varias recetas o tarjetas) hacen UNA lectura', async () => {
    await Promise.all([ensureFamilyDietaryLoaded(), ensureFamilyDietaryLoaded(), ensureFamilyDietaryLoaded({ maxAgeMs: 600000 })])
    expect(loadMock).toHaveBeenCalledTimes(1)
    expect(getFamilyDietaryState().status).toBe('ready')
  })

  it('con datos recientes no vuelve a leer; con datos de más de 10 minutos, sí (una vez)', async () => {
    await ensureFamilyDietaryLoaded({ maxAgeMs: 600000 })
    await ensureFamilyDietaryLoaded({ maxAgeMs: 600000 })
    expect(loadMock).toHaveBeenCalledTimes(1)
    vi.setSystemTime(NOW + 11 * 60 * 1000)
    await Promise.all([ensureFamilyDietaryLoaded({ maxAgeMs: 600000 }), ensureFamilyDietaryLoaded({ maxAgeMs: 600000 })])
    expect(loadMock).toHaveBeenCalledTimes(2)
  })

  it('sin límite de edad (la ficha de Familia) nunca repite la lectura', async () => {
    await ensureFamilyDietaryLoaded()
    vi.setSystemTime(NOW + 60 * 60 * 1000)
    await ensureFamilyDietaryLoaded()
    expect(loadMock).toHaveBeenCalledTimes(1)
  })

  it('el componente real pinta el aviso con lo ya cargado, sin nueva lectura', async () => {
    await ensureFamilyDietaryLoaded()
    const html = renderToStaticMarkup(<DietaryWarnings ingredients={ing('Queso rallado')} />)
    expect(text(html)).toContain('Revisa antes de cocinar')
    expect(loadMock).toHaveBeenCalledTimes(1)
  })

  it('el componente real, antes de cargar y para una cuenta sin permiso, no pinta nada', async () => {
    expect(renderToStaticMarkup(<DietaryWarnings ingredients={ing('Queso')} />)).toBe('')
    loadMock.mockResolvedValue(overview({ canManage: false }))
    await ensureFamilyDietaryLoaded()
    expect(renderToStaticMarkup(<DietaryWarnings ingredients={ing('Queso')} />)).toBe('')
  })

  it('los cambios hechos en Familia se reflejan en memoria, sin releer', async () => {
    await ensureFamilyDietaryLoaded()
    updateFamilyDietaryOverview((o) => ({ ...o, restrictions: [] }))
    expect(renderToStaticMarkup(<DietaryWarnings ingredients={ing('Queso')} />)).toBe('')
    expect(loadMock).toHaveBeenCalledTimes(1)
  })

  it('un fallo guarda solo una frase fija y no reintenta enseguida; «Volver a intentarlo» sí', async () => {
    loadMock.mockRejectedValue(new DietaryError('network'))
    await ensureFamilyDietaryLoaded()
    const s = getFamilyDietaryState()
    expect(s.status).toBe('error')
    expect(s.errorText).toBe(DIETARY_ERROR_TEXT.network)
    await ensureFamilyDietaryLoaded()
    expect(loadMock).toHaveBeenCalledTimes(1)
    expect(text(renderToStaticMarkup(<DietaryWarnings ingredients={ing('Queso')} />))).toContain(T.WARN_LOAD_ERROR)
    loadMock.mockResolvedValue(overview())
    await reloadFamilyDietary()
    expect(getFamilyDietaryState().status).toBe('ready')
    expect(loadMock).toHaveBeenCalledTimes(2)
  })

  it('un error ajeno (con datos dentro) se convierte en la frase fija', async () => {
    loadMock.mockRejectedValue(new Error('ZZ_CANARIO_ALERGIA_7731'))
    await ensureFamilyDietaryLoaded()
    expect(getFamilyDietaryState().errorText).toBe(DIETARY_ERROR_TEXT.network)
    expect(JSON.stringify(getFamilyDietaryState())).not.toContain('ZZ_CANARIO')
  })

  it('al cerrar sesión se borra todo de la memoria', async () => {
    await ensureFamilyDietaryLoaded()
    expect(authCallbacks.length).toBeGreaterThan(0)
    for (const cb of authCallbacks) cb('TOKEN_REFRESHED')
    expect(getFamilyDietaryState().status).toBe('ready')
    for (const cb of authCallbacks) cb('SIGNED_OUT')
    expect(getFamilyDietaryState()).toMatchObject({ status: 'idle', overview: null })
    expect(renderToStaticMarkup(<DietaryWarnings ingredients={ing('Queso')} />)).toBe('')
  })

  it('una lectura que termina después de cerrar sesión se descarta', async () => {
    let resolve!: (o: DietaryOverview) => void
    loadMock.mockReturnValue(new Promise<DietaryOverview>((res) => (resolve = res)))
    const p = ensureFamilyDietaryLoaded()
    resetFamilyDietary()
    resolve(overview())
    await p
    expect(getFamilyDietaryState()).toMatchObject({ status: 'idle', overview: null })
  })
})
