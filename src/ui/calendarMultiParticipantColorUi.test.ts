import { describe, expect, it } from 'vitest'

// Fase 5 (plan de pendientes) sentó la base: eventColors()/eventDotColors() resuelven un color POR CADA
// persona asignada (nunca solo la primera). Al principio esa lista extra se representaba con un puntito
// junto al título en todas las vistas (EventColorDots).
//
// Revisión Calendario (tanda posterior, instrucción explícita de la usuaria) sustituye esos puntitos por
// la franja/barra/bloque MULTICOLOR allí donde ya existe un acento de color propio: cada participante
// ocupa su proporción de esa misma franja/barra, en vez de un punto aparte ("no mostrar puntos de colores
// redundantes cuando ya se representan en la franja"). Ver ColorSegments. La única vista que SIGUE usando
// el puntito es Vista familiar (EventCard no tiene una franja/bloque propio que segmentar — queda fuera de
// esta tanda a propósito, "no introduzcas cambios visuales ajenos a esta revisión").
//
// Este archivo protege: que ColorSegments llega a los 5 sitios con franja/barra/bloque propio, que el
// caso de una sola persona queda pixel a pixel igual que antes (sin fondo multicolor, sin cambio visual),
// y que Vista familiar conserva su puntito de siempre sin tocarlo.
const SRC = (import.meta.glob('/src/ui/CalendarScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/CalendarScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('EventColorDots — se conserva tal cual, pero ya SOLO para Vista familiar (sin franja/bloque propio que segmentar)', () => {
  it('no pinta nada con 0 o 1 color (el caso de siempre, sin ningún cambio visual)', () => {
    const fn = slice(SRC, 'function EventColorDots({', '\nfunction ColorSegments(')
    expect(fn).toContain('if (colors.length <= 1) return null')
  })

  it('reutiliza clases propias (event-color-dots/event-color-dot)', () => {
    const fn = slice(SRC, 'function EventColorDots({', '\nfunction ColorSegments(')
    expect(fn).toContain('className="event-color-dots"')
    expect(fn).toContain('className="event-color-dot"')
  })

  it('se usa UNA sola vez en todo el archivo — Vista familiar (EventCard)', () => {
    expect([...SRC.matchAll(/<EventColorDots colors=\{/g)]).toHaveLength(1)
    expect(SRC).toContain('<EventColorDots colors={colors} />')
  })
})

describe('ColorSegments — sustituye al puntito allí donde ya hay una franja/barra/bloque de acento propio', () => {
  it('no pinta nada con 0 o 1 color (mismo criterio que EventColorDots)', () => {
    const fn = slice(SRC, 'function ColorSegments({', '\n}\n')
    expect(fn).toContain('if (colors.length <= 1) return null')
  })

  it('cada color ocupa un segmento igual, en la dirección que indique quien llama (columna=franja estrecha, fila=barra ancha)', () => {
    const fn = slice(SRC, 'function ColorSegments({', '\n}\n')
    expect(fn).toContain('className="color-segments"')
    expect(fn).toContain("style={{ flexDirection: direction }}")
    expect(fn).toContain('className="color-segment"')
  })

  it('se usa en los 5 sitios con franja/barra/bloque propio (AgendaRow, Mes, chip de todo el día, chip de Tareas, bloque con hora)', () => {
    expect([...SRC.matchAll(/<ColorSegments colors=\{/g)]).toHaveLength(5)
  })
})

describe('eventColors — un color POR CADA persona asignada, nunca solo la primera', () => {
  const fn = slice(SRC, 'function eventColors(ev: CalendarEvent', 'function shouldStrikethroughEntry(')

  it('ya no existe ninguna variante "eventColor" (singular) — una sola función de color en todo el archivo', () => {
    expect(SRC).not.toMatch(/\beventColor\(/)
    expect(SRC).not.toMatch(/function eventColor\(/)
  })

  it('con varios miembros, devuelve un color por cada uno (nunca solo event.memberIds[0])', () => {
    expect(fn).toContain('const colors = ev.memberIds.map((id) => memberById.get(id)?.color).filter((c): c is string => !!c)')
    expect(fn).not.toContain('memberIds[0]')
  })
})

describe('effectiveEntryColors — "Tarea completada" sustituye a TODOS los colores, nunca se mezcla con los segmentos', () => {
  it('con doneColor fijado, colapsa a un solo color (nunca deja segmentos de personas en una tarea ya hecha)', () => {
    const fn = slice(SRC, 'function effectiveEntryColors(', '\n}\n')
    expect(fn).toContain("if (kind === 'task' && done && taskCompletion.doneColor) return [taskCompletion.doneColor]")
  })
})

describe('Cableado en las 5 franjas/barras/bloques — con un solo color, cero cambio frente a lo de siempre', () => {
  it('Mes (barritas): con un solo color sigue siendo background: entry.color tal cual; con varios, ColorSegments cubre la barra entera por encima del título', () => {
    const bars = slice(SRC, 'className="month-grid-event-bar"', '</span>\n                    ))}')
    expect(bars).toContain('style={{ background: entry.color, color: readableTextColor(entry.color) }}')
    expect(bars).toContain('<ColorSegments colors={entry.colors} direction="row" />')
    expect(bars).toContain('className="month-grid-event-bar-title"')
    const segIdx = bars.indexOf('<ColorSegments')
    const titleIdx = bars.indexOf('month-grid-event-bar-title')
    expect(segIdx).toBeGreaterThan(-1)
    expect(titleIdx).toBeGreaterThan(segIdx)
  })

  it('Agenda/Mes-detalle/Personal (AgendaRow): la franja (.agenda-stripe) solo fija background inline con un color; con varios, ColorSegments la cubre y el título ya no lleva puntito', () => {
    expect(SRC).toContain('<div className="agenda-stripe" style={entry.colors.length <= 1 ? { background: entry.color } : undefined}>')
    expect(SRC).toContain('<ColorSegments colors={entry.colors} direction="column" />')
    const title = slice(SRC, 'className="agenda-row-title"', '</span>')
    expect(title).not.toContain('EventColorDots')
  })

  it('Semana/3 días/Día — bloques con hora (time-grid-block): con un solo color sigue siendo background: b.color; con varios, ColorSegments cubre el bloque y el título ya no lleva puntito', () => {
    expect(SRC).toContain('background: b.color,')
    const block = slice(SRC, 'className="time-grid-block"', '</button>')
    expect(block).toContain('<ColorSegments colors={b.colors} direction="row" />')
    expect(block).toContain('className="time-grid-block-title"')
    expect(block).not.toContain('EventColorDots')
  })

  it('Semana/3 días/Día — chips de todo el día (time-grid-allday-chip): mismo patrón, título ya no lleva puntito', () => {
    const chip = slice(SRC, 'className="time-grid-allday-chip"', '</span>')
    expect(chip).toContain('<ColorSegments colors={c.colors} direction="row" />')
    expect(chip).toContain('className="time-grid-chip-title"')
    expect(chip).not.toContain('EventColorDots')
  })

  it('Semana/3 días/Día — franja de Tareas: el chip del círculo de completar (.completion-circle-chip) segmenta cuando hay varios, el título ya no lleva puntito', () => {
    expect(SRC).toContain('<span className="completion-circle-chip" style={t.colors.length <= 1 ? { background: t.color } : undefined}>')
    expect(SRC).toContain('<ColorSegments colors={t.colors} direction="column" />')
    const title = slice(SRC, "className={'time-grid-task-title'", '</span>')
    expect(title).not.toContain('EventColorDots')
  })

  it('Vista familiar (EventCard) queda FUERA de esta tanda a propósito: sigue con el borde de un solo color (colors[0]) y su puntito de siempre, sin franja que segmentar', () => {
    expect(SRC).toContain('<div className="card event-card family-event-card" style={{ borderColor: color }}>')
    const card = slice(SRC, 'function EventCard({', '\n}\n')
    expect(card).toContain('colors,')
    expect(card).toContain('<EventColorDots colors={colors} />')
  })
})

describe('Externos y cumpleaños — una sola fuente de color, nunca "varias personas" (colors siempre de longitud 1)', () => {
  it('un evento externo o un cumpleaños arman colors como array de un solo elemento, igual que su color de siempre', () => {
    expect(SRC).toContain("blocks.push({ key: `ext-${ev.id}`, title: ev.title, color, colors: [color], startMin, endMin, dateStr, eventId: null, done: false })")
    expect(SRC).toContain("chips.push({ key: `ext-${ev.id}`, title: ev.title, color: '#6b7280', colors: ['#6b7280'] })")
    expect(SRC).toContain("chips.push({ key: `bday-${b.name}`, title: `🎂 ${b.name}`, color: b.color, colors: [b.color] })")
  })
})
