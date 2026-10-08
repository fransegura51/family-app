import { describe, expect, it } from 'vitest'

// Fase 5 (plan de pendientes) — Calendario: "un punto por persona en todas las vistas" (decisión
// explícita de la usuaria, entre dejarlo como estaba y llevar a todas partes el mismo tratamiento que ya
// usaba la Vista general/eventDotColors). Antes, fuera de esa vista, TODO lo demás (Mes, Agenda,
// Semana/Día, chips de todo el día, Tareas, Vista familiar) usaba eventColor() — solo la PRIMERA persona
// asignada. Ahora eventColors() (plural) resuelve un color por cada persona, y EventColorDots añade un
// puntito extra junto al título SOLO cuando hay más de uno — con una sola persona nada cambia en
// ninguna vista. Este archivo protege ambas cosas: que el cableado llega a los 6 sitios, y que el caso
// de una sola persona queda pixel a pixel igual que antes.
const SRC = (import.meta.glob('/src/ui/CalendarScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/CalendarScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('EventColorDots — el componente del puntito, nunca una implementación aparte por vista', () => {
  it('no pinta nada con 0 o 1 color (el caso de siempre, sin ningún cambio visual)', () => {
    const fn = slice(SRC, 'function EventColorDots({', '\nfunction ')
    expect(fn).toContain('if (colors.length <= 1) return null')
  })

  it('reutiliza clases propias (event-color-dots/event-color-dot), nunca las de la cuadrícula del mes (contexto distinto, ver styles.css)', () => {
    const fn = slice(SRC, 'function EventColorDots({', '\nfunction ')
    expect(fn).toContain('className="event-color-dots"')
    expect(fn).toContain('className="event-color-dot"')
  })

  it('se usa UNA sola vez por sitio en cada una de las 6 vistas (nunca una copia/pega de la lógica)', () => {
    expect([...SRC.matchAll(/<EventColorDots colors=\{/g)]).toHaveLength(6)
  })
})

describe('eventColors — un color POR CADA persona asignada, nunca solo la primera (bug ya corregido en eventDotColors, ahora en el resto de vistas)', () => {
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

describe('effectiveEntryColors — "Tarea completada" sustituye a TODOS los colores, nunca se mezcla con los puntitos', () => {
  it('con doneColor fijado, colapsa a un solo color (nunca deja puntitos de personas en una tarea ya hecha)', () => {
    const fn = slice(SRC, 'function effectiveEntryColors(', '\n}\n')
    expect(fn).toContain("if (kind === 'task' && done && taskCompletion.doneColor) return [taskCompletion.doneColor]")
  })
})

describe('Cableado en las 6 vistas — mismo patrón en todas: colors[0] para el acento de siempre (sin cambios), colors completo solo para el puntito', () => {
  it('Mes (franjas): entry.colors además de entry.color, con el puntito ANTES del título (la ellipsis recorta el final, no el principio)', () => {
    const bars = slice(SRC, 'className="month-grid-event-bar"', '</span>\n                    ))}')
    expect(bars).toContain('<EventColorDots colors={entry.colors}')
    const dotsIdx = bars.indexOf('<EventColorDots')
    const titleIdx = bars.indexOf('{entry.title}')
    expect(dotsIdx).toBeGreaterThan(-1)
    expect(titleIdx).toBeGreaterThan(dotsIdx)
  })

  it('Agenda (AgendaRow): agenda-row-title lleva el puntito, la franja de acento (.agenda-stripe) sigue usando solo entry.color', () => {
    const row = slice(SRC, 'className="agenda-row-title"', '</span>')
    expect(row).toContain('<EventColorDots colors={entry.colors} />')
    expect(SRC).toContain('<div className="agenda-stripe" style={{ background: entry.color }}>')
  })

  it('Semana/Día — bloques con hora (time-grid-block): b.colors además de b.color', () => {
    expect(SRC).toContain('background: b.color,')
    const block = slice(SRC, 'className="time-grid-block"', '</button>')
    expect(block).toContain('<EventColorDots colors={b.colors} />')
  })

  it('Semana/Día — chips de todo el día (time-grid-allday-chip): c.colors además de c.color', () => {
    const chip = slice(SRC, 'className="time-grid-allday-chip"', '</span>')
    expect(chip).toContain('<EventColorDots colors={c.colors} />')
  })

  it('Semana/Día — franja de Tareas: t.colors en el título, el circulito de completar sigue usando solo t.color', () => {
    expect(SRC).toContain('<span className="completion-circle-chip" style={{ background: t.color }}>')
    const title = slice(SRC, "className={'time-grid-task-title'", '</span>')
    expect(title).toContain('<EventColorDots colors={t.colors} />')
  })

  it('Vista familiar (EventCard): colors llega como prop nueva, el borde sigue pintándose SOLO con color (colors[0])', () => {
    expect(SRC).toContain('<div className="card event-card" style={{ borderColor: color }}>')
    const card = slice(SRC, 'function EventCard({', '\n}\n')
    expect(card).toContain('colors,')
    expect(card).toContain('<EventColorDots colors={colors} />')
  })
})

describe('Externos y cumpleaños — una sola fuente de color, nunca "varias personas" (colors siempre de longitud 1)', () => {
  it('un evento externo o un cumpleaños arman colors como array de un solo elemento, igual que su color de siempre', () => {
    expect(SRC).toContain("blocks.push({ key: `ext-${ev.id}`, title: ev.title, color, colors: [color], startMin, endMin, dateStr })")
    expect(SRC).toContain("chips.push({ key: `ext-${ev.id}`, title: ev.title, color: '#6b7280', colors: ['#6b7280'] })")
    expect(SRC).toContain("chips.push({ key: `bday-${b.name}`, title: `🎂 ${b.name}`, color: b.color, colors: [b.color] })")
  })
})
