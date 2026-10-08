import { describe, expect, it } from 'vitest'

// Revisión Calendario (instrucción explícita de la usuaria) — Vista Semana: la cuadrícula horaria de 7
// columnas no funcionaba bien en móvil (citas demasiado estrechas, texto roto). Se sustituye por
// WeekListView: una lista vertical de 7 días plegables/desplegables, cada uno con cabecera (día+fecha),
// resumen del número de citas/tareas, y un grupo de colores por cita (participantes compartidos juntos,
// citas distintas separadas con "/"). Al desplegar, EXACTAMENTE el mismo formato de tarjeta que el
// detalle inferior de Mes (DayEntriesBody/AgendaRow) — nunca una copia de "3 días", que conserva su
// propia cuadrícula horaria (TimeGridView) sin tocar.
const SRC = (import.meta.glob('/src/ui/CalendarScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/CalendarScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const WEEK = slice(SRC, 'function WeekListView({', '\nfunction AgendaListView(')

describe('Semana ya NO comparte TimeGridView con 3 días/Día — componente propio', () => {
  it('el dispatch de la pantalla usa WeekListView para "Semana", nunca TimeGridView', () => {
    expect(SRC).toContain("view === 'Semana' ? (\n        <WeekListView")
  })
  it('TimeGridView ya no recibe swipeHandlers de weekSwipe (solo 3 días/Día)', () => {
    expect(SRC).toContain("swipeHandlers={view === '3 días' ? threeDaySwipe : daySwipe}")
    expect(SRC).not.toContain("view === 'Semana' ? weekSwipe")
  })
})

describe('WeekListView — 7 días plegables, nunca los 7 abiertos a la fuerza', () => {
  it('prioriza el día seleccionado si cae en esta semana; si no, hoy; si ninguno, no fuerza ninguno', () => {
    expect(WEEK).toContain(
      'const defaultOpenDate = days.some((d) => d.dateStr === selectedDate) ? selectedDate : days.some((d) => d.dateStr === todayStr) ? todayStr : null',
    )
  })
  it('cada día se pliega/despliega de forma independiente (estado propio por fecha, nunca un único booleano para los 7)', () => {
    expect(WEEK).toContain('const [toggled, setToggled] = useState<Record<string, boolean>>({})')
    expect(WEEK).toContain('function isOpen(dateStr: string): boolean {')
  })
  it('tiene navegación de semana completa (anterior/siguiente), reutilizando el cambio de fecha de siempre (±7 días)', () => {
    expect(WEEK).toContain('Semana anterior')
    expect(WEEK).toContain('Semana siguiente')
    expect(SRC).toContain('onNavigateWeek={(deltaWeeks) => changeSelectedDate(deltaWeeks * 7)}')
  })
})

describe('WeekListView — al desplegar, MISMO formato de tarjeta que el detalle inferior de Mes', () => {
  it('reutiliza DayEntriesBody/AgendaRow tal cual (el mismo motor de franjas multicolor, edición, completar, borrar) — nunca una lista nueva', () => {
    expect(WEEK).toContain('<DayEntriesBody')
    expect(WEEK).toContain('entries={entries}')
  })
  it('cada día construye sus propias entradas con buildEntriesForDate(dateStr) — nunca puede desbordar hacia otro día', () => {
    expect(WEEK).toContain('const entries = buildEntriesForDate(d.dateStr)')
  })
})

describe('WeekDayColorGroups — resumen informativo, NUNCA un botón de completar', () => {
  const GROUPS = slice(SRC, 'function WeekDayColorGroups({', '\n}\n\n// Vista "Agenda"')

  it('nunca usa la clase/el icono del círculo de completar (completion-circle) — solo puntos de color simples', () => {
    expect(GROUPS).not.toContain('completion-circle')
    expect(GROUPS).not.toContain('CompletionCircle')
  })

  it('cada cita es su propio grupo de colores (sus participantes juntos)', () => {
    expect(GROUPS).toContain('className="week-day-color-group"')
    expect(GROUPS).toContain('e.colors.slice(0, 4).map')
  })

  it('entre citas distintas hay un separador visible ("/"), para no sugerir que comparten los mismos participantes', () => {
    expect(GROUPS).toContain("{i > 0 && <span className=\"week-day-color-sep\">/</span>}")
  })

  it('con 0 citas no pinta nada', () => {
    expect(GROUPS).toContain('if (entries.length === 0) return null')
  })
})

describe('"3 días" y "Día" conservan su propia cuadrícula horaria (TimeGridView) — nunca una copia de Semana', () => {
  it('TimeGridView sigue existiendo, con sus bloques de hora, chips de todo el día y franja de Tareas', () => {
    const grid = slice(SRC, 'function TimeGridView({', '\nfunction WeekListView(')
    expect(grid).toContain('time-grid-block')
    expect(grid).toContain('time-grid-allday-chip')
    expect(grid).toContain('time-grid-tasks-row')
  })
})
