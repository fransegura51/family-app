// Centro de Mando de Comunidad: conversión de datos del servidor, textos de estado, reglas de validación y horas de las encuestas (hora de Madrid).
import { describe, expect, it } from 'vitest'
import {
  ADMIN_TABS,
  ADMIN_TEXT,
  LAUNCH_KEY,
  LOG_PAGE_SIZE,
  activeWarningCount,
  approvalLine,
  approveResultText,
  banStateText,
  batchWeekText,
  buildPollRows,
  buildProposalPayload,
  currentBan,
  formatMadrid,
  isAutoHidden,
  launchText,
  logActionText,
  logExtra,
  logTargetText,
  madridWallToInstant,
  normalizeDomain,
  parseAdminTab,
  pendingShortcuts,
  pollClosesAt,
  pollPhase,
  pollPhaseText,
  pollResultLines,
  proposalToForm,
  reasonLabel,
  removalScopeText,
  reportCountText,
  resolveActionsFor,
  safeSourceUrl,
  splitPage,
  toAdminContent,
  toAdminOverview,
  toAdminSettings,
  toAdminUsers,
  toFeaturedItems,
  toHiddenItems,
  toLogEntries,
  toProposals,
  toReadmissions,
  toRemovalRequests,
  toReportGroups,
  validateAdminNote,
  validateProposalForm,
  validateSettingValue,
  warnResultText,
  FIXED_SETTING_LABEL,
  SETTING_META,
} from '@/domain/communityAdmin'

describe('pestañas', () => {
  it('son las 8 del Centro de Mando, en orden', () => {
    expect(ADMIN_TABS.map((t) => t.id)).toEqual(['resumen', 'moderacion', 'usuarios', 'oficial', 'encuestas', 'destacados', 'configuracion', 'historial'])
  })
  it('un valor raro en la dirección vuelve a Resumen', () => {
    expect(parseAdminTab('usuarios')).toBe('usuarios')
    expect(parseAdminTab('nada')).toBe('resumen')
    expect(parseAdminTab(null)).toBe('resumen')
  })
})

describe('resumen', () => {
  it('convierte las métricas reales y no inventa las que faltan', () => {
    const o = toAdminOverview({ posts: 12, posts7d: 3, comments7d: 9, members: 5, openReports: 2, hiddenContent: 1, activeBans: 0, readmissionRequests: 1, removalRequests: 0, featured: 4 })
    expect(o).toMatchObject({ posts: 12, posts7d: 3, comments7d: 9, members: 5, openReports: 2, hiddenContent: 1, readmissionRequests: 1, featured: 4 })
    expect(toAdminOverview(null).posts).toBe(0)
    expect(toAdminOverview({ posts: 'x' }).posts).toBe(0)
  })
  it('los accesos rápidos solo enseñan lo pendiente (y siempre las propuestas de Pepa)', () => {
    const vacio = pendingShortcuts(toAdminOverview({}))
    expect(vacio.map((s) => s.id)).toEqual(['proposals'])
    const todo = pendingShortcuts(toAdminOverview({ openReports: 2, readmissionRequests: 1, removalRequests: 3, hiddenContent: 4, featured: 1 }))
    expect(todo.map((s) => s.id)).toEqual(['reports', 'readmissions', 'removals', 'hidden', 'proposals', 'featured'])
    expect(todo[0]).toMatchObject({ tab: 'moderacion', section: 'denuncias', count: 2 })
    expect(todo.find((s) => s.id === 'removals')?.section).toBe('eliminacion')
  })
  it('el interruptor explica qué pasa al abrir y al cerrar', () => {
    const cerrada = launchText(false)
    expect(cerrada.button).toBe('Abrir Comunidad a todos')
    expect(cerrada.state).toContain('CERRADA')
    expect(cerrada.effect).toContain('podrán leer')
    const abierta = launchText(true)
    expect(abierta.button).toBe('Cerrar Comunidad')
    expect(abierta.effect).toContain('No se borra nada')
  })
})

describe('motivos obligatorios', () => {
  it('exigen al menos 3 letras cuando son obligatorios', () => {
    expect(validateAdminNote('', true)).not.toBeNull()
    expect(validateAdminNote('  a ', true)).not.toBeNull()
    expect(validateAdminNote('Spam', true)).toBeNull()
    expect(validateAdminNote('', false)).toBeNull()
  })
  it('rechazan motivos demasiado largos', () => {
    expect(validateAdminNote('x'.repeat(501), false)).toContain('demasiado largo')
  })
})

describe('denuncias', () => {
  const raw = [
    {
      targetType: 'post',
      targetId: 'p1',
      reportCount: 3,
      reasons: ['spam', 'acoso'],
      firstAt: '2026-10-01T10:00:00Z',
      lastAt: '2026-10-02T10:00:00Z',
      status: 'open',
      resolution: null,
      content: { title: 'Hola', excerpt: 'texto', status: 'published', authorId: 'a1', authorAlias: 'Marta' },
    },
    { targetType: 'user', targetId: 'u1', reportCount: 1, reasons: ['otro'], status: 'resolved', resolution: 'advertencia', content: { authorId: 'u1', authorAlias: 'Luis' } },
    { targetType: 'comment', targetId: '', reportCount: 1 },
  ]
  it('agrupa por contenido y convierte todos los campos', () => {
    const g = toReportGroups(raw)
    expect(g).toHaveLength(2)
    expect(g[0]).toMatchObject({ key: 'post:p1', reportCount: 3, reasons: ['spam', 'acoso'], status: 'open', resolution: null })
    expect(g[0].content).toMatchObject({ authorAlias: 'Marta', status: 'published', title: 'Hola' })
    expect(g[1]).toMatchObject({ key: 'user:u1', status: 'resolved', resolution: 'advertencia' })
  })
  it('un contenido que ya no existe no rompe nada', () => {
    const g = toReportGroups([{ targetType: 'post', targetId: 'p9', reportCount: 1, content: null }])
    expect(g[0].content).toBeNull()
    expect(toReportGroups(null)).toEqual([])
  })
  it('textos de motivos y número de denuncias', () => {
    expect(reasonLabel('acoso')).toBe('Acoso o faltas de respeto')
    expect(reasonLabel('raro')).toBe('raro')
    expect(reportCountText(1)).toBe('1 denuncia')
    expect(reportCountText(4)).toBe('4 denuncias')
  })
  it('las acciones son Sin acción, Ocultar, Advertir y Expulsar; las tres últimas piden motivo', () => {
    const a = resolveActionsFor('post')
    expect(a.map((x) => x.label)).toEqual(['Sin acción', 'Ocultar', 'Advertir', 'Expulsar'])
    expect(a.map((x) => x.needsNote)).toEqual([false, true, true, true])
    expect(a.find((x) => x.id === 'advertir')?.help).toContain('Oculta el contenido')
  })
  it('una denuncia a una persona no ofrece «Ocultar»', () => {
    expect(resolveActionsFor('user').map((x) => x.id)).toEqual(['sin_accion', 'advertir', 'expulsar'])
  })
  it('convierte el contenido completo con sus denuncias y fotos', () => {
    const c = toAdminContent({
      type: 'comment',
      id: 'c1',
      postId: 'p1',
      body: 'hola',
      photoPath: 'u/a.jpg',
      status: 'hidden',
      hiddenReason: 'auto: algo',
      authorAlias: 'Ana',
      reports: [{ reason: 'spam', detail: 'es publicidad', status: 'open', createdAt: '2026-10-01T00:00:00Z' }],
    })
    expect(c).toMatchObject({ type: 'comment', postId: 'p1', photos: ['u/a.jpg'], status: 'hidden' })
    expect(c?.reports[0]).toMatchObject({ reason: 'spam', detail: 'es publicidad' })
    expect(toAdminContent(null)).toBeNull()
  })
})

describe('ocultos, readmisiones y eliminación', () => {
  it('distingue lo ocultado automáticamente (provisional)', () => {
    expect(isAutoHidden('auto: varias denuncias')).toBe(true)
    expect(isAutoHidden('Retirado por moderación')).toBe(false)
    expect(isAutoHidden(null)).toBe(false)
    const h = toHiddenItems([{ type: 'post', id: 'p1', title: 'T', reason: 'auto: x', hiddenAt: '2026-10-01T00:00:00Z', authorAlias: 'Ana' }, { type: 'comment', id: '' }])
    expect(h).toHaveLength(1)
    expect(h[0]).toMatchObject({ key: 'post:p1', automatic: true, authorAlias: 'Ana' })
  })
  it('convierte las readmisiones pendientes', () => {
    const r = toReadmissions([{ banId: 'b1', profileId: 'u1', alias: 'Pablo', reason: 'Tercera advertencia', endsAt: '2026-10-01T00:00:00Z', requestedAt: '2026-10-05T00:00:00Z' }, {}])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ banId: 'b1', alias: 'Pablo' })
  })
  it('las solicitudes de eliminación no enseñan datos de contacto', () => {
    const r = toRemovalRequests([{ id: 'q1', scope: 'specific', targetType: 'comment', detail: 'quiero borrarlo', status: 'open', alias: 'Eva', requesterContact: 'eva@correo.com', createdAt: '2026-10-01T00:00:00Z' }])
    expect(r[0]).toMatchObject({ id: 'q1', scope: 'specific', targetType: 'comment', status: 'open', alias: 'Eva' })
    expect(JSON.stringify(r)).not.toContain('correo.com')
    expect(removalScopeText(r[0])).toBe('Pide eliminar un comentario concreto')
    expect(removalScopeText({ scope: 'all_my_content', targetType: null })).toContain('TODAS')
  })
})

describe('usuarios', () => {
  const user = {
    id: 'u1',
    alias: 'Rosa',
    createdAt: '2026-09-01T00:00:00Z',
    posts: 4,
    warnings: [
      { id: 'w1', reason: 'a', issuedAt: '2026-09-10T00:00:00Z', revokedAt: null },
      { id: 'w2', reason: 'b', issuedAt: '2026-09-20T00:00:00Z', revokedAt: null },
      { id: 'w3', reason: 'c', issuedAt: '2026-09-25T00:00:00Z', revokedAt: '2026-09-26T00:00:00Z' },
    ],
    bans: [{ id: 'b1', reason: 'Tercera advertencia', startsAt: '2026-09-15T00:00:00Z', endsAt: '2026-10-15T00:00:00Z', liftedAt: null, readmissionStatus: 'none' }],
    banState: 'banned',
  }
  it('convierte perfil, advertencias y expulsiones', () => {
    const [u] = toAdminUsers([user])
    expect(u).toMatchObject({ id: 'u1', alias: 'Rosa', posts: 4, banState: 'banned' })
    expect(u.warnings).toHaveLength(3)
    expect(u.bans[0].readmissionStatus).toBe('none')
  })
  it('las advertencias vigentes cuentan desde la última expulsión y no cuentan las retiradas', () => {
    const [u] = toAdminUsers([user])
    // Solo w2 es posterior a la expulsión del 15/09 y no está retirada… w3 está retirada.
    expect(activeWarningCount(u)).toBe(1)
    expect(activeWarningCount({ warnings: u.warnings, bans: [] })).toBe(2)
  })
  it('encuentra la expulsión que sigue en pie', () => {
    const [u] = toAdminUsers([user])
    expect(currentBan(u)?.id).toBe('b1')
    expect(currentBan({ bans: [{ ...u.bans[0], liftedAt: '2026-09-20T00:00:00Z' }] })).toBeNull()
  })
  it('textos del estado de expulsión', () => {
    expect(banStateText('ok')).toBe('Participa con normalidad')
    expect(banStateText('readmission')).toContain('pedir volver')
    expect(banStateText('banned', '2026-10-15T10:00:00Z')).toContain('15 de octubre de 2026')
  })
  it('el resultado de advertir avisa si era la tercera', () => {
    expect(warnResultText({ activeWarnings: 2, banned: false })).toBe('Advertencia puesta (2 de 3).')
    expect(warnResultText({ activeWarnings: 3, banned: true })).toContain('expulsada de Comunidad 30 días')
  })
})

describe('contenido oficial', () => {
  const raw = [
    {
      id: 'i1',
      kind: 'article',
      section: 'hogar',
      topicId: 'ahorro',
      title: 'Precios',
      body: 'Texto',
      payload: { sources: [{ title: 'INE', publisher: 'INE', url: 'https://ine.es/x', date: '2026-01' }], methodology: 'Comparación', comparison: 'Contexto', extra: 1 },
      batchWeek: '2026-10-12',
      status: 'approved',
      version: 3,
      approvedVersion: 3,
      approvedAt: '2026-10-14T08:00:00Z',
      approvedByName: 'Jennifer',
      publishAt: null,
    },
    { id: 'i2', kind: 'poll', section: 'recetas', topicId: 't', title: '¿Qué cenas?', body: '', payload: { options: ['Pasta', 'Arroz'] }, status: 'proposed', version: 1, publishAt: '2026-10-17T08:00:00Z' },
    { id: 'i3', kind: 'tip', title: 'Consejo', status: 'rarísimo' },
  ]
  it('convierte consejos, encuestas y artículos', () => {
    const [a, p, t] = toProposals(raw)
    expect(a.kind).toBe('article')
    expect(a.payload.sources[0]).toMatchObject({ title: 'INE', url: 'https://ine.es/x' })
    expect(a.payload.methodology).toBe('Comparación')
    expect(p.payload.options).toEqual(['Pasta', 'Arroz'])
    expect(t.status).toBe('proposed')
  })
  it('enseña quién aprobó, cuándo y qué versión', () => {
    const [a, p] = toProposals(raw)
    expect(approvalLine(a)).toContain('Aprobada por Jennifer')
    expect(approvalLine(a)).toContain('versión 3')
    expect(approvalLine(p)).toBeNull()
  })
  it('lote semanal con fecha legible', () => {
    expect(batchWeekText('2026-10-12')).toBe('Lote de la semana del 12 de octubre de 2026')
    expect(batchWeekText(null)).toBe('Lote sin fecha')
  })
  it('solo enlaza fuentes http/https', () => {
    expect(safeSourceUrl('https://www.ine.es/dato')).toBe('https://www.ine.es/dato')
    expect(safeSourceUrl('javascript:alert(1)')).toBeNull()
    expect(safeSourceUrl('no es una url')).toBeNull()
  })
  it('valida la edición según el tipo', () => {
    const [a, p] = toProposals(raw)
    expect(validateProposalForm('article', proposalToForm(a))).toBeNull()
    expect(validateProposalForm('article', { ...proposalToForm(a), title: 'ab' })).toContain('título')
    expect(validateProposalForm('article', { ...proposalToForm(a), sources: [{ title: 'x', publisher: '', url: 'javascript:1', date: '' }] })).toContain('enlace')
    expect(validateProposalForm('poll', { ...proposalToForm(p), options: ['solo una', ' '] })).toContain('al menos 2')
    expect(validateProposalForm('poll', { ...proposalToForm(p), options: ['a', 'A'] })).toContain('repetidas')
    expect(validateProposalForm('poll', { ...proposalToForm(p), options: ['1', '2', '3', '4', '5', '6', '7'] })).toContain('6')
    expect(validateProposalForm('poll', proposalToForm(p))).toBeNull()
  })
  it('la carga útil de edición conserva el resto de datos y limpia opciones y fuentes vacías', () => {
    const [a, p, t] = toProposals(raw)
    expect(buildProposalPayload('tip', t.payload, proposalToForm(t))).toBeNull()
    expect(buildProposalPayload('poll', p.payload, { ...proposalToForm(p), options: [' Pasta ', '', 'Arroz'] })).toEqual({ options: ['Pasta', 'Arroz'] })
    const payload = buildProposalPayload('article', a.payload, { ...proposalToForm(a), sources: [...proposalToForm(a).sources, { title: '', publisher: '', url: '', date: '' }] })
    expect(payload).toMatchObject({ extra: 1, methodology: 'Comparación' })
    expect((payload as { sources: unknown[] }).sources).toHaveLength(1)
  })
  it('los textos de aprobación distinguen consejo, artículo y encuesta programada', () => {
    expect(approveResultText('tip', { scheduled: false })).toContain('Consejo aprobado y publicado')
    expect(approveResultText('article', { scheduled: false })).toContain('Artículo aprobado')
    expect(approveResultText('poll', { scheduled: false })).toContain('publicada ahora')
    const t = approveResultText('poll', { scheduled: true, opensAt: '2026-10-17T08:00:00Z', closesAt: '2026-10-18T15:00:00Z' })
    expect(t).toContain('sábado, 17 de octubre de 2026, 10:00')
    expect(t).toContain('domingo, 18 de octubre de 2026, 17:00')
  })
  it('nada oficial se publica sin aprobación: el texto lo dice', () => {
    expect(ADMIN_TEXT.noPublishWithoutApproval).toContain('Nada oficial se publica sin que una persona lo apruebe')
    expect(ADMIN_TEXT.noPublishWithoutApproval).toContain('ni siquiera cuando llega la fecha')
  })
})

describe('horas de las encuestas (Europe/Madrid)', () => {
  it('formatea en hora peninsular, no en la del navegador', () => {
    expect(formatMadrid('2026-10-17T08:00:00Z', 'full')).toBe('sábado, 17 de octubre de 2026, 10:00')
    expect(formatMadrid('2026-12-19T09:00:00Z', 'full')).toBe('sábado, 19 de diciembre de 2026, 10:00')
    expect(formatMadrid('nada')).toBe('sin fecha')
    expect(formatMadrid(null)).toBe('sin fecha')
  })
  it('hora de pared de Madrid a instante, con verano e invierno', () => {
    expect(madridWallToInstant(2026, 10, 17, 10, 0).toISOString()).toBe('2026-10-17T08:00:00.000Z')
    expect(madridWallToInstant(2026, 12, 19, 10, 0).toISOString()).toBe('2026-12-19T09:00:00.000Z')
  })
  it('abre el sábado a las 10:00 y cierra el domingo a las 17:00 en verano', () => {
    const abre = new Date('2026-10-17T08:00:00Z') // sábado 10:00 CEST
    expect(pollClosesAt(abre).toISOString()).toBe('2026-10-18T15:00:00.000Z') // domingo 17:00 CEST
  })
  it('el cambio de hora de octubre (domingo 25) mueve el cierre una hora', () => {
    const abre = new Date('2026-10-24T08:00:00Z') // sábado 10:00 CEST
    expect(pollClosesAt(abre).toISOString()).toBe('2026-10-25T16:00:00.000Z') // domingo 17:00 CET
    expect(formatMadrid(pollClosesAt(abre), 'full')).toContain('17:00')
  })
  it('el cambio de hora de marzo (domingo 28 de 2027) también', () => {
    const abre = new Date('2027-03-27T09:00:00Z') // sábado 10:00 CET
    expect(pollClosesAt(abre).toISOString()).toBe('2027-03-28T15:00:00.000Z') // domingo 17:00 CEST
  })
  it('si se aprueba dentro de la ventana y abre en domingo, cierra ese mismo domingo', () => {
    const abre = new Date('2026-10-18T10:30:00Z') // domingo 12:30 CEST
    expect(pollClosesAt(abre).toISOString()).toBe('2026-10-18T15:00:00.000Z')
  })
  it('estado: aprobada, abierta o cerrada', () => {
    const abre = new Date('2026-10-17T08:00:00Z')
    const cierra = pollClosesAt(abre)
    expect(pollPhase(new Date('2026-10-16T12:00:00Z'), abre, cierra)).toBe('scheduled')
    expect(pollPhase(new Date('2026-10-17T08:00:00Z'), abre, cierra)).toBe('open')
    expect(pollPhase(new Date('2026-10-18T14:59:00Z'), abre, cierra)).toBe('open')
    expect(pollPhase(new Date('2026-10-18T15:00:00Z'), abre, cierra)).toBe('closed')
    expect(pollPhaseText('open')).toBe('Abierta a votos')
    expect(pollPhaseText('closed')).toBe('Cerrada')
    expect(pollPhaseText(null)).toBe('Sin fecha de apertura')
  })
  it('lista solo encuestas aprobadas o publicadas, de la más reciente a la más antigua', () => {
    const proposals = toProposals([
      { id: 'a', kind: 'poll', title: 'Antigua', status: 'published', publishAt: '2026-10-10T08:00:00Z', publishedPostId: 'post-a', payload: { options: ['x', 'y'] } },
      { id: 'b', kind: 'poll', title: 'Próxima', status: 'approved', publishAt: '2026-10-24T08:00:00Z', payload: { options: ['x', 'y'] } },
      { id: 'c', kind: 'poll', title: 'Pendiente', status: 'proposed', payload: {} },
      { id: 'd', kind: 'tip', title: 'Consejo', status: 'published' },
    ])
    const rows = buildPollRows(proposals, new Date('2026-10-20T12:00:00Z'))
    expect(rows.map((r) => r.id)).toEqual(['b', 'a'])
    expect(rows[0].phase).toBe('scheduled')
    expect(rows[1].phase).toBe('closed')
    expect(rows[1].publishedPostId).toBe('post-a')
  })
  it('resultados con porcentajes', () => {
    const l = pollResultLines(['Pasta', 'Arroz', 'Pizza'], [3, 1, 0], 4)
    expect(l.map((x) => x.percent)).toEqual([75, 25, 0])
    expect(pollResultLines(['a'], null, null)[0]).toMatchObject({ votes: 0, percent: 0 })
  })
})

describe('destacados', () => {
  it('convierte y marca los retirados', () => {
    const f = toFeaturedItems([{ id: 'p1', title: 'Tortilla', featuredAt: '2026-10-01T00:00:00Z', removed: true, likes: 5, comments: 2, saves: 1 }, { id: '' }])
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ removed: true, likes: 5, comments: 2, saves: 1 })
  })
  it('explica que la selección es automática y no necesita aprobación', () => {
    for (const k of ['calidad', 'comentarios', 'me gusta', 'guardados', 'importa', 'cuentas nuevas', 'No hace falta aprobarlos']) expect(ADMIN_TEXT.featuredAuto).toContain(k)
  })
})

describe('configuración', () => {
  const raw = {
    settings: [
      { key: 'first_ban_days', value: 30, description: 'Duración' },
      { key: LAUNCH_KEY, value: 0, description: 'Apertura' },
      { key: 'rareza', value: 'texto', description: 'No numérico' },
    ],
    blockedDomains: [{ domain: 'malo.com', reason: 'spam' }, { domain: 'otro.es' }],
  }
  it('separa números, interruptores y valores que no se pueden editar', () => {
    const s = toAdminSettings(raw)
    expect(s.settings.find((x) => x.key === 'first_ban_days')).toMatchObject({ kind: 'number', value: 30, label: 'Duración de la primera expulsión', unit: 'días' })
    expect(s.settings.find((x) => x.key === LAUNCH_KEY)?.kind).toBe('switch')
    expect(s.settings.find((x) => x.key === 'rareza')).toMatchObject({ kind: 'other', value: null })
    expect(s.blockedDomains).toEqual([{ domain: 'malo.com', reason: 'spam' }, { domain: 'otro.es', reason: null }])
    expect(toAdminSettings(null)).toEqual({ settings: [], blockedDomains: [] })
  })
  it('solo los 6 parámetros autorizados son editables; el resto es solo lectura', () => {
    const editables = ['rate_posts_per_hour', 'rate_comments_per_10min', 'rate_reports_per_day', 'report_autohide_distinct_reporters', 'max_links_per_post', 'ai_daily_cap']
    const fijos = [
      'summary_comment_threshold',
      'summary_refresh_every',
      'pepa_unanswered_hours',
      'pepa_max_per_hour',
      'draft_days',
      'first_ban_days',
      'max_photos_per_post',
      'search_history_size',
      'admin_log_retention_years',
      'participants_adults_only',
      LAUNCH_KEY,
    ]
    const s = toAdminSettings({ settings: [...editables, ...fijos, 'clave_nueva'].map((key) => ({ key, value: 5, description: '' })), blockedDomains: [] }).settings
    for (const k of editables) expect(s.find((x) => x.key === k)?.editable, k).toBe(true)
    for (const k of fijos) expect(s.find((x) => x.key === k)?.editable, k).toBe(false)
    expect(s.find((x) => x.key === 'clave_nueva')?.editable).toBe(false) // una clave desconocida nunca se puede cambiar
    expect(Object.values(SETTING_META).filter((m) => m.editable)).toHaveLength(6)
    expect(FIXED_SETTING_LABEL).toBe('Fijado por las reglas aprobadas')
  })
  it('cada parámetro editable lleva su rango', () => {
    const s = toAdminSettings({ settings: ['report_autohide_distinct_reporters', 'max_links_per_post', 'ai_daily_cap'].map((key) => ({ key, value: 3, description: '' })), blockedDomains: [] }).settings
    const r = (k: string) => s.find((x) => x.key === k)
    expect([r('report_autohide_distinct_reporters')?.min, r('report_autohide_distinct_reporters')?.max]).toEqual([1, 10])
    expect([r('max_links_per_post')?.min, r('max_links_per_post')?.max]).toEqual([1, 50])
    expect([r('ai_daily_cap')?.min, r('ai_daily_cap')?.max]).toEqual([0, 5000])
  })
  it('valida enteros dentro del rango de cada parámetro', () => {
    expect(validateSettingValue('30')).toEqual({ value: 30, error: null })
    expect(validateSettingValue(' 0 ').value).toBe(0)
    expect(validateSettingValue('-1').error).not.toBeNull()
    expect(validateSettingValue('3,5').error).not.toBeNull()
    expect(validateSettingValue('').error).not.toBeNull()
    expect(validateSettingValue('100001').error).toContain('entre 0 y 100000')
    expect(validateSettingValue('0', 1, 10).error).toContain('entre 1 y 10')
    expect(validateSettingValue('11', 1, 10).error).not.toBeNull()
    expect(validateSettingValue('10', 1, 10).value).toBe(10)
    expect(validateSettingValue('5000', 0, 5000).value).toBe(5000)
    expect(validateSettingValue('5001', 0, 5000).error).not.toBeNull()
  })
  it('normaliza dominios', () => {
    expect(normalizeDomain('https://www.Malo.com/ruta?x=1').domain).toBe('malo.com')
    expect(normalizeDomain('sitio.es').domain).toBe('sitio.es')
    expect(normalizeDomain('sin punto').domain).toBeNull()
    expect(normalizeDomain('').error).not.toBeNull()
  })
})

describe('historial', () => {
  it('convierte las acciones y las describe en español', () => {
    const [e] = toLogEntries([{ id: 7, actor: 'Jennifer', action: 'ban', targetType: 'user', reason: 'Acoso', details: { days: 30 }, createdAt: '2026-10-01T10:00:00Z' }])
    expect(e).toMatchObject({ id: '7', actor: 'Jennifer', action: 'ban', reason: 'Acoso' })
    expect(logActionText('ban')).toBe('Expulsó de Comunidad')
    expect(logActionText('accion_nueva')).toBe('accion nueva')
    expect(logTargetText('official_item')).toBe('Propuesta oficial')
    expect(logTargetText('???')).toBe('Otro')
    expect(logExtra(e)).toBe('30 días')
    expect(logExtra({ action: 'proposal_approved', details: { version: 2 } })).toBe('versión 2')
  })
  it('sin actor conocido pone «sistema»', () => {
    expect(toLogEntries([{ id: 1, action: 'x' }])[0].actor).toBe('sistema')
  })
  it('cada acción que registra el servidor tiene frase propia', () => {
    for (const a of ['warning', 'warning_revoked', 'ban', 'ban_lifted', 'resolve_ocultar', 'hide', 'restore', 'readmission_approved', 'removal_done', 'launch', 'unlaunch', 'setting', 'feature', 'unfeature', 'domain_blocked', 'proposal_approved', 'proposal_edit', 'proposal_rejected'])
      expect(logActionText(a), a).not.toBe(a.replace(/_/g, ' '))
  })
  it('pagina pidiendo una fila de más', () => {
    const { page, hasMore } = splitPage(Array.from({ length: LOG_PAGE_SIZE + 1 }, (_, i) => i), LOG_PAGE_SIZE)
    expect(page).toHaveLength(LOG_PAGE_SIZE)
    expect(hasMore).toBe(true)
    expect(splitPage([1, 2], LOG_PAGE_SIZE).hasMore).toBe(false)
  })
  it('es de solo lectura y distinto del historial de avisos', () => {
    expect(ADMIN_TEXT.logReadOnly).toContain('solo de lectura')
    expect(ADMIN_TEXT.logReadOnly).toContain('30 días')
  })
})

describe('reglas de producto en los textos', () => {
  it('moderación: una denuncia sola no retira nada, ocultación provisional y tres advertencias', () => {
    expect(ADMIN_TEXT.reportAloneRemovesNothing).toContain('NO retira nada')
    expect(ADMIN_TEXT.autoHide).toContain('provisional')
    expect(ADMIN_TEXT.autoHide).toContain('3 personas distintas')
    expect(ADMIN_TEXT.threeWarnings).toContain('Tres advertencias')
    expect(ADMIN_TEXT.threeWarnings).toContain('no de la cuenta de PEPA')
    expect(ADMIN_TEXT.threeWarnings).toContain('30 días')
    expect(ADMIN_TEXT.resolvedForBoth).toContain('queda resuelto para el otro')
  })
  it('los dos administradores tienen los mismos permisos y no son el administrador familiar', () => {
    expect(ADMIN_TEXT.twoAdmins).toContain('mismos permisos')
    expect(ADMIN_TEXT.twoAdmins).toContain('ni doble firma')
    expect(ADMIN_TEXT.twoAdmins).toContain('administrador de tu familia')
  })
  it('las encuestas abren el sábado a las 10:00 y cierran el domingo a las 17:00 en hora peninsular', () => {
    expect(ADMIN_TEXT.pollSchedule).toContain('sábado a las 10:00')
    expect(ADMIN_TEXT.pollSchedule).toContain('domingo a las 17:00')
    expect(ADMIN_TEXT.pollSchedule).toContain('hora peninsular')
  })
  it('mensaje para quien no es administrador', () => {
    expect(ADMIN_TEXT.notAdmin).toBe('Esta zona es solo para la administración')
  })
})
