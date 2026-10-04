import { describe, expect, it } from 'vitest'
import {
  buildFoodContext,
  contratacionApplies,
  dependentFoodKeys,
  desiredDayPlanMoments,
  desiredForBebidas,
  desiredForContratacion,
  desiredForFoodKey,
  desiredForMenuEstado,
  desiredForMenuInfantil,
  desiredForNecesidades,
  desiredForTarta,
  foodNeedsAlertInput,
  FOOD_BEBIDAS_KEY,
  FOOD_CONTRATACION_KEY,
  FOOD_MENU_ESTADO_KEY,
  FOOD_MENU_GUARDAR_KEY,
  FOOD_MENU_INFANTIL_KEY,
  FOOD_MOMENTOS_KEY,
  FOOD_NECESIDADES_KEY,
  FOOD_QUIEN_KEY,
  FOOD_TARTA_KEY,
  foodWillExist,
  guestsChooseMenu,
  includedByVenueLines,
  isAdoptableLegacyBudget,
  isAdoptableLegacyTask,
  isDayPlanItemUntouched,
  listFoodBlockQuestions,
  MOMENTOS_COMIDA_CATALOG,
  ninosNeedMenuInfantil,
  reconcileDayPlan,
  summarizeFoodBlock,
  tartaContradiction,
  type FoodContext,
} from '@/domain/eventFood'
import { computeFoodNeedsState } from '@/domain/eventDietaryNeeds'
import { generateAutoTasks } from '@/domain/events'
import { reconcilePairGeneration } from '@/domain/eventPairDecisions'
import { VENUE_SERVICES_QUESTION_KEY } from '@/domain/eventVenueServices'
import { makeBudget, makeDayPlanItem, makeDecision, makeEvent, makeGuest, makeMenuItem, makeNeed, makeTask } from '@/domain/eventFoodFixtures'
import type { EventDecision } from '@/domain/types'

function ctxOf(decisions: EventDecision[], menuItems = [] as ReturnType<typeof makeMenuItem>[], needs: FoodContext['needs'] = null): FoodContext {
  return buildFoodContext(makeEvent(), decisions, menuItems, needs)
}
const casa = makeDecision('lugar.contexto', { choice: 'en_casa' })
const contratado = makeDecision('lugar.contexto', { choice: 'restaurante_local' })
const venueIncl = (...selected: string[]) => makeDecision(VENUE_SERVICES_QUESTION_KEY, { choice: 'seleccionar', selected, customItems: [] })
const quien = (choice: string, extra: Record<string, unknown> = {}) => makeDecision(FOOD_QUIEN_KEY, { choice, ...extra })

describe('Comida H. Catering / restaurante externo → estado de contratación', () => {
  it('catering: aparece «¿Lo tenéis ya contratado?»', () => {
    const ctx = ctxOf([casa, quien('catering')])
    expect(contratacionApplies(ctx)).toBe(true)
    expect(listFoodBlockQuestions(ctx).map((q) => q.questionKey)).toContain(FOOD_CONTRATACION_KEY)
  })
  it('restaurante / empresa externa: también', () => {
    expect(contratacionApplies(ctxOf([casa, quien('restaurante')]))).toBe(true)
  })
  it('combinar: solo pregunta contratación si entre las vías hay una externa', () => {
    expect(contratacionApplies(ctxOf([casa, quien('combinar', { combinar: ['nosotros'] })]))).toBe(false)
    expect(contratacionApplies(ctxOf([casa, quien('combinar', { combinar: ['nosotros', 'catering'] })]))).toBe(true)
  })
  it('marcar las vías de «combinar» no crea ningún trabajo por sí solo', () => {
    const ctx = ctxOf([casa, quien('combinar', { combinar: ['catering', 'restaurante', 'nosotros'] })])
    expect(desiredForContratacion(ctx)).toMatchObject({ taskTitle: null, budgetCategory: null, resolved: false })
  })
  it('«Sí, ya está contratado» NO inventa proveedor ni coste: solo cierra lo pendiente', () => {
    const ctx = ctxOf([casa, quien('catering'), makeDecision(FOOD_CONTRATACION_KEY, { choice: 'si' })])
    expect(desiredForContratacion(ctx)).toEqual({ taskTitle: null, budgetCategory: null, providerCategory: null, resolved: true })
  })
})

describe('Comida I. «Lo estamos buscando» → tarea + presupuesto sin importe + categoría de proveedor', () => {
  it('catering: «Buscar catering», concepto «Catering» y ningún proveedor inventado', () => {
    const ctx = ctxOf([casa, quien('catering'), makeDecision(FOOD_CONTRATACION_KEY, { choice: 'buscando' })])
    const d = desiredForContratacion(ctx)
    expect(d.taskTitle).toBe('Buscar catering')
    expect(d.budgetCategory).toBe('Catering')
    expect(d.providerCategory).toBe('Catering')
  })
  it('restaurante: «Buscar restaurante/servicio de comida»', () => {
    const d = desiredForContratacion(ctxOf([casa, quien('restaurante'), makeDecision(FOOD_CONTRATACION_KEY, { choice: 'buscando' })]))
    expect(d.taskTitle).toBe('Buscar restaurante/servicio de comida')
  })
  it('el concepto de presupuesto se crea SIEMPRE con importe null (nunca 0) y sin comparador', () => {
    const d = desiredForContratacion(ctxOf([casa, quien('catering'), makeDecision(FOOD_CONTRATACION_KEY, { choice: 'buscando' })]))
    const result = reconcilePairGeneration(d, undefined, undefined)
    expect(result.actions).toEqual([
      { op: 'create_task', title: 'Buscar catering' },
      { op: 'create_budget', category: 'Catering' },
    ])
    // create_budget no lleva importe: el ejecutor lo escribe con planned_amount = null
    expect(JSON.stringify(result.actions)).not.toContain('amount')
  })
  it('«Todavía no lo sabemos» y «Otro» no generan nada', () => {
    for (const choice of ['todavia_no_lo_sabemos', 'otro']) {
      const d = desiredForContratacion(ctxOf([casa, quien('catering'), makeDecision(FOOD_CONTRATACION_KEY, { choice })]))
      expect(d).toEqual({ taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false })
    }
  })
  it('si deja de aplicar (p. ej. el lugar pasa a incluir la comida) se cancela lo pristino', () => {
    const decisions = [contratado, venueIncl('comida'), quien('catering'), makeDecision(FOOD_CONTRATACION_KEY, { choice: 'buscando' })]
    const d = desiredForContratacion(ctxOf(decisions))
    expect(d.taskTitle).toBeNull()
    const task = makeTask({ title: 'Buscar catering', decisionId: 'x' })
    expect(reconcilePairGeneration(d, task, undefined).actions).toEqual([{ op: 'delete_task', id: 't1' }])
  })
})

describe('Comida J. «La preparamos nosotros»', () => {
  it('no hay contratación ni trabajo; aparece el menú propio', () => {
    const ctx = ctxOf([casa, quien('nosotros')])
    expect(contratacionApplies(ctx)).toBe(false)
    expect(desiredForContratacion(ctx).taskTitle).toBeNull()
    expect(foodWillExist(ctx)).toBe(true)
  })
})

describe('Comida K. «No habrá comida» — reconciliación segura', () => {
  it('no se piden momentos, menú ni bebidas, y se cancelan solo los derivados pristinos', () => {
    const decisions = [casa, quien('no_habra'), makeDecision(FOOD_MENU_ESTADO_KEY, { choice: 'por_decidir' }), makeDecision(FOOD_BEBIDAS_KEY, { choice: 'aparte' })]
    const ctx = ctxOf(decisions)
    expect(foodWillExist(ctx)).toBe(false)
    const keys = listFoodBlockQuestions(ctx).map((q) => q.questionKey)
    expect(keys).not.toContain(FOOD_MOMENTOS_KEY)
    expect(keys).not.toContain(FOOD_MENU_ESTADO_KEY)
    expect(keys).not.toContain(FOOD_BEBIDAS_KEY)
    expect(desiredForMenuEstado(ctx).taskTitle).toBeNull()
    expect(desiredForBebidas(ctx).taskTitle).toBeNull()
  })
  it('una tarea que la familia ya enriqueció se desvincula, no se borra', () => {
    const ctx = ctxOf([casa, quien('no_habra'), makeDecision(FOOD_MENU_ESTADO_KEY, { choice: 'por_decidir' })])
    const touched = makeTask({ title: 'Decidir el menú', decisionId: 'x', dueDate: '2026-12-01' })
    expect(reconcilePairGeneration(desiredForMenuEstado(ctx), touched, undefined).actions).toEqual([{ op: 'detach_task', id: 't1' }])
  })
})

describe('Comida L. «Todavía no lo sabemos» — sin trabajo prematuro', () => {
  it('quién se encarga = todavía no lo sabemos: no hay contratación ni tareas', () => {
    const ctx = ctxOf([casa, quien('todavia_no_lo_sabemos')])
    expect(contratacionApplies(ctx)).toBe(false)
    for (const key of [FOOD_CONTRATACION_KEY, FOOD_MENU_ESTADO_KEY, FOOD_TARTA_KEY, FOOD_BEBIDAS_KEY]) {
      const d = desiredForFoodKey(key, ctx)
      expect(d.taskTitle).toBeNull()
      expect(d.budgetCategory).toBeNull()
    }
  })
  it('cuenta como «por decidir», no como «sin empezar»', () => {
    const ctx = ctxOf([casa, quien('todavia_no_lo_sabemos')])
    expect(listFoodBlockQuestions(ctx).find((q) => q.questionKey === FOOD_QUIEN_KEY)?.status).toBe('por_decidir')
  })
})

describe('Momentos de comida M–O — Plan del día sin hora, por identidad estable (source_key)', () => {
  const momentos = (selected: string[], choice = 'seleccionar', customItems: string[] = []) => makeDecision(FOOD_MOMENTOS_KEY, { choice, selected, customItems })
  const key = (k: string) => `comida.momentos:${k}`
  const linkedItem = (k: string, over: Parameters<typeof makeDayPlanItem>[0] = {}) =>
    makeDayPlanItem({ id: `p-${k}`, title: MOMENTOS_COMIDA_CATALOG.cumpleanos.find((m) => m.key === k)?.label ?? k, decisionId: 'dm', sourceKey: key(k), ...over })
  const wanted = (...keys: string[]) => MOMENTOS_COMIDA_CATALOG.cumpleanos.filter((m) => keys.includes(m.key))

  it('M. solo se añaden los momentos explícitamente marcados, con el nombre del catálogo del tipo', () => {
    const ctx = ctxOf([casa, quien('nosotros'), momentos(['aperitivo', 'comida'])])
    expect(desiredDayPlanMoments('cumpleanos', ctx).map((m) => m.label)).toEqual(['Aperitivo / picoteo', 'Comida'])
    expect(desiredDayPlanMoments('boda', ctx).map((m) => m.label)).toEqual(['Aperitivo / cóctel', 'Comida / banquete'])
    expect(desiredDayPlanMoments('comunion', ctx).map((m) => m.label)).toEqual(['Aperitivo', 'Comida'])
    expect(desiredDayPlanMoments('cumpleanos', ctx).map((m) => m.key)).toEqual(['aperitivo', 'comida'])
  })
  it('N. quitar un momento retira solo lo prístino; lo que tiene hora, nota, otro nombre u oculto se conserva (se desvincula CON su clave)', () => {
    const pristine = linkedItem('aperitivo')
    const withTime = linkedItem('comida', { itemTime: '14:00:00' })
    const withNote = linkedItem('cena', { note: 'en la terraza' })
    const hidden = linkedItem('merienda', { showOnShare: false })
    const actions = reconcileDayPlan('cumpleanos', [], [pristine, withTime, withNote, hidden], 'dm')
    expect(actions).toEqual([
      { op: 'delete', id: 'p-aperitivo' },
      { op: 'detach', id: 'p-comida', sourceKey: key('comida') },
      { op: 'detach', id: 'p-cena', sourceKey: key('cena') },
      { op: 'detach', id: 'p-merienda', sourceKey: key('merienda') },
    ])
  })
  it('27. renombrar un elemento generado NO rompe su relación: con el momento aún marcado no hace nada (ni crea otro «Comida»)', () => {
    const renamed = linkedItem('comida', { title: 'Almuerzo familiar' })
    expect(reconcileDayPlan('cumpleanos', wanted('comida'), [renamed], 'dm')).toEqual([])
  })
  it('un elemento renombrado, con hora o con nota deja de ser prístino', () => {
    expect(isDayPlanItemUntouched({ itemTime: null, note: null, title: 'Comida', showOnShare: true, coincideOkTime: null }, 'cumpleanos', 'comida')).toBe(true)
    expect(isDayPlanItemUntouched({ itemTime: null, note: null, title: 'Almuerzo familiar', showOnShare: true, coincideOkTime: null }, 'cumpleanos', 'comida')).toBe(false)
    expect(isDayPlanItemUntouched({ itemTime: '14:30:00', note: null, title: 'Comida', showOnShare: true, coincideOkTime: null }, 'cumpleanos', 'comida')).toBe(false)
    expect(isDayPlanItemUntouched({ itemTime: null, note: ' ', title: 'Comida', showOnShare: true, coincideOkTime: null }, 'cumpleanos', 'comida')).toBe(true)
    expect(isDayPlanItemUntouched({ itemTime: null, note: null, title: 'Comida', showOnShare: true, coincideOkTime: null }, 'cumpleanos', null)).toBe(false)
  })
  it('O. no se inventa ningún momento: lo no marcado, «Otro» y «Todavía no lo sabemos» no llegan al Plan del día', () => {
    expect(desiredDayPlanMoments('cumpleanos', ctxOf([casa, quien('nosotros'), momentos(['comida'], 'seleccionar', ['Chocolatada'])])).map((m) => m.label)).toEqual(['Comida'])
    expect(desiredDayPlanMoments('cumpleanos', ctxOf([casa, quien('nosotros'), momentos([], 'todavia_no_lo_sabemos')]))).toEqual([])
    expect(desiredDayPlanMoments('cumpleanos', ctxOf([casa, quien('no_habra'), momentos(['comida'])]))).toEqual([])
  })
  it('crea solo lo que falta (con su clave) y NO se confunde por el título: uno puesto a mano con el mismo nombre es independiente', () => {
    const manual = makeDayPlanItem({ id: 'man', title: 'comida', decisionId: null, sourceKey: null })
    expect(reconcileDayPlan('cumpleanos', wanted('comida', 'merienda'), [manual], 'dm')).toEqual([
      { op: 'create', key: 'comida', title: 'Comida' },
      { op: 'create', key: 'merienda', title: 'Merienda' },
    ])
    expect(reconcileDayPlan('cumpleanos', wanted('merienda'), [linkedItem('merienda')], 'dm')).toEqual([])
  })
  it('30. dos momentos MANUALES con el mismo nombre conviven (la unicidad es solo de la identidad automática)', () => {
    const a = makeDayPlanItem({ id: 'f1', title: 'Fotos', itemTime: '10:00:00' })
    const b = makeDayPlanItem({ id: 'f2', title: 'Fotos', itemTime: '18:00:00' })
    expect(reconcileDayPlan('cumpleanos', [], [a, b], 'dm')).toEqual([])
  })
  it('28/29. renombrar + hora + nota, desmarcar (se conserva desvinculado con su clave) y volver a marcar READOPTA la misma fila: sin duplicado', () => {
    const enriched = linkedItem('comida', { title: 'Almuerzo familiar', itemTime: '14:30:00', note: 'En la terraza' })
    const afterUnmark = reconcileDayPlan('cumpleanos', [], [enriched], 'dm')
    expect(afterUnmark).toEqual([{ op: 'detach', id: 'p-comida', sourceKey: key('comida') }])
    // estado resultante tras ejecutar el detach: sin decisión, con clave
    const detached = { ...enriched, decisionId: null }
    expect(reconcileDayPlan('cumpleanos', wanted('comida'), [detached], 'dm')).toEqual([{ op: 'adopt', id: 'p-comida' }])
    // y una vez readoptada ya no hace nada más
    expect(reconcileDayPlan('cumpleanos', wanted('comida'), [enriched], 'dm')).toEqual([])
  })
  it('un elemento que "Mantener como independiente" dejó sin clave NO se readopta: un nuevo marcado crea otro, deliberadamente', () => {
    const independent = makeDayPlanItem({ id: 'ind', title: 'Almuerzo familiar', decisionId: null, sourceKey: null })
    expect(reconcileDayPlan('cumpleanos', wanted('comida'), [independent], 'dm')).toEqual([{ op: 'create', key: 'comida', title: 'Comida' }])
  })
  it('limpieza de un duplicado antiguo: se conserva uno; el sobrante prístino se retira y el enriquecido se desvincula', () => {
    const first = linkedItem('comida', { id: 'c1', sortOrder: 1000 })
    const dupPristine = linkedItem('comida', { id: 'c2', sortOrder: 2000, sourceKey: null })
    const dupWithNote = linkedItem('comida', { id: 'c3', sortOrder: 3000, sourceKey: null, note: 'x' })
    expect(reconcileDayPlan('cumpleanos', wanted('comida'), [first, dupPristine, dupWithNote], 'dm')).toEqual([
      { op: 'delete', id: 'c2' },
      { op: 'detach', id: 'c3', sourceKey: key('comida') },
    ])
  })
  it('un elemento generado antiguo SIN clave (migración no pudo etiquetarlo) se reconoce por el título del catálogo, una sola vez', () => {
    const legacy = linkedItem('comida', { sourceKey: null })
    expect(reconcileDayPlan('cumpleanos', wanted('comida'), [legacy], 'dm')).toEqual([])
  })
  it('catálogo por tipo según la especificación', () => {
    expect(MOMENTOS_COMIDA_CATALOG.boda.map((m) => m.key)).toEqual(['aperitivo', 'comida', 'cena', 'recena'])
    expect(MOMENTOS_COMIDA_CATALOG.cumpleanos.map((m) => m.key)).toEqual(['aperitivo', 'comida', 'merienda', 'cena'])
    expect(MOMENTOS_COMIDA_CATALOG.comunion.map((m) => m.key)).toEqual(['aperitivo', 'comida', 'merienda'])
    // Tarta no es un momento de comida
    for (const defs of Object.values(MOMENTOS_COMIDA_CATALOG)) expect(defs.map((d) => d.label.toLowerCase()).join(' ')).not.toContain('tarta')
  })
  it('una selección vacía no cuenta como decidida', () => {
    const ctx = ctxOf([casa, quien('nosotros'), momentos([])])
    expect(listFoodBlockQuestions(ctx).find((q) => q.questionKey === FOOD_MOMENTOS_KEY)?.status).toBe('sin_empezar')
  })
})

describe('Menú P–V — estado del menú', () => {
  it('P. «Tenemos que decidirlo» genera UNA sola tarea «Decidir el menú»', () => {
    const ctx = ctxOf([casa, quien('nosotros'), makeDecision(FOOD_MENU_ESTADO_KEY, { choice: 'por_decidir' })])
    const d = desiredForMenuEstado(ctx)
    expect(d.taskTitle).toBe('Decidir el menú')
    expect(d.budgetCategory).toBeNull()
    // repetir la respuesta no duplica
    const existing = makeTask({ title: 'Decidir el menú', decisionId: 'd' })
    expect(reconcilePairGeneration(d, existing, undefined).actions).toEqual([])
  })
  it('Q. cambiar a «Sí, ya está decidido» completa la tarea automática (resuelto ≠ cancelado)', () => {
    const ctx = ctxOf([casa, quien('nosotros'), makeDecision(FOOD_MENU_ESTADO_KEY, { choice: 'decidido' })])
    const existing = makeTask({ title: 'Decidir el menú', decisionId: 'd' })
    expect(reconcilePairGeneration(desiredForMenuEstado(ctx), existing, undefined).actions).toEqual([{ op: 'complete_task', id: 't1' }])
  })
  it('«Todavía no lo sabemos» no genera nada', () => {
    expect(desiredForMenuEstado(ctxOf([casa, quien('nosotros'), makeDecision(FOOD_MENU_ESTADO_KEY, { choice: 'todavia_no_lo_sabemos' })]))).toMatchObject({ taskTitle: null, resolved: false })
  })
  it('«¿Quieres guardar el menú?» solo aparece con el menú decidido y mientras no haya platos', () => {
    const decidido = makeDecision(FOOD_MENU_ESTADO_KEY, { choice: 'decidido' })
    expect(listFoodBlockQuestions(ctxOf([casa, quien('nosotros'), decidido])).map((q) => q.questionKey)).toContain(FOOD_MENU_GUARDAR_KEY)
    expect(listFoodBlockQuestions(ctxOf([casa, quien('nosotros'), decidido], [makeMenuItem()])).map((q) => q.questionKey)).not.toContain(FOOD_MENU_GUARDAR_KEY)
    expect(listFoodBlockQuestions(ctxOf([casa, quien('nosotros'), makeDecision(FOOD_MENU_ESTADO_KEY, { choice: 'por_decidir' })])).map((q) => q.questionKey)).not.toContain(FOOD_MENU_GUARDAR_KEY)
  })
})

describe('Menú infantil AC–AE', () => {
  const ninos = makeDecision('invitados.ninos.necesidades', { choice: 'preparar', selected: ['Menú infantil'], customItems: [] })
  it('AC. si Invitados ya marcó menú infantil no se vuelve a preguntar si hace falta: solo cómo se resuelve', () => {
    expect(ninosNeedMenuInfantil([ninos])).toBe(true)
    expect(listFoodBlockQuestions(ctxOf([casa, ninos])).map((q) => q.questionKey)).toContain(FOOD_MENU_INFANTIL_KEY)
  })
  it('sin la marca en Invitados no aparece nada', () => {
    expect(ninosNeedMenuInfantil([])).toBe(false)
    expect(listFoodBlockQuestions(ctxOf([casa])).map((q) => q.questionKey)).not.toContain(FOOD_MENU_INFANTIL_KEY)
  })
  it('AD. pedir / preparar generan UNA tarea; incluido / ya resuelto completa la pendiente', () => {
    const pedir = ctxOf([casa, ninos, makeDecision(FOOD_MENU_INFANTIL_KEY, { choice: 'pedir' })])
    expect(desiredForMenuInfantil(pedir).taskTitle).toBe('Pedir el menú infantil')
    const nosotros = ctxOf([casa, ninos, makeDecision(FOOD_MENU_INFANTIL_KEY, { choice: 'nosotros' })])
    expect(desiredForMenuInfantil(nosotros).taskTitle).toBe('Preparar el menú infantil')
    const incluido = ctxOf([casa, ninos, makeDecision(FOOD_MENU_INFANTIL_KEY, { choice: 'incluido' })])
    expect(desiredForMenuInfantil(incluido).resolved).toBe(true)
  })
  it('AE. al estar incluido se ofrece guardar el menú infantil con el mismo importador', () => {
    const ctx = ctxOf([casa, ninos, makeDecision(FOOD_MENU_INFANTIL_KEY, { choice: 'incluido' })])
    expect(listFoodBlockQuestions(ctx).map((q) => q.questionKey)).toContain('comida.menu_infantil_guardar')
  })
  it('si Invitados deja de marcar el menú infantil, la tarea derivada se cancela', () => {
    const ctx = ctxOf([casa, makeDecision(FOOD_MENU_INFANTIL_KEY, { choice: 'pedir' })])
    expect(desiredForMenuInfantil(ctx).taskTitle).toBeNull()
  })
})

describe('Tarta AF–AI', () => {
  const tarta = (choice: string, extra: Record<string, unknown> = {}) => makeDecision(FOOD_TARTA_KEY, { choice, ...extra })
  it('AF. si el lugar incluye la tarta no se pregunta cómo conseguirla y se muestra «✓ Tarta incluida…»', () => {
    const ctx = ctxOf([contratado, venueIncl('tarta')])
    expect(listFoodBlockQuestions(ctx).map((q) => q.questionKey)).not.toContain(FOOD_TARTA_KEY)
    expect(includedByVenueLines(ctx)).toContain('✓ Tarta incluida en el lugar contratado')
  })
  it('AG. «La encargaremos» → «Encargar la tarta» + presupuesto «Tarta» sin importe + categoría Pastelería', () => {
    const d = desiredForTarta(ctxOf([casa, tarta('encargar')]))
    expect(d).toEqual({ taskTitle: 'Encargar la tarta', budgetCategory: 'Tarta', providerCategory: 'Pastelería', resolved: false })
  })
  it('«La prepararemos nosotros» → «Preparar la tarta», sin proveedor ni presupuesto', () => {
    expect(desiredForTarta(ctxOf([casa, tarta('nosotros')]))).toEqual({ taskTitle: 'Preparar la tarta', budgetCategory: null, providerCategory: null, resolved: false })
  })
  it('«Ya la tenemos resuelta» completa lo pendiente y nunca toca el presupuesto', () => {
    const d = desiredForTarta(ctxOf([casa, tarta('resuelta')]))
    const result = reconcilePairGeneration(d, makeTask({ title: 'Encargar la tarta', decisionId: 'x' }), makeBudget({ decisionId: 'x' }))
    expect(result.actions).toEqual([{ op: 'complete_task', id: 't1' }])
    expect(result.pendingBudgetItem).toEqual({ id: 'b1', category: 'Tarta' })
  })
  it('«No» y «Todavía no lo sabemos» no generan nada', () => {
    expect(desiredForTarta(ctxOf([casa, tarta('no')])).taskTitle).toBeNull()
    expect(desiredForTarta(ctxOf([casa, tarta('todavia_no_lo_sabemos')])).taskTitle).toBeNull()
  })
  it('AH. «No habrá tarta» + Momentos especiales con tarta → aviso claro y no bloqueante, sin cambiar ninguna decisión', () => {
    const moments = makeDecision('momentos_especiales.seleccion', { choice: 'seleccionar', selected: ['corte_tarta'], customItems: [] })
    expect(tartaContradiction([tarta('no'), moments])).toBe(
      'Habéis indicado que no habrá tarta, pero tenéis seleccionado ‘Corte de la tarta’ en Momentos especiales. Revisa una de las dos decisiones.',
    )
    const velas = makeDecision('momentos_especiales.seleccion', { choice: 'seleccionar', selected: ['velas_tarta'], customItems: [] })
    expect(tartaContradiction([tarta('no'), velas])).toContain('Velas / tarta')
  })
  it('AI. sin contradicción real no hay aviso', () => {
    const moments = makeDecision('momentos_especiales.seleccion', { choice: 'seleccionar', selected: ['sorpresa'], customItems: [] })
    expect(tartaContradiction([tarta('no'), moments])).toBeNull()
    expect(tartaContradiction([tarta('encargar'), makeDecision('momentos_especiales.seleccion', { choice: 'seleccionar', selected: ['corte_tarta'], customItems: [] })])).toBeNull()
    expect(tartaContradiction([tarta('no')])).toBeNull()
  })
})

describe('Bebidas AJ–AL', () => {
  const bebidas = (choice: string) => makeDecision(FOOD_BEBIDAS_KEY, { choice })
  it('AJ. si el lugar incluye bebidas se muestra «✓ Bebidas incluidas…» y no se pregunta', () => {
    const ctx = ctxOf([contratado, venueIncl('bebidas')])
    expect(includedByVenueLines(ctx)).toContain('✓ Bebidas incluidas en el lugar contratado')
    expect(listFoodBlockQuestions(ctx).map((q) => q.questionKey)).not.toContain(FOOD_BEBIDAS_KEY)
  })
  it('AK. si no están incluidas y habrá comida se pregunta ligeramente; sin comida no se pregunta', () => {
    expect(listFoodBlockQuestions(ctxOf([casa, quien('nosotros')])).map((q) => q.questionKey)).toContain(FOOD_BEBIDAS_KEY)
    expect(listFoodBlockQuestions(ctxOf([casa, quien('no_habra')])).map((q) => q.questionKey)).not.toContain(FOOD_BEBIDAS_KEY)
    expect(listFoodBlockQuestions(ctxOf([casa])).map((q) => q.questionKey)).not.toContain(FOOD_BEBIDAS_KEY)
  })
  it('AL. «Las encargaremos aparte» → tarea + concepto sin importe + categoría; «compramos nosotros» → solo tarea; «incluye el servicio» → nada nuevo', () => {
    const base = [casa, quien('nosotros')]
    expect(desiredForBebidas(ctxOf([...base, bebidas('aparte')]))).toEqual({ taskTitle: 'Encargar las bebidas', budgetCategory: 'Bebidas', providerCategory: 'Bebidas', resolved: false })
    expect(desiredForBebidas(ctxOf([...base, bebidas('nosotros')]))).toMatchObject({ taskTitle: 'Comprar las bebidas', budgetCategory: null })
    expect(desiredForBebidas(ctxOf([...base, bebidas('servicio_comida')]))).toMatchObject({ taskTitle: null, resolved: true })
    expect(desiredForBebidas(ctxOf([...base, bebidas('todavia_no_lo_sabemos')]))).toMatchObject({ taskTitle: null, resolved: false })
  })
})

describe('Automatismos antiguos AW–AZ — adopción y protección', () => {
  const event = { type: 'cumpleanos' as const, eventDate: '2026-12-20' }
  // La fecha que la plantilla dio a cada tarea (misma función que usa createEvent).
  const templateDue = (type: 'cumpleanos' | 'boda', title: string) => generateAutoTasks(type, '2026-12-20').find((t) => t.title === title)?.dueDate ?? null
  it('AW. «Confirmar la tarta» pristina (con la fecha de la plantilla) se adopta, no se duplica', () => {
    const legacy = makeTask({ title: 'Confirmar la tarta', dueDate: templateDue('cumpleanos', 'Confirmar la tarta') })
    expect(isAdoptableLegacyTask(legacy, FOOD_TARTA_KEY, event)).toBe(true)
    const noDate = makeTask({ title: 'Confirmar la tarta', dueDate: null })
    expect(isAdoptableLegacyTask(noDate, FOOD_TARTA_KEY, event)).toBe(true)
  })
  it('AX. una tarea tocada por la familia (hecha, fecha propia, responsable, calendario, manual, ya vinculada) se protege', () => {
    const base = { title: 'Confirmar la tarta', dueDate: templateDue('cumpleanos', 'Confirmar la tarta') }
    expect(isAdoptableLegacyTask(makeTask({ ...base, done: true }), FOOD_TARTA_KEY, event)).toBe(false)
    expect(isAdoptableLegacyTask(makeTask({ ...base, dueDate: '2026-12-01' }), FOOD_TARTA_KEY, event)).toBe(false)
    expect(isAdoptableLegacyTask(makeTask({ ...base, assignedMemberId: 'm' }), FOOD_TARTA_KEY, event)).toBe(false)
    expect(isAdoptableLegacyTask(makeTask({ ...base, calendarEventId: 'c' }), FOOD_TARTA_KEY, event)).toBe(false)
    expect(isAdoptableLegacyTask(makeTask({ ...base, source: 'manual' }), FOOD_TARTA_KEY, event)).toBe(false)
    expect(isAdoptableLegacyTask(makeTask({ ...base, decisionId: 'otra' }), FOOD_TARTA_KEY, event)).toBe(false)
  })
  it('solo se adopta lo que significa lo mismo que la decisión', () => {
    const tarta = makeTask({ title: 'Confirmar la tarta', dueDate: templateDue('cumpleanos', 'Confirmar la tarta') })
    expect(isAdoptableLegacyTask(tarta, FOOD_MENU_ESTADO_KEY, event)).toBe(false)
    const decorar = makeTask({ title: 'Decidir la decoración', dueDate: templateDue('cumpleanos', 'Decidir la decoración') })
    expect(isAdoptableLegacyTask(decorar, FOOD_TARTA_KEY, event)).toBe(false)
    const boda = { type: 'boda' as const, eventDate: '2026-12-20' }
    expect(isAdoptableLegacyTask(makeTask({ title: 'Confirmar menú y bebidas', dueDate: templateDue('boda', 'Confirmar menú y bebidas') }), FOOD_MENU_ESTADO_KEY, boda)).toBe(true)
  })
  it('presupuesto antiguo: solo el pristino (sin importe) se adopta; con importe se protege (p. ej. «Tarta 40 €»)', () => {
    expect(isAdoptableLegacyBudget(makeBudget({ category: 'Tarta', plannedAmount: null }), FOOD_TARTA_KEY)).toBe(true)
    expect(isAdoptableLegacyBudget(makeBudget({ category: 'Tarta', plannedAmount: 40 }), FOOD_TARTA_KEY)).toBe(false)
    expect(isAdoptableLegacyBudget(makeBudget({ category: 'Comida y bebida', plannedAmount: 120 }), FOOD_CONTRATACION_KEY)).toBe(false)
    expect(isAdoptableLegacyBudget(makeBudget({ category: 'Comida y bebida', plannedAmount: null }), FOOD_CONTRATACION_KEY)).toBe(true)
    expect(isAdoptableLegacyBudget(makeBudget({ category: 'Tarta', plannedAmount: null, decisionId: 'ya' }), FOOD_TARTA_KEY)).toBe(false)
  })
  it('AY. un importe desconocido sigue siendo null: reconciliar nunca escribe 0', () => {
    const d = desiredForTarta(ctxOf([casa, makeDecision(FOOD_TARTA_KEY, { choice: 'encargar' })]))
    const adoptedBudget = makeBudget({ decisionId: 'd', plannedAmount: null })
    const result = reconcilePairGeneration(d, makeTask({ title: 'Encargar la tarta', decisionId: 'd' }), adoptedBudget)
    expect(result.actions).toEqual([])
  })
  it('AZ. no se duplica: con tarea y concepto ya vinculados, repetir la respuesta no crea nada', () => {
    const d = desiredForTarta(ctxOf([casa, makeDecision(FOOD_TARTA_KEY, { choice: 'encargar' })]))
    const once = reconcilePairGeneration(d, undefined, undefined).actions
    expect(once).toHaveLength(2)
    const twice = reconcilePairGeneration(d, makeTask({ title: 'Encargar la tarta', decisionId: 'd' }), makeBudget({ decisionId: 'd' })).actions
    expect(twice).toEqual([])
  })
  it('dependencias: cambiar quién cocina o qué incluye el lugar reconcilia lo de debajo, nada más', () => {
    expect(dependentFoodKeys(FOOD_QUIEN_KEY)).toEqual([FOOD_CONTRATACION_KEY, FOOD_MENU_ESTADO_KEY, FOOD_BEBIDAS_KEY])
    expect(dependentFoodKeys(VENUE_SERVICES_QUESTION_KEY)).toContain(FOOD_TARTA_KEY)
    expect(dependentFoodKeys(FOOD_MOMENTOS_KEY)).toEqual([])
    expect(dependentFoodKeys(FOOD_TARTA_KEY)).toEqual([FOOD_TARTA_KEY])
  })
})

describe('Contadores del bloque (✓ decididas · ⏳ por decidir · sin empezar)', () => {
  it('lo oculto o no aplicable no cuenta; lo heredado de Invitados tampoco es una pregunta nueva', () => {
    const empty = ctxOf([casa])
    const keys = listFoodBlockQuestions(empty).map((q) => q.questionKey)
    // En casa, sin responder nada: solo «¿Quién se encargará?» y «¿Habrá tarta?»
    expect(keys).toEqual([FOOD_QUIEN_KEY, FOOD_TARTA_KEY])
    expect(summarizeFoodBlock(empty)).toBe('2 sin empezar')
  })
  it('mezcla de estados', () => {
    const ctx = ctxOf([casa, quien('nosotros'), makeDecision(FOOD_TARTA_KEY, { choice: 'todavia_no_lo_sabemos' })])
    expect(summarizeFoodBlock(ctx)).toBe('✓ 1 decidida · ⏳ 1 por decidir · 3 sin empezar')
  })
  it('un estado futuro (RSVP/necesidades) NO bloquea cerrar las decisiones actuales', () => {
    const ctx = ctxOf([casa, quien('no_habra'), makeDecision(FOOD_TARTA_KEY, { choice: 'no' })], [], computeFoodNeedsState([makeGuest({ rsvpStatus: 'pendiente' })], [], []))
    expect(summarizeFoodBlock(ctx)).toBe('✓ 2 decididas')
  })
  it('la pregunta de revisión de necesidades solo cuenta con TODOS confirmados y necesidades reales', () => {
    const guests = [makeGuest({ rsvpStatus: 'confirmado' })]
    const needs = [makeNeed()]
    const confirmed = computeFoodNeedsState(guests, [], needs)
    expect(listFoodBlockQuestions(ctxOf([casa], [], confirmed)).map((q) => q.questionKey)).toContain(FOOD_NECESIDADES_KEY)
    const pending = computeFoodNeedsState([makeGuest({ rsvpStatus: 'pendiente' })], [], needs)
    expect(listFoodBlockQuestions(ctxOf([casa], [], pending)).map((q) => q.questionKey)).not.toContain(FOOD_NECESIDADES_KEY)
    const none = computeFoodNeedsState(guests, [], [])
    expect(listFoodBlockQuestions(ctxOf([casa], [], none)).map((q) => q.questionKey)).not.toContain(FOOD_NECESIDADES_KEY)
  })
})

describe('Revisión de necesidades alimentarias — AU/AV', () => {
  const confirmed = computeFoodNeedsState([makeGuest({ rsvpStatus: 'confirmado' })], [], [makeNeed()])
  it('«Tenemos que revisarlo» genera UNA tarea; «Sí, están contempladas» la completa', () => {
    const revisar = ctxOf([casa, makeDecision(FOOD_NECESIDADES_KEY, { choice: 'revisar' })], [], confirmed)
    expect(desiredForNecesidades(revisar).taskTitle).toBe('Revisar el menú teniendo en cuenta las necesidades alimentarias')
    const si = ctxOf([casa, makeDecision(FOOD_NECESIDADES_KEY, { choice: 'si' })], [], confirmed)
    expect(desiredForNecesidades(si).resolved).toBe(true)
    const todavia = ctxOf([casa, makeDecision(FOOD_NECESIDADES_KEY, { choice: 'todavia_no_lo_sabemos' })], [], confirmed)
    expect(desiredForNecesidades(todavia).taskTitle).toBeNull()
  })
  it('si ya no procede (cambian las necesidades o la asistencia) la tarea pristina se cancela', () => {
    const noNeeds = computeFoodNeedsState([makeGuest({ rsvpStatus: 'confirmado' })], [], [])
    expect(desiredForNecesidades(ctxOf([casa, makeDecision(FOOD_NECESIDADES_KEY, { choice: 'revisar' })], [], noNeeds)).taskTitle).toBeNull()
  })
  it('el aviso persistente se da por atendido al contestar «Sí» o «Tenemos que revisarlo», no con «Todavía no»', () => {
    expect(foodNeedsAlertInput(confirmed, [makeDecision(FOOD_NECESIDADES_KEY, { choice: 'si' })]).reviewed).toBe(true)
    expect(foodNeedsAlertInput(confirmed, [makeDecision(FOOD_NECESIDADES_KEY, { choice: 'revisar' })]).reviewed).toBe(true)
    expect(foodNeedsAlertInput(confirmed, [makeDecision(FOOD_NECESIDADES_KEY, { choice: 'todavia_no_lo_sabemos' })]).reviewed).toBe(false)
    expect(foodNeedsAlertInput(confirmed, [])).toEqual({ allConfirmed: true, hasNeeds: true, reviewed: false })
  })
})

describe('Elección de menú de los invitados — W. compatibilidad con filas antiguas', () => {
  it('{"choice":"si"} sin wantsMenu (Boda de plata) cuenta como que quieren elegir menú', () => {
    expect(guestsChooseMenu([makeDecision('invitados.menu_invitacion', { choice: 'si' })])).toBe(true)
  })
  it('wantsMenu:false (Cumpleaños Alvaro) y la ausencia de fila no', () => {
    expect(guestsChooseMenu([makeDecision('invitados.menu_invitacion', { choice: 'si', wantsMenu: false })])).toBe(false)
    expect(guestsChooseMenu([])).toBe(false)
    expect(guestsChooseMenu([makeDecision('invitados.menu_invitacion', { choice: 'no' })])).toBe(false)
  })
})
