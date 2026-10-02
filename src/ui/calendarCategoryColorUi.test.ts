import { describe, expect, it } from 'vitest'

// CORRECCIÓN QUIRÚRGICA — color de categoría del Calendario, como propiedad editable visible (antes
// solo vivía en la base de datos sin forma clara de elegirlo al crear). Mismo patrón de tests que el
// resto de esta fase (sin jsdom, código fuente leído como texto) — ver calendarCategoryFormFixUi.test.ts
// para el porqué (import.meta.glob con ?raw no da contenido real de .css en este entorno).
//
// ACLARACIÓN del usuario tras la primera versión: el selector NO tiene paleta propia — reutiliza la
// paleta del estilo global activo (Configuración → Colores → Menús y pantallas: Pastel/Vivo/Neutro,
// domain/colors.ts#solidPalette, que a su vez reutiliza toneFor, la MISMA fuente que el resto de la
// app). La corrección matemática de esa paleta (solidToneHex/solidPalette: siempre hex, nunca hsl(...)
// ni el degradado de "neutro") tiene tests de comportamiento real en domain/colors.test.ts — aquí solo
// se comprueba la INTEGRACIÓN: que MenuSettingsScreen reutiliza esa fuente y no se inventa otra.
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
const CALENDAR_SCREEN_SRC = readFile('/src/ui/CalendarScreen.tsx')
const PICKER = slice(MENU_SETTINGS_SRC, 'function CalendarCategoryColorPicker(', 'function CalendarCategoryRow(')

describe('Paleta reutilizada del estilo global — nunca una paleta propia de Calendario', () => {
  it('las muestras salen de domain/colors.ts#solidPalette, con el estilo global activo (getColorTheme), no de una lista fija', () => {
    expect(MENU_SETTINGS_SRC).toContain("import { pastelPalette, solidPalette } from '@/domain/colors'")
    expect(PICKER).toContain('const theme = getColorTheme()')
    expect(PICKER).toContain('const swatches = solidPalette(CALENDAR_CATEGORY_COLOR_COUNT, theme)')
  })

  it('no inventa una paleta propia (ninguna lista de hex fija tipo CALENDAR_CATEGORY_COLORS, ni distinctTagColor reutilizado como paleta de categorías)', () => {
    expect(MENU_SETTINGS_SRC).not.toMatch(/CALENDAR_CATEGORY_COLORS\s*=/)
    expect(MENU_SETTINGS_SRC).not.toContain('distinctTagColor')
  })

  it('cada estilo global (Pastel/Vivo/Neutro) tiene su propia etiqueta — el usuario ve de qué paleta son las muestras', () => {
    expect(MENU_SETTINGS_SRC).toContain("const CALENDAR_CATEGORY_COLOR_THEME_LABEL: Record<ColorTheme, string> = {\n  pastel: 'Colores del estilo Pastel',\n  vivo: 'Colores del estilo Vivo',\n  neutro: 'Colores del estilo Neutro',\n}")
    expect(PICKER).toContain('{CALENDAR_CATEGORY_COLOR_THEME_LABEL[theme]}')
  })
})

describe('"Color actual" — una categoría conserva su color aunque ya no pertenezca a la paleta del estilo activo', () => {
  it('si el color guardado no está entre las muestras del estilo actual, se detecta y se muestra aparte, sin perderse', () => {
    expect(PICKER).toContain("const currentOutsidePalette = value !== '' && !swatches.includes(value)")
    expect(PICKER).toContain('{currentOutsidePalette && (')
    expect(PICKER).toContain('Color actual')
  })

  it('el color guardado nunca se reescribe automáticamente por cambiar de estilo: el estado "color" solo cambia por una elección del usuario (onChange), nunca por un efecto ligado al tema', () => {
    expect(PICKER).not.toMatch(/useEffect\([^)]*theme/)
    // El valor que ve el picker es exactamente el que ya tenía la categoría (o el que el usuario eligió);
    // nunca se "reindexa" contra la paleta nueva.
    expect(PICKER).toContain('function CalendarCategoryColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {')
  })
})

describe('Color como propiedad editable — alta y edición', () => {
  it('crear categoría guarda el color elegido (nunca null fijo)', () => {
    const section = slice(MENU_SETTINGS_SRC, 'function CalendarCategoriesSection() {', '\n  if (loading) return null')
    expect(section).toContain('await createCalendarCategory({ name: name.trim(), emoji: emoji.trim(), color: color.trim() || null, sortOrder: categories.length })')
  })

  it('crear categoría sin tocar el color usa un color predeterminado válido, de la paleta del estilo activo (no un azul fijo)', () => {
    const section = slice(MENU_SETTINGS_SRC, 'function CalendarCategoriesSection() {', '\n  if (loading) return null')
    expect(section).toContain("setColor((prev) => prev || solidPalette(CALENDAR_CATEGORY_COLOR_COUNT, getColorTheme())[cats.length % CALENDAR_CATEGORY_COLOR_COUNT])")
  })

  it('tras crear una categoría, el color se vacía para que la siguiente reciba otra muestra distinta (nunca la misma por defecto)', () => {
    const section = slice(MENU_SETTINGS_SRC, 'function CalendarCategoriesSection() {', '\n  if (loading) return null')
    expect(section).toContain("setName('')\n      setEmoji('')\n      setColor('')\n      await reload()")
  })

  it('editar guarda nombre+emoji+color conjuntamente, sobre el MISMO category_id (nunca crea otra categoría)', () => {
    const row = slice(MENU_SETTINGS_SRC, 'function CalendarCategoryRow({', 'function CalendarCategoriesSection() {')
    expect(row).toContain('await updateCalendarCategory(category.id, { name: name.trim(), emoji: emoji.trim(), color: color.trim() || null, sortOrder: category.sortOrder })')
  })

  it('al guardar la edición, la UI se actualiza de inmediato sin recargar la página (onSaved → reload() propio, nunca window.location.reload)', () => {
    const row = slice(MENU_SETTINGS_SRC, 'function CalendarCategoryRow({', 'function CalendarCategoriesSection() {')
    expect(row).toContain('setEditing(false)\n      onSaved()')
    expect(row).not.toContain('window.location.reload')
  })

  it('categoría con color null (antigua, nunca migrada a mano) sigue siendo un estado válido del formulario', () => {
    const row = slice(MENU_SETTINGS_SRC, 'function CalendarCategoryRow({', 'function CalendarCategoriesSection() {')
    expect(row).toContain("const [color, setColor] = useState(category.color ?? '')")
  })

  it('el selector de emoji validado en la fase anterior sigue intacto (mismo componente, misma firma)', () => {
    expect(MENU_SETTINGS_SRC).toContain('<CalendarCategoryEmojiPicker value={emoji} onChange={setEmoji} />')
    expect([...MENU_SETTINGS_SRC.matchAll(/<CalendarCategoryEmojiPicker value=\{emoji\} onChange=\{setEmoji\} \/>/g)]).toHaveLength(2)
  })
})

describe('Listado de categorías — el color se ve sin entrar en Editar', () => {
  it('la fila de solo lectura muestra un punto de color junto al emoji+nombre, con hueco reservado también sin color (para que la lista no "baile")', () => {
    const row = slice(MENU_SETTINGS_SRC, 'if (!editing) {', 'return (\n    <form onSubmit={handleSave}')
    expect(row).toContain("background: category.color ?? '#e5e7eb'")
  })
})

describe('Botón de borrar compacto, sin tocar la lógica de confirmación', () => {
  it('ConfirmIconButton usa el mismo patrón compacto ya validado en EventosScreen (className="icon-button"), no el <button> grande por defecto', () => {
    const row = slice(MENU_SETTINGS_SRC, 'if (!editing) {', 'return (\n    <form onSubmit={handleSave}')
    expect(row).toContain('<ConfirmIconButton onConfirm={onDeleted} ariaLabel={`Borrar categoría ${category.name}`} className="icon-button" />')
  })

  it('la lógica de confirmación (armado + segundo toque) no se ha tocado: sigue siendo el mismo ConfirmIconButton, mismo onConfirm', () => {
    const row = slice(MENU_SETTINGS_SRC, 'function CalendarCategoryRow({', 'function CalendarCategoriesSection() {')
    expect(row).toContain('onConfirm={onDeleted}')
  })
})

describe('Layout móvil — el color nunca comparte fila con emoji+nombre+botón (mismo bug que la fase anterior)', () => {
  it('en el alta, el selector de color es un bloque propio después de .calendar-category-form-fields, no dentro de esa misma fila', () => {
    const addForm = slice(MENU_SETTINGS_SRC, '<form onSubmit={handleAdd} className="calendar-category-form">', '</form>')
    const fieldsBlock = slice(addForm, '<div className="calendar-category-form-fields">', '</div>')
    expect(fieldsBlock).not.toContain('CalendarCategoryColorPicker')
    expect(addForm).toContain('<CalendarCategoryColorPicker value={color} onChange={setColor} />')
  })

  it('en la edición, igual: el color es un bloque propio, nunca metido en la fila de emoji+nombre', () => {
    const editForm = slice(MENU_SETTINGS_SRC, 'return (\n    <form onSubmit={handleSave} className="calendar-category-form">', '</form>')
    const fieldsBlock = slice(editForm, '<div className="calendar-category-form-fields">', '</div>')
    expect(fieldsBlock).not.toContain('CalendarCategoryColorPicker')
    expect(editForm).toContain('<CalendarCategoryColorPicker value={color} onChange={setColor} />')
  })

  it('las muestras de color envuelven (flex-wrap) en vez de forzar una fila sin límite — nunca el mismo bug de overflow que el emoji/nombre/botón', () => {
    expect(PICKER).toContain('className="calendar-category-color-row"')
  })
})

describe('No regresión — el modo "Ver colores de categorías"/"Ver colores de miembros" y su fallback no se han tocado', () => {
  it('eventColor sigue con el mismo fallback: color propio del evento → color de categoría (solo en modo categorías) → color de miembro → gris', () => {
    const fn = slice(CALENDAR_SCREEN_SRC, 'function eventColor(ev: CalendarEvent', 'function hhmm(')
    expect(fn).toContain('if (ev.color) return ev.color')
    expect(fn).toContain('const categoryColor = categoryColorById.get(ev.categoryId)')
    expect(fn).toContain("return first?.color ?? '#9ca3af'")
  })

  it('categoryColorById solo se construye/pasa cuando colorMode === "categorias" — en modo "miembros" el comportamiento es exactamente el de siempre', () => {
    expect(CALENDAR_SCREEN_SRC).toContain("calendarPrefs.colorMode === 'categorias' ? categoryColorById : undefined")
  })

  it('el ajuste "Ver colores de miembros"/"Ver colores de categorías" (CalendarPreferencesSection) no se ha tocado en esta corrección', () => {
    const prefs = slice(MENU_SETTINGS_SRC, 'function CalendarPreferencesSection() {', 'function CalendarCategoryEmojiPicker(')
    expect(prefs).toContain("useState<CalendarColorMode>('miembros')")
    expect(prefs).toContain('Ver colores de miembros')
    expect(prefs).toContain('Ver colores de categorías')
  })
})
