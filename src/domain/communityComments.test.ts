// Lógica pura de la conversación: orden, días de Madrid, plegado de leídos, respuestas visibles, exposición real y marcas de «visto» sin repetir.
import { describe, expect, it } from 'vitest'
import type { CommentNode, SummaryState } from '@/domain/community'
import {
  ExposureTracker,
  SeenQueue,
  applySeen,
  buildSegments,
  collectNewIds,
  computeFoldedRootIds,
  countPublished,
  dayLabel,
  locateComment,
  madridDayKey,
  mergeRoots,
  newRepliesOf,
  patchComment,
  planSummary,
  qualifiesAsExposed,
  reconcileFolded,
  removeCommentLocal,
  resolveCommentOrder,
  rootIsRead,
  shouldFoldReadComments,
  visibleReplies,
} from '@/domain/communityComments'

function c(id: string, over: Partial<CommentNode> = {}): CommentNode {
  return {
    id,
    parentId: null,
    replyToId: null,
    replyToAlias: null,
    status: 'published',
    authorId: 'a-' + id,
    authorAlias: 'Alias ' + id,
    authorAvatar: null,
    authorIsOfficial: false,
    authorDeleted: false,
    body: 'texto ' + id,
    photoPath: null,
    createdAt: '2026-10-10T12:00:00Z',
    editedAt: null,
    likeCount: 0,
    likedByMe: false,
    mine: false,
    isNew: false,
    canInteract: true,
    replies: [],
    ...over,
  }
}

describe('orden de los comentarios', () => {
  it('el cambio temporal manda sobre la preferencia; sin nada, más antiguos primero', () => {
    expect(resolveCommentOrder(null, 'recientes')).toBe('recientes')
    expect(resolveCommentOrder('utiles', 'recientes')).toBe('utiles')
    expect(resolveCommentOrder(undefined, undefined)).toBe('antiguos')
    expect(resolveCommentOrder('raro' as never, 'otro' as never)).toBe('antiguos')
  })
})

describe('días en hora de Madrid', () => {
  it('un comentario a las 23:30 UTC ya es del día siguiente en Madrid', () => {
    expect(madridDayKey('2026-10-10T23:30:00Z')).toBe('2026-10-11')
    expect(madridDayKey('2026-01-10T23:30:00Z')).toBe('2026-01-11')
    expect(madridDayKey('2026-10-10T21:30:00Z')).toBe('2026-10-10')
    expect(madridDayKey('no es fecha')).toBe('')
  })
  it('Hoy, Ayer y fecha larga (con año solo si no es el actual)', () => {
    expect(dayLabel('2026-10-15', '2026-10-15')).toBe('Hoy')
    expect(dayLabel('2026-10-14', '2026-10-15')).toBe('Ayer')
    expect(dayLabel('2026-10-13', '2026-10-15')).toBe('martes, 13 de octubre')
    expect(dayLabel('2025-12-30', '2026-01-02')).toContain('2025')
    expect(dayLabel('2026-09-30', '2026-10-01')).toBe('Ayer')
  })
})

describe('plegar los leídos por días', () => {
  const today = '2026-10-15'
  it('solo con la preferencia activa Y 15 comentarios o más', () => {
    expect(shouldFoldReadComments(15, true)).toBe(true)
    expect(shouldFoldReadComments(14, true)).toBe(false)
    expect(shouldFoldReadComments(40, false)).toBe(false)
    expect(shouldFoldReadComments(10, true, 10)).toBe(true)
  })

  it('un comentario está leído si ni él ni sus respuestas son nuevos', () => {
    expect(rootIsRead(c('1'))).toBe(true)
    expect(rootIsRead(c('1', { isNew: true }))).toBe(false)
    expect(rootIsRead(c('1', { replies: [c('2', { isNew: true })] }))).toBe(false)
    expect(newRepliesOf(c('1', { replies: [c('2', { isNew: true }), c('3')] }))).toBe(1)
  })

  it('pliega los leídos de días anteriores y deja los nuevos y los de hoy desplegados', () => {
    const roots = [
      c('viejo-leido', { createdAt: '2026-10-10T10:00:00Z' }),
      c('viejo-nuevo', { createdAt: '2026-10-10T11:00:00Z', isNew: true }),
      c('hoy-leido', { createdAt: '2026-10-15T08:00:00Z' }),
      c('viejo-con-respuesta-nueva', { createdAt: '2026-10-11T08:00:00Z', replies: [c('r', { isNew: true })] }),
    ]
    const folded = computeFoldedRootIds(roots, { fold: true, todayKey: today })
    expect([...folded]).toEqual(['viejo-leido'])
    expect(computeFoldedRootIds(roots, { fold: false, todayKey: today }).size).toBe(0)
  })

  it('agrupa por días: rachas del mismo día en un grupo; otro día o un comentario suelto parten el grupo', () => {
    const roots = [
      c('a', { createdAt: '2026-10-10T10:00:00Z' }),
      c('b', { createdAt: '2026-10-10T12:00:00Z' }),
      c('n', { createdAt: '2026-10-10T13:00:00Z', isNew: true }),
      c('d', { createdAt: '2026-10-11T10:00:00Z' }),
    ]
    const folded = computeFoldedRootIds(roots, { fold: true, todayKey: today })
    const seg = buildSegments(roots, folded)
    expect(seg.map((s) => s.type)).toEqual(['fold', 'comment', 'fold'])
    const first = seg[0]
    expect(first.type === 'fold' && first.comments.map((x) => x.id)).toEqual(['a', 'b'])
    expect(first.type === 'fold' && first.dayKey).toBe('2026-10-10')
    // Sin plegar, todo son comentarios sueltos.
    expect(buildSegments(roots, new Set()).every((s) => s.type === 'comment')).toBe(true)
  })

  it('la decisión se toma una vez: lo que se marca como visto después NO se pliega solo', () => {
    const roots = [c('x', { createdAt: '2026-10-10T10:00:00Z', isNew: true })]
    const first = reconcileFolded({ folded: new Set(), decided: new Set() }, roots, { fold: true, todayKey: today })
    expect(first.folded.size).toBe(0)
    const seen = applySeen(roots, new Set(['x']))
    const second = reconcileFolded(first, seen, { fold: true, todayKey: today })
    expect(second.folded.size).toBe(0)
  })

  it('una respuesta nueva en un grupo plegado lo despliega', () => {
    const old = c('old', { createdAt: '2026-10-10T10:00:00Z' })
    const s1 = reconcileFolded({ folded: new Set(), decided: new Set() }, [old], { fold: true, todayKey: today })
    expect(s1.folded.has('old')).toBe(true)
    const withReply = { ...old, replies: [c('nuevo', { isNew: true })] }
    const s2 = reconcileFolded(s1, [withReply], { fold: true, todayKey: today })
    expect(s2.folded.has('old')).toBe(false)
  })
})

describe('buscar un comentario (venir de un aviso)', () => {
  const roots = [c('1'), c('2', { replies: [c('2a'), c('2b')] })]
  it('localiza raíces y respuestas', () => {
    expect(locateComment(roots, '1')).toEqual({ rootId: '1', replyId: null })
    expect(locateComment(roots, '2b')).toEqual({ rootId: '2', replyId: '2b' })
    expect(locateComment(roots, 'zzz')).toBeNull()
  })
})

describe('Ver respuestas (X)', () => {
  const mk = (n: number, newIdx: number[] = []) => Array.from({ length: n }, (_, i) => c('r' + i, { isNew: newIdx.includes(i) }))
  it('hasta 3 respuestas se ven siempre', () => {
    expect(visibleReplies(mk(3), { expanded: false })).toMatchObject({ hiddenCount: 0 })
    expect(visibleReplies(mk(3), { expanded: false }).shown).toHaveLength(3)
  })
  it('con más de 3 quedan ocultas, salvo las nuevas y la buscada', () => {
    const r = visibleReplies(mk(6, [4]), { expanded: false, forceIds: ['r1'] })
    expect(r.shown.map((x) => x.id)).toEqual(['r1', 'r4'])
    expect(r.hiddenCount).toBe(4)
    expect(visibleReplies(mk(6), { expanded: true })).toMatchObject({ hiddenCount: 0 })
    expect(visibleReplies(mk(6), { expanded: false }).shown).toHaveLength(0)
  })
})

describe('cambios locales', () => {
  const roots = [c('1', { replies: [c('1a', { isNew: true }), c('1b', { isNew: true })], newReplyCount: 2 }), c('2')]
  it('marcar como visto baja «X respuestas nuevas» solo de las vistas', () => {
    const after = applySeen(roots, new Set(['1a']))
    expect(newRepliesOf(after[0])).toBe(1)
    expect(after[0].newReplyCount).toBe(1)
    expect(applySeen(after, new Set(['1b']))[0].newReplyCount).toBe(0)
    // Lo que no cambia no se vuelve a crear.
    expect(applySeen(roots, new Set(['2']))[1]).toBe(roots[1])
  })
  it('recoge solo los ids que necesitan marca (publicados, nuevos y ajenos)', () => {
    const list = [c('n', { isNew: true }), c('mio', { isNew: true, mine: true }), c('b', { isNew: true, blockedByMe: true }), c('q', { status: 'removed', isNew: true }), c('p', { replies: [c('pr', { isNew: true })] })]
    expect(collectNewIds(list)).toEqual(['n', 'pr'])
  })
  it('me gusta: parchea un comentario o una respuesta sin tocar el resto', () => {
    const out = patchComment(roots, '1b', (x) => ({ ...x, likeCount: 5 }))
    expect(out[0].replies?.[1].likeCount).toBe(5)
    expect(out[1]).toBe(roots[1])
  })
  it('borrar: un raíz con respuestas queda como «eliminado»; sin respuestas desaparece; una respuesta desaparece', () => {
    const del1 = removeCommentLocal(roots, '1')
    expect(del1[0].status).toBe('removed')
    expect(del1[0].replies).toHaveLength(2)
    expect(removeCommentLocal(roots, '2').map((x) => x.id)).toEqual(['1'])
    const delReply = removeCommentLocal(roots, '1a')
    expect(delReply[0].replies?.map((x) => x.id)).toEqual(['1b'])
    // Un raíz ya eliminado cuya última respuesta se borra desaparece.
    const removedRoot = [{ ...c('x'), status: 'removed' as const, replies: [c('xa')] }]
    expect(removeCommentLocal(removedRoot, 'xa')).toEqual([])
  })
  it('une páginas sin repetir y cuenta solo lo publicado', () => {
    expect(mergeRoots([c('1'), c('2')], [c('2'), c('3')]).map((x) => x.id)).toEqual(['1', '2', '3'])
    expect(countPublished([c('1', { replies: [c('1a')] }), { ...c('2'), status: 'removed' }, c('3', { blockedByMe: true })])).toBe(2)
  })
})

describe('exposición real en pantalla', () => {
  it('cuenta con el 50 % del comentario, o la mitad de la pantalla si es muy alto', () => {
    expect(qualifiesAsExposed(0.5, 100, 800)).toBe(true)
    expect(qualifiesAsExposed(0.49, 100, 800)).toBe(false)
    expect(qualifiesAsExposed(0.2, 450, 800)).toBe(true)
    expect(qualifiesAsExposed(0.2, 300, 800)).toBe(false)
  })

  it('no cuenta hasta pasar 1 segundo a la vista; salir antes lo anula', () => {
    const t = new ExposureTracker()
    t.enter('a', 1000)
    t.enter('b', 1000)
    expect(t.due(1900)).toEqual([])
    t.leave('b')
    expect(t.due(2000)).toEqual(['a'])
    expect(t.due(5000)).toEqual([])
    // Ya contado: volver a verlo no lo repite.
    t.enter('a', 6000)
    expect(t.due(9000)).toEqual([])
    expect(t.isReported('a')).toBe(true)
  })

  it('abrir la publicación sin ver nada no marca nada', () => {
    const t = new ExposureTracker()
    expect(t.due(10_000)).toEqual([])
    expect(t.nextDueIn(10_000)).toBeNull()
  })

  it('con la pestaña oculta no corre el tiempo y al volver empieza de cero', () => {
    const t = new ExposureTracker()
    t.enter('a', 0)
    t.setPageVisible(false, 500)
    expect(t.due(5000)).toEqual([])
    expect(t.nextDueIn(5000)).toBeNull()
    t.setPageVisible(true, 6000)
    expect(t.due(6500)).toEqual([])
    expect(t.nextDueIn(6500)).toBe(500)
    expect(t.due(7000)).toEqual(['a'])
  })

  it('calcula cuánto falta para el próximo', () => {
    const t = new ExposureTracker()
    t.enter('a', 0)
    t.enter('b', 400)
    expect(t.nextDueIn(600)).toBe(400)
  })
})

describe('marcas de «visto» sin repetir y en lotes', () => {
  it('no manda dos veces el mismo id ni uno que ya está en camino', () => {
    const q = new SeenQueue()
    expect(q.add(['a', 'b', 'a'])).toBe(2)
    const batch = q.take(50)
    expect(batch).toEqual(['a', 'b'])
    expect(q.add(['a', 'c'])).toBe(1)
    q.confirm(batch)
    expect(q.add(['a', 'b'])).toBe(0)
  })
  it('corta en lotes del tamaño pedido', () => {
    const q = new SeenQueue()
    q.add(Array.from({ length: 120 }, (_, i) => 'id' + i))
    expect(q.take(50)).toHaveLength(50)
    expect(q.take(50)).toHaveLength(50)
    expect(q.take(50)).toHaveLength(20)
    expect(q.take(50)).toHaveLength(0)
  })
  it('si falla la llamada, vuelven a la cola para reintentar sin duplicarse', () => {
    const q = new SeenQueue()
    q.add(['a', 'b'])
    const batch = q.take()
    q.fail(batch)
    expect(q.size).toBe(2)
    expect(q.add(['a'])).toBe(0)
    expect(q.take()).toEqual(['a', 'b'])
  })
})

describe('resumen de Pepa', () => {
  const base: SummaryState = { commentCount: 20, eligible: true, threshold: 15, summary: 'x', generatedAt: null, commentsSince: 0, stale: false }
  it('con menos comentarios no hay resumen ni plegado', () => {
    expect(planSummary({ ...base, commentCount: 5, eligible: false })).toEqual({ useSummary: false, foldConversation: false, needsGenerate: false })
    expect(planSummary(null)).toEqual({ useSummary: false, foldConversation: false, needsGenerate: false })
  })
  it('con 15 o más: resumen, conversación plegada y pide uno nuevo solo si hace falta', () => {
    expect(planSummary(base)).toEqual({ useSummary: true, foldConversation: true, needsGenerate: false })
    expect(planSummary({ ...base, stale: true }).needsGenerate).toBe(true)
    expect(planSummary({ ...base, summary: null }).needsGenerate).toBe(true)
  })
})
