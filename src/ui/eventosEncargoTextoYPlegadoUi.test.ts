import { describe, expect, it } from 'vitest'

// PEPA Eventos — orden de recuperación de requisitos (Partes C3+C5 del prompt maestro consolidado):
// "revisar textos como «¿Cómo se ha resuelto?» cuando todavía se está preparando la contratación" y
// "permitir plegar y desplegar" cada encargo por separado, sin afectar a los demás ni a los togglees
// globales (Ver todas/Completadas) ya existentes.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('Parte C3 — "¿Cómo se ha resuelto?" ya no suena a que está hecho mientras se está eligiendo', () => {
  it('la pregunta del formulario de resolver está en presente/futuro, no en pasado', () => {
    expect(UI).toContain('¿Cómo lo vais a resolver?')
    expect(UI).not.toContain('¿Cómo se ha resuelto?')
  })
  it('el aviso de validación (sin método elegido) usa el mismo tono', () => {
    expect(UI).toContain("setError('Elige cómo lo vais a resolver.')")
  })
  it('"Antes resuelto:" (referencia histórica de una resolución YA hecha) se queda en pasado — ese sí es correcto', () => {
    expect(UI).toContain('Antes resuelto: {RESOLUTION_METHOD_LABELS[item.group.resolutionMethod ?? ')
  })
})

describe('Parte C5 — plegar/desplegar cada encargo por separado, sin tocar los togglees globales', () => {
  it('cada encargo tiene su propio estado de plegado, independiente de los demás', () => {
    expect(UI).toContain('const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set())')
  })
  it('empieza desplegado (comportamiento de siempre) — el conjunto arranca vacío', () => {
    expect(UI).toContain('useState<Set<string>>(new Set())')
  })
  it('el botón del encabezado del encargo alterna SOLO ese groupId, nunca limpia ni afecta a otros encargos', () => {
    const toggle = window_(UI, 'setCollapsedGroupIds((prev) => {', 'return next')
    expect(toggle).toContain('const next = new Set(prev)')
    expect(toggle).toContain('if (next.has(item.groupId)) next.delete(item.groupId)')
    expect(toggle).toContain('else next.add(item.groupId)')
  })
  it('plegado, no se pintan ni las tareas ni el aviso "Antes resuelto" — pero el encabezado y sus botones (Consultar ofertas/Resolver) siguen visibles', () => {
    const groupBlock = window_(UI, '📦 {item.groupName.toUpperCase()}', '</div>\n                ),\n              )}')
    expect(groupBlock).toContain('{!collapsedGroupIds.has(item.groupId) && (')
    expect(groupBlock.indexOf('📋 Consultar ofertas')).toBeLessThan(groupBlock.indexOf('{!collapsedGroupIds.has(item.groupId) && ('))
  })
  it('no toca los togglees globales ya existentes (Ver todas/Completadas) ni el filtrado de visibleTasks', () => {
    expect(UI).toContain('const filteredTasks = pendingTasks.filter((t) => taskMatchesResponsibleFilter(t, responsibleFilter))')
  })
})
