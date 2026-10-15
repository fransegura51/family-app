// Denunciar reseñas (orden 2.2) y avisos de visitantes (orden 2.4): lógica pura del cliente y del Centro de Mando, y los envoltorios de datos.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('@/data/supabaseClient', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }))

import {
  ADMIN_TEXT,
  MODERATION_SECTIONS,
  OVERVIEW_METRICS,
  TARGET_TYPE_TEXT,
  VISITOR_ACTIONS,
  logActionText,
  logTargetText,
  pendingShortcuts,
  resolveActionsFor,
  starsLabel,
  toAdminContent,
  toAdminOverview,
  toHiddenItems,
  toReportGroups,
  toVisitorReports,
  validateVisitorResolution,
  visitorActionsFor,
  visitorHideValue,
  visitorResultText,
} from '@/domain/communityAdmin'
import { REPORT_REASONS } from '@/domain/community'
import { MY_REVIEW_HIDDEN_TEXT, REPORT_DONE_TEXT, REPORT_TARGET_TEXT, isReviewReportable, reportChannel } from '@/domain/communityReports'
import { adminListVisitorReports, adminResolveVisitorReport, visitorReport } from '@/data/communityReports'

const ID = '3f2b1c9e-8a44-4d3a-9b7e-1c2d3e4f5a6b'
const POST = '99999999-4444-4555-8666-aaaaaaaaaaaa'

describe('canal de denuncia (miembro o lector)', () => {
  it('quien puede participar, tiene alias y no está expulsado/a usa la denuncia de miembro', () => {
    expect(reportChannel({ canParticipate: true, hasAlias: true })).toBe('member')
    expect(reportChannel({ canParticipate: true, hasAlias: true, banState: 'ok' })).toBe('member')
  })

  it('solo lectura, sin alias o con expulsión usa el aviso de lector (nadie se queda sin poder avisar)', () => {
    expect(reportChannel({ canParticipate: false, hasAlias: true })).toBe('visitor')
    expect(reportChannel({ canParticipate: true, hasAlias: false })).toBe('visitor')
    expect(reportChannel({ canParticipate: false, hasAlias: false })).toBe('visitor')
    expect(reportChannel({ canParticipate: true, hasAlias: true, banState: 'banned' })).toBe('visitor')
    expect(reportChannel({ canParticipate: true, hasAlias: true, banState: 'readmission' })).toBe('visitor')
  })
})

describe('reseñas denunciables', () => {
  const base = { id: ID, review: 'Me salió muy rico', mine: false, blockedByMe: false }

  it('solo las ajenas, publicadas (con id) y con texto', () => {
    expect(isReviewReportable(base)).toBe(true)
    expect(isReviewReportable({ ...base, mine: true })).toBe(false)
    expect(isReviewReportable({ ...base, blockedByMe: true })).toBe(false)
    expect(isReviewReportable({ ...base, review: '   ' })).toBe(false)
    expect(isReviewReportable({ ...base, review: null })).toBe(false)
    expect(isReviewReportable({ ...base, review: undefined })).toBe(false)
    expect(isReviewReportable({ ...base, id: undefined })).toBe(false)
    expect(isReviewReportable({ ...base, id: '' })).toBe(false)
  })

  it('textos fijos pedidos por la dueña', () => {
    expect(REPORT_TARGET_TEXT.review).toBe('esta reseña')
    expect(REPORT_DONE_TEXT).toBe('Gracias, la administración lo revisará.')
    expect(MY_REVIEW_HIDDEN_TEXT).toBe('Tu reseña está oculta por moderación; las estrellas se conservan.')
  })
})

describe('Centro de Mando: reseñas', () => {
  it('etiqueta «Reseña» y estrellas en palabras', () => {
    expect(TARGET_TYPE_TEXT.review).toBe('Reseña')
    expect(starsLabel(3)).toBe('★★★☆☆ (3 de 5)')
    expect(starsLabel(5)).toBe('★★★★★ (5 de 5)')
    expect(starsLabel(9)).toBe('★★★★★ (5 de 5)')
    expect(starsLabel(null)).toBe('')
    expect(logTargetText('review')).toBe('Reseña')
  })

  it('las denuncias agrupadas aceptan el tipo review con extracto, estrellas y receta', () => {
    const groups = toReportGroups([
      {
        targetType: 'review',
        targetId: ID,
        reportCount: 2,
        reasons: ['spam', 'acoso'],
        status: 'open',
        content: { excerpt: 'Muy mala', stars: 1, status: 'published', authorId: 'a1', authorAlias: 'Cocinilla', postId: POST },
      },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].targetType).toBe('review')
    expect(groups[0].key).toBe(`review:${ID}`)
    expect(groups[0].content).toMatchObject({ excerpt: 'Muy mala', stars: 1, authorAlias: 'Cocinilla', postId: POST })
    // Un tipo desconocido sigue siendo «post» (nunca rompe la lista).
    expect(toReportGroups([{ targetType: 'otra-cosa', targetId: ID }])[0].targetType).toBe('post')
  })

  it('las acciones de una reseña son las de un contenido (ocultar, advertir, expulsar)', () => {
    expect(resolveActionsFor('review').map((a) => a.id)).toEqual(['sin_accion', 'ocultar', 'advertir', 'expulsar'])
    expect(resolveActionsFor('user').map((a) => a.id)).not.toContain('ocultar')
  })

  it('el contenido completo de una reseña trae estrellas, texto y la publicación de su receta', () => {
    const c = toAdminContent({ type: 'review', id: ID, postId: POST, stars: 4, body: 'Rica', status: 'hidden', hiddenReason: 'Retirado por moderación', authorAlias: 'Ana', reports: [{ reason: 'spam', detail: null, status: 'open' }] })
    expect(c).toMatchObject({ type: 'review', stars: 4, body: 'Rica', postId: POST, status: 'hidden', hiddenReason: 'Retirado por moderación' })
    // Reseña solo con estrellas: texto vacío, sin romper.
    expect(toAdminContent({ type: 'review', id: ID, stars: 5, body: null })?.body).toBe('')
    // Publicaciones y comentarios siguen igual.
    expect(toAdminContent({ type: 'post', id: ID, title: 'T', body: 'B' })).toMatchObject({ type: 'post', stars: null, postId: null })
    expect(toAdminContent({ type: 'comment', id: ID, postId: POST })).toMatchObject({ type: 'comment', postId: POST })
  })

  it('los ocultos incluyen reseñas', () => {
    const items = toHiddenItems([{ type: 'review', id: ID, title: 'Mala', reason: 'auto: varias denuncias', hiddenAt: '2026-10-15T10:00:00Z', authorAlias: 'Ana' }])
    expect(items[0]).toMatchObject({ type: 'review', key: `review:${ID}`, automatic: true })
  })

  it('el historial entiende las acciones sobre avisos de visitantes', () => {
    for (const a of ['sin_accion', 'oculto', 'advertencia', 'expulsion', 'otro']) expect(logActionText(`resolve_visitor_${a}`)).not.toContain('resolve_visitor')
  })
})

describe('Centro de Mando: resumen y apartado de visitantes', () => {
  it('el apartado «Denuncias de visitantes» existe en Moderación', () => {
    const ids = MODERATION_SECTIONS.map((s) => s.id)
    expect(ids).toContain('visitantes')
    expect(MODERATION_SECTIONS.find((s) => s.id === 'visitantes')?.label).toBe('Denuncias de visitantes')
    // Va justo después de las denuncias de miembros.
    expect(ids.indexOf('visitantes')).toBe(ids.indexOf('denuncias') + 1)
  })

  it('el resumen cuenta los avisos abiertos y da un acceso rápido solo si hay', () => {
    expect(toAdminOverview({ openVisitorReports: 4 }).openVisitorReports).toBe(4)
    expect(toAdminOverview({}).openVisitorReports).toBe(0)
    expect(OVERVIEW_METRICS.some((m) => m.key === 'openVisitorReports')).toBe(true)
    expect(pendingShortcuts(toAdminOverview({})).some((s) => s.id === 'visitors')).toBe(false)
    const s = pendingShortcuts(toAdminOverview({ openVisitorReports: 3 })).find((x) => x.id === 'visitors')
    expect(s).toMatchObject({ tab: 'moderacion', section: 'visitantes', count: 3 })
  })

  it('texto fijo: los avisos de visitantes nunca ocultan nada solos', () => {
    expect(ADMIN_TEXT.visitorNeverHides).toContain('nunca ocultan nada por sí solos')
    expect(ADMIN_TEXT.visitorNeverHides).toContain('nunca como enlace')
  })
})

describe('avisos de visitantes: lectura del servidor', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: ID,
    targetType: 'review',
    targetId: POST,
    reason: 'enganoso',
    detail: 'Es publicidad',
    contact: 'persona@ejemplo.es',
    source: 'visitor',
    status: 'open',
    resolution: null,
    resolutionNote: null,
    resolvedAt: null,
    createdAt: '2026-10-15T08:00:00Z',
    content: { excerpt: 'Compra en mi tienda', stars: 5, status: 'published', hidden: false, authorId: 'a1', authorAlias: 'Spamer', postId: ID },
    ...over,
  })

  it('convierte la fila con motivo, detalle, contacto como texto, origen y extracto', () => {
    const [r] = toVisitorReports([row()])
    expect(r).toMatchObject({ id: ID, targetType: 'review', reason: 'enganoso', detail: 'Es publicidad', contact: 'persona@ejemplo.es', source: 'visitor', status: 'open' })
    expect(r.content).toMatchObject({ excerpt: 'Compra en mi tienda', stars: 5, hidden: false, authorAlias: 'Spamer', postId: ID })
  })

  it('distingue «visitante» y «lector sin alias», y detecta contenido oculto o que ya no existe', () => {
    expect(toVisitorReports([row({ source: 'reader' })])[0].source).toBe('reader')
    expect(toVisitorReports([row({ source: 'raro' })])[0].source).toBe('visitor')
    expect(toVisitorReports([row({ content: { status: 'hidden', hidden: true, authorAlias: 'X' } })])[0].content?.hidden).toBe(true)
    expect(toVisitorReports([row({ content: null })])[0].content).toBeNull()
    expect(toVisitorReports([row({ detail: '', contact: null })])[0]).toMatchObject({ detail: null, contact: null })
  })

  it('una fila rota se descarta y un tipo raro cae en «post»; resueltas traen decisión y nota', () => {
    expect(toVisitorReports([{ nada: true }, null, 'x'])).toEqual([])
    expect(toVisitorReports([row({ targetType: 'persona' })])[0].targetType).toBe('post')
    const [done] = toVisitorReports([row({ status: 'resolved', resolution: 'oculto', resolutionNote: 'Era spam', resolvedAt: '2026-10-15T09:00:00Z' })])
    expect(done).toMatchObject({ status: 'resolved', resolution: 'oculto', resolutionNote: 'Era spam' })
    expect(toVisitorReports([row({ resolution: 'invent' })])[0].resolution).toBeNull()
  })
})

describe('avisos de visitantes: acciones', () => {
  const ids = (xs: { id: string }[]) => xs.map((a) => a.id)

  it('las cinco acciones pedidas, con nota obligatoria salvo «Sin acción»', () => {
    expect(ids(VISITOR_ACTIONS)).toEqual(['sin_accion', 'oculto', 'advertencia', 'expulsion', 'otro'])
    expect(VISITOR_ACTIONS.map((a) => a.label)).toEqual(['Sin acción', 'Ocultar contenido', 'Advertir al autor', 'Expulsar', 'Otro'])
    for (const a of VISITOR_ACTIONS) expect(a.needsNote).toBe(a.id !== 'sin_accion')
  })

  it('casilla «ocultar también el contenido»: nunca con «Sin acción», siempre con «Ocultar», opcional en el resto', () => {
    const by = (id: string) => VISITOR_ACTIONS.find((a) => a.id === id)!
    expect(visitorHideValue(by('sin_accion'), true)).toBe(false)
    expect(visitorHideValue(by('oculto'), false)).toBe(true)
    expect(visitorHideValue(by('advertencia'), false)).toBe(false)
    expect(visitorHideValue(by('advertencia'), true)).toBe(true)
    expect(visitorHideValue(by('expulsion'), true)).toBe(true)
    expect(visitorHideValue(by('otro'), true)).toBe(true)
    expect(visitorHideValue(by('otro'), false)).toBe(false)
  })

  it('si el contenido ya no existe solo se puede cerrar el aviso (sin acción u otro)', () => {
    const [withContent] = toVisitorReports([{ id: ID, targetId: POST, content: { authorId: 'a1', authorAlias: 'A' } }])
    expect(ids(visitorActionsFor(withContent))).toEqual(['sin_accion', 'oculto', 'advertencia', 'expulsion', 'otro'])
    const [gone] = toVisitorReports([{ id: ID, targetId: POST, content: null }])
    expect(ids(visitorActionsFor(gone))).toEqual(['sin_accion', 'otro'])
  })

  it('validación: nota obligatoria salvo sin acción, máximo 500 y no ocultar lo que no existe', () => {
    const by = (id: string) => VISITOR_ACTIONS.find((a) => a.id === id)!
    const [r] = toVisitorReports([{ id: ID, targetId: POST, content: { authorId: 'a1' } }])
    const [gone] = toVisitorReports([{ id: ID, targetId: POST, content: null }])
    expect(validateVisitorResolution(by('sin_accion'), '', false, r)).toBeNull()
    expect(validateVisitorResolution(by('oculto'), '', true, r)).toContain('Escribe el motivo')
    expect(validateVisitorResolution(by('oculto'), 'ab', true, r)).toContain('Escribe el motivo')
    expect(validateVisitorResolution(by('oculto'), 'Es spam', true, r)).toBeNull()
    expect(validateVisitorResolution(by('otro'), 'x'.repeat(501), false, r)).toContain('demasiado largo')
    expect(validateVisitorResolution(by('otro'), 'Nada que hacer', true, gone)).toContain('ya no existe')
    expect(validateVisitorResolution(by('otro'), 'Nada que hacer', false, gone)).toBeNull()
  })

  it('texto tras resolver: oculto, advertencia (n de 3) y expulsión', () => {
    expect(visitorResultText('sin_accion', { hidden: false })).toBe('Aviso resuelto.')
    expect(visitorResultText('oculto', { hidden: true })).toContain('El contenido queda oculto.')
    expect(visitorResultText('advertencia', { hidden: true, warningId: 'w', activeWarnings: 2, banned: false })).toContain('Advertencia puesta (2 de 3).')
    expect(visitorResultText('advertencia', { hidden: false, activeWarnings: 3, banned: true })).toContain('expulsada')
    expect(visitorResultText('expulsion', { hidden: true, banned: true })).toContain('expulsada de Comunidad')
  })
})

describe('envoltorios de datos (nombres y argumentos de las funciones del servidor)', () => {
  beforeEach(() => rpc.mockReset())

  it('visitorReport llama a community_visitor_report con huella nula y devuelve alreadyReported', async () => {
    rpc.mockResolvedValue({ data: { ok: true, already_reported: true }, error: null })
    const r = await visitorReport('review', ID, 'spam', 'detalle')
    expect(rpc).toHaveBeenCalledWith('community_visitor_report', { p_type: 'review', p_id: ID, p_reason: 'spam', p_detail: 'detalle', p_contact: null, p_client_hash: null })
    expect(r).toEqual({ ok: true, alreadyReported: true })
  })

  it('los errores del servidor se convierten en frases claras (RATE_LIMIT, NOT_AVAILABLE)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'RATE_LIMIT' } })
    await expect(visitorReport('post', ID, 'spam', null)).rejects.toThrow('Vas muy rápido')
    rpc.mockResolvedValue({ data: null, error: { message: 'NOT_AVAILABLE' } })
    await expect(visitorReport('post', ID, 'spam', null)).rejects.toThrow('ya no está disponible')
  })

  it('lista y resuelve avisos de visitantes (paginación de 20 en 20 + 1)', async () => {
    rpc.mockResolvedValue({ data: [{ id: ID, target_type: 'post' }], error: null })
    expect(await adminListVisitorReports('open', 21, 40)).toEqual([{ id: ID, targetType: 'post' }])
    expect(rpc).toHaveBeenLastCalledWith('community_admin_list_visitor_reports', { p_status: 'open', p_limit: 21, p_offset: 40 })
    rpc.mockResolvedValue({ data: { hidden: true, active_warnings: 1 }, error: null })
    expect(await adminResolveVisitorReport(ID, 'advertencia', 'Motivo', true)).toEqual({ hidden: true, activeWarnings: 1 })
    expect(rpc).toHaveBeenLastCalledWith('community_admin_resolve_visitor_report', { p_id: ID, p_resolution: 'advertencia', p_note: 'Motivo', p_hide: true })
  })
})

describe('motivos', () => {
  it('son los 8 de la aplicación y los acepta el servidor', () => {
    expect(REPORT_REASONS.map((r) => r.id)).toEqual(['spam', 'acoso', 'violencia', 'sexual', 'ilegal', 'datos_privados', 'enganoso', 'otro'])
  })
})
