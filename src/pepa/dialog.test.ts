import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleDialogReply, pendingDialogCount, registerDialog, resetDialogRegistry, type DialogController } from '@/pepa/dialog'

function controller(kind: DialogController['kind'], overrides: Partial<DialogController> = {}): DialogController {
  return {
    kind,
    stores: ['Mercadona', 'Aldi'],
    confirm: vi.fn().mockResolvedValue('Hecho.'),
    save: vi.fn().mockResolvedValue('Receta guardada. ¿Quieres añadir los ingredientes a la lista de la compra?'),
    cancel: vi.fn().mockReturnValue('Cancelado.'),
    setServings: vi.fn().mockReturnValue('Vale, para 6 raciones.'),
    edit: vi.fn().mockReturnValue('Editando.'),
    addIngredients: vi.fn().mockResolvedValue('¿En qué tienda quieres añadirlos?'),
    chooseStore: vi.fn().mockResolvedValue('Tienda elegida.'),
    ...overrides,
  }
}

beforeEach(() => {
  resetDialogRegistry()
})

afterEach(() => {
  vi.useRealTimers()
  resetDialogRegistry()
})

describe('sin nada pendiente', () => {
  it('un sí o un no sueltos no ejecutan nada y se dice claro', async () => {
    for (const text of ['Sí', 'no', 'guárdala', 'cancela']) {
      expect(await handleDialogReply(text)).toEqual({ handled: true, message: 'No tengo nada pendiente que confirmar.' })
    }
  })

  it('una frase normal sigue su camino', async () => {
    expect(await handleDialogReply('¿qué tengo mañana?')).toEqual({ handled: false, message: null })
  })
})

describe('tarjeta de acción (calendario, compra, menú...)', () => {
  it('sí / hazlo / confirmar la ejecutan', async () => {
    const c = controller('action-card')
    registerDialog(() => c)
    expect(await handleDialogReply('Sí')).toEqual({ handled: true, message: 'Hecho.' })
    expect(await handleDialogReply('Hazlo')).toMatchObject({ handled: true })
    expect(c.confirm).toHaveBeenCalledTimes(2)
  })

  it('no / cancela / déjalo la cancelan sin ejecutar', async () => {
    const c = controller('action-card')
    registerDialog(() => c)
    expect(await handleDialogReply('No lo guardes')).toEqual({ handled: true, message: 'Cancelado.' })
    expect(c.cancel).toHaveBeenCalled()
    expect(c.confirm).not.toHaveBeenCalled()
  })

  it('otra cosa no se toma por una respuesta', async () => {
    const c = controller('action-card')
    registerDialog(() => c)
    expect(await handleDialogReply('¿qué tengo mañana?')).toEqual({ handled: false, message: null })
    expect(await handleDialogReply('cambia a seis raciones')).toEqual({ handled: false, message: null })
    expect(c.confirm).not.toHaveBeenCalled()
  })
})

describe('receta propuesta', () => {
  it('oferta: sí prepara, no cancela, raciones las cambia', async () => {
    const c = controller('recipe-offer')
    registerDialog(() => c)
    expect(await handleDialogReply('Hazla para seis')).toEqual({ handled: true, message: 'Vale, para 6 raciones.' })
    expect(c.setServings).toHaveBeenCalledWith(6)
    await handleDialogReply('Sí, prepárala')
    expect(c.confirm).toHaveBeenCalledTimes(1)
  })

  it('oferta: "sí" empieza a prepararla', async () => {
    const c = controller('recipe-offer')
    registerDialog(() => c)
    await handleDialogReply('Sí')
    expect(c.confirm).toHaveBeenCalledTimes(1)
  })

  it('borrador: guárdala guarda, con oferta de ingredientes', async () => {
    const c = controller('recipe-draft')
    registerDialog(() => c)
    const r = await handleDialogReply('Guárdala')
    expect(r.message).toContain('ingredientes')
    expect(c.save).toHaveBeenCalledWith({ offerIngredients: true })
  })

  it('borrador: "no, solo guarda la receta" guarda sin ofrecer ingredientes', async () => {
    const c = controller('recipe-draft')
    registerDialog(() => c)
    await handleDialogReply('No, solo guarda la receta')
    expect(c.save).toHaveBeenCalledWith({ offerIngredients: false })
  })

  it('borrador: no la guardes cancela y no guarda nada', async () => {
    const c = controller('recipe-draft')
    registerDialog(() => c)
    await handleDialogReply('No la guardes')
    expect(c.cancel).toHaveBeenCalled()
    expect(c.save).not.toHaveBeenCalled()
  })

  it('borrador: hazla para seis cambia las raciones de ESA propuesta', async () => {
    const c = controller('recipe-draft')
    registerDialog(() => c)
    await handleDialogReply('Hazla para seis')
    expect(c.setServings).toHaveBeenCalledWith(6)
    expect(c.save).not.toHaveBeenCalled()
  })

  it('borrador: pedir los ingredientes antes de guardar no hace nada y lo explica', async () => {
    const c = controller('recipe-draft')
    registerDialog(() => c)
    const r = await handleDialogReply('Añade los ingredientes a la compra')
    expect(r.message).toContain('Primero guarda la receta')
    expect(c.save).not.toHaveBeenCalled()
    expect(c.addIngredients).not.toHaveBeenCalled()
  })

  it('mientras se genera no acepta nada', async () => {
    const c = controller('recipe-generating')
    registerDialog(() => c)
    expect((await handleDialogReply('Sí')).message).toContain('Un momento')
    expect(c.confirm).not.toHaveBeenCalled()
    expect(c.cancel).not.toHaveBeenCalled()
  })
})

describe('ingredientes y tienda', () => {
  it('guardada: sí pregunta la tienda; no cierra', async () => {
    const c = controller('recipe-saved')
    registerDialog(() => c)
    await handleDialogReply('Sí')
    expect(c.addIngredients).toHaveBeenCalledWith(undefined)
    await handleDialogReply('No, gracias')
    expect(c.cancel).toHaveBeenCalled()
  })

  it('guardada: "añade los ingredientes a Mercadona" lleva la tienda dicha', async () => {
    const c = controller('recipe-saved')
    registerDialog(() => c)
    await handleDialogReply('Añade los ingredientes a Mercadona')
    expect(c.addIngredients).toHaveBeenCalledWith('Mercadona')
  })

  it('pregunta de tienda: Mercadona / sin tienda', async () => {
    const c = controller('store-question')
    registerDialog(() => c)
    await handleDialogReply('Mercadona')
    expect(c.chooseStore).toHaveBeenLastCalledWith('Mercadona')
    await handleDialogReply('Sin tienda')
    expect(c.chooseStore).toHaveBeenLastCalledWith(null)
  })

  it('pregunta de tienda: una tienda que no existe no se inventa', async () => {
    const c = controller('store-question')
    registerDialog(() => c)
    const r = await handleDialogReply('Carrefour')
    expect(r.message).toContain('No tengo ninguna tienda llamada «Carrefour»')
    expect(r.message).toContain('Mercadona, Aldi')
    expect(c.chooseStore).not.toHaveBeenCalled()
  })

  it('pregunta de tienda: un "no" a secas pregunta y no ejecuta', async () => {
    const c = controller('store-question')
    registerDialog(() => c)
    const r = await handleDialogReply('No')
    expect(r.message).toContain('sin tienda')
    expect(c.chooseStore).not.toHaveBeenCalled()
    expect(c.cancel).not.toHaveBeenCalled()
  })

  it('pregunta de tienda: cancela cancela', async () => {
    const c = controller('store-question')
    registerDialog(() => c)
    await handleDialogReply('Cancela')
    expect(c.cancel).toHaveBeenCalled()
  })
})

describe('ambigüedad y vida del contexto', () => {
  it('con varias acciones pendientes NO ejecuta nada y pregunta', async () => {
    const a = controller('action-card')
    const b = controller('recipe-draft')
    registerDialog(() => a)
    registerDialog(() => b)
    expect(pendingDialogCount()).toBe(2)
    const r = await handleDialogReply('Sí')
    expect(r.handled).toBe(true)
    expect(r.message).toContain('varias cosas pendientes')
    expect(a.confirm).not.toHaveBeenCalled()
    expect(b.save).not.toHaveBeenCalled()
  })

  it('al darse de baja (guardar, cancelar u otra tarea) el contexto termina', async () => {
    const c = controller('action-card')
    const unregister = registerDialog(() => c)
    expect(pendingDialogCount()).toBe(1)
    unregister()
    expect(pendingDialogCount()).toBe(0)
    expect((await handleDialogReply('Sí')).message).toBe('No tengo nada pendiente que confirmar.')
    expect(c.confirm).not.toHaveBeenCalled()
  })

  it('a los 10 minutos sin respuesta la acción pendiente se cancela sola', async () => {
    vi.useFakeTimers()
    const c = controller('action-card')
    registerDialog(() => c)
    await vi.advanceTimersByTimeAsync(9 * 60 * 1000)
    expect(c.cancel).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000)
    expect(c.cancel).toHaveBeenCalledTimes(1)
  })

  it('cada respuesta renueva el plazo', async () => {
    vi.useFakeTimers()
    const c = controller('recipe-offer')
    registerDialog(() => c)
    await vi.advanceTimersByTimeAsync(9 * 60 * 1000)
    await handleDialogReply('Hazla para dos')
    await vi.advanceTimersByTimeAsync(9 * 60 * 1000)
    expect(c.cancel).not.toHaveBeenCalled()
  })
})

describe('oferta de ingredientes: "Sí, a Mercadona" en una sola frase', () => {
  it('lleva la tienda dicha, sin ejecutar nada por su cuenta', async () => {
    const saved = controller('recipe-saved')
    registerDialog(() => saved)
    await handleDialogReply('Sí, a la lista de la compra de Mercadona.')
    expect(saved.addIngredients).toHaveBeenCalledTimes(1)
    expect(saved.addIngredients).toHaveBeenCalledWith('Mercadona')
    expect(saved.confirm).not.toHaveBeenCalled()
  })

  it('"Sí, pero sin tienda" pasa null (sin tienda)', async () => {
    const saved = controller('recipe-saved')
    registerDialog(() => saved)
    await handleDialogReply('Sí, pero sin tienda.')
    expect(saved.addIngredients).toHaveBeenCalledWith(null)
  })

  it('una tienda que no existe se dice y no se ejecuta', async () => {
    const saved = controller('recipe-saved')
    registerDialog(() => saved)
    const r = await handleDialogReply('Sí, a Carrefour')
    expect(r.message).toContain('No tengo ninguna tienda llamada «carrefour»')
    expect(saved.addIngredients).not.toHaveBeenCalled()
  })

  it('cadena completa: oferta -> tarjeta final -> "Sí" guarda UNA vez -> otro "Sí" ya no hace nada', async () => {
    const confirm = vi.fn().mockResolvedValue('Añadido a la lista de la compra (Mercadona).')
    let unregisterSaved = () => {}
    let unregisterCard = () => {}
    const saved = controller('recipe-saved', {
      addIngredients: vi.fn(async () => {
        unregisterSaved()
        unregisterCard = registerDialog(() => controller('action-card', { confirm: async () => {
          unregisterCard()
          return confirm()
        } }))
        return 'Voy a añadir los ingredientes (Mercadona).'
      }),
    })
    unregisterSaved = registerDialog(() => saved)

    await handleDialogReply('Sí, a la lista de la compra de Mercadona.')
    expect(confirm).not.toHaveBeenCalled() // preparar la tarjeta no guarda
    expect(pendingDialogCount()).toBe(1)

    await handleDialogReply('Sí')
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(pendingDialogCount()).toBe(0)

    expect((await handleDialogReply('Sí')).message).toBe('No tengo nada pendiente que confirmar.')
    expect(confirm).toHaveBeenCalledTimes(1)
  })
})
