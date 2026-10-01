import { describe, expect, it } from 'vitest'

// Eventos — cierre de Fase 2 (bug real encontrado en la comprobación manual): las 2 instancias de
// MomentsEditor (Gestionar evento + el configurador del dashboard) no se enteraban de los cambios la una
// de la otra. Se corrige con un CustomEvent del navegador (src/state/eventMomentsSync.ts), nunca timers,
// nunca polling, nunca recargar la página. Mismo patrón estructural (sin jsdom) que el resto de este
// archivo: se lee el código real, nunca se renderiza.
const SRC = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']
const SYNC_SRC = (import.meta.glob('/src/state/eventMomentsSync.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/state/eventMomentsSync.ts']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('eventMomentsSync — mecanismo elegido: CustomEvent del navegador, nunca timers/polling/recarga', () => {
  it('no hay ningún setInterval/setTimeout de sondeo ni recarga de página', () => {
    expect(SYNC_SRC).not.toMatch(/setInterval/)
    expect(SYNC_SRC).not.toMatch(/location\.reload|window\.location\.reload/)
    // setTimeout está permitido en el resto de la app (p. ej. ConfirmIconButton se desarma solo), pero
    // este módulo en concreto no necesita ninguno: la señal es puramente por evento, nunca por tiempo.
    expect(SYNC_SRC).not.toMatch(/setTimeout/)
  })

  it('la señal va filtrada por eventId — no refresca momentos de otro evento por error', () => {
    expect(SYNC_SRC).toContain('detail?.eventId === eventId')
  })

  it('notifyEventMomentsChanged no escribe nada en event_moments — solo avisa a quien ya lo está leyendo', () => {
    const fn = slice(SYNC_SRC, 'export function notifyEventMomentsChanged', '\n}')
    expect(fn).not.toMatch(/supabase|insert|update|delete/i)
    expect(fn).toContain('window.dispatchEvent')
  })
})

describe('MomentsEditor se suscribe a la señal compartida (ambas instancias, Gestionar evento y el configurador)', () => {
  const fn = slice(SRC, 'function MomentsEditor(', '\n}\n\nfunction ')

  it('usa useEventMomentsChangeSignal(event.id, load) — se recarga cuando CUALQUIER instancia avisa, incluida ella misma', () => {
    expect(fn).toContain('useEventMomentsChangeSignal(event.id, load)')
  })

  // Test obligatorio 1/2/3 — editar hora/lugar/fecha pasan los 3 por el MISMO handleEditSave (un único
  // MomentFormValues con momentDate/momentTime/locationLabel): si notifica tras cualquiera de los 3, las
  // 3 ediciones quedan cubiertas por el mismo mecanismo, no hace falta un caso especial por campo.
  it('editar hora/lugar/fecha (handleEditSave) avisa a la otra instancia tras guardar', () => {
    const editFn = slice(fn, 'async function handleEditSave(', '\n  async function handleDelete(')
    expect(editFn).toContain('await load()')
    expect(editFn).toContain('notifyEventMomentsChanged(event.id)')
    // El aviso va DESPUÉS de recargar el propio estado — nunca antes (evitaría pisarse con su propio load).
    expect(editFn.indexOf('await load()')).toBeLessThan(editFn.indexOf('notifyEventMomentsChanged(event.id)'))
  })

  // Test obligatorio 4 — añadir un tercer momento (o cualquier momento nuevo).
  it('añadir un momento (handleAdd) avisa a la otra instancia tras guardar', () => {
    const addFn = slice(fn, 'async function handleAdd(', '\n  // Un momento "legacy"')
    expect(addFn).toContain('await load()')
    expect(addFn).toContain('notifyEventMomentsChanged(event.id)')
  })

  // Test obligatorio 5 — eliminar.
  it('eliminar un momento (handleDelete) avisa a la otra instancia tras guardar', () => {
    const deleteFn = slice(fn, 'async function handleDelete(', '\n  async function handleReorder(')
    expect(deleteFn).toContain('await load()')
    expect(deleteFn).toContain('notifyEventMomentsChanged(event.id)')
  })

  // Test obligatorio 6 — reordenar ↑↓.
  it('reordenar (handleReorder) avisa a la otra instancia tras guardar', () => {
    const reorderFn = slice(fn, 'async function handleReorder(', '\n  if (moments === null)')
    expect(reorderFn).toContain('await reorderEventMoments(reordered.map((m) => m.id))')
    expect(reorderFn).toContain('await load()')
    expect(reorderFn).toContain('notifyEventMomentsChanged(event.id)')
  })

  it('import correcto del módulo de sincronización', () => {
    expect(SRC).toContain("import { notifyEventMomentsChanged, useEventMomentsChangeSignal } from '@/state/eventMomentsSync'")
  })
})
