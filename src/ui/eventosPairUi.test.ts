import { describe, expect, it } from 'vitest'

// "👰🤵 La pareja" (Fase 3) — capa de UI sobre el motor puro ya cubierto a fondo en
// src/domain/eventPairDecisions.test.ts. Aquí solo se comprueba el cableado: gating a boda, reutilización
// del acordeón de Fase 2, el merge explícito de event.details y que nunca se cree un proveedor ficticio.
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

  it('monta PairBlock dentro del bloque, no un componente nuevo de acordeón', () => {
    expect(fn).toContain('<PairBlock event={event} />')
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

describe('ComplementosQuestion — 3 estados reales, una multiselección vacía no es una respuesta', () => {
  const fn = slice(SRC, 'function ComplementosQuestion(', '\nfunction FloralItemQuestion(')

  it('elegir "preparar" no guarda nada todavía — solo revela la selección, hace falta "Guardar complementos"', () => {
    const select = slice(fn, 'function selectChoice(', '\n  }')
    expect(select).toContain("if (choice === 'preparar')")
    expect(select).not.toContain('onSave(next)')
  })

  it('"no_necesitamos"/"todavía no lo sabemos" guardan de inmediato con selected/customItems vacíos', () => {
    const select = slice(fn, 'function selectChoice(', '\n  }')
    expect(select).toContain('onSave({ choice, selected: [], customItems: [] })')
  })
})

describe('FloralItemQuestion — checkbox gatea la pregunta, nunca infiere por proximidad', () => {
  const fn = slice(SRC, 'function FloralItemQuestion(', '\nfunction CustomFloralItem(')

  it('marcar la casilla crea la decisión con "todavía no lo sabemos" por defecto (via onAdd), nunca con un proveedor ya puesto', () => {
    expect(fn).toContain("e.target.checked ? onAdd() : onRemove()")
  })

  it('nunca busca el establecimiento/proveedor más cercano', () => {
    expect(fn).not.toMatch(/nearby|closest|proximity/i)
  })
})

describe('PairBlock — reconciliación pasa siempre por applyPairDecisionGeneration, nunca un insert/delete suelto de event_tasks', () => {
  const fn = slice(SRC, 'function PairBlock(', '\n\n// ---------------------------------------------------------------------\n// Fase 2 — Momentos genéricos')

  it('saveQuestion aplica la decisión y la generación en el mismo paso', () => {
    const saveQuestion = slice(fn, 'async function saveQuestion(', '\n  }')
    expect(saveQuestion).toContain('upsertEventDecision(')
    expect(saveQuestion).toContain('applyPairDecisionGeneration(')
  })

  it('quitar un elemento floral reconcilia a "nada" ANTES de borrar la decisión — nunca deja un preparativo/presupuesto huérfano sin pasar por isTaskUntouched/isBudgetItemUntouched', () => {
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
