import { describe, expect, it } from 'vitest'

// Revisión Calendario (instrucción explícita de la usuaria) — Vista Personal: la fecha del encabezado
// pasa a ser pulsable y abre un selector de fecha en ventana flotante, para saltar directamente a
// cualquier día sin pulsar N veces las flechas anterior/siguiente (que se conservan tal cual). Se
// reutiliza el MISMO componente (DateJumpControl) en los demás encabezados de día equivalentes
// (Vista familiar y DayModal — Mes/3 días/Día), sin modificar su propio título/clase existente.
const SRC = (import.meta.glob('/src/ui/CalendarScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/CalendarScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const CONTROL = slice(SRC, 'function DateJumpControl({', '\nfunction DayModal(')

describe('DateJumpControl — selector de fecha flotante, un solo componente reutilizado', () => {
  it('abre/cierra con un botón propio, nunca sustituye las flechas anterior/siguiente (quien llama las sigue poniendo aparte)', () => {
    expect(CONTROL).toContain('className="date-jump-trigger"')
    expect(CONTROL).toContain('const [open, setOpen] = useState(false)')
  })
  it('usa un <input type="date"> nativo, precargado con la fecha actual, y salta en cuanto se elige una', () => {
    expect(CONTROL).toContain('type="date"')
    expect(CONTROL).toContain('defaultValue={dateStr}')
    expect(CONTROL).toContain('onJump(e.target.value)')
  })
  it('permite cancelar sin saltar de fecha', () => {
    expect(CONTROL).toContain('Cancelar')
  })
  it('recibe el título ya construido por quien llama (children) — nunca reimplementa el formato de fecha ni la clase del título', () => {
    expect(CONTROL).toContain('children: ReactNode')
    expect(CONTROL).toContain('{children}')
  })
})

describe('DateJumpControl — reutilizado tal cual en los 3 encabezados de día equivalentes, sin tocar su propio título', () => {
  it('Personal: envuelve el <strong> de siempre, mismo formato de fecha de siempre', () => {
    const personal = slice(SRC, 'function PersonalView({', '\ninterface TimeGridBlock {')
    expect(personal).toContain(
      "<DateJumpControl dateStr={selectedDate} onJump={onJumpToDate}>\n          <strong>{new Date(selectedDate + 'T00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>\n        </DateJumpControl>",
    )
  })
  it('Vista familiar: envuelve el <strong> de siempre, dentro del mismo .month-nav sin gesto de deslizar (sin tocar esa decisión)', () => {
    const family = slice(SRC, 'function FamilyDayView({', '\nfunction EventCard({')
    expect(family).toContain('<DateJumpControl dateStr={selectedDate} onJump={onJumpToDate}>')
  })
  it('DayModal (Mes/3 días/Día): envuelve el <h2 className="section-title"> de siempre, sin cambiar su clase', () => {
    const modal = slice(SRC, 'function DayModal({', '\nfunction DayEntriesBody(')
    expect(modal).toContain('<DateJumpControl dateStr={selectedDate} onJump={onJumpToDate}>')
    expect(modal).toContain('<h2 className="section-title" style={{ margin: 0 }}>')
  })
  it('las 5 llamadas (3x DayModal + FamilyDayView + PersonalView) pasan onJumpToDate={setSelectedDate} — mismo estado de selección de siempre, ningún estado paralelo', () => {
    expect([...SRC.matchAll(/onJumpToDate=\{setSelectedDate\}/g)]).toHaveLength(5)
  })
})
