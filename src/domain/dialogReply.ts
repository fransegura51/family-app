// Respuestas cortas a lo que Pepa tiene pendiente ("sí", "guárdala", "hazla para
// seis", "Mercadona"...), interpretadas SOLO con reglas: nunca se pregunta a la IA
// qué significa un "sí" cuando ya hay una acción pendiente que lo explica.
//
// Esto solo dice QUÉ ha querido decir la persona; quien lo aplica (pepa/dialog.ts)
// comprueba antes que exista una acción pendiente inequívoca.
import { NUMBER_PATTERN, servingsFrom } from '@/domain/kitchenQuery'
import { normalize } from '@/domain/voiceQuery'

export type DialogKind = 'action-card' | 'recipe-offer' | 'recipe-generating' | 'recipe-draft' | 'recipe-edit' | 'recipe-saved' | 'store-question'

export type ReplyIntent =
  | { type: 'yes' }
  | { type: 'no' }
  | { type: 'save' }
  | { type: 'only-save' }
  | { type: 'edit' }
  | { type: 'servings'; servings: number }
  // "añade los ingredientes a la compra" (con o sin tienda dentro: undefined = no dicha, null = "sin tienda")
  | { type: 'add-ingredients'; store: string | null | undefined }
  | { type: 'store'; store: string | null }
  | { type: 'store-unknown'; said: string }
  // "no" dicho ante la pregunta de tienda: puede ser "sin tienda" o "cancela" — se pregunta.
  | { type: 'store-ambiguous-no' }

export interface ReplyContext {
  kind: DialogKind
  // Tiendas REALES de la familia (para reconocer "Mercadona" y "añade los ingredientes a Aldi").
  stores?: string[]
}

function clean(text: string): string {
  return normalize(text)
    .replace(/[¿?¡!.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const LEAD = /^(?:si|vale|ok|okey|claro|venga|bueno)(?:\s+|$)/
const POLITE = /(?:\s+por favor|\s+porfa|\s+gracias)$/

const CONFIRM = /^(?:hazlo|hazla|preparala|preparalo|prepara|adelante|confirma(?:lo|la|r)?|confirmo|dale|de acuerdo|perfecto|por supuesto|si|vale|ok|okey|claro)$/
const SAVE =
  /^(?:guarda(?:lo|la|r)?|guardala|guardalo|guardar(?: esta| la)? receta|guarda(?: esta| la)? receta|anade(?:la|lo)? a mis recetas|guarda(?:la|lo)? en mis recetas|anadela|anadelo)$/
const ONLY_SAVE = /^(?:no\s+)?solo (?:guarda(?:la|lo|r)?(?: la| esta)? ?(?:receta)?|la receta)$/
const NO =
  /^(?:no|nop|cancela(?:r|lo|la)?|dejalo|dejala|olvidalo|olvidala|anula(?:r|lo|la)?|no gracias|no lo hagas|no la hagas|no(?: lo| la)? (?:guardes|quiero|anadas|hagas|prepares)|no lo guardes|no la guardes|mejor no|para (?:eso|ya))$/
const EDIT = /^(?:edita(?:la|lo|r)?|editar|corrige(?:la|lo)?|quiero editar(?:la)?|modifica(?:la|lo)?)$/
const NO_STORE = /^(?:sin tienda|sin ninguna tienda|ninguna(?: tienda)?|ninguno|da igual|no importa|en ninguna|en ninguna tienda|sin especificar)$/
const ADD_INGREDIENTS = /^(?:(?:anade|agrega|mete|pon|pasa|manda)(?:me)?\s+(?:los\s+)?ingredientes\b.*|anadelos\b.*|ponlos\b.*|meteles\b.*)$/

const SERVINGS_PATTERNS: RegExp[] = [
  new RegExp(
    '^(?:hazla|hazlo|ponla|ponlo|dejala|dejalo|cambiala|cambialo|prepara(?:la|lo)|cambia(?:r)?(?:\\s+(?:la|las|el|lo|receta|raciones|cantidades))*)\\s+(?:para|a)\\s+' +
      NUMBER_PATTERN +
      '(?:\\s+(?:raciones|personas|comensales))?$',
  ),
  new RegExp('^(?:somos|seremos|seamos|para)\\s+' + NUMBER_PATTERN + '(?:\\s+(?:raciones|personas|comensales))?$'),
  new RegExp('^' + NUMBER_PATTERN + '\\s+(?:raciones|personas|comensales)$'),
]

function storeIn(n: string, stores: string[]): string | null {
  const wordBounded = (needle: string) => new RegExp('(?:^|\\s)' + needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\s|$)').test(n)
  const sorted = [...stores].sort((a, b) => b.length - a.length)
  for (const store of sorted) {
    const norm = normalize(store).trim()
    if (norm && wordBounded(norm)) return store
  }
  return null
}

export function isBareYesNo(text: string): boolean {
  const n = clean(text).replace(POLITE, '')
  const core = n.replace(LEAD, '').trim()
  return n === 'si' || CONFIRM.test(n) || NO.test(n) || SAVE.test(core) || (LEAD.test(n) && core === '')
}

export function interpretReply(text: string, ctx: ReplyContext): ReplyIntent | null {
  const n = clean(text).replace(POLITE, '')
  if (!n) return null

  // Ante la pregunta de tienda, un "no" a secas es ambiguo.
  if (ctx.kind === 'store-question' && n === 'no') return { type: 'store-ambiguous-no' }

  if (ONLY_SAVE.test(n)) return { type: 'only-save' }
  if (NO.test(n)) return { type: 'no' }

  const leadMatch = LEAD.exec(n)
  const core = leadMatch ? n.slice(leadMatch[0].length).trim() : n
  if (leadMatch && core === '') return { type: 'yes' }
  if (CONFIRM.test(core)) return { type: 'yes' }
  if (SAVE.test(core)) return { type: 'save' }
  if (EDIT.test(core)) return { type: 'edit' }

  for (const re of SERVINGS_PATTERNS) {
    const m = re.exec(core)
    if (m) {
      const servings = servingsFrom(m[m.length - 1] ?? '')
      if (servings !== null) return { type: 'servings', servings }
    }
  }

  if (ADD_INGREDIENTS.test(core)) {
    const store = ctx.stores ? storeIn(core, ctx.stores) : null
    return { type: 'add-ingredients', store: store ?? (/\bsin tienda\b/.test(core) ? null : undefined) }
  }

  if (ctx.kind === 'store-question') {
    if (NO_STORE.test(core)) return { type: 'store', store: null }
    const store = ctx.stores ? storeIn(core, ctx.stores) : null
    if (store) return { type: 'store', store }
    // Una respuesta corta que no es ninguna tienda real: no se inventa.
    if (core.split(' ').length <= 4) return { type: 'store-unknown', said: text.trim() }
  }
  return null
}
