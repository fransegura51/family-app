import { describe, expect, it } from 'vitest'
import {
  expandOccurrences,
  occurrenceAt,
  isWeekend,
  normalizeEventTitleForCompare,
  titlesLikelyDuplicate,
  memberSetsEqual,
  memberSetsMayCoincide,
  intervalsOverlap,
  findScheduleWarnings,
  type ScheduleEvent,
} from '@/domain/calendar'

// Hora LOCAL a propósito (10:00): expandOccurrences lee la fecha en hora
// local (bug real: recortar el ISO UTC desplazaba un día). Así el test
// vale igual en Madrid que en el runner de CI (UTC).
function at(y: number, m1: number, d: number): string {
  return new Date(y, m1 - 1, d, 10, 0).toISOString()
}

describe('expandOccurrences', () => {
  it('sin repetición: solo su fecha, y solo si cae en el rango', () => {
    const ev = { startAt: at(2026, 9, 1), recurrenceRule: null }
    expect(expandOccurrences(ev, '2026-09-01', '2026-09-30')).toEqual(['2026-09-01'])
    expect(expandOccurrences(ev, '2026-09-02', '2026-09-30')).toEqual([])
  })

  it('DAILY: cada día del rango a partir del inicio', () => {
    const ev = { startAt: at(2026, 9, 1), recurrenceRule: 'FREQ=DAILY' }
    expect(expandOccurrences(ev, '2026-09-01', '2026-09-05')).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'])
    expect(expandOccurrences(ev, '2026-09-10', '2026-09-12')).toEqual(['2026-09-10', '2026-09-11', '2026-09-12'])
  })

  it('WEEKLY sin BYDAY: cada 7 días; con INTERVAL=2, cada 14', () => {
    const weekly = { startAt: at(2026, 9, 1), recurrenceRule: 'FREQ=WEEKLY' }
    expect(expandOccurrences(weekly, '2026-09-01', '2026-09-30')).toEqual(['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29'])
    const biweekly = { startAt: at(2026, 9, 1), recurrenceRule: 'FREQ=WEEKLY;INTERVAL=2' }
    expect(expandOccurrences(biweekly, '2026-09-01', '2026-09-30')).toEqual(['2026-09-01', '2026-09-15', '2026-09-29'])
  })

  it('WEEKLY;BYDAY laborables: cae en cada día marcado, nunca antes del inicio', () => {
    // 2026-09-01 es martes.
    const ev = { startAt: at(2026, 9, 1), recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' }
    expect(expandOccurrences(ev, '2026-09-01', '2026-09-06')).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'])
    // El lunes 31 de agosto es laborable pero anterior al inicio.
    expect(expandOccurrences(ev, '2026-08-31', '2026-09-02')).toEqual(['2026-09-01', '2026-09-02'])
  })

  it('MONTHLY y YEARLY', () => {
    const monthly = { startAt: at(2026, 1, 15), recurrenceRule: 'FREQ=MONTHLY' }
    expect(expandOccurrences(monthly, '2026-01-01', '2026-04-30')).toEqual(['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15'])
    const yearly = { startAt: at(2025, 3, 10), recurrenceRule: 'FREQ=YEARLY' }
    expect(expandOccurrences(yearly, '2026-01-01', '2027-12-31')).toEqual(['2026-03-10', '2027-03-10'])
  })

  it('UNTIL corta la serie; exceptionDates y festivos quitan días sueltos', () => {
    const until = { startAt: at(2026, 9, 1), recurrenceRule: 'FREQ=DAILY;UNTIL=2026-09-03' }
    expect(expandOccurrences(until, '2026-09-01', '2026-09-10')).toEqual(['2026-09-01', '2026-09-02', '2026-09-03'])

    const withException = { startAt: at(2026, 9, 1), recurrenceRule: 'FREQ=DAILY', exceptionDates: ['2026-09-02'] }
    expect(expandOccurrences(withException, '2026-09-01', '2026-09-03')).toEqual(['2026-09-01', '2026-09-03'])

    const skipHolidays = { startAt: at(2026, 9, 1), recurrenceRule: 'FREQ=DAILY;SKIPHOLIDAYS=1' }
    expect(expandOccurrences(skipHolidays, '2026-09-01', '2026-09-03', new Set(['2026-09-02']))).toEqual(['2026-09-01', '2026-09-03'])
    // Sin SKIPHOLIDAYS, los festivos no se tocan.
    expect(expandOccurrences({ ...skipHolidays, recurrenceRule: 'FREQ=DAILY' }, '2026-09-01', '2026-09-03', new Set(['2026-09-02']))).toHaveLength(3)
  })
})

describe('occurrenceAt', () => {
  it('recoloca la misma hora sobre otro día, conservando la duración', () => {
    const ev = { startAt: '2026-09-01T18:00:00.000Z', endAt: '2026-09-01T19:30:00.000Z', allDay: false }
    const occ = occurrenceAt(ev, '2026-09-15')
    expect(new Date(occ.startAt).toISOString()).toBe('2026-09-15T18:00:00.000Z')
    expect(new Date(occ.endAt!).toISOString()).toBe('2026-09-15T19:30:00.000Z')
  })

  it('sin endAt, dura 1 hora por defecto', () => {
    const ev = { startAt: '2026-09-01T10:00:00.000Z', endAt: null, allDay: false }
    const occ = occurrenceAt(ev, '2026-09-15')
    expect(new Date(occ.startAt).toISOString()).toBe('2026-09-15T10:00:00.000Z')
    expect(new Date(occ.endAt!).toISOString()).toBe('2026-09-15T11:00:00.000Z')
  })

  it('todo el día: solo la fecha, sin endAt', () => {
    const ev = { startAt: '2026-09-01T00:00:00.000Z', endAt: null, allDay: true }
    const occ = occurrenceAt(ev, '2026-09-20')
    expect(occ.endAt).toBeNull()
    expect(new Date(occ.startAt).getDate()).toBe(20)
  })
})

describe('normalizeEventTitleForCompare', () => {
  it('minúsculas, acentos, puntuación y artículos sueltos no cambian el resultado', () => {
    expect(normalizeEventTitleForCompare('Sacar la basura')).toBe('sacar basura')
    expect(normalizeEventTitleForCompare('sacar basura')).toBe('sacar basura')
    expect(normalizeEventTitleForCompare('Sacar la basura.')).toBe('sacar basura')
    expect(normalizeEventTitleForCompare('sacar LA basura')).toBe('sacar basura')
  })
})

describe('titlesLikelyDuplicate', () => {
  it('título idéntico', () => {
    expect(titlesLikelyDuplicate('Sacar la basura', 'Sacar la basura')).toBe(true)
  })

  it('diferencias de mayúsculas/acentos/puntuación/artículos: siguen siendo el mismo título', () => {
    expect(titlesLikelyDuplicate('Sacar la basura', 'sacar basura')).toBe(true)
    expect(titlesLikelyDuplicate('Sacar la basura', 'Sacar la basura.')).toBe(true)
    expect(titlesLikelyDuplicate('Sacar la basura', 'sacar LA basura')).toBe(true)
  })

  it('caso real: "Sacar basura" / "Saca basura" (distancia de edición 1)', () => {
    expect(titlesLikelyDuplicate('Sacar basura', 'Saca basura')).toBe(true)
  })

  it('título parecido pero semánticamente distinto: NO es un falso duplicado', () => {
    expect(titlesLikelyDuplicate('Dentista', 'Dentista Eric')).toBe(false)
    expect(titlesLikelyDuplicate('Cita dentista', 'Cita dentista Eric')).toBe(false)
  })
})

describe('memberSetsEqual / memberSetsMayCoincide', () => {
  it('toda la familia ([]) contra toda la familia: iguales y coinciden', () => {
    expect(memberSetsEqual([], [])).toBe(true)
    expect(memberSetsMayCoincide([], [])).toBe(true)
  })

  it('toda la familia contra un miembro concreto: NO son el mismo conjunto, pero sí coinciden', () => {
    expect(memberSetsEqual([], ['m-paco'])).toBe(false)
    expect(memberSetsMayCoincide([], ['m-paco'])).toBe(true)
  })

  it('el mismo miembro contra sí mismo: iguales y coinciden', () => {
    expect(memberSetsEqual(['m-paco'], ['m-paco'])).toBe(true)
    expect(memberSetsMayCoincide(['m-paco'], ['m-paco'])).toBe(true)
  })

  it('miembros distintos: ni iguales ni coinciden', () => {
    expect(memberSetsEqual(['m-eric'], ['m-paco'])).toBe(false)
    expect(memberSetsMayCoincide(['m-eric'], ['m-paco'])).toBe(false)
  })
})

describe('intervalsOverlap', () => {
  it('19:00–20:00 contra 19:30–20:30: solapan', () => {
    expect(intervalsOverlap('2026-09-23T19:00:00.000Z', '2026-09-23T20:00:00.000Z', '2026-09-23T19:30:00.000Z', '2026-09-23T20:30:00.000Z')).toBe(true)
  })

  it('19:00–20:00 contra 20:00–21:00: NO solapan (intervalo semiabierto)', () => {
    expect(intervalsOverlap('2026-09-23T19:00:00.000Z', '2026-09-23T20:00:00.000Z', '2026-09-23T20:00:00.000Z', '2026-09-23T21:00:00.000Z')).toBe(false)
  })
})

describe('findScheduleWarnings', () => {
  function existing(overrides: Partial<ScheduleEvent> = {}): ScheduleEvent {
    return {
      id: 'existing-1',
      title: 'Sacar basura',
      startAt: new Date(2026, 8, 23, 19, 0).toISOString(), // 2026-09-23, 19:00 hora local
      endAt: null,
      allDay: false,
      recurrenceRule: null,
      exceptionDates: [],
      memberIds: [],
      ...overrides,
    }
  }
  // Candidato base: mismo día/hora que `existing()`, toda la familia — se sobreescribe por caso.
  const CANDIDATE_BASE = { title: 'Sacar basura', date: '2026-09-23', time: '19:00', endTime: null, memberIds: [] as string[] }

  it('duplicado: título idéntico, misma fecha/hora/destinatarios', () => {
    const warnings = findScheduleWarnings(CANDIDATE_BASE, [existing()])
    expect(warnings).toEqual([{ kind: 'duplicate', event: existing() }])
  })

  it('duplicado: caso real "Sacar basura" (ya existía) / "Saca basura" (nuevo)', () => {
    const warnings = findScheduleWarnings({ ...CANDIDATE_BASE, title: 'Saca basura' }, [existing({ title: 'Sacar basura' })])
    expect(warnings).toEqual([{ kind: 'duplicate', event: existing() }])
  })

  it('NO duplicado: mismo título, diferente hora (y sin solape) — ni duplicado ni conflicto', () => {
    const warnings = findScheduleWarnings({ ...CANDIDATE_BASE, time: '09:00' }, [existing()])
    expect(warnings).toEqual([])
  })

  it('NO duplicado: mismo título, diferente día', () => {
    const warnings = findScheduleWarnings({ ...CANDIDATE_BASE, date: '2026-09-24' }, [existing()])
    expect(warnings).toEqual([])
  })

  it('NO falso duplicado: título parecido pero distinto ("Dentista" / "Dentista Eric") aunque coincidan fecha/hora/destinatarios', () => {
    const warnings = findScheduleWarnings({ ...CANDIDATE_BASE, title: 'Dentista' }, [existing({ title: 'Dentista Eric' })])
    // No es duplicado (título no coincide) — pero SÍ es la misma franja para los mismos destinatarios: conflicto.
    expect(warnings).toEqual([{ kind: 'conflict', event: existing({ title: 'Dentista Eric' }) }])
  })

  it('conflicto: toda la familia contra toda la familia, títulos distintos, misma hora', () => {
    const warnings = findScheduleWarnings({ ...CANDIDATE_BASE, title: 'Dentista' }, [existing({ title: 'Sacar basura' })])
    expect(warnings).toEqual([{ kind: 'conflict', event: existing({ title: 'Sacar basura' }) }])
  })

  it('conflicto: toda la familia contra un miembro concreto (Paco forma parte de toda la familia)', () => {
    const warnings = findScheduleWarnings({ ...CANDIDATE_BASE, title: 'Dentista', memberIds: ['m-paco'] }, [existing({ title: 'Sacar basura' })])
    expect(warnings).toEqual([{ kind: 'conflict', event: existing({ title: 'Sacar basura' }) }])
  })

  it('conflicto: el mismo miembro concreto contra sí mismo', () => {
    const warnings = findScheduleWarnings({ ...CANDIDATE_BASE, title: 'Dentista', memberIds: ['m-paco'] }, [
      existing({ title: 'Reunión', memberIds: ['m-paco'] }),
    ])
    expect(warnings).toEqual([{ kind: 'conflict', event: existing({ title: 'Reunión', memberIds: ['m-paco'] }) }])
  })

  it('NO conflicto: Eric contra Paco (destinatarios distintos, no se cruzan)', () => {
    const warnings = findScheduleWarnings({ ...CANDIDATE_BASE, title: 'Dentista', memberIds: ['m-eric'] }, [
      existing({ title: 'Reunión', memberIds: ['m-paco'] }),
    ])
    expect(warnings).toEqual([])
  })

  it('conflicto por solape real de intervalos: 19:00–20:00 contra 19:30–20:30', () => {
    const warnings = findScheduleWarnings(
      { ...CANDIDATE_BASE, title: 'Dentista', endTime: '20:00' },
      [existing({ title: 'Sacar basura', startAt: new Date(2026, 8, 23, 19, 30).toISOString(), endAt: new Date(2026, 8, 23, 20, 30).toISOString() })],
    )
    expect(warnings).toEqual([
      { kind: 'conflict', event: existing({ title: 'Sacar basura', startAt: new Date(2026, 8, 23, 19, 30).toISOString(), endAt: new Date(2026, 8, 23, 20, 30).toISOString() }) },
    ])
  })

  it('sin conflicto: 19:00–20:00 contra 20:00–21:00 (se tocan, no se solapan)', () => {
    const warnings = findScheduleWarnings(
      { ...CANDIDATE_BASE, title: 'Dentista', endTime: '20:00' },
      [existing({ title: 'Sacar basura', startAt: new Date(2026, 8, 23, 20, 0).toISOString(), endAt: new Date(2026, 8, 23, 21, 0).toISOString() })],
    )
    expect(warnings).toEqual([])
  })

  it('end_at null: duración efectiva de 1 hora (misma convención que occurrenceAt)', () => {
    // Existente a las 19:00 sin endAt (=> hasta las 20:00 efectivas); candidato a las 19:30, sin endTime.
    const warnings = findScheduleWarnings({ ...CANDIDATE_BASE, title: 'Dentista', time: '19:30' }, [existing({ title: 'Sacar basura', endAt: null })])
    expect(warnings).toEqual([{ kind: 'conflict', event: existing({ title: 'Sacar basura', endAt: null }) }])
  })

  it('recurrencia: un evento recurrente existente con ocurrencia en la fecha candidata se detecta', () => {
    // "Sacar la basura todos los martes a las 19:00" — 2026-09-22 es martes; la serie empezó ese día.
    const weekly = existing({
      title: 'Sacar la basura',
      startAt: new Date(2026, 8, 22, 19, 0).toISOString(),
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU',
    })
    // El próximo martes, 2026-09-29, a la misma hora: cae en una ocurrencia de la serie.
    const warnings = findScheduleWarnings({ ...CANDIDATE_BASE, title: 'Sacar basura', date: '2026-09-29' }, [weekly])
    expect(warnings).toEqual([{ kind: 'duplicate', event: weekly }])
  })

  it('recurrencia: exception_dates excluye esa ocurrencia concreta (no hay conflicto ese día)', () => {
    const weekly = existing({
      title: 'Sacar la basura',
      startAt: new Date(2026, 8, 22, 19, 0).toISOString(),
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU',
      exceptionDates: ['2026-09-29'],
    })
    const warnings = findScheduleWarnings({ ...CANDIDATE_BASE, title: 'Sacar basura', date: '2026-09-29' }, [weekly])
    expect(warnings).toEqual([])
  })

  it('todo el día: "Vacaciones" (all_day) no entra en conflicto automático con "Dentista" a las 17:00', () => {
    const vacaciones = existing({ title: 'Vacaciones', allDay: true, startAt: new Date(2026, 8, 23).toISOString(), endAt: null })
    const warnings = findScheduleWarnings({ ...CANDIDATE_BASE, title: 'Dentista', time: '17:00' }, [vacaciones])
    expect(warnings).toEqual([])
  })

  it('todo el día: dos eventos de todo el día, mismo título y destinatarios, sí avisan de posible duplicado', () => {
    const vacaciones = existing({ title: 'Vacaciones', allDay: true, startAt: new Date(2026, 8, 23).toISOString(), endAt: null })
    const warnings = findScheduleWarnings({ title: 'Vacaciones', date: '2026-09-23', time: null, endTime: null, memberIds: [] }, [vacaciones])
    expect(warnings).toEqual([{ kind: 'duplicate', event: vacaciones }])
  })
})

describe('isWeekend', () => {
  it('sábado y domingo son fin de semana', () => {
    expect(isWeekend('2026-09-19')).toBe(true) // sábado
    expect(isWeekend('2026-09-20')).toBe(true) // domingo
  })

  it('el resto de la semana no lo es', () => {
    expect(isWeekend('2026-09-21')).toBe(false) // lunes
    expect(isWeekend('2026-09-25')).toBe(false) // viernes
  })
})
