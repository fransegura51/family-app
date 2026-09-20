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
  /^(?:guarda(?:lo|la|r)?|guardala|guardalo|guardar(?: esta| la)? receta|guarda(?: esta| la)? receta|anade(?:la|lo)? a mis recetas|guarda(?:la|lo)? en mis recetas|guardalos|guardalas)$/
const ONLY_SAVE = /^(?:no\s+)?solo (?:guarda(?:la|lo|r)?(?: la| esta)? ?(?:receta)?|la receta)$/
const NO =
  /^(?:no|nop|cancela(?:r|lo|la)?|dejalo|dejala|olvidalo|olvidala|anula(?:r|lo|la)?|no gracias|no lo hagas|no la hagas|no(?: lo| la| los| las)? (?:guardes|quiero|anadas|apuntes|agregues|pongas|metas|hagas|prepares)|mejor no|para (?:eso|ya))$/
// Palabras de control que, con una acción pendiente, significan "sí, hazlo": "añadir", "añádelos",
// "confirmar", "aceptar", "apuntar"... El contexto decide qué se confirma; nunca son datos.
const CONFIRM_VERB =
  /^(?:(?:anad(?:e|ir)|agreg(?:a|ar)|apunt(?:a|ar)|acept(?:a|ar)|guard(?:a|ar))(?:lo|la|los|las)?|acepto|continuar|continua|sigue|listo)$/
// "añadir a la lista", "añádelos a la compra": el destino no cambia nada.
const DESTINATION_SUFFIX = /\s+(?:a|en)\s+(?:la\s+|el\s+|mi\s+|mis\s+)?(?:lista(?: de la compra)?|compra|calendario|menu|recetas)$/

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

// Palabras de relleno que acompañan a una tienda en una respuesta hablada: "a la lista de la
// compra de Mercadona", "ponlo en Mercadona", "pero sin tienda"... Si tras quitar la tienda
// (o "sin tienda") solo quedan estas palabras, la frase es exactamente eso: una tienda.
const FILLER_WORDS = new Set(
  (
    'a en de del para por la el los las mi tu lista listado compra compras tienda ingredientes ' +
    'pon ponlo ponlos ponme anade anadelo anadelos mete metelo metelos meteles manda mandalo mandalos pasa pasalo pasalos ' +
    'apunta apuntalo apuntalos pero y que quiero lo todo todos vale ok si claro favor porfa gracias hazlo'
  ).split(' '),
)

const NO_STORE_PHRASE = /(?:^|\s)sin (?:ninguna )?tienda(?=\s|$)/

function leftoverWords(n: string): string[] {
  return n.split(' ').filter((w) => w && !FILLER_WORDS.has(w))
}

function withoutWord(n: string, phrase: string): string {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return n.replace(new RegExp('(?:^|\\s)' + escaped + '(?=\\s|$)'), ' ').replace(/\s+/g, ' ').trim()
}

// ¿La frase dice solo una tienda (con relleno)? Devuelve la tienda real, null = "sin tienda".
// `leftover`: lo que sobra si no dice ninguna tienda reconocible.
function storeOnlyReply(core: string, stores: string[] | undefined): { store: string | null; said: boolean; leftover: string[] } | null {
  if (NO_STORE_PHRASE.test(core)) {
    const rest = leftoverWords(core.replace(NO_STORE_PHRASE, ' '))
    return rest.length === 0 ? { store: null, said: true, leftover: [] } : null
  }
  const store = stores ? storeIn(core, stores) : null
  if (!store) return { store: null, said: false, leftover: leftoverWords(core) }
  return leftoverWords(withoutWord(core, normalize(store).trim())).length === 0 ? { store, said: true, leftover: [] } : null
}

// Frase compuesta SOLO por palabras de control ("añadir", "guardar", "confirmar", "sí", "vale"...)
// y relleno ("los", "a la lista"). Con datos de verdad ("añadir leche") deja de serlo.
const CONTROL_WORDS = new Set(
  (
    'si no vale ok okey claro perfecto listo adelante dale hazlo hazla confirmar confirma confirmalo confirmo aceptar acepta acepto continuar continua sigue ' +
    'anadir anade anadelo anadela anadelos anadelas anadirlo anadirla anadirlos anadirlas agregar agrega agregalo agregala agregalos agregalas ' +
    'apuntar apunta apuntalo apuntala apuntalos apuntalas guardar guarda guardalo guardala guardalos guardalas ' +
    'cancelar cancela cancelalo cancelala dejalo dejala olvidalo olvidala anular anula nop gracias'
  ).split(' '),
)
const CONTROL_FILLER = new Set('lo la los las todo todos todas a en al el mi mis lista compra calendario menu receta recetas tarjeta por favor porfa gracias de'.split(' '))

export function isControlOnly(text: string): boolean {
  const tokens = clean(text).split(' ').filter(Boolean)
  if (tokens.length === 0 || tokens.length > 8) return false
  return tokens.some((t) => CONTROL_WORDS.has(t)) && tokens.every((t) => CONTROL_WORDS.has(t) || CONTROL_FILLER.has(t))
}

export function isBareYesNo(text: string): boolean {
  const n = clean(text).replace(POLITE, '')
  const core = n.replace(LEAD, '').trim()
  return n === 'si' || CONFIRM.test(n) || NO.test(n) || SAVE.test(core) || (LEAD.test(n) && core === '') || isControlOnly(text)
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
  if (CONFIRM_VERB.test(core.replace(DESTINATION_SUFFIX, ''))) return { type: 'yes' }
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

  // "Sí, a la lista de la compra de Mercadona" / "Sí, pero sin tienda": confirmación y tienda
  // en la misma frase, contestando a la oferta de ingredientes o a la pregunta de tienda.
  if (ctx.kind === 'recipe-saved' || ctx.kind === 'store-question') {
    const only = storeOnlyReply(core, ctx.stores)
    if (only?.said) {
      return ctx.kind === 'store-question' ? { type: 'store', store: only.store } : { type: 'add-ingredients', store: only.store }
    }
    if (ctx.kind === 'recipe-saved' && leadMatch && only) {
      // "Sí, a la lista de la compra": quiere los ingredientes, sin tienda dicha (se preguntará).
      if (only.leftover.length === 0) return { type: 'yes' }
      // "Sí, a Carrefour": una tienda que la familia no tiene; no se inventa.
      if (only.leftover.length <= 2 && /^(?:a|en)\s/.test(core)) return { type: 'store-unknown', said: only.leftover.join(' ') }
    }
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
