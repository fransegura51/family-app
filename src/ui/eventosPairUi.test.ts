import { describe, expect, it } from 'vitest'

// "👰🤵 La pareja" (Fase 3) — capa de UI sobre el motor puro ya cubierto a fondo en
// src/domain/eventPairDecisions.test.ts. Aquí solo se comprueba el cableado: gating a boda, reutilización
// del acordeón de Fase 2, el merge explícito de event.details, que nunca se cree un proveedor ficticio, y
// las correcciones reales de la prueba manual en iPhone: el refresco cruzado Preparativos/Presupuesto, que
// ninguna pregunta se autorresponda al renderizar, y que marcar Ramo/Prendido ≠ responder su resolución.
const SRC = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('EventPlanningConfigurator — "La pareja" es el segundo bloque, reutiliza el acordeón de Fase 2', () => {
  const fn = slice(SRC, 'function EventPlanningConfigurator(', '\nfunction ')

  it('solo se muestra para boda (a diferencia de Ceremonia y celebración, que también vale para comunión/bautizo)', () => {
    expect(fn).toContain("event.type === 'boda'")
  })

  it('usa loadConfiguratorOpen/saveConfiguratorOpen con su propio blockKey "pareja", mismo mecanismo que "ceremonia_celebracion"', () => {
    expect(fn).toContain("loadConfiguratorOpen(event.id, 'pareja')")
    expect(fn).toContain("saveConfiguratorOpen(event.id, 'pareja', next)")
  })

  it('monta PairBlock pasando onChanged y onDerivedDataChanged, no un componente nuevo de acordeón', () => {
    expect(fn).toContain('<PairBlock event={event} onChanged={onChanged} onDerivedDataChanged={onDerivedDataChanged} />')
  })
})

describe('Fallo 1 (prueba real iPhone) — Preparativos/Presupuesto se refrescan tras terminar la generación', () => {
  it('EventPlanningConfigurator recibe onDerivedDataChanged como prop propia, no reutiliza el onChanged genérico para esto', () => {
    const signature = slice(SRC, 'function EventPlanningConfigurator({', '\n}) {')
    expect(signature).toContain('onDerivedDataChanged: () => void')
  })

  it('EventDetail conecta onDerivedDataChanged a reloadTasks() + reloadDashboardStats() — las dos, no solo una', () => {
    const call = slice(SRC, '<EventPlanningConfigurator', '/>')
    expect(call).toContain('onDerivedDataChanged={() => {')
    expect(call).toContain('reloadTasks()')
    expect(call).toContain('reloadDashboardStats()')
  })

  it('cada función de guardado de PairBlock llama a onDerivedDataChanged() DESPUÉS de reload(), nunca antes ni en el catch', () => {
    const pairBlock = slice(SRC, 'function PairBlock({', '\n\n// ---------------------------------------------------------------------\n// Fase 2 — Momentos genéricos')
    for (const fnName of ['saveQuestion', 'saveVestuarioTipo', 'saveVestuarioResolucion', 'saveNecesidad', 'saveResolucion', 'saveDetalleTipo', 'saveDetalleResolucion']) {
      const fn = slice(pairBlock, `async function ${fnName}(`, '\n  }')
      const tryBlock = fn.slice(fn.indexOf('try {'), fn.indexOf('} catch'))
      const reloadIdx = tryBlock.lastIndexOf('await reload()')
      const derivedIdx = tryBlock.indexOf('onDerivedDataChanged()')
      expect(reloadIdx, `${fnName} debe llamar a reload()`).toBeGreaterThan(-1)
      expect(derivedIdx, `${fnName} debe llamar a onDerivedDataChanged() dentro del try, tras reload()`).toBeGreaterThan(reloadIdx)
    }
  })

  // Limitación documentada a propósito: esta prueba comprueba que el cableado existe en el código fuente,
  // NO que la pantalla de Preparativos se actualice de verdad en la misma sesión sin recargar — eso solo
  // se puede comprobar de forma fiable con una prueba manual real en el iPhone (ver instrucciones).
  it('limitación: esto no sustituye la comprobación visual real en el móvil, solo el cableado', () => {
    expect(true).toBe(true)
  })
})

describe('ManageEventModal — nombres/rol de la pareja', () => {
  const fn = slice(SRC, 'function ManageEventModal(', '\nfunction TaskCard(')

  it('el formulario de nombres solo se muestra para boda', () => {
    const block = slice(fn, "{event.type === 'boda' && (", '👰🤵 La pareja')
    expect(block).toContain("event.type === 'boda'")
  })

  it('guarda con merge explícito de event.details — nunca sobrescribe el objeto entero', () => {
    const handler = slice(fn, 'async function handleSavePair(', '\n  }')
    expect(handler).toContain('...event.details')
    expect(handler).toContain('partner1Name: partner1Name.trim() || null')
    expect(handler).toContain('partner2Name: partner2Name.trim() || null')
  })
})

describe('"Estamos buscando" nunca crea un proveedor ficticio', () => {
  const pairBlock = slice(SRC, "// \"👰🤵 La pareja\" — primer uso real de event_decisions", '\n// ---------------------------------------------------------------------\n// Fase 2 — Momentos genéricos')

  it('ninguna llamada a addEventProvider en todo el bloque de La pareja', () => {
    expect(pairBlock).not.toContain('addEventProvider(')
  })

  it('ProviderLinker solo relaciona proveedores ya existentes (listEventProviders + linkDecisionProvider), nunca crea uno', () => {
    const linker = slice(pairBlock, 'function ProviderLinker(', '\nfunction CustomAwareQuestion')
    expect(linker).toContain('listEventProviders(event.id)')
    expect(linker).toContain('linkDecisionProvider(')
    expect(linker).not.toContain('addEventProvider')
  })
})

describe('CustomResolutionFields — motor explícito de "otro", nunca interpreta el texto libre', () => {
  const fn = slice(SRC, 'function CustomResolutionFields(', '\nfunction ProviderLinker(')

  it('el campo de texto (label) nunca decide por sí solo qué se genera — solo action/hasCost', () => {
    expect(fn).toContain('onSelect={(v) => onChange({ ...value, action: v })}')
    expect(fn).toContain('onSelect={(v) => onChange({ ...value, hasCost: v })}')
  })

  it('¿Tendrá coste? solo se pregunta cuando la acción puede implicar buscar/contratar o es "otro" — nunca para "preparar"/"resuelto"', () => {
    expect(fn).toContain("value.action === 'buscar_contratar' || value.action === 'otro'")
  })
})

// Corrección real (iPhone): "Todavía no lo sabemos" aparecía marcado en Complementos sin que nadie lo
// hubiese elegido — un objeto de repuesto `current = draft ?? existing ?? {choice:'todavia_no_lo_sabemos'}`
// filtraba ese valor al ChoiceRow. La propia BD en producción confirmó que no había ninguna fila
// event_decisions creada — el bug era puramente de renderizado, nunca una escritura espontánea.
describe('ComplementosQuestion — sin decisión ni borrador no hay NINGÚN valor por defecto (corrección real)', () => {
  const fn = slice(SRC, 'function ComplementosQuestion(', '\nfunction FloralItemQuestion(')

  it('`current` puede quedar undefined — ya no existe el objeto de repuesto con choice fijo', () => {
    expect(fn).not.toMatch(/\?\?\s*\{\s*choice:\s*'todavia_no_lo_sabemos'/)
    expect(fn).toContain('const current = draft ?? existing')
  })

  it('el ChoiceRow recibe current?.choice — undefined cuando no hay nada, ningún chip se marca solo', () => {
    expect(fn).toContain('value={current?.choice}')
  })

  it('los arrays vacíos se resuelven con ?? [] solo donde hace falta (toggle/addCustom/removeCustom), nunca como choice por defecto', () => {
    expect(fn).toContain('current?.selected ?? []')
    expect(fn).toContain('current?.customItems ?? []')
  })

  it('elegir "preparar" no guarda nada todavía — solo revela la selección, hace falta "Guardar complementos"', () => {
    const select = slice(fn, 'function selectChoice(', '\n  }')
    expect(select).toContain("if (choice === 'preparar')")
    expect(select).not.toContain('onSave(next)')
  })

  it('"no_necesitamos"/"todavía no lo sabemos" guardan de inmediato con selected/customItems vacíos — solo al pulsar el chip, nunca antes', () => {
    const select = slice(fn, 'function selectChoice(', '\n  }')
    expect(select).toContain('onSave({ choice, selected: [], customItems: [] })')
  })

  it('revelado progresivo: la selección específica (zapatos/joyas/...) solo se muestra cuando choice === "preparar"', () => {
    expect(fn).toContain("current?.choice === 'preparar' && (")
  })

  it('ningún useEffect en el componente — el renderizado nunca dispara una escritura por sí solo', () => {
    expect(fn).not.toContain('useEffect')
  })
})

// Corrección real (petición explícita): marcar Ramo/Prendido es una decisión distinta de resolver cómo se
// consigue — nunca se guarda "todavía no lo sabemos" como marcador ficticio de selección.
describe('FloralItemQuestion — seleccionado (events.details) separado de la resolución (event_decisions)', () => {
  const fn = slice(SRC, 'function FloralItemQuestion(', '\nfunction CustomFloralItem(')

  it('el checkbox refleja `selected` (prop, viene de events.details), nunca la mera existencia de `decision`', () => {
    expect(fn).toContain('checked={selected}')
    expect(fn).not.toContain('checked={!!decision}')
  })

  it('marcar/desmarcar llama a onToggleSelected, nunca guarda directamente una respuesta "todavía no lo sabemos"', () => {
    expect(fn).toContain('onChange={(e) => onToggleSelected(e.target.checked)}')
    expect(fn).not.toContain("onSave({ choice: 'todavia_no_lo_sabemos' })")
  })

  it('la pregunta de resolución se revela con `selected`, no con `decision` — puede estar marcado sin ninguna decisión todavía', () => {
    expect(fn).toContain('{selected && (')
  })

  it('checkbox, icono y texto en una sola fila — flexDirection:\'row\' explícito (el <label> base de la app es column)', () => {
    const label = slice(fn, '<label', '</label>')
    expect(label).toContain("flexDirection: 'row'")
  })

  it('toda la fila es pulsable: el <input> vive dentro del propio <label>, no en un elemento aparte', () => {
    const label = slice(fn, '<label', '</label>')
    expect(label).toContain('<input type="checkbox"')
  })

  it('nunca busca el establecimiento/proveedor más cercano', () => {
    expect(fn).not.toMatch(/nearby|closest|proximity/i)
  })
})

describe('PairBlock — setFloralSelected nunca crea Preparativo/Presupuesto/decisión ficticia al marcar', () => {
  const pairBlock = slice(SRC, 'function PairBlock({', '\n\n// ---------------------------------------------------------------------\n// Fase 2 — Momentos genéricos')
  const fn = slice(pairBlock, 'async function setFloralSelected(', '\n  }')

  it('marcar (selected=true) nunca pasa por upsertEventDecision ni crea generación — solo events.details', () => {
    expect(fn).toContain('withFloralSelected(event, slot, item, selected)')
    expect(fn).toContain('updateEvent(event.id,')
    expect(fn).not.toContain('upsertEventDecision(')
  })

  it('desmarcar con una resolución real existente: reconcilia (applyPairDecisionGeneration) ANTES de borrar la decisión — nunca al revés', () => {
    const applyIdx = fn.indexOf('applyPairDecisionGeneration(')
    const deleteIdx = fn.indexOf('deleteEventDecision(')
    expect(applyIdx).toBeGreaterThan(-1)
    expect(deleteIdx).toBeGreaterThan(applyIdx)
  })

  it('tras actualizar details, llama a onChanged() para que event.details se refresque en el árbol', () => {
    expect(fn).toContain('onChanged()')
  })
})

describe('PairBlock — Vestuario/Detalle especial de 2 niveles: el tipo nunca genera, cambiar el tipo recalcula la resolución existente', () => {
  const pairBlock = slice(SRC, 'function PairBlock({', '\n\n// ---------------------------------------------------------------------\n// Fase 2 — Momentos genéricos')

  it('saveVestuarioTipo recalcula la resolución si ya existía', () => {
    const fn = slice(pairBlock, 'async function saveVestuarioTipo(', '\n  }')
    expect(fn).toContain("pairQuestionKey(slot, 'vestuario.resolucion')")
    expect(fn).toContain('desiredForVestuarioResolucion(')
  })

  it('saveDetalleTipo recalcula igual la resolución de detalle especial si ya existía', () => {
    const fn = slice(pairBlock, 'async function saveDetalleTipo(', '\n  }')
    expect(fn).toContain('DETALLE_ESPECIAL_RESOLUCION_QUESTION_KEY')
    expect(fn).toContain('desiredForDetalleEspecialResolucion(')
  })

  // Corrección real (residuo de Jennifer en producción): el tipo ya NO se limita a "nunca generar" en
  // teoría — también se reconcilia SIEMPRE a "nada" en cada guardado, lo que retira cualquier resto
  // heredado del modelo de 1 solo nivel (donde esta misma clave sí generaba directamente).
  it('saveVestuarioTipo SIEMPRE reconcilia su propia fila a "nada" — autosanea residuos del modelo antiguo', () => {
    const fn = slice(pairBlock, 'async function saveVestuarioTipo(', '\n  }')
    expect(fn).toContain('applyPairDecisionGeneration(event.id, tipoDecision.id, { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false })')
  })
  it('saveDetalleTipo hace lo mismo con su propia fila', () => {
    const fn = slice(pairBlock, 'async function saveDetalleTipo(', '\n  }')
    expect(fn).toContain('applyPairDecisionGeneration(event.id, tipoDecision.id, { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false })')
  })
})

describe('Complementos — los florales son contenido revelado de "Queremos preparar complementos", nunca visibles antes', () => {
  const pairBlock = slice(SRC, 'function PairBlock({', '\n\n// ---------------------------------------------------------------------\n// Fase 2 — Momentos genéricos')

  it('el bloque floral completo está condicionado a complementosAnswer?.choice === "preparar"', () => {
    expect(pairBlock).toContain("complementosAnswer?.choice === 'preparar' && (")
  })

  it('"💐 Complementos florales", los checkboxes y "+ Otro complemento floral" están DENTRO de esa condición, no antes', () => {
    const gated = slice(pairBlock, "complementosAnswer?.choice === 'preparar' && (", '+ Otro complemento floral')
    expect(gated).toContain('💐 Complementos florales')
    expect(gated).toContain('<FloralItemQuestion')
  })
})

describe('Feedback — toast construido de las acciones reales, nunca de la respuesta (corrección aprobada §12-13)', () => {
  const pairBlock = slice(SRC, 'function PairBlock({', 'function BudgetAmountPromptModal(')

  it('handleEffects es el único punto que decide toast vs modal, y lo hace a partir de pendingBudgetItem', () => {
    const fn = slice(pairBlock, 'function handleEffects(', '\n  }')
    expect(fn).toContain('if (pendingBudgetItem) {')
    expect(fn).toContain('setCostPrompt(')
    expect(fn).toContain('describeEffects(actions)')
    expect(fn).toContain('showToast(message)')
  })

  it('cuando hay pendingBudgetItem, handleEffects NUNCA llama a showToast — se pospone hasta que el modal se resuelva', () => {
    const fn = slice(pairBlock, 'function handleEffects(', '\n  }')
    const pendingBranch = fn.slice(fn.indexOf('if (pendingBudgetItem) {'), fn.indexOf('return\n    }') + 'return\n    }'.length)
    expect(pendingBranch).not.toContain('showToast')
  })

  it.each(['saveQuestion', 'saveVestuarioTipo', 'saveVestuarioResolucion', 'saveNecesidad', 'saveResolucion', 'saveDetalleTipo', 'saveDetalleResolucion'])(
    '%s pasa por handleEffects después de onDerivedDataChanged (nunca un showToast suelto)',
    (fnName) => {
      const fn = slice(pairBlock, `async function ${fnName}(`, '\n  }')
      const tryBlock = fn.slice(fn.indexOf('try {'), fn.indexOf('} catch'))
      expect(tryBlock).toContain('handleEffects(')
      expect(tryBlock).not.toContain('showToast(')
    },
  )

  it('el modal de cierre de coste decide el toast final según taskCompleted: combinado si Guardar/Sin coste, simple si Ahora no', () => {
    const render = slice(pairBlock, '{costPrompt && (', '/>\n      )}')
    expect(render).toContain('onClose={() => {')
    expect(render).toContain('if (costPrompt.taskCompleted) showToast(TASK_COMPLETED_MESSAGE)')
    expect(render).toContain('showToast(costPrompt.taskCompleted ? TASK_COMPLETED_AND_BUDGET_UPDATED_MESSAGE : BUDGET_UPDATED_MESSAGE)')
  })
})

describe('BudgetAmountPromptModal — cierre de coste genérico y reutilizable (corrección aprobada §6-7)', () => {
  const fn = slice(SRC, 'function BudgetAmountPromptModal(', '\n\n// ---------------------------------------------------------------------\n// Fase 2 — Momentos genéricos')

  it('trabaja siempre sobre la partida real por id — nunca crea una partida nueva', () => {
    expect(fn).toContain('updateEventBudgetItem(item.id, { plannedAmount: value })')
    expect(fn).not.toContain('addEventBudgetItem')
  })

  it('el título mostrado es el propio category de la partida real, nunca un texto fijo por tipo de pregunta', () => {
    expect(fn).toContain('{item.category}')
  })

  it('"Sin coste" guarda explícitamente 0, "Ahora no" no llama a save en absoluto', () => {
    expect(fn).toContain('onClick={() => save(0)}')
    expect(fn).toContain('onClick={onClose}')
  })
})

describe('PairBlock — reconciliación pasa siempre por applyPairDecisionGeneration, nunca un insert/delete suelto de event_tasks', () => {
  const fn = slice(SRC, 'function PairBlock(', '\n\n// ---------------------------------------------------------------------\n// Fase 2 — Momentos genéricos')

  it('saveQuestion aplica la decisión y la generación en el mismo paso', () => {
    const saveQuestion = slice(fn, 'async function saveQuestion(', '\n  }')
    expect(saveQuestion).toContain('upsertEventDecision(')
    expect(saveQuestion).toContain('applyPairDecisionGeneration(')
  })

  it('quitar un elemento floral personalizado reconcilia a "nada" ANTES de borrar la decisión — nunca deja un preparativo/presupuesto huérfano', () => {
    const removeFloral = slice(fn, 'async function removeFloral(', '\n  }')
    const applyIdx = removeFloral.indexOf('applyPairDecisionGeneration(')
    const deleteIdx = removeFloral.indexOf('deleteEventDecision(')
    expect(applyIdx).toBeGreaterThan(-1)
    expect(deleteIdx).toBeGreaterThan(applyIdx)
  })

  it('cambiar la necesidad de peluquería/maquillaje reconcilia también la resolución ya existente, si la hay', () => {
    const saveNecesidad = slice(fn, 'async function saveNecesidad(', '\n  }')
    expect(saveNecesidad).toContain('peluqueria_maquillaje.resolucion')
    expect(saveNecesidad).toContain('desiredForPeluqueriaResolucion(')
  })
})
