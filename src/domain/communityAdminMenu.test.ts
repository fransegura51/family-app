// Centro de Mando: menú semanal oficial (estados, semana, hora programada, errores, sábados de reprogramación en hora de Madrid, interruptor de solo lectura).
import { describe, expect, it } from 'vitest'
import {
  ADMIN_TEXT,
  MENU_AUTOPUBLISH_KEY,
  MENU_STATE_TEXT,
  SETTING_META,
  approveResultText,
  buildProposalPayload,
  logActionText,
  madridParts,
  menuApproveText,
  menuRescheduleText,
  menuRetryText,
  menuStateLine,
  menuWeekText,
  nextMenuSaturdays,
  proposalToForm,
  toAdminSettings,
  toMenuCheck,
  toMenuData,
  toMenuDetail,
  toMenuList,
  toProposals,
} from '@/domain/communityAdmin'
import { communityErrorCode, communityErrorText } from '@/domain/communityErrors'

const row = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  title: 'Menú de la semana',
  status: 'approved',
  state: 'scheduled',
  version: 2,
  scheduledWeekly: true,
  source: 'Banco editorial · menú 12',
  weekStart: '2026-10-26',
  weekEnd: '2026-11-01',
  publishAt: '2026-10-24T08:00:00+00:00',
  publishedPostId: null,
  publishAttempts: 0,
  publishError: null,
  textStale: false,
  approvedAt: '2026-10-20T08:00:00Z',
  approvedByName: 'Jennifer',
  checkErrors: 0,
  checkWarnings: 2,
  ...over,
})

describe('lista de menús del panel', () => {
  it('convierte la respuesta del servidor: interruptor (solo lectura), estados, semana, hora y error', () => {
    const list = toMenuList({
      autopublish: false,
      menus: [row(), row({ id: 'm2', state: 'error', publishAttempts: 3, publishError: 'P0001: fallo' }), row({ id: 'm3', state: 'draft', publishAt: null, weekStart: null, weekEnd: null, checkErrors: null }), { sin: 'id' }],
    })
    expect(list.autopublish).toBe(false)
    expect(list.menus.map((m) => m.id)).toEqual(['m1', 'm2', 'm3'])
    expect(list.menus[0]).toMatchObject({ state: 'scheduled', weekly: true, weekStart: '2026-10-26', source: 'Banco editorial · menú 12', checkWarnings: 2 })
    expect(list.menus[1]).toMatchObject({ state: 'error', publishAttempts: 3, publishError: 'P0001: fallo' })
    expect(list.menus[2].checkErrors).toBeNull()
  })
  it('datos malos nunca rompen: valores neutros', () => {
    expect(toMenuList(null)).toEqual({ autopublish: false, menus: [] })
    expect(toMenuList({ menus: 'x' }).menus).toEqual([])
    expect(toMenuList({ menus: [{ id: 'a', state: 'rara' }] }).menus[0].state).toBe('draft')
  })
  it('los cinco estados tienen su texto', () => {
    expect(Object.keys(MENU_STATE_TEXT).sort()).toEqual(['draft', 'error', 'published', 'rejected', 'scheduled'])
    expect(MENU_STATE_TEXT.error).toBe('Con error')
  })
  it('la semana se escribe de lunes a domingo en español', () => {
    expect(menuWeekText('2026-10-26', '2026-11-01')).toBe('Semana del 26 de octubre al 1 de noviembre de 2026')
    expect(menuWeekText(null, null)).toBe('Sin semana asignada')
    expect(menuWeekText('mal', '2026-11-01')).toBe('Sin semana asignada')
  })
  it('la línea de estado enseña la hora programada en hora de Madrid, el error o lo que pasará al aprobar', () => {
    const m = toMenuList({ menus: [row(), row({ state: 'error' }), row({ state: 'draft' }), row({ state: 'draft', scheduledWeekly: false }), row({ state: 'published' })] }).menus
    expect(menuStateLine(m[0])).toContain('Sale el sábado, 24 de octubre de 2026, 10:00')
    expect(menuStateLine(m[0])).toContain('Semana del 26 de octubre al 1 de noviembre de 2026')
    expect(menuStateLine(m[1])).toContain('Debía salir el sábado, 24 de octubre de 2026, 10:00')
    expect(menuStateLine(m[2])).toContain('se programa para el próximo sábado a las 10:00')
    expect(menuStateLine(m[3])).toContain('se publica al momento')
    expect(menuStateLine(m[4])).toContain('Publicado')
  })
  it('el cambio de hora no desplaza la hora: sábado 31/10/2026 a las 09:00 UTC es las 10:00 de Madrid', () => {
    expect(menuStateLine(toMenuList({ menus: [row({ publishAt: '2026-10-31T09:00:00Z', weekStart: '2026-11-02', weekEnd: '2026-11-08' })] }).menus[0])).toContain('31 de octubre de 2026, 10:00')
  })
})

describe('detalle y revisión de calidad', () => {
  const raw = {
    ...row({ state: 'draft' }),
    body: 'Texto del menú',
    section: 'recetas',
    topicId: 'menus-planificacion',
    itemError: null,
    check: [
      { code: 'QUANTITY_ABSURD', severity: 'warning', message: 'Cantidad rara', day: 'lunes', meal: 'comida', recipe: 'Lentejas' },
      { code: 'INVALID', severity: 'error', message: 'Faltan días' },
      { message: '' },
    ],
    menu: {
      servings: 4,
      days: [{ day: 'lunes', meals: { comida: { title: 'Lentejas', side: 'Fruta', recipes: [{ title: 'Lentejas', servings: 4, ingredients: [{}, {}], steps: ['a'] }] }, cena: { title: 'Crema', recipes: [] } } }],
    },
  }
  it('toMenuDetail resume el menú (sin pintar las recetas enteras) y trae los avisos', () => {
    const d = toMenuDetail(raw)!
    expect(d.body).toBe('Texto del menú')
    expect(d.menu?.days[0].comida).toEqual({ title: 'Lentejas', side: 'Fruta', recipes: [{ title: 'Lentejas', servings: 4, ingredientCount: 2, stepCount: 1 }] })
    expect(d.menu?.days[0].cena?.side).toBeNull()
    expect(d.check).toHaveLength(2)
    expect(d.check[0]).toMatchObject({ severity: 'warning', day: 'lunes', meal: 'comida', recipe: 'Lentejas' })
    expect(d.check[1]).toMatchObject({ severity: 'error', day: null })
  })
  it('sin id o sin menú no rompe', () => {
    expect(toMenuDetail({})).toBeNull()
    expect(toMenuDetail({ id: 'x' })?.menu).toBeNull()
    expect(toMenuData({ days: [] })).toBeNull()
    expect(toMenuCheck('x')).toEqual([])
  })
})

describe('sábados para reprogramar (hora de Madrid)', () => {
  const isSat10 = (iso: string) => {
    const p = madridParts(new Date(iso))
    return p.isoWeekday === 6 && p.hour === 10 && p.minute === 0
  }
  it('son siempre sábados a las 10:00 de Madrid, futuros y consecutivos, también con el cambio de hora de otoño', () => {
    const list = nextMenuSaturdays(new Date('2026-10-16T10:00:00Z'), 4)
    expect(list.map((s) => s.value)).toEqual(['2026-10-17T08:00:00.000Z', '2026-10-24T08:00:00.000Z', '2026-10-31T09:00:00.000Z', '2026-11-07T09:00:00.000Z'])
    for (const s of list) expect(isSat10(s.value)).toBe(true)
    expect(list[0].label).toContain('sábado')
  })
  it('estrictamente posteriores: el sábado a las 10:00 en punto ya no vale (saldría ese mismo instante)', () => {
    expect(nextMenuSaturdays(new Date('2026-10-24T08:00:00Z'), 1)[0].value).toBe('2026-10-31T09:00:00.000Z')
    expect(nextMenuSaturdays(new Date('2026-10-24T07:59:00Z'), 1)[0].value).toBe('2026-10-24T08:00:00.000Z')
  })
  it('con el cambio de hora de primavera (28/03/2027)', () => {
    const list = nextMenuSaturdays(new Date('2027-03-20T12:00:00Z'), 3)
    expect(list.map((s) => s.value)).toEqual(['2027-03-27T09:00:00.000Z', '2027-04-03T08:00:00.000Z', '2027-04-10T08:00:00.000Z'])
    for (const s of list) expect(isSat10(s.value)).toBe(true)
  })
  it('en domingo o lunes salta al sábado siguiente', () => {
    expect(nextMenuSaturdays(new Date('2026-10-25T12:00:00Z'), 1)[0].value).toBe('2026-10-31T09:00:00.000Z')
    expect(nextMenuSaturdays(new Date('2026-10-26T12:00:00Z'), 1)[0].value).toBe('2026-10-31T09:00:00.000Z')
  })
})

describe('textos de los resultados', () => {
  it('aprobar un menú semanal NO dice que se publica: dice cuándo sale', () => {
    const t = menuApproveText({ scheduled: true, publishAt: '2026-10-24T08:00:00+00:00', weekStart: '2026-10-26', weekEnd: '2026-11-01', postId: null })
    expect(t).toContain('NO se publica ahora')
    expect(t).toContain('24 de octubre de 2026, 10:00')
    expect(t).toContain('Semana del 26 de octubre al 1 de noviembre')
    expect(approveResultText('menu', { scheduled: false, postId: 'p' })).toBe('Menú aprobado y publicado.')
    expect(approveResultText('menu', { scheduled: true, publishAt: '2026-10-24T08:00:00Z', weekStart: '2026-10-26', weekEnd: '2026-11-01' })).toContain('NO se publica ahora')
  })
  it('reintentar: éxito o sigue fallando con el intento y el error', () => {
    expect(menuRetryText({ ok: true, postId: 'p' })).toEqual({ ok: true, text: 'Menú publicado.' })
    const f = menuRetryText({ ok: false, error: 'P0001: fallo', attempts: 4 })
    expect(f.ok).toBe(false)
    expect(f.text).toContain('intento 4')
    expect(f.text).toContain('P0001: fallo')
  })
  it('reprogramar y cancelar la programación', () => {
    expect(menuRescheduleText({ scheduled: true, publishAt: '2026-10-31T09:00:00Z' })).toContain('31 de octubre de 2026, 10:00')
    expect(menuRescheduleText({ scheduled: false })).toContain('vuelve a «Borrador»')
  })
})

describe('propuestas de tipo menú en el panel', () => {
  const [p] = toProposals([
    { id: 'i1', kind: 'menu', section: 'recetas', topicId: 'menus-planificacion', title: 'Menú', body: 'x', status: 'proposed', version: 1, menuWeekStart: '2026-10-26', publishAttempts: 1, publishError: 'fallo', menuTextStale: true, payload: { menu: { days: [] } } },
  ])
  it('se reconocen y llevan semana, intentos, error y aviso de texto sin revisar', () => {
    expect(p.kind).toBe('menu')
    expect(p).toMatchObject({ menuWeekStart: '2026-10-26', publishAttempts: 1, publishError: 'fallo', menuTextStale: true })
  })
  it('al editar el texto NUNCA se mandan los datos del menú (null: el servidor los conserva y avisa)', () => {
    expect(buildProposalPayload('menu', p.payload, proposalToForm(p))).toBeNull()
  })
  it('los demás tipos conservan sus valores neutros', () => {
    const [t] = toProposals([{ id: 'i2', kind: 'tip', title: 'Consejo', status: 'proposed' }])
    expect(t).toMatchObject({ menuWeekStart: null, publishAttempts: 0, publishError: null, menuTextStale: false })
  })
})

describe('interruptor de la publicación automática (solo lectura)', () => {
  it('el texto fijo dice que está DESACTIVADA hasta que se valide', () => {
    expect(ADMIN_TEXT.menuAutopublishOff).toBe('La publicación automática está DESACTIVADA hasta que se valide')
    expect(ADMIN_TEXT.menuAutopublishHelp).toContain('sábado a las 10:00')
    expect(ADMIN_TEXT.menuAutopublishHelp).toContain('no se publica nada')
  })
  it('el ajuste aparece en la configuración pero NUNCA es editable desde el panel', () => {
    expect(MENU_AUTOPUBLISH_KEY).toBe('weekly_menu_autopublish')
    expect(SETTING_META[MENU_AUTOPUBLISH_KEY].editable).toBe(false)
    const s = toAdminSettings({ settings: [{ key: MENU_AUTOPUBLISH_KEY, value: 0, description: 'x' }], blockedDomains: [] }).settings[0]
    expect(s.editable).toBe(false)
    expect(s.value).toBe(0)
    expect(s.label).toContain('menú semanal')
  })
})

describe('historial y errores', () => {
  it('las acciones de menú tienen su frase', () => {
    for (const a of ['menu_published', 'menu_publish_failed', 'menu_rescheduled', 'menu_unscheduled', 'menu_retry_published', 'menu_retry_failed']) expect(logActionText(a)).not.toContain('_')
  })
  it('los errores del servidor del menú tienen su frase en español', () => {
    for (const code of ['MENU_INVALID', 'MENU_TEXT_STALE', 'MENU_WEEK_TAKEN', 'MENU_WEEK_PAST', 'BAD_PUBLISH_AT']) {
      expect(communityErrorCode({ message: `Error: ${code}` })).toBe(code)
      expect(communityErrorText({ message: code })).not.toBe('Algo ha fallado. Inténtalo de nuevo.')
    }
    expect(communityErrorText({ message: 'MENU_WEEK_TAKEN' })).toContain('una por semana'.replace('una', 'uno'))
  })
})
