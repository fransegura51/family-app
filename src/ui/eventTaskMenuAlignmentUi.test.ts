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

// Fase 7 (plan de pendientes) — causa real de que "Editar" y "Borrar" NO quedaran en la misma vertical
// pese al arreglo de la columna de icono (de arriba): "Editar" es un <button> normal con
// `style={{ display: 'block', width: '100%', textAlign: 'left' }}` inline, pero ConfirmButton no
// aceptaba ningún `style` — así que ese mismo ajuste nunca podía llegar a "Borrar", que se quedaba
// centrado por `.link-button { align-self: center }` dentro de `.event-task-menu` (flex-column). No era
// un problema solo de iPhone: nunca se había comprobado en ningún sitio más que ahí.
describe('ConfirmButton acepta un `style` opcional — la causa real de la desalineación', () => {
  it('ConfirmButton define `style?: CSSProperties` y lo aplica al botón SIN confirmar', () => {
    expect(STYLES).toContain('style?: CSSProperties')
    expect(STYLES).toContain('<button type="button" className={className} style={style} onClick={() => setConfirming(true)} aria-label={ariaLabel}>')
  })
  it('las filas de Confirmar/Cancelar (otro layout, ya centradas a propósito) NUNCA reciben ese style', () => {
    const confirmingBlock = STYLES.slice(STYLES.indexOf('if (confirming) {'), STYLES.indexOf('return (', STYLES.indexOf('if (confirming) {') + 1))
    expect(confirmingBlock).not.toContain('style={style}')
  })
  it('EventosScreen pasa a "Borrar" EXACTAMENTE el mismo style que ya tenía "Editar" — las dos filas del menú quedan igual de maquetadas', () => {
    const menuStart = UI.indexOf('<div className="event-task-menu">')
    const menuEnd = UI.indexOf('</div>', UI.indexOf('<ConfirmButton', menuStart))
    const menuBlock = UI.slice(menuStart, menuEnd)
    expect(menuStart).toBeGreaterThan(-1)
    const occurrences = [...menuBlock.matchAll(/style=\{\{ display: 'block', width: '100%', textAlign: 'left' \}\}/g)]
    expect(occurrences.length).toBe(2)
    const confirmButtonIdx = menuBlock.indexOf('<ConfirmButton')
    const onConfirmIdx = menuBlock.indexOf('onConfirm={onDelete}', confirmButtonIdx)
    const styleIdx = menuBlock.indexOf("style={{ display: 'block', width: '100%', textAlign: 'left' }}", confirmButtonIdx)
    expect(confirmButtonIdx).toBeGreaterThan(-1)
    expect(styleIdx).toBeGreaterThan(confirmButtonIdx)
    expect(onConfirmIdx).toBeGreaterThan(styleIdx)
  })
})
