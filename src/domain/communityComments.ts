// Comunidad PEPA — lógica PURA de la conversación de una publicación (sin red, sin React): agrupar por días, decidir qué se pliega, orden, respuestas visibles,
// exposición real en pantalla y deduplicado de las marcas de «visto». Está aquí aparte para poder probarla sin navegador.
import type { CommentNode, CommentOrder, SummaryState } from '@/domain/community'

export const MADRID_TZ = 'Europe/Madrid'

// Parámetros técnicos (la especificación pide documentarlos): con este número de comentarios o más la conversación empieza plegada con el resumen de Pepa y los
// leídos de días anteriores se pliegan por días. El servidor manda el suyo (`summary.threshold`); este es el valor por defecto si no llega.
export const DEFAULT_FOLD_THRESHOLD = 15
// Más de 3 respuestas bajo un comentario → «Ver respuestas (X)».
export const REPLIES_COLLAPSE_OVER = 3
// Exposición razonable: al menos el 50 % del comentario en pantalla durante al menos 1 segundo.
export const SEEN_MIN_RATIO = 0.5
export const SEEN_MIN_MS = 1000
// Las marcas de «visto» se mandan en lotes (el servidor admite hasta 200 por llamada).
export const SEEN_BATCH_MAX = 50

export const COMMENT_ORDERS: CommentOrder[] = ['antiguos', 'recientes', 'utiles']

// ---- Orden --------------------------------------------------------------------------------------------------------------------------------------------

// El orden de la persona (ajuste permanente) manda, salvo que haya elegido uno TEMPORAL dentro de esta conversación; el temporal nunca se guarda.
export function resolveCommentOrder(temporary: CommentOrder | null | undefined, preferred: CommentOrder | null | undefined): CommentOrder {
  if (temporary && COMMENT_ORDERS.includes(temporary)) return temporary
  if (preferred && COMMENT_ORDERS.includes(preferred)) return preferred
  return 'antiguos'
}

// ---- Días (hora de Madrid) ------------------------------------------------------------------------------------------------------------------------------

const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: MADRID_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

// «2026-10-15» en hora de Madrid ('' si la fecha no es válida). Se compara como texto: el formato permite ordenar.
export function madridDayKey(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return dayFormatter.format(d)
}

function shiftDay(dayKey: string, delta: number): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10)
}

// «Hoy», «Ayer» o «martes 13 de octubre» (con el año si no es el actual).
export function dayLabel(dayKey: string, todayKey: string): string {
  if (!dayKey) return 'Sin fecha'
  if (dayKey === todayKey) return 'Hoy'
  if (dayKey === shiftDay(todayKey, -1)) return 'Ayer'
  const [y, m, d] = dayKey.split('-').map(Number)
  const sameYear = y === Number(todayKey.slice(0, 4))
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  )
}

// ---- Estado de lectura de un comentario ------------------------------------------------------------------------------------------------------------

export const replyListOf = (c: CommentNode): CommentNode[] => c.replies ?? []

export const isBlockedNode = (c: CommentNode): boolean => c.blockedByMe === true
export const isRemovedNode = (c: CommentNode): boolean => c.status === 'removed'

// Cuántas respuestas de este comentario siguen sin verse (se calcula de lo cargado: así baja en cuanto se marcan como vistas).
export function newRepliesOf(root: CommentNode): number {
  return replyListOf(root).filter((r) => r.isNew === true).length
}

// Un comentario raíz está «leído» si ni él ni ninguna de sus respuestas son nuevos.
export function rootIsRead(root: CommentNode): boolean {
  return root.isNew !== true && newRepliesOf(root) === 0
}

// Solo se vigilan en pantalla los comentarios publicados, nuevos y de otras personas (los propios y los ya vistos no necesitan marca).
export function needsSeenMark(c: CommentNode): boolean {
  return c.status === 'published' && c.isNew === true && c.mine !== true && c.blockedByMe !== true
}

export function collectNewIds(roots: CommentNode[]): string[] {
  const out: string[] = []
  for (const r of roots) {
    if (needsSeenMark(r)) out.push(r.id)
    for (const x of replyListOf(r)) if (needsSeenMark(x)) out.push(x.id)
  }
  return out
}

// Comentarios publicados (el raíz si lo está, más sus respuestas): lo que se cuenta a la persona.
export function countPublished(roots: CommentNode[]): number {
  let n = 0
  for (const r of roots) {
    if (r.status === 'published' && !isBlockedNode(r)) n += 1
    n += replyListOf(r).filter((x) => x.status === 'published' && !isBlockedNode(x)).length
  }
  return n
}

// ---- Plegado de comentarios leídos por días ------------------------------------------------------------------------------------------------------

// ¿Hay que plegar los leídos? Solo si la persona lo tiene activado Y la conversación es larga (≥ umbral).
export function shouldFoldReadComments(totalComments: number, foldPreference: boolean, threshold = DEFAULT_FOLD_THRESHOLD): boolean {
  return foldPreference && totalComments >= threshold
}

// Los comentarios raíz que se pliegan: ya leídos Y de un día anterior a hoy.
export function computeFoldedRootIds(roots: CommentNode[], opts: { fold: boolean; todayKey: string }): Set<string> {
  const out = new Set<string>()
  if (!opts.fold) return out
  for (const r of roots) {
    const day = madridDayKey(r.createdAt)
    if (!day || day >= opts.todayKey) continue
    if (rootIsRead(r)) out.add(r.id)
  }
  return out
}

export interface FoldState {
  // Raíces que están plegadas en un grupo de día.
  folded: Set<string>
  // Raíces ya clasificadas: su decisión no cambia aunque luego se marquen como vistas (si no, lo que se está leyendo desaparecería de la pantalla).
  decided: Set<string>
}

// Se decide UNA vez por comentario raíz, al cargarlo. Al recargar (cambiar el orden, publicar un comentario, cargar más) lo ya decidido se respeta, salvo que
// un grupo plegado reciba una respuesta NUEVA de otra persona: entonces ese comentario se despliega (las respuestas nuevas se ven aunque el grupo sea antiguo).
export function reconcileFolded(prev: FoldState, roots: CommentNode[], opts: { fold: boolean; todayKey: string }): FoldState {
  const folded = new Set(prev.folded)
  const decided = new Set(prev.decided)
  const fresh = roots.filter((r) => !decided.has(r.id))
  for (const id of computeFoldedRootIds(fresh, opts)) folded.add(id)
  for (const r of fresh) decided.add(r.id)
  for (const r of roots) if (folded.has(r.id) && !rootIsRead(r)) folded.delete(r.id)
  return { folded, decided }
}

export type CommentSegment = { type: 'comment'; key: string; comment: CommentNode } | { type: 'fold'; key: string; dayKey: string; comments: CommentNode[] }

// Lista de lo que se pinta, en el orden recibido: los comentarios sueltos y, en su sitio, un grupo plegado por cada racha de leídos del mismo día.
export function buildSegments(roots: CommentNode[], folded: Set<string>): CommentSegment[] {
  const out: CommentSegment[] = []
  for (const r of roots) {
    if (!folded.has(r.id)) {
      out.push({ type: 'comment', key: r.id, comment: r })
      continue
    }
    const day = madridDayKey(r.createdAt)
    const last = out[out.length - 1]
    if (last && last.type === 'fold' && last.dayKey === day) last.comments.push(r)
    else out.push({ type: 'fold', key: `fold-${r.id}`, dayKey: day, comments: [r] })
  }
  return out
}

// ---- Buscar un comentario (venir de un aviso: ?nuevos=1&c=<id>) --------------------------------------------------------------------------------------

export function containsComment(root: CommentNode, id: string): boolean {
  return root.id === id || replyListOf(root).some((r) => r.id === id)
}

export function locateComment(roots: CommentNode[], id: string): { rootId: string; replyId: string | null } | null {
  for (const r of roots) {
    if (r.id === id) return { rootId: r.id, replyId: null }
    if (replyListOf(r).some((x) => x.id === id)) return { rootId: r.id, replyId: id }
  }
  return null
}

// ---- Respuestas visibles ------------------------------------------------------------------------------------------------------------------------------

// Hasta 3 respuestas se ven siempre. Con más, quedan tras «Ver respuestas (X)»; aun así se ven las NUEVAS y la que se busca (los nuevos van desplegados).
export function visibleReplies(replies: CommentNode[], opts: { expanded: boolean; forceIds?: Iterable<string> }): { shown: CommentNode[]; hiddenCount: number } {
  if (replies.length <= REPLIES_COLLAPSE_OVER || opts.expanded) return { shown: replies, hiddenCount: 0 }
  const force = new Set(opts.forceIds ?? [])
  const shown = replies.filter((r) => r.isNew === true || force.has(r.id))
  return { shown, hiddenCount: replies.length - shown.length }
}

// ---- Cambios locales (me gusta, editar, borrar, vistos) sin volver a pedir la lista ---------------------------------------------------------

export function patchComment(roots: CommentNode[], id: string, fn: (c: CommentNode) => CommentNode): CommentNode[] {
  return roots.map((r) => {
    if (r.id === id) return fn(r)
    const replies = replyListOf(r)
    if (!replies.some((x) => x.id === id)) return r
    return { ...r, replies: replies.map((x) => (x.id === id ? fn(x) : x)) }
  })
}

// Borrado propio: un comentario raíz CON respuestas queda como aviso neutro «Comentario eliminado»; sin respuestas desaparece. Una respuesta desaparece.
export function removeCommentLocal(roots: CommentNode[], id: string): CommentNode[] {
  const out: CommentNode[] = []
  for (const r of roots) {
    if (r.id === id) {
      if (replyListOf(r).length > 0) out.push({ id: r.id, status: 'removed', createdAt: r.createdAt, replies: r.replies, replyCount: r.replyCount } as CommentNode)
      continue
    }
    const replies = replyListOf(r)
    if (replies.some((x) => x.id === id)) {
      const left = replies.filter((x) => x.id !== id)
      // Un raíz ya eliminado que se queda sin respuestas deja de tener sentido.
      if (r.status === 'removed' && left.length === 0) continue
      out.push({ ...r, replies: left, replyCount: left.length })
      continue
    }
    out.push(r)
  }
  return out
}

// Marca como vistos (isNew=false) los ids dados y recalcula las respuestas nuevas de cada raíz.
export function applySeen(roots: CommentNode[], ids: Set<string>): CommentNode[] {
  return roots.map((r) => {
    const replies = replyListOf(r)
    const touchedReplies = replies.some((x) => ids.has(x.id) && x.isNew)
    const touchedRoot = ids.has(r.id) && r.isNew
    if (!touchedReplies && !touchedRoot) return r
    const nextReplies = touchedReplies ? replies.map((x) => (ids.has(x.id) && x.isNew ? { ...x, isNew: false } : x)) : replies
    return { ...r, isNew: touchedRoot ? false : r.isNew, replies: nextReplies, newReplyCount: nextReplies.filter((x) => x.isNew === true).length }
  })
}

// Une la página siguiente a lo ya cargado sin repetir (por id) y conserva el orden recibido.
export function mergeRoots(prev: CommentNode[], next: CommentNode[]): CommentNode[] {
  const seen = new Set(prev.map((c) => c.id))
  return [...prev, ...next.filter((c) => !seen.has(c.id))]
}

// ---- Exposición real en pantalla ----------------------------------------------------------------------------------------------------------------

// ¿Cuenta como «a la vista»? Al menos el 50 % del comentario; o, si es más alto que la pantalla, que ocupe al menos la mitad de la pantalla.
export function qualifiesAsExposed(ratio: number, visiblePx: number, viewportPx: number): boolean {
  if (ratio >= SEEN_MIN_RATIO) return true
  return viewportPx > 0 && visiblePx >= viewportPx * SEEN_MIN_RATIO
}

// Sigue qué comentarios llevan el tiempo suficiente a la vista. No usa temporizadores: quien lo usa le da la hora (así se prueba sin esperar). Si la pestaña
// se oculta, el cronómetro se detiene y, al volver, empieza de cero.
export class ExposureTracker {
  private candidates = new Map<string, number | null>()
  private reported = new Set<string>()
  private pageVisible = true

  constructor(private readonly minMs: number = SEEN_MIN_MS) {}

  enter(id: string, now: number): void {
    if (this.reported.has(id) || this.candidates.has(id)) return
    this.candidates.set(id, this.pageVisible ? now : null)
  }

  leave(id: string): void {
    this.candidates.delete(id)
  }

  setPageVisible(visible: boolean, now: number): void {
    this.pageVisible = visible
    for (const id of this.candidates.keys()) this.candidates.set(id, visible ? now : null)
  }

  // Los que ya cumplen el tiempo. Cada id se devuelve UNA sola vez.
  due(now: number): string[] {
    const out: string[] = []
    for (const [id, start] of this.candidates) if (start !== null && now - start >= this.minMs) out.push(id)
    for (const id of out) {
      this.candidates.delete(id)
      this.reported.add(id)
    }
    return out
  }

  // Milisegundos hasta el próximo que cumplirá (null si no hay ninguno contando).
  nextDueIn(now: number): number | null {
    let best: number | null = null
    for (const start of this.candidates.values()) {
      if (start === null) continue
      const left = Math.max(0, this.minMs - (now - start))
      if (best === null || left < best) best = left
    }
    return best
  }

  isReported(id: string): boolean {
    return this.reported.has(id)
  }
}

// Cola de marcas de «visto»: nunca manda dos veces el mismo id, los manda en lotes y, si una llamada falla, los devuelve para reintentar en la siguiente.
export class SeenQueue {
  private pending = new Set<string>()
  private inFlight = new Set<string>()
  private sent = new Set<string>()

  add(ids: Iterable<string>): number {
    let n = 0
    for (const id of ids) {
      if (this.sent.has(id) || this.inFlight.has(id) || this.pending.has(id)) continue
      this.pending.add(id)
      n += 1
    }
    return n
  }

  get size(): number {
    return this.pending.size
  }

  take(max: number = SEEN_BATCH_MAX): string[] {
    const batch: string[] = []
    for (const id of this.pending) {
      if (batch.length >= max) break
      batch.push(id)
    }
    for (const id of batch) {
      this.pending.delete(id)
      this.inFlight.add(id)
    }
    return batch
  }

  confirm(ids: string[]): void {
    for (const id of ids) {
      this.inFlight.delete(id)
      this.sent.add(id)
    }
  }

  fail(ids: string[]): void {
    for (const id of ids) {
      this.inFlight.delete(id)
      if (!this.sent.has(id)) this.pending.add(id)
    }
  }
}

// ---- Resumen de Pepa -----------------------------------------------------------------------------------------------------------------------------------

export interface SummaryPlan {
  // ¿Se enseña el resumen (y el botón «Ver toda la conversación»)? Solo con comentarios suficientes.
  useSummary: boolean
  // ¿La conversación empieza plegada?
  foldConversation: boolean
  // ¿Hay que pedir uno nuevo (una vez al abrir)?
  needsGenerate: boolean
}

export function planSummary(state: SummaryState | null): SummaryPlan {
  if (!state || !state.eligible) return { useSummary: false, foldConversation: false, needsGenerate: false }
  return { useSummary: true, foldConversation: true, needsGenerate: state.stale || !state.summary }
}
