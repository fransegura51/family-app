import { describe, expect, it } from 'vitest'
import { parseCalendarEntry } from '@/domain/calendarVoiceParser'

// Cada caso de aquí es un bug real ya corregido (ver comentarios del
// propio parser) o una forma de hablar que la familia usa de verdad: si
// alguno vuelve a fallar, Pepa apuntaría la cita mal y en silencio.
const today = new Date(2026, 8, 11) // viernes 11 sept 2026

describe('parseCalendarEntry — frase completa', () => {
  it('fecha, título, hora, persona y recordatorio', () => {
    const p = parseCalendarEntry('el 25 de septiembre, cita con el dentista a las 19 horas para Eric, aviso un día antes', today)
    expect(p).toEqual({
      title: 'Cita con el dentista',
      date: '2026-09-25',
      time: '19:00',
      endTime: null,
      memberHint: 'eric',
      reminders: [{ minutesBefore: 1440, anchor: 'start' }],
      dateExplicit: true,
      recurrenceRule: null,
    })
  })
})

describe('fechas', () => {
  it('"veinte y seis" dictado separado vale igual que "veintiséis"', () => {
    expect(parseCalendarEntry('veinte y seis de septiembre cita dentista', today).date).toBe('2026-09-26')
    expect(parseCalendarEntry('veintiséis de septiembre cita dentista', today).date).toBe('2026-09-26')
  })
  it('"día 27" sin "el" delante no deja "dia" colado en el título', () => {
    const p = parseCalendarEntry('día 27 de septiembre, revisión', today)
    expect(p.date).toBe('2026-09-27')
    expect(p.title).toBe('Revision')
  })
  it('una fecha ya pasada este año se entiende como del año que viene', () => {
    expect(parseCalendarEntry('el 3 de enero comida', today).date).toBe('2027-01-03')
  })
  it('un día que no existe se normaliza en vez de reventar ("31 de abril" → 1 de mayo)', () => {
    expect(parseCalendarEntry('31 de abril fiesta', today).date).toBe('2027-05-01')
  })
  it('sin fecha: hoy, y dateExplicit=false para que la app pregunte', () => {
    const p = parseCalendarEntry('cita dentista', today)
    expect(p.date).toBe('2026-09-11')
    expect(p.dateExplicit).toBe(false)
  })
})

describe('horas', () => {
  it('"a las 7 de la tarde" → 19:00 y el "de la tarde" no se queda en el título', () => {
    const p = parseCalendarEntry('cita a las 7 de la tarde', today)
    expect(p.time).toBe('19:00')
    expect(p.title).toBe('Cita')
  })
  it('"19 horas" sin "a las" también vale', () => {
    expect(parseCalendarEntry('cita 19 horas', today).time).toBe('19:00')
  })
  it('minutos: "7:30 horas" y "8 y media"', () => {
    expect(parseCalendarEntry('cita a las 7:30 horas', today).time).toBe('07:30')
    expect(parseCalendarEntry('cita a las 8 y media', today).time).toBe('08:30')
  })
  it('"de la mañana" no suma 12', () => {
    expect(parseCalendarEntry('cita a las 7 de la mañana', today).time).toBe('07:00')
  })
  it('hora de fin con "termina"', () => {
    const p = parseCalendarEntry('entrenamiento fútbol a las 18 horas, termina a las 19 horas', today)
    expect(p.time).toBe('18:00')
    expect(p.endTime).toBe('19:00')
    expect(p.title).toBe('Entrenamiento futbol')
  })
})

describe('recordatorios', () => {
  it('"aviso una hora antes" no se confunde con la hora de la cita', () => {
    const p = parseCalendarEntry('cita a las 7 de la tarde aviso una hora antes', today)
    expect(p.time).toBe('19:00')
    expect(p.reminders).toEqual([{ minutesBefore: 60, anchor: 'start' }])
  })
  it('"media hora antes" = 30 min; varios recordatorios con ancla inicio/fin', () => {
    const p = parseCalendarEntry('recogida a las 17 horas, avisa una hora antes de que empiece y media hora antes de que termine', today)
    expect(p.time).toBe('17:00')
    expect(p.reminders).toEqual([
      { minutesBefore: 60, anchor: 'start' },
      { minutesBefore: 30, anchor: 'end' },
    ])
  })
  it('sin decir nada: una hora antes por defecto', () => {
    expect(parseCalendarEntry('cita dentista', today).reminders).toEqual([{ minutesBefore: 60, anchor: 'start' }])
  })
})

describe('repetición', () => {
  it('"todos los martes y jueves" → regla semanal con esos días', () => {
    const p = parseCalendarEntry('todos los martes y jueves natación a las 17 horas', today)
    expect(p.recurrenceRule).toBe('FREQ=WEEKLY;BYDAY=TU,TH')
    expect(p.title).toBe('Natacion')
  })
  it('"cada viernes"', () => {
    const p = parseCalendarEntry('cada viernes cine', today)
    expect(p.recurrenceRule).toBe('FREQ=WEEKLY;BYDAY=FR')
    expect(p.title).toBe('Cine')
  })
})

describe('limpieza del título', () => {
  it('"ponme en el calendario que tengo el..." no se cuela en el título', () => {
    const p = parseCalendarEntry('ponme en el calendario que tengo el cumpleaños de mi mujer el 20 de octubre', today)
    expect(p.title).toBe('Cumpleanos de mi mujer')
    expect(p.date).toBe('2026-10-20')
  })
  it('regla mnemotécnica "Calendario 29 de septiembre. Cita dentista"', () => {
    const p = parseCalendarEntry('Calendario 29 de septiembre. Cita dentista', today)
    expect(p.title).toBe('Cita dentista')
    expect(p.date).toBe('2026-09-29')
  })
  it('si no queda nada de título, "Cita"', () => {
    expect(parseCalendarEntry('el 25 de septiembre a las 10 horas', today).title).toBe('Cita')
  })
})
