import { describe, expect, it } from 'vitest'

// RETOQUE — Calendario: tres modos de color mutuamente excluyentes (antes dos: "miembros" y
// "categorías", y este último ya era en realidad el híbrido categoría→persona→neutro de ahora), más un
// engranaje ⚙️ junto a "Categoría (opcional)" en Evento/Tarea para gestionar calendar_categories sin
// perder el formulario a medias. Mismo patrón de tests que el resto de esta fase (sin jsdom, código
// fuente leído como texto) — ver calendarCategoryFormFixUi.test.ts para el porqué. El comportamiento
// PURO de los 3 modos (qué color sale en cada caso) tiene tests de verdad en domain/calendar.test.ts
// (eventDotColors); aquí se comprueba la INTEGRACIÓN: que CalendarScreen conecta el modo activo con
// TODAS las vistas por el mismo sitio, y que el engranaje funciona de verdad.
const UI_FILES = import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const DATA_FILES = import.meta.glob('/src/data/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

function readFile(path: string, files: Record<string, string> = UI_FILES): string {
  const content = files[path]
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

const CALENDAR_SCREEN_SRC = readFile('/src/ui/CalendarScreen.tsx')
const MENU_SETTINGS_SRC = readFile('/src/ui/MenuSettingsScreen.tsx')
const DATA_CALENDAR_SRC = readFile('/src/data/calendar.ts', DATA_FILES)

describe('H — tres modos mutuamente excluyentes, nunca checkboxes sueltos', () => {
  it('CalendarColorMode tiene exactamente tres valores', () => {
    expect(DATA_CALENDAR_SRC).toContain("export type CalendarColorMode = 'miembros' | 'categorias' | 'solo_categorias'")
  })

  it('la UI es un radiogroup de 3 tarjetas (role="radio"/"radiogroup"), una sola puede estar marcada a la vez — nunca checkboxes independientes', () => {
    const section = slice(MENU_SETTINGS_SRC, 'const CALENDAR_COLOR_MODE_OPTIONS', 'function CalendarCategoryRow(')
    expect(section).toContain("role=\"radiogroup\"")
    expect(section).toContain('role="radio"')
    expect(section).toContain('aria-checked={colorMode === opt.id}')
    expect([...section.matchAll(/id: '(miembros|solo_categorias|categorias)'/g)]).toHaveLength(3)
  })

  it('los tres textos son exactamente los recomendados por el usuario', () => {
    const section = slice(MENU_SETTINGS_SRC, 'const CALENDAR_COLOR_MODE_OPTIONS', 'function CalendarCategoryRow(')
    expect(section).toContain("title: 'Colores de personas'")
    expect(section).toContain('Los Eventos y Tareas usan siempre el color de la persona asignada.')
    expect(section).toContain("title: 'Colores de categorías'")
    expect(section).toContain('Si no tienen una categoría con color, se muestran en color neutro.')
    expect(section).toContain("title: 'Categorías + personas'")
    expect(section).toContain('Si no hay una categoría con color, usa el color de la persona.')
  })
})

describe('I/J — persistencia por usuario (profiles) y compatibilidad con la preferencia antigua', () => {
  it('se guarda/lee en profiles.calendar_color_mode, por usuario — mismo patrón que antes, nunca families/localStorage', () => {
    expect(DATA_CALENDAR_SRC).toContain(".from('profiles')")
    expect(DATA_CALENDAR_SRC).toContain("await supabase.from('profiles').update({ calendar_color_mode: mode }).eq('id', userResult.user.id)")
  })

  it('el valor histórico \'categorias\' se reutiliza TAL CUAL para el modo híbrido (nunca se reescribe ni se reinterpreta como "solo categorías") — por eso nadie que ya tuviera esto puesto cambia de aspecto', () => {
    const fn = slice(DATA_CALENDAR_SRC, 'export async function getCalendarPreferences', 'export async function updateCalendarColorMode')
    expect(fn).toContain("data.calendar_color_mode === 'categorias' ? 'categorias'")
    expect(fn).toContain("data.calendar_color_mode === 'solo_categorias' ? 'solo_categorias'")
    expect(fn).toContain("'miembros'")
  })

  it('el default para perfiles NUEVOS es el modo híbrido (migración 0185: profiles.calendar_color_mode default \'categorias\'), nunca "solo_categorias" — no afecta a ninguna fila ya existente', () => {
    expect(CALENDAR_SCREEN_SRC).toContain("colorMode: 'categorias',")
    expect(MENU_SETTINGS_SRC).toContain("useState<CalendarColorMode>('categorias')")
  })
})

describe('Regla exacta de resolución de color — eventColor, fuente única para toda vista', () => {
  const fn = slice(CALENDAR_SCREEN_SRC, 'function eventColor(ev: CalendarEvent', 'function hhmm(')

  it('acepta el modo como argumento explícito (ya no un categoryColorById opcional que se pasaba o no) — un único sitio decide la regla, nunca cada vista por su cuenta', () => {
    expect(fn).toContain(
      'function eventColor(ev: CalendarEvent, memberById: Map<string, FamilyMember>, colorMode: CalendarColorMode, categoryColorById: Map<string, string>): string {',
    )
  })

  it('color propio del evento manda siempre, en los tres modos', () => {
    expect(fn).toContain('if (ev.color) return ev.color')
  })

  it('"miembros": la categoría se ignora por completo (el if de categoría ni se evalúa)', () => {
    expect(fn).toContain("if (colorMode !== 'miembros' && ev.categoryId) {")
  })

  it('"solo_categorias": sin color de categoría aplicable, neutro directo — nunca cae en la persona (a diferencia del híbrido)', () => {
    expect(fn).toContain("if (colorMode === 'solo_categorias') return '#9ca3af'")
  })

  it('"categorias" (híbrido): si no hay color de categoría, sigue cayendo en la persona de siempre — el mismo fallback final para miembros Y para el híbrido', () => {
    expect(fn).toContain("return first?.color ?? '#9ca3af'")
  })
})

describe('K — el modo activo se aplica de forma consistente en TODAS las vistas internas, nunca una regla distinta en cada una', () => {
  it('buildEntriesForDate (Mes/Agenda/DayModal/Personal) resuelve con calendarPrefs.colorMode', () => {
    const fn = slice(CALENDAR_SCREEN_SRC, 'function buildEntriesForDate(dateStr: string): AgendaEntry[] {', 'function persistCalendarMenuLayout(')
    expect(fn).toContain('color: eventColor(ev, memberById, calendarPrefs.colorMode, categoryColorById),')
  })

  it('los puntitos de "Vista general" (eventDotColors) resuelven con el mismo calendarPrefs.colorMode', () => {
    expect(CALENDAR_SCREEN_SRC).toContain('eventDotColors(e, memberColorById, calendarPrefs.colorMode, categoryColorById)')
  })

  it('TimeGridView (Semana/3 días/Día) recibe el modo activo como prop, no un mapa ya filtrado a medias — y lo usa en sus dos sitios (bloques con hora y chips "todo el día")', () => {
    expect(CALENDAR_SCREEN_SRC).toContain('categoryColorById={categoryColorById}\n            colorMode={calendarPrefs.colorMode}')
    const fn = slice(CALENDAR_SCREEN_SRC, 'function TimeGridView({', 'function AgendaListView(')
    expect([...fn.matchAll(/eventColor\(ev, memberById, colorMode, categoryColorById\)/g)]).toHaveLength(2)
  })

  it('Familiar (EventCard) YA NO usa su propia regla aparte (antes: borderColor: ev.color ?? undefined, ignoraba categoría/miembro) — ahora resuelve con la misma eventColor()', () => {
    expect(CALENDAR_SCREEN_SRC).not.toContain('borderColor: ev.color ?? undefined')
    expect(CALENDAR_SCREEN_SRC).toContain('style={{ borderColor: color }}')
    const familyView = slice(CALENDAR_SCREEN_SRC, 'function FamilyDayView({', 'function PersonalView({')
    expect(familyView).toContain('color={eventColor(ev, memberById, colorMode, categoryColorById)}')
  })

  it('Externos sigue siendo una fuente de datos aparte (dotColorForFeed, nunca categoryColorById/colorMode) — no se ha tocado', () => {
    const fn = slice(CALENDAR_SCREEN_SRC, 'function dotColorForFeed(feedId: string): string {', '}')
    expect(fn).not.toContain('colorMode')
    expect(fn).not.toContain('categoryColorById')
  })

  it('ninguna vista sigue con el gating antiguo ("solo se pasa categoryColorById si colorMode === categorias") — la decisión vive SOLO dentro de eventColor/eventDotColors', () => {
    expect(CALENDAR_SCREEN_SRC).not.toMatch(/colorMode === 'categorias' \? categoryColorById : undefined/)
  })
})

describe('L — engranaje ⚙️ presente en los 4 formularios (alta y edición de Evento y de Tarea)', () => {
  it('CategoryDropdown muestra la etiqueta + el engranaje SIEMPRE (incluso con 0 categorías, para poder crear la primera desde ahí) — el selector en sí sigue oculto sin categorías', () => {
    const dropdown = slice(CALENDAR_SCREEN_SRC, 'function CategoryDropdown({', 'function ReminderPicker(')
    expect(dropdown).toContain('className="calendar-category-manage-btn"')
    expect(dropdown).toContain('onClick={onManageCategories}')
    expect(dropdown).toContain('aria-label="Gestionar categorías del calendario"')
    expect(dropdown).not.toContain('if (categories.length === 0) return null')
  })

  it('los tres formularios (AddEventForm, AddTaskForm, EditEventForm) reciben onManageCategories y se lo pasan a CategoryDropdown — mismo componente, nunca cuatro implementaciones', () => {
    expect([...CALENDAR_SCREEN_SRC.matchAll(/onManageCategories: \(\) => void/g)].length).toBeGreaterThanOrEqual(3)
    expect([...CALENDAR_SCREEN_SRC.matchAll(/onManageCategories=\{onManageCategories\}/g)].length).toBeGreaterThanOrEqual(3)
  })

  it('los 8 sitios donde se abre un formulario de Evento/Tarea (nuevo o editar, en cualquier vista) pasan onManageCategories hacia abajo', () => {
    expect([...CALENDAR_SCREEN_SRC.matchAll(/onManageCategories=\{\(\) => setManagingCategories\(true\)\}/g)]).toHaveLength(8)
  })
})

describe('M/N — ⚙️ abre la gestión de categorías SIN perder el formulario (nunca navega a Configuración, que desmontaría la pantalla)', () => {
  it('ManageCategoriesModal reutiliza CalendarCategoriesSection tal cual (exportado de MenuSettingsScreen) — nunca una segunda implementación de la gestión de categorías', () => {
    expect(CALENDAR_SCREEN_SRC).toContain("import { CalendarCategoriesSection } from '@/ui/MenuSettingsScreen'")
    expect(CALENDAR_SCREEN_SRC).toContain('function ManageCategoriesModal({ onClose }: { onClose: () => void }) {')
    const modal = slice(CALENDAR_SCREEN_SRC, 'function ManageCategoriesModal({', '\n}\n')
    expect(modal).toContain('<CalendarCategoriesSection />')
  })

  it('exportado desde MenuSettingsScreen.tsx (export function, no una función privada del módulo)', () => {
    expect(MENU_SETTINGS_SRC).toContain('export function CalendarCategoriesSection() {')
  })

  it('se monta en un modal/portal propio de CalendarScreen, controlado por su PROPIO estado (managingCategories) — nunca desmonta ni toca el estado de ningún formulario abierto (addingEvent/addingTask/editingId)', () => {
    expect(CALENDAR_SCREEN_SRC).toContain('const [managingCategories, setManagingCategories] = useState(false)')
    expect(CALENDAR_SCREEN_SRC).toContain('{managingCategories &&')
    expect(CALENDAR_SCREEN_SRC).toContain('createPortal(\n          <ManageCategoriesModal')
    // Nunca una navegación de verdad (eso desmontaría CalendarScreen, perdiendo cualquier formulario abierto detrás).
    expect(CALENDAR_SCREEN_SRC).not.toContain('useNavigate')
    expect(CALENDAR_SCREEN_SRC).not.toContain("navigate('/menu-organizar'")
  })
})

describe('O — crear una categoría desde el engranaje y volver: aparece de inmediato en el selector, sin recargar la app', () => {
  it('reloadCategories es una recarga PROPIA y estrecha (solo listCalendarCategories + setCategories), nunca el reload() grande que pondría loading=true y desmontaría toda la pantalla (y con ella el formulario abierto)', () => {
    const fn = slice(CALENDAR_SCREEN_SRC, 'function reloadCategories() {', '\n  }')
    expect(fn).toContain('listCalendarCategories().then(setCategories)')
    expect(fn).not.toContain('setLoading')
  })

  it('al cerrar el modal de categorías, se llama a reloadCategories — el desplegable "Categoría (opcional)" ve la lista nueva al instante', () => {
    const closeHandler = slice(CALENDAR_SCREEN_SRC, 'managingCategories &&', 'document.body,\n        )}')
    expect(closeHandler).toContain('setManagingCategories(false)')
    expect(closeHandler).toContain('reloadCategories()')
  })
})

describe('P/Q/R — no regresión: selector de categoría, emoji, color/otro color/sin color, fallback neutro', () => {
  it('"Sin categoría" sigue siendo una opción explícita, siempre disponible', () => {
    const dropdown = slice(CALENDAR_SCREEN_SRC, 'function CategoryDropdown({', 'function ReminderPicker(')
    expect(dropdown).toContain('Sin categoría')
    expect(dropdown).toContain('onChange(null)')
  })

  it('el selector de emoji/color de categoría (otra fase) no se ha tocado: mismos componentes, misma firma', () => {
    expect(MENU_SETTINGS_SRC).toContain('function CalendarCategoryEmojiPicker({ value, onChange }: { value: string; onChange: (emoji: string) => void }) {')
    expect(MENU_SETTINGS_SRC).toContain('function CalendarCategoryColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {')
    expect(MENU_SETTINGS_SRC).toContain('Otro color')
    expect(MENU_SETTINGS_SRC).toContain('Sin color')
  })

  it('el fallback final sigue siendo el gris de siempre, en eventColor y en eventDotColors', () => {
    expect(CALENDAR_SCREEN_SRC).toContain("return first?.color ?? '#9ca3af'")
  })

  it('puntos, ubicación, adjuntos y nota del formulario de Evento/Tarea no se han tocado en este retoque (siguen fuera de CategoryDropdown, como antes)', () => {
    expect(CALENDAR_SCREEN_SRC).toContain('Puntos al marcarlo')
    expect(CALENDAR_SCREEN_SRC).toContain('<EventExtrasFields')
  })
})
