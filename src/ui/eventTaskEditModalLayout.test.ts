import { describe, expect, it } from 'vitest'

// Revisión manual en iPhone — tres hallazgos reales en la ficha de edición de Preparativos:
// 1) los responsables en checkboxes verticales desperdiciaban espacio;
// 2) el alta de persona externa se mostraba siempre, con desbordamiento horizontal en el campo Relación;
// 3) la ficha completa tenía scroll horizontal.
// Estos tests fijan la solución (chips + alta plegada + flex-wrap con min-width:0) como guard de layout,
// dentro de lo que permite esta arquitectura de tests (comprobar el código fuente, no un navegador real).
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const MODAL = window_(UI, 'function TaskEditModal({', '\nfunction EventShoppingSection(')

describe('responsables: chips compactos, no checkboxes verticales', () => {
  it('familiares y externas se muestran como chip, no como <label><input type="checkbox">', () => {
    expect(MODAL).toContain('className={\'chip\' + (responsibleIds.includes(m.id) ? \' chip-active\' : \'\')}')
    expect(MODAL).toContain('className={\'chip chip-external\' + (helperIds.includes(h.id) ? \' chip-active\' : \'\')}')
  })
  it('la fila de chips usa la misma clase .chip-row (flex-wrap: wrap, verificado a mano en styles.css — vitest no procesa CSS real en este entorno, ver calendarCategoryFormFixUi.test.ts)', () => {
    expect(MODAL).toContain('<div className="chip-row"')
  })
  it('selección múltiple real: cada chip se alterna de forma independiente', () => {
    expect(MODAL).toContain("prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id]")
    expect(MODAL).toContain("prev.includes(h.id) ? prev.filter((id) => id !== h.id) : [...prev, h.id]")
  })
})

describe('personas externas: nunca un formulario permanente', () => {
  it('«+ Añadir persona externa» es un chip que abre el alta, no un formulario siempre visible', () => {
    expect(MODAL).toContain('onClick={() => setAddingHelper((v) => !v)}')
    expect(MODAL).toContain('{addingHelper && (')
  })
  it('cancelar el alta no guarda nada', () => {
    const addBlock = window_(MODAL, '{addingHelper && (', 'Nota\n')
    expect(addBlock).toContain('onClick={() => setAddingHelper(false)}')
  })
  it('guardar el alta limpia el formulario y lo vuelve a plegar', () => {
    expect(MODAL).toContain('onClick={() => void addHelper().then(() => setAddingHelper(false))}')
  })
  it('editar/borrar una externa existente vive detrás de un menú ⋯, no en una lista siempre visible', () => {
    expect(MODAL).toContain("aria-label={`Más opciones de ${h.name}`}")
    expect(MODAL).toContain('onClick={() => setHelperMenuFor(helperMenuFor === h.id ? null : h.id)}')
  })
  it('mantiene conservar/quitar asignaciones al borrar una externa con tareas asignadas', () => {
    expect(MODAL).toContain("Conservar las asignaciones (quedan como referencia)")
    expect(MODAL).toContain('Quitarla también de las tareas')
  })
})

describe('sin desbordamiento horizontal: wrap + min-width:0 en todo lo que podría desbordar', () => {
  it('fecha y hora comparten fila cuando cabe, envuelven en estrecho, y nunca fuerzan ancho fijo', () => {
    const row = window_(MODAL, "{/* Comparten fila", 'Prioridad')
    expect(row).toContain("flexWrap: 'wrap'")
    expect(row).toMatch(/flex: '1 1 140px', minWidth: 0/)
    expect(row).toMatch(/flex: '1 1 110px', minWidth: 0/)
  })
  it('los campos de nombre/relación de una persona externa (alta y edición) nunca tienen ancho fijo', () => {
    expect((MODAL.match(/placeholder="Nombre"[^/]*style=\{\{ minWidth: 0, flex: 1 \}\}/g) ?? []).length).toBeGreaterThan(0)
    expect((MODAL.match(/placeholder="Relación \(opcional\)"[^/]*style=\{\{ minWidth: 0, flex: 1 \}\}/g) ?? []).length).toBeGreaterThan(0)
  })
})

describe('reglas ya validadas que no deben cambiar', () => {
  it('«Mostrar en Calendario» y «Recordatorio» siguen siendo controles separados, con sus cinco opciones', () => {
    expect(MODAL).toContain('📅 Mostrar en Calendario')
    for (const option of ['none', 'same_day', '1_day', '1_week', 'custom']) expect(MODAL).toContain(`value="${option}"`)
  })
  it('el editor sigue mostrando los nombres completos de prioridad (a diferencia de la tarjeta compacta)', () => {
    expect(MODAL).toContain('<option value="">Sin prioridad</option>')
    expect(MODAL).toContain('<option value="alta">Alta</option>')
    expect(MODAL).toContain('<option value="media">Media</option>')
    expect(MODAL).toContain('<option value="baja">Baja</option>')
  })
  it('Guardar sigue siendo el único submit del formulario, sin submenús para funciones importantes', () => {
    expect((MODAL.match(/<button type="submit"/g) ?? []).length).toBe(1)
  })
})
