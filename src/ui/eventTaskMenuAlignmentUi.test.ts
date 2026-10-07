import { describe, expect, it } from 'vitest'

// Bloque B — "✏️ Editar"/"🗑️ Borrar" del menú ⋯: columna de icono de ancho fijo para que el texto
// empiece siempre en la misma vertical. Solo maquetación: ni acciones ni tarjeta cambian.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']
const STYLES = (import.meta.glob('/src/ui/ConfirmButton.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/ConfirmButton.tsx']

describe('columna de icono fija en el menú ⋯ de la tarea', () => {
  it('Editar y Borrar usan la misma clase de fila (icono + texto)', () => {
    expect((UI.match(/className="event-task-menu-row"/g) ?? []).length).toBe(2)
    expect((UI.match(/className="event-task-menu-icon"/g) ?? []).length).toBe(2)
  })
  it('el icono de Editar es ✏️ y el de Borrar 🗑️, en ese orden de columnas (icono, luego texto)', () => {
    const editIdx = UI.indexOf('<span className="event-task-menu-icon">✏️</span>')
    const editTextIdx = UI.indexOf('<span>Editar</span>', editIdx)
    const delIdx = UI.indexOf('<span className="event-task-menu-icon">🗑️</span>')
    const delTextIdx = UI.indexOf('<span>Borrar</span>', delIdx)
    expect(editIdx).toBeGreaterThan(-1)
    expect(editTextIdx).toBeGreaterThan(editIdx)
    expect(delIdx).toBeGreaterThan(-1)
    expect(delTextIdx).toBeGreaterThan(delIdx)
  })
  it('no cambian las acciones: Editar sigue llamando a onEdit, Borrar sigue usando ConfirmButton con onConfirm={onDelete}', () => {
    expect(UI).toContain('onEdit()')
    expect(UI).toContain('onConfirm={onDelete}')
  })
})

describe('ConfirmButton acepta un nodo como label (icono + texto), sin cambiar su comportamiento', () => {
  it('label es ReactNode, no solo string — compatible con cualquier llamador que siga pasando texto', () => {
    expect(STYLES).toContain('label?: ReactNode')
  })
  it('sigue exigiendo un segundo toque antes de confirmar (sin cambios de comportamiento)', () => {
    expect(STYLES).toContain('const [confirming, setConfirming] = useState(false)')
  })
})
