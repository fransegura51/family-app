import { describe, expect, it } from 'vitest'

// PEPA Eventos, prompt maestro — Fase 8 (Parte C5): color por encargo en Preparativos, reutilizando el
// sistema pastel/vivo/neutro ya existente (paletteByName, domain/colors.ts) — nunca una paleta paralela.
// El color identifica el ENCARGO (mismo nombre, mismo color), no su estado: se usa igual pendiente,
// resuelto o en Completadas.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const TAREAS_MODULE = window_(UI, "case 'tareas': {", "case 'invitados':")
const GROUPS_MODAL = window_(UI, 'function EventTaskGroupsModal(', '\nfunction ResolveGroupModal(')
const TASK_CARD = window_(UI, 'function TaskCard({', '\nfunction EventHelpersModal(')

describe('color por encargo — reutiliza paletteByName (domain/colors.ts), nunca un sistema de color nuevo', () => {
  it('se calcula UNA vez por pantalla a partir de los nombres reales de los encargos (useMemo), no por tarjeta', () => {
    expect(UI).toContain('const groupColors = useMemo(() => paletteByName(eventTaskGroups.map((g) => g.name)), [eventTaskGroups])')
  })
  it('el mismo cálculo se repite en "🗂️ Encargos" (EventTaskGroupsModal), con el mismo criterio (mismo nombre, mismo color)', () => {
    expect(GROUPS_MODAL).toContain('const groupColors = useMemo(() => paletteByName(groups.map((g) => g.name)), [groups])')
  })
})

describe('el color identifica el ENCARGO, no su estado — se aplica igual en pendientes, en "🗂️ Encargos" y en Completadas', () => {
  it('la cabecera "📦 NOMBRE" de Preparativos pendientes usa groupColors.get(item.groupName) como fondo', () => {
    expect(TAREAS_MODULE).toContain('<div key={item.groupId} className="card member-form" style={{ background: groupColors.get(item.groupName) }}>')
  })
  it('la ficha de cada encargo en "🗂️ Encargos" usa el mismo groupColors.get(g.name) como fondo', () => {
    expect(GROUPS_MODAL).toContain('style={{ padding: 8, background: groupColors.get(g.name) }}')
  })
  it('en Completadas, TaskCard recibe groupColor del mismo mapa (no un color distinto por estar hecha)', () => {
    expect(TAREAS_MODULE).toContain('groupColor={groupColors.get(eventTaskGroups.find((g) => g.id === t.groupId)?.name ?? \'\') ?? null}')
  })
})

describe('TaskCard — el punto de color es puramente informativo, nunca sustituye el nombre del encargo', () => {
  it('el punto solo se pinta si hay groupName Y groupColor — nunca un punto sin su nombre al lado', () => {
    expect(TASK_CARD).toContain('{groupName && (')
    expect(TASK_CARD).toContain('{groupColor && <span style={{ display:')
  })
})
