// Conversación de "Hablar con PEPA": el contexto es, ÚNICAMENTE, la acción que está
// pendiente en pantalla (una tarjeta de confirmación, la oferta de receta, la receta
// propuesta, la pregunta de tienda...). Nada más se recuerda, y nunca se manda a la IA.
//
//   - Cada tarjeta se REGISTRA mientras está abierta y se da de baja al cerrarse
//     (guardar, cancelar o empezar otra tarea): ahí termina su contexto.
//   - Una respuesta corta ("sí", "guárdala", "hazla para seis", "Mercadona") solo actúa
//     si hay EXACTAMENTE una acción pendiente. Con cero o con varias, no ejecuta nada.
//   - Todo se decide con reglas (domain/dialogReply.ts). Ejecutar una acción sigue
//     pasando por las funciones de siempre de cada tarjeta (validación + confirmación).
//   - Si nadie responde en 10 minutos, la acción pendiente se cancela sola.
import { interpretReply, isBareYesNo, type DialogKind, type ReplyIntent } from '@/domain/dialogReply'

export type { DialogKind }

export interface DialogController {
  kind: DialogKind
  // Tiendas REALES de la familia, para reconocer una tienda dicha en voz alta.
  stores?: string[]
  // Ejecutan lo mismo que el botón correspondiente y devuelven el mensaje a decir
  // (o null si en este momento no se puede).
  confirm?: () => Promise<string | null>
  save?: (options: { offerIngredients: boolean }) => Promise<string | null>
  cancel: () => string | null
  setServings?: (servings: number) => string | null
  edit?: () => string | null
  addIngredients?: (store: string | null | undefined) => Promise<string | null>
  chooseStore?: (store: string | null) => Promise<string | null>
}

export interface DialogReplyResult {
  // false = no era una respuesta a nada pendiente: sigue el camino normal.
  handled: boolean
  message: string | null
}

const NOT_HANDLED: DialogReplyResult = { handled: false, message: null }
const IDLE_TTL_MS = 10 * 60 * 1000

const registry = new Map<symbol, () => DialogController | null>()
let expiryTimer: ReturnType<typeof setTimeout> | null = null

function armExpiry(): void {
  if (expiryTimer) clearTimeout(expiryTimer)
  expiryTimer = registry.size > 0 ? setTimeout(expireAll, IDLE_TTL_MS) : null
}

function expireAll(): void {
  expiryTimer = null
  for (const get of [...registry.values()]) get()?.cancel()
}

// Una tarjeta se registra al abrirse; devuelve la función para darla de baja.
// `get` se evalúa en el momento de responder, así refleja siempre el paso actual.
export function registerDialog(get: () => DialogController | null): () => void {
  const id = Symbol('dialog')
  registry.set(id, get)
  armExpiry()
  return () => {
    registry.delete(id)
    armExpiry()
  }
}

export function pendingDialogCount(): number {
  return [...registry.values()].filter((get) => get() !== null).length
}

const NOTHING_PENDING = 'No tengo nada pendiente que confirmar.'
const SEVERAL_PENDING = 'Tengo varias cosas pendientes y no quiero equivocarme: ciérralas o elige con los botones y luego me lo dices.'
const BUSY = 'Un momento, sigo preparándolo.'

function storesText(stores: string[] | undefined): string {
  return stores && stores.length > 0 ? ` Tus tiendas: ${stores.join(', ')}. O di «sin tienda».` : ' Di «sin tienda» o usa los botones.'
}

async function apply(controller: DialogController, intent: ReplyIntent, spoken: string): Promise<DialogReplyResult> {
  const done = (message: string | null, fallback: string): DialogReplyResult => ({ handled: true, message: message ?? fallback })

  switch (controller.kind) {
    case 'action-card':
      if (intent.type === 'yes' || intent.type === 'save') return done(controller.confirm ? await controller.confirm() : null, 'No he podido completarlo: revisa la tarjeta.')
      if (intent.type === 'no') return done(controller.cancel(), 'Vale, lo dejo.')
      return NOT_HANDLED

    case 'recipe-offer':
      if (intent.type === 'yes') return done(controller.confirm ? await controller.confirm() : null, 'No he podido empezar.')
      if (intent.type === 'no') return done(controller.cancel(), 'Vale, no preparo ninguna receta.')
      if (intent.type === 'servings') return done(controller.setServings?.(intent.servings) ?? null, 'No puedo cambiar las raciones ahora.')
      return NOT_HANDLED

    case 'recipe-generating':
      if (intent.type === 'yes' || intent.type === 'no' || intent.type === 'save' || intent.type === 'servings') return { handled: true, message: BUSY }
      return NOT_HANDLED

    case 'recipe-draft':
    case 'recipe-edit':
      if (intent.type === 'yes' || intent.type === 'save') return done(controller.save ? await controller.save({ offerIngredients: true }) : null, 'No he podido guardarla: revísala en la tarjeta.')
      if (intent.type === 'only-save') return done(controller.save ? await controller.save({ offerIngredients: false }) : null, 'No he podido guardarla: revísala en la tarjeta.')
      if (intent.type === 'no') return done(controller.cancel(), 'Vale, no la guardo.')
      if (intent.type === 'servings') return done(controller.setServings?.(intent.servings) ?? null, 'Termina primero de editar la receta.')
      if (intent.type === 'edit') return done(controller.edit?.() ?? null, 'Ya la estás editando.')
      if (intent.type === 'add-ingredients') return { handled: true, message: 'Primero guarda la receta; después te ofrezco añadir los ingredientes.' }
      return NOT_HANDLED

    case 'recipe-saved':
      if (intent.type === 'yes' || intent.type === 'add-ingredients') {
        const store = intent.type === 'add-ingredients' ? intent.store : undefined
        return done(controller.addIngredients ? await controller.addIngredients(store) : null, 'No he podido preparar la lista de la compra.')
      }
      if (intent.type === 'no' || intent.type === 'only-save') return done(controller.cancel(), 'Vale, solo la receta.')
      if (intent.type === 'store-unknown') return { handled: true, message: `No tengo ninguna tienda llamada «${intent.said}».${storesText(controller.stores)}` }
      return NOT_HANDLED

    case 'store-question':
      if (intent.type === 'store') return done(controller.chooseStore ? await controller.chooseStore(intent.store) : null, 'No he podido elegir esa tienda.')
      if (intent.type === 'add-ingredients' && intent.store !== undefined) {
        return done(controller.chooseStore ? await controller.chooseStore(intent.store) : null, 'No he podido elegir esa tienda.')
      }
      if (intent.type === 'store-unknown') return { handled: true, message: `No tengo ninguna tienda llamada «${intent.said}».${storesText(controller.stores)}` }
      if (intent.type === 'store-ambiguous-no') return { handled: true, message: `¿Sin tienda o quieres cancelar? Di «sin tienda» o «cancela».` }
      if (intent.type === 'no') return done(controller.cancel(), 'Vale, no añado nada.')
      void spoken
      return NOT_HANDLED
  }
}

// Punto de entrada: ¿es esto una respuesta a lo que hay pendiente?
export async function handleDialogReply(text: string): Promise<DialogReplyResult> {
  const controllers = [...registry.values()].map((get) => get()).filter((c): c is DialogController => c !== null)

  if (controllers.length === 0) {
    // Un "sí" o un "no" suelto sin nada pendiente: se dice claro, sin mandarlo a ningún sitio.
    return isBareYesNo(text) ? { handled: true, message: NOTHING_PENDING } : NOT_HANDLED
  }
  if (controllers.length > 1) {
    return isBareYesNo(text) ? { handled: true, message: SEVERAL_PENDING } : NOT_HANDLED
  }

  const controller = controllers[0]
  const intent = interpretReply(text, { kind: controller.kind, stores: controller.stores })
  if (!intent) return NOT_HANDLED
  armExpiry()
  return apply(controller, intent, text)
}

// Solo para pruebas.
export function resetDialogRegistry(): void {
  registry.clear()
  if (expiryTimer) clearTimeout(expiryTimer)
  expiryTimer = null
}
