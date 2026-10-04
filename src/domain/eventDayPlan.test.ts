import { describe, expect, it } from 'vitest'
import {
  allPendingCoincidences,
  coincidenceHeadline,
  dragTargetIndex,
  draftFromItem,
  draftToPatch,
  EMPTY_DAY_PLAN_DRAFT,
  foodMomentKeyFromSource,
  foodMomentSourceKey,
  groupOfItem,
  isLinkedGenerated,
  isPatchEmpty,
  MISSING_TITLE_MESSAGE,
  moveId,
  moveToIndex,
  orderedDayPlan,
  pendingCoincidenceFor,
  splitDayPlan,
  timeGroups,
  timeKey,
  validateDayPlanDraft,
} from '@/domain/eventDayPlan'
import { makeDayPlanItem } from '@/domain/eventFoodFixtures'

const item = (id: string, itemTime: string | null, sortOrder: number, over: Parameters<typeof makeDayPlanItem>[0] = {}) => makeDayPlanItem({ id, title: id, itemTime, sortOrder, ...over })
const ids = (list: { id: string }[]) => list.map((i) => i.id)

describe('Hora: HH:MM y HH:MM:SS (33) y nunca 00:00 por «sin hora» (32)', () => {
  it('normaliza ambos formatos a HH:MM', () => {
    expect(timeKey('14:30:00')).toBe('14:30')
    expect(timeKey('14:30')).toBe('14:30')
  })
  it('vacío, nulo o solo espacios = sin hora (null), jamás 00:00', () => {
    expect(timeKey('')).toBeNull()
    expect(timeKey('   ')).toBeNull()
    expect(timeKey(null)).toBeNull()
    expect(timeKey(undefined)).toBeNull()
    expect(timeKey('00:00')).toBe('00:00') // medianoche REAL sigue siendo una hora válida si la ponen
  })
  it('un borrador sin hora guarda null en el patch', () => {
    const original = { title: 'Tarta', itemTime: '17:00:00', note: null, showOnShare: true }
    const patch = draftToPatch({ ...draftFromItem(original), time: '' }, original)
    expect(patch).toEqual({ itemTime: null })
    expect(patch.itemTime).not.toBe('00:00')
  })
})

describe('Orden: con hora cronológico automático, sin hora manual (7, 8, 34, 35, 36)', () => {
  it('7. con hora se ordena por hora, no por sort_order ni por orden de creación', () => {
    const list = [item('tarta', '17:00:00', 1000), item('llegada', '13:00:00', 4000), item('comida', '14:30:00', 2000), item('aperitivo', '13:30', 3000), item('fotos', '18:00:00', 5000)]
    expect(ids(splitDayPlan(list).timed)).toEqual(['llegada', 'aperitivo', 'comida', 'tarta', 'fotos'])
  })
  it('8. sin hora se ordena por sort_order (manual)', () => {
    const list = [item('tarta', null, 4000), item('ceremonia', null, 1000), item('comida', null, 3000), item('fotos', null, 2000)]
    expect(ids(splitDayPlan(list).untimed)).toEqual(['ceremonia', 'fotos', 'comida', 'tarta'])
  })
  it('las dos zonas no se mezclan: lo que tiene hora va primero, «Sin hora» después', () => {
    const list = [item('a', null, 1000), item('b', '09:00:00', 9000), item('c', null, 2000), item('d', '08:00', 8000)]
    expect(ids(orderedDayPlan(list))).toEqual(['d', 'b', 'a', 'c'])
  })
  it('35. cambiar una hora recoloca el elemento (14:30 → 15:00 pasa tras otro de las 14:45)', () => {
    const before = [item('comida', '14:30:00', 1), item('postre', '14:45:00', 2)]
    expect(ids(splitDayPlan(before).timed)).toEqual(['comida', 'postre'])
    const after = [item('comida', '15:00:00', 1), item('postre', '14:45:00', 2)]
    expect(ids(splitDayPlan(after).timed)).toEqual(['postre', 'comida'])
  })
  it('5/36. ponerle hora a uno sin hora lo saca de «Sin hora»; quitársela lo devuelve', () => {
    const noTime = [item('fotos', null, 1000), item('comida', null, 2000)]
    expect(ids(splitDayPlan(noTime).untimed)).toEqual(['fotos', 'comida'])
    const withTime = [item('fotos', null, 1000), item('comida', '14:30:00', 2000)]
    expect(ids(splitDayPlan(withTime).untimed)).toEqual(['fotos'])
    expect(ids(splitDayPlan(withTime).timed)).toEqual(['comida'])
    const removed = [item('fotos', null, 1000), item('comida', null, 2000)]
    expect(ids(splitDayPlan(removed).untimed)).toEqual(['fotos', 'comida'])
  })
  it('34. el orden es estable tras recargar (mismo resultado con la lista en cualquier orden de llegada)', () => {
    const list = [item('a', '10:00:00', 1000, { createdAt: '2026-01-01T00:00:00Z' }), item('b', '10:00:00', 1000, { createdAt: '2026-01-01T00:00:01Z' }), item('c', null, 5, { createdAt: '2026-01-01T00:00:00Z' }), item('d', null, 5, { createdAt: '2026-01-01T00:00:02Z' })]
    const first = ids(orderedDayPlan(list))
    expect(ids(orderedDayPlan([...list].reverse()))).toEqual(first)
    expect(ids(orderedDayPlan([list[2], list[0], list[3], list[1]]))).toEqual(first)
  })
  it('un sort_order guardado desde antes (miles de millones, como Date.now()) sigue ordenando bien', () => {
    const list = [item('nuevo', null, 1791138399563), item('viejo', null, 1790196955867), item('base', null, 1000)]
    expect(ids(splitDayPlan(list).untimed)).toEqual(['base', 'viejo', 'nuevo'])
  })
})

describe('Reordenar «Sin hora» (9): arrastrar y alternativa Subir/Bajar producen el mismo resultado', () => {
  const order = ['ceremonia', 'fotos', 'comida', 'tarta']
  it('Subir / Bajar', () => {
    expect(moveId(order, 'comida', -1)).toEqual(['ceremonia', 'comida', 'fotos', 'tarta'])
    expect(moveId(order, 'fotos', 1)).toEqual(['ceremonia', 'comida', 'fotos', 'tarta'])
  })
  it('no se sale por los extremos (y no devuelve una lista nueva si no hay cambio)', () => {
    expect(moveId(order, 'ceremonia', -1)).toBe(order)
    expect(moveId(order, 'tarta', 1)).toBe(order)
    expect(moveId(order, 'inexistente', 1)).toBe(order)
  })
  it('arrastrar: del puesto 0 al 2', () => {
    expect(moveToIndex(order, 0, 2)).toEqual(['fotos', 'comida', 'ceremonia', 'tarta'])
  })
  it('el gesto: el desplazamiento del dedo se traduce a posición, acotado a la lista', () => {
    expect(dragTargetIndex(1, 0, 50, 4)).toBe(1)
    expect(dragTargetIndex(1, 60, 50, 4)).toBe(2)
    expect(dragTargetIndex(1, 130, 50, 4)).toBe(3)
    expect(dragTargetIndex(1, 900, 50, 4)).toBe(3)
    expect(dragTargetIndex(1, -900, 50, 4)).toBe(0)
    expect(dragTargetIndex(2, -60, 50, 4)).toBe(1)
  })
})

describe('Coincidencias de hora (10–18)', () => {
  const aperitivo = (over = {}) => item('aperitivo', '14:30:00', 1000, over)
  const comida = (over = {}) => item('comida', '14:30:00', 2000, over)

  it('10. dos elementos a la misma hora forman un grupo pendiente de confirmar', () => {
    const list = [aperitivo(), comida(), item('tarta', '17:00:00', 3000)]
    const group = pendingCoincidenceFor(list, 'comida')
    expect(group?.time).toBe('14:30')
    expect(ids(group?.items ?? [])).toEqual(['aperitivo', 'comida'])
    expect(coincidenceHeadline(group!)).toBe('Hay dos momentos a las 14:30')
    expect(pendingCoincidenceFor(list, 'tarta')).toBeNull()
  })
  it('formatos distintos de la misma hora (14:30 y 14:30:00) cuentan como coincidencia', () => {
    expect(pendingCoincidenceFor([item('a', '14:30', 1), item('b', '14:30:00', 2)], 'a')).not.toBeNull()
  })
  it('11. confirmar la coincidencia (todos los miembros marcados para ESA hora) la deja resuelta: no se vuelve a preguntar', () => {
    const list = [aperitivo({ coincideOkTime: '14:30:00' }), comida({ coincideOkTime: '14:30:00' })]
    expect(groupOfItem(list, 'comida')?.confirmed).toBe(true)
    expect(pendingCoincidenceFor(list, 'comida')).toBeNull()
    expect(allPendingCoincidences(list)).toEqual([])
  })
  it('12. el orden elegido es el desempate: con la misma hora manda sort_order', () => {
    const list = [aperitivo({ sortOrder: 2000 }), comida({ sortOrder: 1000 })]
    expect(ids(splitDayPlan(list).timed)).toEqual(['comida', 'aperitivo'])
    expect(ids(groupOfItem(list, 'comida')!.items)).toEqual(['comida', 'aperitivo'])
  })
  it('13. cambiar la hora de uno: deja de haber grupo; si vuelve a coincidir con otra hora distinta, se pregunta de nuevo', () => {
    // comida pasa a las 15:00 (coincide_ok_time se borra al cambiar la hora)
    const moved = [aperitivo({ coincideOkTime: '14:30:00' }), comida({ itemTime: '15:00:00', coincideOkTime: null })]
    expect(groupOfItem(moved, 'comida')).toBeNull()
    expect(allPendingCoincidences(moved)).toEqual([])
    // vuelve a las 14:30: su marca se borró, así que el grupo NO está confirmado → se pregunta otra vez
    const back = [aperitivo({ coincideOkTime: '14:30:00' }), comida({ itemTime: '14:30:00', coincideOkTime: null })]
    expect(pendingCoincidenceFor(back, 'comida')).not.toBeNull()
  })
  it('una confirmación guardada para OTRA hora no vale (la hora implicada cambió)', () => {
    const list = [aperitivo({ coincideOkTime: '13:00:00' }), comida({ coincideOkTime: '13:00:00' })]
    expect(groupOfItem(list, 'comida')?.confirmed).toBe(false)
  })
  it('14. un tercer elemento que entra en un grupo ya confirmado reabre la pregunta (para el grupo completo)', () => {
    const list = [aperitivo({ coincideOkTime: '14:30:00' }), comida({ coincideOkTime: '14:30:00' }), item('fotos', '14:30:00', 3000)]
    const group = pendingCoincidenceFor(list, 'fotos')
    expect(group).not.toBeNull()
    expect(ids(group!.items)).toEqual(['aperitivo', 'comida', 'fotos'])
  })
  it('un elemento que SALE de un grupo de tres deja a los otros dos confirmados (no se pregunta de nuevo)', () => {
    const list = [aperitivo({ coincideOkTime: '14:30:00' }), comida({ coincideOkTime: '14:30:00' }), item('fotos', '15:00:00', 3000)]
    expect(groupOfItem(list, 'comida')?.confirmed).toBe(true)
  })
  it('15. tres o más elementos: UN grupo y un único aviso, nunca de dos en dos', () => {
    const list = [aperitivo(), comida(), item('fotos', '14:30:00', 3000), item('tarta', '17:00:00', 4000), item('baile', '17:00:00', 5000)]
    const pending = allPendingCoincidences(list)
    expect(pending.map((g) => [g.time, g.items.length])).toEqual([
      ['14:30', 3],
      ['17:00', 2],
    ])
    expect(coincidenceHeadline(pending[0])).toBe('Hay 3 momentos a las 14:30')
    expect(coincidenceHeadline({ time: '10:00', items: [list[0], list[1], list[2], list[3]] })).toBe('Hay 4 momentos a las 10:00')
  })
  it('16. reordenar los tres: el orden confirmado se refleja en la lista cronológica', () => {
    const list = [aperitivo({ sortOrder: 3000 }), comida({ sortOrder: 1000 }), item('fotos', '14:30:00', 2000)]
    expect(ids(splitDayPlan(list).timed)).toEqual(['comida', 'fotos', 'aperitivo'])
  })
  it('los elementos sin hora nunca forman coincidencia entre sí', () => {
    expect(timeGroups(splitDayPlan([item('a', null, 1), item('b', null, 2)]).timed)).toEqual([])
  })
})

describe('Edición de un momento (1–6, 3, 4)', () => {
  const original = { title: 'Comida', itemTime: null, note: null, showOnShare: true }
  it('1. un momento nuevo sin hora: título obligatorio, hora y nota opcionales; visible al compartir por defecto (19)', () => {
    expect(EMPTY_DAY_PLAN_DRAFT).toEqual({ title: '', time: '', note: '', showOnShare: true })
    expect(validateDayPlanDraft({ title: '   ' })).toBe(MISSING_TITLE_MESSAGE)
    expect(validateDayPlanDraft({ title: 'Baile' })).toBeNull()
  })
  it('3. editar el título cambia SOLO el título', () => {
    expect(draftToPatch({ ...draftFromItem(original), title: ' Almuerzo familiar ' }, original)).toEqual({ title: 'Almuerzo familiar' })
  })
  it('4. editar la nota cambia SOLO la nota (no toca hora ni título); una nota en blanco la borra', () => {
    expect(draftToPatch({ ...draftFromItem(original), note: ' David la trae al restaurante. ' }, original)).toEqual({ note: 'David la trae al restaurante.' })
    expect(draftToPatch({ ...draftFromItem({ ...original, note: 'algo' }), note: '  ' }, { ...original, note: 'algo' })).toEqual({ note: null })
  })
  it('5. añadir hora a uno sin hora', () => {
    expect(draftToPatch({ ...draftFromItem(original), time: '14:30' }, original)).toEqual({ itemTime: '14:30' })
  })
  it('sin cambios no hay nada que guardar; una hora igual en otro formato tampoco es un cambio (no invalida la confirmación)', () => {
    expect(isPatchEmpty(draftToPatch(draftFromItem(original), original))).toBe(true)
    const timed = { ...original, itemTime: '14:30:00' }
    expect(isPatchEmpty(draftToPatch(draftFromItem(timed), timed))).toBe(true)
    expect(draftToPatch({ ...draftFromItem(timed), note: 'x' }, timed).itemTime).toBeUndefined()
  })
  it('21. «Mostrar al compartir» se puede desactivar y volver a activar', () => {
    expect(draftToPatch({ ...draftFromItem(original), showOnShare: false }, original)).toEqual({ showOnShare: false })
    const hidden = { ...original, showOnShare: false }
    expect(draftToPatch({ ...draftFromItem(hidden), showOnShare: true }, hidden)).toEqual({ showOnShare: true })
  })
})

describe('Identidad estable de los elementos generados (27)', () => {
  it('la clave se compone y se descompone sin depender del título', () => {
    expect(foodMomentSourceKey('aperitivo')).toBe('comida.momentos:aperitivo')
    expect(foodMomentKeyFromSource('comida.momentos:comida')).toBe('comida')
    expect(foodMomentKeyFromSource(null)).toBeNull()
    expect(foodMomentKeyFromSource('otra.cosa:x')).toBeNull()
    expect(foodMomentKeyFromSource('comida.momentos:')).toBeNull()
  })
  it('está bajo control de su decisión solo si tiene decisión Y clave', () => {
    expect(isLinkedGenerated({ decisionId: 'd', sourceKey: 'comida.momentos:comida' })).toBe(true)
    expect(isLinkedGenerated({ decisionId: null, sourceKey: 'comida.momentos:comida' })).toBe(false)
    expect(isLinkedGenerated({ decisionId: null, sourceKey: null })).toBe(false)
  })
})
