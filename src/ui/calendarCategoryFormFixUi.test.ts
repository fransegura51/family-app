import { describe, expect, it } from 'vitest'

// CORRECCIÓN QUIRÚRGICA — Configuración → Calendario → Categorías del calendario: bug responsive (botón
// recortado fuera del viewport en iPhone), selector de emoji real (antes un <input type="text"> suelto)
// y el botón de crear que parecía "no hacer nada" (disabled en silencio sin explicar por qué). Mismo
// patrón estructural que el resto del repo (sin jsdom): se lee el código fuente como texto. styles.css
// NO se puede leer así en este entorno (import.meta.glob con ?raw devuelve contenido vacío para .css,
// comprobado; y node:fs no está disponible en el tsconfig de la app, solo tipos de navegador) — las
// reglas CSS de esta corrección (.calendar-category-form*) se comprobaron a mano en styles.css y se
// verifican de verdad con el navegador en viewport móvil (ver informe), igual que el resto del repo.
const UI_FILES = import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

function readFile(path: string): string {
  const content = UI_FILES[path]
  expect(content, `no se encontró ${path}`).toBeTruthy()
  return content
}

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const MENU_SETTINGS_SRC = readFile('/src/ui/MenuSettingsScreen.tsx')

describe('Parte 1 — bug responsive: la fila de "nueva categoría" nunca fuerza 3 controles sin wrap', () => {
  const ADD_FORM = slice(MENU_SETTINGS_SRC, 'return (\n    <div className="card event-card" style={{ marginBottom: 16 }}>\n      <strong>🗂️ Categorías', 'type SettingsGroupId')

  it('ya no usa el .inline-fields plano de antes (flex sin wrap, causa real del desbordamiento) para el formulario de alta — ahora una clase propia pensada para apilar en móvil', () => {
    expect(ADD_FORM).toContain('<form onSubmit={handleAdd} className="calendar-category-form">')
    expect(ADD_FORM).not.toMatch(/<form onSubmit=\{handleAdd\} className="inline-fields"/)
    expect(ADD_FORM).toContain('<div className="calendar-category-form-fields">')
    expect(ADD_FORM).toContain('className="calendar-category-form-submit"')
  })

  it('el botón de crear ya no comparte fila fija con los otros dos controles — es un elemento propio, fuera del contenedor de campos (.calendar-category-form-fields), para poder ocupar su propia línea completa en móvil', () => {
    const fieldsBlock = slice(ADD_FORM, '<div className="calendar-category-form-fields">', '</div>')
    expect(fieldsBlock).not.toContain('type="submit"')
  })
})

describe('Parte 2 — selector de emoji real (CalendarCategoryEmojiPicker), reutilizando el patrón modal-overlay/modal-sheet/chip ya existente — nunca un componente de overlay nuevo', () => {
  const PICKER = slice(MENU_SETTINGS_SRC, 'function CalendarCategoryEmojiPicker({', 'function CalendarCategoryColorPicker(')

  it('tocar el control abre el selector (modal-overlay + modal-sheet, mismo lenguaje que WhoDropdown/CategoryDropdown)', () => {
    expect(PICKER).toContain('className="calendar-category-emoji-toggle"')
    expect(PICKER).toContain('onClick={() => setOpen(true)}')
    expect(PICKER).toContain('<div className="modal-overlay" onClick={() => setOpen(false)}>')
    expect(PICKER).toContain('<div className="modal-sheet" onClick={(e) => e.stopPropagation()}>')
  })

  it('emojis habituales sugeridos (no una lista enorme) para categorías familiares/calendario', () => {
    expect(MENU_SETTINGS_SRC).toContain("const CALENDAR_CATEGORY_EMOJI_SUGGESTIONS = ['🏥', '🩺', '🏫', '🎒', '⚽', '🎂', '💼', '🏠', '🚗', '✈️', '🎵', '💇', '🐶', '❤️']")
    expect(PICKER).toContain('CALENDAR_CATEGORY_EMOJI_SUGGESTIONS.map((e) =>')
  })

  it('tocar un emoji sugerido lo selecciona claramente (onChange) y cierra el selector — un único toque, sin paso de confirmación aparte', () => {
    expect(PICKER).toContain('function pick(next: string) {')
    expect(PICKER).toContain('onChange(next)')
    expect(PICKER).toContain('setOpen(false)')
    expect(PICKER).toContain('onClick={() => pick(e)}')
  })

  it('el emoji sugerido actualmente elegido queda marcado (chip-active + aria-pressed), visible en el control incluso cerrado', () => {
    expect(PICKER).toContain("className={'chip' + (value === e ? ' chip-active' : '')}")
    expect(PICKER).toContain('aria-pressed={value === e}')
    expect(PICKER).toContain('{value || ')
  })

  it('NUNCA una lista rígida como única fuente de verdad: sigue siendo posible escribir/pegar cualquier otro emoji', () => {
    expect(PICKER).toContain('Otro emoji')
    expect(PICKER).toContain('function handleCustomSubmit(e: FormEvent) {')
    expect(PICKER).toContain('if (custom.trim()) pick(custom.trim())')
  })

  it('el formulario del selector vive en un portal (document.body) para no anidar <form> dentro del <form> de alta/edición — HTML inválido que provocaba validateDOMNesting', () => {
    expect(PICKER).toContain('createPortal(')
    expect(PICKER).toContain('document.body,')
  })

  it('causa real del emoji personalizado que "se perdía" (y cerraba el acordeón de Configuración por sorpresa): aunque el selector esté en un portal, React sigue burbujeando el evento sintético de submit según el árbol de React, no el del DOM — sin stopPropagation, el submit interno de "Otro emoji" también disparaba el onSubmit del formulario exterior con un valor aún no actualizado (closure obsoleta)', () => {
    expect(PICKER).toContain('e.preventDefault()\n    // stopPropagation')
    expect(PICKER).toContain('e.stopPropagation()')
  })

  it('accesible por teclado: botones reales (nunca un div con onClick), aria-label describe el emoji actual, el campo de emoji personalizado se confirma con Enter (onSubmit real)', () => {
    expect(PICKER).toContain("aria-label={value ? `Emoji de la categoría: ${value}. Tocar para cambiarlo` : 'Elegir emoji de la categoría'}")
    expect(PICKER).toContain('<form onSubmit={handleCustomSubmit}')
    expect(PICKER).not.toMatch(/<div[^>]*onClick=\{[^}]*pick/)
  })

  it('cerrar correctamente: el botón ✕ y tocar el fondo (modal-overlay) cierran sin guardar nada raro', () => {
    expect(PICKER).toContain('onClick={() => setOpen(false)} aria-label="Cerrar"')
  })

  it('el valor final sigue siendo un emoji guardado en calendar_categories — el picker es solo UI, nunca cambia el tipo del dato (sigue siendo value:string / onChange:(emoji:string)=>void)', () => {
    expect(MENU_SETTINGS_SRC).toContain('function CalendarCategoryEmojiPicker({ value, onChange }: { value: string; onChange: (emoji: string) => void }) {')
  })

  it('se reutiliza en el alta Y en la edición de categoría — nunca dos implementaciones distintas', () => {
    expect(MENU_SETTINGS_SRC).toContain('<CalendarCategoryEmojiPicker value={emoji} onChange={setEmoji} />')
    expect([...MENU_SETTINGS_SRC.matchAll(/<CalendarCategoryEmojiPicker value=\{emoji\} onChange=\{setEmoji\} \/>/g)]).toHaveLength(2)
  })
})

describe('Parte 3 — el botón de crear SIEMPRE responde, nunca parece roto', () => {
  const SECTION = slice(MENU_SETTINGS_SRC, 'function CalendarCategoriesSection() {', '\n  if (loading) return null')

  it('causa real encontrada: el submit se ignoraba en silencio si faltaba emoji o nombre, Y el botón estaba disabled por ese mismo motivo sin explicarlo — ahora valida con un mensaje visible y el botón solo se desactiva mientras está guardando de verdad', () => {
    expect(SECTION).toContain("if (!name.trim() || !emoji.trim()) {\n      setError('Elige un emoji y escribe un nombre para la categoría.')\n      return\n    }")
    expect(MENU_SETTINGS_SRC).toContain('className="calendar-category-form-submit" disabled={adding}')
    expect(MENU_SETTINGS_SRC).not.toContain('disabled={adding || !name.trim() || !emoji.trim()}')
  })

  it('submit funciona de verdad: handleAdd llama a createCalendarCategory con el emoji y el nombre tal cual se escribieron', () => {
    expect(SECTION).toContain('await createCalendarCategory({ name: name.trim(), emoji: emoji.trim(), color: color.trim() || null, sortOrder: categories.length })')
  })

  it('creación limpia el formulario y la categoría aparece sin recargar la página (reload() propio, nunca window.location.reload)', () => {
    expect(SECTION).toContain("setName('')")
    expect(SECTION).toContain("setEmoji('')")
    expect(SECTION).toContain('await reload()')
    expect(SECTION).not.toContain('window.location.reload')
  })

  it('mismo arreglo aplicado a la edición de una categoría existente (CalendarCategoryRow) — ya no depende de un <input required> nativo para el emoji', () => {
    const row = slice(MENU_SETTINGS_SRC, 'function CalendarCategoryRow({', 'function CalendarCategoriesSection() {')
    expect(row).toContain("if (!emoji.trim() || !name.trim()) {\n      setError('Elige un emoji y escribe un nombre para la categoría.')\n      return\n    }")
    expect(row).not.toMatch(/placeholder="🩺"[^/]*required/)
  })
})

describe('No regresión — editar/borrar, y las preferencias de arriba (modo de color / orden) intactas', () => {
  it('editar sigue reutilizando updateCalendarCategory; borrar sigue con ConfirmIconButton + deleteCalendarCategory — nada nuevo, nada quitado', () => {
    const row = slice(MENU_SETTINGS_SRC, 'function CalendarCategoryRow({', 'function CalendarCategoriesSection() {')
    expect(row).toContain('updateCalendarCategory(category.id,')
    expect(row).toContain('<ConfirmIconButton onConfirm={onDeleted}')
    const section = slice(MENU_SETTINGS_SRC, 'function CalendarCategoriesSection() {', '\n  if (loading) return null')
    expect(section).toContain('await deleteCalendarCategory(id)')
  })

  it('CalendarPreferencesSection (orden Eventos/Tareas) no se ha tocado en esta corrección quirúrgica (los 3 modos de color tienen su propio test en calendarColorModesUi.test.ts)', () => {
    const prefs = slice(MENU_SETTINGS_SRC, 'function CalendarPreferencesSection() {', 'function CalendarCategoryEmojiPicker(')
    expect(prefs).toContain("useState<CalendarTaskOrder>('eventos_primero')")
    expect(prefs).toContain('Tareas primero')
  })

  it('el grupo "Calendario" de Configuración sigue montando las dos secciones en el mismo orden de siempre', () => {
    const group = slice(MENU_SETTINGS_SRC, 'title="Calendario"', '</SettingsGroup>')
    expect(group).toContain('<CalendarPreferencesSection />')
    expect(group).toContain('<CalendarCategoriesSection />')
  })
})
