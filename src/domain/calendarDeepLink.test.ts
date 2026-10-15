// INC-14: enlace profundo a Calendario (evento o tarea de una fecha, y bloque de tareas del día).
import { describe, expect, it } from 'vitest'
import { expandOccurrences } from './calendar'
import { addDaysIso, CALENDAR_LINK_PARAMS, calendarEventLink, calendarTasksLink, isIsoDate, parseCalendarDeepLink, pickOccurrenceDate } from './calendarDeepLink'
import { pushEntryQuery } from './pushEntryRoute'
import { searchWithoutParams } from './notificationDeepLink'

const EV = '5f0c1e52-7a63-4d1b-8c0e-9b3a2d4f6e78'
const AV = '3b6f7a52-0d4e-4c1a-9f0e-2a7c5d8e9b10'

describe('fechas', () => {
  it('solo acepta fechas reales AAAA-MM-DD', () => {
    expect(isIsoDate('2026-10-20')).toBe(true)
    expect(isIsoDate('2028-02-29')).toBe(true)
    for (const bad of ['2026-02-30', '2026-13-01', '2026-00-10', '26-10-20', '2026-10-2', '2026/10/20', '1999-12-31', '2101-01-01', "2026-10-20'; --", '', null, 5]) {
      expect(isIsoDate(bad), String(bad)).toBe(false)
    }
  })

  it('suma días sin errores de husos ni de cambio de hora', () => {
    expect(addDaysIso('2026-10-24', 2)).toBe('2026-10-26') // pasa por el cambio de hora de otoño
    expect(addDaysIso('2026-03-28', 2)).toBe('2026-03-30') // y por el de primavera
    expect(addDaysIso('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDaysIso('2026-10-20', 400)).toBe('2027-11-24')
  })
})

describe('interpretar la dirección', () => {
  it('evento + fecha', () => {
    expect(parseCalendarDeepLink(`?evento=${EV}&fecha=2026-10-20`)).toEqual({ eventId: EV, date: '2026-10-20', focusTasks: false, invalidEvent: false })
  })

  it('resumen diario: fecha + tareas', () => {
    expect(parseCalendarDeepLink('?fecha=2026-10-20&tareas=1')).toEqual({ eventId: null, date: '2026-10-20', focusTasks: true, invalidEvent: false })
  })

  it('sin nada de esto, Calendario se abre como siempre (null)', () => {
    expect(parseCalendarDeepLink('')).toBeNull()
    expect(parseCalendarDeepLink('?otro=1&nuevos=1')).toBeNull()
  })

  it('un uuid o una fecha mal formados se ignoran (nunca se usan); el evento mal formado se marca para avisar con amabilidad', () => {
    const l1 = parseCalendarDeepLink(`?evento=no-es-uuid&fecha=2026-10-20`)
    expect(l1).toEqual({ eventId: null, date: '2026-10-20', focusTasks: false, invalidEvent: true })
    const l2 = parseCalendarDeepLink(`?evento=${EV}&fecha=2026-02-30`)
    expect(l2).toEqual({ eventId: EV, date: null, focusTasks: false, invalidEvent: false })
    const l3 = parseCalendarDeepLink(`?evento=${encodeURIComponent("1' or '1'='1")}`)
    expect(l3?.eventId).toBeNull()
    expect(parseCalendarDeepLink('?tareas=2')?.focusTasks).toBe(false)
  })

  it('el uuid en mayúsculas se normaliza', () => {
    expect(parseCalendarDeepLink(`?evento=${EV.toUpperCase()}&fecha=2026-10-20`)?.eventId).toBe(EV)
  })
})

describe('construir las direcciones de los avisos', () => {
  it('son las mismas que escribe el servidor', () => {
    expect(calendarEventLink(EV, '2026-10-20')).toBe(`/calendario?evento=${EV}&fecha=2026-10-20`)
    expect(calendarTasksLink('2026-10-20')).toBe('/calendario?fecha=2026-10-20&tareas=1')
  })

  it('con datos que no valen no se construye nada', () => {
    expect(calendarEventLink('x', '2026-10-20')).toBeNull()
    expect(calendarEventLink(EV, '2026-99-99')).toBeNull()
    expect(calendarTasksLink('mañana')).toBeNull()
  })

  it('el enlace sobrevive a la entrada desde un aviso del móvil (pushEntryRoute) y se interpreta igual', () => {
    const entry = pushEntryQuery({ url: calendarEventLink(EV, '2026-10-20'), n: AV })
    expect(entry).toBe(`/calendario?evento=${EV}~and~fecha=2026-10-20~and~aviso=${AV}`)
    // Lo que queda en la dirección tras descodificar «~and~» y quitar «aviso» (lo hace NotificationOpenMarker).
    const afterIndex = `?${entry.split('?')[1].replace(/~and~/g, '&')}`
    const afterMarker = searchWithoutParams(afterIndex, ['aviso'])
    expect(parseCalendarDeepLink(afterMarker)).toEqual({ eventId: EV, date: '2026-10-20', focusTasks: false, invalidEvent: false })
    // Y Calendario, al usarlo, lo limpia por completo.
    expect(searchWithoutParams(afterMarker, CALENDAR_LINK_PARAMS)).toBe('')
  })

  it('Calendario solo quita sus parámetros y deja los demás', () => {
    expect(searchWithoutParams(`?evento=${EV}&fecha=2026-10-20&tareas=1&otro=2`, CALENDAR_LINK_PARAMS)).toBe('?otro=2')
  })
})

describe('qué ocurrencia se abre', () => {
  it('la pedida si existe; si no, la primera posterior; si no hay, la última anterior', () => {
    expect(pickOccurrenceDate(['2026-10-13', '2026-10-20', '2026-10-27'], '2026-10-20')).toBe('2026-10-20')
    expect(pickOccurrenceDate(['2026-10-13', '2026-10-20', '2026-10-27'], '2026-10-21')).toBe('2026-10-27')
    expect(pickOccurrenceDate(['2026-10-13', '2026-10-06'], '2026-10-21')).toBe('2026-10-13')
    expect(pickOccurrenceDate([], '2026-10-21')).toBeNull()
  })

  it('con una serie semanal real: una tarea asignada hace tiempo se abre en su próxima ocurrencia', () => {
    const serie = { startAt: '2026-08-31T10:00:00.000Z', recurrenceRule: 'FREQ=WEEKLY' } // lunes
    const wanted = '2026-10-15' // jueves
    const after = expandOccurrences(serie, wanted, addDaysIso(wanted, 400))
    expect(pickOccurrenceDate(after, wanted)).toBe('2026-10-19')
    // La ocurrencia concreta del aviso de un recordatorio (un lunes) se respeta.
    const concreta = expandOccurrences(serie, '2026-10-12', addDaysIso('2026-10-12', 400))
    expect(pickOccurrenceDate(concreta, '2026-10-12')).toBe('2026-10-12')
  })
})
